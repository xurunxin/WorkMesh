BEGIN;

-- Inbox entries name the human action, never the transport that produced it.
ALTER TYPE inbox_item_kind ADD VALUE IF NOT EXISTS 'ask';
ALTER TYPE inbox_item_kind ADD VALUE IF NOT EXISTS 'review_request';
ALTER TYPE inbox_item_kind ADD VALUE IF NOT EXISTS 'blocker';
ALTER TYPE inbox_item_kind ADD VALUE IF NOT EXISTS 'handoff';

CREATE TYPE room_subject_kind AS ENUM ('work_item','project','session');
CREATE TYPE room_message_intent AS ENUM ('inform','ask','answer','propose','decide','claim','handoff','blocker','review_request','review_result','status');
CREATE TYPE lease_kind AS ENUM ('exclusive','review_shared');
CREATE TYPE lease_status AS ENUM ('active','released','expired','revoked');
CREATE TYPE handoff_status AS ENUM ('draft','requested','accepted','rejected','canceled','completed');
CREATE TYPE budget_reservation_status AS ENUM ('reserved','released','consumed');
CREATE TYPE decision_relation_kind AS ENUM ('supersedes','reverses');
CREATE TYPE routing_outcome AS ENUM ('candidate','rejected','selected');

-- A child has a work/project container and may additionally target a stable plan step.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='agent_sessions'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%num_nonnulls(work_item_id, project_id, plan_step_id)%' LOOP
    EXECUTE format('ALTER TABLE agent_sessions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE agent_sessions
  ADD COLUMN max_child_sessions integer NOT NULL DEFAULT 8 CHECK(max_child_sessions >= 0),
  ADD COLUMN inherited_budget jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN required_for_parent boolean NOT NULL DEFAULT false,
  ADD COLUMN plan_step_version_id uuid,
  ADD CONSTRAINT agent_sessions_subject_container_check CHECK (
    (parent_session_id IS NULL AND num_nonnulls(work_item_id,project_id,plan_step_id)=1)
    OR (parent_session_id IS NOT NULL AND num_nonnulls(work_item_id,project_id)=1)
  ),
  ADD CONSTRAINT agent_sessions_required_child_check CHECK (NOT required_for_parent OR parent_session_id IS NOT NULL),
  ADD CONSTRAINT agent_sessions_step_version_check CHECK ((plan_step_version_id IS NULL) = (plan_step_id IS NULL));
ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_plan_step_version_fk
  FOREIGN KEY(plan_step_version_id,plan_step_id) REFERENCES agent_plan_steps(plan_version_id,id) ON DELETE RESTRICT;

CREATE FUNCTION enforce_stage2_session_tree() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent agent_sessions%ROWTYPE; children integer;
BEGIN
  IF NEW.parent_session_id IS NOT NULL THEN
    SELECT * INTO parent FROM agent_sessions WHERE id=NEW.parent_session_id FOR UPDATE;
    IF NOT FOUND OR parent.workspace_id<>NEW.workspace_id OR parent.team_id IS DISTINCT FROM NEW.team_id THEN RAISE EXCEPTION 'CHILD_SESSION_PARENT_SCOPE_INVALID'; END IF;
    IF parent.work_item_id IS DISTINCT FROM NEW.work_item_id OR parent.project_id IS DISTINCT FROM NEW.project_id THEN RAISE EXCEPTION 'CHILD_SESSION_CONTAINER_MISMATCH'; END IF;
    SELECT count(*) INTO children FROM agent_sessions WHERE parent_session_id=NEW.parent_session_id AND id<>NEW.id;
    IF TG_OP='INSERT' OR NEW.parent_session_id IS DISTINCT FROM OLD.parent_session_id THEN children:=children+1; END IF;
    IF children>parent.max_child_sessions THEN RAISE EXCEPTION 'CHILD_SESSION_LIMIT_REACHED'; END IF;
  END IF;
  IF NEW.state='completed' AND (TG_OP='INSERT' OR OLD.state<>'completed') AND EXISTS (SELECT 1 FROM agent_sessions c WHERE c.parent_session_id=NEW.id AND c.required_for_parent AND c.state<>'completed') THEN RAISE EXCEPTION 'REQUIRED_CHILDREN_INCOMPLETE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_sessions_stage2_tree BEFORE INSERT OR UPDATE OF parent_session_id,team_id,work_item_id,project_id,state,max_child_sessions ON agent_sessions FOR EACH ROW EXECUTE FUNCTION enforce_stage2_session_tree();

ALTER TABLE agent_plan_steps ADD COLUMN parent_step_id uuid, ADD COLUMN required_for_parent boolean NOT NULL DEFAULT false,
  ADD COLUMN budget jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN max_child_sessions integer NOT NULL DEFAULT 8 CHECK(max_child_sessions>=0);
ALTER TABLE agent_plan_steps ADD CONSTRAINT agent_plan_steps_parent_fk FOREIGN KEY(plan_version_id,parent_step_id) REFERENCES agent_plan_steps(plan_version_id,id) ON DELETE RESTRICT;
CREATE TABLE agent_plan_step_identities (
  session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT, stable_step_id uuid NOT NULL,
  first_plan_version_id uuid NOT NULL REFERENCES agent_plan_versions(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id,stable_step_id)
);
INSERT INTO agent_plan_step_identities(session_id,stable_step_id,first_plan_version_id,created_at)
SELECT pv.session_id,ps.id,(array_agg(ps.plan_version_id ORDER BY ps.created_at,ps.plan_version_id))[1],min(ps.created_at) FROM agent_plan_steps ps JOIN agent_plan_versions pv ON pv.id=ps.plan_version_id GROUP BY pv.session_id,ps.id;
CREATE FUNCTION record_plan_step_identity() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE sid uuid; BEGIN
  SELECT session_id INTO sid FROM agent_plan_versions WHERE id=NEW.plan_version_id;
  INSERT INTO agent_plan_step_identities(session_id,stable_step_id,first_plan_version_id) VALUES(sid,NEW.id,NEW.plan_version_id) ON CONFLICT(session_id,stable_step_id) DO NOTHING; RETURN NEW;
END $$;
CREATE TRIGGER agent_plan_steps_record_identity AFTER INSERT ON agent_plan_steps FOR EACH ROW EXECUTE FUNCTION record_plan_step_identity();
CREATE TABLE session_budget_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,
  child_session_id uuid NOT NULL UNIQUE REFERENCES agent_sessions(id) ON DELETE RESTRICT, allocation jsonb NOT NULL, reserved jsonb NOT NULL,
  status budget_reservation_status NOT NULL DEFAULT 'reserved', created_at timestamptz NOT NULL DEFAULT now(), released_at timestamptz, reason text,
  CHECK((status='released') = (released_at IS NOT NULL))
);

