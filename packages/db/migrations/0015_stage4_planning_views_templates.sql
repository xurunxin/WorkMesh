BEGIN;

CREATE TYPE initiative_status AS ENUM ('planned','active','paused','completed','canceled');
CREATE TYPE initiative_priority AS ENUM ('none','low','medium','high','urgent');
CREATE TYPE planning_health AS ENUM ('on_track','at_risk','off_track','unknown');
CREATE TYPE advanced_view_entity AS ENUM ('issue','project','session','initiative');
CREATE TYPE advanced_view_layout AS ENUM ('list','board','timeline');
CREATE TYPE advanced_view_scope AS ENUM ('private','team','workspace');
CREATE TYPE template_kind AS ENUM ('work_item','project','agent_run','handoff','automation');
CREATE TYPE template_status AS ENUM ('draft','active','archived');

CREATE TABLE cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  duration_weeks integer NOT NULL CHECK(duration_weeks BETWEEN 1 AND 8),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by_actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,team_id,starts_at),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,created_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(ends_at = starts_at + make_interval(weeks => duration_weeks))
);
CREATE INDEX cycles_window ON cycles(workspace_id,team_id,starts_at,ends_at);

ALTER TABLE work_items ADD COLUMN cycle_id uuid;
ALTER TABLE work_items ADD CONSTRAINT work_items_cycle_workspace_fk
  FOREIGN KEY(workspace_id,cycle_id) REFERENCES cycles(workspace_id,id) ON DELETE RESTRICT;

CREATE TABLE work_item_cycle_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  work_item_id uuid NOT NULL,
  from_cycle_id uuid,
  to_cycle_id uuid,
  actor_id uuid NOT NULL,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,from_cycle_id) REFERENCES cycles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,to_cycle_id) REFERENCES cycles(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(from_cycle_id IS DISTINCT FROM to_cycle_id)
);
CREATE INDEX work_item_cycle_history ON work_item_cycle_facts(work_item_id,occurred_at);

CREATE TABLE initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_initiative_id uuid,
  name text NOT NULL,
  summary text,
  owner_actor_id uuid NOT NULL,
  status initiative_status NOT NULL DEFAULT 'planned',
  priority initiative_priority NOT NULL DEFAULT 'none',
  health planning_health NOT NULL DEFAULT 'unknown',
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,parent_initiative_id) REFERENCES initiatives(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,owner_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(parent_initiative_id IS NULL OR parent_initiative_id <> id)
);
CREATE TABLE initiative_projects (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  initiative_id uuid NOT NULL,
  project_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(initiative_id,project_id),
  FOREIGN KEY(workspace_id,initiative_id) REFERENCES initiatives(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT
);

CREATE FUNCTION enforce_two_level_initiative() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_initiative_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM initiatives parent WHERE parent.id=NEW.parent_initiative_id AND parent.parent_initiative_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'INITIATIVE_DEPTH_EXCEEDED';
  END IF;
  IF NEW.parent_initiative_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM initiatives child WHERE child.parent_initiative_id=NEW.id
  ) THEN
    RAISE EXCEPTION 'INITIATIVE_DEPTH_EXCEEDED';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER initiatives_two_levels BEFORE INSERT OR UPDATE OF parent_initiative_id
  ON initiatives FOR EACH ROW EXECUTE FUNCTION enforce_two_level_initiative();

CREATE TABLE advanced_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_actor_id uuid NOT NULL,
  team_id uuid,
  name text NOT NULL,
  entity_type advanced_view_entity NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  grouping text,
  ordering jsonb NOT NULL DEFAULT '[]',
  visible_fields text[] NOT NULL DEFAULT '{}',
  layout advanced_view_layout NOT NULL,
  scope advanced_view_scope NOT NULL,
  favorite boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_actor_id,name),
  FOREIGN KEY(workspace_id,owner_actor_id) REFERENCES actors(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE CASCADE,
  CHECK((scope='team')=(team_id IS NOT NULL)),
  CHECK(scope<>'private' OR owner_actor_id IS NOT NULL)
);
CREATE UNIQUE INDEX advanced_saved_views_one_default
  ON advanced_saved_views(owner_actor_id,entity_type) WHERE is_default;
CREATE INDEX advanced_saved_views_visible
  ON advanced_saved_views(workspace_id,scope,team_id,updated_at DESC);

CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind template_kind NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  owner_actor_id uuid NOT NULL,
  status template_status NOT NULL DEFAULT 'draft',
  current_version_id uuid,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,kind,name),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,owner_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);
CREATE TABLE template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK(version > 0),
  body jsonb NOT NULL,
  change_summary text NOT NULL,
  created_by_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id,version)
);
ALTER TABLE templates ADD CONSTRAINT templates_current_version_fk
  FOREIGN KEY(current_version_id) REFERENCES template_versions(id) ON DELETE RESTRICT;

CREATE FUNCTION prevent_stage4_planning_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_STAGE4_FACT'; END
$$;
CREATE TRIGGER work_item_cycle_facts_immutable BEFORE UPDATE OR DELETE ON work_item_cycle_facts
  FOR EACH ROW EXECUTE FUNCTION prevent_stage4_planning_fact_mutation();
CREATE TRIGGER template_versions_immutable BEFORE UPDATE OR DELETE ON template_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_stage4_planning_fact_mutation();

COMMIT;
