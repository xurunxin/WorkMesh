CREATE TYPE agent_enrollment_policy_status AS ENUM ('active','revoked');

CREATE TABLE agent_enrollment_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id uuid NOT NULL,
  principal_human_actor_id uuid NOT NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  token_hash text NOT NULL UNIQUE,
  allowed_client_types text[] NOT NULL,
  capability_ceiling text[] NOT NULL,
  grant_agent_delegate boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  max_redemptions integer NOT NULL CHECK(max_redemptions BETWEEN 1 AND 10000),
  redemption_count integer NOT NULL DEFAULT 0 CHECK(redemption_count BETWEEN 0 AND max_redemptions),
  status agent_enrollment_policy_status NOT NULL DEFAULT 'active',
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by_actor_id uuid NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,id),
  FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,principal_human_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,created_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  CHECK(cardinality(allowed_client_types)>0),
  CHECK(cardinality(capability_ceiling)>0),
  CHECK(allowed_client_types <@ ARRAY['codex','opencode','pi','generic_mcp']::text[]),
  CHECK(capability_ceiling <@ ARRAY['work:read','work:write','comment:write','plan:write','message:write','artifact:write','repo:read','repo:write_branch','repo:open_pr','repo:merge','ci:run','deploy:staging','deploy:production','secrets:use','automation:manage','admin:*','agent:delegate']::text[]),
  CHECK((status='active') = (revoked_at IS NULL))
);
CREATE INDEX agent_enrollment_policies_active
  ON agent_enrollment_policies(workspace_id,expires_at)
  WHERE status='active';

-- Agent Connections are introduced by the v1 migration line after the legacy
-- baseline. Legacy adoption and fresh-baseline construction therefore defer
-- these connection-bound objects until v1/0008; a legacy database that already
-- carries Agent Connections can still converge in this migration.
DO $$
BEGIN
  IF to_regclass('public.agent_connections') IS NOT NULL THEN
    CREATE TABLE agent_enrollment_redemptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      policy_id uuid NOT NULL REFERENCES agent_enrollment_policies(id) ON DELETE RESTRICT,
      connection_id uuid NOT NULL REFERENCES agent_connections(id) ON DELETE RESTRICT,
      agent_id uuid NOT NULL REFERENCES agent_definitions(id) ON DELETE RESTRICT,
      request_fingerprint text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(policy_id,connection_id),
      UNIQUE(policy_id,request_fingerprint)
    );
    CREATE TRIGGER agent_enrollment_redemptions_immutable
      BEFORE UPDATE OR DELETE ON agent_enrollment_redemptions
      FOR EACH ROW EXECUTE FUNCTION prevent_stage1_fact_mutation();
    ALTER TABLE agent_connections
      ADD COLUMN source text NOT NULL DEFAULT 'manual'
        CHECK(source IN ('manual','enrollment')),
      ADD COLUMN enrollment_policy_id uuid
        REFERENCES agent_enrollment_policies(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE agent_definitions
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by_actor_id uuid,
  ADD COLUMN archive_reason text,
  ADD CONSTRAINT agent_definitions_archived_by_fk
    FOREIGN KEY(workspace_id,archived_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT agent_definitions_archive_state_check CHECK(
    (archived_at IS NULL AND archived_by_actor_id IS NULL AND archive_reason IS NULL)
    OR (NOT is_active AND archived_at IS NOT NULL AND archive_reason IS NOT NULL)
  ) NOT VALID;
UPDATE agent_definitions
SET archived_at=coalesce(updated_at,now()),archive_reason='legacy_inactive'
WHERE NOT is_active AND archived_at IS NULL;
ALTER TABLE agent_definitions VALIDATE CONSTRAINT agent_definitions_archive_state_check;
CREATE INDEX agent_definitions_lifecycle
  ON agent_definitions(workspace_id,is_active,updated_at DESC);
