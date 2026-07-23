-- WorkMesh Stage 1 consolidated schema. Sources: 0001_stage0.sql through 0006_stage1_review_fixes.sql.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TYPE actor_kind AS ENUM ('human','agent','service');
CREATE TYPE workspace_role AS ENUM ('admin','member');
CREATE TYPE membership_role AS ENUM ('admin','maintainer','member');
CREATE TYPE status_category AS ENUM ('backlog','planned','started','completed','canceled');
CREATE TYPE outbox_status AS ENUM ('pending','delivering','delivered','dead');
CREATE TABLE workspaces (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE actors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, kind actor_kind NOT NULL, workspace_role workspace_role, email citext, display_name text NOT NULL, password_hash text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,email), UNIQUE(workspace_id,id), CHECK((kind='human' AND email IS NOT NULL AND password_hash IS NOT NULL) OR kind <> 'human'), CHECK((kind='human' AND workspace_role IS NOT NULL) OR (kind <> 'human' AND workspace_role IS NULL)));
CREATE TABLE teams (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, name text NOT NULL, key text NOT NULL, next_work_item_number integer NOT NULL DEFAULT 1 CHECK(next_work_item_number>0), revision integer NOT NULL DEFAULT 1 CHECK(revision>0), deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,key), UNIQUE(workspace_id,id));
CREATE TABLE platform_installation (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE RESTRICT, system_actor_id uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(workspace_id,system_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT);
CREATE TABLE memberships (workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, team_id uuid REFERENCES teams(id) ON DELETE CASCADE, actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE, role membership_role NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(team_id,actor_id), FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE CASCADE, FOREIGN KEY(workspace_id,actor_id) REFERENCES actors(workspace_id,id) ON DELETE CASCADE);
CREATE TABLE workflow_states (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE, name text NOT NULL, category status_category NOT NULL, color text NOT NULL DEFAULT '#64748b', position integer NOT NULL DEFAULT 0, is_archived boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(team_id,name), UNIQUE(workspace_id,team_id,id), FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE CASCADE);
CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE, name text NOT NULL, summary text, description text, status text NOT NULL DEFAULT 'planned', lead_actor_id uuid REFERENCES actors(id), target_date date, revision integer NOT NULL DEFAULT 1 CHECK(revision>0), deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id), UNIQUE(workspace_id,team_id,id), FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE CASCADE, FOREIGN KEY(workspace_id,lead_actor_id) REFERENCES actors(workspace_id,id) ON DELETE SET NULL);
CREATE TABLE work_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, team_id uuid NOT NULL REFERENCES teams(id) ON DELETE RESTRICT, number integer NOT NULL CHECK(number>0), title text NOT NULL, description text, status_id uuid NOT NULL REFERENCES workflow_states(id), priority text NOT NULL DEFAULT 'none' CHECK(priority IN ('none','urgent','high','medium','low')), due_date date, responsible_human_actor_id uuid REFERENCES actors(id), labels text[] NOT NULL DEFAULT '{}', project_id uuid REFERENCES projects(id) ON DELETE SET NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0), deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(team_id,number), UNIQUE(workspace_id,id), FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT, FOREIGN KEY(workspace_id,team_id,status_id) REFERENCES workflow_states(workspace_id,team_id,id) ON DELETE RESTRICT, FOREIGN KEY(workspace_id,responsible_human_actor_id) REFERENCES actors(workspace_id,id) ON DELETE SET NULL, FOREIGN KEY(workspace_id,team_id,project_id) REFERENCES projects(workspace_id,team_id,id) ON DELETE SET NULL(project_id));
CREATE TABLE channels (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, work_item_id uuid NOT NULL UNIQUE REFERENCES work_items(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id), FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE CASCADE);
CREATE TABLE comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE, author_actor_id uuid NOT NULL REFERENCES actors(id), parent_comment_id uuid REFERENCES comments(id) ON DELETE SET NULL, reply_to_comment_id uuid REFERENCES comments(id) ON DELETE SET NULL, body text NOT NULL, is_resolved boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1 CHECK(revision>0), deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id), UNIQUE(channel_id,id), FOREIGN KEY(workspace_id,channel_id) REFERENCES channels(workspace_id,id) ON DELETE CASCADE, FOREIGN KEY(workspace_id,author_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT, FOREIGN KEY(channel_id,parent_comment_id) REFERENCES comments(channel_id,id) ON DELETE SET NULL(parent_comment_id), FOREIGN KEY(channel_id,reply_to_comment_id) REFERENCES comments(channel_id,id) ON DELETE SET NULL(reply_to_comment_id));
CREATE TABLE comment_mentions (workspace_id uuid NOT NULL, comment_id uuid NOT NULL, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(comment_id,actor_id), FOREIGN KEY(workspace_id,comment_id) REFERENCES comments(workspace_id,id) ON DELETE CASCADE, FOREIGN KEY(workspace_id,actor_id) REFERENCES actors(workspace_id,id) ON DELETE CASCADE);
CREATE TABLE saved_views (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, owner_actor_id uuid NOT NULL REFERENCES actors(id), team_id uuid REFERENCES teams(id) ON DELETE CASCADE, name text NOT NULL, filters jsonb NOT NULL DEFAULT '{}'::jsonb, layout text NOT NULL CHECK(layout IN ('list','board')), revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(workspace_id,owner_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT, FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE CASCADE);
CREATE TABLE sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, csrf_token text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE api_idempotency_keys (workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE, idempotency_key text NOT NULL, operation text NOT NULL DEFAULT 'unknown', request_hash text NOT NULL, response_status integer, response_body jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,actor_id,idempotency_key), FOREIGN KEY(workspace_id,actor_id) REFERENCES actors(workspace_id,id) ON DELETE CASCADE);
CREATE TABLE domain_events (cursor bigserial PRIMARY KEY, id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, team_id uuid, audience_actor_id uuid, event_type text NOT NULL, event_version integer NOT NULL DEFAULT 1, aggregate_type text NOT NULL, aggregate_id uuid NOT NULL, aggregate_revision integer, actor_id uuid NOT NULL REFERENCES actors(id), correlation_id text NOT NULL, idempotency_key text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(workspace_id,actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT, FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE SET NULL, FOREIGN KEY(workspace_id,audience_actor_id) REFERENCES actors(workspace_id,id) ON DELETE SET NULL);
CREATE TABLE outbox_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), domain_event_id uuid NOT NULL UNIQUE REFERENCES domain_events(id) ON DELETE CASCADE, topic text NOT NULL, partition_key text NOT NULL, status outbox_status NOT NULL DEFAULT 'pending', attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 8), available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, locked_by text, delivered_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION enforce_human_comment_mention() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NOT EXISTS (SELECT 1 FROM actors WHERE id=NEW.actor_id AND workspace_id=NEW.workspace_id AND kind='human') THEN RAISE EXCEPTION 'COMMENT_MENTION_REQUIRES_HUMAN_ACTOR'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER comment_mentions_require_human BEFORE INSERT OR UPDATE OF workspace_id,actor_id ON comment_mentions FOR EACH ROW EXECUTE FUNCTION enforce_human_comment_mention();
CREATE FUNCTION enforce_platform_system_actor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NOT EXISTS (SELECT 1 FROM actors WHERE id=NEW.system_actor_id AND workspace_id=NEW.workspace_id AND kind='service') THEN RAISE EXCEPTION 'PLATFORM_SYSTEM_ACTOR_REQUIRES_SERVICE_ACTOR'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER platform_installation_requires_service_actor BEFORE INSERT OR UPDATE OF workspace_id,system_actor_id ON platform_installation FOR EACH ROW EXECUTE FUNCTION enforce_platform_system_actor();
CREATE INDEX work_items_active_team_status ON work_items(team_id,status_id) WHERE deleted_at IS NULL;
CREATE INDEX work_items_search_trgm ON work_items USING gin(title gin_trgm_ops);
CREATE INDEX work_items_search_fts ON work_items USING gin(to_tsvector('simple',coalesce(title,'')||' '||coalesce(description,'')));
CREATE INDEX comments_search_fts ON comments USING gin(to_tsvector('simple',body));
CREATE INDEX domain_events_workspace_cursor ON domain_events(workspace_id,cursor);
CREATE INDEX domain_events_workspace_team_cursor ON domain_events(workspace_id,team_id,cursor) WHERE team_id IS NOT NULL;
CREATE INDEX domain_events_workspace_audience_cursor ON domain_events(workspace_id,audience_actor_id,cursor) WHERE audience_actor_id IS NOT NULL;
CREATE INDEX outbox_claim ON outbox_events(available_at,created_at) WHERE status IN ('pending','delivering') AND attempt_count < 8;

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


