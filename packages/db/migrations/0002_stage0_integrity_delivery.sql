BEGIN;

CREATE TYPE workspace_role AS ENUM ('admin', 'member');

ALTER TABLE actors ADD COLUMN workspace_role workspace_role;
UPDATE actors
SET workspace_role = CASE
  WHEN kind = 'human' AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.actor_id = actors.id AND m.role = 'admin'
  ) THEN 'admin'::workspace_role
  WHEN kind = 'human' THEN 'member'::workspace_role
  ELSE NULL
END;
ALTER TABLE actors
  ADD CONSTRAINT actors_workspace_role_by_kind CHECK (
    (kind = 'human' AND workspace_role IS NOT NULL)
    OR (kind <> 'human' AND workspace_role IS NULL)
  ),
  ADD CONSTRAINT actors_workspace_id_id_key UNIQUE (workspace_id, id);

ALTER TABLE teams ADD CONSTRAINT teams_workspace_id_id_key UNIQUE (workspace_id, id);
ALTER TABLE workflow_states ADD COLUMN workspace_id uuid;
UPDATE workflow_states s SET workspace_id = t.workspace_id FROM teams t WHERE t.id = s.team_id;
ALTER TABLE workflow_states
  ALTER COLUMN workspace_id SET NOT NULL,
  ADD CONSTRAINT workflow_states_workspace_id_team_id_id_key UNIQUE (workspace_id, team_id, id),
  ADD CONSTRAINT workflow_states_workspace_team_fk FOREIGN KEY (workspace_id, team_id)
    REFERENCES teams(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE projects
  ADD CONSTRAINT projects_workspace_id_id_key UNIQUE (workspace_id, id),
  ADD CONSTRAINT projects_workspace_id_team_id_id_key UNIQUE (workspace_id, team_id, id),
  ADD CONSTRAINT projects_workspace_team_fk FOREIGN KEY (workspace_id, team_id)
    REFERENCES teams(workspace_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT projects_workspace_lead_fk FOREIGN KEY (workspace_id, lead_actor_id)
    REFERENCES actors(workspace_id, id) ON DELETE SET NULL;

ALTER TABLE work_items
  ADD CONSTRAINT work_items_workspace_id_id_key UNIQUE (workspace_id, id),
  ADD CONSTRAINT work_items_workspace_team_fk FOREIGN KEY (workspace_id, team_id)
    REFERENCES teams(workspace_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT work_items_workspace_team_status_fk FOREIGN KEY (workspace_id, team_id, status_id)
    REFERENCES workflow_states(workspace_id, team_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT work_items_workspace_responsible_human_fk FOREIGN KEY (workspace_id, responsible_human_actor_id)
    REFERENCES actors(workspace_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT work_items_workspace_team_project_fk FOREIGN KEY (workspace_id, team_id, project_id)
    REFERENCES projects(workspace_id, team_id, id) ON DELETE SET NULL (project_id);

ALTER TABLE memberships
  ADD CONSTRAINT memberships_workspace_team_fk FOREIGN KEY (workspace_id, team_id)
    REFERENCES teams(workspace_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT memberships_workspace_actor_fk FOREIGN KEY (workspace_id, actor_id)
    REFERENCES actors(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE channels
  ADD CONSTRAINT channels_workspace_id_id_key UNIQUE (workspace_id, id),
  ADD CONSTRAINT channels_workspace_work_item_fk FOREIGN KEY (workspace_id, work_item_id)
    REFERENCES work_items(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE comments ADD COLUMN workspace_id uuid;
UPDATE comments c SET workspace_id = ch.workspace_id FROM channels ch WHERE ch.id = c.channel_id;
UPDATE comments c
SET parent_comment_id = NULL
WHERE parent_comment_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM comments parent
  WHERE parent.id = c.parent_comment_id AND parent.channel_id = c.channel_id
);
UPDATE comments c
SET reply_to_comment_id = NULL
WHERE reply_to_comment_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM comments reply
  WHERE reply.id = c.reply_to_comment_id AND reply.channel_id = c.channel_id
);
ALTER TABLE comments
  ALTER COLUMN workspace_id SET NOT NULL,
  ADD CONSTRAINT comments_workspace_id_id_key UNIQUE (workspace_id, id),
  ADD CONSTRAINT comments_channel_id_id_key UNIQUE (channel_id, id),
  ADD CONSTRAINT comments_workspace_channel_fk FOREIGN KEY (workspace_id, channel_id)
    REFERENCES channels(workspace_id, id) ON DELETE CASCADE,
  ADD CONSTRAINT comments_workspace_author_fk FOREIGN KEY (workspace_id, author_actor_id)
    REFERENCES actors(workspace_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT comments_same_channel_parent_fk FOREIGN KEY (channel_id, parent_comment_id)
    REFERENCES comments(channel_id, id) ON DELETE SET NULL (parent_comment_id),
  ADD CONSTRAINT comments_same_channel_reply_fk FOREIGN KEY (channel_id, reply_to_comment_id)
    REFERENCES comments(channel_id, id) ON DELETE SET NULL (reply_to_comment_id);

CREATE TABLE comment_mentions (
  workspace_id uuid NOT NULL,
  comment_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, actor_id),
  FOREIGN KEY (workspace_id, comment_id) REFERENCES comments(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, actor_id) REFERENCES actors(workspace_id, id) ON DELETE CASCADE
);
INSERT INTO comment_mentions(workspace_id, comment_id, actor_id)
SELECT c.workspace_id, c.id, mentioned.actor_id
FROM comments c
CROSS JOIN LATERAL unnest(c.mentions) AS mentioned(actor_id)
JOIN actors a ON a.id = mentioned.actor_id AND a.workspace_id = c.workspace_id AND a.kind = 'human'
ON CONFLICT DO NOTHING;
ALTER TABLE comments DROP COLUMN mentions;

CREATE FUNCTION enforce_human_comment_mention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM actors
    WHERE id = NEW.actor_id AND workspace_id = NEW.workspace_id AND kind = 'human'
  ) THEN
    RAISE EXCEPTION 'COMMENT_MENTION_REQUIRES_HUMAN_ACTOR';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER comment_mentions_require_human
  BEFORE INSERT OR UPDATE OF workspace_id, actor_id ON comment_mentions
  FOR EACH ROW EXECUTE FUNCTION enforce_human_comment_mention();

ALTER TABLE saved_views
  ADD CONSTRAINT saved_views_workspace_owner_fk FOREIGN KEY (workspace_id, owner_actor_id)
    REFERENCES actors(workspace_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT saved_views_workspace_team_fk FOREIGN KEY (workspace_id, team_id)
    REFERENCES teams(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE api_idempotency_keys ADD COLUMN operation text NOT NULL DEFAULT 'unknown';
ALTER TABLE api_idempotency_keys
  ADD CONSTRAINT api_idempotency_workspace_actor_fk FOREIGN KEY (workspace_id, actor_id)
    REFERENCES actors(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE domain_events
  ADD COLUMN team_id uuid,
  ADD COLUMN audience_actor_id uuid,
  ADD CONSTRAINT domain_events_workspace_actor_fk FOREIGN KEY (workspace_id, actor_id)
    REFERENCES actors(workspace_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT domain_events_workspace_team_fk FOREIGN KEY (workspace_id, team_id)
    REFERENCES teams(workspace_id, id) ON DELETE SET NULL,
  ADD CONSTRAINT domain_events_workspace_audience_fk FOREIGN KEY (workspace_id, audience_actor_id)
    REFERENCES actors(workspace_id, id) ON DELETE SET NULL;
CREATE INDEX domain_events_workspace_team_cursor ON domain_events(workspace_id, team_id, cursor) WHERE team_id IS NOT NULL;
CREATE INDEX domain_events_workspace_audience_cursor ON domain_events(workspace_id, audience_actor_id, cursor) WHERE audience_actor_id IS NOT NULL;

UPDATE outbox_events
SET attempt_count = 8, status = 'dead'
WHERE attempt_count > 8;
ALTER TABLE outbox_events ADD CONSTRAINT outbox_events_attempt_count_range CHECK (attempt_count BETWEEN 0 AND 8);
DROP INDEX outbox_claim;
CREATE INDEX outbox_claim ON outbox_events(available_at, created_at)
  WHERE status IN ('pending', 'delivering') AND attempt_count < 8;

CREATE TABLE platform_installation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE RESTRICT,
  system_actor_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, system_actor_id) REFERENCES actors(workspace_id, id) ON DELETE RESTRICT
);

CREATE FUNCTION enforce_platform_system_actor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM actors
    WHERE id = NEW.system_actor_id AND workspace_id = NEW.workspace_id AND kind = 'service'
  ) THEN
    RAISE EXCEPTION 'PLATFORM_SYSTEM_ACTOR_REQUIRES_SERVICE_ACTOR';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER platform_installation_requires_service_actor
  BEFORE INSERT OR UPDATE OF workspace_id, system_actor_id ON platform_installation
  FOR EACH ROW EXECUTE FUNCTION enforce_platform_system_actor();

DO $$
DECLARE
  existing_workspace_id uuid;
  existing_system_actor_id uuid;
BEGIN
  SELECT id INTO existing_workspace_id FROM workspaces ORDER BY created_at, id LIMIT 1;
  IF existing_workspace_id IS NOT NULL THEN
    SELECT id INTO existing_system_actor_id
    FROM actors
    WHERE workspace_id = existing_workspace_id AND kind = 'service'
    ORDER BY created_at, id
    LIMIT 1;
    IF existing_system_actor_id IS NULL THEN
      INSERT INTO actors(workspace_id, kind, display_name)
      VALUES(existing_workspace_id, 'service', 'WorkMesh System')
      RETURNING id INTO existing_system_actor_id;
    END IF;
    INSERT INTO platform_installation(singleton, workspace_id, system_actor_id)
    VALUES(true, existing_workspace_id, existing_system_actor_id)
    ON CONFLICT (singleton) DO NOTHING;
  END IF;
END;
$$;

COMMIT;
