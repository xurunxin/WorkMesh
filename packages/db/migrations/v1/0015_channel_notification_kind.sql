-- Keep legacy delivery semantics; only channel attempts require a durable kind.
ALTER TABLE notification_deliveries ADD COLUMN notification_kind text;
UPDATE notification_deliveries delivery
   SET notification_kind=coalesce(event.event_type,
       CASE WHEN intent.source_type='approval' THEN 'approval.requested'
            ELSE intent.source_type || '.attention_requested' END)
  FROM notification_intents intent
  LEFT JOIN domain_events event ON event.workspace_id=intent.workspace_id AND event.id=intent.source_event_id
 WHERE delivery.intent_id=intent.id;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_delivery_kind_required
  CHECK (intent_id IS NULL OR (notification_kind IS NOT NULL AND length(notification_kind)>0));
