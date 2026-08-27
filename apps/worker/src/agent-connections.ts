import type { PoolClient } from 'pg'
import { coordinationSessionClosedEventPayloadSchema } from '@workmesh/contracts'
import { appendEvent, reconcileAgentLifecycle, type Db, withTx } from '@workmesh/db'

export const createAgentConnectionLifecycleWorker = ({ db }: { db: Db }) => ({
  tick: async (): Promise<void> => withTx(db, async (tx: PoolClient) => {
    const abandonedRotations = (await tx.query<{
      pairing_id: string; connection_id: string; workspace_id: string; team_id: string
      actor_id: string; revision: number
    }>(`
      WITH candidates AS (
        SELECT pairing.id, pairing.connection_id
          FROM agent_connection_pairings pairing
          JOIN agent_connections connection ON connection.id=pairing.connection_id
         WHERE pairing.purpose='rotation' AND pairing.consumed_at IS NULL
           AND pairing.expires_at<=now() AND connection.status='rotating'
         ORDER BY pairing.expires_at,pairing.id
         FOR UPDATE OF pairing,connection SKIP LOCKED LIMIT 100
      ), restored AS (
        UPDATE agent_connections connection
           SET status='active',pairing_code_expires_at=NULL,revision=revision+1,updated_at=now()
          FROM candidates WHERE connection.id=candidates.connection_id
        RETURNING candidates.id AS pairing_id,connection.id AS connection_id,
                  connection.workspace_id,connection.team_id,
                  connection.created_by_actor_id AS actor_id,connection.revision
      )
      SELECT * FROM restored
    `)).rows
    for (const item of abandonedRotations)
      await appendEvent(tx, {
        workspaceId: item.workspace_id, teamId: item.team_id, actorId: item.actor_id,
        correlationId: `worker:agent-connection-pairing:${item.pairing_id}`,
        type: 'agent.connection.rotation_abandoned', aggregateType: 'agent_connection',
        aggregateId: item.connection_id, revision: item.revision,
        payload: { pairingId: item.pairing_id },
        resources: { scopes: [{ type: 'team', id: item.team_id }], invalidates: [{ type: 'team', id: item.team_id }] },
      })

    const expiredCredentials = (await tx.query<{
      id: string; connection_id: string; workspace_id: string; team_id: string
      actor_id: string; revision: number
    }>(`
      WITH candidates AS (
        SELECT credential.id
          FROM agent_connection_credentials credential
         WHERE credential.status='overlap' AND credential.overlap_until<=now()
         ORDER BY credential.overlap_until,credential.id
         FOR UPDATE SKIP LOCKED LIMIT 100
      ), expired AS (
        UPDATE agent_connection_credentials credential
           SET status='rotated',revoked_at=now()
          FROM candidates WHERE credential.id=candidates.id
        RETURNING credential.id,credential.connection_id
      )
      SELECT expired.id,connection.id AS connection_id,connection.workspace_id,
             connection.team_id,connection.created_by_actor_id AS actor_id,connection.revision
        FROM expired JOIN agent_connections connection ON connection.id=expired.connection_id
    `)).rows
    for (const item of expiredCredentials) {
      const active = await tx.query(
        "SELECT 1 FROM agent_connection_credentials WHERE connection_id=$1 AND status='active'",
        [item.connection_id],
      )
      if (active.rowCount)
        await tx.query("UPDATE agent_connections SET status='active',revision=revision+1,updated_at=now() WHERE id=$1 AND status='rotating'", [item.connection_id])
      await appendEvent(tx, {
        workspaceId: item.workspace_id, teamId: item.team_id, actorId: item.actor_id,
        correlationId: `worker:agent-connection:${item.id}`,
        type: 'agent.connection.rotation_expired', aggregateType: 'agent_connection',
        aggregateId: item.connection_id, revision: item.revision + (active.rowCount ? 1 : 0),
        payload: { credentialId: item.id },
        resources: { scopes: [{ type: 'team', id: item.team_id }], invalidates: [{ type: 'team', id: item.team_id }] },
      })
    }

    const expiredSessions = (await tx.query<{
      id: string; agent_session_id: string; connection_id: string
      workspace_id: string; team_id: string; actor_id: string
      connection_revision: number
      session_workspace_id: string; session_team_id: string | null
      session_actor_id: string; session_revision: number; session_sequence: string
    }>(`
      WITH candidates AS (
        SELECT coordination.id,coordination.agent_session_id,
               coordination.connection_id,connection.workspace_id,
               connection.team_id,connection.agent_actor_id AS actor_id,
               connection.revision AS connection_revision,
               agent_session.workspace_id AS session_workspace_id,
               agent_session.team_id AS session_team_id,
               agent_session.agent_actor_id AS session_actor_id,
               agent_session.revision AS session_revision,
               agent_session.sequence AS session_sequence
          FROM agent_coordination_sessions coordination
          JOIN agent_connections connection ON connection.id=coordination.connection_id
          JOIN agent_sessions agent_session
            ON agent_session.id=coordination.agent_session_id
         WHERE coordination.status='active' AND coordination.expires_at<=now()
         ORDER BY coordination.expires_at,coordination.id
         FOR UPDATE OF coordination,agent_session SKIP LOCKED LIMIT 100
      )
      UPDATE agent_coordination_sessions coordination
         SET status='closed',closed_at=now(),updated_at=now()
        FROM candidates
       WHERE coordination.id=candidates.id
      RETURNING coordination.id,coordination.agent_session_id,
                coordination.connection_id,candidates.workspace_id,
                candidates.team_id,candidates.actor_id,candidates.connection_revision,
                candidates.session_workspace_id,candidates.session_team_id,
                candidates.session_actor_id,candidates.session_revision,candidates.session_sequence
    `)).rows
    for (const item of expiredSessions)
      await appendEvent(tx, {
        workspaceId: item.workspace_id, teamId: item.team_id, actorId: item.actor_id,
        correlationId: `worker:agent-connection-session:${item.id}:closed`,
        type: 'agent.coordination_session.closed', aggregateType: 'agent_connection',
        aggregateId: item.connection_id, revision: item.connection_revision,
        payload: coordinationSessionClosedEventPayloadSchema.parse(
          item.session_workspace_id === item.workspace_id
            && item.session_team_id === item.team_id
            ? {
                connectionId: item.connection_id,
                sessionId: item.agent_session_id,
                reason: 'expired',
              }
            : {
                connectionId: item.connection_id,
                reason: 'expired',
                sessionReferenceOmitted: 'resource_scope_mismatch',
              },
        ),
        resources: { scopes: [{ type: 'team', id: item.team_id }], invalidates: [{ type: 'team', id: item.team_id }] },
      })
    const canceledSessions = expiredSessions.length
      ? (await tx.query<{ id: string; revision: number; sequence: string }>(
          `UPDATE agent_sessions
              SET state='canceled',state_reason='coordination session expired',
                  ended_at=now(),revision=revision+1,updated_at=now()
            WHERE id=ANY($1::uuid[])
              AND state NOT IN ('completed','failed','canceled')
          RETURNING id,revision,sequence`,
          [expiredSessions.map(session => session.agent_session_id)],
        )).rows
      : []
    const canceledById = new Map(canceledSessions.map(session => [session.id, session]))
    for (const item of expiredSessions) {
      const canceled = canceledById.get(item.agent_session_id)
      if (canceled)
        await appendEvent(tx, {
          workspaceId: item.session_workspace_id, actorId: item.session_actor_id,
          correlationId: `worker:agent-session:${item.agent_session_id}:expired`,
          type: 'agent.session.state_changed', aggregateType: 'agent_session',
          aggregateId: item.agent_session_id, revision: canceled.revision,
          sessionId: item.agent_session_id, sessionSequence: canceled.sequence,
          payload: { state: 'canceled', reason: 'coordination session expired' },
        })
    }

    const orphanedAgents = (await tx.query<{
      id: string
      workspace_id: string
      system_actor_id: string
    }>(`
      SELECT definition.id,definition.workspace_id,installation.system_actor_id
        FROM agent_definitions definition
        JOIN platform_installation installation
          ON installation.workspace_id=definition.workspace_id
       WHERE definition.is_active
         AND NOT EXISTS(
           SELECT 1 FROM agent_connections connection
            WHERE connection.agent_id=definition.id
              AND connection.status IN ('pending','active','rotating')
         )
         AND NOT EXISTS(
           SELECT 1 FROM agent_installation_tokens token
            WHERE token.agent_id=definition.id AND token.revoked_at IS NULL
              AND (token.expires_at IS NULL OR token.expires_at>now())
         )
         AND NOT EXISTS(
           SELECT 1 FROM agent_team_access access
            WHERE access.agent_id=definition.id AND access.revoked_at IS NULL
         )
         AND NOT EXISTS(
           SELECT 1 FROM delegations delegation
            WHERE delegation.agent_id=definition.id AND delegation.status='active'
         )
         AND NOT EXISTS(
           SELECT 1 FROM agent_sessions session
            WHERE session.agent_id=definition.id
              AND session.state NOT IN ('completed','failed','canceled')
         )
       ORDER BY definition.updated_at,definition.id
       FOR UPDATE OF definition SKIP LOCKED LIMIT 100
    `)).rows
    for (const agent of orphanedAgents)
      await reconcileAgentLifecycle(tx, {
        workspaceId: agent.workspace_id,
        agentId: agent.id,
        actorId: agent.system_actor_id,
        correlationId: `worker:agent-lifecycle:${agent.id}`,
        reason: 'authority_reconciliation',
      })
  }),
})
