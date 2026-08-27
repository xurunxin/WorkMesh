import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import {
  approvalAutonomyPolicyInputSchema,
  approvalAutonomyPolicySchema,
  browserPushConfigResponseSchema,
  browserPushSubscriptionInputSchema,
  browserPushSubscriptionSchema,
} from '@workmesh/contracts'
import { appendEvent } from '@workmesh/db'
import { assertRevision, DomainError, parseRevision } from '@workmesh/domain'
import { mutate, type CommandContext } from './commands.js'
import type { ApiActor, RequestMeta } from './agent/types.js'

type PolicyRow = {
  workspace_id: string
  mode: 'human_required' | 'yolo'
  revision: number
  updated_by_actor_id: string
  created_at: Date
  updated_at: Date
}

type ReconciliationRow = {
  id: string
  status: 'pending' | 'running' | 'completed' | 'completed_with_skips'
  processed_count: number
  approved_count: number
  skipped_count: number
  pending_count: number
  last_error: string | null
  created_at: Date
  updated_at: Date
  completed_at: Date | null
}

type SubscriptionRow = {
  id: string
  device_id: string
  endpoint_hash: string
  status: 'active' | 'revoked' | 'invalid'
  revision: number
  last_delivered_at: Date | null
  last_failure_at: Date | null
  last_failure_code: string | null
  revoked_at: Date | null
  created_at: Date
  updated_at: Date
}

const one = <T>(rows: readonly T[], code = 'NOT_FOUND'): T => {
  const row = rows[0]
  if (!row) throw new DomainError(code, 'Resource not found')
  return row
}

const requireHuman = (actor: ApiActor): void => {
  if (actor.kind !== 'human') throw new DomainError('FORBIDDEN', 'Human access is required')
}

const requireAdmin = (actor: ApiActor): void => {
  if (actor.kind !== 'human' || actor.workspaceRole !== 'admin')
    throw new DomainError('FORBIDDEN', 'Workspace Admin is required')
}

const endpointFingerprint = (endpoint: string): string =>
  `sha256:${createHash('sha256').update(endpoint).digest('hex')}`

const subscriptionResponse = (row: SubscriptionRow) => browserPushSubscriptionSchema.parse({
  id: row.id,
  device_id: row.device_id,
  endpoint_fingerprint: row.endpoint_hash,
  status: row.status,
  last_delivery_status: row.last_failure_code
    ?? (row.last_delivered_at ? 'delivered' : null),
  last_delivery_at: row.last_delivered_at?.toISOString() ?? null,
  revision: row.revision,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
  revoked_at: row.revoked_at?.toISOString() ?? null,
})

async function loadPolicyResponse(
  db: Pick<Pool, 'query'> | PoolClient,
  actor: ApiActor,
) {
  const policy = (await db.query<PolicyRow>(
    'SELECT * FROM approval_autonomy_policies WHERE workspace_id=$1',
    [actor.workspaceId],
  )).rows[0]
  if (!policy) {
    const now = new Date().toISOString()
    return approvalAutonomyPolicySchema.parse({
      workspace_id: actor.workspaceId,
      mode: 'human_required',
      excluded_project_ids: [],
      revision: 1,
      updated_by_actor_id: actor.id,
      created_at: now,
      updated_at: now,
      reconciliation: null,
    })
  }
  const [exclusions, reconciliation] = await Promise.all([
    db.query<{ project_id: string }>(
      'SELECT project_id FROM approval_autonomy_project_exclusions WHERE workspace_id=$1 ORDER BY project_id',
      [actor.workspaceId],
    ),
    db.query<ReconciliationRow>(
      `SELECT reconciliation.*,
              (SELECT count(*)::int FROM approval_policy_reconciliation_items item
                WHERE item.reconciliation_id=reconciliation.id AND item.status='pending') AS pending_count
         FROM approval_policy_reconciliations reconciliation
        WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`,
      [actor.workspaceId],
    ),
  ])
  const task = reconciliation.rows[0]
  return approvalAutonomyPolicySchema.parse({
    ...policy,
    excluded_project_ids: exclusions.rows.map(row => row.project_id),
    created_at: policy.created_at.toISOString(),
    updated_at: policy.updated_at.toISOString(),
    reconciliation: task ? {
      id: task.id,
      status: task.status,
      pending_count: task.pending_count,
      completed_count: task.approved_count,
      skipped_count: task.skipped_count,
      last_skip_reason: task.last_error,
      created_at: task.created_at.toISOString(),
      updated_at: task.updated_at.toISOString(),
      completed_at: task.completed_at?.toISOString() ?? null,
    } : null,
  })
}

