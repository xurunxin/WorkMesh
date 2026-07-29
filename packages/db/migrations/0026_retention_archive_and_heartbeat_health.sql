BEGIN;

-- Heartbeats are bounded mutable projections. They must not consume Agent
-- sequence/revision numbers or create activity/event/outbox rows per pulse.
ALTER TABLE agent_sessions
  ADD COLUMN heartbeat_health text NOT NULL DEFAULT 'healthy'
    CHECK (heartbeat_health IN ('healthy','degraded','stale')),
  ADD COLUMN heartbeat_health_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN heartbeat_checked_at timestamptz,
  ADD COLUMN heartbeat_current_step_id uuid,
  ADD COLUMN heartbeat_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN heartbeat_idempotency_key text,
  ADD COLUMN heartbeat_request_hash text,
  ADD CONSTRAINT agent_sessions_heartbeat_idempotency_pair CHECK (
    (heartbeat_idempotency_key IS NULL) = (heartbeat_request_hash IS NULL)
  );

ALTER TABLE leases
  ADD COLUMN heartbeat_idempotency_key text,
  ADD COLUMN heartbeat_request_hash text,
  ADD CONSTRAINT leases_heartbeat_idempotency_pair CHECK (
    (heartbeat_idempotency_key IS NULL) = (heartbeat_request_hash IS NULL)
  );

-- Heartbeat routes deliberately bypass the generic idempotency response store.
-- Keep a fixed recent-key window per projection so K1/K2/retry-K1 cannot
-- overwrite newer progress, while high-frequency pulses remain bounded.
CREATE TABLE heartbeat_idempotency_keys (
  resource_kind text NOT NULL CHECK(resource_kind IN ('session','lease')),
  resource_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^(sha256:)?[a-f0-9]{64}$'),
  observed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(resource_kind,resource_id,idempotency_key),
  CHECK(expires_at >= observed_at)
);
CREATE INDEX heartbeat_idempotency_expiry
  ON heartbeat_idempotency_keys(expires_at,resource_kind,resource_id);

-- Ordinary command replay material is available for 24 hours. The key remains
-- a conflict tombstone for 30 days. Existing rows receive a full deployment
-- grace window so a rolling deploy cannot invalidate an in-flight retry.
ALTER TABLE api_idempotency_keys
  ADD COLUMN replay_expires_at timestamptz,
  ADD COLUMN conflict_expires_at timestamptz;
UPDATE api_idempotency_keys
   SET replay_expires_at=GREATEST(created_at,now())+interval '24 hours',
       conflict_expires_at=GREATEST(created_at,now())+interval '30 days';
ALTER TABLE api_idempotency_keys
  ALTER COLUMN replay_expires_at SET DEFAULT now()+interval '24 hours',
  ALTER COLUMN replay_expires_at SET NOT NULL,
  ALTER COLUMN conflict_expires_at SET DEFAULT now()+interval '30 days',
  ALTER COLUMN conflict_expires_at SET NOT NULL,
  ADD CONSTRAINT api_idempotency_expiry_order CHECK (
    replay_expires_at >= created_at
    AND conflict_expires_at >= replay_expires_at
  );
CREATE INDEX api_idempotency_replay_cleanup
  ON api_idempotency_keys(replay_expires_at,workspace_id,actor_id,idempotency_key)
  WHERE response_body IS NOT NULL;
CREATE INDEX api_idempotency_conflict_cleanup
  ON api_idempotency_keys(conflict_expires_at,workspace_id,actor_id,idempotency_key)
  WHERE response_body IS NULL;

CREATE TYPE event_archive_segment_state AS ENUM
  ('planned','uploaded','verified','pruned','failed');

CREATE TABLE event_archive_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  start_cursor bigint NOT NULL CHECK(start_cursor > 0),
  end_cursor bigint NOT NULL CHECK(end_cursor >= start_cursor),
  fixed_cutoff_at timestamptz NOT NULL,
  row_count integer NOT NULL CHECK(row_count > 0),
  object_key text NOT NULL,
  object_size_bytes bigint CHECK(object_size_bytes >= 0),
  object_sha256 text CHECK(object_sha256 IS NULL OR object_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  snapshot_digest text NOT NULL CHECK(snapshot_digest ~ '^sha256:[a-f0-9]{64}$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  state event_archive_segment_state NOT NULL DEFAULT 'planned',
  retain_until timestamptz NOT NULL,
  uploaded_at timestamptz,
  verified_at timestamptz,
  pruned_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,start_cursor,end_cursor),
  UNIQUE(object_key),
  CHECK(retain_until >= created_at + interval '365 days'),
  CHECK((state IN ('uploaded','verified','pruned')) = (uploaded_at IS NOT NULL)),
  CHECK((state IN ('verified','pruned')) = (verified_at IS NOT NULL)),
  CHECK((state='pruned') = (pruned_at IS NOT NULL))
);
CREATE INDEX event_archive_segments_status
  ON event_archive_segments(workspace_id,state,fixed_cutoff_at,start_cursor);