BEGIN;

CREATE TYPE agent_session_state AS ENUM ('queued','acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked','paused','stopping','stale','completed','failed','canceled');
CREATE TYPE plan_step_status AS ENUM ('pending','in_progress','blocked','completed','canceled');
CREATE TYPE activity_visibility AS ENUM ('team','workspace','private');
CREATE TYPE approval_status AS ENUM ('pending','approved','rejected','expired','consumed','canceled');
CREATE TYPE approval_risk_level AS ENUM ('low','medium','high','critical');

CREATE TABLE context_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  work_item_id uuid REFERENCES work_items(id) ON DELETE RESTRICT, manifest jsonb NOT NULL, sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text NOT NULL, token_estimate integer NOT NULL DEFAULT 0 CHECK(token_estimate >= 0),
  truncation jsonb NOT NULL DEFAULT '{}'::jsonb, created_by_actor_id uuid REFERENCES actors(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id), UNIQUE(workspace_id,content_hash), FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,created_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, team_id uuid,
  agent_id uuid NOT NULL, agent_actor_id uuid NOT NULL, delegation_id uuid NOT NULL, parent_session_id uuid,
  retry_of_session_id uuid, retry_reason text, retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count >= 0),
  work_item_id uuid, project_id uuid, plan_step_id uuid, state agent_session_state NOT NULL DEFAULT 'queued', state_reason text,
  sequence bigint NOT NULL DEFAULT 0 CHECK(sequence >= 0), revision integer NOT NULL DEFAULT 1 CHECK(revision > 0), current_plan_version_id uuid,
  context_snapshot_id uuid, budget jsonb NOT NULL DEFAULT '{}'::jsonb, external_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  acknowledged_at timestamptz, last_heartbeat_at timestamptz, stop_requested_at timestamptz, stop_acknowledged_at timestamptz,
  result_summary text, result_evidence jsonb NOT NULL DEFAULT '[]'::jsonb, no_artifact_reason text, error_code text, error_summary text, ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,delegation_id) REFERENCES delegations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(parent_session_id) REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,retry_of_session_id) REFERENCES agent_sessions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,context_snapshot_id) REFERENCES context_snapshots(workspace_id,id) ON DELETE RESTRICT,
  CHECK(retry_of_session_id IS NULL OR retry_of_session_id <> id),
  CHECK(num_nonnulls(work_item_id,project_id,plan_step_id) = 1),
  CHECK((state IN ('completed','failed','canceled')) = (ended_at IS NOT NULL))
);
CREATE INDEX agent_sessions_active_agent ON agent_sessions(agent_id,created_at DESC) WHERE state NOT IN ('completed','failed','canceled');
CREATE INDEX agent_sessions_work_item_active ON agent_sessions(work_item_id,created_at DESC) WHERE state NOT IN ('completed','failed','canceled');
CREATE INDEX agent_sessions_parent ON agent_sessions(parent_session_id) WHERE parent_session_id IS NOT NULL;
CREATE INDEX agent_sessions_retry_of ON agent_sessions(workspace_id,retry_of_session_id) WHERE retry_of_session_id IS NOT NULL;
ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_id_agent_id_key UNIQUE(id,agent_id);

