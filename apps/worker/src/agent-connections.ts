import type { PoolClient } from 'pg'
import { appendEvent, type Db, withTx } from '@workmesh/db'

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

    const expiredSessions = (await tx.query<{ id: string; agent_session_id: string }>(`
      WITH candidates AS (
        SELECT id FROM agent_coordination_sessions
         WHERE status='active' AND expires_at<=now()
         ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT 100
      )
      UPDATE agent_coordination_sessions session
         SET status='closed',closed_at=now(),updated_at=now()
        FROM candidates WHERE session.id=candidates.id
      RETURNING session.id,session.agent_session_id
    `)).rows
    if (expiredSessions.length)
      await tx.query(
        `UPDATE agent_sessions SET state='canceled',state_reason='coordination session expired',ended_at=now(),revision=revision+1,updated_at=now()
          WHERE id=ANY($1::uuid[]) AND state NOT IN ('completed','failed','canceled')`,
        [expiredSessions.map(session => session.agent_session_id)],
      )
  }),
})
