import { randomUUID } from 'node:crypto'
import { appendEvent, withTx, type Db } from '@workmesh/db'

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

type LockedSession = { id: string; workspaceId: string; teamId: string; responsibleHumanActorId?: string; state: string; revision?: number; sequence?: string; heartbeatHealth?: SessionLiveness; lastHeartbeatAt?: Date | null; heartbeatIntervalSeconds?: number }
type UpdatedSession = { id: string; workspaceId: string; revision: number; sequence: string }
type LockedApproval = { id: string; workspaceId: string; teamId: string; sessionId: string }

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
  teamId: string
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
  await appendEvent(tx, {
    workspaceId: input.workspaceId,
    teamId: input.teamId,
    actorId: input.actorId,
    correlationId: input.correlationId,
    type: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    revision: input.revision,
    sessionId: input.sessionId,
    sessionSequence: input.sessionSequence,
    payload: input.payload,
  })
}

const insertInbox = async (tx: Transaction, input: {
  workspaceId: string
  recipientHumanActorId: string
  sessionId?: string
  teamId: string
  kind: 'session_stale'
  sourceType: string
  sourceId: string
  payload: Record<string, unknown>
}): Promise<void> => {
  await tx.query(`
    INSERT INTO inbox_items(
      workspace_id,recipient_human_actor_id,recipient_actor_id,
      session_id,team_id,kind,source_type,source_id,payload
    )
    VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(workspace_id,recipient_human_actor_id,kind,source_type,source_id) DO NOTHING
  `, [input.workspaceId, input.recipientHumanActorId, input.sessionId ?? null, input.teamId, input.kind, input.sourceType, input.sourceId, input.payload])
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
    SET state=$2::agent_session_state, state_reason=$3, revision=revision+1, sequence=sequence+1,
        heartbeat_health=CASE WHEN $2::agent_session_state='stale' THEN 'stale' ELSE heartbeat_health END,
        heartbeat_health_changed_at=CASE WHEN $2::agent_session_state='stale' AND heartbeat_health<>'stale' THEN now() ELSE heartbeat_health_changed_at END,
        heartbeat_checked_at=CASE WHEN $2::agent_session_state='stale' THEN now() ELSE heartbeat_checked_at END,
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
      SELECT s.id, s.workspace_id AS "workspaceId", d.team_id AS "teamId",
             item.responsible_human_actor_id AS "responsibleHumanActorId", s.state
      FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id AND d.workspace_id=s.workspace_id
      JOIN work_items item ON item.id=s.work_item_id AND item.workspace_id=s.workspace_id
      WHERE s.state='queued' AND s.created_at <= now() - ($1::text || ' seconds')::interval
      ORDER BY s.created_at FOR UPDATE OF s SKIP LOCKED LIMIT $2
    `, [ackTimeoutSeconds, limit])
    let changed = 0
    for (const session of candidates.rows) {
      const updated = await updateSessionState(tx, { id: session.id, from: 'queued', to: 'stale', reason: 'ack_timeout' })
      if (!updated) continue
      const actorId = await systemActorId(tx, updated.workspaceId)
      await appendOutboxEvent(tx, {
        workspaceId: updated.workspaceId, teamId: session.teamId, actorId, correlationId: `${workerId}:ack-timeout:${session.id}`,
        eventType: 'agent.session.stale', aggregateType: 'agent_session', aggregateId: session.id,
        revision: updated.revision, sessionId: session.id, sessionSequence: updated.sequence,
        payload: { reason: 'ack_timeout' },
      })
      await insertInbox(tx, {
        workspaceId: updated.workspaceId, recipientHumanActorId: session.responsibleHumanActorId!, sessionId: session.id,
        teamId: session.teamId, kind: 'session_stale', sourceType: 'agent_session', sourceId: session.id, payload: { reason: 'ack_timeout' },
      })
      changed += 1
    }
    return changed
  })

  const reconcileHeartbeatLiveness = async (limit = 50): Promise<number> =>
    withTx(db, async (tx) => {
      const candidates = await tx.query<LockedSession>(
        `
      SELECT s.id,s.workspace_id AS "workspaceId",d.team_id AS "teamId",
             item.responsible_human_actor_id AS "responsibleHumanActorId",s.state,
             s.revision,s.sequence::text AS sequence,
             s.heartbeat_health AS "heartbeatHealth",
             s.last_heartbeat_at AS "lastHeartbeatAt",
             COALESCE((definition.manifest->>'heartbeatIntervalSeconds')::int,30)
               AS "heartbeatIntervalSeconds"
      FROM agent_sessions s
      JOIN delegations d ON d.id=s.delegation_id AND d.workspace_id=s.workspace_id
      JOIN work_items item ON item.id=s.work_item_id AND item.workspace_id=s.workspace_id
      JOIN agent_definitions definition ON definition.id=s.agent_id
      WHERE s.state IN ('acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked')
      ORDER BY COALESCE(s.last_heartbeat_at,s.created_at)
      FOR UPDATE OF s SKIP LOCKED LIMIT $1
    `,
        [limit],
      );
      let changed = 0;
      for (const session of candidates.rows) {
        const next = classifyHeartbeatLiveness({
          lastHeartbeatAt: session.lastHeartbeatAt ?? null,
          heartbeatIntervalSeconds: session.heartbeatIntervalSeconds ?? 30,
          staleAfterSeconds: heartbeatStaleAfterSeconds,
        });
        if (next === session.heartbeatHealth) continue;
        const actorId = await systemActorId(tx, session.workspaceId);
        if (next === "stale") {
          const updated = (
            await tx.query<UpdatedSession>(
              `
          UPDATE agent_sessions
             SET state='stale',state_reason='heartbeat_timeout',
                 heartbeat_health='stale',heartbeat_health_changed_at=now(),
                 heartbeat_checked_at=now(),revision=revision+1,
                 sequence=sequence+1,updated_at=now()
           WHERE id=$1 AND state=$2 AND heartbeat_health=$3
           RETURNING id,workspace_id AS "workspaceId",revision,sequence::text
        `,
              [session.id, session.state, session.heartbeatHealth],
            )
          ).rows[0];
          if (!updated) continue;
          await appendOutboxEvent(tx, {
            workspaceId: updated.workspaceId,
            teamId: session.teamId,
            actorId,
            correlationId: `${workerId}:heartbeat-stale:${session.id}`,
            eventType: "agent.session.stale",
            aggregateType: "agent_session",
            aggregateId: session.id,
            revision: updated.revision,
            sessionId: session.id,
            sessionSequence: updated.sequence,
            payload: {
              reason: "heartbeat_timeout",
              fromHealth: session.heartbeatHealth,
              toHealth: "stale",
            },
          });
          await insertInbox(tx, {
            workspaceId: updated.workspaceId,
            recipientHumanActorId: session.responsibleHumanActorId!,
            sessionId: session.id,
            teamId: session.teamId,
            kind: "session_stale",
            sourceType: "agent_session",
            sourceId: session.id,
            payload: { reason: "heartbeat_timeout" },
          });
        } else {
          const projected = await tx.query(
            `
          UPDATE agent_sessions
             SET heartbeat_health=$2,heartbeat_health_changed_at=now(),
                 heartbeat_checked_at=now(),updated_at=now()
           WHERE id=$1 AND heartbeat_health=$3
           RETURNING id
        `,
            [session.id, next, session.heartbeatHealth],
          );
          if (!projected.rowCount) continue;
          await appendOutboxEvent(tx, {
            workspaceId: session.workspaceId,
            teamId: session.teamId,
            actorId,
            correlationId: `${workerId}:heartbeat-health:${session.id}:${next}`,
            eventType: "agent.session.health_changed",
            aggregateType: "agent_session",
            aggregateId: session.id,
            revision: session.revision ?? 1,
            sessionId: session.id,
            sessionSequence: session.sequence,
            payload: {
              from: session.heartbeatHealth,
              to: next,
              reason: "heartbeat_age",
            },
          });
        }
        changed += 1;
      }
      return changed;
    });

  const expireStopGrace = async (limit = 50): Promise<number> => withTx(db, async tx => {
    const candidates = await tx.query<LockedSession>(`
      SELECT s.id, s.workspace_id AS "workspaceId", d.team_id AS "teamId", s.state
      FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id AND d.workspace_id=s.workspace_id
      WHERE s.state='stopping' AND s.stop_requested_at <= now() - ($1::text || ' seconds')::interval
      ORDER BY s.stop_requested_at FOR UPDATE OF s SKIP LOCKED LIMIT $2
    `, [stopGraceSeconds, limit])
    let changed = 0
    for (const session of candidates.rows) {
      const updated = await updateSessionState(tx, { id: session.id, from: 'stopping', to: 'canceled', reason: 'stop_grace_expired', end: true })
      if (!updated) continue
      const actorId = await systemActorId(tx, updated.workspaceId)
      await appendOutboxEvent(tx, {
        workspaceId: updated.workspaceId, teamId: session.teamId, actorId, correlationId: `${workerId}:stop-grace:${session.id}`,
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
      SELECT a.id, a.workspace_id AS "workspaceId", d.team_id AS "teamId", a.session_id AS "sessionId"
      FROM approvals a
      JOIN agent_sessions s ON s.id=a.session_id AND s.workspace_id=a.workspace_id
      JOIN delegations d ON d.id=s.delegation_id AND d.workspace_id=s.workspace_id
      WHERE a.status='pending' AND a.expires_at <= now()
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
        workspaceId: approval.workspaceId, teamId: approval.teamId, actorId, correlationId: `${workerId}:approval-expiry:${approval.id}`,
        eventType: 'approval.expired', aggregateType: 'approval', aggregateId: approval.id, revision,
        sessionId: approval.sessionId, payload: { sessionId: approval.sessionId },
      })
      await tx.query(`
        UPDATE inbox_items SET status='resolved', resolved_at=now(), resolved_by_actor_id=$1, revision=revision+1, updated_at=now()
        WHERE session_id=$2 AND kind='approval' AND source_type='approval' AND source_id=$3 AND status='open'
      `, [actorId, approval.sessionId, approval.id])
      changed += 1
    }
    return changed
  })

  /** Lease expiry is a durable projection update.  It never changes delegation
   * authority; stale/ended sessions simply lose any remaining coordination leases. */
  const expireLeases = async (limit = 50): Promise<number> => withTx(db, async tx => {
    const candidates = await tx.query<{ id:string; workspace_id:string; team_id:string; session_id:string; resource_type:string; resource_id:string }>(`
      SELECT l.id,l.workspace_id,d.team_id,l.session_id,l.resource_type,l.resource_id
      FROM leases l
      JOIN agent_sessions s ON s.id=l.session_id AND s.workspace_id=l.workspace_id
      JOIN delegations d ON d.id=s.delegation_id AND d.workspace_id=s.workspace_id
      WHERE l.status='active' AND (l.expires_at <= now() OR s.state IN ('stale','completed','failed','canceled'))
      ORDER BY l.expires_at FOR UPDATE OF l SKIP LOCKED LIMIT $1
    `, [limit])
    let changed = 0
    for (const lease of candidates.rows) {
      const result = await tx.query("UPDATE leases SET status='expired',updated_at=now(),audit_reason='worker expiry' WHERE id=$1 AND status='active' RETURNING id", [lease.id])
      if (!result.rowCount) continue
      const actorId = await systemActorId(tx, lease.workspace_id)
      await appendOutboxEvent(tx, { workspaceId: lease.workspace_id, teamId: lease.team_id, actorId, correlationId: `${workerId}:lease-expiry:${lease.id}`, eventType: 'lease.expired', aggregateType: 'lease', aggregateId: lease.id, revision: 1, sessionId: lease.session_id, payload: { resourceType: lease.resource_type, resourceId: lease.resource_id } })
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
