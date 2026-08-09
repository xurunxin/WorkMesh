ALTER TYPE delegation_scope_type ADD VALUE IF NOT EXISTS 'team';

ALTER TABLE agent_sessions ADD COLUMN session_kind text NOT NULL DEFAULT 'execution' CHECK(session_kind IN ('execution','coordination'));
ALTER TABLE agent_sessions ADD COLUMN coordination_connection_id uuid;
ALTER TABLE agent_sessions DROP CONSTRAINT agent_sessions_subject_container_check;
ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_scope_kind_check CHECK(
  (session_kind='coordination' AND automation_run_id IS NULL AND parent_session_id IS NULL
    AND num_nonnulls(work_item_id,project_id,plan_step_id)=0)
  OR (session_kind='execution' AND (
    (automation_run_id IS NOT NULL AND parent_session_id IS NULL
      AND num_nonnulls(work_item_id,project_id,plan_step_id)=0)
    OR (automation_run_id IS NULL AND (
      (parent_session_id IS NULL AND num_nonnulls(work_item_id,project_id,plan_step_id)=1)
      OR (parent_session_id IS NOT NULL AND num_nonnulls(work_item_id,project_id)=1)
    ))
  ))
);

CREATE TABLE agent_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  agent_actor_id uuid NOT NULL,
  principal_human_actor_id uuid NOT NULL,
  delegation_id uuid NOT NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  agent_slug text NOT NULL CHECK(agent_slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  client_type text NOT NULL CHECK(client_type IN ('codex','opencode','pi','generic_mcp')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rotating','revoked')),
  requested_capabilities text[] NOT NULL,
  granted_capabilities text[] NOT NULL,
  grant_agent_delegate boolean NOT NULL DEFAULT false,
  notes text,
  skill_version text,
  skill_sha256 text,
  active_credential_fingerprint_prefix text,
  pairing_code_expires_at timestamptz,
  last_used_at timestamptz,
  rotated_at timestamptz,
  revoked_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by_actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  UNIQUE(workspace_id,agent_slug,team_id),
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,principal_human_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,created_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_actor_id) REFERENCES agent_definitions(workspace_id,actor_id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,delegation_id) REFERENCES delegations(workspace_id,id) ON DELETE RESTRICT,
  CHECK(granted_capabilities <@ requested_capabilities),
  CHECK(grant_agent_delegate OR NOT ('agent:delegate'=ANY(granted_capabilities)))
);
CREATE INDEX agent_connections_team_status ON agent_connections(workspace_id,team_id,status);

CREATE TABLE agent_connection_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES agent_connections(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK(purpose IN ('initial','rotation')),
  expected_agent_slug text NOT NULL,
  expected_client_type text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0 AND attempts <= 10),
  expires_at timestamptz NOT NULL,
  overlap_until timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_connection_pairings_active ON agent_connection_pairings(code_hash,expires_at) WHERE consumed_at IS NULL;

CREATE TABLE agent_connection_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES agent_connections(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  fingerprint_prefix text NOT NULL,
  status text NOT NULL CHECK(status IN ('active','overlap','rotated','revoked')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  overlap_until timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_connection_credentials_one_active ON agent_connection_credentials(connection_id) WHERE status='active';
CREATE INDEX agent_connection_credentials_auth ON agent_connection_credentials(token_hash,status,overlap_until);

CREATE TABLE agent_coordination_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_session_id uuid NOT NULL UNIQUE REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL REFERENCES agent_connections(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  team_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  agent_actor_id uuid NOT NULL,
  principal_human_actor_id uuid NOT NULL,
  delegation_id uuid NOT NULL,
  granted_capabilities text[] NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  expires_at timestamptz NOT NULL,
  refreshed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,connection_id) REFERENCES agent_connections(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_actor_id) REFERENCES agent_definitions(workspace_id,actor_id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,principal_human_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,delegation_id) REFERENCES delegations(workspace_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX agent_coordination_sessions_one_active ON agent_coordination_sessions(connection_id) WHERE status='active';
CREATE INDEX agent_coordination_sessions_expiry ON agent_coordination_sessions(status,expires_at);
ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_coordination_connection_fk FOREIGN KEY(coordination_connection_id) REFERENCES agent_connections(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX agent_sessions_one_live_coordination ON agent_sessions(coordination_connection_id) WHERE session_kind='coordination' AND state NOT IN ('completed','failed','canceled');
