ALTER TYPE inbox_item_kind ADD VALUE IF NOT EXISTS 'mention';

BEGIN;

CREATE TYPE inbox_receipt_kind AS ENUM ('claimed','read','acknowledged','replied');

ALTER TABLE agent_sessions
  ADD CONSTRAINT agent_sessions_workspace_id_id_actor_key
  UNIQUE(workspace_id,id,agent_actor_id);
ALTER TABLE room_messages
  ADD CONSTRAINT room_messages_workspace_id_id_key UNIQUE(workspace_id,id);
ALTER TABLE inbox_items
  ADD CONSTRAINT inbox_items_workspace_id_id_key UNIQUE(workspace_id,id);

ALTER TABLE inbox_items
  ALTER COLUMN recipient_human_actor_id DROP NOT NULL,
  ADD COLUMN recipient_actor_id uuid,
  ADD COLUMN recipient_session_id uuid,
  ADD COLUMN claimed_by_session_id uuid,
  ADD COLUMN claimed_at timestamptz,
  ADD COLUMN team_id uuid,
  ADD COLUMN source_room_message_id uuid,
  ADD COLUMN requires_response boolean NOT NULL DEFAULT false,
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision > 0);

-- Keep pre-0027 writers valid during a rolling deploy.  Those writers know
-- only recipient_human_actor_id; the compatibility trigger mirrors that
-- durable Human recipient into the new unified actor column before constraints
-- are checked.  Agent recipients continue to write recipient_actor_id directly.
CREATE FUNCTION sync_legacy_inbox_recipient() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.recipient_human_actor_id IS NOT NULL THEN
    NEW.recipient_actor_id := NEW.recipient_human_actor_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inbox_items_00_sync_legacy_recipient
  BEFORE INSERT OR UPDATE OF recipient_human_actor_id,recipient_actor_id
  ON inbox_items FOR EACH ROW EXECUTE FUNCTION sync_legacy_inbox_recipient();

UPDATE inbox_items
   SET recipient_actor_id=recipient_human_actor_id,
       source_room_message_id=CASE WHEN source_type='room_message' THEN source_id END
 WHERE recipient_actor_id IS NULL;

UPDATE inbox_items i
   SET team_id=s.team_id
  FROM agent_sessions s
 WHERE i.team_id IS NULL
   AND i.session_id=s.id
   AND i.workspace_id=s.workspace_id;

UPDATE inbox_items i
   SET team_id=c.team_id
  FROM room_messages m
  JOIN work_room_channels c
    ON c.id=m.channel_id
   AND c.workspace_id=m.workspace_id
 WHERE i.team_id IS NULL
   AND i.source_type='room_message'
   AND i.source_id=m.id
   AND i.workspace_id=m.workspace_id;

ALTER TABLE inbox_items
  ALTER COLUMN recipient_actor_id SET NOT NULL,
  ADD CONSTRAINT inbox_items_recipient_actor_fk
    FOREIGN KEY(workspace_id,recipient_actor_id)
    REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT inbox_items_recipient_session_fk
    FOREIGN KEY(workspace_id,recipient_session_id,recipient_actor_id)
    REFERENCES agent_sessions(workspace_id,id,agent_actor_id) ON DELETE RESTRICT,
  ADD CONSTRAINT inbox_items_claimed_session_fk
    FOREIGN KEY(workspace_id,claimed_by_session_id,recipient_actor_id)
    REFERENCES agent_sessions(workspace_id,id,agent_actor_id) ON DELETE RESTRICT,
  ADD CONSTRAINT inbox_items_team_fk
    FOREIGN KEY(workspace_id,team_id)
    REFERENCES teams(workspace_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT inbox_items_source_room_message_fk
    FOREIGN KEY(workspace_id,source_room_message_id)
    REFERENCES room_messages(workspace_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT inbox_items_claim_pair_check
    CHECK((claimed_by_session_id IS NULL)=(claimed_at IS NULL)),
  ADD CONSTRAINT inbox_items_exact_claim_check
    CHECK(recipient_session_id IS NULL OR claimed_by_session_id IS NULL OR recipient_session_id=claimed_by_session_id),
  ADD CONSTRAINT inbox_items_recipient_kind_shape_check
    CHECK(
      (recipient_human_actor_id IS NOT NULL AND recipient_human_actor_id=recipient_actor_id
        AND recipient_session_id IS NULL AND claimed_by_session_id IS NULL)
      OR recipient_human_actor_id IS NULL
    );

CREATE UNIQUE INDEX inbox_items_actor_target_unique
  ON inbox_items(workspace_id,recipient_actor_id,kind,source_type,source_id)
  WHERE recipient_human_actor_id IS NULL AND recipient_session_id IS NULL;
CREATE UNIQUE INDEX inbox_items_session_target_unique
  ON inbox_items(workspace_id,recipient_session_id,kind,source_type,source_id)
  WHERE recipient_session_id IS NOT NULL;
CREATE INDEX inbox_items_agent_exact_page
  ON inbox_items(workspace_id,recipient_session_id,status,created_at DESC,id DESC)
  WHERE recipient_session_id IS NOT NULL;
CREATE INDEX inbox_items_agent_actor_page
  ON inbox_items(workspace_id,recipient_actor_id,status,created_at DESC,id DESC)
  WHERE recipient_human_actor_id IS NULL;
CREATE INDEX inbox_items_agent_claimed_page
  ON inbox_items(workspace_id,claimed_by_session_id,status,created_at DESC,id DESC)
  WHERE claimed_by_session_id IS NOT NULL;

CREATE TABLE room_message_session_recipients (
  message_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(message_id,session_id),
  FOREIGN KEY(workspace_id,message_id)
    REFERENCES room_messages(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,session_id,actor_id)
    REFERENCES agent_sessions(workspace_id,id,agent_actor_id) ON DELETE RESTRICT
);
CREATE INDEX room_message_session_recipients_session
  ON room_message_session_recipients(workspace_id,session_id,created_at DESC,message_id);

CREATE TABLE inbox_item_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_item_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  session_id uuid NOT NULL,
  kind inbox_receipt_kind NOT NULL,
  reply_message_id uuid,
  correlation_id text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,inbox_item_id)
    REFERENCES inbox_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,reply_message_id)
    REFERENCES room_messages(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,session_id,actor_id)
    REFERENCES agent_sessions(workspace_id,id,agent_actor_id) ON DELETE RESTRICT,
  CHECK((kind='replied')=(reply_message_id IS NOT NULL))
);
CREATE UNIQUE INDEX inbox_item_receipts_single_fact
  ON inbox_item_receipts(inbox_item_id,session_id,kind)
  WHERE kind IN ('claimed','read','acknowledged');
