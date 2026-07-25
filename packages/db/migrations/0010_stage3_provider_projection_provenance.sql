BEGIN;

ALTER TABLE pull_request_projections
  ADD COLUMN source_delivery_id uuid REFERENCES provider_webhook_deliveries(id) ON DELETE SET NULL;

ALTER TABLE ci_check_projections
  ADD COLUMN source_delivery_id uuid REFERENCES provider_webhook_deliveries(id) ON DELETE SET NULL;

COMMIT;
