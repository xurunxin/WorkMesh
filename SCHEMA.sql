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

-- Stage 3: provider-neutral code delivery control plane. Full constraints and
-- indexes are introduced by 0008_stage3_delivery_control_plane.sql.
BEGIN;
CREATE TYPE provider_kind AS ENUM ('fake','github');
CREATE TYPE provider_delivery_status AS ENUM ('received','claimed','processed','dead');
CREATE TYPE provider_action_status AS ENUM ('pending','claimed','completed','failed','dead');
CREATE TYPE normalized_check_status AS ENUM ('queued','running','passed','failed','skipped');
CREATE TYPE pull_request_state AS ENUM ('open','closed','merged');
CREATE TYPE review_verdict AS ENUM ('approved','changes_requested','commented');
CREATE TYPE finding_severity AS ENUM ('blocking','high','medium','low');
CREATE TYPE artifact_upload_status AS ENUM ('pending','uploaded','verified','rejected','expired');
CREATE TYPE project_health AS ENUM ('on_track','at_risk','off_track');
CREATE TYPE project_update_status AS ENUM ('draft','published');
CREATE TYPE completion_suggestion_status AS ENUM ('open','accepted','dismissed');
CREATE TABLE provider_connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),provider provider_kind NOT NULL,external_account_id text NOT NULL,display_name text NOT NULL,installation_id text,service_actor_id uuid NOT NULL,webhook_secret_ciphertext bytea NOT NULL,credentials_ciphertext bytea,active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,provider,external_account_id),FOREIGN KEY(workspace_id,service_actor_id) REFERENCES actors(workspace_id,id),CHECK(provider<>'github' OR credentials_ciphertext IS NOT NULL));
CREATE TABLE repositories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),connection_id uuid NOT NULL REFERENCES provider_connections(id),team_id uuid NOT NULL,external_id text NOT NULL,full_name text NOT NULL,default_branch text NOT NULL,clone_url text,required_checks text[] NOT NULL DEFAULT '{}',active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(connection_id,external_id),UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id));
CREATE TABLE repository_contexts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),repository_id uuid NOT NULL REFERENCES repositories(id),project_id uuid,work_item_id uuid,session_id uuid REFERENCES agent_sessions(id),base_branch text NOT NULL,base_sha text NOT NULL,branch_pattern text NOT NULL,allowed_paths text[] NOT NULL,permissions text[] NOT NULL,guidance_manifest_hash text NOT NULL,created_by_actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(num_nonnulls(project_id,work_item_id,session_id)=1));
CREATE TABLE repository_guidance_entries(context_id uuid NOT NULL REFERENCES repository_contexts(id),ordinal integer NOT NULL,path text NOT NULL,blob_sha text NOT NULL,content_hash text NOT NULL,content text NOT NULL,PRIMARY KEY(context_id,ordinal),UNIQUE(context_id,path));
CREATE TABLE provider_webhook_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid NOT NULL REFERENCES provider_connections(id),repository_id uuid REFERENCES repositories(id),delivery_id text NOT NULL,event_name text NOT NULL,body_hash text NOT NULL,payload jsonb NOT NULL,status provider_delivery_status NOT NULL DEFAULT 'received',attempt_count integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),claimed_at timestamptz,claimed_by text,processed_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(connection_id,delivery_id));
CREATE TABLE provider_actions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),connection_id uuid NOT NULL REFERENCES provider_connections(id),repository_id uuid NOT NULL REFERENCES repositories(id),requested_by_actor_id uuid NOT NULL,session_id uuid REFERENCES agent_sessions(id),work_item_id uuid,project_id uuid,plan_step_id uuid,kind text NOT NULL CHECK(kind IN ('create_branch','create_commit','open_pull_request','merge_pull_request','resolve_repository_context','retry_ci_check')),intent_key text NOT NULL,payload jsonb NOT NULL,expected_head_sha text,approval_id uuid REFERENCES approvals(id),status provider_action_status NOT NULL DEFAULT 'pending',attempt_count integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),claimed_at timestamptz,claimed_by text,result jsonb,last_error text,completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,intent_key),CHECK((kind='resolve_repository_context' AND session_id IS NULL OR session_id IS NOT NULL) AND (kind='resolve_repository_context' OR work_item_id IS NOT NULL)));
CREATE TABLE pull_request_projections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),repository_id uuid NOT NULL REFERENCES repositories(id),external_id text NOT NULL,number integer NOT NULL,uri text NOT NULL,work_item_id uuid,session_id uuid REFERENCES agent_sessions(id),artifact_id uuid REFERENCES artifacts(id),producer_actor_id uuid,base_branch text NOT NULL,head_branch text NOT NULL,base_sha text NOT NULL,head_sha text NOT NULL,state pull_request_state NOT NULL,draft boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,source_delivery_id uuid REFERENCES provider_webhook_deliveries(id) ON DELETE SET NULL,provider_observed_at timestamptz,provider_observation_rank integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(repository_id,external_id),UNIQUE(repository_id,number));
CREATE TABLE commit_projections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),repository_id uuid NOT NULL REFERENCES repositories(id),sha text NOT NULL,branch text NOT NULL,before_sha text,source_delivery_id uuid REFERENCES provider_webhook_deliveries(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(repository_id,sha));
CREATE TABLE ci_check_projections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pull_request_id uuid NOT NULL REFERENCES pull_request_projections(id),external_id text NOT NULL,name text NOT NULL,status normalized_check_status NOT NULL,required boolean NOT NULL DEFAULT false,head_sha text NOT NULL,details_url text,started_at timestamptz,completed_at timestamptz,source_delivery_id uuid REFERENCES provider_webhook_deliveries(id) ON DELETE SET NULL,provider_observed_at timestamptz,provider_observation_rank integer NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(pull_request_id,external_id));
CREATE TABLE provider_review_projections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),repository_id uuid NOT NULL REFERENCES repositories(id),pull_request_id uuid NOT NULL REFERENCES pull_request_projections(id) ON DELETE CASCADE,external_id text NOT NULL,state text NOT NULL,head_sha text NOT NULL,author_external_id text NOT NULL,author_login text,uri text,source_delivery_id uuid NOT NULL REFERENCES provider_webhook_deliveries(id) ON DELETE RESTRICT,provider_observed_at timestamptz NOT NULL,provider_observation_rank integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(repository_id,external_id));
CREATE INDEX provider_review_projections_pull_request_head_idx ON provider_review_projections(pull_request_id,head_sha);
CREATE TABLE structured_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pull_request_id uuid NOT NULL REFERENCES pull_request_projections(id),reviewer_session_id uuid NOT NULL REFERENCES agent_sessions(id),reviewer_actor_id uuid NOT NULL REFERENCES actors(id),artifact_id uuid NOT NULL REFERENCES artifacts(id),head_sha text NOT NULL,verdict review_verdict NOT NULL,summary text NOT NULL,evidence jsonb NOT NULL DEFAULT '[]',metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(pull_request_id,reviewer_session_id,head_sha));
CREATE TABLE structured_review_findings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),review_id uuid NOT NULL REFERENCES structured_reviews(id),severity finding_severity NOT NULL,title text NOT NULL,body text,path text,line integer NOT NULL,file text NOT NULL,summary text NOT NULL,evidence text NOT NULL,recommendation text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE merge_approval_bindings(approval_id uuid PRIMARY KEY REFERENCES approvals(id),connection_id uuid NOT NULL REFERENCES provider_connections(id),repository_id uuid NOT NULL REFERENCES repositories(id),pull_request_id uuid NOT NULL REFERENCES pull_request_projections(id),provider_pull_request_id text NOT NULL,head_sha text NOT NULL,method text NOT NULL,canonical_payload_hash text NOT NULL,invalidated_at timestamptz,invalidation_reason text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE artifact_links(artifact_id uuid PRIMARY KEY REFERENCES artifacts(id),workspace_id uuid NOT NULL REFERENCES workspaces(id),project_id uuid,work_item_id uuid NOT NULL,session_id uuid NOT NULL REFERENCES agent_sessions(id),plan_step_id uuid,repository_id uuid REFERENCES repositories(id),pull_request_id uuid REFERENCES pull_request_projections(id),provenance jsonb NOT NULL);
CREATE TABLE artifact_upload_intents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),work_item_id uuid NOT NULL,session_id uuid NOT NULL REFERENCES agent_sessions(id),project_id uuid,plan_step_id uuid,repository_id uuid NOT NULL REFERENCES repositories(id),pull_request_id uuid REFERENCES pull_request_projections(id),head_sha text,source_tool text NOT NULL,requested_by_actor_id uuid NOT NULL,storage_key text NOT NULL UNIQUE,filename text NOT NULL,mime_type text NOT NULL,size_bytes bigint NOT NULL,expected_checksum text NOT NULL,actual_checksum text,status artifact_upload_status NOT NULL DEFAULT 'pending',attempt_count integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),claimed_at timestamptz,claimed_by text,last_error text,expires_at timestamptz NOT NULL,verified_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,repository_id) REFERENCES repositories(workspace_id,id),CHECK((pull_request_id IS NULL)=(head_sha IS NULL)));
CREATE TABLE project_milestones(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),project_id uuid NOT NULL,name text NOT NULL,description text,target_date date,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(project_id,name),UNIQUE(project_id,id));
ALTER TABLE work_items ADD COLUMN milestone_id uuid;
ALTER TABLE work_items ADD CONSTRAINT work_items_milestone_project_fk FOREIGN KEY(project_id,milestone_id) REFERENCES project_milestones(project_id,id);
ALTER TABLE work_items ADD CONSTRAINT work_items_milestone_requires_project CHECK(milestone_id IS NULL OR project_id IS NOT NULL);
CREATE TABLE project_updates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),project_id uuid NOT NULL,author_actor_id uuid NOT NULL,health project_health NOT NULL,body text NOT NULL,status project_update_status NOT NULL DEFAULT 'draft',evidence_artifact_ids uuid[] NOT NULL DEFAULT '{}',published_at timestamptz,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE project_dependencies(project_id uuid NOT NULL REFERENCES projects(id),depends_on_project_id uuid NOT NULL REFERENCES projects(id),created_by_actor_id uuid NOT NULL REFERENCES actors(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(project_id,depends_on_project_id),CHECK(project_id<>depends_on_project_id));
CREATE TABLE completion_suggestions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),project_id uuid NOT NULL,work_item_id uuid NOT NULL,pull_request_id uuid REFERENCES pull_request_projections(id),suggested_by_actor_id uuid NOT NULL,rationale text NOT NULL,evidence_artifact_ids uuid[] NOT NULL DEFAULT '{}',status completion_suggestion_status NOT NULL DEFAULT 'open',decided_by_actor_id uuid,decided_at timestamptz,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
COMMIT;

