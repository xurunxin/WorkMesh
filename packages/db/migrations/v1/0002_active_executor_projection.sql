CREATE TYPE work_item_executor_role AS ENUM ('primary','reviewer');

CREATE TABLE work_item_executor_projections (
  workspace_id uuid NOT NULL,
  work_item_id uuid NOT NULL,
  projection_role work_item_executor_role NOT NULL,
  agent_id uuid NOT NULL,
  agent_actor_id uuid NOT NULL,
  session_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  lease_kind lease_kind NOT NULL,
  resource_type text NOT NULL CHECK(resource_type IN ('work_item','plan_step')),
  resource_id uuid NOT NULL,
  execution_state agent_session_state NOT NULL,
  heartbeat_health text NOT NULL CHECK(heartbeat_health IN ('healthy','degraded','stale')),
  last_heartbeat_at timestamptz,
  lease_heartbeat_at timestamptz NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  projected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,work_item_id,lease_id),
  UNIQUE(lease_id),
  FOREIGN KEY(workspace_id,work_item_id) REFERENCES work_items(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,session_id) REFERENCES agent_sessions(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,agent_id) REFERENCES agent_definitions(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,agent_actor_id) REFERENCES actors(workspace_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(lease_id) REFERENCES leases(id) ON DELETE CASCADE,
  CHECK(
    (projection_role='primary' AND lease_kind='exclusive')
    OR (projection_role='reviewer' AND lease_kind='review_shared')
  )
);
CREATE UNIQUE INDEX work_item_executor_one_primary
  ON work_item_executor_projections(workspace_id,work_item_id)
  WHERE projection_role='primary';
CREATE INDEX work_item_executor_session
  ON work_item_executor_projections(workspace_id,session_id);
CREATE INDEX work_item_executor_expiry
  ON work_item_executor_projections(lease_expires_at,workspace_id,work_item_id);