export function registerAutonomousControlPlaneRoutes(app: FastifyInstance, input: {
  db: Pool
  webPushPublicKey?: string
  webPushConfigured: boolean
  meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta
  header: (request: FastifyRequest, name: string) => string | undefined
}): void {
  const { db, meta, header } = input
  const id = (request: FastifyRequest) => (request.params as { id: string }).id

  app.get('/api/v1/approval-autonomy-policy', async request => {
    const actor = request.actor as ApiActor
    requireHuman(actor)
    return loadPolicyResponse(db, actor)
  })

  app.put('/api/v1/approval-autonomy-policy', async request => {
    const body = approvalAutonomyPolicyInputSchema.parse(request.body)
    const context = meta(request, body)
    requireAdmin(context.actor)
    return mutate(db, context as unknown as CommandContext, async tx => {
      const current = (await tx.query<PolicyRow>(
        'SELECT * FROM approval_autonomy_policies WHERE workspace_id=$1 FOR UPDATE',
        [context.actor.workspaceId],
      )).rows[0]
      assertRevision(parseRevision(header(request, 'if-match')), current?.revision ?? 1)
      if (body.excludedProjectIds.length) {
        const projects = await tx.query<{ id: string }>(
          `SELECT id FROM projects
            WHERE workspace_id=$1 AND deleted_at IS NULL AND id=ANY($2::uuid[])
            ORDER BY id
            FOR UPDATE`,
          [context.actor.workspaceId, body.excludedProjectIds],
        )
        if (projects.rowCount !== body.excludedProjectIds.length)
          throw new DomainError('NOT_FOUND', 'One or more excluded Projects were not found')
      }
      const policy = current
        ? one((await tx.query<PolicyRow>(
            `UPDATE approval_autonomy_policies
                SET mode=$2,revision=revision+1,updated_by_actor_id=$3,updated_at=now()
              WHERE workspace_id=$1 RETURNING *`,
            [context.actor.workspaceId, body.mode, context.actor.id],
          )).rows)
        : one((await tx.query<PolicyRow>(
            `INSERT INTO approval_autonomy_policies(workspace_id,mode,updated_by_actor_id)
             VALUES($1,$2,$3) RETURNING *`,
            [context.actor.workspaceId, body.mode, context.actor.id],
          )).rows)
      await tx.query(
        'DELETE FROM approval_autonomy_project_exclusions WHERE workspace_id=$1',
        [context.actor.workspaceId],
      )
      for (const projectId of body.excludedProjectIds) {
        await tx.query(
          `INSERT INTO approval_autonomy_project_exclusions(
             workspace_id,project_id,policy_revision,created_by_actor_id
           ) VALUES($1,$2,$3,$4)`,
          [context.actor.workspaceId, projectId, policy.revision, context.actor.id],
        )
      }
      if (body.mode === 'yolo') {
        const reconciliation = one((await tx.query<{ id: string }>(
          `INSERT INTO approval_policy_reconciliations(workspace_id,policy_revision,status)
           VALUES($1,$2,'pending')
           ON CONFLICT(workspace_id,policy_revision)
           DO UPDATE SET updated_at=approval_policy_reconciliations.updated_at
           RETURNING id`,
          [context.actor.workspaceId, policy.revision],
        )).rows)
        await tx.query(
          `INSERT INTO approval_policy_reconciliation_items(reconciliation_id,approval_id)
           SELECT $1,approval.id
             FROM approvals approval
             JOIN agent_sessions session ON session.id=approval.session_id
             LEFT JOIN work_items item ON item.id=session.work_item_id
            WHERE approval.workspace_id=$2
              AND approval.status='pending' AND approval.expires_at>now()
              AND NOT EXISTS(
                SELECT 1 FROM approval_autonomy_project_exclusions exclusion
                 WHERE exclusion.workspace_id=approval.workspace_id
                   AND exclusion.project_id=coalesce(item.project_id,session.project_id)
              )
           ON CONFLICT DO NOTHING`,
          [reconciliation.id, context.actor.workspaceId],
        )
      }
      await appendEvent(tx, {
        workspaceId: context.actor.workspaceId,
        actorId: context.actor.id,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
        type: 'approval.autonomy_policy.updated',
        aggregateType: 'approval_autonomy_policy',
        aggregateId: context.actor.workspaceId,
        revision: policy.revision,
        payload: { mode: body.mode, excludedProjectIds: body.excludedProjectIds },
        resources: { scopes: [{ type: 'workspace', id: context.actor.workspaceId }], invalidates: [{ type: 'workspace', id: context.actor.workspaceId }] },
      })
      return loadPolicyResponse(tx, context.actor)
    })
  })

  app.get('/api/v1/browser-push/config', async request => {
    requireHuman(request.actor as ApiActor)
    return browserPushConfigResponseSchema.parse({
      configured: input.webPushConfigured,
      public_key: input.webPushConfigured ? input.webPushPublicKey ?? null : null,
    })
  })

  app.get('/api/v1/browser-push/subscriptions', async request => {
    const actor = request.actor as ApiActor
    requireHuman(actor)
    const rows = await db.query<SubscriptionRow>(
      `SELECT * FROM browser_push_subscriptions
        WHERE workspace_id=$1 AND actor_id=$2
        ORDER BY (status='active') DESC,updated_at DESC,id DESC`,
      [actor.workspaceId, actor.id],
    )
    return { items: rows.rows.map(subscriptionResponse), nextCursor: null }
  })

  app.post('/api/v1/browser-push/subscriptions', async (request, reply) => {
    const body = browserPushSubscriptionInputSchema.parse(request.body)
    const context = meta(request, body)
    requireHuman(context.actor)
    if (!input.webPushConfigured)
      throw new DomainError('FEATURE_DISABLED', 'Browser Push is not configured; in-app approvals remain available')
    const fingerprint = endpointFingerprint(body.endpoint)
    const result = await mutate(db, context as unknown as CommandContext, async tx => {
      await tx.query(
        `SELECT id FROM browser_push_subscriptions
          WHERE workspace_id=$1 AND actor_id=$2
            AND status='active' AND (device_id=$3 OR endpoint_hash=$4)
          FOR UPDATE`,
        [context.actor.workspaceId, context.actor.id, body.deviceId, fingerprint],
      )
      await tx.query(
        `UPDATE browser_push_subscriptions
            SET status='revoked',revoked_at=now(),revision=revision+1,updated_at=now()
          WHERE workspace_id=$1 AND actor_id=$2
            AND status='active' AND (device_id=$3 OR endpoint_hash=$4)`,
        [context.actor.workspaceId, context.actor.id, body.deviceId, fingerprint],
      )
      const row = one((await tx.query<SubscriptionRow>(
        `INSERT INTO browser_push_subscriptions(
           workspace_id,actor_id,device_id,endpoint,endpoint_hash,p256dh,auth_secret,user_agent
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [context.actor.workspaceId, context.actor.id, body.deviceId, body.endpoint, fingerprint, body.keys.p256dh, body.keys.auth, request.headers['user-agent'] ?? null],
      )).rows)
      await appendEvent(tx, {
        workspaceId: context.actor.workspaceId,
        actorId: context.actor.id,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
        type: 'browser_push.subscription.created',
        aggregateType: 'browser_push_subscription',
        aggregateId: row.id,
        audienceActorId: context.actor.id,
        revision: row.revision,
        payload: { subscriptionId: row.id, deviceId: row.device_id, endpointFingerprint: row.endpoint_hash },
      })
      return subscriptionResponse(row)
    })
    return reply.code(201).send(result)
  })

  app.delete('/api/v1/browser-push/subscriptions/:id', async (request, reply) => {
    const context = meta(request, {}, { id: id(request) })
    requireHuman(context.actor)
    await mutate(db, context as unknown as CommandContext, async tx => {
      const row = one((await tx.query<SubscriptionRow>(
        `SELECT * FROM browser_push_subscriptions
          WHERE id=$1 AND workspace_id=$2 AND actor_id=$3 FOR UPDATE`,
        [id(request), context.actor.workspaceId, context.actor.id],
      )).rows, 'BROWSER_PUSH_SUBSCRIPTION_NOT_FOUND')
      assertRevision(parseRevision(header(request, 'if-match')), row.revision)
      if (row.status === 'active') {
        const revoked = one((await tx.query<SubscriptionRow>(
          `UPDATE browser_push_subscriptions
              SET status='revoked',revoked_at=now(),revision=revision+1,updated_at=now()
            WHERE id=$1 RETURNING *`,
          [row.id],
        )).rows)
        await appendEvent(tx, {
          workspaceId: context.actor.workspaceId,
          actorId: context.actor.id,
          correlationId: context.correlationId,
          idempotencyKey: context.idempotencyKey,
          type: 'browser_push.subscription.revoked',
          aggregateType: 'browser_push_subscription',
          aggregateId: row.id,
          audienceActorId: context.actor.id,
          revision: revoked.revision,
          payload: { subscriptionId: row.id },
        })
      }
      return { revoked: true }
    })
    return reply.code(204).send()
  })
}
