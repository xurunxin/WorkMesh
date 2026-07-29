BEGIN;

ALTER TABLE retention_job_state
  ADD COLUMN worker_identity_conflict_count bigint NOT NULL DEFAULT 0,
  ADD CONSTRAINT retention_worker_identity_conflict_count_nonnegative CHECK (
    worker_identity_conflict_count >= 0
  );

COMMIT;
