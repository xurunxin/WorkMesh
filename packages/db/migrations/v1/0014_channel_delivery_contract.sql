-- Channel intents and checkpoints are durable facts; deliveries remain the only queue.
-- Private source IDs belong to internal persistence, never the public event payload.
ALTER TABLE domain_events ADD COLUMN notification_sources jsonb NOT NULL DEFAULT '[]'
  CHECK(jsonb_typeof(notification_sources)='array');
CREATE TABLE notification_channel_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_actor_id uuid NOT NULL,
  provider text NOT NULL CHECK(provider='wecom'),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  secret_ciphertext bytea NOT NULL,
  endpoint_fingerprint text NOT NULL CHECK(endpoint_fingerprint ~ '^hmac:[a-f0-9]{64}$'),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id), UNIQUE(workspace_id,id,owner_actor_id),
  FOREIGN KEY(workspace_id,owner_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(status<>'revoked' OR NOT enabled)
);
CREATE INDEX notification_channel_targets_owner ON notification_channel_targets(workspace_id,owner_actor_id,created_at,id);
CREATE TABLE notification_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_event_id uuid NOT NULL,
  source_cursor bigint NOT NULL CHECK(source_cursor>0),
  source_type text NOT NULL CHECK(source_type IN ('decision','approval','inbox_item','agent_session','completion_suggestion')),
  source_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision>0),
  recipient_actor_id uuid NOT NULL,
  intent_hash text NOT NULL CHECK(intent_hash ~ '^[a-f0-9]{64}$'),
  target_snapshot jsonb NOT NULL CHECK(jsonb_typeof(target_snapshot)='array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id), UNIQUE(workspace_id,id,recipient_actor_id),
  UNIQUE(workspace_id,source_event_id,source_type,source_id,recipient_actor_id),
  FOREIGN KEY(workspace_id,recipient_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);
-- No FK to domain_events: committed provenance survives event retention.
CREATE TABLE notification_source_checkpoints (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_event_id uuid NOT NULL,
  source_cursor bigint NOT NULL CHECK(source_cursor>0),
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  result text NOT NULL CHECK(result IN ('admitted','suppressed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,source_event_id), UNIQUE(workspace_id,source_cursor)
);
CREATE FUNCTION reject_notification_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'NOTIFICATION_FACT_IMMUTABLE';
END $$;
CREATE TRIGGER notification_intents_immutable BEFORE UPDATE OR DELETE ON notification_intents
  FOR EACH ROW EXECUTE FUNCTION reject_notification_fact_mutation();
CREATE TRIGGER notification_source_checkpoints_immutable BEFORE UPDATE OR DELETE ON notification_source_checkpoints
  FOR EACH ROW EXECUTE FUNCTION reject_notification_fact_mutation();
ALTER TABLE notification_deliveries ALTER COLUMN notification_id DROP NOT NULL;
ALTER TABLE notification_deliveries
  ADD COLUMN workspace_id uuid,
  ADD COLUMN intent_id uuid,
  ADD COLUMN channel_target_id uuid,
  ADD COLUMN recipient_actor_id uuid,
  ADD COLUMN target_revision integer CHECK(target_revision>0),
  ADD COLUMN request_hash text CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN send_started_at timestamptz,
  ADD COLUMN outcome text NOT NULL DEFAULT 'not_sent' CHECK(outcome IN ('not_sent','sending','uncertain','delivered','failed')),
  ADD COLUMN checkpoint jsonb,
  ADD COLUMN retry_budget_start integer NOT NULL DEFAULT 0 CHECK(retry_budget_start>=0),
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  ADD CONSTRAINT notification_delivery_intent_fk FOREIGN KEY(workspace_id,intent_id,recipient_actor_id)
    REFERENCES notification_intents(workspace_id,id,recipient_actor_id),
  ADD CONSTRAINT notification_delivery_target_fk FOREIGN KEY(workspace_id,channel_target_id,recipient_actor_id)
    REFERENCES notification_channel_targets(workspace_id,id,owner_actor_id),
  ADD CONSTRAINT notification_delivery_origin_check CHECK(
    (notification_id IS NOT NULL AND intent_id IS NULL AND channel_target_id IS NULL AND workspace_id IS NULL AND recipient_actor_id IS NULL AND target_revision IS NULL)
    OR (notification_id IS NULL AND intent_id IS NOT NULL AND channel_target_id IS NOT NULL AND workspace_id IS NOT NULL AND recipient_actor_id IS NOT NULL AND target_revision IS NOT NULL AND channel='webhook')
  );
CREATE UNIQUE INDEX notification_delivery_intent_target ON notification_deliveries(intent_id,channel_target_id) WHERE intent_id IS NOT NULL;

CREATE FUNCTION enforce_channel_human_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM actors WHERE workspace_id=NEW.workspace_id AND id=NEW.owner_actor_id AND kind='human') THEN
    RAISE EXCEPTION 'CHANNEL_TARGET_REQUIRES_HUMAN';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notification_channel_target_human BEFORE INSERT OR UPDATE OF workspace_id,owner_actor_id ON notification_channel_targets
  FOR EACH ROW EXECUTE FUNCTION enforce_channel_human_owner();