CREATE UNIQUE INDEX inbox_item_receipts_reply
  ON inbox_item_receipts(inbox_item_id,reply_message_id)
  WHERE kind='replied';
CREATE INDEX inbox_item_receipts_history
  ON inbox_item_receipts(inbox_item_id,created_at,id);

CREATE FUNCTION enforce_inbox_actor_recipient() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recipient_kind actor_kind;
BEGIN
  SELECT kind INTO recipient_kind
    FROM actors
   WHERE id=NEW.recipient_actor_id AND workspace_id=NEW.workspace_id;
  IF recipient_kind IS NULL THEN
    RAISE EXCEPTION 'INBOX_RECIPIENT_NOT_FOUND';
  END IF;
  IF NEW.recipient_human_actor_id IS NOT NULL AND recipient_kind <> 'human' THEN
    RAISE EXCEPTION 'INBOX_HUMAN_RECIPIENT_REQUIRED';
  END IF;
  IF NEW.recipient_human_actor_id IS NULL AND recipient_kind <> 'agent' THEN
    RAISE EXCEPTION 'INBOX_AGENT_RECIPIENT_REQUIRED';
  END IF;
  IF recipient_kind='agent' AND NEW.team_id IS NULL THEN
    RAISE EXCEPTION 'INBOX_AGENT_TEAM_REQUIRED';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inbox_items_require_human_recipient ON inbox_items;
CREATE TRIGGER inbox_items_10_actor_recipient
  BEFORE INSERT OR UPDATE OF recipient_actor_id,recipient_human_actor_id,recipient_session_id,team_id
  ON inbox_items FOR EACH ROW EXECUTE FUNCTION enforce_inbox_actor_recipient();

CREATE FUNCTION prevent_inbox_claim_rebind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.claimed_by_session_id IS NOT NULL
     AND (
       NEW.claimed_by_session_id IS DISTINCT FROM OLD.claimed_by_session_id
       OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at
     ) THEN
    RAISE EXCEPTION 'INBOX_CLAIM_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inbox_claim_immutable
  BEFORE UPDATE OF claimed_by_session_id,claimed_at
  ON inbox_items FOR EACH ROW EXECUTE FUNCTION prevent_inbox_claim_rebind();

CREATE FUNCTION enforce_inbox_receipt_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM inbox_items item
     WHERE item.workspace_id=NEW.workspace_id
       AND item.id=NEW.inbox_item_id
       AND item.recipient_actor_id=NEW.actor_id
       AND (
         (
           item.recipient_session_id IS NOT NULL
           AND item.recipient_session_id=NEW.session_id
         )
         OR (
           item.recipient_session_id IS NULL
           AND item.claimed_by_session_id=NEW.session_id
         )
       )
       AND (
         NEW.kind<>'claimed'
         OR (
           item.recipient_session_id IS NULL
           AND item.claimed_by_session_id=NEW.session_id
         )
       )
  ) THEN
    RAISE EXCEPTION 'INBOX_RECEIPT_RECIPIENT_MISMATCH';
  END IF;
  IF NEW.kind='replied' AND NOT EXISTS (
    SELECT 1
      FROM inbox_items item
      JOIN room_messages source_message
        ON source_message.workspace_id=item.workspace_id
       AND source_message.id=item.source_room_message_id
      JOIN room_messages reply_message
        ON reply_message.workspace_id=item.workspace_id
       AND reply_message.id=NEW.reply_message_id
     WHERE item.workspace_id=NEW.workspace_id
       AND item.id=NEW.inbox_item_id
       AND reply_message.channel_id=source_message.channel_id
  ) THEN
    RAISE EXCEPTION 'INBOX_REPLY_MESSAGE_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inbox_receipt_scope
  BEFORE INSERT ON inbox_item_receipts
  FOR EACH ROW EXECUTE FUNCTION enforce_inbox_receipt_scope();

CREATE TRIGGER room_message_session_recipients_immutable
  BEFORE UPDATE OR DELETE ON room_message_session_recipients
  FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();
CREATE TRIGGER inbox_item_receipts_immutable
  BEFORE UPDATE OR DELETE ON inbox_item_receipts
  FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();

COMMIT;
