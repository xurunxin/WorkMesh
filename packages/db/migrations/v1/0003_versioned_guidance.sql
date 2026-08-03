CREATE TYPE guidance_scope_type AS ENUM ('workspace','team','project');
CREATE TYPE guidance_document_status AS ENUM ('active','archived');
CREATE TYPE guidance_audit_action AS ENUM ('published','archived','rolled_back');

CREATE TABLE guidance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope_type guidance_scope_type NOT NULL,
  scope_id uuid NOT NULL,
  current_revision_id uuid,
  status guidance_document_status NOT NULL DEFAULT 'active',
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  archived_at timestamptz,
  archived_by_actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  UNIQUE(workspace_id,scope_type,scope_id),
  FOREIGN KEY(workspace_id,archived_by_actor_id)
    REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK((status='archived')=(archived_at IS NOT NULL)),
  CHECK((archived_at IS NULL)=(archived_by_actor_id IS NULL))
);

CREATE TABLE guidance_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK(revision_number>0),
  markdown text NOT NULL CHECK(length(markdown)<=100000),
  content_hash text NOT NULL CHECK(content_hash~'^sha256:[a-f0-9]{64}$'),
  change_summary text NOT NULL CHECK(length(change_summary) BETWEEN 1 AND 500),
  author_actor_id uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  UNIQUE(workspace_id,document_id,id),
  UNIQUE(document_id,revision_number),
  FOREIGN KEY(workspace_id,document_id)
    REFERENCES guidance_documents(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,author_actor_id)
    REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);

ALTER TABLE guidance_documents
  ADD CONSTRAINT guidance_documents_current_revision_fk
  FOREIGN KEY(workspace_id,id,current_revision_id)
  REFERENCES guidance_revisions(workspace_id,document_id,id)
  ON DELETE RESTRICT;

CREATE TABLE guidance_audit_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  action guidance_audit_action NOT NULL,
  from_revision_id uuid,
  to_revision_id uuid,
  actor_id uuid NOT NULL,
  reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,document_id)
    REFERENCES guidance_documents(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,document_id,from_revision_id)
    REFERENCES guidance_revisions(workspace_id,document_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,document_id,to_revision_id)
    REFERENCES guidance_revisions(workspace_id,document_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,actor_id)
    REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);

CREATE INDEX guidance_revisions_history
  ON guidance_revisions(workspace_id,document_id,revision_number DESC);
CREATE INDEX guidance_audit_history
  ON guidance_audit_facts(workspace_id,document_id,created_at DESC,id DESC);

CREATE FUNCTION validate_guidance_document_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (
    OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
    OR OLD.scope_type IS DISTINCT FROM NEW.scope_type
    OR OLD.scope_id IS DISTINCT FROM NEW.scope_id
  ) THEN
    RAISE EXCEPTION 'IMMUTABLE_GUIDANCE_SCOPE';
  END IF;

  IF NEW.scope_type='workspace' THEN
    IF NEW.scope_id<>NEW.workspace_id
       OR NOT EXISTS(SELECT 1 FROM workspaces WHERE id=NEW.workspace_id) THEN
      RAISE EXCEPTION 'INVALID_GUIDANCE_WORKSPACE_SCOPE';
    END IF;
  ELSIF NEW.scope_type='team' THEN
    IF NOT EXISTS(
      SELECT 1 FROM teams
       WHERE id=NEW.scope_id AND workspace_id=NEW.workspace_id
         AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'INVALID_GUIDANCE_TEAM_SCOPE';
    END IF;
  ELSIF NEW.scope_type='project' THEN
    IF NOT EXISTS(
      SELECT 1 FROM projects
       WHERE id=NEW.scope_id AND workspace_id=NEW.workspace_id
         AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'INVALID_GUIDANCE_PROJECT_SCOPE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guidance_documents_validate_scope
  BEFORE INSERT OR UPDATE OF workspace_id,scope_type,scope_id
  ON guidance_documents
  FOR EACH ROW EXECUTE FUNCTION validate_guidance_document_scope();

CREATE FUNCTION prevent_guidance_fact_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_GUIDANCE_FACT';
END;
$$;

CREATE TRIGGER guidance_revisions_immutable
  BEFORE UPDATE OR DELETE ON guidance_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_guidance_fact_mutation();
CREATE TRIGGER guidance_audit_facts_immutable
  BEFORE UPDATE OR DELETE ON guidance_audit_facts
  FOR EACH ROW EXECUTE FUNCTION prevent_guidance_fact_mutation();
