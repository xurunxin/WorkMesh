BEGIN;

-- Before this migration pending_exact meant only "membership has not been
-- materialized yet"; those rows predate durable upload intents and have no
-- provisional reservations. Preserve them on the pinned-object legacy path.
UPDATE event_archive_segments
   SET membership_state='legacy_unindexed',
       updated_at=now()
 WHERE membership_state='pending_exact';

ALTER TABLE event_archive_segments
  ALTER COLUMN object_version_id DROP NOT NULL,
  ADD COLUMN upload_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_upload_attempt_at timestamptz,
  ADD COLUMN last_upload_fence bigint,
  ADD COLUMN planned_fence bigint;

-- Canonical metadata did not originally require the frozen cutoff. Backfill
-- every historical row before installing the equality constraint.
UPDATE event_archive_segments
   SET metadata=jsonb_set(
         metadata,
         '{fixedCutoffAt}',
         to_jsonb(fixed_cutoff_at),
         true
       );

-- Replace the original state/timestamp checks and the 0029 membership check
-- with one explicit durable-intent state machine. Constraint names generated
-- for the old anonymous CHECKs differ between PostgreSQL versions, so identify
-- only checks that reference the replaced columns.
DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid='event_archive_segments'::regclass
       AND contype='c'
       AND (
         pg_get_constraintdef(oid) ILIKE '%object_version_id%'
         OR pg_get_constraintdef(oid) ILIKE '%uploaded_at%'
         OR pg_get_constraintdef(oid) ILIKE '%verified_at%'
         OR pg_get_constraintdef(oid) ILIKE '%pruned_at%'
         OR pg_get_constraintdef(oid) ILIKE '%membership_state%'
       )
  LOOP
    EXECUTE format(
      'ALTER TABLE event_archive_segments DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END;
$$;

-- The pre-intent worker represented a failed readback by clearing uploaded_at
-- even though the immutable VersionId was already durable. After removing the
-- old state/timestamp checks, preserve that recoverable object on the legacy
-- path while satisfying the explicit pairing installed below.
UPDATE event_archive_segments
   SET uploaded_at=COALESCE(uploaded_at,created_at),
       updated_at=now()
 WHERE membership_state='legacy_unindexed'
   AND state='failed'
   AND object_version_id IS NOT NULL
   AND uploaded_at IS NULL;

ALTER TABLE event_archive_segments
  ADD CONSTRAINT event_archive_segments_object_version_state_check CHECK (
    (
      object_version_id IS NULL
      AND state IN ('planned','failed')
    )
    OR (
      object_version_id IS NOT NULL
      AND length(btrim(object_version_id)) BETWEEN 1 AND 1024
    )
  ),
  ADD CONSTRAINT event_archive_segments_timestamp_state_check CHECK (
    (state='planned'
      AND uploaded_at IS NULL AND verified_at IS NULL AND pruned_at IS NULL)
    OR
    (state='uploaded'
      AND uploaded_at IS NOT NULL AND verified_at IS NULL AND pruned_at IS NULL)
    OR
    (state='verified'
      AND uploaded_at IS NOT NULL AND verified_at IS NOT NULL
      AND pruned_at IS NULL)
    OR
    (state='pruned'
      AND uploaded_at IS NOT NULL AND verified_at IS NOT NULL
      AND pruned_at IS NOT NULL)
    OR
    (state='failed'
      AND verified_at IS NULL AND pruned_at IS NULL
      AND (
        (object_version_id IS NULL AND uploaded_at IS NULL)
        OR (object_version_id IS NOT NULL AND uploaded_at IS NOT NULL)
      ))
  ),
  ADD CONSTRAINT event_archive_segments_membership_state_check CHECK (
    (
      membership_state='pending_exact'
      AND state IN ('planned','uploaded','failed')
      AND planned_fence IS NOT NULL
      AND planned_fence >= 0
      AND (
        state <> 'failed'
        OR last_error_code IN (
          'RETENTION_OBJECT_IDENTITY_MISMATCH',
          'ARCHIVE_FIXED_CUTOFF_MISMATCH',
          'ARCHIVE_PLAN_CONFLICT',
          'ARCHIVE_MEMBERSHIP_CONFLICT',
          'ARCHIVE_OBJECT_MANIFEST_MISMATCH',
          'ARCHIVE_SNAPSHOT_RECHECK_FAILED'
        )
      )
    )
    OR (
      membership_state='exact'
      AND state IN ('verified','pruned')
      AND object_version_id IS NOT NULL
    )
    OR (
      membership_state='legacy_unindexed'
      AND state IN ('uploaded','verified','pruned','failed')
      AND object_version_id IS NOT NULL
    )
  ),
  ADD CONSTRAINT event_archive_segments_upload_attempt_check CHECK (
    upload_attempt_count >= 0
    AND (
      (
        upload_attempt_count=0
        AND last_upload_attempt_at IS NULL
        AND last_upload_fence IS NULL
      )
      OR (
        upload_attempt_count>0
        AND last_upload_attempt_at IS NOT NULL
        AND last_upload_fence IS NOT NULL
        AND last_upload_fence >= 0
      )
    )
  ),
  ADD CONSTRAINT event_archive_segments_fixed_cutoff_metadata_check CHECK (
    jsonb_typeof(metadata->'fixedCutoffAt')='string'
    AND (metadata->>'fixedCutoffAt')::timestamptz=fixed_cutoff_at
  );

-- At most one durable intent can exist for a Workspace. A deterministic
-- conflict stays visible and blocks a replacement until an operator resolves
-- it; retries always recover the same stable object key.
CREATE UNIQUE INDEX event_archive_segments_one_pending_intent
  ON event_archive_segments(workspace_id)
  WHERE membership_state='pending_exact';

CREATE INDEX event_archive_segments_pending_recovery
  ON event_archive_segments(workspace_id,created_at,id)
  WHERE membership_state='pending_exact'
    AND state IN ('planned','uploaded','failed');

COMMENT ON COLUMN event_archive_segments.planned_fence IS
  'Fence that created the durable intent; successors may reconcile it.';
COMMENT ON COLUMN event_archive_segments.last_upload_fence IS
  'Fence that most recently attempted the stable-key conditional upload.';
COMMENT ON COLUMN event_archive_segments.upload_attempt_count IS
  'Durable count of same-key conditional upload/reconcile attempts.';
COMMENT ON INDEX event_archive_segments_one_pending_intent IS
  'Prevents a second immutable upload intent while recovery is pending.';

COMMIT;
