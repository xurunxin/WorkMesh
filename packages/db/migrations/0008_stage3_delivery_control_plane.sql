BEGIN;

CREATE TYPE provider_kind AS ENUM ('fake','github');
CREATE TYPE provider_delivery_status AS ENUM ('received','claimed','processed','dead');
CREATE TYPE provider_action_status AS ENUM ('pending','claimed','completed','failed','dead');
CREATE TYPE normalized_check_status AS ENUM ('queued','running','passed','failed','skipped');
CREATE TYPE pull_request_state AS ENUM ('open','closed','merged');
CREATE TYPE review_verdict AS ENUM ('approved','changes_requested','commented');
CREATE TYPE finding_severity AS ENUM ('blocking','high','medium','low');
CREATE TYPE artifact_upload_status AS ENUM ('pending','uploaded','verified','rejected','expired');
CREATE TYPE project_health AS ENUM ('on_track','at_risk','off_track');
CREATE TYPE project_update_status AS ENUM ('draft','published');
CREATE TYPE completion_suggestion_status AS ENUM ('open','accepted','dismissed');

CREATE TABLE provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider provider_kind NOT NULL,
  external_account_id text NOT NULL,
  display_name text NOT NULL,
  installation_id text,
  service_actor_id uuid NOT NULL,
  webhook_secret_ciphertext bytea NOT NULL,
  credentials_ciphertext bytea,
  active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,provider,external_account_id),
  FOREIGN KEY(workspace_id,service_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(provider<>'github' OR credentials_ciphertext IS NOT NULL)
);

CREATE TABLE repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES provider_connections(id) ON DELETE RESTRICT,
  team_id uuid NOT NULL,
  external_id text NOT NULL,
  full_name text NOT NULL,
  default_branch text NOT NULL,
  clone_url text,
  required_checks text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id,external_id),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX repositories_team ON repositories(workspace_id,team_id) WHERE active;

CREATE TABLE repository_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
  project_id uuid,
  work_item_id uuid,
  session_id uuid REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  base_branch text NOT NULL,
  base_sha text NOT NULL,
  branch_pattern text NOT NULL,
  allowed_paths text[] NOT NULL,
  permissions text[] NOT NULL,
  guidance_manifest_hash text NOT NULL,
  created_by_actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(repository_id,project_id,work_item_id,session_id),
  FOREIGN KEY(workspace_id,repository_id) REFERENCES repositories(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,created_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(num_nonnulls(project_id,work_item_id,session_id)=1),
  CHECK(cardinality(allowed_paths)>0),
  CHECK(cardinality(permissions)>0)
);
CREATE TABLE repository_guidance_entries (
  context_id uuid NOT NULL REFERENCES repository_contexts(id) ON DELETE RESTRICT,
  ordinal integer NOT NULL CHECK(ordinal >= 0),
  path text NOT NULL,
  blob_sha text NOT NULL,
  content_hash text NOT NULL CHECK(content_hash ~ '^sha256:[a-f0-9]{64}$'),
  PRIMARY KEY(context_id,ordinal),
  UNIQUE(context_id,path)
);

CREATE TABLE provider_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES provider_connections(id) ON DELETE RESTRICT,
  repository_id uuid REFERENCES repositories(id) ON DELETE SET NULL,
  delivery_id text NOT NULL,
  event_name text NOT NULL,
  body_hash text NOT NULL CHECK(body_hash ~ '^sha256:[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  status provider_delivery_status NOT NULL DEFAULT 'received',
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 12),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id,delivery_id)
);
CREATE INDEX provider_webhook_claim ON provider_webhook_deliveries(available_at,created_at)
  WHERE status IN ('received','claimed') AND attempt_count < 12;

CREATE TABLE provider_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES provider_connections(id) ON DELETE RESTRICT,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
  requested_by_actor_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  work_item_id uuid NOT NULL,
  project_id uuid,
  plan_step_id uuid,
  kind text NOT NULL CHECK(kind IN ('create_branch','create_commit','open_pull_request','merge_pull_request')),
  intent_key text NOT NULL,
  payload jsonb NOT NULL,
  expected_head_sha text,
  approval_id uuid REFERENCES approvals(id) ON DELETE RESTRICT,
  status provider_action_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 8),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  result jsonb,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,intent_key),
  FOREIGN KEY(workspace_id,repository_id) REFERENCES repositories(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,requested_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX provider_actions_claim ON provider_actions(available_at,created_at)
  WHERE status IN ('pending','claimed','failed') AND attempt_count < 8;

CREATE TABLE pull_request_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
  external_id text NOT NULL,
  number integer NOT NULL CHECK(number > 0),
  uri text NOT NULL,
  work_item_id uuid,
  session_id uuid REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  artifact_id uuid REFERENCES artifacts(id) ON DELETE RESTRICT,
  producer_actor_id uuid,
  base_branch text NOT NULL,
  head_branch text NOT NULL,
  base_sha text NOT NULL,
  head_sha text NOT NULL,
  state pull_request_state NOT NULL,
  draft boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(repository_id,external_id),
  UNIQUE(repository_id,number),
  FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,producer_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
);
CREATE INDEX pull_requests_work_item ON pull_request_projections(work_item_id,updated_at DESC);