CREATE TABLE work_room_channels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 subject_kind room_subject_kind NOT NULL, subject_id uuid NOT NULL, team_id uuid, work_item_id uuid, project_id uuid, session_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,subject_kind,subject_id),
 FOREIGN KEY(workspace_id,team_id) REFERENCES teams(workspace_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,session_id) REFERENCES agent_sessions(workspace_id,id) ON DELETE CASCADE,
 CHECK((subject_kind='work_item' AND work_item_id=subject_id AND project_id IS NULL AND session_id IS NULL) OR (subject_kind='project' AND project_id=subject_id AND work_item_id IS NULL AND session_id IS NULL) OR (subject_kind='session' AND session_id=subject_id AND work_item_id IS NULL AND project_id IS NULL))
);
CREATE FUNCTION enforce_room_subject() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE expected_team uuid; BEGIN
 IF NEW.subject_kind='work_item' THEN NEW.work_item_id:=NEW.subject_id; NEW.project_id:=NULL; NEW.session_id:=NULL; SELECT team_id INTO expected_team FROM work_items WHERE id=NEW.subject_id AND workspace_id=NEW.workspace_id;
 ELSIF NEW.subject_kind='project' THEN NEW.project_id:=NEW.subject_id; NEW.work_item_id:=NULL; NEW.session_id:=NULL; SELECT team_id INTO expected_team FROM projects WHERE id=NEW.subject_id AND workspace_id=NEW.workspace_id;
 ELSE NEW.session_id:=NEW.subject_id; NEW.work_item_id:=NULL; NEW.project_id:=NULL; SELECT team_id INTO expected_team FROM agent_sessions WHERE id=NEW.subject_id AND workspace_id=NEW.workspace_id; END IF;
 IF expected_team IS NULL THEN RAISE EXCEPTION 'WORK_ROOM_SUBJECT_NOT_FOUND'; END IF; IF NEW.team_id IS NULL THEN NEW.team_id:=expected_team; ELSIF NEW.team_id<>expected_team THEN RAISE EXCEPTION 'WORK_ROOM_TEAM_MISMATCH'; END IF; RETURN NEW; END $$;
