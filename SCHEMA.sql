-- WorkMesh initial PostgreSQL schema
-- Version: 0.1
-- Snapshot: 2026-07-22
--
-- This is a starting migration for vibe coding. Keep all later changes in
-- numbered migrations. Business invariants that depend on actor kind, scope,
-- or policy are enforced in the application/domain layer and tested there.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE actor_kind AS ENUM ('human', 'agent', 'service');
CREATE TYPE workspace_role AS ENUM ('admin', 'maintainer', 'member', 'guest');
CREATE TYPE status_category AS ENUM ('backlog', 'planned', 'started', 'completed', 'canceled');
CREATE TYPE work_item_type AS ENUM ('issue', 'task', 'bug', 'feature', 'chore', 'incident');
CREATE TYPE work_priority AS ENUM ('none', 'low', 'medium', 'high', 'urgent');
CREATE TYPE project_health AS ENUM ('unknown', 'on_track', 'at_risk', 'off_track');
CREATE TYPE relation_kind AS ENUM ('blocks', 'related', 'duplicate_of');
CREATE TYPE delegation_role AS ENUM ('executor', 'reviewer', 'researcher', 'coordinator', 'triager');
CREATE TYPE delegation_status AS ENUM ('active', 'paused', 'completed', 'revoked', 'expired');
CREATE TYPE session_state AS ENUM (
  'queued',
  'acknowledged',
  'planning',
  'executing',
  'awaiting_input',
  'awaiting_approval',
  'blocked',
  'paused',
  'stopping',
  'completed',
  'failed',
  'canceled',
  'stale'
);
CREATE TYPE plan_step_status AS ENUM ('pending', 'in_progress', 'blocked', 'completed', 'canceled');
CREATE TYPE activity_kind AS ENUM (
  'ack',
  'status',
  'plan_published',
  'plan_changed',
  'action_started',
  'action_completed',
  'evidence',
  'question',
  'decision_request',
  'message',
  'artifact_published',
  'handoff_requested',
  'handoff_accepted',
  'warning',
  'error',
  'completion',
  'heartbeat'
);
CREATE TYPE message_intent AS ENUM (
  'inform',
  'ask',
  'answer',
  'propose',
  'decide',
  'claim',
  'handoff',
  'blocker',
  'review_request',
  'review_result',
  'status'
);
CREATE TYPE lease_mode AS ENUM ('exclusive', 'shared');
CREATE TYPE lease_status AS ENUM ('active', 'released', 'expired', 'revoked');
CREATE TYPE handoff_status AS ENUM ('draft', 'requested', 'accepted', 'rejected', 'canceled', 'completed');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'expired', 'canceled', 'consumed');
CREATE TYPE artifact_type AS ENUM (
  'note',
  'document',
  'patch',
  'diff',
  'branch',
  'commit',
  'pull_request',
  'code_review',
  'test_report',
  'build_report',
  'log',
  'screenshot',
  'preview_url',
  'external_link'
);
CREATE TYPE artifact_review_status AS ENUM ('unreviewed', 'approved', 'changes_requested', 'rejected');
CREATE TYPE outbox_status AS ENUM ('pending', 'delivering', 'delivered', 'dead_letter');
CREATE TYPE automation_status AS ENUM ('active', 'paused', 'disabled');
CREATE TYPE automation_run_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE actors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind actor_kind NOT NULL,
  display_name text NOT NULL,
  slug text NOT NULL,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

CREATE TABLE human_accounts (
  actor_id uuid PRIMARY KEY REFERENCES actors(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text,
  oidc_subject text,
  locale text NOT NULL DEFAULT 'zh-CN',
  timezone text NOT NULL DEFAULT 'UTC',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE TABLE agent_definitions (
  actor_id uuid PRIMARY KEY REFERENCES actors(id) ON DELETE CASCADE,
  provider text,
  version text,
  description text,
  endpoint_url text,
  webhook_secret_hash text,
  public_key text,
  supported_protocols text[] NOT NULL DEFAULT ARRAY['native_http']::text[],
  skills text[] NOT NULL DEFAULT '{}'::text[],
  requested_capabilities text[] NOT NULL DEFAULT '{}'::text[],
  approved_capabilities text[] NOT NULL DEFAULT '{}'::text[],
  output_artifact_types artifact_type[] NOT NULL DEFAULT '{}'::artifact_type[],
  max_concurrency integer NOT NULL DEFAULT 1 CHECK (max_concurrency > 0),
  heartbeat_interval_seconds integer NOT NULL DEFAULT 30 CHECK (heartbeat_interval_seconds > 0),
  default_timeout_seconds integer NOT NULL DEFAULT 3600 CHECK (default_timeout_seconds > 0),
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'revoked')),
  installed_by_actor_id uuid REFERENCES actors(id),
  installed_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE service_definitions (
  actor_id uuid PRIMARY KEY REFERENCES actors(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_account_id text,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  icon text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  issue_sequence bigint NOT NULL DEFAULT 0 CHECK (issue_sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, key)
);

CREATE TABLE team_memberships (
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, actor_id)
);

CREATE TABLE workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, actor_id)
);