CREATE TABLE agent_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK(revision > 0), parent_version_id uuid REFERENCES agent_plan_versions(id) ON DELETE RESTRICT,
  change_summary text NOT NULL, author_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id,revision)
);
ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_current_plan_fk FOREIGN KEY(current_plan_version_id) REFERENCES agent_plan_versions(id) ON DELETE RESTRICT;
CREATE TABLE agent_plan_steps (
  plan_version_id uuid NOT NULL REFERENCES agent_plan_versions(id) ON DELETE RESTRICT, id uuid NOT NULL, title text NOT NULL, description text,
  status plan_step_status NOT NULL DEFAULT 'pending', ordinal integer NOT NULL CHECK(ordinal >= 0), owner_actor_id uuid REFERENCES actors(id) ON DELETE SET NULL,
  acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb, expected_artifacts text[] NOT NULL DEFAULT '{}', cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(plan_version_id,id), UNIQUE(plan_version_id,ordinal)
);
CREATE TABLE agent_plan_step_dependencies (
  plan_version_id uuid NOT NULL, step_id uuid NOT NULL, depends_on_step_id uuid NOT NULL,
  PRIMARY KEY(plan_version_id,step_id,depends_on_step_id), CHECK(step_id <> depends_on_step_id),
  FOREIGN KEY(plan_version_id,step_id) REFERENCES agent_plan_steps(plan_version_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(plan_version_id,depends_on_step_id) REFERENCES agent_plan_steps(plan_version_id,id) ON DELETE RESTRICT
);

CREATE TABLE agent_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT, sequence bigint NOT NULL CHECK(sequence > 0), kind text NOT NULL, summary text NOT NULL,
  details_markdown text, tool_invocation jsonb, artifact_ids uuid[] NOT NULL DEFAULT '{}', references_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  visibility activity_visibility NOT NULL DEFAULT 'team', ephemeral boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id,sequence)
);
CREATE INDEX agent_activities_session_sequence ON agent_activities(session_id,sequence);

