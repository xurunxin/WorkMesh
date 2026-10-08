-- Pending quorum events are still Approval notifications for existing preferences.
UPDATE notification_deliveries delivery SET notification_kind='approval.requested'
  FROM notification_intents intent
 WHERE delivery.intent_id=intent.id AND intent.source_type='approval'
   AND delivery.notification_kind IS DISTINCT FROM 'approval.requested';
