CREATE TYPE document_status AS ENUM ('active', 'archived');

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid NOT NULL,
  project_id uuid,
  work_item_id uuid,
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
  current_revision_id uuid NOT NULL,
  status document_status NOT NULL DEFAULT 'active',
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by_actor_id uuid NOT NULL,
  archived_at timestamptz,
  archived_by_actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  CHECK ((project_id IS NOT NULL) <> (work_item_id IS NOT NULL)),
  CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
  CHECK ((archived_at IS NULL) = (archived_by_actor_id IS NULL)),
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,team_id,project_id) REFERENCES projects(workspace_id,team_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,team_id,work_item_id) REFERENCES work_items(workspace_id,team_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,created_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,archived_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE document_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK(revision_number > 0),
  base_revision_id uuid,
  restored_from_revision_id uuid,
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
  markdown text NOT NULL CHECK(length(markdown) <= 200000),
  content_hash text NOT NULL CHECK(content_hash ~ '^sha256:[a-f0-9]{64}$'),
  change_summary text CHECK(change_summary IS NULL OR length(change_summary) BETWEEN 1 AND 500),
  author_actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  UNIQUE(workspace_id,document_id,id),
  UNIQUE(document_id,revision_number),
  FOREIGN KEY(workspace_id,document_id) REFERENCES documents(workspace_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(workspace_id,document_id,base_revision_id) REFERENCES document_revisions(workspace_id,document_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(workspace_id,document_id,restored_from_revision_id) REFERENCES document_revisions(workspace_id,document_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(workspace_id,author_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);

ALTER TABLE documents
  ADD CONSTRAINT documents_current_revision_fk
  FOREIGN KEY(workspace_id,id,current_revision_id)
  REFERENCES document_revisions(workspace_id,document_id,id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX documents_project_owner
  ON documents(workspace_id,project_id,created_at DESC,id DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX documents_work_item_owner
  ON documents(workspace_id,work_item_id,created_at DESC,id DESC)
  WHERE work_item_id IS NOT NULL;
CREATE INDEX document_revisions_history
  ON document_revisions(workspace_id,document_id,revision_number DESC);

CREATE FUNCTION validate_document_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.workspace_id IS DISTINCT FROM NEW.workspace_id OR
    OLD.team_id IS DISTINCT FROM NEW.team_id OR
    OLD.project_id IS DISTINCT FROM NEW.project_id OR
    OLD.work_item_id IS DISTINCT FROM NEW.work_item_id OR
    OLD.created_by_actor_id IS DISTINCT FROM NEW.created_by_actor_id
  ) THEN
    RAISE EXCEPTION 'IMMUTABLE_DOCUMENT_OWNER';
  END IF;

  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM projects WHERE id = NEW.project_id AND workspace_id = NEW.workspace_id
      AND team_id = NEW.team_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT_PROJECT_OWNER';
  END IF;
  IF NEW.work_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM work_items WHERE id = NEW.work_item_id AND workspace_id = NEW.workspace_id
      AND team_id = NEW.team_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT_WORK_ITEM_OWNER';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_validate_owner
  BEFORE INSERT OR UPDATE OF workspace_id,team_id,project_id,work_item_id,created_by_actor_id
  ON documents FOR EACH ROW EXECUTE FUNCTION validate_document_owner();

CREATE FUNCTION prevent_document_revision_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_DOCUMENT_REVISION';
END;
$$;

CREATE TRIGGER document_revisions_immutable
  BEFORE UPDATE OR DELETE ON document_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_document_revision_mutation();
