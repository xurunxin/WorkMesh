import { randomUUID } from 'node:crypto'
import { appendEvent, withTx, type Db } from '@workmesh/db'

type Transaction = Pick<Db, 'query'>

export type SessionLiveness = 'healthy' | 'degraded' | 'stale'

export const classifyHeartbeatLiveness = ({
  lastHeartbeatAt,
  acknowledgedAt,
  createdAt,
  heartbeatIntervalSeconds,
  staleAfterSeconds,
  now = new Date(),
}: {
  /** The first accepted heartbeat becomes the authoritative baseline. */
  lastHeartbeatAt?: Date | string | null
  /** Used until the first heartbeat is accepted. */
  acknowledgedAt?: Date | string | null
  /** Legacy acknowledged sessions may not have acknowledged_at populated. */
  createdAt?: Date | string | null
  heartbeatIntervalSeconds: number
  staleAfterSeconds: number
  now?: Date
}): SessionLiveness => {
  const baselineAt = lastHeartbeatAt ?? acknowledgedAt ?? createdAt ?? null
  if (!baselineAt) return 'stale'
  const ageSeconds = Math.max(0, (now.getTime() - new Date(baselineAt).getTime()) / 1_000)
  if (ageSeconds >= staleAfterSeconds) return 'stale'
  return ageSeconds > heartbeatIntervalSeconds * 2 ? 'degraded' : 'healthy'
}

type LockedSession = { id: string; workspaceId: string; teamId: string; responsibleHumanActorId?: string; state: string; revision?: number; sequence?: string; heartbeatHealth?: SessionLiveness; acknowledgedAt?: Date | null; createdAt?: Date | null; lastHeartbeatAt?: Date | null; heartbeatIntervalSeconds?: number }
type UpdatedSession = { id: string; workspaceId: string; revision: number; sequence: string }
type LockedApproval = { id: string; workspaceId: string; teamId: string; sessionId: string; agentId: string }

export type SessionLifecycleWorker = {
  expireAckDeadlines: (limit?: number) => Promise<number>
  reconcileHeartbeatLiveness: (limit?: number) => Promise<number>
  expireStopGrace: (limit?: number) => Promise<number>
  expireApprovals: (limit?: number) => Promise<number>
  reconcileApprovalAutonomy: (limit?: number) => Promise<number>
  expireLeases: (limit?: number) => Promise<number>
  rebuildExecutorProjections: (workspaceId?: string, workItemId?: string) => Promise<number>
  cleanupAuthIdempotency: (limit?: number) => Promise<{ wiped: number; deleted: number }>
  tick: () => Promise<void>
}