CREATE TABLE commit_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
  sha text NOT NULL,
  branch text NOT NULL,
  before_sha text,
  source_delivery_id uuid REFERENCES provider_webhook_deliveries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(repository_id,sha)
);

CREATE TABLE ci_check_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_request_id uuid NOT NULL REFERENCES pull_request_projections(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  status normalized_check_status NOT NULL,
  required boolean NOT NULL DEFAULT false,
  head_sha text NOT NULL,
  details_url text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pull_request_id,external_id)
);

CREATE TABLE structured_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_request_id uuid NOT NULL REFERENCES pull_request_projections(id) ON DELETE RESTRICT,
  reviewer_session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  reviewer_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE RESTRICT,
  head_sha text NOT NULL,
  verdict review_verdict NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pull_request_id,reviewer_session_id,head_sha)
);
CREATE TABLE structured_review_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES structured_reviews(id) ON DELETE RESTRICT,
  severity finding_severity NOT NULL,
  title text NOT NULL,
  body text,
  path text,
  line integer CHECK(line > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE merge_approval_bindings (
  approval_id uuid PRIMARY KEY REFERENCES approvals(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL REFERENCES provider_connections(id) ON DELETE RESTRICT,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
  pull_request_id uuid NOT NULL REFERENCES pull_request_projections(id) ON DELETE RESTRICT,
  provider_pull_request_id text NOT NULL,
  head_sha text NOT NULL,
  method text NOT NULL CHECK(method IN ('merge','squash','rebase')),
  canonical_payload_hash text NOT NULL CHECK(canonical_payload_hash ~ '^sha256:[a-f0-9]{64}$'),
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE artifact_links (
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid,
  work_item_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  plan_step_id uuid,
  repository_id uuid REFERENCES repositories(id) ON DELETE RESTRICT,
  pull_request_id uuid REFERENCES pull_request_projections(id) ON DELETE RESTRICT,
  provenance jsonb NOT NULL,
  PRIMARY KEY(artifact_id),
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT
);

CREATE TABLE artifact_upload_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  work_item_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  project_id uuid,
  plan_step_id uuid,
  requested_by_actor_id uuid NOT NULL,
  storage_key text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 52428800),
  expected_checksum text NOT NULL CHECK(expected_checksum ~ '^sha256:[a-f0-9]{64}$'),
  actual_checksum text,
  status artifact_upload_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 8),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  last_error text,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,requested_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(expires_at > created_at)
);
CREATE INDEX artifact_upload_verify_claim ON artifact_upload_intents(available_at,created_at)
  WHERE status='uploaded' AND attempt_count<8;

CREATE TABLE project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  target_date date,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,name),
  UNIQUE(project_id,id),
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE CASCADE
);
ALTER TABLE work_items ADD COLUMN milestone_id uuid;
ALTER TABLE work_items ADD CONSTRAINT work_items_milestone_project_fk
  FOREIGN KEY(project_id,milestone_id) REFERENCES project_milestones(project_id,id) ON DELETE RESTRICT;
ALTER TABLE work_items ADD CONSTRAINT work_items_milestone_requires_project
  CHECK(milestone_id IS NULL OR project_id IS NOT NULL);

CREATE TABLE project_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  author_actor_id uuid NOT NULL,
  health project_health NOT NULL,
  body text NOT NULL,
  status project_update_status NOT NULL DEFAULT 'draft',
  evidence_artifact_ids uuid[] NOT NULL DEFAULT '{}',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,author_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK((status='published')=(published_at IS NOT NULL))
);
CREATE TABLE project_dependencies (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  depends_on_project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  created_by_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,depends_on_project_id),
  CHECK(project_id <> depends_on_project_id)
);
CREATE TABLE completion_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  work_item_id uuid NOT NULL,
  pull_request_id uuid REFERENCES pull_request_projections(id) ON DELETE RESTRICT,
  suggested_by_actor_id uuid NOT NULL,
  rationale text NOT NULL,
  evidence_artifact_ids uuid[] NOT NULL DEFAULT '{}',
  status completion_suggestion_status NOT NULL DEFAULT 'open',
  decided_by_actor_id uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,suggested_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,decided_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK((status='open')=(decided_at IS NULL))
);

CREATE FUNCTION prevent_stage3_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_STAGE3_FACT'; END
$$;
CREATE TRIGGER repository_contexts_immutable BEFORE UPDATE OR DELETE ON repository_contexts FOR EACH ROW EXECUTE FUNCTION prevent_stage3_fact_mutation();
CREATE TRIGGER repository_guidance_entries_immutable BEFORE UPDATE OR DELETE ON repository_guidance_entries FOR EACH ROW EXECUTE FUNCTION prevent_stage3_fact_mutation();
CREATE TRIGGER structured_reviews_immutable BEFORE UPDATE OR DELETE ON structured_reviews FOR EACH ROW EXECUTE FUNCTION prevent_stage3_fact_mutation();
CREATE TRIGGER structured_review_findings_immutable BEFORE UPDATE OR DELETE ON structured_review_findings FOR EACH ROW EXECUTE FUNCTION prevent_stage3_fact_mutation();

COMMIT;
