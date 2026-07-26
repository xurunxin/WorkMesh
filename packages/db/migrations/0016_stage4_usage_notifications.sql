BEGIN;

CREATE TYPE cost_source AS ENUM ('provider_reported','rate_card','manual','unknown');
CREATE TYPE budget_scope AS ENUM ('workspace','team','project','agent','session','loop');
CREATE TYPE notification_priority AS ENUM ('input','approval','agent_failure','mention','handoff','update');
CREATE TYPE notification_channel AS ENUM ('in_app','browser','webhook');
CREATE TYPE notification_delivery_status AS ENUM ('pending','claimed','delivered','failed','dead','suppressed');

CREATE TABLE usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  agent_id uuid NOT NULL REFERENCES agent_definitions(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  project_id uuid,
  occurred_at timestamptz NOT NULL,
  input_tokens bigint CHECK(input_tokens >= 0),
  output_tokens bigint CHECK(output_tokens >= 0),
  runtime_ms bigint CHECK(runtime_ms >= 0),
  tool_calls integer CHECK(tool_calls >= 0),
  cost_minor bigint CHECK(cost_minor >= 0),
  currency char(3) NOT NULL,
  cost_source cost_source NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,dedupe_key),
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT,
  CHECK((cost_source='unknown' AND cost_minor IS NULL) OR (cost_source<>'unknown' AND cost_minor IS NOT NULL))
);
CREATE INDEX usage_session_time ON usage_records(session_id,occurred_at);
CREATE INDEX usage_agent_time ON usage_records(agent_id,occurred_at);
CREATE INDEX usage_project_time ON usage_records(project_id,occurred_at) WHERE project_id IS NOT NULL;

CREATE TABLE budget_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope_type budget_scope NOT NULL,
  scope_id uuid NOT NULL,
  currency char(3) NOT NULL,
  soft_cost_minor bigint CHECK(soft_cost_minor >= 0),
  hard_cost_minor bigint CHECK(hard_cost_minor > 0),
  soft_tokens bigint CHECK(soft_tokens >= 0),
  hard_tokens bigint CHECK(hard_tokens > 0),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by_actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,scope_type,scope_id,currency),
  FOREIGN KEY(workspace_id,created_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(soft_cost_minor IS NULL OR hard_cost_minor IS NULL OR soft_cost_minor <= hard_cost_minor),
  CHECK(soft_tokens IS NULL OR hard_tokens IS NULL OR soft_tokens <= hard_tokens)
);

CREATE TABLE notification_preferences (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  channels notification_channel[] NOT NULL DEFAULT '{in_app}',
  digest text NOT NULL DEFAULT 'immediate' CHECK(digest IN ('immediate','hourly','daily')),
  minimum_priority notification_priority NOT NULL DEFAULT 'update',
  muted_kinds text[] NOT NULL DEFAULT '{}',
  webhook_url text,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,actor_id),
  FOREIGN KEY(workspace_id,actor_id) REFERENCES actors(workspace_id,id) ON DELETE CASCADE,
  CHECK(cardinality(channels)>0)
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  recipient_actor_id uuid NOT NULL,
  priority notification_priority NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,recipient_actor_id,dedupe_key),
  FOREIGN KEY(workspace_id,recipient_actor_id) REFERENCES actors(workspace_id,id) ON DELETE CASCADE
);
CREATE INDEX notifications_inbox ON notifications(recipient_actor_id,created_at DESC);
CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL,
  status notification_delivery_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 8),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  claim_fence integer NOT NULL DEFAULT 0,
  effect_key text NOT NULL,
  effect_completed_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notification_id,channel),
  UNIQUE(effect_key)
);
CREATE INDEX notification_delivery_claim ON notification_deliveries(available_at,created_at)
  WHERE status IN ('pending','failed','claimed') AND attempt_count<8;

CREATE TRIGGER usage_records_immutable BEFORE UPDATE OR DELETE ON usage_records
  FOR EACH ROW EXECUTE FUNCTION prevent_stage4_planning_fact_mutation();

COMMIT;
