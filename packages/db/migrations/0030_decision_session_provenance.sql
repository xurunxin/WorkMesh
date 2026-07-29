BEGIN;

ALTER TABLE decisions
  DROP CONSTRAINT decisions_check,
  ADD CONSTRAINT decisions_subject_check CHECK (
    num_nonnulls(work_item_id,project_id) <= 1
    AND num_nonnulls(work_item_id,project_id,session_id) >= 1
  );

COMMIT;
