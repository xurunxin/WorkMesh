import type { Pool } from 'pg'
import { DomainError } from '@workmesh/domain'
import type { ApiActor } from '../agent/types.js'

const columns =
  `cursor,id,event_type,event_version,workspace_id,team_id,audience_actor_id,
   aggregate_type,aggregate_id,aggregate_revision,actor_id,correlation_id,
   idempotency_key,payload,session_id,session_sequence AS sequence,
   session_id AS "sessionId",session_sequence AS "sessionSequence",occurred_at,
   COALESCE((
     SELECT jsonb_agg(
       jsonb_build_object('type',resource_type,'id',resource_id)
       ORDER BY resource_type,resource_id
     )
     FROM domain_event_resources resources
     WHERE resources.domain_event_id=e.id AND resources.relation='scope'
   ),'[]'::jsonb) AS scopes,
   COALESCE((
     SELECT jsonb_agg(
       jsonb_build_object('type',resource_type,'id',resource_id)
       ORDER BY resource_type,resource_id
     )
     FROM domain_event_resources resources
     WHERE resources.domain_event_id=e.id AND resources.relation='invalidate'
   ),'[]'::jsonb) AS invalidates`

export type EventAudienceQuery = Readonly<{
  sql: string
  values: readonly unknown[]
}>

/**
 * One SQL audience policy is shared by REST pagination and SSE. In particular,
 * Agent visibility never falls back to Workspace or same-Team membership:
 * every returned row is an explicit recipient, is tied to the current/allowed
 * child Session, or proves aggregate intersection with the live Delegation.
 */
