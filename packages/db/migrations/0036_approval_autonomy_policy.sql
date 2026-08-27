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
  ON approval_policy_reconciliations(created_at)
  WHERE status IN ('pending','running');

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
  ADD COLUMN policy_revision integer;
ALTER TABLE approval_decisions
  ADD CONSTRAINT approval_decisions_policy_fk
    FOREIGN KEY(policy_workspace_id) REFERENCES approval_autonomy_policies(workspace_id) ON DELETE RESTRICT,
  ADD CONSTRAINT approval_decisions_source_check CHECK(
    (source='human' AND policy_workspace_id IS NULL AND policy_revision IS NULL)
    OR (source='workspace_policy' AND policy_workspace_id IS NOT NULL AND policy_revision IS NOT NULL)
  );
CREATE UNIQUE INDEX approval_decisions_one_policy_decision
  ON approval_decisions(approval_id,policy_workspace_id,policy_revision)
  WHERE source='workspace_policy';
