import { randomUUID } from 'node:crypto'
import { withTx, type Db } from '@workmesh/db'

type Transaction = Pick<Db, 'query'>

export type SessionLiveness = 'healthy' | 'degraded' | 'stale'

export const classifyHeartbeatLiveness = ({
  lastHeartbeatAt,
  heartbeatIntervalSeconds,
  staleAfterSeconds,
  now = new Date(),
}: {
  lastHeartbeatAt: Date | string | null
  heartbeatIntervalSeconds: number
  staleAfterSeconds: number
  now?: Date
}): SessionLiveness => {
  if (!lastHeartbeatAt) return 'stale'
  const ageSeconds = Math.max(0, (now.getTime() - new Date(lastHeartbeatAt).getTime()) / 1_000)
  if (ageSeconds >= staleAfterSeconds) return 'stale'
  return ageSeconds > heartbeatIntervalSeconds * 2 ? 'degraded' : 'healthy'
}

type LockedSession = { id: string; workspaceId: string; principalHumanActorId: string; state: string }
type UpdatedSession = { id: string; workspaceId: string; revision: number; sequence: string }
type LockedApproval = { id: string; workspaceId: string; sessionId: string }

export type SessionLifecycleWorker = {
  expireAckDeadlines: (limit?: number) => Promise<number>
  reconcileHeartbeatLiveness: (limit?: number) => Promise<number>
  expireStopGrace: (limit?: number) => Promise<number>
  expireApprovals: (limit?: number) => Promise<number>
  expireLeases: (limit?: number) => Promise<number>
  cleanupAuthIdempotency: (limit?: number) => Promise<{ wiped: number; deleted: number }>
  tick: () => Promise<void>
}

const systemActorId = async (tx: Transaction, workspaceId: string): Promise<string> => {
  const result = await tx.query<{ system_actor_id: string }>('SELECT system_actor_id FROM platform_installation WHERE workspace_id=$1', [workspaceId])
  const actorId = result.rows[0]?.system_actor_id
  if (!actorId) throw new Error('WORKMESH_SYSTEM_ACTOR_MISSING')
  return actorId
}

const appendOutboxEvent = async (tx: Transaction, input: {
  workspaceId: string
  actorId: string
  correlationId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  revision: number
  sessionId?: string
  sessionSequence?: string
  payload: Record<string, unknown>
}): Promise<void> => {
  const event = await tx.query<{ id: string }>(`
    INSERT INTO domain_events(
      workspace_id,event_type,aggregate_type,aggregate_id,aggregate_revision,actor_id,correlation_id,
      session_id,session_sequence,payload
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id
  `, [input.workspaceId, input.eventType, input.aggregateType, input.aggregateId, input.revision, input.actorId,
    input.correlationId, input.sessionId ?? null, input.sessionSequence ?? null, input.payload])
  await tx.query('INSERT INTO outbox_events(domain_event_id,topic,partition_key) VALUES($1,$2,$3)', [event.rows[0]!.id, input.eventType, input.aggregateId])
}

const insertInbox = async (tx: Transaction, input: {
  workspaceId: string
  recipientHumanActorId: string
  sessionId?: string
  kind: 'session_stale'
  sourceType: string
  sourceId: string
  payload: Record<string, unknown>
}): Promise<void> => {
  await tx.query(`
    INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,session_id,kind,source_type,source_id,payload)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(workspace_id,recipient_human_actor_id,kind,source_type,source_id) DO NOTHING
  `, [input.workspaceId, input.recipientHumanActorId, input.sessionId ?? null, input.kind, input.sourceType, input.sourceId, input.payload])
}

const updateSessionState = async (tx: Transaction, input: {
  id: string
  from: string
  to: 'stale' | 'canceled'
  reason: string
  end?: boolean
}): Promise<UpdatedSession | undefined> => {
  const result = await tx.query<UpdatedSession>(`
    UPDATE agent_sessions
    SET state=$2, state_reason=$3, revision=revision+1, sequence=sequence+1,
        ended_at=CASE WHEN $4 THEN now() ELSE ended_at END, updated_at=now()
    WHERE id=$1 AND state=$5
    RETURNING id, workspace_id AS "workspaceId", revision, sequence::text
  `, [input.id, input.to, input.reason, input.end ?? false, input.from])
  return result.rows[0]
}

