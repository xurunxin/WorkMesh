BEGIN;

CREATE TYPE automation_rule_state AS ENUM ('active','paused','disabled');
CREATE TYPE automation_run_status AS ENUM ('pending','claimed','running','succeeded','failed','dead','canceled','dry_run');
CREATE TYPE automation_effect_status AS ENUM ('pending','claimed','completed','failed','dead','reconciled');

CREATE TABLE automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid,
  name text NOT NULL,
  state automation_rule_state NOT NULL DEFAULT 'active',
  current_version_id uuid,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by_actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,name),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,created_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);
CREATE TABLE automation_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES automation_rules(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK(version > 0),
  trigger jsonb NOT NULL,
  condition jsonb,
  actions jsonb NOT NULL,
  max_attempts integer NOT NULL CHECK(max_attempts BETWEEN 1 AND 12),
  created_by_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rule_id,version),
  CHECK(jsonb_typeof(actions)='array' AND jsonb_array_length(actions)>0)
);
ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_current_version_fk
  FOREIGN KEY(current_version_id) REFERENCES automation_rule_versions(id) ON DELETE RESTRICT;

CREATE TABLE automation_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES automation_rules(id) ON DELETE RESTRICT,
  rule_version_id uuid NOT NULL REFERENCES automation_rule_versions(id) ON DELETE RESTRICT,
  occurrence_key text NOT NULL,
  event_id uuid,
  scheduled_for timestamptz,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rule_id,occurrence_key),
  CHECK(num_nonnulls(event_id,scheduled_for)<=1)
);

CREATE TABLE automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid,
  rule_id uuid REFERENCES automation_rules(id) ON DELETE RESTRICT,
  rule_version_id uuid REFERENCES automation_rule_versions(id) ON DELETE RESTRICT,
  occurrence_id uuid REFERENCES automation_occurrences(id) ON DELETE RESTRICT,
  loop_id uuid,
  session_id uuid REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  dry_run boolean NOT NULL DEFAULT false,
  status automation_run_status NOT NULL DEFAULT 'pending',
  trace jsonb NOT NULL DEFAULT '{}',
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 12),
  max_attempts integer NOT NULL CHECK(max_attempts BETWEEN 1 AND 12),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  claim_fence integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(occurrence_id),
  UNIQUE(session_id),
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT,
  CHECK((dry_run AND status='dry_run') OR NOT dry_run),
  CHECK(NOT dry_run OR session_id IS NULL)
);
CREATE INDEX automation_run_claim ON automation_runs(available_at,created_at)
  WHERE status IN ('pending','claimed','failed') AND dry_run=false;

CREATE TABLE automation_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES automation_runs(id) ON DELETE RESTRICT,
  action_ordinal integer NOT NULL CHECK(action_ordinal >= 0),
  effect_key text NOT NULL,
  action jsonb NOT NULL,
  status automation_effect_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 8),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  claim_fence integer NOT NULL DEFAULT 0,
  external_checkpoint jsonb,
  external_completed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,action_ordinal),
  UNIQUE(effect_key)
);
CREATE INDEX automation_effect_claim ON automation_effects(available_at,created_at)
  WHERE status IN ('pending','claimed','failed') AND attempt_count<8;

CREATE FUNCTION enforce_dry_run_zero_effects() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM automation_runs run WHERE run.id=NEW.run_id AND run.dry_run) THEN
    RAISE EXCEPTION 'DRY_RUN_EFFECT_FORBIDDEN';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER automation_effect_no_dry_run BEFORE INSERT ON automation_effects
  FOR EACH ROW EXECUTE FUNCTION enforce_dry_run_zero_effects();
CREATE TRIGGER automation_rule_versions_immutable BEFORE UPDATE OR DELETE ON automation_rule_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_stage4_planning_fact_mutation();
CREATE TRIGGER automation_occurrences_immutable BEFORE UPDATE OR DELETE ON automation_occurrences
  FOR EACH ROW EXECUTE FUNCTION prevent_stage4_planning_fact_mutation();

COMMIT;
