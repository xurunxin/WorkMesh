BEGIN;

ALTER TABLE retention_job_state
  ADD COLUMN worker_instance_id uuid,
  ADD COLUMN worker_build_sha text,
  ADD CONSTRAINT retention_worker_identity_pair CHECK (
    (worker_instance_id IS NULL) = (worker_build_sha IS NULL)
  ),
  ADD CONSTRAINT retention_worker_build_sha_safe CHECK (
    worker_build_sha IS NULL
    OR worker_build_sha ~ '^[A-Za-z0-9._-]{1,128}$'
  );

CREATE INDEX retention_worker_identity_freshness
  ON retention_job_state(
    worker_instance_id,
    worker_build_sha,
    worker_seen_at DESC
  )
  WHERE job_name='worker_runtime';

COMMIT;