-- Stage 2 collaboration projection (migration 0007_stage2_work_rooms_leases_handoffs.sql).
-- Keep this consolidated reference after Stage 1: migration 0007 is the executable source.
BEGIN;
ALTER TYPE inbox_item_kind ADD VALUE IF NOT EXISTS 'ask'; ALTER TYPE inbox_item_kind ADD VALUE IF NOT EXISTS 'review_request'; ALTER TYPE inbox_item_kind ADD VALUE IF NOT EXISTS 'blocker'; ALTER TYPE inbox_item_kind ADD VALUE IF NOT EXISTS 'handoff';
CREATE TYPE room_subject_kind AS ENUM ('work_item','project','session'); CREATE TYPE room_message_intent AS ENUM ('inform','ask','answer','propose','decide','claim','handoff','blocker','review_request','review_result','status'); CREATE TYPE lease_kind AS ENUM ('exclusive','review_shared'); CREATE TYPE lease_status AS ENUM ('active','released','expired','revoked'); CREATE TYPE handoff_status AS ENUM ('draft','requested','accepted','rejected','canceled','completed'); CREATE TYPE budget_reservation_status AS ENUM ('reserved','released','consumed'); CREATE TYPE decision_relation_kind AS ENUM ('supersedes','reverses'); CREATE TYPE routing_outcome AS ENUM ('candidate','rejected','selected');
ALTER TABLE agent_sessions ADD COLUMN max_child_sessions integer NOT NULL DEFAULT 8 CHECK(max_child_sessions>=0), ADD COLUMN inherited_budget jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN required_for_parent boolean NOT NULL DEFAULT false, ADD COLUMN plan_step_version_id uuid;
ALTER TABLE agent_plan_steps ADD COLUMN parent_step_id uuid, ADD COLUMN required_for_parent boolean NOT NULL DEFAULT false, ADD COLUMN budget jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN max_child_sessions integer NOT NULL DEFAULT 8 CHECK(max_child_sessions>=0);
CREATE TABLE agent_plan_step_identities(session_id uuid NOT NULL REFERENCES agent_sessions(id),stable_step_id uuid NOT NULL,first_plan_version_id uuid NOT NULL REFERENCES agent_plan_versions(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(session_id,stable_step_id));
CREATE TABLE session_budget_reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),parent_session_id uuid NOT NULL REFERENCES agent_sessions(id),child_session_id uuid NOT NULL UNIQUE REFERENCES agent_sessions(id),allocation jsonb NOT NULL,reserved jsonb NOT NULL,status budget_reservation_status NOT NULL DEFAULT 'reserved',created_at timestamptz NOT NULL DEFAULT now(),released_at timestamptz,reason text);
CREATE TABLE work_room_channels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),subject_kind room_subject_kind NOT NULL,subject_id uuid NOT NULL,team_id uuid,work_item_id uuid,project_id uuid,session_id uuid,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,subject_kind,subject_id));
CREATE TABLE room_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),channel_id uuid NOT NULL REFERENCES work_room_channels(id),workspace_id uuid NOT NULL REFERENCES workspaces(id),author_actor_id uuid NOT NULL REFERENCES actors(id),session_id uuid REFERENCES agent_sessions(id),intent room_message_intent NOT NULL,recipient_actor_id uuid REFERENCES actors(id),reply_to_message_id uuid,thread_id uuid,body text NOT NULL,structured_payload jsonb NOT NULL DEFAULT '{}'::jsonb,requires_response boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE room_message_recipients(message_id uuid NOT NULL REFERENCES room_messages(id),actor_id uuid NOT NULL REFERENCES actors(id),PRIMARY KEY(message_id,actor_id)); CREATE TABLE room_message_response_resolutions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),message_id uuid NOT NULL UNIQUE REFERENCES room_messages(id),resolved_by_actor_id uuid NOT NULL REFERENCES actors(id),resolution text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE decisions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),work_item_id uuid,project_id uuid,session_id uuid,proposed_by_actor_id uuid NOT NULL REFERENCES actors(id),finalized_by_actor_id uuid REFERENCES actors(id),title text NOT NULL,rationale text NOT NULL,options jsonb NOT NULL DEFAULT '[]'::jsonb,selected_option text,evidence jsonb NOT NULL DEFAULT '[]'::jsonb,status text NOT NULL DEFAULT 'proposed',revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),finalized_at timestamptz,CHECK(num_nonnulls(work_item_id,project_id,session_id)=1));
CREATE TABLE decision_affected_resources(decision_id uuid NOT NULL REFERENCES decisions(id),resource_type text NOT NULL,resource_id uuid NOT NULL,impact text NOT NULL DEFAULT 'affected',PRIMARY KEY(decision_id,resource_type,resource_id)); CREATE TABLE decision_relations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),decision_id uuid NOT NULL REFERENCES decisions(id),related_decision_id uuid NOT NULL REFERENCES decisions(id),kind decision_relation_kind NOT NULL,created_by_actor_id uuid NOT NULL REFERENCES actors(id),created_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE decision_transition_consumptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),target_decision_id uuid NOT NULL UNIQUE REFERENCES decisions(id),transition_type text NOT NULL CHECK(transition_type IN ('finalize','supersede','reverse')),derived_decision_id uuid NOT NULL UNIQUE REFERENCES decisions(id),consumed_by_actor_id uuid NOT NULL REFERENCES actors(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE plan_step_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),plan_version_id uuid NOT NULL,step_id uuid NOT NULL,author_actor_id uuid NOT NULL REFERENCES actors(id),body text NOT NULL,references_json jsonb NOT NULL DEFAULT '[]'::jsonb,created_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE assignment_proposals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES agent_sessions(id),plan_version_id uuid NOT NULL,plan_step_id uuid NOT NULL,proposed_by_actor_id uuid NOT NULL REFERENCES actors(id),agent_id uuid REFERENCES agent_definitions(id),skill text,rationale text NOT NULL,status text NOT NULL DEFAULT 'proposed',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE leases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),session_id uuid NOT NULL REFERENCES agent_sessions(id),holder_actor_id uuid,resource_type text NOT NULL,resource_id uuid NOT NULL,kind lease_kind NOT NULL,status lease_status NOT NULL DEFAULT 'active',reason text NOT NULL,expires_at timestamptz NOT NULL,heartbeat_at timestamptz NOT NULL DEFAULT now(),renew_count integer NOT NULL DEFAULT 0,version integer NOT NULL DEFAULT 1,released_at timestamptz,released_by_actor_id uuid,audit_reason text,revoked_at timestamptz,revoked_by_actor_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()); CREATE UNIQUE INDEX leases_active_exclusive_resource ON leases(workspace_id,resource_type,resource_id) WHERE status='active' AND kind='exclusive';
CREATE TABLE handoffs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),from_session_id uuid NOT NULL REFERENCES agent_sessions(id),target_agent_id uuid REFERENCES agent_definitions(id),target_skill text,scope_type delegation_scope_type,scope_id uuid,summary text NOT NULL,completed_work jsonb NOT NULL DEFAULT '[]'::jsonb,remaining_work jsonb NOT NULL DEFAULT '[]'::jsonb,context_snapshot_id uuid REFERENCES context_snapshots(id),artifact_ids uuid[] NOT NULL DEFAULT '{}',open_questions jsonb NOT NULL DEFAULT '[]'::jsonb,risks jsonb NOT NULL DEFAULT '[]'::jsonb,acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,requested_action text,lease_transfer_policy text NOT NULL DEFAULT 'retain',requested_capabilities text[] NOT NULL DEFAULT '{}',status handoff_status NOT NULL DEFAULT 'draft',accepted_session_id uuid,resolved_agent_id uuid,resolved_delegation_id uuid,rejected_by_actor_id uuid,machine_reject_reason text,routing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),requested_at timestamptz,decided_at timestamptz,completed_at timestamptz);
CREATE TABLE routing_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),source_session_id uuid,target_agent_id uuid NOT NULL,requested_skill text,required_capabilities text[] NOT NULL DEFAULT '{}',outcome routing_outcome NOT NULL DEFAULT 'selected',sort_rank integer,rationale jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE routing_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),handoff_id uuid NOT NULL REFERENCES handoffs(id),source_session_id uuid NOT NULL REFERENCES agent_sessions(id),attempt_key text NOT NULL,requested_skill text,required_capabilities text[] NOT NULL DEFAULT '{}',candidate_count integer NOT NULL,selected_agent_id uuid, outcome text NOT NULL,failure_code text,rationale jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,handoff_id,attempt_key)); CREATE FUNCTION prevent_stage2_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_STAGE2_FACT'; END $$; CREATE TRIGGER routing_attempts_immutable BEFORE UPDATE OR DELETE ON routing_attempts FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation(); ALTER TABLE context_snapshots ADD COLUMN parent_snapshot_id uuid, ADD COLUMN snapshot_kind text NOT NULL DEFAULT 'materialized', ADD COLUMN history_link jsonb NOT NULL DEFAULT '{}'::jsonb; CREATE TABLE context_deltas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES agent_sessions(id),base_snapshot_id uuid NOT NULL REFERENCES context_snapshots(id),source_snapshot_id uuid,additions jsonb NOT NULL,content_hash text NOT NULL,rationale text NOT NULL,history_link jsonb NOT NULL DEFAULT '{}'::jsonb,created_by_actor_id uuid NOT NULL REFERENCES actors(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(session_id,content_hash));
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
