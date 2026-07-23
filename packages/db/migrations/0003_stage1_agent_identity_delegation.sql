BEGIN;

CREATE TYPE agent_protocol AS ENUM ('native_http','mcp','a2a');
CREATE TYPE delegation_role AS ENUM ('executor','reviewer','researcher','coordinator','triager');
CREATE TYPE delegation_scope_type AS ENUM ('work_item','plan_step','project','automation');
CREATE TYPE delegation_status AS ENUM ('active','revoked','expired','completed');
CREATE TYPE webhook_secret_status AS ENUM ('active','retiring','revoked');

ALTER TABLE work_items ADD CONSTRAINT work_items_workspace_team_id_key UNIQUE (workspace_id,team_id,id);

CREATE TABLE agent_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL, slug text NOT NULL, display_name text NOT NULL, description text,
  endpoint_url text, manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  supported_protocols agent_protocol[] NOT NULL DEFAULT '{}', skills text[] NOT NULL DEFAULT '{}',
  requested_capabilities text[] NOT NULL DEFAULT '{}', approved_capabilities text[] NOT NULL DEFAULT '{}',
  output_artifact_types text[] NOT NULL DEFAULT '{}', max_concurrency integer NOT NULL DEFAULT 1 CHECK(max_concurrency > 0),
  is_active boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id), UNIQUE(workspace_id,actor_id), UNIQUE(workspace_id,slug),
  FOREIGN KEY(workspace_id,actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(array_length(supported_protocols,1) IS NULL OR cardinality(supported_protocols) > 0),
  CHECK(approved_capabilities <@ requested_capabilities)
);

CREATE FUNCTION enforce_agent_definition_actor_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM actors WHERE workspace_id=NEW.workspace_id AND id=NEW.actor_id AND kind='agent'
  ) THEN RAISE EXCEPTION 'AGENT_DEFINITION_REQUIRES_AGENT_ACTOR'; END IF;
  RETURN NEW;
END; $$;
CREATE FUNCTION enforce_work_item_responsible_human() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.responsible_human_actor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM actors WHERE workspace_id=NEW.workspace_id AND id=NEW.responsible_human_actor_id AND kind='human'
  ) THEN RAISE EXCEPTION 'WORK_ITEM_RESPONSIBLE_REQUIRES_HUMAN_ACTOR'; END IF;
  RETURN NEW;
END; $$;
CREATE FUNCTION enforce_delegation_actor_kinds() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (
    NOT EXISTS (SELECT 1 FROM actors WHERE workspace_id=NEW.workspace_id AND id=NEW.principal_human_actor_id AND kind='human') OR
    NOT EXISTS (SELECT 1 FROM actors WHERE workspace_id=NEW.workspace_id AND id=NEW.agent_actor_id AND kind='agent')
  ) THEN RAISE EXCEPTION 'DELEGATION_REQUIRES_HUMAN_PRINCIPAL_AND_AGENT_ACTOR'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER agent_definitions_require_agent_actor BEFORE INSERT OR UPDATE OF workspace_id,actor_id ON agent_definitions FOR EACH ROW EXECUTE FUNCTION enforce_agent_definition_actor_kind();
CREATE TRIGGER work_items_require_human_responsible BEFORE INSERT OR UPDATE OF workspace_id,responsible_human_actor_id ON work_items FOR EACH ROW EXECUTE FUNCTION enforce_work_item_responsible_human();

CREATE TABLE agent_team_access (
  workspace_id uuid NOT NULL, agent_id uuid NOT NULL, team_id uuid NOT NULL, granted_by_actor_id uuid NOT NULL,
  approved_capabilities text[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  PRIMARY KEY(agent_id,team_id),
  FOREIGN KEY(workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,granted_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE agent_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
  url text NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id,id), UNIQUE(agent_id,url)
);
CREATE TABLE agent_webhook_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), endpoint_id uuid NOT NULL REFERENCES agent_webhook_endpoints(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK(version > 0), secret_ciphertext bytea NOT NULL, iv bytea NOT NULL, auth_tag bytea NOT NULL, key_version text NOT NULL,
  status webhook_secret_status NOT NULL DEFAULT 'active', valid_from timestamptz NOT NULL DEFAULT now(), valid_until timestamptz,
  revoked_at timestamptz, created_by_actor_id uuid REFERENCES actors(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(endpoint_id,version), CHECK(octet_length(iv)=12), CHECK(octet_length(auth_tag)=16),
  CHECK(valid_until IS NULL OR valid_until > valid_from), CHECK((status='revoked') = (revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX agent_webhook_secrets_one_active ON agent_webhook_secrets(endpoint_id) WHERE status='active';

CREATE TABLE agent_installation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz,
  created_by_actor_id uuid REFERENCES actors(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at IS NULL OR expires_at > created_at)
);
ALTER TABLE agent_installation_tokens ADD CONSTRAINT agent_installation_tokens_id_agent_id_key UNIQUE(id,agent_id);
CREATE INDEX agent_installation_tokens_active ON agent_installation_tokens(agent_id,expires_at) WHERE revoked_at IS NULL;

CREATE TABLE delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, team_id uuid NOT NULL,
  agent_id uuid NOT NULL, agent_actor_id uuid NOT NULL, principal_human_actor_id uuid NOT NULL, work_item_id uuid,
  role delegation_role NOT NULL, scope_type delegation_scope_type NOT NULL, scope_id uuid NOT NULL,
  permissions_snapshot text[] NOT NULL DEFAULT '{}', capability_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  status delegation_status NOT NULL DEFAULT 'active', revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  parent_delegation_id uuid REFERENCES delegations(id) ON DELETE RESTRICT, revoked_at timestamptz, revoked_by_actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,principal_human_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,team_id,work_item_id) REFERENCES work_items(workspace_id,team_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,revoked_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK((scope_type='work_item') = (work_item_id IS NOT NULL)),
  CHECK((status='revoked') = (revoked_at IS NOT NULL))
);
CREATE TRIGGER delegations_require_actor_kinds BEFORE INSERT OR UPDATE OF workspace_id,agent_actor_id,principal_human_actor_id ON delegations FOR EACH ROW EXECUTE FUNCTION enforce_delegation_actor_kinds();
CREATE UNIQUE INDEX delegations_one_active_executor_per_work_item ON delegations(work_item_id) WHERE status='active' AND role='executor' AND work_item_id IS NOT NULL;
CREATE INDEX delegations_active_agent_team ON delegations(agent_id,team_id) WHERE status='active';
CREATE INDEX delegations_principal_active ON delegations(principal_human_actor_id,created_at DESC) WHERE status='active';

COMMIT;