CREATE TRIGGER work_room_channels_subject_guard BEFORE INSERT OR UPDATE ON work_room_channels FOR EACH ROW EXECUTE FUNCTION enforce_room_subject();
CREATE INDEX work_room_channels_subject ON work_room_channels(workspace_id,subject_kind,subject_id);
INSERT INTO work_room_channels(workspace_id,subject_kind,subject_id,team_id) SELECT workspace_id,'work_item',id,team_id FROM work_items ON CONFLICT DO NOTHING;
INSERT INTO work_room_channels(workspace_id,subject_kind,subject_id,team_id) SELECT workspace_id,'project',id,team_id FROM projects ON CONFLICT DO NOTHING;
INSERT INTO work_room_channels(workspace_id,subject_kind,subject_id,team_id) SELECT workspace_id,'session',id,team_id FROM agent_sessions WHERE team_id IS NOT NULL ON CONFLICT DO NOTHING;

CREATE TABLE room_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel_id uuid NOT NULL REFERENCES work_room_channels(id) ON DELETE CASCADE, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 author_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT, session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL, intent room_message_intent NOT NULL,
 recipient_actor_id uuid REFERENCES actors(id) ON DELETE SET NULL, reply_to_message_id uuid, thread_id uuid, body text NOT NULL, structured_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 requires_response boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), CHECK(length(body)<=50000),
 FOREIGN KEY(channel_id,reply_to_message_id) REFERENCES room_messages(channel_id,id) ON DELETE RESTRICT, FOREIGN KEY(channel_id,thread_id) REFERENCES room_messages(channel_id,id) ON DELETE RESTRICT,
 UNIQUE(channel_id,id)
);
CREATE TABLE room_message_recipients (message_id uuid NOT NULL REFERENCES room_messages(id) ON DELETE CASCADE, actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT, PRIMARY KEY(message_id,actor_id));
CREATE TABLE room_message_response_resolutions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL UNIQUE REFERENCES room_messages(id) ON DELETE RESTRICT, resolved_by_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT, resolution text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX room_messages_timeline ON room_messages(channel_id,created_at,id); CREATE INDEX room_messages_requires_response ON room_messages(channel_id,created_at) WHERE requires_response;

CREATE TABLE decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, work_item_id uuid, project_id uuid, session_id uuid,
 proposed_by_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT, finalized_by_actor_id uuid REFERENCES actors(id) ON DELETE RESTRICT,
 title text NOT NULL,rationale text NOT NULL,options jsonb NOT NULL DEFAULT '[]'::jsonb,selected_option text,evidence jsonb NOT NULL DEFAULT '[]'::jsonb,status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','final')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision=1),created_at timestamptz NOT NULL DEFAULT now(),finalized_at timestamptz,
 CHECK(num_nonnulls(work_item_id,project_id,session_id)=1), FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id), FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id), FOREIGN KEY(workspace_id,session_id) REFERENCES agent_sessions(workspace_id,id)
);
CREATE TABLE decision_affected_resources (decision_id uuid NOT NULL REFERENCES decisions(id) ON DELETE RESTRICT,resource_type text NOT NULL,resource_id uuid NOT NULL,impact text NOT NULL DEFAULT 'affected',PRIMARY KEY(decision_id,resource_type,resource_id));
CREATE TABLE decision_relations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),decision_id uuid NOT NULL REFERENCES decisions(id) ON DELETE RESTRICT,related_decision_id uuid NOT NULL REFERENCES decisions(id) ON DELETE RESTRICT,kind decision_relation_kind NOT NULL,created_by_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),CHECK(decision_id<>related_decision_id),UNIQUE(decision_id,related_decision_id,kind));
CREATE TABLE decision_transition_consumptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),target_decision_id uuid NOT NULL UNIQUE REFERENCES decisions(id) ON DELETE RESTRICT,transition_type text NOT NULL CHECK(transition_type IN ('finalize','supersede','reverse')),derived_decision_id uuid NOT NULL UNIQUE REFERENCES decisions(id) ON DELETE RESTRICT,consumed_by_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX decisions_subject ON decisions(workspace_id,work_item_id,project_id,session_id,created_at DESC); CREATE INDEX decision_relations_related ON decision_relations(related_decision_id);