CREATE TABLE guidance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('workspace', 'team', 'project', 'repository', 'work_item')),
  scope_id uuid,
  title text NOT NULL,
  body_markdown text NOT NULL,
  mode text NOT NULL DEFAULT 'append' CHECK (mode IN ('append', 'override')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  content_hash text NOT NULL,
  created_by_actor_id uuid NOT NULL REFERENCES actors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  supersedes_id uuid REFERENCES guidance_documents(id)
);

CREATE TABLE workflow_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  category status_category NOT NULL,
  color text,
  description text,
  position integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, name)
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  summary text,
  description_markdown text,
  status_category status_category NOT NULL DEFAULT 'planned',
  status_name text,
  health project_health NOT NULL DEFAULT 'unknown',
  lead_human_actor_id uuid REFERENCES actors(id),
  lead_agent_actor_id uuid REFERENCES actors(id),
  start_at date,
  target_at date,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_actor_id uuid NOT NULL REFERENCES actors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, slug)
);

CREATE TABLE project_teams (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, team_id)
);

CREATE TABLE milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description_markdown text,
  target_at date,
  position integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_actor_id uuid NOT NULL REFERENCES actors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE TABLE cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  number integer NOT NULL,
  name text,
  starts_at date NOT NULL,
  ends_at date NOT NULL,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at),
  UNIQUE (team_id, number)
);

CREATE TABLE work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id),
  sequence_number bigint NOT NULL CHECK (sequence_number > 0),
  identifier text NOT NULL,
  type work_item_type NOT NULL DEFAULT 'issue',
  title text NOT NULL,
  description_markdown text,
  status_id uuid NOT NULL REFERENCES workflow_states(id),
  priority work_priority NOT NULL DEFAULT 'none',
  estimate numeric(8,2),
  due_at timestamptz,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  milestone_id uuid REFERENCES milestones(id) ON DELETE SET NULL,
  cycle_id uuid REFERENCES cycles(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES work_items(id) ON DELETE SET NULL,
  responsible_human_actor_id uuid REFERENCES actors(id),
  lead_agent_actor_id uuid REFERENCES actors(id),
  acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_version integer NOT NULL DEFAULT 1 CHECK (context_version > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_actor_id uuid NOT NULL REFERENCES actors(id),
  updated_by_actor_id uuid NOT NULL REFERENCES actors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  canceled_at timestamptz,
  deleted_at timestamptz,
  UNIQUE (workspace_id, identifier),
  UNIQUE (team_id, sequence_number)
);

CREATE TABLE work_item_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  target_work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  kind relation_kind NOT NULL,
  created_by_actor_id uuid NOT NULL REFERENCES actors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_work_item_id <> target_work_item_id),
  UNIQUE (source_work_item_id, target_work_item_id, kind)
);

CREATE TABLE labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  description text,
  group_name text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (workspace_id, team_id, name)
);

CREATE TABLE work_item_labels (
  work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  created_by_actor_id uuid NOT NULL REFERENCES actors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_item_id, label_id)
);

CREATE TABLE saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_actor_id uuid NOT NULL REFERENCES actors(id),
  name text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('work_item', 'project', 'session', 'initiative')),
  scope text NOT NULL DEFAULT 'private' CHECK (scope IN ('private', 'team', 'workspace')),
  scope_team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  grouping jsonb NOT NULL DEFAULT '{}'::jsonb,
  ordering jsonb NOT NULL DEFAULT '{}'::jsonb,
  visible_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  layout text NOT NULL DEFAULT 'list' CHECK (layout IN ('list', 'board', 'timeline')),
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_type text NOT NULL CHECK (channel_type IN ('work_item', 'project', 'session')),
  work_item_id uuid REFERENCES work_items(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (channel_type = 'work_item' AND work_item_id IS NOT NULL AND project_id IS NULL)
    OR (channel_type = 'project' AND project_id IS NOT NULL AND work_item_id IS NULL)
    OR (channel_type = 'session' AND session_id IS NOT NULL)
  )
);

