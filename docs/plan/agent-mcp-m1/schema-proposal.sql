-- Proposed：仅受控设计，本轮不执行；将来作为新的增量迁移。
-- 旧安装、旧回执不回填。可删除凭据的 UUID 为证据，不建级联 FK。
ALTER TABLE agent_installation_tokens
  ADD COLUMN origin_kind text,
  ADD COLUMN origin_connection_id uuid,
  ADD CONSTRAINT installation_origin_shape CHECK ((
    (origin_kind IS NULL AND origin_connection_id IS NULL)
    OR (origin_kind='native' AND origin_connection_id IS NULL)
    OR (origin_kind='connection' AND origin_connection_id IS NOT NULL)
  ) IS TRUE);

CREATE FUNCTION preserve_installation_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origin_kind IS DISTINCT FROM OLD.origin_kind
     OR NEW.origin_connection_id IS DISTINCT FROM OLD.origin_connection_id THEN
    RAISE EXCEPTION 'INSTALLATION_ORIGIN_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER installation_origin_immutable
  BEFORE UPDATE OF origin_kind,origin_connection_id ON agent_installation_tokens
  FOR EACH ROW EXECUTE FUNCTION preserve_installation_origin();

ALTER TABLE api_idempotency_keys
  ADD COLUMN execution_source_kind text,
  ADD COLUMN execution_session_id uuid,
  ADD COLUMN execution_session_token_id uuid,
  ADD COLUMN execution_installation_token_id uuid,
  ADD COLUMN execution_connection_id uuid,
  ADD CONSTRAINT execution_source_shape CHECK ((
    (execution_source_kind IS NULL AND execution_session_id IS NULL
      AND execution_session_token_id IS NULL AND execution_installation_token_id IS NULL
      AND execution_connection_id IS NULL)
    OR (execution_source_kind='unproven' AND execution_session_id IS NOT NULL
      AND execution_session_token_id IS NOT NULL AND execution_connection_id IS NULL)
    OR (execution_source_kind='native' AND execution_session_id IS NOT NULL
      AND execution_session_token_id IS NOT NULL AND execution_installation_token_id IS NOT NULL
      AND execution_connection_id IS NULL)
    OR (execution_source_kind='connection' AND execution_session_id IS NOT NULL
      AND execution_session_token_id IS NOT NULL AND execution_installation_token_id IS NOT NULL
      AND execution_connection_id IS NOT NULL)
  ) IS TRUE);

-- 旧 API 的过期 key 重占位不认识新增列；数据库同事务防残留旧证明。
CREATE FUNCTION reset_reoccupied_execution_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.operation IS DISTINCT FROM OLD.operation
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash THEN
    NEW.execution_source_kind := NULL;
    NEW.execution_session_id := NULL;
    NEW.execution_session_token_id := NULL;
    NEW.execution_installation_token_id := NULL;
    NEW.execution_connection_id := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER execution_source_reoccupation_reset
  BEFORE UPDATE OF created_at,operation,request_hash ON api_idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION reset_reoccupied_execution_source();

-- claim 的显式能力记录，credential/start 与 settle 不信任后来声称的 opt-in。
ALTER TABLE workbench_runner_attempts
  ADD COLUMN execution_waits_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE workbench_execution_waits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  agent_session_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  source_turn_id uuid NOT NULL,
  source_attempt_id uuid NOT NULL,
  requested_by_human_actor_id uuid NOT NULL,
  source_agent_actor_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('native','connection')),
  source_installation_token_id uuid NOT NULL,
  source_connection_id uuid,
  wait_state text NOT NULL CHECK (wait_state IN ('awaiting_approval','awaiting_input','blocked')),
  wait_revision integer NOT NULL CHECK (wait_revision>0),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  approval_id uuid,
  approval_action_payload_hash text,
  input_event_cursor bigint,
  input_message_sequence integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','continued','canceled')),
  trigger_kind text CHECK (trigger_kind IN ('approval','prompt','message')),
  trigger_approval_id uuid,
  trigger_prompt_id uuid,
  trigger_message_id uuid,
  continuation_turn_id uuid,
  terminal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE(workspace_id,id),
  UNIQUE(workspace_id,source_turn_id),
  UNIQUE(workspace_id,source_attempt_id),
  UNIQUE(workspace_id,continuation_turn_id),
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_session_id) REFERENCES agent_sessions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,conversation_id) REFERENCES workbench_conversations(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,source_turn_id) REFERENCES workbench_turns(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,source_attempt_id) REFERENCES workbench_runner_attempts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,requested_by_human_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,source_agent_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,approval_id) REFERENCES approvals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,trigger_approval_id) REFERENCES approvals(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,trigger_prompt_id) REFERENCES agent_session_prompts(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,trigger_message_id) REFERENCES workbench_messages(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,continuation_turn_id) REFERENCES workbench_turns(workspace_id,id) ON DELETE RESTRICT,
  CHECK ((source_kind='native' AND source_connection_id IS NULL)
    OR (source_kind='connection' AND source_connection_id IS NOT NULL)),
  CHECK (((wait_state='awaiting_approval' AND approval_id IS NOT NULL
      AND approval_action_payload_hash ~ '^[a-f0-9]{64}$'
      AND input_event_cursor IS NULL AND input_message_sequence IS NULL)
    OR (wait_state IN ('awaiting_input','blocked') AND approval_id IS NULL
      AND approval_action_payload_hash IS NULL AND input_event_cursor IS NOT NULL
      AND input_message_sequence>0)) IS TRUE),
  CHECK ((status='pending' AND resolved_at IS NULL AND terminal_reason IS NULL
      AND continuation_turn_id IS NULL AND trigger_kind IS NULL
      AND trigger_approval_id IS NULL AND trigger_prompt_id IS NULL AND trigger_message_id IS NULL)
    OR (status='continued' AND resolved_at IS NOT NULL AND terminal_reason IS NULL
      AND continuation_turn_id IS NOT NULL AND trigger_kind IS NOT NULL)
    OR (status='canceled' AND resolved_at IS NOT NULL AND terminal_reason IS NOT NULL
      AND continuation_turn_id IS NULL AND trigger_kind IS NULL
      AND trigger_approval_id IS NULL AND trigger_prompt_id IS NULL AND trigger_message_id IS NULL)),
  CHECK ((trigger_kind IS NULL
    OR (trigger_kind='approval' AND wait_state='awaiting_approval'
      AND trigger_approval_id IS NOT NULL AND trigger_approval_id=approval_id AND trigger_prompt_id IS NULL AND trigger_message_id IS NULL)
    OR (trigger_kind='prompt' AND wait_state IN ('awaiting_input','blocked')
      AND trigger_approval_id IS NULL AND trigger_prompt_id IS NOT NULL AND trigger_message_id IS NULL)
    OR (trigger_kind='message' AND wait_state IN ('awaiting_input','blocked')
      AND trigger_approval_id IS NULL AND trigger_prompt_id IS NULL AND trigger_message_id IS NOT NULL)) IS TRUE)
);
CREATE UNIQUE INDEX workbench_wait_one_pending_session
  ON workbench_execution_waits(workspace_id,agent_session_id) WHERE status='pending';
CREATE INDEX workbench_wait_pending
  ON workbench_execution_waits(workspace_id,created_at,id) WHERE status='pending';
-- 跨表 session/conversation/attempt/approved/hash/live 权限须在原事务锁后重验。
-- 应由现有 migration runner 包裹整次事务；不修改已应用迁移。
