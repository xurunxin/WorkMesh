BEGIN;

CREATE TABLE provider_review_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  repository_id uuid NOT NULL REFERENCES repositories(id),
  pull_request_id uuid NOT NULL REFERENCES pull_request_projections(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  state text NOT NULL,
  head_sha text NOT NULL,
  author_external_id text NOT NULL,
  author_login text,
  uri text,
  source_delivery_id uuid NOT NULL REFERENCES provider_webhook_deliveries(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(repository_id, external_id)
);

CREATE INDEX provider_review_projections_pull_request_head_idx
  ON provider_review_projections(pull_request_id, head_sha);

COMMIT;
