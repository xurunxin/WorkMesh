import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { DomainError } from '@workmesh/domain'
import { agentSessionExecutionResultQuerySchema, agentSessionExecutionResultResponseSchema, executionStateSchema } from '@workmesh/contracts'
import type { ApiActor } from './types.js'
import { liveHumanTeamReadPredicate } from '../live-read-authorization.js'

function hidden(): never { throw new DomainError('NOT_FOUND', 'Resource not found', { authorizationStage: 'resource_scope' }) }

/** Identity recognition only. No usage update, C Session creation, mirror reconciliation, or token signing. */
export async function resolveExecutionResultIdentity(db: Pool | PoolClient, credentialHash: string, connectionHeader: boolean): Promise<ApiActor> {
  const result = connectionHeader
    ? await db.query<{ id: string; workspace_id: string; display_name: string }>(`SELECT a.id,a.workspace_id,a.display_name
      FROM agent_connection_credentials credential JOIN agent_connections c ON c.id=credential.connection_id
      JOIN agent_definitions definition ON definition.id=c.agent_id AND definition.actor_id=c.agent_actor_id
      JOIN actors a ON a.id=definition.actor_id AND a.workspace_id=c.workspace_id
      WHERE credential.token_hash=$1 AND credential.revoked_at IS NULL AND credential.valid_from<=now()
        AND (credential.status='active' OR (credential.status='overlap' AND credential.overlap_until>now()))
        AND c.status IN ('active','rotating') AND c.revoked_at IS NULL AND a.is_active AND definition.is_active`, [credentialHash])
    : await db.query<{ id: string; workspace_id: string; display_name: string }>(`SELECT a.id,a.workspace_id,a.display_name
      FROM agent_installation_tokens installation JOIN agent_definitions definition ON definition.id=installation.agent_id
      JOIN actors a ON a.id=definition.actor_id AND a.workspace_id=definition.workspace_id
      WHERE installation.token_hash=$1 AND installation.revoked_at IS NULL
        AND (installation.expires_at IS NULL OR installation.expires_at>now()) AND a.is_active AND definition.is_active`, [credentialHash])
  if (result.rows.length !== 1) throw new DomainError('UNAUTHENTICATED', 'Installation credential is invalid or expired')
  const row = result.rows[0]!
  return { id: row.id, workspaceId: row.workspace_id, displayName: row.display_name, csrfToken: '',
    workspaceRole: 'member', kind: 'agent', authentication: 'installation_target', credentialHash }
}

const receiptSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().positive(), sequence: z.union([z.number().int().nonnegative().safe(), z.string().regex(/^\d+$/)]),
  state: z.enum(['completed', 'canceled']),
}).passthrough()