CREATE TABLE plan_step_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),plan_version_id uuid NOT NULL,step_id uuid NOT NULL,author_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,body text NOT NULL,references_json jsonb NOT NULL DEFAULT '[]'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(plan_version_id,step_id) REFERENCES agent_plan_steps(plan_version_id,id) ON DELETE RESTRICT);
CREATE TABLE assignment_proposals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,plan_version_id uuid NOT NULL,plan_step_id uuid NOT NULL,proposed_by_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,agent_id uuid REFERENCES agent_definitions(id) ON DELETE RESTRICT,skill text,rationale text NOT NULL,status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','accepted','rejected')),created_at timestamptz NOT NULL DEFAULT now(),CHECK((agent_id IS NULL)<>(skill IS NULL)),FOREIGN KEY(plan_version_id,plan_step_id) REFERENCES agent_plan_steps(plan_version_id,id) ON DELETE RESTRICT);

CREATE TABLE leases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,holder_actor_id uuid,
 resource_type text NOT NULL CHECK(resource_type IN ('work_item','plan_step')),resource_id uuid NOT NULL,kind lease_kind NOT NULL,status lease_status NOT NULL DEFAULT 'active',reason text NOT NULL,
 expires_at timestamptz NOT NULL,heartbeat_at timestamptz NOT NULL DEFAULT now(),renew_count integer NOT NULL DEFAULT 0 CHECK(renew_count>=0),version integer NOT NULL DEFAULT 1 CHECK(version>0),released_at timestamptz,released_by_actor_id uuid,audit_reason text,revoked_at timestamptz,revoked_by_actor_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(expires_at>created_at),
 FOREIGN KEY(workspace_id,holder_actor_id) REFERENCES actors(workspace_id,id),FOREIGN KEY(workspace_id,released_by_actor_id) REFERENCES actors(workspace_id,id),FOREIGN KEY(workspace_id,revoked_by_actor_id) REFERENCES actors(workspace_id,id)
);
CREATE FUNCTION enforce_lease_holder() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE a uuid; BEGIN SELECT agent_actor_id INTO a FROM agent_sessions WHERE id=NEW.session_id AND workspace_id=NEW.workspace_id; IF a IS NULL THEN RAISE EXCEPTION 'LEASE_SESSION_SCOPE_INVALID'; END IF; IF NEW.holder_actor_id IS NULL THEN NEW.holder_actor_id:=a; ELSIF NEW.holder_actor_id<>a THEN RAISE EXCEPTION 'LEASE_HOLDER_MISMATCH'; END IF; RETURN NEW; END $$;
CREATE TRIGGER leases_holder_guard BEFORE INSERT OR UPDATE OF session_id,workspace_id,holder_actor_id ON leases FOR EACH ROW EXECUTE FUNCTION enforce_lease_holder();
CREATE UNIQUE INDEX leases_active_exclusive_resource ON leases(workspace_id,resource_type,resource_id) WHERE status='active' AND kind='exclusive'; CREATE INDEX leases_expiry ON leases(expires_at) WHERE status='active'; CREATE INDEX leases_session_active ON leases(session_id) WHERE status='active';