export function createSessionLifecycleWorker({
  db,
  workerId = `session-lifecycle-${randomUUID()}`,
  ackTimeoutSeconds = 10,
  heartbeatStaleAfterSeconds = 120,
  stopGraceSeconds = 20,
}: {
  db: Db
  workerId?: string
  ackTimeoutSeconds?: number
  heartbeatStaleAfterSeconds?: number
  stopGraceSeconds?: number
}): SessionLifecycleWorker {
  const expireAckDeadlines = async (limit = 50): Promise<number> => withTx(db, async tx => {
    const candidates = await tx.query<LockedSession>(`
      SELECT s.id, s.workspace_id AS "workspaceId", d.principal_human_actor_id AS "principalHumanActorId", s.state
      FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id
      WHERE s.state='queued' AND s.created_at <= now() - ($1::text || ' seconds')::interval
      ORDER BY s.created_at FOR UPDATE OF s SKIP LOCKED LIMIT $2
    `, [ackTimeoutSeconds, limit])
    let changed = 0
    for (const session of candidates.rows) {
      const updated = await updateSessionState(tx, { id: session.id, from: 'queued', to: 'stale', reason: 'ack_timeout' })
      if (!updated) continue
      const actorId = await systemActorId(tx, updated.workspaceId)
      await appendOutboxEvent(tx, {
        workspaceId: updated.workspaceId, actorId, correlationId: `${workerId}:ack-timeout:${session.id}`,
        eventType: 'agent.session.stale', aggregateType: 'agent_session', aggregateId: session.id,
        revision: updated.revision, sessionId: session.id, sessionSequence: updated.sequence,
        payload: { reason: 'ack_timeout' },
      })
      await insertInbox(tx, {
        workspaceId: updated.workspaceId, recipientHumanActorId: session.principalHumanActorId, sessionId: session.id,
        kind: 'session_stale', sourceType: 'agent_session', sourceId: session.id, payload: { reason: 'ack_timeout' },
      })
      changed += 1
    }
    return changed
  })

  const reconcileHeartbeatLiveness = async (limit = 50): Promise<number> => withTx(db, async tx => {
    const candidates = await tx.query<LockedSession>(`
      SELECT s.id, s.workspace_id AS "workspaceId", d.principal_human_actor_id AS "principalHumanActorId", s.state
      FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id
      WHERE s.state IN ('acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked')
        AND (s.last_heartbeat_at IS NULL OR s.last_heartbeat_at <= now() - ($1::text || ' seconds')::interval)
      ORDER BY COALESCE(s.last_heartbeat_at,s.created_at) FOR UPDATE OF s SKIP LOCKED LIMIT $2
    `, [heartbeatStaleAfterSeconds, limit])
    let changed = 0
    for (const session of candidates.rows) {
      const updated = await updateSessionState(tx, { id: session.id, from: session.state, to: 'stale', reason: 'heartbeat_timeout' })
      if (!updated) continue
      const actorId = await systemActorId(tx, updated.workspaceId)
      await appendOutboxEvent(tx, {
        workspaceId: updated.workspaceId, actorId, correlationId: `${workerId}:heartbeat-timeout:${session.id}`,
        eventType: 'agent.session.stale', aggregateType: 'agent_session', aggregateId: session.id,
        revision: updated.revision, sessionId: session.id, sessionSequence: updated.sequence,
        payload: { reason: 'heartbeat_timeout' },
      })
      await insertInbox(tx, {
        workspaceId: updated.workspaceId, recipientHumanActorId: session.principalHumanActorId, sessionId: session.id,
        kind: 'session_stale', sourceType: 'agent_session', sourceId: session.id, payload: { reason: 'heartbeat_timeout' },
      })
      changed += 1
    }
    return changed
  })

  const expireStopGrace = async (limit = 50): Promise<number> => withTx(db, async tx => {
    const candidates = await tx.query<LockedSession>(`
      SELECT s.id, s.workspace_id AS "workspaceId", d.principal_human_actor_id AS "principalHumanActorId", s.state
      FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id
      WHERE s.state='stopping' AND s.stop_requested_at <= now() - ($1::text || ' seconds')::interval
      ORDER BY s.stop_requested_at FOR UPDATE OF s SKIP LOCKED LIMIT $2
    `, [stopGraceSeconds, limit])
    let changed = 0
    for (const session of candidates.rows) {
      const updated = await updateSessionState(tx, { id: session.id, from: 'stopping', to: 'canceled', reason: 'stop_grace_expired', end: true })
      if (!updated) continue
      const actorId = await systemActorId(tx, updated.workspaceId)
      await appendOutboxEvent(tx, {
        workspaceId: updated.workspaceId, actorId, correlationId: `${workerId}:stop-grace:${session.id}`,
        eventType: 'agent.session.state_changed', aggregateType: 'agent_session', aggregateId: session.id,
        revision: updated.revision, sessionId: session.id, sessionSequence: updated.sequence,
        payload: { previousState: 'stopping', state: 'canceled', reason: 'stop_grace_expired' },
      })
      changed += 1
    }
    return changed
  })

  const expireApprovals = async (limit = 50): Promise<number> => withTx(db, async tx => {
    const candidates = await tx.query<LockedApproval>(`
      SELECT a.id, a.workspace_id AS "workspaceId", a.session_id AS "sessionId"
      FROM approvals a WHERE a.status='pending' AND a.expires_at <= now()
      ORDER BY a.expires_at FOR UPDATE SKIP LOCKED LIMIT $1
    `, [limit])
    let changed = 0
    for (const approval of candidates.rows) {
      const result = await tx.query<{ revision: number }>(`
        UPDATE approvals SET status='expired', revision=revision+1, updated_at=now()
        WHERE id=$1 AND status='pending' RETURNING revision
      `, [approval.id])
      const revision = result.rows[0]?.revision
      if (!revision) continue
      const actorId = await systemActorId(tx, approval.workspaceId)
      await appendOutboxEvent(tx, {
        workspaceId: approval.workspaceId, actorId, correlationId: `${workerId}:approval-expiry:${approval.id}`,
        eventType: 'approval.expired', aggregateType: 'approval', aggregateId: approval.id, revision,
        sessionId: approval.sessionId, payload: { sessionId: approval.sessionId },
      })
      await tx.query(`
        UPDATE inbox_items SET status='resolved', resolved_at=now(), resolved_by_actor_id=$1, updated_at=now()
        WHERE session_id=$2 AND kind='approval' AND source_type='approval' AND source_id=$3 AND status='open'
      `, [actorId, approval.sessionId, approval.id])
      changed += 1
    }
    return changed
  })

  /** Lease expiry is a durable projection update.  It never changes delegation
   * authority; stale/ended sessions simply lose any remaining coordination leases. */
  const expireLeases = async (limit = 50): Promise<number> => withTx(db, async tx => {
    const candidates = await tx.query<{ id:string; workspace_id:string; session_id:string; resource_type:string; resource_id:string }>(`
      SELECT l.id,l.workspace_id,l.session_id,l.resource_type,l.resource_id
      FROM leases l LEFT JOIN agent_sessions s ON s.id=l.session_id
      WHERE l.status='active' AND (l.expires_at <= now() OR s.state IN ('stale','completed','failed','canceled'))
      ORDER BY l.expires_at FOR UPDATE OF l SKIP LOCKED LIMIT $1
    `, [limit])
    let changed = 0
    for (const lease of candidates.rows) {
      const result = await tx.query("UPDATE leases SET status='expired',updated_at=now(),audit_reason='worker expiry' WHERE id=$1 AND status='active' RETURNING id", [lease.id])
      if (!result.rowCount) continue
      const actorId = await systemActorId(tx, lease.workspace_id)
      await appendOutboxEvent(tx, { workspaceId: lease.workspace_id, actorId, correlationId: `${workerId}:lease-expiry:${lease.id}`, eventType: 'lease.expired', aggregateType: 'lease', aggregateId: lease.id, revision: 1, sessionId: lease.session_id, payload: { resourceType: lease.resource_type, resourceId: lease.resource_id } })
      changed += 1
    }
    return changed
  })

  const cleanupAuthIdempotency = async (limit = 100): Promise<{ wiped: number; deleted: number }> => withTx(db, async tx => {
    const wiped = await tx.query(`
      WITH expired AS (
        SELECT id
          FROM auth_idempotency_records
         WHERE state='completed'
           AND replay_wiped_at IS NULL
           AND replay_expires_at <= now()
         ORDER BY replay_expires_at,id
         FOR UPDATE SKIP LOCKED
         LIMIT $1
      )
      UPDATE auth_idempotency_records record
         SET response_status=NULL,replay_key_id=NULL,replay_key_fingerprint=NULL,
             replay_iv=NULL,replay_tag=NULL,replay_ciphertext=NULL,
             replay_wiped_at=now()
        FROM expired
       WHERE record.id=expired.id
       RETURNING record.id
    `, [limit])
    const removed = await tx.query(`
      WITH expired AS (
        SELECT id
          FROM auth_idempotency_records
         WHERE conflict_expires_at <= now()
         ORDER BY conflict_expires_at,id
         FOR UPDATE SKIP LOCKED
         LIMIT $1
      )
      DELETE FROM auth_idempotency_records record
       USING expired
       WHERE record.id=expired.id
       RETURNING record.id
    `, [limit])
    return { wiped: wiped.rowCount ?? 0, deleted: removed.rowCount ?? 0 }
  })

  const tick = async (): Promise<void> => {
    await expireAckDeadlines()
    await reconcileHeartbeatLiveness()
    await expireStopGrace()
    await expireApprovals()
    await expireLeases()
    await cleanupAuthIdempotency()
  }

  return { expireAckDeadlines, reconcileHeartbeatLiveness, expireStopGrace, expireApprovals, expireLeases, cleanupAuthIdempotency, tick }
}