export async function getExecutionResult(db: Pool, actor: ApiActor, sessionId: string, rawQuery: unknown) {
  const query = agentSessionExecutionResultQuerySchema.parse(rawQuery)
  const tx = await db.connect()
  try {
    await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const values: unknown[] = [sessionId, actor.workspaceId]
    const humanRead = actor.kind === 'human' ? liveHumanTeamReadPredicate(actor, 's.workspace_id', 's.team_id', values) : 'true'
    const session = (await tx.query<{ id: string; state: z.infer<typeof executionStateSchema>; revision: number; agent_actor_id: string }>(
      `SELECT s.id,s.state,s.revision,s.agent_actor_id FROM agent_sessions s
       JOIN teams team ON team.id=s.team_id AND team.workspace_id=s.workspace_id AND team.deleted_at IS NULL
       WHERE s.id=$1 AND s.workspace_id=$2 AND s.session_kind='execution' AND ${humanRead}`, values)).rows[0]
    if (!session) hidden()
    if (actor.kind === 'agent') {
      if (actor.authentication !== 'installation_target' || actor.id !== session.agent_actor_id || !actor.credentialHash) hidden()
      // The target may be terminal; every other live authorization fact remains mandatory.
      const authorized = await tx.query(`SELECT s.id FROM agent_sessions s
        JOIN delegations d ON d.id=s.delegation_id AND d.workspace_id=s.workspace_id
          AND d.agent_id=s.agent_id AND d.agent_actor_id=s.agent_actor_id AND d.team_id=s.team_id
          AND d.status='active'
        JOIN agent_definitions definition ON definition.id=s.agent_id AND definition.workspace_id=s.workspace_id
          AND definition.actor_id=s.agent_actor_id AND definition.is_active
        JOIN actors agent ON agent.id=s.agent_actor_id AND agent.workspace_id=s.workspace_id AND agent.is_active
        JOIN actors principal ON principal.id=d.principal_human_actor_id AND principal.workspace_id=s.workspace_id
          AND principal.kind='human' AND principal.is_active
        JOIN agent_team_access grant_access ON grant_access.workspace_id=s.workspace_id
          AND grant_access.agent_id=s.agent_id AND grant_access.team_id=s.team_id AND grant_access.revoked_at IS NULL
        JOIN teams team ON team.id=s.team_id AND team.workspace_id=s.workspace_id AND team.deleted_at IS NULL
        LEFT JOIN work_items item ON item.id=s.work_item_id AND item.workspace_id=s.workspace_id AND item.team_id=s.team_id AND item.deleted_at IS NULL
        LEFT JOIN projects project ON project.id=s.project_id AND project.workspace_id=s.workspace_id AND project.team_id=s.team_id AND project.deleted_at IS NULL
        WHERE s.id=$1 AND s.workspace_id=$2 AND s.agent_actor_id=$3
          AND 'work:read'=ANY(d.permissions_snapshot) AND 'work:read'=ANY(definition.approved_capabilities)
          AND 'work:read'=ANY(grant_access.approved_capabilities)
          AND COALESCE(d.capability_scope->'teamIds','[]'::jsonb) ? s.team_id::text
          AND (principal.workspace_role='admin' OR EXISTS(SELECT 1 FROM memberships m
            WHERE m.workspace_id=s.workspace_id AND m.team_id=s.team_id AND m.actor_id=principal.id))
          AND ((s.work_item_id IS NOT NULL AND item.id IS NOT NULL
            AND COALESCE(d.capability_scope->'workItemIds','[]'::jsonb) ? s.work_item_id::text
            AND (item.project_id IS NULL OR EXISTS(SELECT 1 FROM projects item_project
              WHERE item_project.id=item.project_id AND item_project.workspace_id=s.workspace_id AND item_project.team_id=s.team_id AND item_project.deleted_at IS NULL)))
            OR (s.work_item_id IS NULL AND (s.project_id IS NULL OR (project.id IS NOT NULL
            AND COALESCE(d.capability_scope->'projectIds','[]'::jsonb) ? s.project_id::text))))`,
      [sessionId, actor.workspaceId, actor.id])
      if (authorized.rowCount !== 1) hidden()
    }
    const receipt = (await tx.query<{
      operation: string; response_status: number | null; response_body: unknown; replay_expires_at: Date
      execution_source_kind: string | null; execution_session_id: string | null
      execution_session_token_id: string | null; execution_installation_token_id: string | null; execution_connection_id: string | null
    }>(`SELECT operation,response_status,response_body,replay_expires_at,execution_source_kind,
      execution_session_id,execution_session_token_id,execution_installation_token_id,execution_connection_id
      FROM api_idempotency_keys WHERE workspace_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
    [actor.workspaceId, session.agent_actor_id, query.operationKey])).rows[0]
    const operation = query.action === 'complete' ? 'POST /api/v1/agent-sessions/:id/complete' : 'POST /api/v1/agent-sessions/:id/stop-ack'
    if (receipt && (receipt.operation !== operation || (receipt.execution_session_id && receipt.execution_session_id !== sessionId))) hidden()
    if (actor.kind === 'agent') {
      if (!receipt || receipt.execution_session_id !== sessionId || !receipt.execution_session_token_id
        || !receipt.execution_installation_token_id || !['native', 'connection'].includes(receipt.execution_source_kind ?? '')) hidden()
      const provenance = await tx.query(`SELECT installation.id
        FROM agent_installation_tokens installation JOIN agent_sessions s ON s.agent_id=installation.agent_id
        JOIN delegations target ON target.id=s.delegation_id AND target.workspace_id=s.workspace_id
        LEFT JOIN agent_connection_credentials credential ON credential.token_hash=installation.token_hash
        LEFT JOIN agent_connections connection ON connection.id=credential.connection_id
        LEFT JOIN delegations coordinator ON coordinator.id=connection.delegation_id
        WHERE s.id=$1 AND s.workspace_id=$2 AND installation.token_hash=$3
          AND installation.revoked_at IS NULL AND (installation.expires_at IS NULL OR installation.expires_at>now())
          AND installation.origin_kind=$4
          AND (($4='native' AND installation.id=$5 AND installation.origin_connection_id IS NULL AND credential.id IS NULL)
            OR ($4='connection' AND installation.origin_connection_id=$6 AND connection.id=$6
              AND connection.workspace_id=s.workspace_id AND connection.team_id=s.team_id AND connection.agent_id=s.agent_id
              AND connection.agent_actor_id=s.agent_actor_id AND connection.principal_human_actor_id=target.principal_human_actor_id
              AND connection.status IN ('active','rotating') AND connection.revoked_at IS NULL
              AND credential.revoked_at IS NULL AND credential.valid_from<=now()
              AND (credential.status='active' OR (credential.status='overlap' AND credential.overlap_until>now()))
              AND coordinator.status='active' AND coordinator.role='coordinator' AND coordinator.scope_type='team'
              AND coordinator.scope_id=s.team_id AND coordinator.team_id=s.team_id AND coordinator.workspace_id=s.workspace_id
              AND coordinator.agent_id=s.agent_id AND coordinator.agent_actor_id=s.agent_actor_id
              AND coordinator.principal_human_actor_id=target.principal_human_actor_id
              AND 'work:read'=ANY(coordinator.permissions_snapshot) AND 'work:read'=ANY(connection.granted_capabilities)
              AND COALESCE(coordinator.capability_scope->'teamIds','[]'::jsonb) ? s.team_id::text))`,
      [sessionId, actor.workspaceId, actor.credentialHash, receipt.execution_source_kind,
        receipt.execution_installation_token_id, receipt.execution_connection_id])
      if (provenance.rowCount !== 1) hidden()
    }
    const unavailable = (reason: 'receipt_missing' | 'receipt_expired' | 'result_unavailable') => ({
      session: { id: session.id, state: session.state, revision: session.revision },
      action: { kind: query.action, operationKey: query.operationKey, confirmation: 'unavailable', unavailableReason: reason }, originalResult: null, cleanup: null,
    })
    let response: unknown
    const original = receiptSchema.safeParse(receipt?.response_body)
    if (!receipt) response = unavailable('receipt_missing')
    else if (receipt.replay_expires_at.getTime() <= Date.now()) response = unavailable('receipt_expired')
    else if (!original.success || receipt.response_status !== 200) response = unavailable('result_unavailable')
    else {
      const state = query.action === 'complete' ? 'completed' : 'canceled'
      if (original.data.id !== session.id || original.data.state !== state) hidden()
      let cleanup: { cleanupSummary: string; residualRisks: string[] } | null = null
      if (query.action === 'stop_ack') {
        const activity = (await tx.query<{ summary: string; details_markdown: string }>(
          `SELECT summary,details_markdown FROM agent_activities WHERE session_id=$1 AND actor_id=$2 AND sequence=$3 AND kind='stop_ack'`,
          [sessionId, session.agent_actor_id, original.data.sequence])).rows[0]
        try {
          cleanup = activity ? z.object({ cleanupSummary: z.string().min(1).max(10_000), residualRisks: z.array(z.string().min(1).max(1000)).max(50) })
            .parse({ cleanupSummary: activity.summary, residualRisks: JSON.parse(activity.details_markdown) as unknown }) : null
        } catch { cleanup = null }
      }
      const event = (await tx.query<{ id: string; cursor: string }>(`SELECT id,cursor::text FROM domain_events
        WHERE workspace_id=$1 AND actor_id=$2 AND idempotency_key=$3 AND session_id=$4
          AND aggregate_id=$4 AND aggregate_type='agent_session' AND aggregate_revision=$5
          AND session_sequence=$6 AND event_type=$7`,
      [actor.workspaceId, session.agent_actor_id, query.operationKey, sessionId, original.data.revision, original.data.sequence,
        query.action === 'complete' ? 'agent.session.completed' : 'agent.session.state_changed'])).rows
      response = query.action === 'stop_ack' && !cleanup ? unavailable('result_unavailable') : {
        session: { id: session.id, state: session.state, revision: session.revision },
        action: { kind: query.action, operationKey: query.operationKey, confirmation: 'confirmed', unavailableReason: null },
        originalResult: { operationId: query.action === 'complete' ? 'completeAgentSession' : 'acknowledgeAgentSessionStop',
          sessionId, revision: original.data.revision, state, resultReference: { type: 'agent_session', id: sessionId, revision: original.data.revision },
          eventReference: event.length === 1 ? event[0] : null }, cleanup,
      }
    }
    const result = agentSessionExecutionResultResponseSchema.parse(response)
    await tx.query('COMMIT')
    return result
  } catch (error) { await tx.query('ROLLBACK'); throw error } finally { tx.release() }
}