export function eventAudienceQuery(
  actor: ApiActor,
  cursor: string,
): EventAudienceQuery {
  if (!actor.credentialHash)
    throw new DomainError(
      'UNAUTHENTICATED',
      'The event credential is no longer available',
    )
  if (actor.kind === 'human') {
    let sql =
      `SELECT ${columns} FROM domain_events e
       WHERE e.workspace_id=$1 AND e.cursor>$2
         AND (e.audience_actor_id IS NULL OR e.audience_actor_id=$3)
         AND EXISTS (
           SELECT 1
           FROM sessions credential
           JOIN actors principal ON principal.id=credential.actor_id
           WHERE credential.token_hash=$4
             AND credential.expires_at>now()
             AND credential.revoked_at IS NULL
             AND principal.id=$3
             AND principal.workspace_id=$1
             AND principal.kind='human'
             AND principal.is_active
         )
         AND NOT (
           e.audience_actor_id IS NULL
           AND (
             e.aggregate_type IN ('session','saved_view','notification')
             OR e.event_type='notification.preferences_updated'
             OR (
               e.aggregate_type='advanced_saved_view'
               AND NOT EXISTS (
                 SELECT 1
                 FROM advanced_saved_views private_view
                 WHERE private_view.id=e.aggregate_id
                   AND private_view.workspace_id=e.workspace_id
                   AND private_view.scope<>'private'
               )
             )
           )
         )`
    if (actor.workspaceRole !== 'admin') {
      sql +=
        ` AND (
            e.audience_actor_id=$3
            OR (
              e.audience_actor_id IS NULL
              AND (
                EXISTS (
                  SELECT 1
                  FROM initiatives initiative
                  WHERE e.aggregate_type='initiative'
                    AND initiative.id=e.aggregate_id
                    AND initiative.workspace_id=e.workspace_id
                    AND initiative.owner_actor_id=$3
                )
                OR EXISTS (
                  SELECT 1
                  FROM memberships member
                  JOIN teams team
                    ON team.id=member.team_id
                   AND team.workspace_id=member.workspace_id
                  WHERE member.workspace_id=e.workspace_id
                    AND member.actor_id=$3
                    AND team.deleted_at IS NULL
                    AND (
                      member.team_id=e.team_id
                      OR EXISTS (
                        SELECT 1
                        FROM domain_event_resources team_resource
                        WHERE team_resource.domain_event_id=e.id
                          AND team_resource.workspace_id=e.workspace_id
                          AND team_resource.resource_type='team'
                          AND team_resource.resource_id=member.team_id
                      )
                    )
                )
                OR (
                  e.team_id IS NULL
                  AND e.aggregate_type<>'initiative'
                  AND e.event_type NOT LIKE 'project.dependency.%'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM domain_event_resources scoped_resource
                    WHERE scoped_resource.domain_event_id=e.id
                      AND scoped_resource.workspace_id=e.workspace_id
                      AND scoped_resource.resource_type<>'workspace'
                  )
                )
              )
            )
          )`
    }
    return {
      sql,
      values: [actor.workspaceId, cursor, actor.id, actor.credentialHash],
    }
  }

  if (!actor.agentSessionId) {
    throw new DomainError('SESSION_SCOPE_DENIED', 'An Agent Session credential is required for events')
  }
  const sql =
    `WITH RECURSIVE authorized_sessions(
       id,team_id,work_item_id,project_id
     ) AS (
       SELECT root.id,root.team_id,root.work_item_id,
              CASE
                WHEN root.work_item_id IS NOT NULL
                  THEN root_scope_project.id
                ELSE root_session_project.id
              END AS project_id
       FROM agent_sessions root
       JOIN delegations root_delegation
         ON root_delegation.id=root.delegation_id
        AND root_delegation.status='active'
       JOIN agent_definitions root_agent
         ON root_agent.id=root.agent_id AND root_agent.is_active
       JOIN agent_team_access root_access
         ON root_access.workspace_id=root.workspace_id
        AND root_access.agent_id=root.agent_id
        AND root_access.team_id=root.team_id
        AND root_access.revoked_at IS NULL
       JOIN agent_session_tokens credential
         ON credential.session_id=root.id
        AND credential.token_hash=$5
        AND credential.expires_at>now()
        AND credential.exchanged_at IS NOT NULL
        AND credential.revoked_at IS NULL
       LEFT JOIN work_items root_scope_item
         ON root_scope_item.id=root.work_item_id
        AND root_scope_item.workspace_id=root.workspace_id
        AND root_scope_item.deleted_at IS NULL
       LEFT JOIN projects root_scope_project
         ON root_scope_project.id=root_scope_item.project_id
        AND root_scope_project.workspace_id=root.workspace_id
        AND root_scope_project.deleted_at IS NULL
       LEFT JOIN projects root_session_project
         ON root_session_project.id=root.project_id
        AND root_session_project.workspace_id=root.workspace_id
        AND root_session_project.deleted_at IS NULL
       WHERE root.id=$4 AND root.workspace_id=$1 AND root.agent_actor_id=$3
         AND root.state IN (
           'acknowledged','planning','executing','awaiting_input',
           'awaiting_approval','blocked'
         )
         AND 'work:read'=ANY(root_delegation.permissions_snapshot)
         AND 'work:read'=ANY(root_agent.approved_capabilities)
         AND 'work:read'=ANY(root_access.approved_capabilities)
         AND COALESCE(root_delegation.capability_scope->'teamIds','[]'::jsonb)
             ? root.team_id::text
         AND (
           (
             root.work_item_id IS NOT NULL
             AND root_scope_item.id IS NOT NULL
             AND COALESCE(
               root_delegation.capability_scope->'workItemIds',
               '[]'::jsonb
             ) ? root.work_item_id::text
           )
           OR (
             root.work_item_id IS NULL
             AND (
               root.project_id IS NULL
               OR (
                 root_session_project.id IS NOT NULL
                 AND COALESCE(
                   root_delegation.capability_scope->'projectIds',
                   '[]'::jsonb
                 ) ? root.project_id::text
               )
             )
           )
         )
       UNION ALL
       SELECT child.id,child.team_id,child.work_item_id,
              CASE
                WHEN child.work_item_id IS NOT NULL
                  THEN child_scope_project.id
                ELSE child_session_project.id
              END AS project_id
       FROM agent_sessions child
       JOIN authorized_sessions parent ON child.parent_session_id=parent.id
       JOIN delegations child_delegation
         ON child_delegation.id=child.delegation_id
        AND child_delegation.status='active'
       JOIN agent_definitions child_agent
         ON child_agent.id=child.agent_id AND child_agent.is_active
       JOIN agent_team_access child_access
         ON child_access.workspace_id=child.workspace_id
        AND child_access.agent_id=child.agent_id
        AND child_access.team_id=child.team_id
        AND child_access.revoked_at IS NULL
       LEFT JOIN work_items child_scope_item
         ON child_scope_item.id=child.work_item_id
        AND child_scope_item.workspace_id=child.workspace_id
        AND child_scope_item.deleted_at IS NULL
       LEFT JOIN projects child_scope_project
         ON child_scope_project.id=child_scope_item.project_id
        AND child_scope_project.workspace_id=child.workspace_id
        AND child_scope_project.deleted_at IS NULL
       LEFT JOIN projects child_session_project
         ON child_session_project.id=child.project_id
        AND child_session_project.workspace_id=child.workspace_id
        AND child_session_project.deleted_at IS NULL
       WHERE child.workspace_id=$1
         AND child.team_id=parent.team_id
         AND (parent.work_item_id IS NULL OR child.work_item_id=parent.work_item_id)
         AND (
           parent.project_id IS NULL
           OR CASE
                WHEN child.work_item_id IS NOT NULL
                  THEN child_scope_project.id
                ELSE child_session_project.id
              END=parent.project_id
         )
         AND 'work:read'=ANY(child_delegation.permissions_snapshot)
         AND 'work:read'=ANY(child_agent.approved_capabilities)
         AND 'work:read'=ANY(child_access.approved_capabilities)
         AND COALESCE(
           child_delegation.capability_scope->'teamIds',
           '[]'::jsonb
         ) ? child.team_id::text
         AND (
           (
             child.work_item_id IS NOT NULL
             AND child_scope_item.id IS NOT NULL
             AND COALESCE(
               child_delegation.capability_scope->'workItemIds',
               '[]'::jsonb
             ) ? child.work_item_id::text
           )
           OR (
             child.work_item_id IS NULL
             AND (
               child.project_id IS NULL
               OR (
                 child_session_project.id IS NOT NULL
                 AND COALESCE(
                   child_delegation.capability_scope->'projectIds',
                   '[]'::jsonb
                 ) ? child.project_id::text
               )
             )
           )
         )
     )
     SELECT ${columns} FROM domain_events e
     WHERE e.workspace_id=$1 AND e.cursor>$2
        AND e.event_type<>'room.message.human_visibility_recorded'
        AND EXISTS (SELECT 1 FROM authorized_sessions WHERE id=$4)
        AND (
          (
            e.aggregate_type='inbox_item'
            AND e.audience_actor_id=$3
            AND e.session_id=$4
          )
          OR (
            e.aggregate_type='room_message'
            AND e.audience_actor_id IS NOT NULL
            AND e.session_id IS NOT NULL
            AND e.audience_actor_id=$3
            AND e.session_id=$4
          )
          OR (
            e.aggregate_type<>'inbox_item'
            AND NOT (
              e.aggregate_type='room_message'
              AND e.audience_actor_id IS NOT NULL
              AND e.session_id IS NOT NULL
            )
            AND (
              e.audience_actor_id=$3
              OR e.session_id IN (SELECT id FROM authorized_sessions)
              OR (
                e.audience_actor_id IS NULL
                AND EXISTS (
                  SELECT 1
                  FROM domain_event_resources resource
                  JOIN authorized_sessions visible
                    ON (
                      (resource.resource_type='work_item' AND resource.resource_id=visible.work_item_id)
                      OR (resource.resource_type='project' AND resource.resource_id=visible.project_id)
                      OR (resource.resource_type='session' AND resource.resource_id=visible.id)
                    )
                  WHERE resource.domain_event_id=e.id
                    AND resource.relation IN ('scope','invalidate')
                )
              )
            )
          )
        )`
  return {
    sql,
    values: [
      actor.workspaceId,
      cursor,
      actor.id,
      actor.agentSessionId,
      actor.credentialHash,
    ],
  }
}
export async function assertEventAudienceActive(
  db: Pool,
  actor: ApiActor,
): Promise<void> {
  if (!actor.credentialHash) {
    throw new DomainError('UNAUTHENTICATED', 'The event credential is no longer available')
  }
  if (actor.kind === 'human') {
    const active = await db.query(
      `SELECT 1 FROM sessions credential
       JOIN actors principal ON principal.id=credential.actor_id
       WHERE credential.token_hash=$1 AND credential.expires_at>now()
         AND credential.revoked_at IS NULL
         AND principal.id=$2 AND principal.workspace_id=$3
         AND principal.kind='human' AND principal.is_active
         AND (
           principal.workspace_role='admin'
           OR EXISTS (
             SELECT 1 FROM memberships member
             JOIN teams team
               ON team.id=member.team_id
              AND team.workspace_id=member.workspace_id
             WHERE member.workspace_id=principal.workspace_id
               AND member.actor_id=principal.id
               AND team.deleted_at IS NULL
           )
         )`,
      [actor.credentialHash, actor.id, actor.workspaceId],
    )
    if (!active.rowCount) {
      throw new DomainError('UNAUTHENTICATED', 'The human Session was revoked or expired')
    }
    return
  }

  const active = await db.query(
    `SELECT 1 FROM agent_session_tokens credential
     JOIN agent_sessions session ON session.id=credential.session_id
     JOIN delegations delegation
       ON delegation.id=session.delegation_id AND delegation.status='active'
     JOIN agent_definitions agent
       ON agent.id=session.agent_id AND agent.is_active
     JOIN agent_team_access access
       ON access.workspace_id=session.workspace_id
      AND access.agent_id=session.agent_id
      AND access.team_id=session.team_id
      AND access.revoked_at IS NULL
     WHERE credential.token_hash=$1
       AND credential.expires_at>now()
       AND credential.exchanged_at IS NOT NULL
       AND credential.revoked_at IS NULL
       AND session.id=$2 AND session.workspace_id=$3
       AND session.agent_actor_id=$4
       AND session.state IN (
         'acknowledged','planning','executing','awaiting_input',
         'awaiting_approval','blocked'
       )
       AND 'work:read'=ANY(delegation.permissions_snapshot)
       AND 'work:read'=ANY(agent.approved_capabilities)
       AND 'work:read'=ANY(access.approved_capabilities)`,
    [actor.credentialHash, actor.agentSessionId, actor.workspaceId, actor.id],
  )
  if (!active.rowCount) {
    throw new DomainError('SESSION_NOT_ACTIVE', 'The Agent Session authority was revoked, stopped, or expired')
  }
}
