BEGIN;

CREATE TYPE loop_state AS ENUM ('active','paused','disabled');
CREATE TYPE health_update_source AS ENUM ('human','agent');
CREATE TYPE health_update_status AS ENUM ('draft','published');
CREATE TYPE a2a_delivery_status AS ENUM ('received','processed','dead');

CREATE TABLE loops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid,
  project_id uuid,
  name text NOT NULL,
  owner_actor_id uuid NOT NULL,
  agent_id uuid NOT NULL REFERENCES agent_definitions(id) ON DELETE RESTRICT,
  run_template_version_id uuid NOT NULL REFERENCES template_versions(id) ON DELETE RESTRICT,
  trigger jsonb NOT NULL,
  budget jsonb NOT NULL,
  no_overlap boolean NOT NULL DEFAULT true,
  visibility text NOT NULL CHECK(visibility IN ('team','workspace')),
  failure_notification text NOT NULL CHECK(failure_notification IN ('owner','team','none')),
  state loop_state NOT NULL DEFAULT 'active',
  next_run_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,name),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,owner_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(visibility<>'team' OR team_id IS NOT NULL)
);
ALTER TABLE automation_runs ADD CONSTRAINT automation_runs_loop_fk
  FOREIGN KEY(loop_id) REFERENCES loops(id) ON DELETE RESTRICT;
ALTER TABLE agent_sessions ADD COLUMN automation_run_id uuid;
ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_automation_run_fk
  FOREIGN KEY(automation_run_id) REFERENCES automation_runs(id) ON DELETE RESTRICT;
ALTER TABLE agent_sessions DROP CONSTRAINT agent_sessions_subject_container_check;
ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_subject_container_check CHECK (
  (automation_run_id IS NOT NULL AND parent_session_id IS NULL
    AND num_nonnulls(work_item_id,project_id,plan_step_id)=0)
  OR
  (automation_run_id IS NULL AND (
    (parent_session_id IS NULL AND num_nonnulls(work_item_id,project_id,plan_step_id)=1)
    OR (parent_session_id IS NOT NULL AND num_nonnulls(work_item_id,project_id)=1)
  ))
);
CREATE UNIQUE INDEX agent_sessions_one_automation_run
  ON agent_sessions(automation_run_id) WHERE automation_run_id IS NOT NULL;
CREATE UNIQUE INDEX loops_no_active_overlap
  ON automation_runs(loop_id) WHERE loop_id IS NOT NULL AND status IN ('pending','claimed','running');

CREATE TABLE loop_budget_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_id uuid NOT NULL REFERENCES loops(id) ON DELETE RESTRICT,
  automation_run_id uuid NOT NULL UNIQUE REFERENCES automation_runs(id) ON DELETE RESTRICT,
  amount jsonb NOT NULL,
  status budget_reservation_status NOT NULL DEFAULT 'reserved',
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE TABLE project_health_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  author_actor_id uuid NOT NULL,
  source health_update_source NOT NULL,
  health planning_health NOT NULL,
  summary text NOT NULL,
  forecast_at timestamptz,
  confidence numeric(4,3) NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  uncertainty text NOT NULL,
  status health_update_status NOT NULL DEFAULT 'draft',
  approval_id uuid REFERENCES approvals(id) ON DELETE RESTRICT,
  published_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,author_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK((status='published')=(published_at IS NOT NULL)),
  CHECK(source<>'agent' OR status='draft' OR approval_id IS NOT NULL)
);
CREATE TABLE project_health_sources (
  update_id uuid NOT NULL REFERENCES project_health_updates(id) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK(ordinal >= 0),
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  observed_at timestamptz NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY(update_id,ordinal)
);
CREATE TRIGGER project_health_sources_immutable BEFORE UPDATE OR DELETE ON project_health_sources
  FOR EACH ROW EXECUTE FUNCTION prevent_stage4_planning_fact_mutation();

CREATE TABLE a2a_agent_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agent_definitions(id) ON DELETE RESTRICT,
  protocol_version text NOT NULL,
  external_agent_url text NOT NULL,
  card_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id,protocol_version)
);
CREATE TABLE a2a_task_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid NOT NULL REFERENCES a2a_agent_bindings(id) ON DELETE RESTRICT,
  external_task_id text NOT NULL,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(binding_id,external_task_id),
  UNIQUE(session_id)
);
CREATE TABLE a2a_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid NOT NULL REFERENCES a2a_agent_bindings(id) ON DELETE RESTRICT,
  delivery_id text NOT NULL,
  external_task_id text,
  payload jsonb NOT NULL,
  status a2a_delivery_status NOT NULL DEFAULT 'received',
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 8),
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(binding_id,delivery_id)
);

COMMIT;