CREATE INDEX event_archive_segments_retention
  ON event_archive_segments(retain_until)
  WHERE state IN ('verified','pruned');

-- One durable lease/fence/watermark per job and Workspace. Every successful
-- claim increments fence; all progress writes compare both owner and fence.
CREATE TABLE retention_job_state (
  job_name text NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lease_owner text,
  lease_expires_at timestamptz,
  fence bigint NOT NULL DEFAULT 0 CHECK(fence >= 0),
  fixed_cutoff_at timestamptz,
  watermark_cursor bigint NOT NULL DEFAULT 0 CHECK(watermark_cursor >= 0),
  last_error_code text,
  counters jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  worker_mode text CHECK (
    worker_mode IN ('disabled','archive_only','archive_and_prune')
  ),
  worker_seen_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(job_name,workspace_id),
  CHECK((lease_owner IS NULL) = (lease_expires_at IS NULL))
);
CREATE INDEX retention_job_claim
  ON retention_job_state(job_name,lease_expires_at,workspace_id);

-- A floor row exists from Workspace birth, before any event transaction can
-- race a pruner. The append trigger below therefore always locks a visible row.
CREATE FUNCTION ensure_workspace_retention_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO event_retention_state(workspace_id) VALUES(NEW.id)
  ON CONFLICT(workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workspaces_create_retention_state
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION ensure_workspace_retention_state();

-- Executable inventory: an unknown event class is protected. Only explicitly
-- ordinary, unreferenced events may ever be pruned after verified archival.
CREATE TABLE retention_policy_inventory (
  record_class text PRIMARY KEY,
  online_days integer NOT NULL CHECK(online_days >= 1),
  conflict_days integer,
  archive_days integer,
  delete_allowed boolean NOT NULL DEFAULT false,
  protected_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(archive_days IS NULL OR archive_days >= 365),
  CHECK(delete_allowed OR protected_reason IS NOT NULL)
);
INSERT INTO retention_policy_inventory(
  record_class,online_days,conflict_days,archive_days,delete_allowed,protected_reason
) VALUES
  ('domain_event.ordinary',90,NULL,365,true,NULL),
  ('domain_event.unknown',90,NULL,365,false,'unknown event classes fail closed'),
  ('domain_event.a2a_referenced',90,NULL,365,false,'A2A delivery references are durable protocol facts'),
  ('domain_event.outbox_pending',90,NULL,365,false,'undelivered outbox is recovery state'),
  ('api_idempotency.generic',1,30,NULL,true,NULL),
  ('auth_idempotency.secret',1,1,NULL,true,NULL),
  ('human_session.expired_or_revoked',30,NULL,NULL,true,NULL),
  ('agent_token.expired_or_revoked',30,NULL,NULL,true,NULL),
  ('heartbeat_idempotency.recent_window',1,NULL,NULL,true,NULL),
  ('webhook.delivered_or_processed',30,NULL,NULL,true,NULL),
  ('audit_or_recovery_fact',3650,NULL,NULL,false,'audit and uncertain recovery facts are protected');

-- Cleanup predicates are deliberately partial so jobs cannot accidentally
-- scan or delete pending, delivering, dead, claimed, or uncertain rows.
CREATE INDEX outbox_delivered_retention
  ON outbox_events(delivered_at,id) WHERE status='delivered';
CREATE INDEX human_sessions_retention
  ON sessions(COALESCE(revoked_at,expires_at),id);
CREATE INDEX agent_session_tokens_retention
  ON agent_session_tokens(COALESCE(revoked_at,expires_at),id);
CREATE INDEX agent_installation_tokens_retention
  ON agent_installation_tokens(COALESCE(revoked_at,expires_at),id);
CREATE INDEX agent_webhook_delivered_retention
  ON agent_webhook_deliveries(delivered_at,id) WHERE status='delivered';
CREATE INDEX provider_webhook_processed_retention
  ON provider_webhook_deliveries(processed_at,id) WHERE status='processed';

-- Every append takes a shared lock on the Workspace floor. A pruner takes the
-- corresponding FOR UPDATE lock before rechecking and deleting, which makes
-- cursor allocation and floor advancement one gap-free critical section.
-- Drop the bigserial default because PostgreSQL evaluates column defaults
-- before a BEFORE INSERT trigger. The trigger must allocate the cursor only
-- after it holds the shared floor lock.
ALTER TABLE domain_events ALTER COLUMN cursor DROP DEFAULT;
CREATE FUNCTION lock_event_retention_for_append() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO event_retention_state(workspace_id)
  VALUES(NEW.workspace_id)
  ON CONFLICT(workspace_id) DO NOTHING;
  PERFORM 1
    FROM event_retention_state
   WHERE workspace_id=NEW.workspace_id
   FOR SHARE;
  IF NEW.cursor IS NULL THEN
    NEW.cursor := nextval(pg_get_serial_sequence('domain_events','cursor'));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER domain_events_retention_append_fence
  BEFORE INSERT ON domain_events
  FOR EACH ROW EXECUTE FUNCTION lock_event_retention_for_append();

COMMIT;
