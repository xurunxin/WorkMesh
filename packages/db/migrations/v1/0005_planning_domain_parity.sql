CREATE TYPE work_item_relation_kind AS ENUM ('blocks','related');

ALTER TABLE project_milestones ADD COLUMN deleted_at timestamptz;

ALTER TABLE work_items ADD COLUMN parent_id uuid;
ALTER TABLE work_items ADD CONSTRAINT work_items_parent_same_team_fk
  FOREIGN KEY(workspace_id,team_id,parent_id)
  REFERENCES work_items(workspace_id,team_id,id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION enforce_work_item_parent_invariants() RETURNS trigger AS $$
DECLARE
  parent_project_id uuid;
  parent_deleted_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('workmesh-planning:' || NEW.workspace_id::text,0));
  IF NEW.parent_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM work_items child
      WHERE child.parent_id=NEW.id AND child.deleted_at IS NULL
        AND child.project_id IS DISTINCT FROM NEW.project_id
    ) THEN
      RAISE EXCEPTION 'WORK_ITEM_PARENT_PROJECT_MISMATCH';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.parent_id=NEW.id THEN
    RAISE EXCEPTION 'WORK_ITEM_PARENT_SELF';
  END IF;

  SELECT project_id,deleted_at INTO parent_project_id,parent_deleted_at
  FROM work_items
  WHERE workspace_id=NEW.workspace_id AND team_id=NEW.team_id AND id=NEW.parent_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF parent_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'WORK_ITEM_PARENT_DELETED';
  END IF;
  IF parent_project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'WORK_ITEM_PARENT_PROJECT_MISMATCH';
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors(id,parent_id) AS (
      SELECT id,parent_id FROM work_items WHERE id=NEW.parent_id
      UNION ALL
      SELECT item.id,item.parent_id
      FROM work_items item JOIN ancestors current ON item.id=current.parent_id
    )
    SELECT 1 FROM ancestors WHERE id=NEW.id
  ) THEN
    RAISE EXCEPTION 'WORK_ITEM_PARENT_CYCLE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM work_items child
    WHERE child.parent_id=NEW.id AND child.deleted_at IS NULL
      AND child.project_id IS DISTINCT FROM NEW.project_id
  ) THEN
    RAISE EXCEPTION 'WORK_ITEM_PARENT_PROJECT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_items_parent_invariants
BEFORE INSERT OR UPDATE OF parent_id,project_id,deleted_at ON work_items
FOR EACH ROW EXECUTE FUNCTION enforce_work_item_parent_invariants();

CREATE OR REPLACE FUNCTION enforce_work_item_milestone_invariants() RETURNS trigger AS $$
DECLARE
  milestone_project_id uuid;
  milestone_deleted_at timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('workmesh-planning:' || NEW.workspace_id::text,0));
  IF NEW.milestone_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT project_id,deleted_at INTO milestone_project_id,milestone_deleted_at
  FROM project_milestones
  WHERE id=NEW.milestone_id AND workspace_id=NEW.workspace_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF milestone_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'WORK_ITEM_MILESTONE_DELETED';
  END IF;
  IF milestone_project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'WORK_ITEM_MILESTONE_PROJECT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_items_milestone_invariants
BEFORE INSERT OR UPDATE OF milestone_id,project_id,deleted_at ON work_items
FOR EACH ROW EXECUTE FUNCTION enforce_work_item_milestone_invariants();

CREATE OR REPLACE FUNCTION enforce_milestone_unlinked_before_delete() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('workmesh-planning:' || NEW.workspace_id::text,0));
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM work_items
    WHERE milestone_id=NEW.id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'MILESTONE_HAS_ACTIVE_WORK_ITEMS';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_milestones_unlinked_before_delete
BEFORE UPDATE OF deleted_at ON project_milestones
FOR EACH ROW EXECUTE FUNCTION enforce_milestone_unlinked_before_delete();

CREATE TABLE work_item_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid NOT NULL,
  source_work_item_id uuid NOT NULL,
  target_work_item_id uuid NOT NULL,
  kind work_item_relation_kind NOT NULL,
  created_by_actor_id uuid,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,team_id,source_work_item_id)
    REFERENCES work_items(workspace_id,team_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,team_id,target_work_item_id)
    REFERENCES work_items(workspace_id,team_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,created_by_actor_id)
    REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(source_work_item_id<>target_work_item_id)
);
CREATE UNIQUE INDEX work_item_relations_active_unique
  ON work_item_relations(workspace_id,kind,source_work_item_id,target_work_item_id)
  WHERE deleted_at IS NULL;
CREATE INDEX work_item_relations_active_source
  ON work_item_relations(workspace_id,team_id,source_work_item_id,kind)
  WHERE deleted_at IS NULL;
CREATE INDEX work_item_relations_active_target
  ON work_item_relations(workspace_id,team_id,target_work_item_id,kind)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION enforce_work_item_relation_invariants() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('workmesh-planning:' || NEW.workspace_id::text,0));
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.source_work_item_id=NEW.target_work_item_id THEN
    RAISE EXCEPTION 'WORK_ITEM_RELATION_SELF';
  END IF;
  IF NEW.kind='related' AND NEW.source_work_item_id>NEW.target_work_item_id THEN
    RAISE EXCEPTION 'WORK_ITEM_RELATED_ORDER';
  END IF;
  IF EXISTS (
    SELECT 1 FROM work_items
    WHERE id IN (NEW.source_work_item_id,NEW.target_work_item_id)
      AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'WORK_ITEM_RELATION_ENDPOINT_DELETED';
  END IF;
  IF NEW.kind='blocks' AND EXISTS (
    WITH RECURSIVE reachable(id) AS (
      SELECT target_work_item_id
      FROM work_item_relations
      WHERE workspace_id=NEW.workspace_id AND team_id=NEW.team_id
        AND kind='blocks' AND deleted_at IS NULL
        AND source_work_item_id=NEW.target_work_item_id AND id<>NEW.id
      UNION
      SELECT relation.target_work_item_id
      FROM work_item_relations relation JOIN reachable current
        ON relation.source_work_item_id=current.id
      WHERE relation.workspace_id=NEW.workspace_id AND relation.team_id=NEW.team_id
        AND relation.kind='blocks' AND relation.deleted_at IS NULL AND relation.id<>NEW.id
    )
    SELECT 1 FROM reachable WHERE id=NEW.source_work_item_id
  ) THEN
    RAISE EXCEPTION 'WORK_ITEM_BLOCK_CYCLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_item_relations_invariants
BEFORE INSERT OR UPDATE OF source_work_item_id,target_work_item_id,kind,deleted_at
ON work_item_relations
FOR EACH ROW EXECUTE FUNCTION enforce_work_item_relation_invariants();

CREATE OR REPLACE FUNCTION enforce_work_item_unlinked_before_delete() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('workmesh-planning:' || NEW.workspace_id::text,0));
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'WORK_ITEM_HAS_ACTIVE_PARENT';
    END IF;
    IF EXISTS (
      SELECT 1 FROM work_items
      WHERE parent_id=NEW.id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'WORK_ITEM_HAS_ACTIVE_CHILDREN';
    END IF;
    IF EXISTS (
      SELECT 1 FROM work_item_relations
      WHERE deleted_at IS NULL
        AND (source_work_item_id=NEW.id OR target_work_item_id=NEW.id)
    ) THEN
      RAISE EXCEPTION 'WORK_ITEM_HAS_ACTIVE_RELATIONS';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_items_unlinked_before_delete
BEFORE UPDATE OF deleted_at ON work_items
FOR EACH ROW EXECUTE FUNCTION enforce_work_item_unlinked_before_delete();
