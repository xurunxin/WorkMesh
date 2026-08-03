BEGIN;

CREATE OR REPLACE FUNCTION enforce_inbox_receipt_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
       AND reply_message.author_actor_id=NEW.actor_id
       AND reply_message.session_id=NEW.session_id
       AND reply_message.reply_to_message_id=source_message.id
  ) THEN
    RAISE EXCEPTION 'INBOX_REPLY_MESSAGE_SCOPE_MISMATCH';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
