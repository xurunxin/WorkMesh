-- Converges both fresh v1 baselines and already-deployed v1 databases.
-- Root migrations 0036-0038 remain the legacy upgrade source; this migration
-- applies the same state to installations that have already adopted v1.

DO $$
BEGIN
  IF to_regclass('public.approval_autonomy_policies') IS NULL THEN
    CREATE TYPE approval_autonomy_mode AS ENUM ('human_required','yolo');
    CREATE TYPE approval_policy_reconciliation_status AS ENUM ('pending','running','completed','completed_with_skips');
    CREATE TYPE approval_decision_source AS ENUM ('human','workspace_policy');

    CREATE TABLE approval_autonomy_policies (
      workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      mode approval_autonomy_mode NOT NULL DEFAULT 'human_required',
      revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
      updated_by_actor_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(workspace_id,updated_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
    );
    CREATE TABLE approval_autonomy_project_exclusions (
      workspace_id uuid NOT NULL,
      project_id uuid NOT NULL,
      policy_revision integer NOT NULL CHECK(policy_revision > 0),
      created_by_actor_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(workspace_id,project_id),
      FOREIGN KEY(workspace_id) REFERENCES approval_autonomy_policies(workspace_id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id,created_by_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT
    );
    CREATE TABLE approval_policy_reconciliations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES approval_autonomy_policies(workspace_id) ON DELETE CASCADE,
      policy_revision integer NOT NULL CHECK(policy_revision > 0),
      status approval_policy_reconciliation_status NOT NULL DEFAULT 'pending',
      processed_count integer NOT NULL DEFAULT 0 CHECK(processed_count >= 0),
      approved_count integer NOT NULL DEFAULT 0 CHECK(approved_count >= 0),
      skipped_count integer NOT NULL DEFAULT 0 CHECK(skipped_count >= 0),
      last_error text,
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(workspace_id,policy_revision)
    );
    CREATE INDEX approval_policy_reconciliations_claim
      ON approval_policy_reconciliations(created_at) WHERE status IN ('pending','running');
    CREATE TABLE approval_policy_reconciliation_items (
      reconciliation_id uuid NOT NULL REFERENCES approval_policy_reconciliations(id) ON DELETE CASCADE,
      approval_id uuid NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','skipped')),
      attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
      last_error text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(reconciliation_id,approval_id)
    );
    CREATE INDEX approval_policy_reconciliation_items_claim
      ON approval_policy_reconciliation_items(reconciliation_id,status,updated_at,approval_id)
      WHERE status IN ('pending','skipped');
    ALTER TABLE approval_decisions
      ADD COLUMN source approval_decision_source NOT NULL DEFAULT 'human',
      ADD COLUMN policy_workspace_id uuid,
      ADD COLUMN policy_revision integer,
      ADD CONSTRAINT approval_decisions_policy_fk
        FOREIGN KEY(policy_workspace_id) REFERENCES approval_autonomy_policies(workspace_id) ON DELETE RESTRICT,
      ADD CONSTRAINT approval_decisions_source_check CHECK(
        (source='human' AND policy_workspace_id IS NULL AND policy_revision IS NULL)
        OR (source='workspace_policy' AND policy_workspace_id IS NOT NULL AND policy_revision IS NOT NULL)
      );
    CREATE UNIQUE INDEX approval_decisions_one_policy_decision
      ON approval_decisions(approval_id,policy_workspace_id,policy_revision)
      WHERE source='workspace_policy';
  END IF;
END $$;

INSERT INTO approval_autonomy_policies(workspace_id,mode,updated_by_actor_id)
SELECT workspace.id,'human_required',admin_actor.id
  FROM workspaces workspace
  JOIN LATERAL (
    SELECT actor.id
      FROM actors actor
     WHERE actor.workspace_id=workspace.id
       AND actor.kind='human' AND actor.workspace_role='admin' AND actor.is_active
     ORDER BY actor.created_at,actor.id
     LIMIT 1
  ) admin_actor ON true
ON CONFLICT(workspace_id) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.browser_push_subscriptions') IS NULL THEN
    CREATE TYPE browser_push_subscription_status AS ENUM ('active','revoked','invalid');
    CREATE TABLE browser_push_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      actor_id uuid NOT NULL,
      device_id text NOT NULL CHECK(length(device_id) BETWEEN 1 AND 200),
      endpoint text NOT NULL,
      endpoint_hash text NOT NULL,
      p256dh text NOT NULL,
      auth_secret text NOT NULL,
      user_agent text,
      status browser_push_subscription_status NOT NULL DEFAULT 'active',
      revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
      last_delivered_at timestamptz,
      last_failure_at timestamptz,
      last_failure_code text,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(workspace_id,id),
      FOREIGN KEY(workspace_id,actor_id) REFERENCES actors(workspace_id,id) ON DELETE CASCADE,
      CHECK((status='active') = (revoked_at IS NULL)),
      CHECK(endpoint_hash ~ '^sha256:[a-f0-9]{64}$')
    );
    CREATE INDEX browser_push_subscriptions_actor_active
      ON browser_push_subscriptions(workspace_id,actor_id,created_at DESC) WHERE status='active';
    CREATE UNIQUE INDEX browser_push_subscriptions_active_endpoint
      ON browser_push_subscriptions(workspace_id,actor_id,endpoint_hash) WHERE status='active';
    CREATE UNIQUE INDEX browser_push_subscriptions_active_device
      ON browser_push_subscriptions(workspace_id,actor_id,device_id) WHERE status='active';
    ALTER TABLE notification_deliveries
      DROP CONSTRAINT notification_deliveries_notification_id_channel_key,
      ADD COLUMN browser_push_subscription_id uuid REFERENCES browser_push_subscriptions(id) ON DELETE CASCADE,
      ADD CONSTRAINT notification_deliveries_browser_subscription_check CHECK(
        (channel='browser' AND browser_push_subscription_id IS NOT NULL)
        OR (channel<>'browser' AND browser_push_subscription_id IS NULL)
      );
    CREATE UNIQUE INDEX notification_deliveries_non_browser_unique
      ON notification_deliveries(notification_id,channel) WHERE channel<>'browser';
    CREATE UNIQUE INDEX notification_deliveries_browser_unique
      ON notification_deliveries(notification_id,browser_push_subscription_id)
      WHERE channel='browser' AND browser_push_subscription_id IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.agent_enrollment_policies') IS NULL THEN
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
      ON agent_enrollment_policies(workspace_id,expires_at) WHERE status='active';
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
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.agent_enrollment_redemptions') IS NULL THEN
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
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='agent_enrollment_redemptions_immutable') THEN
    CREATE TRIGGER agent_enrollment_redemptions_immutable
      BEFORE UPDATE OR DELETE ON agent_enrollment_redemptions
      FOR EACH ROW EXECUTE FUNCTION prevent_stage1_fact_mutation();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='agent_connections' AND column_name='source'
  ) THEN
    ALTER TABLE agent_connections
      ADD COLUMN source text NOT NULL DEFAULT 'manual'
        CHECK(source IN ('manual','enrollment'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='agent_connections' AND column_name='enrollment_policy_id'
  ) THEN
    ALTER TABLE agent_connections
      ADD COLUMN enrollment_policy_id uuid
        REFERENCES agent_enrollment_policies(id) ON DELETE RESTRICT;
  END IF;
END $$;