CREATE TABLE threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_by_actor_id uuid NOT NULL REFERENCES actors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by_actor_id uuid REFERENCES actors(id),
  resolved_at timestamptz
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES threads(id) ON DELETE CASCADE,
  sender_actor_id uuid NOT NULL REFERENCES actors(id),
  intent message_intent NOT NULL DEFAULT 'inform',
  body_markdown text NOT NULL,
  reply_to_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  structured_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  references_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_response boolean NOT NULL DEFAULT false,
  response_status text NOT NULL DEFAULT 'none' CHECK (response_status IN ('none', 'open', 'resolved')),
  due_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE message_recipients (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  read_at timestamptz,
  PRIMARY KEY (message_id, actor_id)
);

CREATE TABLE message_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  body_markdown text NOT NULL,
  structured_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  edited_by_actor_id uuid NOT NULL REFERENCES actors(id),
  edited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, revision)
);

CREATE TABLE decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision text NOT NULL,
  rationale_summary text,
  decided_by_actor_id uuid NOT NULL REFERENCES actors(id),
  affected_resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  supersedes_id uuid REFERENCES decisions(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'reversed')),
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  principal_human_actor_id uuid NOT NULL REFERENCES actors(id),
  agent_actor_id uuid NOT NULL REFERENCES actors(id),
  role delegation_role NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('work_item', 'plan_step', 'project', 'automation')),
  scope_id uuid NOT NULL,
  permissions_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status delegation_status NOT NULL DEFAULT 'active',
  reason text,
  parent_delegation_id uuid REFERENCES delegations(id) ON DELETE SET NULL,
  created_by_actor_id uuid NOT NULL REFERENCES actors(id),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (principal_human_actor_id <> agent_actor_id)
);

CREATE TABLE context_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  work_item_id uuid REFERENCES work_items(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  content_manifest jsonb NOT NULL,
  rendered_context text,
  source_hash text NOT NULL,
  token_estimate integer CHECK (token_estimate IS NULL OR token_estimate >= 0),
  truncation_summary text,
  created_by_actor_id uuid NOT NULL REFERENCES actors(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  agent_actor_id uuid NOT NULL REFERENCES actors(id),
  principal_human_actor_id uuid NOT NULL REFERENCES actors(id),
  delegation_id uuid NOT NULL REFERENCES delegations(id),
  work_item_id uuid REFERENCES work_items(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  parent_session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL,
  state session_state NOT NULL DEFAULT 'queued',
  state_reason text,
  sequence bigint NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  context_snapshot_id uuid REFERENCES context_snapshots(id) ON DELETE SET NULL,
  current_plan_version_id uuid,
  external_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget jsonb NOT NULL DEFAULT '{}'::jsonb,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  started_at timestamptz,
  last_heartbeat_at timestamptz,
  stop_requested_at timestamptz,
  ended_at timestamptz,
  error_code text,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE channels
  ADD CONSTRAINT channels_session_fk
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE;

CREATE TABLE agent_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  authored_by_actor_id uuid NOT NULL REFERENCES actors(id),
  change_summary text,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, revision)
);

ALTER TABLE agent_sessions
  ADD CONSTRAINT agent_sessions_current_plan_fk
  FOREIGN KEY (current_plan_version_id) REFERENCES agent_plan_versions(id) ON DELETE SET NULL;

CREATE TABLE agent_plan_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_version_id uuid NOT NULL REFERENCES agent_plan_versions(id) ON DELETE CASCADE,
  stable_step_id uuid NOT NULL,
  title text NOT NULL,
  description_markdown text,
  status plan_step_status NOT NULL DEFAULT 'pending',
  owner_actor_id uuid REFERENCES actors(id),
  ordinal integer NOT NULL DEFAULT 0,
  acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_artifacts artifact_type[] NOT NULL DEFAULT '{}'::artifact_type[],
  required_capabilities text[] NOT NULL DEFAULT '{}'::text[],
  estimate jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk text,
  blocked_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (plan_version_id, stable_step_id)
);