CREATE TABLE agent_session_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  author_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT, body_markdown text NOT NULL, plan_revision integer, work_item_revision integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  work_item_id uuid, producer_actor_id uuid NOT NULL, type text NOT NULL, title text NOT NULL, uri text, storage_key text, mime_type text, size_bytes bigint CHECK(size_bytes >= 0),
  checksum text, source_tool text, repository jsonb, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id), FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,producer_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(uri IS NOT NULL OR storage_key IS NOT NULL OR metadata <> '{}'::jsonb)
);
CREATE INDEX artifacts_session_created ON artifacts(session_id,created_at DESC);

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  requested_by_actor_id uuid NOT NULL, approval_type text NOT NULL, action_name text NOT NULL, action_payload_sanitized jsonb NOT NULL, action_payload_hash text NOT NULL,
  risk_level approval_risk_level NOT NULL, rationale_summary text NOT NULL, required_approvals integer NOT NULL DEFAULT 1 CHECK(required_approvals > 0),
  status approval_status NOT NULL DEFAULT 'pending', expires_at timestamptz NOT NULL, consumed_at timestamptz, revision integer NOT NULL DEFAULT 1 CHECK(revision > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id), FOREIGN KEY(workspace_id,requested_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(expires_at > created_at), CHECK((status='consumed') = (consumed_at IS NOT NULL))
);
CREATE TABLE approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), approval_id uuid NOT NULL REFERENCES approvals(id) ON DELETE RESTRICT, actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK(decision IN ('approved','rejected')), reason text NOT NULL, decided_at timestamptz NOT NULL DEFAULT now(), UNIQUE(approval_id,actor_id)
);
CREATE INDEX approvals_pending_expiry ON approvals(expires_at) WHERE status='pending';

CREATE FUNCTION prevent_stage1_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_STAGE1_FACT'; END; $$;
CREATE TRIGGER context_snapshots_immutable BEFORE UPDATE OR DELETE ON context_snapshots FOR EACH ROW EXECUTE FUNCTION prevent_stage1_fact_mutation();
CREATE TRIGGER agent_plan_versions_immutable BEFORE UPDATE OR DELETE ON agent_plan_versions FOR EACH ROW EXECUTE FUNCTION prevent_stage1_fact_mutation();
CREATE TRIGGER agent_plan_steps_immutable BEFORE UPDATE OR DELETE ON agent_plan_steps FOR EACH ROW EXECUTE FUNCTION prevent_stage1_fact_mutation();
CREATE TRIGGER agent_plan_step_dependencies_immutable BEFORE UPDATE OR DELETE ON agent_plan_step_dependencies FOR EACH ROW EXECUTE FUNCTION prevent_stage1_fact_mutation();
CREATE TRIGGER agent_activities_immutable BEFORE UPDATE OR DELETE ON agent_activities FOR EACH ROW EXECUTE FUNCTION prevent_stage1_fact_mutation();
CREATE TRIGGER agent_session_prompts_immutable BEFORE UPDATE OR DELETE ON agent_session_prompts FOR EACH ROW EXECUTE FUNCTION prevent_stage1_fact_mutation();
CREATE TRIGGER artifacts_immutable BEFORE UPDATE OR DELETE ON artifacts FOR EACH ROW EXECUTE FUNCTION prevent_stage1_fact_mutation();
CREATE TRIGGER approval_decisions_immutable BEFORE UPDATE OR DELETE ON approval_decisions FOR EACH ROW EXECUTE FUNCTION prevent_stage1_fact_mutation();

COMMIT;


BEGIN;

