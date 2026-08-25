import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import {
  humanAttentionItemSchema,
  humanAttentionKindSchema,
  humanAttentionStatusSchema,
} from '@workmesh/contracts'
import { DomainError } from '@workmesh/domain'
import type { ApiActor } from '../agent/types.js'
import {
  liveHumanTeamReadPredicate,
  liveSessionReadPredicate,
} from '../live-read-authorization.js'
import type { Paginator } from '../pagination.js'
import {
  humanAttentionProjectionSql,
  projectHumanAttentionRow,
  type HumanAttentionRow,
} from './projection.js'

type Helpers = Readonly<{
  db: Pool
  paginator: Paginator
}>

const listQuerySchema = z.object({
  kind: humanAttentionKindSchema.optional(),
  status: humanAttentionStatusSchema.default('open'),
  projectId: z.string().uuid().optional(),
  workItemId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
})
const attentionIdSchema = z.string().regex(/^v1:(decision|approval|inbox_item|agent_session|completion_suggestion):[0-9a-f-]{36}$/)

const actor = (request: FastifyRequest): ApiActor => request.actor as ApiActor

export function humanAttentionAuthorizationPredicate(current: ApiActor, values: unknown[]): string {
  if (current.kind === 'human') {
    const live = liveHumanTeamReadPredicate(
      current,
      'attention.workspace_id',
      'attention.team_id',
      values,
    )
    values.push(current.id)
    return `(${live}) AND (
      attention.source_type<>'inbox_item'
      OR attention.recipient_actor_id=$${values.length}
    )`
  }

  values.push(current.agentSessionId ?? null)
  const exactSession = `$${values.length}`
  values.push(current.id)
  const exactActor = `$${values.length}`
  const live = liveSessionReadPredicate(
    current,
    'reader.id',
    'reader.workspace_id',
    values,
  )
  return `EXISTS (
    SELECT 1
      FROM agent_sessions reader
      LEFT JOIN work_items reader_item
        ON reader_item.id=reader.work_item_id
       AND reader_item.workspace_id=reader.workspace_id
       AND reader_item.deleted_at IS NULL
     WHERE reader.id=${exactSession}
       AND reader.workspace_id=attention.workspace_id
       AND ${live}
       AND (
         attention.session_id=reader.id
         OR (
           attention.work_item_id IS NOT NULL
           AND attention.work_item_id=reader.work_item_id
         )
         OR (
           attention.project_id IS NOT NULL
           AND attention.project_id=COALESCE(reader.project_id,reader_item.project_id)
         )
         OR (
           reader.session_kind='coordination'
           AND attention.team_id=reader.team_id
         )
       )
       AND (
         attention.source_type<>'inbox_item'
         OR (
           attention.recipient_actor_id=${exactActor}
           AND (
             attention.session_id IS NULL
             OR attention.session_id=reader.id
           )
         )
       )
  )`
}

function addFilter(
  where: string[],
  values: unknown[],
  sql: string,
  value: unknown,
): void {
  if (value === undefined) return
  values.push(value)
  where.push(`${sql}=$${values.length}`)
}

export function registerHumanAttentionRoutes(
  app: FastifyInstance,
  h: Helpers,
): void {
  app.get('/api/v1/human-attention', async request => {
    const query = listQuerySchema.parse(request.query)
    const current = actor(request)
    const values: unknown[] = [current.workspaceId]
    const where = [humanAttentionAuthorizationPredicate(current, values)]
    addFilter(where, values, 'attention.kind', query.kind)
    addFilter(where, values, 'attention.status', query.status)
    addFilter(where, values, 'attention.project_id', query.projectId)
    addFilter(where, values, 'attention.work_item_id', query.workItemId)
    addFilter(where, values, 'attention.session_id', query.sessionId)
    const page = await h.paginator.query<HumanAttentionRow>(
      h.db,
      request,
      request.query,
      {
        route: '/api/v1/human-attention',
        filters: query,
        sort: [
          { key: 'created_at', sql: 'attention.created_at', direction: 'DESC' },
          { key: 'source_id', sql: 'attention.source_id', direction: 'DESC' },
        ],
      },
      `${humanAttentionProjectionSql} AND ${where.join(' AND ')}`,
      values,
    )
    const observedAt = new Date()
    return {
      ...page,
      items: page.items.map(row => projectHumanAttentionRow(row, observedAt)),
    }
  })

  app.get('/api/v1/human-attention/:id', async request => {
    const attentionId = attentionIdSchema.parse(
      z.object({ id: z.string() }).parse(request.params).id,
    )
    const [, sourceType, sourceId] = attentionId.split(':')
    const current = actor(request)
    const values: unknown[] = [current.workspaceId]
    const authorization = humanAttentionAuthorizationPredicate(current, values)
    values.push(sourceType, sourceId)
    const result = await h.db.query<HumanAttentionRow>(
      `${humanAttentionProjectionSql}
       AND ${authorization}
       AND attention.source_type=$${values.length - 1}
       AND attention.source_id=$${values.length}`,
      values,
    )
    const row = result.rows[0]
    if (!row) throw new DomainError('NOT_FOUND', 'Human attention item not found')
    return humanAttentionItemSchema.parse(projectHumanAttentionRow(row))
  })
}
