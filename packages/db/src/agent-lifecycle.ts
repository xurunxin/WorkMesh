import type { PoolClient } from 'pg'
import { appendEvent } from './events.js'

export type AgentLifecycleReconciliation = Readonly<{
  agentId: string
  archived: boolean
  blockers: readonly string[]
}>

export async function reconcileAgentLifecycle(
  tx: PoolClient,
  input: {
    workspaceId: string
    agentId: string
    actorId: string
    correlationId: string
    reason: string
  },
): Promise<AgentLifecycleReconciliation> {
  const agent = (await tx.query<{
    id: string
    actor_id: string
    is_active: boolean
    revision: number
  }>(
    `SELECT id,actor_id,is_active,revision FROM agent_definitions
      WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
    [input.agentId, input.workspaceId],
  )).rows[0]
  if (!agent) return { agentId: input.agentId, archived: false, blockers: ['agent_not_found'] }
  if (!agent.is_active) return { agentId: input.agentId, archived: true, blockers: [] }
  const authority = (await tx.query<{
    active_connections: boolean
    active_credentials: boolean
    active_team_access: boolean
    active_delegations: boolean
    active_sessions: boolean
  }>(`
    SELECT
      EXISTS(
        SELECT 1 FROM agent_connections connection
         WHERE connection.agent_id=$1 AND connection.status IN ('pending','active','rotating')
      ) AS active_connections,
      EXISTS(
        SELECT 1 FROM agent_installation_tokens token
         WHERE token.agent_id=$1 AND token.revoked_at IS NULL
           AND (token.expires_at IS NULL OR token.expires_at>now())
      ) AS active_credentials,
      EXISTS(
        SELECT 1 FROM agent_team_access access
         WHERE access.workspace_id=$2 AND access.agent_id=$1 AND access.revoked_at IS NULL
      ) AS active_team_access,
      EXISTS(
        SELECT 1 FROM delegations delegation
         WHERE delegation.workspace_id=$2 AND delegation.agent_id=$1 AND delegation.status='active'
      ) AS active_delegations,
      EXISTS(
        SELECT 1 FROM agent_sessions session
         WHERE session.workspace_id=$2 AND session.agent_id=$1
           AND session.state NOT IN ('completed','failed','canceled')
      ) AS active_sessions
  `, [agent.id, input.workspaceId])).rows[0]!
  const blockers = Object.entries(authority)
    .filter(([, active]) => active)
    .map(([name]) => name)
  if (blockers.length) return { agentId: agent.id, archived: false, blockers }
  const archived = (await tx.query<{ revision: number }>(
    `UPDATE agent_definitions
        SET is_active=false,archived_at=now(),archived_by_actor_id=$2,archive_reason=$3,
            revision=revision+1,updated_at=now()
      WHERE id=$1 AND is_active
      RETURNING revision`,
    [agent.id, input.actorId, input.reason],
  )).rows[0]
  if (!archived) return { agentId: agent.id, archived: true, blockers: [] }
  await tx.query(
    'UPDATE actors SET is_active=false WHERE id=$1 AND workspace_id=$2',
    [agent.actor_id, input.workspaceId],
  )
  await appendEvent(tx, {
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    correlationId: input.correlationId,
    type: 'agent.archived',
    aggregateType: 'agent',
    aggregateId: agent.id,
    revision: archived.revision,
    payload: { agentId: agent.id, reason: input.reason },
    resources: {
      scopes: [{ type: 'workspace', id: input.workspaceId }],
      invalidates: [{ type: 'workspace', id: input.workspaceId }],
    },
  })
  return { agentId: agent.id, archived: true, blockers: [] }
}
