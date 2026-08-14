BEGIN;

ALTER TABLE domain_events
  ADD CONSTRAINT domain_events_id_workspace_unique UNIQUE (id, workspace_id);

CREATE TABLE domain_event_resources (
  domain_event_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  relation text NOT NULL CHECK (relation IN ('scope', 'invalidate')),
  resource_type text NOT NULL CHECK (
    resource_type IN (
      'workspace',
      'team',
      'project',
      'work_item',
      'session',
      'room',
      'artifact',
      'delivery'
    )
  ),
  resource_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (domain_event_id, relation, resource_type, resource_id),
  FOREIGN KEY (domain_event_id, workspace_id)
    REFERENCES domain_events(id, workspace_id)
    ON DELETE CASCADE
);

CREATE INDEX domain_event_resources_lookup
  ON domain_event_resources(workspace_id, resource_type, resource_id, domain_event_id);

CREATE TABLE event_retention_state (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  pruned_through_cursor bigint NOT NULL DEFAULT 0 CHECK (pruned_through_cursor >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO event_retention_state(workspace_id)
SELECT id FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;

-- Reconstruct private audiences only from durable owner/recipient relations.
-- Missing legacy rows remain unresolved and are denied by the read policy.
UPDATE domain_events event
SET audience_actor_id=credential.actor_id
FROM sessions credential
JOIN actors actor ON actor.id=credential.actor_id
WHERE event.aggregate_type='session'
  AND credential.id=event.aggregate_id
  AND actor.workspace_id=event.workspace_id;

UPDATE domain_events event
SET audience_actor_id=view.owner_actor_id
FROM saved_views view
WHERE event.aggregate_type='saved_view'
  AND view.id=event.aggregate_id
  AND view.workspace_id=event.workspace_id;

UPDATE domain_events event
SET audience_actor_id=notification.recipient_actor_id
FROM notifications notification
WHERE event.aggregate_type='notification'
  AND notification.id=event.aggregate_id
  AND notification.workspace_id=event.workspace_id;

UPDATE domain_events event
SET audience_actor_id=view.owner_actor_id
FROM advanced_saved_views view
WHERE event.aggregate_type='advanced_saved_view'
  AND view.id=event.aggregate_id
  AND view.workspace_id=event.workspace_id
  AND view.scope='private';

UPDATE domain_events event
SET audience_actor_id=preference.actor_id
FROM notification_preferences preference
WHERE event.event_type='notification.preferences_updated'
  AND event.aggregate_type='actor'
  AND preference.actor_id=event.aggregate_id
  AND preference.workspace_id=event.workspace_id;

INSERT INTO domain_event_resources(
  domain_event_id,
  workspace_id,
  relation,
  resource_type,
  resource_id
)
SELECT id, workspace_id, 'scope', 'workspace', workspace_id
FROM domain_events
WHERE NOT (
  audience_actor_id IS NULL
  AND (
    aggregate_type IN ('session','saved_view','notification')
    OR event_type='notification.preferences_updated'
    OR (
      aggregate_type='advanced_saved_view'
      AND NOT EXISTS (
        SELECT 1
        FROM advanced_saved_views view
        WHERE view.id=domain_events.aggregate_id
          AND view.workspace_id=domain_events.workspace_id
          AND view.scope<>'private'
      )
    )
  )
)
ON CONFLICT DO NOTHING;

INSERT INTO domain_event_resources(
  domain_event_id,
  workspace_id,
  relation,
  resource_type,
  resource_id
)
SELECT id, workspace_id, 'scope', 'team', team_id
FROM domain_events
WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO domain_event_resources(
  domain_event_id,
  workspace_id,
  relation,
  resource_type,
  resource_id
)
SELECT
  id,
  workspace_id,
  'invalidate',
  CASE aggregate_type
    WHEN 'workspace' THEN 'workspace'
    WHEN 'team' THEN 'team'
    WHEN 'project' THEN 'project'
    WHEN 'work_item' THEN 'work_item'
    WHEN 'agent_session' THEN 'session'
    WHEN 'session' THEN 'session'
    WHEN 'work_room' THEN 'room'
    WHEN 'room' THEN 'room'
    WHEN 'artifact' THEN 'artifact'
    WHEN 'delivery' THEN 'delivery'
    WHEN 'webhook_delivery' THEN 'delivery'
    ELSE NULL
  END,
  aggregate_id
FROM domain_events
WHERE aggregate_type IN (
  'workspace',
  'team',
  'project',
  'work_item',
  'agent_session',
  'session',
  'work_room',
  'room',
  'artifact',
  'delivery',
  'webhook_delivery'
)
ON CONFLICT DO NOTHING;

-- Backfill only relations that can be proven from durable foreign-key-backed
-- state. Legacy payload hints are intentionally not trusted.
INSERT INTO domain_event_resources(
  domain_event_id,
  workspace_id,
  relation,
  resource_type,
  resource_id
)
SELECT
  event.id,
  event.workspace_id,
  relation.name,
  'work_item',
  channel.work_item_id
FROM domain_events event
JOIN comments comment
  ON event.aggregate_type='comment'
 AND comment.id=event.aggregate_id
 AND comment.workspace_id=event.workspace_id
JOIN channels channel
  ON channel.id=comment.channel_id
 AND channel.workspace_id=event.workspace_id
CROSS JOIN (VALUES ('scope'),('invalidate')) relation(name)
ON CONFLICT DO NOTHING;

INSERT INTO domain_event_resources(
  domain_event_id,
  workspace_id,
  relation,
  resource_type,
  resource_id
)
SELECT
  event.id,
  event.workspace_id,
  relation.name,
  'project',
  item.project_id
FROM domain_events event
JOIN comments comment
  ON event.aggregate_type='comment'
 AND comment.id=event.aggregate_id
 AND comment.workspace_id=event.workspace_id
JOIN channels channel
  ON channel.id=comment.channel_id
 AND channel.workspace_id=event.workspace_id
JOIN work_items item
  ON item.id=channel.work_item_id
 AND item.workspace_id=event.workspace_id
CROSS JOIN (VALUES ('scope'),('invalidate')) relation(name)
WHERE item.project_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO domain_event_resources(
  domain_event_id,
  workspace_id,
  relation,
  resource_type,
  resource_id
)
SELECT
  event.id,
  event.workspace_id,
  'invalidate',
  'team',
  state.team_id
FROM domain_events event
JOIN workflow_states state
  ON event.aggregate_type='workflow_state'
 AND state.id=event.aggregate_id
 AND state.workspace_id=event.workspace_id
ON CONFLICT DO NOTHING;

INSERT INTO domain_event_resources(
  domain_event_id,
  workspace_id,
  relation,
  resource_type,
  resource_id
)
SELECT
  event.id,
  event.workspace_id,
  'invalidate',
  'team',
  access.team_id
FROM domain_events event
JOIN agent_team_access access
  ON event.aggregate_type='agent_team_access'
 AND access.agent_id=event.aggregate_id
 AND access.workspace_id=event.workspace_id
 AND access.team_id=event.team_id
ON CONFLICT DO NOTHING;

INSERT INTO domain_event_resources(
  domain_event_id,
  workspace_id,
  relation,
  resource_type,
  resource_id
)
SELECT
  event.id,
  event.workspace_id,
  relation.name,
  'session',
  session.id
FROM domain_events event
JOIN agent_sessions session
  ON session.id=COALESCE(
       event.session_id,
       CASE
         WHEN event.aggregate_type='agent_session' THEN event.aggregate_id
         ELSE NULL
       END
     )
 AND session.workspace_id=event.workspace_id
CROSS JOIN (VALUES ('scope'),('invalidate')) relation(name)
ON CONFLICT DO NOTHING;

INSERT INTO domain_event_resources(
  domain_event_id,
  workspace_id,
  relation,
  resource_type,
  resource_id
)
SELECT
  event.id,
  event.workspace_id,
  relation.name,
  'work_item',
  session.work_item_id
FROM domain_events event
JOIN agent_sessions session
  ON session.id=COALESCE(
       event.session_id,
       CASE
         WHEN event.aggregate_type='agent_session' THEN event.aggregate_id
         ELSE NULL
       END
     )
 AND session.workspace_id=event.workspace_id
CROSS JOIN (VALUES ('scope'),('invalidate')) relation(name)
WHERE session.work_item_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO domain_event_resources(
  domain_event_id,
  workspace_id,
  relation,
  resource_type,
  resource_id
)
SELECT
  event.id,
  event.workspace_id,
  relation.name,
  'project',
  COALESCE(session.project_id,item.project_id)
FROM domain_events event
JOIN agent_sessions session
  ON session.id=COALESCE(
       event.session_id,
       CASE
         WHEN event.aggregate_type='agent_session' THEN event.aggregate_id
         ELSE NULL
       END
     )
 AND session.workspace_id=event.workspace_id
LEFT JOIN work_items item
  ON item.id=session.work_item_id
 AND item.workspace_id=event.workspace_id
CROSS JOIN (VALUES ('scope'),('invalidate')) relation(name)
WHERE COALESCE(session.project_id,item.project_id) IS NOT NULL
ON CONFLICT DO NOTHING;

-- Initiatives may span Teams. Preserve each durable linked Project and Team
-- independently; leaving team_id NULL must never imply Workspace visibility.
INSERT INTO domain_event_resources(
  domain_event_id,
  workspace_id,
  relation,
  resource_type,
  resource_id
)
SELECT
  event.id,
  event.workspace_id,
  relation.name,
  resource.resource_type,
  resource.resource_id
FROM domain_events event
JOIN initiative_projects link
  ON event.aggregate_type='initiative'
 AND link.initiative_id=event.aggregate_id
 AND link.workspace_id=event.workspace_id
JOIN projects project
  ON project.id=link.project_id
 AND project.workspace_id=event.workspace_id
CROSS JOIN (VALUES ('scope'),('invalidate')) relation(name)
CROSS JOIN LATERAL (
  VALUES
    ('project',project.id),
    ('team',project.team_id)
) resource(resource_type,resource_id)
ON CONFLICT DO NOTHING;

-- Only backfill dependency audiences when the payload is corroborated by the
-- durable edge. Deleted or otherwise unresolvable legacy edges remain
-- fail-closed for non-admin humans in the final audience query.
INSERT INTO domain_event_resources(
  domain_event_id,
  workspace_id,
  relation,
  resource_type,
  resource_id
)
SELECT
  event.id,
  event.workspace_id,
  relation.name,
  resource.resource_type,
  resource.resource_id
FROM domain_events event
JOIN projects source
  ON source.id=event.aggregate_id
 AND source.workspace_id=event.workspace_id
JOIN project_dependencies dependency
  ON dependency.project_id=source.id
 AND dependency.depends_on_project_id=CASE
       WHEN jsonb_typeof(event.payload->'dependsOnProjectId')='string'
        AND event.payload->>'dependsOnProjectId'
              ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       THEN (event.payload->>'dependsOnProjectId')::uuid
       ELSE NULL
     END
JOIN projects target
  ON target.id=dependency.depends_on_project_id
 AND target.workspace_id=event.workspace_id
CROSS JOIN (VALUES ('scope'),('invalidate')) relation(name)
CROSS JOIN LATERAL (
  VALUES
    ('project',source.id),
    ('team',source.team_id),
    ('project',target.id),
    ('team',target.team_id)
) resource(resource_type,resource_id)
WHERE event.event_type LIKE 'project.dependency.%'
ON CONFLICT DO NOTHING;

COMMIT;
