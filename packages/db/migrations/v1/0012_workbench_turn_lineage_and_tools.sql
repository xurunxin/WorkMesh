-- W13 Phase B data foundations. Terminal turns stay immutable; a retry or a
-- follow-up is a new turn that points at the fact it supersedes. Tool invocations
-- are an append-only audit ledger written at settlement from the runner's
-- per-tool summary; sanitized shape only, raw arguments stay reducible to a digest.
--
-- PostgreSQL cannot put a subquery in a CHECK constraint, so the "retry points at a
-- terminal turn" invariant is a trigger-enforced deferrable rule plus a plain CHECK
-- for the always-true structural part.
ALTER TABLE workbench_turns
  ADD COLUMN retry_of_turn_id uuid,
  ADD CONSTRAINT workbench_turns_retry_of_turn_fk
    FOREIGN KEY (workspace_id,retry_of_turn_id)
    REFERENCES workbench_turns(workspace_id,id) ON DELETE RESTRICT;
CREATE INDEX workbench_turns_retry_of ON workbench_turns(workspace_id,retry_of_turn_id) WHERE retry_of_turn_id IS NOT NULL;

CREATE FUNCTION workbench_turns_retry_target_terminal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.retry_of_turn_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.retry_of_turn_id = NEW.id THEN
    RAISE EXCEPTION 'RETRY_OF_TURN_SELF_REFERENCE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM workbench_turns prior
    WHERE prior.workspace_id = NEW.workspace_id
      AND prior.id = NEW.retry_of_turn_id
      AND prior.status IN ('settled','failed','canceled','stopped')
  ) THEN
    RAISE EXCEPTION 'RETRY_OF_TURN_NOT_TERMINAL';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER workbench_turns_retry_target_terminal
  AFTER INSERT OR UPDATE OF retry_of_turn_id ON workbench_turns
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION workbench_turns_retry_target_terminal();

CREATE TABLE workbench_tool_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  runner_attempt_id uuid NOT NULL,
  tool_name text NOT NULL CHECK (length(tool_name) BETWEEN 1 AND 160),
  call_count integer NOT NULL CHECK (call_count > 0),
  sanitized_input_summary text NOT NULL CHECK (length(sanitized_input_summary) BETWEEN 1 AND 2000),
  usage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage)='object'),
  sequence integer NOT NULL CHECK (sequence > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  UNIQUE(runner_attempt_id,sequence),
  FOREIGN KEY(workspace_id,turn_id) REFERENCES workbench_turns(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,conversation_id) REFERENCES workbench_conversations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,runner_attempt_id) REFERENCES workbench_runner_attempts(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX workbench_tool_invocations_turn ON workbench_tool_invocations(workspace_id,turn_id,sequence);
