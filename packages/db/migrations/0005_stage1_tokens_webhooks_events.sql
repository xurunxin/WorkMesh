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
