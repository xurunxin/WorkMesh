BEGIN;

ALTER TABLE provider_connections
  ADD COLUMN IF NOT EXISTS credentials_ciphertext bytea;

DO $$ BEGIN
  ALTER TABLE provider_connections
    ADD CONSTRAINT provider_connections_github_credentials_check
    CHECK(provider<>'github' OR credentials_ciphertext IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE artifact_upload_intents
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS last_error text;

DO $$ BEGIN
  ALTER TABLE artifact_upload_intents
    ADD CONSTRAINT artifact_upload_intents_attempt_count_check
    CHECK(attempt_count BETWEEN 0 AND 8);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS artifact_upload_verify_claim
  ON artifact_upload_intents(available_at,created_at)
  WHERE status='uploaded' AND attempt_count<8;

DO $$ BEGIN
  ALTER TABLE work_items
    ADD CONSTRAINT work_items_milestone_requires_project
    CHECK(milestone_id IS NULL OR project_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
