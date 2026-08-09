BEGIN;

-- Authorization denials are append-only security facts. They deliberately have
-- no foreign keys to principals/resources so later deletion cannot erase the
-- audit trail and so audit recording never discloses protected rows.
CREATE TABLE authorization_denials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  correlation_id text NOT NULL,
  policy_id text NOT NULL,
  operation_id text NOT NULL,
  transport text NOT NULL CHECK(transport IN ('rest','sse','mcp','sdk')),
  principal_kind actor_kind,
  principal_actor_id uuid,
  principal_session_id uuid,
  workspace_id uuid,
  route_template text NOT NULL,
  reason_code text NOT NULL,
  authorization_stage text NOT NULL CHECK(authorization_stage IN (
    'identity','session','delegation','capability','resource_scope',
    'human_role','approval','lease','revision','idempotency','handler'
  )),
  resource_fingerprint text,
  dedupe_key text,
  CHECK(resource_fingerprint IS NULL OR resource_fingerprint ~ '^[0-9a-f]{64}$'),
  CHECK(dedupe_key IS NULL OR dedupe_key ~ '^[0-9a-f]{64}$')
);
CREATE INDEX authorization_denials_workspace_time
  ON authorization_denials(workspace_id,occurred_at DESC);
CREATE INDEX authorization_denials_correlation
  ON authorization_denials(correlation_id);
CREATE INDEX authorization_denials_policy_reason
  ON authorization_denials(policy_id,reason_code,occurred_at DESC);
CREATE UNIQUE INDEX authorization_denials_dedupe
  ON authorization_denials(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE FUNCTION prevent_authorization_denial_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_AUTHORIZATION_DENIAL'; END
$$;
CREATE TRIGGER authorization_denials_immutable
  BEFORE UPDATE OR DELETE ON authorization_denials
  FOR EACH ROW EXECUTE FUNCTION prevent_authorization_denial_mutation();

-- Stage 4 originally had only Workspace-wide Templates. A nullable Team scope
-- is additive: existing rows remain Workspace-admin-only while new Team rows
-- can be exposed to explicit members without broad Workspace enumeration.
ALTER TABLE templates ADD COLUMN team_id uuid;
ALTER TABLE templates
  ADD CONSTRAINT templates_workspace_team_fk
  FOREIGN KEY(workspace_id,team_id)
  REFERENCES teams(workspace_id,id)
  ON DELETE RESTRICT;
CREATE INDEX templates_workspace_team_status
  ON templates(workspace_id,team_id,status);

COMMIT;
