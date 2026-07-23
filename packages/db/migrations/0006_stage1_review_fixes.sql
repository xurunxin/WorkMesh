BEGIN;

ALTER TABLE context_snapshots
  DROP CONSTRAINT context_snapshots_content_hash_key,
  ADD CONSTRAINT context_snapshots_workspace_content_hash_key UNIQUE(workspace_id,content_hash);

ALTER TABLE agent_sessions
  ADD COLUMN retry_of_session_id uuid,
  ADD COLUMN retry_reason text,
  ADD COLUMN retry_count integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT agent_sessions_retry_count_nonnegative CHECK(retry_count >= 0),
  ADD CONSTRAINT agent_sessions_retry_not_self CHECK(retry_of_session_id IS NULL OR retry_of_session_id <> id),
  ADD CONSTRAINT agent_sessions_retry_workspace_fk FOREIGN KEY(workspace_id,retry_of_session_id)
    REFERENCES agent_sessions(workspace_id,id) ON DELETE RESTRICT;

CREATE INDEX agent_sessions_retry_of ON agent_sessions(workspace_id,retry_of_session_id)
  WHERE retry_of_session_id IS NOT NULL;

COMMIT;
