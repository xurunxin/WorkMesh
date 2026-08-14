ALTER TYPE artifact_upload_status ADD VALUE 'canceled';

ALTER TABLE artifacts ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE artifact_links ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE artifact_upload_intents ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE artifact_upload_intents ALTER COLUMN repository_id DROP NOT NULL;
ALTER TABLE artifact_upload_intents ADD COLUMN artifact_id uuid REFERENCES artifacts(id);

CREATE OR REPLACE FUNCTION validate_artifact_actor_provenance() RETURNS trigger AS $$
DECLARE producer_kind actor_kind;
BEGIN
  SELECT kind INTO producer_kind FROM actors WHERE id=NEW.producer_actor_id AND workspace_id=NEW.workspace_id;
  IF producer_kind IS NULL THEN RAISE EXCEPTION 'ARTIFACT_PRODUCER_NOT_FOUND'; END IF;
  IF producer_kind='agent' AND NEW.session_id IS NULL THEN RAISE EXCEPTION 'AGENT_ARTIFACT_SESSION_REQUIRED'; END IF;
  IF producer_kind='human' AND NEW.session_id IS NOT NULL THEN RAISE EXCEPTION 'HUMAN_ARTIFACT_SESSION_FORBIDDEN'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_artifact_link_provenance() RETURNS trigger AS $$
DECLARE artifact_session uuid;
BEGIN
  SELECT session_id INTO artifact_session FROM artifacts WHERE id=NEW.artifact_id AND workspace_id=NEW.workspace_id;
  IF artifact_session IS DISTINCT FROM NEW.session_id THEN RAISE EXCEPTION 'ARTIFACT_LINK_SESSION_MISMATCH'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_upload_intent_actor_provenance() RETURNS trigger AS $$
DECLARE requester_kind actor_kind;
BEGIN
  SELECT kind INTO requester_kind FROM actors WHERE id=NEW.requested_by_actor_id AND workspace_id=NEW.workspace_id;
  IF requester_kind IS NULL THEN RAISE EXCEPTION 'UPLOAD_REQUESTER_NOT_FOUND'; END IF;
  IF requester_kind='agent' AND (NEW.session_id IS NULL OR NEW.repository_id IS NULL) THEN RAISE EXCEPTION 'AGENT_UPLOAD_PROVENANCE_REQUIRED'; END IF;
  IF requester_kind='human' AND (NEW.session_id IS NOT NULL OR NEW.plan_step_id IS NOT NULL OR NEW.repository_id IS NOT NULL OR NEW.pull_request_id IS NOT NULL OR NEW.head_sha IS NOT NULL) THEN RAISE EXCEPTION 'HUMAN_UPLOAD_AGENT_PROVENANCE_FORBIDDEN'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER artifacts_actor_provenance AFTER INSERT OR UPDATE ON artifacts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_artifact_actor_provenance();
CREATE CONSTRAINT TRIGGER artifact_links_session_provenance AFTER INSERT OR UPDATE ON artifact_links
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_artifact_link_provenance();
CREATE CONSTRAINT TRIGGER artifact_upload_intents_actor_provenance AFTER INSERT OR UPDATE ON artifact_upload_intents
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_upload_intent_actor_provenance();