export const rebuildWorkItemExecutorProjections = async (
  db: Transaction,
  workspaceId?: string,
  workItemId?: string,
): Promise<number> => {
  const result = await db.query<{ rebuilt: number }>(
    'SELECT rebuild_work_item_executor_projections($1::uuid,$2::uuid) AS rebuilt',
    [workspaceId ?? null,workItemId ?? null],
  )
  return result.rows[0]?.rebuilt ?? 0
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
}): Promise<string> => {
  return appendEvent(tx, {
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

const queueAgentWebhookDeliveries = async (
  tx: Transaction,
  input: {
    agentId: string
    eventId: string
    eventType: string
    sessionId: string
    payload: Record<string, unknown>
  },
): Promise<void> => {
  const targets = await tx.query<{ endpoint_id: string; version: number }>(
    `SELECT endpoint.id AS endpoint_id,secret.version
       FROM agent_webhook_endpoints endpoint
       JOIN agent_webhook_secrets secret ON secret.endpoint_id=endpoint.id
      WHERE endpoint.agent_id=$1 AND endpoint.is_active
        AND secret.status='active'
        AND (secret.valid_until IS NULL OR secret.valid_until>now())`,
    [input.agentId],
  )
  for (const target of targets.rows)
    await tx.query(
      `INSERT INTO agent_webhook_deliveries(
         agent_id,endpoint_id,secret_version,event_id,delivery_id,event_type,session_id,payload
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.agentId, target.endpoint_id, target.version, input.eventId, randomUUID(), input.eventType, input.sessionId, input.payload],
    )
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
             s.acknowledged_at AS "acknowledgedAt",
             s.created_at AS "createdAt",
             s.last_heartbeat_at AS "lastHeartbeatAt",
             COALESCE((definition.manifest->>'heartbeatIntervalSeconds')::int,30)
               AS "heartbeatIntervalSeconds"
      FROM agent_sessions s
      JOIN delegations d ON d.id=s.delegation_id AND d.workspace_id=s.workspace_id
      JOIN work_items item ON item.id=s.work_item_id AND item.workspace_id=s.workspace_id
      JOIN agent_definitions definition ON definition.id=s.agent_id
      WHERE s.state IN ('acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked')
      ORDER BY COALESCE(s.last_heartbeat_at,s.acknowledged_at,s.created_at)
      FOR UPDATE OF s SKIP LOCKED LIMIT $1
    `,
        [limit],
      );
      let changed = 0;
      for (const session of candidates.rows) {
        const next = classifyHeartbeatLiveness({
          lastHeartbeatAt: session.lastHeartbeatAt ?? null,
          acknowledgedAt: session.acknowledgedAt ?? null,
          createdAt: session.createdAt ?? null,
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
      SELECT a.id, a.workspace_id AS "workspaceId", d.team_id AS "teamId", a.session_id AS "sessionId", s.agent_id AS "agentId"
      FROM approvals a
      JOIN agent_sessions s ON s.id=a.session_id AND s.workspace_id=a.workspace_id
      JOIN delegations d ON d.id=s.delegation_id AND d.workspace_id=s.workspace_id
      WHERE a.status='pending' AND a.expires_at <= now()
      ORDER BY a.expires_at FOR UPDATE OF a SKIP LOCKED LIMIT $1
    `, [limit])
    let changed = 0
    for (const approval of candidates.rows) {
      const result = await tx.query<{ revision: number; updated_at: Date }>(`
        UPDATE approvals SET status='expired', revision=revision+1, updated_at=now()
        WHERE id=$1 AND status='pending' RETURNING revision,updated_at
      `, [approval.id])
      const expired = result.rows[0]
      if (!expired) continue
      const actorId = await systemActorId(tx, approval.workspaceId)
      const payload = { approvalId: approval.id, status: 'expired', expiredAt: expired.updated_at.toISOString() }
      const eventId = await appendOutboxEvent(tx, {
        workspaceId: approval.workspaceId, teamId: approval.teamId, actorId, correlationId: `${workerId}:approval-expiry:${approval.id}`,
        eventType: 'approval.expired', aggregateType: 'approval', aggregateId: approval.id, revision: expired.revision,
        sessionId: approval.sessionId, payload,
      })
      await queueAgentWebhookDeliveries(tx, { agentId: approval.agentId, eventId, eventType: 'approval.expired', sessionId: approval.sessionId, payload: { ...payload, sessionId: approval.sessionId } })
      await tx.query(`
        UPDATE inbox_items SET status='resolved', resolved_at=now(), resolved_by_actor_id=$1, revision=revision+1, updated_at=now()
        WHERE session_id=$2 AND kind='approval' AND source_type='approval' AND source_id=$3 AND status='open'
      `, [actorId, approval.sessionId, approval.id])
      changed += 1
    }
    return changed
  })

  const reconcileApprovalAutonomy = async (limit = 50): Promise<number> => withTx(db, async tx => {
    const reconciliation = (await tx.query<{
      id: string
      workspace_id: string
      policy_revision: number
    }>(`
      SELECT reconciliation.id,reconciliation.workspace_id,reconciliation.policy_revision
        FROM approval_policy_reconciliations reconciliation
       WHERE reconciliation.status IN ('pending','running','completed_with_skips')
         AND EXISTS(
           SELECT 1 FROM approval_policy_reconciliation_items item
            WHERE item.reconciliation_id=reconciliation.id
              AND (
                item.status='pending'
                OR (item.status='skipped' AND item.updated_at<=now()-interval '15 seconds')
              )
         )
       ORDER BY reconciliation.created_at,reconciliation.id
       FOR UPDATE SKIP LOCKED LIMIT 1
    `)).rows[0]
    if (!reconciliation) return 0
    await tx.query(
      `UPDATE approval_policy_reconciliations
          SET status='running',started_at=coalesce(started_at,now()),updated_at=now()
        WHERE id=$1`,
      [reconciliation.id],
    )
    const candidates = await tx.query<{
      approval_id: string
      approval_status: string
      expires_at: Date
      required_approvals: number
      session_id: string
      session_state: string
      session_revision: number
      session_sequence: string
      workspace_id: string
      team_id: string
      agent_id: string
      agent_actor_id: string
      work_item_id: string | null
      project_id: string | null
      policy_mode: 'human_required' | 'yolo'
      current_policy_revision: number
      policy_actor_id: string
      definition_active: boolean
      agent_actor_active: boolean
      principal_active: boolean
      access_active: boolean
      delegation_active: boolean
      capability_active: boolean
      work_item_active: boolean
      project_active: boolean
      project_excluded: boolean
    }>(`
      SELECT approval.id AS approval_id,approval.status AS approval_status,
             approval.expires_at,approval.required_approvals,
             session.id AS session_id,session.state AS session_state,
             session.revision AS session_revision,session.sequence::text AS session_sequence,
             session.workspace_id,coalesce(session.team_id,delegation.team_id) AS team_id,
             session.agent_id,session.agent_actor_id,
             session.work_item_id,coalesce(item.project_id,session.project_id) AS project_id,
             policy.mode AS policy_mode,policy.revision AS current_policy_revision,
             policy.updated_by_actor_id AS policy_actor_id,
             definition.is_active AS definition_active,
             agent_actor.is_active AS agent_actor_active,
             principal.is_active AS principal_active,
             access.revoked_at IS NULL AS access_active,
             delegation.status='active' AS delegation_active,
             ('work:write'=ANY(definition.approved_capabilities)
               AND 'work:write'=ANY(access.approved_capabilities)
               AND 'work:write'=ANY(delegation.permissions_snapshot)) AS capability_active,
             (session.work_item_id IS NULL OR (item.id IS NOT NULL AND item.deleted_at IS NULL)) AS work_item_active,
             (coalesce(item.project_id,session.project_id) IS NULL
               OR (project.id IS NOT NULL AND project.deleted_at IS NULL)) AS project_active,
             EXISTS(
               SELECT 1 FROM approval_autonomy_project_exclusions exclusion
                WHERE exclusion.workspace_id=session.workspace_id
                  AND exclusion.project_id=coalesce(item.project_id,session.project_id)
             ) AS project_excluded
        FROM approval_policy_reconciliation_items reconciliation_item
        JOIN approvals approval ON approval.id=reconciliation_item.approval_id
        JOIN agent_sessions session ON session.id=approval.session_id
        JOIN approval_autonomy_policies policy ON policy.workspace_id=session.workspace_id
        JOIN agent_definitions definition ON definition.id=session.agent_id
        JOIN actors agent_actor ON agent_actor.id=session.agent_actor_id
        JOIN delegations delegation ON delegation.id=session.delegation_id
        JOIN actors principal ON principal.id=delegation.principal_human_actor_id
        LEFT JOIN agent_team_access access
          ON access.workspace_id=session.workspace_id
         AND access.agent_id=session.agent_id
         AND access.team_id=coalesce(session.team_id,delegation.team_id)
        LEFT JOIN work_items item ON item.id=session.work_item_id
        LEFT JOIN projects project ON project.id=coalesce(item.project_id,session.project_id)
       WHERE reconciliation_item.reconciliation_id=$1
         AND (
           reconciliation_item.status='pending'
           OR (reconciliation_item.status='skipped'
             AND reconciliation_item.updated_at<=now()-interval '15 seconds')
         )
       ORDER BY (reconciliation_item.status='pending') DESC,
                reconciliation_item.updated_at,approval.created_at,approval.id
       FOR UPDATE OF reconciliation_item,approval,session SKIP LOCKED LIMIT $2
    `, [reconciliation.id, limit])
    let changed = 0
    let lastError: string | null = null
    for (const candidate of candidates.rows) {
      const reason = candidate.policy_mode !== 'yolo'
        ? 'policy_disabled'
        : candidate.current_policy_revision !== reconciliation.policy_revision
          ? 'policy_revision_changed'
          : candidate.project_excluded
            ? 'project_excluded'
            : candidate.approval_status !== 'pending'
              ? `approval_${candidate.approval_status}`
              : candidate.expires_at.getTime() <= Date.now()
                ? 'approval_expired'
                : !['queued','acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked'].includes(candidate.session_state)
                  ? `session_${candidate.session_state}`
                  : !candidate.definition_active || !candidate.agent_actor_active
                    ? 'agent_inactive'
                    : !candidate.principal_active
                      ? 'principal_inactive'
                      : !candidate.access_active
                        ? 'team_access_revoked'
                        : !candidate.delegation_active
                          ? 'delegation_inactive'
                          : !candidate.capability_active
                            ? 'capability_denied'
                            : !candidate.work_item_active || !candidate.project_active
                              ? 'resource_scope_invalid'
                              : null
      if (reason) {
        lastError = reason
        await tx.query(
          `UPDATE approval_policy_reconciliation_items
              SET status='skipped',attempt_count=attempt_count+1,last_error=$3,updated_at=now()
            WHERE reconciliation_id=$1 AND approval_id=$2`,
          [reconciliation.id, candidate.approval_id, reason],
        )
        continue
      }
      const inserted = await tx.query<{
        actor_id: string
        decision: 'approved'
        reason: string
        source: 'workspace_policy'
        policy_workspace_id: string
        policy_revision: number
        decided_at: Date
      }>(
        `INSERT INTO approval_decisions(
           approval_id,actor_id,decision,reason,source,policy_workspace_id,policy_revision
         ) VALUES($1,$2,'approved','Approved by workspace YOLO policy reconciliation',
                  'workspace_policy',$3,$4)
         ON CONFLICT DO NOTHING
         RETURNING actor_id,decision,reason,source,policy_workspace_id,policy_revision,decided_at`,
        [candidate.approval_id, candidate.policy_actor_id, candidate.workspace_id, reconciliation.policy_revision],
      )
      const updated = await tx.query<{ revision: number; updated_at: Date }>(
        `UPDATE approvals SET status='approved',revision=revision+1,updated_at=now()
          WHERE id=$1 AND status='pending' AND expires_at>now()
          RETURNING revision,updated_at`,
        [candidate.approval_id],
      )
      if (!updated.rowCount) {
        lastError = 'approval_changed'
        await tx.query(
          `UPDATE approval_policy_reconciliation_items
              SET status='skipped',attempt_count=attempt_count+1,last_error='approval_changed',updated_at=now()
            WHERE reconciliation_id=$1 AND approval_id=$2`,
          [reconciliation.id, candidate.approval_id],
        )
        continue
      }
      const revision = updated.rows[0]!.revision
      const decisionRow = inserted.rows[0] ?? (await tx.query<{
        actor_id: string; decision: 'approved'; reason: string; source: 'workspace_policy'
        policy_workspace_id: string; policy_revision: number; decided_at: Date
      }>(
        `SELECT actor_id,decision,reason,source,policy_workspace_id,policy_revision,decided_at
           FROM approval_decisions
          WHERE approval_id=$1 AND source='workspace_policy'
          ORDER BY decided_at,id LIMIT 1`,
        [candidate.approval_id],
      )).rows[0]!
      const quorum = { required: candidate.required_approvals, approved: 1, rejected: 0, reached: true }
      const decision = { ...decisionRow, decided_at: decisionRow.decided_at.toISOString() }
      const decisionPayload = { approvalId: candidate.approval_id, decision, quorum, status: 'approved' }
      const decisionEventId = await appendOutboxEvent(tx, {
        workspaceId: candidate.workspace_id, teamId: candidate.team_id,
        actorId: candidate.policy_actor_id,
        correlationId: `${workerId}:approval-policy:${reconciliation.id}:${candidate.approval_id}:decision`,
        eventType: 'approval.decision.recorded', aggregateType: 'approval',
        aggregateId: candidate.approval_id, revision, sessionId: candidate.session_id,
        sessionSequence: candidate.session_sequence, payload: decisionPayload,
      })
      await queueAgentWebhookDeliveries(tx, {
        agentId: candidate.agent_id, eventId: decisionEventId,
        eventType: 'approval.decision.recorded', sessionId: candidate.session_id,
        payload: { ...decisionPayload, sessionId: candidate.session_id },
      })
      const approvedPayload = {
        approvalId: candidate.approval_id,
        status: 'approved',
        quorum,
        finalizedAt: updated.rows[0]!.updated_at.toISOString(),
      }
      const approvedEventId = await appendOutboxEvent(tx, {
        workspaceId: candidate.workspace_id, teamId: candidate.team_id,
        actorId: candidate.policy_actor_id,
        correlationId: `${workerId}:approval-policy:${reconciliation.id}:${candidate.approval_id}:approved`,
        eventType: 'approval.approved', aggregateType: 'approval',
        aggregateId: candidate.approval_id, revision, sessionId: candidate.session_id,
        sessionSequence: candidate.session_sequence, payload: approvedPayload,
      })
      await queueAgentWebhookDeliveries(tx, {
        agentId: candidate.agent_id, eventId: approvedEventId,
        eventType: 'approval.approved', sessionId: candidate.session_id,
        payload: { ...approvedPayload, sessionId: candidate.session_id },
      })
      await appendOutboxEvent(tx, {
        workspaceId: candidate.workspace_id, teamId: candidate.team_id,
        actorId: candidate.policy_actor_id,
        correlationId: `${workerId}:approval-policy:${reconciliation.id}:${candidate.approval_id}:auto-approved`,
        eventType: 'approval.auto_approved', aggregateType: 'approval',
        aggregateId: candidate.approval_id, revision, sessionId: candidate.session_id,
        sessionSequence: candidate.session_sequence,
        payload: { approvalId: candidate.approval_id, policyRevision: reconciliation.policy_revision, projectId: candidate.project_id },
      })
      await tx.query(
        `UPDATE inbox_items SET status='resolved',resolved_at=now(),resolved_by_actor_id=$1,
                revision=revision+1,updated_at=now()
          WHERE workspace_id=$2 AND source_type='approval' AND source_id=$3 AND status='open'`,
        [candidate.policy_actor_id, candidate.workspace_id, candidate.approval_id],
      )
      await tx.query(
        `UPDATE approval_policy_reconciliation_items
            SET status='approved',attempt_count=attempt_count+1,last_error=NULL,updated_at=now()
          WHERE reconciliation_id=$1 AND approval_id=$2`,
        [reconciliation.id, candidate.approval_id],
      )
      changed += 1
    }
    const counts = (await tx.query<{
      total: number; approved: number; skipped: number; pending: number
    }>(`
      SELECT count(*)::int AS total,
             count(*) FILTER(WHERE status='approved')::int AS approved,
             count(*) FILTER(WHERE status='skipped')::int AS skipped,
             count(*) FILTER(WHERE status='pending')::int AS pending
        FROM approval_policy_reconciliation_items WHERE reconciliation_id=$1
    `, [reconciliation.id])).rows[0]!
    await tx.query(
      `UPDATE approval_policy_reconciliations
          SET processed_count=$2,approved_count=$3,skipped_count=$4,last_error=$5,
              status=CASE WHEN $6>0 THEN 'running'::approval_policy_reconciliation_status
                          WHEN $4>0 THEN 'completed_with_skips'::approval_policy_reconciliation_status
                          ELSE 'completed'::approval_policy_reconciliation_status END,
              completed_at=CASE WHEN $6=0 THEN now() ELSE NULL END,updated_at=now()
        WHERE id=$1`,
      [reconciliation.id, counts.total - counts.pending, counts.approved, counts.skipped, lastError, counts.pending],
    )
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

  const rebuildExecutorProjections = async (
    workspaceId?: string,
    workItemId?: string,
  ): Promise<number> => withTx(
    db,
    tx => rebuildWorkItemExecutorProjections(tx,workspaceId,workItemId),
  )

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
    await reconcileApprovalAutonomy()
    await expireLeases()
    await cleanupAuthIdempotency()
  }

  return { expireAckDeadlines, reconcileHeartbeatLiveness, expireStopGrace, expireApprovals, reconcileApprovalAutonomy, expireLeases, rebuildExecutorProjections, cleanupAuthIdempotency, tick }
}