CREATE TABLE plan_step_dependencies (
  plan_version_id uuid NOT NULL REFERENCES agent_plan_versions(id) ON DELETE CASCADE,
  step_stable_id uuid NOT NULL,
  depends_on_step_stable_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_version_id, step_stable_id, depends_on_step_stable_id),
  CHECK (step_stable_id <> depends_on_step_stable_id)
);

CREATE TABLE tool_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES actors(id),
  tool_name text NOT NULL,
  input_sanitized jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'canceled')),
  result_summary text,
  external_trace_url text,
  approval_id uuid,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  error_code text,
  error_summary text
);

CREATE TABLE agent_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES actors(id),
  sequence bigint NOT NULL CHECK (sequence > 0),
  kind activity_kind NOT NULL,
  summary text NOT NULL,
  details_markdown text,
  tool_invocation_id uuid REFERENCES tool_invocations(id) ON DELETE SET NULL,
  references_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility text NOT NULL DEFAULT 'team' CHECK (visibility IN ('private', 'team', 'workspace')),
  is_ephemeral boolean NOT NULL DEFAULT false,
  correlation_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, sequence)
);

CREATE TABLE artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL,
  work_item_id uuid REFERENCES work_items(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  produced_by_actor_id uuid NOT NULL REFERENCES actors(id),
  type artifact_type NOT NULL,
  title text NOT NULL,
  uri text,
  storage_key text,
  mime_type text,
  checksum text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  repository jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_tool text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_status artifact_review_status NOT NULL DEFAULT 'unreviewed',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE activity_artifacts (
  activity_id uuid NOT NULL REFERENCES agent_activities(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, artifact_id)
);

CREATE TABLE work_leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('work_item', 'plan_step', 'repository_path', 'artifact_review')),
  resource_id text NOT NULL,
  mode lease_mode NOT NULL DEFAULT 'exclusive',
  holder_session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  status lease_status NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  CHECK (expires_at > acquired_at)
);

-- Enforce one active exclusive lease per resource. PostgreSQL partial indexes
-- cannot use enum comparisons ambiguously, so values are explicit.
CREATE UNIQUE INDEX work_leases_one_active_exclusive
  ON work_leases (workspace_id, resource_type, resource_id)
  WHERE status = 'active' AND mode = 'exclusive';

CREATE TABLE handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_session_id uuid NOT NULL REFERENCES agent_sessions(id),
  source_actor_id uuid NOT NULL REFERENCES actors(id),
  target_agent_actor_id uuid REFERENCES actors(id),
  target_skill text,
  scope_type text NOT NULL CHECK (scope_type IN ('work_item', 'plan_step', 'project')),
  scope_id text NOT NULL,
  status handoff_status NOT NULL DEFAULT 'draft',
  summary text NOT NULL,
  completed_work jsonb NOT NULL DEFAULT '[]'::jsonb,
  remaining_work jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_snapshot_id uuid NOT NULL REFERENCES context_snapshots(id),
  artifact_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  open_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  requested_action text NOT NULL,
  lease_transfer_policy text NOT NULL DEFAULT 'transfer' CHECK (lease_transfer_policy IN ('none', 'transfer', 'new')),
  accepted_session_id uuid REFERENCES agent_sessions(id),
  created_by_actor_id uuid NOT NULL REFERENCES actors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id uuid REFERENCES agent_sessions(id) ON DELETE CASCADE,
  requested_by_actor_id uuid NOT NULL REFERENCES actors(id),
  approval_type text NOT NULL,
  action_name text NOT NULL,
  action_payload_sanitized jsonb NOT NULL,
  action_payload_hash text NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  rationale_summary text NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  required_approvals integer NOT NULL DEFAULT 1 CHECK (required_approvals > 0),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  consumed_at timestamptz
);

ALTER TABLE tool_invocations
  ADD CONSTRAINT tool_invocations_approval_fk
  FOREIGN KEY (approval_id) REFERENCES approval_requests(id) ON DELETE SET NULL;

CREATE TABLE approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id uuid NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  decided_by_actor_id uuid NOT NULL REFERENCES actors(id),
  decision text NOT NULL CHECK (decision IN ('approve', 'reject')),
  comment text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (approval_request_id, decided_by_actor_id)
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  events text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, resource_type, resource_id)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  recipient_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  body text,
  resource_type text,
  resource_id text,
  priority integer NOT NULL DEFAULT 0,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE TABLE automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  owner_actor_id uuid NOT NULL REFERENCES actors(id),
  status automation_status NOT NULL DEFAULT 'active',
  trigger_config jsonb NOT NULL,
  condition_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_config jsonb NOT NULL,
  budget jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_rule_id uuid NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  status automation_run_status NOT NULL DEFAULT 'queued',
  trigger_event_id uuid,
  session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL,
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary text,
  error_summary text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz
);

