BEGIN;

ALTER TABLE sessions ADD COLUMN revoked_at timestamptz;
CREATE INDEX sessions_token_active
  ON sessions(token_hash)
  WHERE revoked_at IS NULL;

CREATE TABLE auth_idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_fingerprint text NOT NULL,
  subject_fingerprint text NOT NULL,
  operation text NOT NULL,
  request_fingerprint text NOT NULL,
  client_context_fingerprint text NOT NULL,
  state text NOT NULL DEFAULT 'claimed' CHECK(state IN ('claimed','completed')),
  response_status integer,
  replay_key_id text,
  replay_key_fingerprint text,
  replay_iv bytea,
  replay_tag bytea,
  replay_ciphertext bytea,
  replay_expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  conflict_expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  replay_wiped_at timestamptz,
  UNIQUE(key_fingerprint,subject_fingerprint),
  CHECK(key_fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK(subject_fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK(client_context_fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK(replay_key_fingerprint IS NULL OR replay_key_fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK(
    (state='claimed' AND response_status IS NULL AND replay_key_id IS NULL
      AND replay_key_fingerprint IS NULL AND replay_iv IS NULL
      AND replay_tag IS NULL AND replay_ciphertext IS NULL AND completed_at IS NULL
      AND replay_wiped_at IS NULL)
    OR
    (state='completed' AND response_status IS NOT NULL AND replay_key_id IS NOT NULL
      AND replay_key_fingerprint IS NOT NULL AND replay_iv IS NOT NULL
      AND replay_tag IS NOT NULL AND replay_ciphertext IS NOT NULL
      AND completed_at IS NOT NULL AND replay_wiped_at IS NULL)
    OR
    (state='completed' AND response_status IS NULL AND replay_key_id IS NULL
      AND replay_key_fingerprint IS NULL AND replay_iv IS NULL
      AND replay_tag IS NULL AND replay_ciphertext IS NULL
      AND completed_at IS NOT NULL AND replay_wiped_at IS NOT NULL)
  )
);

CREATE INDEX auth_idempotency_records_replay_expiry
  ON auth_idempotency_records(replay_expires_at,id)
  WHERE state='completed' AND replay_wiped_at IS NULL;
CREATE INDEX auth_idempotency_records_conflict_expiry
  ON auth_idempotency_records(conflict_expires_at,id);

COMMIT;
