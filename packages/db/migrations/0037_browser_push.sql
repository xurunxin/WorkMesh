CREATE TYPE browser_push_subscription_status AS ENUM ('active','revoked','invalid');

CREATE TABLE browser_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  device_id text NOT NULL CHECK(length(device_id) BETWEEN 1 AND 200),
  endpoint text NOT NULL,
  endpoint_hash text NOT NULL,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  user_agent text,
  status browser_push_subscription_status NOT NULL DEFAULT 'active',
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  last_delivered_at timestamptz,
  last_failure_at timestamptz,
  last_failure_code text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,actor_id) REFERENCES actors(workspace_id,id) ON DELETE CASCADE,
  CHECK((status='active') = (revoked_at IS NULL)),
  CHECK(endpoint_hash ~ '^sha256:[a-f0-9]{64}$')
);
CREATE INDEX browser_push_subscriptions_actor_active
  ON browser_push_subscriptions(workspace_id,actor_id,created_at DESC)
  WHERE status='active';
CREATE UNIQUE INDEX browser_push_subscriptions_active_endpoint
  ON browser_push_subscriptions(workspace_id,actor_id,endpoint_hash)
  WHERE status='active';
CREATE UNIQUE INDEX browser_push_subscriptions_active_device
  ON browser_push_subscriptions(workspace_id,actor_id,device_id)
  WHERE status='active';

ALTER TABLE notification_deliveries
  DROP CONSTRAINT notification_deliveries_notification_id_channel_key,
  ADD COLUMN browser_push_subscription_id uuid REFERENCES browser_push_subscriptions(id) ON DELETE CASCADE;
ALTER TABLE notification_deliveries
  ADD CONSTRAINT notification_deliveries_browser_subscription_check CHECK(
    (channel='browser' AND browser_push_subscription_id IS NOT NULL)
    OR (channel<>'browser' AND browser_push_subscription_id IS NULL)
  );
CREATE UNIQUE INDEX notification_deliveries_non_browser_unique
  ON notification_deliveries(notification_id,channel)
  WHERE channel<>'browser';
CREATE UNIQUE INDEX notification_deliveries_browser_unique
  ON notification_deliveries(notification_id,browser_push_subscription_id)
  WHERE channel='browser' AND browser_push_subscription_id IS NOT NULL;