CREATE TYPE webhook_delivery_status AS ENUM ('pending','delivering','delivered','dead');
CREATE TYPE inbox_item_kind AS ENUM ('waiting_input','approval','session_stale');
CREATE TYPE inbox_item_status AS ENUM ('open','resolved');

CREATE TABLE agent_session_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL, agent_id uuid NOT NULL, installation_token_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE, exchange_nonce_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
  exchanged_at timestamptz, revoked_at timestamptz, issued_by_actor_id uuid REFERENCES actors(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at > created_at), CHECK(exchanged_at IS NULL OR exchanged_at >= created_at)
);
ALTER TABLE agent_session_tokens ADD CONSTRAINT agent_session_tokens_session_agent_fk FOREIGN KEY(session_id,agent_id) REFERENCES agent_sessions(id,agent_id) ON DELETE RESTRICT;
ALTER TABLE agent_session_tokens ADD CONSTRAINT agent_session_tokens_installation_agent_fk FOREIGN KEY(installation_token_id,agent_id) REFERENCES agent_installation_tokens(id,agent_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX agent_session_tokens_one_live_exchange ON agent_session_tokens(session_id) WHERE exchanged_at IS NULL AND revoked_at IS NULL;
CREATE INDEX agent_session_tokens_expiry ON agent_session_tokens(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE agent_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid NOT NULL REFERENCES agent_definitions(id) ON DELETE RESTRICT,
  endpoint_id uuid NOT NULL, secret_version integer NOT NULL, event_id uuid REFERENCES domain_events(id) ON DELETE SET NULL,
  delivery_id text NOT NULL, event_type text NOT NULL,
  session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status webhook_delivery_status NOT NULL DEFAULT 'pending', attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 8),
  available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz, locked_by text, delivered_at timestamptz, last_error text, dead_lettered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id,delivery_id), FOREIGN KEY(agent_id,endpoint_id) REFERENCES agent_webhook_endpoints(agent_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(endpoint_id,secret_version) REFERENCES agent_webhook_secrets(endpoint_id,version) ON DELETE RESTRICT,
  CHECK((status='dead') = (dead_lettered_at IS NOT NULL))
);
CREATE INDEX agent_webhook_deliveries_claim ON agent_webhook_deliveries(available_at,created_at) WHERE status IN ('pending','delivering') AND attempt_count < 8;

CREATE TABLE inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  recipient_human_actor_id uuid NOT NULL, session_id uuid REFERENCES agent_sessions(id) ON DELETE CASCADE,
  kind inbox_item_kind NOT NULL, source_type text NOT NULL, source_id uuid NOT NULL, status inbox_item_status NOT NULL DEFAULT 'open',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, resolved_at timestamptz, resolved_by_actor_id uuid REFERENCES actors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,recipient_human_actor_id,kind,source_type,source_id),
  FOREIGN KEY(workspace_id,recipient_human_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK((status='resolved') = (resolved_at IS NOT NULL))
);
CREATE FUNCTION enforce_inbox_recipient_human() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM actors WHERE workspace_id=NEW.workspace_id AND id=NEW.recipient_human_actor_id AND kind='human') THEN RAISE EXCEPTION 'INBOX_RECIPIENT_REQUIRES_HUMAN_ACTOR'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER inbox_items_require_human_recipient BEFORE INSERT OR UPDATE OF workspace_id,recipient_human_actor_id ON inbox_items FOR EACH ROW EXECUTE FUNCTION enforce_inbox_recipient_human();
CREATE INDEX inbox_items_open_recipient ON inbox_items(recipient_human_actor_id,created_at DESC) WHERE status='open';

ALTER TABLE domain_events ADD COLUMN session_id uuid;
ALTER TABLE domain_events ADD COLUMN session_sequence bigint;
ALTER TABLE domain_events ADD COLUMN causation_id uuid;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_session_fk FOREIGN KEY(session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_session_sequence_check CHECK(session_sequence IS NULL OR session_sequence >= 0);
ALTER TABLE domain_events ADD CONSTRAINT domain_events_causation_fk FOREIGN KEY(causation_id) REFERENCES domain_events(id) ON DELETE SET NULL;
CREATE INDEX domain_events_session_sequence ON domain_events(session_id,session_sequence,cursor) WHERE session_id IS NOT NULL;
CREATE INDEX domain_events_causation ON domain_events(causation_id) WHERE causation_id IS NOT NULL;

COMMIT;
