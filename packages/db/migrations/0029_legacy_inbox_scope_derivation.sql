BEGIN;

-- Rolling deployments may keep pre-0027 Human Inbox producers alive after
-- 0027 is applied. Derive the disclosure scope those producer shapes omit
-- without changing the applied 0027 or 0028 migrations.
CREATE OR REPLACE FUNCTION sync_legacy_inbox_recipient()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  derived_room_message_id uuid;
  derived_room_team_id uuid;
  derived_session_team_id uuid;
BEGIN
  IF NEW.recipient_human_actor_id IS NOT NULL THEN
    NEW.recipient_actor_id := NEW.recipient_human_actor_id;
  END IF;

  IF NEW.source_room_message_id IS NOT NULL THEN
    SELECT message.id,channel.team_id
      INTO derived_room_message_id,derived_room_team_id
      FROM room_messages message
      JOIN work_room_channels channel
        ON channel.id=message.channel_id
       AND channel.workspace_id=message.workspace_id
     WHERE message.workspace_id=NEW.workspace_id
       AND message.id=NEW.source_room_message_id;
  ELSIF NEW.source_type='room_message' THEN
    SELECT message.id,channel.team_id
      INTO derived_room_message_id,derived_room_team_id
      FROM room_messages message
      JOIN work_room_channels channel
        ON channel.id=message.channel_id
       AND channel.workspace_id=message.workspace_id
     WHERE message.workspace_id=NEW.workspace_id
       AND message.id=NEW.source_id;
    IF derived_room_message_id IS NOT NULL THEN
      NEW.source_room_message_id := derived_room_message_id;
    END IF;
  END IF;

  IF NEW.team_id IS NULL THEN
    NEW.team_id := derived_room_team_id;
  END IF;
  IF NEW.team_id IS NULL AND NEW.session_id IS NOT NULL THEN
    SELECT session.team_id
      INTO derived_session_team_id
      FROM agent_sessions session
     WHERE session.workspace_id=NEW.workspace_id
       AND session.id=NEW.session_id;
    NEW.team_id := derived_session_team_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER inbox_items_00_sync_legacy_recipient ON inbox_items;
CREATE TRIGGER inbox_items_00_sync_legacy_recipient
  BEFORE INSERT OR UPDATE OF
    recipient_human_actor_id,recipient_actor_id,session_id,team_id,
    source_type,source_id,source_room_message_id
  ON inbox_items FOR EACH ROW EXECUTE FUNCTION sync_legacy_inbox_recipient();

-- Prefer a room message's Team for room-message producers. The source message
-- is the disclosure-bearing fact and is deterministic even when the old
-- producer omitted session_id.
UPDATE inbox_items item
   SET source_room_message_id=message.id,
       team_id=COALESCE(item.team_id,channel.team_id)
  FROM room_messages message
  JOIN work_room_channels channel
    ON channel.id=message.channel_id
   AND channel.workspace_id=message.workspace_id
 WHERE item.workspace_id=message.workspace_id
   AND item.source_type='room_message'
   AND item.source_id=message.id
   AND (
     item.source_room_message_id IS NULL
     OR item.team_id IS NULL
   );

-- Non-room legacy producers carry their source Session. Use its persisted Team
-- only when no room-derived Team was available.
UPDATE inbox_items item
   SET team_id=session.team_id
  FROM agent_sessions session
 WHERE item.workspace_id=session.workspace_id
   AND item.session_id=session.id
   AND item.team_id IS NULL;

COMMIT;
