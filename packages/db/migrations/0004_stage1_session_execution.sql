BEGIN;

CREATE TYPE agent_session_state AS ENUM ('queued','acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked','paused','stopping','stale','completed','failed','canceled');
CREATE TYPE plan_step_status AS ENUM ('pending','in_progress','blocked','completed','canceled');
CREATE TYPE activity_visibility AS ENUM ('team','workspace','private');
CREATE TYPE approval_status AS ENUM ('pending','approved','rejected','expired','consumed','canceled');
CREATE TYPE approval_risk_level AS ENUM ('low','medium','high','critical');

CREATE TABLE context_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  work_item_id uuid REFERENCES work_items(id) ON DELETE RESTRICT, manifest jsonb NOT NULL, sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text NOT NULL UNIQUE, token_estimate integer NOT NULL DEFAULT 0 CHECK(token_estimate >= 0),
  truncation jsonb NOT NULL DEFAULT '{}'::jsonb, created_by_actor_id uuid REFERENCES actors(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id), FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,created_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, team_id uuid,
  agent_id uuid NOT NULL, agent_actor_id uuid NOT NULL, delegation_id uuid NOT NULL, parent_session_id uuid,
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
  FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,context_snapshot_id) REFERENCES context_snapshots(workspace_id,id) ON DELETE RESTRICT,
  CHECK(num_nonnulls(work_item_id,project_id,plan_step_id) = 1),
  CHECK((state IN ('completed','failed','canceled')) = (ended_at IS NOT NULL))
);
CREATE INDEX agent_sessions_active_agent ON agent_sessions(agent_id,created_at DESC) WHERE state NOT IN ('completed','failed','canceled');
CREATE INDEX agent_sessions_work_item_active ON agent_sessions(work_item_id,created_at DESC) WHERE state NOT IN ('completed','failed','canceled');
CREATE INDEX agent_sessions_parent ON agent_sessions(parent_session_id) WHERE parent_session_id IS NOT NULL;
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
