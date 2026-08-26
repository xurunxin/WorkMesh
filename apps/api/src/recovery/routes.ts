import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import {
  recoveryConditionSchema,
  recoveryItemSchema,
  recoveryLifecycleSchema,
} from '@workmesh/contracts'
import { DomainError } from '@workmesh/domain'
import type { ApiActor } from '../agent/types.js'
import {
  liveHumanTeamReadPredicate,
  liveSessionReadPredicate,
} from '../live-read-authorization.js'
import type { Paginator } from '../pagination.js'
import {
  projectRecoveryRow,
  recoveryProjectionSql,
  type RecoveryRow,
} from './projection.js'

type Helpers = Readonly<{ db: Pool; paginator: Paginator }>

const listQuerySchema = z.object({
  lifecycle: recoveryLifecycleSchema.optional(),
  condition: recoveryConditionSchema.optional(),
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
  projectId: z.string().uuid().optional(),
  workItemId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
})
const recoveryIdSchema = z.string().regex(/^v1:[a-z_]+:[0-9a-f-]{36}$/)
const actor = (request: FastifyRequest): ApiActor => request.actor as ApiActor

export function recoveryAuthorizationPredicate(current: ApiActor, values: unknown[]): string {
  if (current.kind === 'human')
    return liveHumanTeamReadPredicate(current, 'recovery.workspace_id', 'recovery.team_id', values)
  return liveSessionReadPredicate(current, 'recovery.session_id', 'recovery.workspace_id', values)
}

const overallFreshness = (
  items: ReturnType<typeof projectRecoveryRow>[],
  observedAt: Date,
) => {
  const state = items.some(item => item.freshness.state === 'partial')
    ? 'partial' as const
    : items.some(item => item.freshness.state === 'stale')
      ? 'stale' as const
      : 'current' as const
  const sourceUpdatedAt = items.reduce<string | null>((latest, item) => !latest || item.source.updatedAt > latest ? item.source.updatedAt : latest, null)
    ?? observedAt.toISOString()
  return { state, observedAt: observedAt.toISOString(), sourceUpdatedAt }
}

export function registerRecoveryRoutes(app: FastifyInstance, h: Helpers): void {
  app.get('/api/v1/recovery-items', async request => {
    const query = listQuerySchema.parse(request.query)
    const current = actor(request)
    const values: unknown[] = [current.workspaceId]
    const where = [recoveryAuthorizationPredicate(current, values)]
    const add = (sql: string, value: unknown): void => {
      if (value === undefined) return
      values.push(value)
      where.push(`${sql}=$${values.length}`)
    }
    add('recovery.lifecycle', query.lifecycle)
    add('recovery.condition', query.condition)
    add('recovery.project_id', query.projectId)
    add('recovery.work_item_id', query.workItemId)
    add('recovery.session_id', query.sessionId)
    if (query.severity === 'critical') where.push("recovery.condition IN ('lease_lost','budget_exhausted','validation_attempts_exhausted')")
    if (query.severity === 'high') where.push("recovery.condition IN ('session_failed','session_stale','heartbeat_timeout','assignment_without_active_executor','approval_expired')")
    if (query.severity === 'medium') where.push("recovery.condition IN ('missing_first_heartbeat','session_canceled','session_blocked','completion_evidence_missing')")
    if (query.severity === 'low' || query.severity === 'info') where.push('false')
    const page = await h.paginator.query<RecoveryRow>(
      h.db,
      request,
      request.query,
      {
        route: '/api/v1/recovery-items',
        filters: query,
        sort: [
          { key: 'happened_cursor', sql: `to_char(recovery.happened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, direction: 'DESC' },
          { key: 'condition', sql: 'recovery.condition', direction: 'DESC' },
          { key: 'source_id', sql: 'recovery.source_id', direction: 'DESC' },
        ],
      },
      `${recoveryProjectionSql} AND ${where.join(' AND ')}`,
      values,
    )
    const observedAt = new Date()
    const items = page.items.map(row => projectRecoveryRow(row, observedAt))
    return { ...page, items, freshness: overallFreshness(items, observedAt) }
  })

  app.get('/api/v1/recovery-items/:id', async request => {
    const id = recoveryIdSchema.parse(z.object({ id: z.string() }).parse(request.params).id)
    const [, condition, sourceId] = id.split(':')
    recoveryConditionSchema.parse(condition)
    const current = actor(request)
    const values: unknown[] = [current.workspaceId]
    const authorization = recoveryAuthorizationPredicate(current, values)
    values.push(condition, sourceId)
    const result = await h.db.query<RecoveryRow>(
      `${recoveryProjectionSql}
       AND ${authorization}
       AND recovery.condition=$${values.length - 1}
       AND recovery.source_id=$${values.length}`,
      values,
    )
    const row = result.rows[0]
    if (!row) throw new DomainError('NOT_FOUND', 'Recovery item not found')
    return recoveryItemSchema.parse(projectRecoveryRow(row, new Date()))
  })
}
