BEGIN;

ALTER TABLE pull_request_projections
  ADD COLUMN provider_observed_at timestamptz,
  ADD COLUMN provider_observation_rank integer NOT NULL DEFAULT 0 CHECK(provider_observation_rank >= 0);
UPDATE pull_request_projections
   SET provider_observed_at=updated_at
 WHERE source_delivery_id IS NOT NULL;

ALTER TABLE ci_check_projections
  ADD COLUMN provider_observed_at timestamptz,
  ADD COLUMN provider_observation_rank integer NOT NULL DEFAULT 0 CHECK(provider_observation_rank >= 0);
UPDATE ci_check_projections
   SET provider_observed_at=updated_at
 WHERE source_delivery_id IS NOT NULL;

ALTER TABLE provider_review_projections
  ADD COLUMN provider_observed_at timestamptz,
  ADD COLUMN provider_observation_rank integer NOT NULL DEFAULT 0 CHECK(provider_observation_rank >= 0);
UPDATE provider_review_projections SET provider_observed_at=updated_at;
ALTER TABLE provider_review_projections
  ALTER COLUMN provider_observed_at SET NOT NULL;

ALTER TABLE artifact_upload_intents
  ADD COLUMN repository_id uuid REFERENCES repositories(id) ON DELETE RESTRICT,
  ADD COLUMN pull_request_id uuid REFERENCES pull_request_projections(id) ON DELETE RESTRICT,
  ADD COLUMN head_sha text,
  ADD COLUMN source_tool text;
UPDATE artifact_upload_intents SET source_tool='s3-upload' WHERE source_tool IS NULL;
ALTER TABLE artifact_upload_intents
  ALTER COLUMN repository_id SET NOT NULL,
  ALTER COLUMN source_tool SET NOT NULL,
  ADD CONSTRAINT artifact_upload_workspace_repository_fk
    FOREIGN KEY(workspace_id,repository_id) REFERENCES repositories(workspace_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT artifact_upload_pull_request_head_pair
    CHECK((pull_request_id IS NULL)=(head_sha IS NULL));

ALTER TABLE structured_reviews
  ADD COLUMN evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE project_updates
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision > 0);

ALTER TABLE completion_suggestions
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision > 0);

COMMIT;