CREATE FUNCTION refresh_work_item_executor_projection(
  target_workspace_id uuid,
  target_work_item_id uuid
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  exclusive_session_count integer;
BEGIN
  IF target_workspace_id IS NULL OR target_work_item_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    target_workspace_id::text || ':work-item-executor:' || target_work_item_id::text,
    0
  ));

  DELETE FROM work_item_executor_projections
   WHERE workspace_id=target_workspace_id
     AND work_item_id=target_work_item_id;

  IF NOT EXISTS (
    SELECT 1 FROM work_items
     WHERE workspace_id=target_workspace_id
       AND id=target_work_item_id
       AND deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  SELECT count(DISTINCT lease.session_id)::integer
    INTO exclusive_session_count
    FROM leases lease
    JOIN agent_sessions session
      ON session.id=lease.session_id
     AND session.workspace_id=lease.workspace_id
    JOIN delegations delegation
      ON delegation.id=session.delegation_id
     AND delegation.workspace_id=session.workspace_id
   WHERE lease.workspace_id=target_workspace_id
     AND session.work_item_id=target_work_item_id
     AND lease.kind='exclusive'
     AND lease.resource_type='work_item'
     AND lease.resource_id=target_work_item_id
     AND lease.status='active'
     AND lease.expires_at>now()
     AND session.state NOT IN ('stale','completed','failed','canceled')
     AND delegation.status='active';

  IF exclusive_session_count>1 THEN
    RAISE EXCEPTION USING
      ERRCODE='23505',
      MESSAGE='WORK_ITEM_ACTIVE_EXECUTOR_CONFLICT',
      DETAIL='Only one active Work Item-level exclusive executor Session is allowed per Work Item.';
  END IF;

  INSERT INTO work_item_executor_projections(
    workspace_id,work_item_id,projection_role,agent_id,agent_actor_id,
    session_id,lease_id,lease_kind,resource_type,resource_id,execution_state,
    heartbeat_health,last_heartbeat_at,lease_heartbeat_at,lease_expires_at
  )
  SELECT lease.workspace_id,session.work_item_id,'primary',session.agent_id,
         session.agent_actor_id,session.id,lease.id,lease.kind,
         lease.resource_type,lease.resource_id,session.state,
         session.heartbeat_health,session.last_heartbeat_at,lease.heartbeat_at,
         lease.expires_at
    FROM leases lease
    JOIN agent_sessions session
      ON session.id=lease.session_id
     AND session.workspace_id=lease.workspace_id
    JOIN delegations delegation
      ON delegation.id=session.delegation_id
     AND delegation.workspace_id=session.workspace_id
   WHERE lease.workspace_id=target_workspace_id
     AND session.work_item_id=target_work_item_id
     AND lease.kind='exclusive'
     AND lease.status='active'
     AND lease.expires_at>now()
     AND session.state NOT IN ('stale','completed','failed','canceled')
     AND delegation.status='active'
   ORDER BY (lease.resource_type='work_item') DESC,lease.created_at,lease.id
   LIMIT 1;

  INSERT INTO work_item_executor_projections(
    workspace_id,work_item_id,projection_role,agent_id,agent_actor_id,
    session_id,lease_id,lease_kind,resource_type,resource_id,execution_state,
    heartbeat_health,last_heartbeat_at,lease_heartbeat_at,lease_expires_at
  )
  SELECT lease.workspace_id,session.work_item_id,'reviewer',session.agent_id,
         session.agent_actor_id,session.id,lease.id,lease.kind,
         lease.resource_type,lease.resource_id,session.state,
         session.heartbeat_health,session.last_heartbeat_at,lease.heartbeat_at,
         lease.expires_at
    FROM leases lease
    JOIN agent_sessions session
      ON session.id=lease.session_id
     AND session.workspace_id=lease.workspace_id
    JOIN delegations delegation
      ON delegation.id=session.delegation_id
     AND delegation.workspace_id=session.workspace_id
   WHERE lease.workspace_id=target_workspace_id
     AND session.work_item_id=target_work_item_id
     AND lease.kind='review_shared'
     AND lease.status='active'
     AND lease.expires_at>now()
     AND session.state NOT IN ('stale','completed','failed','canceled')
     AND delegation.status='active'
   ORDER BY lease.created_at,lease.id;
END;
$$;

CREATE FUNCTION project_executor_after_lease_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_work_item_id uuid;
  new_work_item_id uuid;
  old_workspace_id uuid;
  new_workspace_id uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN
    old_workspace_id:=OLD.workspace_id;
    SELECT work_item_id INTO old_work_item_id
      FROM agent_sessions
     WHERE id=OLD.session_id AND workspace_id=OLD.workspace_id;
    PERFORM refresh_work_item_executor_projection(old_workspace_id,old_work_item_id);
  END IF;
  IF TG_OP<>'DELETE' THEN
    new_workspace_id:=NEW.workspace_id;
    SELECT work_item_id INTO new_work_item_id
      FROM agent_sessions
     WHERE id=NEW.session_id AND workspace_id=NEW.workspace_id;
    IF old_workspace_id IS DISTINCT FROM new_workspace_id
       OR old_work_item_id IS DISTINCT FROM new_work_item_id THEN
      PERFORM refresh_work_item_executor_projection(new_workspace_id,new_work_item_id);
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leases_refresh_executor_projection_insert_delete
  AFTER INSERT OR DELETE ON leases
  FOR EACH ROW EXECUTE FUNCTION project_executor_after_lease_change();
CREATE TRIGGER leases_refresh_executor_projection_update
  AFTER UPDATE OF workspace_id,session_id,kind,status,expires_at,heartbeat_at,
                  resource_type,resource_id ON leases
  FOR EACH ROW EXECUTE FUNCTION project_executor_after_lease_change();

CREATE FUNCTION project_executor_after_session_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM refresh_work_item_executor_projection(OLD.workspace_id,OLD.work_item_id);
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    PERFORM refresh_work_item_executor_projection(NEW.workspace_id,NEW.work_item_id);
    RETURN NEW;
  END IF;
  IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
     OR OLD.work_item_id IS DISTINCT FROM NEW.work_item_id THEN
    PERFORM refresh_work_item_executor_projection(OLD.workspace_id,OLD.work_item_id);
  END IF;
  IF TG_OP='UPDATE' THEN
    PERFORM refresh_work_item_executor_projection(NEW.workspace_id,NEW.work_item_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_sessions_refresh_executor_projection_insert_delete
  AFTER INSERT OR DELETE ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION project_executor_after_session_change();
CREATE TRIGGER agent_sessions_refresh_executor_projection_update
  AFTER UPDATE OF workspace_id,work_item_id,agent_id,agent_actor_id,state,
                  heartbeat_health,last_heartbeat_at ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION project_executor_after_session_change();

CREATE FUNCTION project_executor_after_delegation_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT DISTINCT session.workspace_id,session.work_item_id
      FROM agent_sessions session
     WHERE session.delegation_id IN (OLD.id,NEW.id)
       AND session.work_item_id IS NOT NULL
  LOOP
    PERFORM refresh_work_item_executor_projection(target.workspace_id,target.work_item_id);
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER delegations_refresh_executor_projection
  AFTER UPDATE OF status ON delegations
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION project_executor_after_delegation_change();

CREATE FUNCTION project_executor_after_work_item_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM refresh_work_item_executor_projection(OLD.workspace_id,OLD.id);
  IF TG_OP='DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER work_items_refresh_executor_projection_delete
  AFTER DELETE ON work_items
  FOR EACH ROW EXECUTE FUNCTION project_executor_after_work_item_change();
CREATE TRIGGER work_items_refresh_executor_projection_soft_delete
  AFTER UPDATE OF deleted_at ON work_items
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION project_executor_after_work_item_change();

CREATE FUNCTION rebuild_work_item_executor_projections(
  target_workspace_id uuid DEFAULT NULL,
  target_work_item_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  target record;
  rebuilt integer:=0;
BEGIN
  FOR target IN
    SELECT workspace_id,id
      FROM work_items
     WHERE (target_workspace_id IS NULL OR workspace_id=target_workspace_id)
       AND (target_work_item_id IS NULL OR id=target_work_item_id)
     ORDER BY workspace_id,id
  LOOP
    PERFORM refresh_work_item_executor_projection(target.workspace_id,target.id);
    rebuilt:=rebuilt+1;
  END LOOP;

  DELETE FROM work_item_executor_projections projection
   WHERE (target_workspace_id IS NULL OR projection.workspace_id=target_workspace_id)
     AND (target_work_item_id IS NULL OR projection.work_item_id=target_work_item_id)
     AND NOT EXISTS (
       SELECT 1 FROM work_items item
        WHERE item.workspace_id=projection.workspace_id
          AND item.id=projection.work_item_id
     );
  RETURN rebuilt;
END;
$$;

SELECT rebuild_work_item_executor_projections();
