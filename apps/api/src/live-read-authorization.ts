import type { ApiActor } from './agent/types.js'

const bind = (values: unknown[], value: unknown): string => {
  values.push(value)
  return `$${values.length}`
}

/**
 * Produces a correlated predicate that revalidates the authenticated human
 * credential and current Team authority in the same statement that returns
 * protected rows.
 */
export function liveHumanTeamReadPredicate(
  current: ApiActor,
  workspaceSql: string,
  teamSql: string,
  values: unknown[],
): string {
  const actorId = bind(values, current.id)
  const sessionId = bind(values, current.humanSessionId ?? null)
  const credentialHash = bind(values, current.credentialHash ?? null)
  return `EXISTS (
    SELECT 1
      FROM actors live_reader
      JOIN sessions live_credential
        ON live_credential.id=${sessionId}
       AND live_credential.actor_id=live_reader.id
       AND live_credential.token_hash=${credentialHash}
       AND live_credential.expires_at>now()
       AND live_credential.revoked_at IS NULL
     WHERE live_reader.id=${actorId}
       AND live_reader.workspace_id=${workspaceSql}
       AND live_reader.kind='human'
       AND live_reader.is_active
       AND (
         live_reader.workspace_role='admin'
         OR EXISTS (
           SELECT 1
             FROM memberships live_membership
             JOIN teams live_team
               ON live_team.id=live_membership.team_id
              AND live_team.workspace_id=live_membership.workspace_id
              AND live_team.deleted_at IS NULL
            WHERE live_membership.workspace_id=${workspaceSql}
              AND live_membership.team_id=${teamSql}
              AND live_membership.actor_id=live_reader.id
         )
       )
  )`
}

/**
 * Revalidates a session-scoped read in the final SELECT. Human readers retain
 * admin-or-Team semantics; Agent readers are limited to their exact live
 * session, credential, delegation, definition, Team grant, capability, and
 * resource scope.
 */
export function liveSessionReadPredicate(
  current: ApiActor,
  sessionSql: string,
  workspaceSql: string,
  values: unknown[],
  requiredCapability: 'work:read' | 'repo:read' = 'work:read',
): string {
  const actorId = bind(values, current.id)
  const humanSessionId = bind(values, current.humanSessionId ?? null)
  const agentSessionId = bind(values, current.agentSessionId ?? null)
  const credentialHash = bind(values, current.credentialHash ?? null)
  return `EXISTS (
    SELECT 1
      FROM agent_sessions live_session
      JOIN actors live_reader
        ON live_reader.id=${actorId}
       AND live_reader.workspace_id=live_session.workspace_id
       AND live_reader.is_active
     WHERE live_session.id=${sessionSql}
       AND live_session.workspace_id=${workspaceSql}
       AND (
         (
           live_reader.kind='human'
           AND EXISTS (
             SELECT 1
               FROM sessions live_credential
              WHERE live_credential.id=${humanSessionId}
                AND live_credential.actor_id=live_reader.id
                AND live_credential.token_hash=${credentialHash}
                AND live_credential.expires_at>now()
                AND live_credential.revoked_at IS NULL
           )
           AND (
             live_reader.workspace_role='admin'
             OR EXISTS (
               SELECT 1
                 FROM memberships live_membership
                 JOIN teams live_team
                   ON live_team.id=live_membership.team_id
                  AND live_team.workspace_id=live_membership.workspace_id
                  AND live_team.deleted_at IS NULL
                WHERE live_membership.workspace_id=live_session.workspace_id
                  AND live_membership.team_id=live_session.team_id
                  AND live_membership.actor_id=live_reader.id
             )
           )
         )
         OR (
           live_reader.kind='agent'
           AND live_session.id=${agentSessionId}
           AND live_session.agent_actor_id=live_reader.id
           AND live_session.state IN (
             'acknowledged','planning','executing',
             'awaiting_input','awaiting_approval','blocked'
           )
           AND EXISTS (
             SELECT 1
               FROM agent_session_tokens live_credential
              WHERE live_credential.session_id=live_session.id
                AND live_credential.token_hash=${credentialHash}
                AND live_credential.expires_at>now()
                AND live_credential.exchanged_at IS NOT NULL
                AND live_credential.revoked_at IS NULL
           )
           AND EXISTS (
             SELECT 1
               FROM delegations live_delegation
               LEFT JOIN work_items live_scope_item
                 ON live_scope_item.id=live_session.work_item_id
                AND live_scope_item.workspace_id=live_session.workspace_id
                AND live_scope_item.deleted_at IS NULL
               JOIN agent_definitions live_definition
                 ON live_definition.id=live_session.agent_id
                AND live_definition.workspace_id=live_session.workspace_id
                AND live_definition.actor_id=live_reader.id
                AND live_definition.is_active
               JOIN agent_team_access live_team_access
                 ON live_team_access.workspace_id=live_session.workspace_id
                AND live_team_access.agent_id=live_session.agent_id
                AND live_team_access.team_id=live_session.team_id
                AND live_team_access.revoked_at IS NULL
              WHERE live_delegation.id=live_session.delegation_id
                AND live_delegation.status='active'
                AND '${requiredCapability}'=ANY(live_delegation.permissions_snapshot)
                AND '${requiredCapability}'=ANY(live_definition.approved_capabilities)
                AND '${requiredCapability}'=ANY(live_team_access.approved_capabilities)
                AND COALESCE(
                  live_delegation.capability_scope->'teamIds',
                  '[]'::jsonb
                ) ? live_session.team_id::text
                AND (
                  (
                    live_session.work_item_id IS NOT NULL
                    AND live_scope_item.id IS NOT NULL
                    AND COALESCE(
                      live_delegation.capability_scope->'workItemIds',
                      '[]'::jsonb
                    ) ? live_session.work_item_id::text
                  )
                  OR (
                    live_session.work_item_id IS NULL
                    AND (
                      live_session.project_id IS NULL
                      OR COALESCE(
                        live_delegation.capability_scope->'projectIds',
                        '[]'::jsonb
                      ) ? live_session.project_id::text
                    )
                  )
                )
           )
         )
       )
  )`
}