CREATE TABLE domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1 CHECK (event_version > 0),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  aggregate_revision bigint,
  actor_id uuid NOT NULL REFERENCES actors(id),
  subject_type text,
  subject_id text,
  session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL,
  sequence bigint,
  correlation_id text,
  causation_id uuid REFERENCES domain_events(id) ON DELETE SET NULL,
  idempotency_key text,
  visibility text NOT NULL DEFAULT 'team' CHECK (visibility IN ('private', 'team', 'workspace')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX domain_events_idempotency
  ON domain_events (workspace_id, actor_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX domain_events_aggregate_order
  ON domain_events (workspace_id, aggregate_type, aggregate_id, occurred_at, id);

CREATE UNIQUE INDEX domain_events_session_sequence
  ON domain_events (session_id, sequence)
  WHERE session_id IS NOT NULL AND sequence IS NOT NULL;

ALTER TABLE automation_runs
  ADD CONSTRAINT automation_runs_trigger_event_fk
  FOREIGN KEY (trigger_event_id) REFERENCES domain_events(id) ON DELETE SET NULL;

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_event_id uuid NOT NULL REFERENCES domain_events(id) ON DELETE CASCADE,
  topic text NOT NULL,
  partition_key text NOT NULL,
  destination jsonb NOT NULL DEFAULT '{}'::jsonb,
  status outbox_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_event_id uuid NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
  endpoint_url text NOT NULL,
  delivery_id text NOT NULL UNIQUE,
  request_headers_sanitized jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_status integer,
  response_body_truncated text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

CREATE TABLE api_idempotency_keys (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  resource_type text,
  resource_id text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, actor_id, idempotency_key)
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES actors(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied', 'error')),
  reason text,
  ip inet,
  user_agent text,
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Query indexes

CREATE INDEX actors_workspace_kind ON actors (workspace_id, kind, is_active);
CREATE INDEX teams_workspace_active ON teams (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX workflow_states_team_position ON workflow_states (team_id, position) WHERE is_archived = false;
CREATE INDEX projects_workspace_status ON projects (workspace_id, status_category) WHERE deleted_at IS NULL;
CREATE INDEX work_items_team_status ON work_items (team_id, status_id) WHERE deleted_at IS NULL;
CREATE INDEX work_items_project_status ON work_items (project_id, status_id) WHERE deleted_at IS NULL;
CREATE INDEX work_items_owner_active ON work_items (responsible_human_actor_id, status_id) WHERE deleted_at IS NULL;
CREATE INDEX work_items_agent_active ON work_items (lead_agent_actor_id, status_id) WHERE deleted_at IS NULL;
CREATE INDEX work_items_parent ON work_items (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX work_items_updated ON work_items (workspace_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX work_items_title_trgm ON work_items USING gin (title gin_trgm_ops);
CREATE INDEX messages_channel_created ON messages (channel_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX notifications_recipient_unread ON notifications (recipient_actor_id, created_at DESC) WHERE is_read = false;
CREATE INDEX delegations_agent_active ON delegations (agent_actor_id, status) WHERE status = 'active';
CREATE INDEX agent_sessions_agent_state ON agent_sessions (agent_actor_id, state, updated_at DESC);
CREATE INDEX agent_sessions_work_item ON agent_sessions (work_item_id, created_at DESC) WHERE work_item_id IS NOT NULL;
CREATE INDEX agent_sessions_heartbeat ON agent_sessions (state, last_heartbeat_at)
  WHERE state IN ('queued', 'acknowledged', 'planning', 'executing', 'awaiting_input', 'awaiting_approval', 'blocked', 'paused', 'stopping');
CREATE INDEX agent_activities_session_time ON agent_activities (session_id, sequence);
CREATE INDEX artifacts_work_item ON artifacts (work_item_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX approvals_pending ON approval_requests (workspace_id, created_at) WHERE status = 'pending';
CREATE INDEX outbox_pending ON outbox_events (available_at, created_at) WHERE status IN ('pending', 'delivering');
CREATE INDEX audit_workspace_time ON audit_logs (workspace_id, occurred_at DESC);

COMMIT;