CREATE TABLE handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,from_session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,target_agent_id uuid REFERENCES agent_definitions(id) ON DELETE RESTRICT,target_skill text,
 scope_type delegation_scope_type,scope_id uuid,summary text NOT NULL,completed_work jsonb NOT NULL DEFAULT '[]'::jsonb,remaining_work jsonb NOT NULL DEFAULT '[]'::jsonb,context_snapshot_id uuid REFERENCES context_snapshots(id) ON DELETE RESTRICT,artifact_ids uuid[] NOT NULL DEFAULT '{}',open_questions jsonb NOT NULL DEFAULT '[]'::jsonb,risks jsonb NOT NULL DEFAULT '[]'::jsonb,acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,requested_action text,lease_transfer_policy text NOT NULL DEFAULT 'retain' CHECK(lease_transfer_policy IN ('retain','transfer','release')),
 requested_capabilities text[] NOT NULL DEFAULT '{}',status handoff_status NOT NULL DEFAULT 'draft',accepted_session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL,resolved_agent_id uuid REFERENCES agent_definitions(id) ON DELETE SET NULL,resolved_delegation_id uuid REFERENCES delegations(id) ON DELETE SET NULL,rejected_by_actor_id uuid REFERENCES actors(id) ON DELETE SET NULL,machine_reject_reason text,routing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),requested_at timestamptz,decided_at timestamptz,completed_at timestamptz,CHECK((target_agent_id IS NULL)<>(target_skill IS NULL))
);
CREATE INDEX handoffs_pending ON handoffs(workspace_id,status,created_at DESC) WHERE status IN ('draft','requested');
CREATE TABLE routing_records (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,source_session_id uuid REFERENCES agent_sessions(id) ON DELETE SET NULL,target_agent_id uuid NOT NULL REFERENCES agent_definitions(id) ON DELETE RESTRICT,requested_skill text,required_capabilities text[] NOT NULL DEFAULT '{}',outcome routing_outcome NOT NULL DEFAULT 'selected',sort_rank integer,rationale jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX routing_records_source ON routing_records(source_session_id,created_at);
CREATE TABLE routing_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,handoff_id uuid NOT NULL REFERENCES handoffs(id) ON DELETE CASCADE,source_session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE RESTRICT,attempt_key text NOT NULL,requested_skill text,required_capabilities text[] NOT NULL DEFAULT '{}',candidate_count integer NOT NULL CHECK(candidate_count>=0),selected_agent_id uuid REFERENCES agent_definitions(id) ON DELETE SET NULL,outcome text NOT NULL CHECK(outcome IN ('selected','no_candidate','rejected')),failure_code text,rationale jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,handoff_id,attempt_key));
CREATE INDEX routing_attempts_handoff ON routing_attempts(handoff_id,created_at);
ALTER TABLE context_snapshots ADD COLUMN parent_snapshot_id uuid REFERENCES context_snapshots(id) ON DELETE RESTRICT,ADD COLUMN snapshot_kind text NOT NULL DEFAULT 'materialized' CHECK(snapshot_kind IN ('materialized','handoff','delta')),ADD COLUMN history_link jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE context_deltas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,base_snapshot_id uuid NOT NULL REFERENCES context_snapshots(id) ON DELETE RESTRICT,source_snapshot_id uuid REFERENCES context_snapshots(id) ON DELETE RESTRICT,additions jsonb NOT NULL,content_hash text NOT NULL,rationale text NOT NULL,history_link jsonb NOT NULL DEFAULT '{}'::jsonb,created_by_actor_id uuid NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(session_id,content_hash));

CREATE FUNCTION prevent_stage2_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_STAGE2_FACT'; END $$;
CREATE TRIGGER room_messages_immutable BEFORE UPDATE OR DELETE ON room_messages FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();
CREATE TRIGGER room_message_recipients_immutable BEFORE UPDATE OR DELETE ON room_message_recipients FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();
CREATE TRIGGER room_message_resolutions_immutable BEFORE UPDATE OR DELETE ON room_message_response_resolutions FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();
CREATE TRIGGER decisions_immutable BEFORE UPDATE OR DELETE ON decisions FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();
CREATE TRIGGER decision_resources_immutable BEFORE UPDATE OR DELETE ON decision_affected_resources FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();
CREATE TRIGGER decision_relations_immutable BEFORE UPDATE OR DELETE ON decision_relations FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();
CREATE TRIGGER decision_transition_consumptions_immutable BEFORE UPDATE OR DELETE ON decision_transition_consumptions FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();
CREATE TRIGGER plan_step_comments_immutable BEFORE UPDATE OR DELETE ON plan_step_comments FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();
CREATE TRIGGER assignment_proposals_immutable BEFORE UPDATE OR DELETE ON assignment_proposals FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();
CREATE TRIGGER routing_records_immutable BEFORE UPDATE OR DELETE ON routing_records FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();
CREATE TRIGGER routing_attempts_immutable BEFORE UPDATE OR DELETE ON routing_attempts FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();
CREATE TRIGGER context_deltas_immutable BEFORE UPDATE OR DELETE ON context_deltas FOR EACH ROW EXECUTE FUNCTION prevent_stage2_fact_mutation();

COMMIT;
