import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import type { FeatureConfig } from '@workmesh/config'
import {
  advancedViewFiltersSchema,
  advancedViewInputSchema,
  automationDryRunInputSchema,
  automationRuleInputSchema,
  automationRuleVersionInputSchema,
  automationTriggerInputSchema,
  budgetPolicyInputSchema,
  cycleCarryOverInputSchema,
  cycleGenerationInputSchema,
  cycleInputSchema,
  cycleMembershipInputSchema,
  initiativeInputSchema,
  loopInputSchema,
  notificationInputSchema,
  notificationPreferenceInputSchema,
  projectHealthInputSchema,
  templateImportInputSchema,
  templateInputSchema,
  templateStateInputSchema,
  templateVersionInputSchema,
  usageInputSchema,
  type AgentSessionState,
} from '@workmesh/contracts'
import {
  admitAutomationOccurrence,
  admitLoopRun,
  admitNotification,
  appendEvent,
  type Stage4CommandMeta,
  type Stage4AdmissionAuthorization,
} from '@workmesh/db'
import {
  DomainError,
  assertAgentSessionTransition,
  assertApprovalUsable,
  canonicalActionApprovalPayload,
  generateCycleWindows,
  parseRevision,
  rollupInitiative,
  sanitizeImportedTemplate,
} from '@workmesh/domain'
import { mutate, type CommandContext } from '../commands.js'
import type { ApiActor, RequestMeta } from '../agent/types.js'
import { assertWebhookUrl } from '../agent/routes.js'
import { assertAgentWrite, loadAgentSessionForMutation } from '../agent/guard.js'
import {
  A2AAdapter,
  A2A_TASK_ID_MAX_LENGTH,
  A2AValidationError,
  mapAgentCard,
  mapStreamEvent,
  type WorkMeshStreamEvent,
} from '@workmesh/a2a-adapter'
import type { Paginator, PageSortField } from '../pagination.js'
import {
  liveHumanTeamReadPredicate,
  liveSessionReadPredicate,
} from '../live-read-authorization.js'

type Helpers = {
  db: Pool
  meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta
  header: (request: FastifyRequest, name: string) => string | undefined
  readableTeam: (request: FastifyRequest, teamId: string) => Promise<void>
  features: FeatureConfig
  paginator: Paginator
}

const uuid = z.string().uuid()
const durableCursorSchema = z.preprocess(
  value => value === undefined ? '0' : String(value),
  z.string().regex(/^\d+$/).max(19).refine(
    value => BigInt(value) <= 9_223_372_036_854_775_807n,
    'Cursor exceeds PostgreSQL bigint range',
  ),
)
const actor = (request: FastifyRequest) => request.actor as unknown as ApiActor
const id = (request: FastifyRequest): string => uuid.parse((request.params as { id?: unknown }).id)
const runId = (request: FastifyRequest): string => uuid.parse((request.params as { runId?: unknown }).runId)
const command = <T>(db: Pool, meta: RequestMeta, fn: (tx: PoolClient) => Promise<T>) =>
  mutate(db, meta as unknown as CommandContext, fn)
const one = <T>(rows: T[]): T => {
  const row = rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Resource not found')
  return row
}
const stage4Meta = (meta: RequestMeta): Stage4CommandMeta => ({
  workspaceId: meta.actor.workspaceId,
  actorId: meta.actor.id,
  correlationId: meta.correlationId,
  idempotencyKey: meta.idempotencyKey,
})
const admissionAuthorization = (current: ApiActor): Stage4AdmissionAuthorization => {
  if (current.kind === 'human') return { kind: 'human' }
  if (current.kind === 'agent' && current.agentSessionId)
    return { kind: 'agent', sessionId: current.agentSessionId }
  throw new DomainError('FORBIDDEN', 'A human or live Agent Session is required')
}
const approvalPayloadHash = (value: unknown): string =>
  `sha256:${createHash('sha256').update(canonicalActionApprovalPayload(value)).digest('hex')}`
const sameStringSet = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
}
const requireHuman = (current: ApiActor): void => {
  if (current.kind !== 'human') throw new DomainError('FORBIDDEN', 'Human authorization is required')
}
const requireAdmin = (current: ApiActor): void => {
  requireHuman(current)
  if (current.workspaceRole !== 'admin') throw new DomainError('FORBIDDEN', 'Workspace administrator role is required')
}
const requireExternalWebhooks = (
  features: FeatureConfig,
  requested: boolean,
): void => {
  if (!requested || features.WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS) return
  throw new DomainError(
    'FEATURE_DISABLED',
    'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS is disabled for this deployment',
    { feature: 'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS', tier: 'experimental' },
  )
}
const requireAutomationActionFeatures = (
  features: FeatureConfig,
  actions: ReadonlyArray<{ type: string }>,
): void => {
  requireExternalWebhooks(features, actions.some(action => action.type === 'call_webhook'))
  if (!actions.some(action => action.type === 'notify') || features.WORKMESH_BETA_PLANNING) return
  throw new DomainError(
    'FEATURE_DISABLED',
    'WORKMESH_BETA_PLANNING is disabled for this deployment',
    { feature: 'WORKMESH_BETA_PLANNING', tier: 'beta' },
  )
}
const requireCosts = (features: FeatureConfig, requested: boolean): void => {
  if (!requested || features.WORKMESH_BETA_COSTS) return
  throw new DomainError(
    'FEATURE_DISABLED',
    'WORKMESH_BETA_COSTS is disabled for this deployment',
    { feature: 'WORKMESH_BETA_COSTS', tier: 'beta' },
  )
}
const viewLayoutAllowed = (entityType: 'issue' | 'project' | 'session' | 'initiative', layout: 'list' | 'board' | 'timeline'): boolean =>
  entityType !== 'session' || layout !== 'board'
const parseAdvancedViewInput = (value: unknown): z.infer<typeof advancedViewInputSchema> => {
  try {
    return advancedViewInputSchema.parse(value)
  } catch (error) {
    if (error instanceof z.ZodError && error.issues.some(issue =>
      issue.code === 'unrecognized_keys' && issue.path[0] === 'filters'))
      throw new DomainError('VIEW_FILTER_UNSUPPORTED', 'Advanced View contains an unsupported filter')
    throw error
  }
}
const parseAdvancedViewFilters = (value: unknown): z.infer<typeof advancedViewFiltersSchema> => {
  try {
    return advancedViewFiltersSchema.parse(value)
  } catch (error) {
    if (error instanceof z.ZodError && error.issues.some(issue => issue.code === 'unrecognized_keys'))
      throw new DomainError('VIEW_FILTER_UNSUPPORTED', 'Advanced View contains an unsupported filter')
    throw error
  }
}
const assertViewCostCurrency = (
  filters: z.infer<typeof advancedViewFiltersSchema>,
  ordering: readonly { field: string }[],
  visibleFields: readonly string[],
): boolean => {
  const requested = filters.cost !== undefined
    || ordering.some(order => order.field === 'cost')
    || visibleFields.includes('cost')
  if (requested && !filters.cost?.currency)
    throw new DomainError('VIEW_COST_CURRENCY_REQUIRED', 'Advanced View cost fields require an explicit currency')
  return requested
}
async function requireTeamWrite(tx: PoolClient, current: ApiActor, teamId?: string | null): Promise<void> {
  requireHuman(current)
  if (!teamId || current.workspaceRole === 'admin') return
  const found = await tx.query(
    `SELECT 1 FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3
       AND role IN ('admin','maintainer','member')`,
    [current.workspaceId, teamId, current.id],
  )
  if (!found.rowCount) throw new DomainError('FORBIDDEN', 'Team write membership is required')
}
async function requireTemplateManage(
  tx: PoolClient,
  current: ApiActor,
  input: { teamId: string | null; ownerActorId?: string },
): Promise<void> {
  requireHuman(current)
  if (current.workspaceRole === 'admin') return
  if (!input.teamId) {
    throw new DomainError('FORBIDDEN', 'Workspace Templates require a Workspace administrator')
  }
  const member = await tx.query<{ role: 'admin' | 'maintainer' | 'member' }>(
    `SELECT role FROM memberships
     WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3`,
    [current.workspaceId, input.teamId, current.id],
  )
  const role = member.rows[0]?.role
  const ownerInScope = input.ownerActorId === current.id && role !== undefined
  if (!ownerInScope && role !== 'admin' && role !== 'maintainer') {
    throw new DomainError('FORBIDDEN', 'Template management requires Team Admin or Maintainer role')
  }
}
const emit = (
  tx: PoolClient,
  meta: RequestMeta,
  type: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
  teamId?: string | null,
  revision?: number,
) => appendEvent(tx, {
  workspaceId: meta.actor.workspaceId,
  teamId: teamId ?? undefined,
  actorId: meta.actor.id,
  correlationId: meta.correlationId,
  idempotencyKey: meta.idempotencyKey,
  type,
  aggregateType,
  aggregateId,
  revision,
  payload,
})

export function registerOperationsRoutes(app: FastifyInstance, helpers: Helpers): void {
  const { db } = helpers

  app.get('/api/v1/cycles', async request => {
    const current = actor(request)
    const query = z.object({ teamId: uuid.optional(), state: z.enum(['current', 'upcoming', 'history']).optional() }).parse(request.query)
    if (query.teamId) await helpers.readableTeam(request, query.teamId)
    const values: unknown[] = [current.workspaceId, query.teamId ?? null]
    let sql = `SELECT cycle.*,
      CASE WHEN now()<cycle.starts_at THEN 'upcoming' WHEN now()>=cycle.ends_at THEN 'history' ELSE 'current' END AS state,
      count(item.id)::int AS total_items,
      count(item.id) FILTER (WHERE workflow.category='completed')::int AS completed_items
      FROM cycles cycle
      LEFT JOIN work_items item ON item.cycle_id=cycle.id AND item.deleted_at IS NULL
      LEFT JOIN workflow_states workflow ON workflow.id=item.status_id
      WHERE cycle.workspace_id=$1 AND ($2::uuid IS NULL OR cycle.team_id=$2)`
    if (current.kind === 'agent') {
      values.push(current.agentSessionId)
      const sessionParameter = `$${values.length}`
      const liveAuthorization = liveSessionReadPredicate(
        current,
        sessionParameter,
        'cycle.workspace_id',
        values,
      )
      sql += ` AND ${liveAuthorization}
        AND (
          cycle.team_id IS NULL OR cycle.team_id=(
            SELECT scoped.team_id FROM agent_sessions scoped
            WHERE scoped.id=${sessionParameter}
              AND scoped.workspace_id=cycle.workspace_id
          )
        )`
    } else if (current.workspaceRole !== 'admin') {
      values.push(current.id)
      sql += ` AND (cycle.team_id IS NULL OR EXISTS (
        SELECT 1 FROM memberships member
        WHERE member.workspace_id=cycle.workspace_id AND member.team_id=cycle.team_id AND member.actor_id=$3
      ))`
    }
    if (query.state) {
      values.push(query.state)
      sql += ` AND CASE WHEN now()<cycle.starts_at THEN 'upcoming' WHEN now()>=cycle.ends_at THEN 'history' ELSE 'current' END=$${values.length}`
    }
    return helpers.paginator.query(db,request,request.query,{route:'/api/v1/cycles',filters:{teamId:query.teamId??null,state:query.state??null},sort:[{key:'starts_at',sql:'cycle.starts_at',direction:'ASC'},{key:'id',sql:'cycle.id',direction:'ASC'}]},sql,values,' GROUP BY cycle.id')
  })

  app.post('/api/v1/cycles', async request => {
    const body = cycleInputSchema.parse(request.body)
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      await requireTeamWrite(tx, actor(request), body.teamId)
      const endsAt = new Date(body.startsAt.getTime() + body.durationWeeks * 7 * 86_400_000)
      const cycle = one((await tx.query<{ id: string; revision: number }>(
        `INSERT INTO cycles(workspace_id,team_id,name,starts_at,ends_at,duration_weeks,created_by_actor_id)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,revision`,
        [meta.actor.workspaceId, body.teamId ?? null, body.name, body.startsAt, endsAt, body.durationWeeks, meta.actor.id],
      )).rows)
      await emit(tx, meta, 'cycle.created', 'cycle', cycle.id, { ...body, endsAt }, body.teamId, cycle.revision)
      return cycle
    })
  })

  app.post('/api/v1/cycles/generate', async request => {
    const body = cycleGenerationInputSchema.parse(request.body)
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      await requireTeamWrite(tx, actor(request), body.teamId)
      const windows = generateCycleWindows(body)
      const ids: string[] = []
      for (const window of windows) {
        const cycle = one((await tx.query<{ id: string }>(
          `INSERT INTO cycles(workspace_id,team_id,name,starts_at,ends_at,duration_weeks,created_by_actor_id)
           VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [meta.actor.workspaceId, body.teamId ?? null, window.name, window.startsAt, window.endsAt, body.durationWeeks, meta.actor.id],
        )).rows)
        ids.push(cycle.id)
        await emit(tx, meta, 'cycle.created', 'cycle', cycle.id, {
          generated: true, ordinal: window.ordinal, startsAt: window.startsAt, endsAt: window.endsAt,
        }, body.teamId, 1)
      }
      return { ids }
    })
  })

  app.post('/api/v1/cycles/:id/carry-over', async request => {
    const cycleId = id(request)
    const body = cycleCarryOverInputSchema.parse(request.body)
    const meta = helpers.meta(request, body, { id: cycleId })
    return command(db, meta, async tx => {
      const source = one((await tx.query<{ team_id: string | null; starts_at: Date }>(
        'SELECT team_id,starts_at FROM cycles WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
        [cycleId, meta.actor.workspaceId],
      )).rows)
      const target = one((await tx.query<{ team_id: string | null; starts_at: Date }>(
        'SELECT team_id,starts_at FROM cycles WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
        [body.targetCycleId, meta.actor.workspaceId],
      )).rows)
      await requireTeamWrite(tx, actor(request), source.team_id)
      if (source.team_id !== target.team_id || target.starts_at <= source.starts_at)
        throw new DomainError('INVALID_CARRY_OVER_TARGET', 'Carry-over target must be a later Cycle in the same scope')
      const values: unknown[] = [cycleId, body.targetCycleId, meta.actor.workspaceId, meta.actor.id]
      let filter = ''
      if (body.workItemIds) {
        values.push(body.workItemIds)
        filter = ` AND item.id=ANY($${values.length}::uuid[])`
      }
      const moved = await tx.query<{ id: string }>(
        `WITH candidates AS (
          SELECT item.id,item.cycle_id
            FROM work_items item JOIN workflow_states state ON state.id=item.status_id
           WHERE item.cycle_id=$1 AND item.workspace_id=$3 AND item.deleted_at IS NULL
             AND state.category<>'completed'${filter} FOR UPDATE OF item
        ), facts AS (
          INSERT INTO work_item_cycle_facts(workspace_id,work_item_id,from_cycle_id,to_cycle_id,actor_id,reason)
          SELECT $3,id,cycle_id,$2,$4,'carry_over' FROM candidates RETURNING work_item_id
        )
        UPDATE work_items item SET cycle_id=$2,revision=revision+1,updated_at=now()
          FROM facts WHERE item.id=facts.work_item_id RETURNING item.id`,
        values,
      )
      await emit(tx, meta, 'cycle.work_carried_over', 'cycle', cycleId, {
        targetCycleId: body.targetCycleId, workItemIds: moved.rows.map(row => row.id),
      }, source.team_id)
      return { moved: moved.rows.map(row => row.id) }
    })
  })

  app.patch('/api/v1/work-items/:id/cycle', async request => {
    const workItemId = id(request)
    const body = cycleMembershipInputSchema.parse(request.body)
    const meta = helpers.meta(request, body, { id: workItemId })
    const expected = parseRevision(helpers.header(request, 'if-match'))
    return command(db, meta, async tx => {
      const item = one((await tx.query<{ cycle_id: string | null; revision: number; team_id: string }>(
        'SELECT cycle_id,revision,team_id FROM work_items WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
        [workItemId, meta.actor.workspaceId],
      )).rows)
      await requireTeamWrite(tx, actor(request), item.team_id)
      if (item.revision !== expected) throw new DomainError('REVISION_CONFLICT', 'Work Item revision is stale')
      if (body.cycleId) {
        const cycle = one((await tx.query<{ team_id: string | null }>(
          'SELECT team_id FROM cycles WHERE id=$1 AND workspace_id=$2',
          [body.cycleId, meta.actor.workspaceId],
        )).rows)
        if (cycle.team_id && cycle.team_id !== item.team_id)
          throw new DomainError('CYCLE_SCOPE_MISMATCH', 'Cycle and Work Item Team must match')
      }
      await tx.query('UPDATE work_items SET cycle_id=$1,revision=revision+1,updated_at=now() WHERE id=$2', [body.cycleId, workItemId])
      await tx.query(
        `INSERT INTO work_item_cycle_facts(workspace_id,work_item_id,from_cycle_id,to_cycle_id,actor_id,reason)
         VALUES($1,$2,$3,$4,$5,'manual')`,
        [meta.actor.workspaceId, workItemId, item.cycle_id, body.cycleId, meta.actor.id],
      )
      await emit(tx, meta, 'work_item.cycle_changed', 'work_item', workItemId, {
        fromCycleId: item.cycle_id, toCycleId: body.cycleId,
      }, item.team_id, item.revision + 1)
      return { id: workItemId, revision: item.revision + 1 }
    })
  })

  app.get('/api/v1/initiatives', async request => {
    const current = actor(request)
    const binding={route:'/api/v1/initiatives',filters:{},sort:[{key:'priority',sql:'initiative.priority',direction:'DESC' as const},{key:'updated_at',sql:'initiative.updated_at',direction:'DESC' as const},{key:'id',sql:'initiative.id',direction:'DESC' as const}]}
    if (current.kind === 'agent') {
      const values: unknown[] = [current.workspaceId, current.agentSessionId]
      const liveAuthorization = liveSessionReadPredicate(
        current,
        '$2',
        'initiative.workspace_id',
        values,
      )
      return helpers.paginator.query(db,request,request.query,binding,
        `SELECT initiative.* FROM initiatives initiative
          WHERE initiative.workspace_id=$1
            AND ${liveAuthorization}
            AND EXISTS (
              SELECT 1
                FROM initiative_projects link
                JOIN projects project
                  ON project.id=link.project_id
                 AND project.workspace_id=initiative.workspace_id
                 AND project.deleted_at IS NULL
                JOIN agent_sessions scoped
                  ON scoped.id=$2
                 AND scoped.workspace_id=project.workspace_id
                 AND scoped.team_id=project.team_id
                LEFT JOIN work_items scoped_item
                  ON scoped_item.id=scoped.work_item_id
                 AND scoped_item.workspace_id=scoped.workspace_id
               WHERE link.initiative_id=initiative.id
                 AND (
                   scoped.project_id=project.id
                   OR scoped_item.project_id=project.id
                 )
            )`,
        values,
      )
    }
    return helpers.paginator.query(db,request,request.query,binding,
      `SELECT initiative.* FROM initiatives initiative
        WHERE workspace_id=$1 AND (
          $2::boolean OR owner_actor_id=$3 OR EXISTS (
            SELECT 1 FROM initiative_projects link
            JOIN projects project ON project.id=link.project_id
            JOIN memberships member ON member.workspace_id=project.workspace_id AND member.team_id=project.team_id
            WHERE link.initiative_id=initiative.id AND member.actor_id=$3
          )
        )`,
      [current.workspaceId, current.workspaceRole === 'admin', current.id],
    )
  })

  app.post('/api/v1/initiatives', async request => {
    const body = initiativeInputSchema.parse(request.body)
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      requireHuman(actor(request))
      const initiative = one((await tx.query<{ id: string; revision: number }>(
        `INSERT INTO initiatives(
           workspace_id,parent_initiative_id,name,summary,owner_actor_id,status,priority,health
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,revision`,
        [meta.actor.workspaceId, body.parentInitiativeId ?? null, body.name, body.summary ?? null, body.ownerActorId, body.status, body.priority, body.health],
      )).rows)
      for (const [sortOrder, projectId] of body.projectIds.entries()) {
        const project = one((await tx.query<{ team_id: string }>(
          'SELECT team_id FROM projects WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL',
          [projectId, meta.actor.workspaceId],
        )).rows)
        await requireTeamWrite(tx, actor(request), project.team_id)
        await tx.query(
          `INSERT INTO initiative_projects(workspace_id,initiative_id,project_id,sort_order)
           VALUES($1,$2,$3,$4)`,
          [meta.actor.workspaceId, initiative.id, projectId, sortOrder],
        )
      }
      await emit(tx, meta, 'initiative.created', 'initiative', initiative.id, {
        projectIds: body.projectIds, parentInitiativeId: body.parentInitiativeId ?? null,
      }, null, initiative.revision)
      return initiative
    })
  })

  app.get('/api/v1/initiatives/:id/rollup', async request => {
    const initiativeId = id(request)
    const current = actor(request)
    const projects = (await db.query<{
      id: string
      status: string
      health: 'on_track' | 'at_risk' | 'off_track' | 'unknown'
      completed_items: number
      total_items: number
      cost_buckets: Array<{
        currency: string
        knownCostMinor: string
        hasUnknownCost: boolean
      }> | null
    }>(
      `SELECT project.id,project.status,coalesce(health.health,'unknown')::text AS health,
              coalesce(work.completed_items,0)::int AS completed_items,
              coalesce(work.total_items,0)::int AS total_items,
              coalesce(usage.cost_buckets,'[]'::jsonb) AS cost_buckets
         FROM initiative_projects link
         JOIN projects project ON project.id=link.project_id
         LEFT JOIN LATERAL (
           SELECT count(item.id) FILTER (WHERE state.category='completed') AS completed_items,
                  count(item.id) AS total_items
             FROM work_items item
             JOIN workflow_states state ON state.id=item.status_id
            WHERE item.project_id=project.id AND item.deleted_at IS NULL
         ) work ON true
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object(
                    'currency',bucket.currency,
                    'knownCostMinor',bucket.known_cost_minor::text,
                    'hasUnknownCost',bucket.has_unknown_cost
                  ) ORDER BY bucket.currency) AS cost_buckets
             FROM (
               SELECT record.currency,
                      coalesce(sum(record.cost_minor) FILTER (WHERE record.cost_source<>'unknown'),0) AS known_cost_minor,
                      bool_or(record.cost_source='unknown') AS has_unknown_cost
                 FROM usage_records record
                WHERE $5::boolean AND record.project_id=project.id
                GROUP BY record.currency
             ) bucket
         ) usage ON true
         LEFT JOIN LATERAL (
           SELECT update.health FROM project_health_updates update
           WHERE update.project_id=project.id AND update.status='published'
           ORDER BY update.published_at DESC LIMIT 1
         ) health ON true
        WHERE link.initiative_id=$1 AND project.workspace_id=$2
          AND ($3::boolean OR EXISTS (
            SELECT 1 FROM memberships member
            WHERE member.workspace_id=project.workspace_id AND member.team_id=project.team_id AND member.actor_id=$4
          ))
        ORDER BY link.sort_order,project.id LIMIT 201`,
      [
        initiativeId,
        current.workspaceId,
        current.workspaceRole === 'admin',
        current.id,
        helpers.features.WORKMESH_BETA_COSTS,
      ],
    )).rows
    if (projects.length > 200)
      throw new DomainError('INITIATIVE_ROLLUP_LIMIT_EXCEEDED', 'Initiative rollup is limited to 200 visible projects')
    return rollupInitiative(projects.map(project => ({
      id: project.id,
      status: project.status,
      health: project.health,
      completedItems: project.completed_items,
      totalItems: project.total_items,
      costBuckets: (project.cost_buckets ?? []).map(bucket => ({
        currency: bucket.currency,
        knownCostMinor: bucket.knownCostMinor,
        hasUnknownCost: bucket.hasUnknownCost,
      })),
    })))
  })

  app.get('/api/v1/advanced-views', async request => {
    const current = actor(request)
    const binding={route:'/api/v1/advanced-views',filters:{},sort:[{key:'is_owner_favorite',sql:'(view.owner_actor_id=$2 AND view.favorite)',direction:'DESC' as const},{key:'updated_at',sql:'view.updated_at',direction:'DESC' as const},{key:'id',sql:'view.id',direction:'DESC' as const}]}
    if (current.kind === 'agent') {
      const values: unknown[] = [current.workspaceId, current.id, current.agentSessionId]
      const liveAuthorization = liveSessionReadPredicate(
        current,
        '$3',
        'view.workspace_id',
        values,
      )
      return helpers.paginator.query(db,request,request.query,binding,
        `SELECT view.*,(view.owner_actor_id=$2 AND view.favorite) AS is_owner_favorite
           FROM advanced_saved_views view
          WHERE view.workspace_id=$1
            AND ${liveAuthorization}
            AND (
              view.owner_actor_id=$2 OR view.scope='workspace'
              OR (
                view.scope='team'
                AND view.team_id=(
                  SELECT scoped.team_id FROM agent_sessions scoped
                  WHERE scoped.id=$3 AND scoped.workspace_id=view.workspace_id
                )
              )
            )`,
        values,
      )
    }
    return helpers.paginator.query(db,request,request.query,binding,
      `SELECT view.*,(view.owner_actor_id=$2 AND view.favorite) AS is_owner_favorite FROM advanced_saved_views view
        WHERE view.workspace_id=$1 AND (
          view.owner_actor_id=$2 OR view.scope='workspace'
          OR (view.scope='team' AND EXISTS (
            SELECT 1 FROM memberships member
            WHERE member.workspace_id=view.workspace_id AND member.team_id=view.team_id AND member.actor_id=$2
          ))
        )`,
      [current.workspaceId, current.id],
    )
  })

  app.post('/api/v1/advanced-views', async request => {
    const body = parseAdvancedViewInput(request.body)
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      requireHuman(actor(request))
      if (!viewLayoutAllowed(body.entityType, body.layout))
        throw new DomainError('VIEW_LAYOUT_UNSUPPORTED', 'The selected layout is not supported for this entity type')
      const costRequested = assertViewCostCurrency(body.filters, body.ordering, body.visibleFields)
      requireCosts(helpers.features, costRequested)
      if (body.scope === 'team') await requireTeamWrite(tx, actor(request), body.teamId)
      if (body.scope !== 'team' && body.teamId)
        throw new DomainError('VIEW_SCOPE_INVALID', 'Only Team Views may set teamId')
      if (body.isDefault)
        await tx.query(
          'UPDATE advanced_saved_views SET is_default=false,revision=revision+1,updated_at=now() WHERE owner_actor_id=$1 AND entity_type=$2 AND is_default',
          [meta.actor.id, body.entityType],
        )
      const view = one((await tx.query<{ id: string; revision: number }>(
        `INSERT INTO advanced_saved_views(
           workspace_id,owner_actor_id,team_id,name,entity_type,filters,grouping,ordering,
           visible_fields,layout,scope,favorite,is_default
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,revision`,
        [meta.actor.workspaceId, meta.actor.id, body.teamId ?? null, body.name, body.entityType, body.filters,
          body.grouping ?? null, JSON.stringify(body.ordering), body.visibleFields, body.layout, body.scope, body.favorite, body.isDefault],
      )).rows)
      await emit(tx, meta, 'view.created', 'advanced_saved_view', view.id, {
        entityType: body.entityType, layout: body.layout, scope: body.scope,
      }, body.teamId, view.revision)
      return view
    })
  })

  app.get('/api/v1/advanced-views/:id/results', async request => {
    const viewId = id(request)
    const current = actor(request)
    const viewValues: unknown[] = [viewId, current.workspaceId, current.id]
    let viewVisibility: string
    if (current.kind === 'agent') {
      viewValues.push(current.agentSessionId)
      viewVisibility = `(view.owner_actor_id=$3 OR view.scope='workspace'
        OR (view.scope='team' AND view.team_id=(
          SELECT scoped.team_id FROM agent_sessions scoped
          WHERE scoped.id=$4 AND scoped.workspace_id=view.workspace_id
        )))`
    } else {
      viewVisibility = `(view.owner_actor_id=$3 OR view.scope='workspace'
        OR (view.scope='team' AND EXISTS (
          SELECT 1 FROM memberships member
           WHERE member.workspace_id=view.workspace_id AND member.team_id=view.team_id
             AND member.actor_id=$3
        )))`
    }
    const view = one((await db.query<{
      entity_type: 'issue' | 'project' | 'session' | 'initiative'
      filters: unknown
      ordering: Array<{ field: string; direction: 'asc' | 'desc' }>
      visible_fields: string[]
      layout: 'list' | 'board' | 'timeline'
      revision: number
    }>(
       `SELECT view.entity_type,view.filters,view.ordering,view.visible_fields,view.layout,view.revision
         FROM advanced_saved_views view
        WHERE view.id=$1 AND view.workspace_id=$2 AND ${viewVisibility}`,
      viewValues,
    )).rows)
    if (!viewLayoutAllowed(view.entity_type, view.layout))
      throw new DomainError('VIEW_LAYOUT_UNSUPPORTED', 'The selected layout is not supported for this entity type')
    const filters = parseAdvancedViewFilters(view.filters)
    const costRequested = assertViewCostCurrency(filters, view.ordering, view.visible_fields)
    requireCosts(helpers.features, costRequested)
    const values: unknown[] = current.kind === 'agent'
      ? [current.workspaceId]
      : [current.workspaceId, current.workspaceRole === 'admin', current.id]
    const add = (value: unknown): string => {
      values.push(value)
      return `$${values.length}`
    }
    const agentSessionParameter = current.kind === 'agent'
      ? add(current.agentSessionId)
      : undefined
    const resultScope = (
      workspaceSql: string,
      teamSql: string,
      resourceSql: string,
    ): string => {
      if (!agentSessionParameter) {
        return `($2::boolean OR EXISTS (
          SELECT 1 FROM memberships member WHERE member.workspace_id=${workspaceSql}
            AND member.team_id=${teamSql} AND member.actor_id=$3
        ))`
      }
      return `EXISTS (
        SELECT 1
          FROM agent_sessions scoped
          LEFT JOIN work_items scoped_item
            ON scoped_item.id=scoped.work_item_id
           AND scoped_item.workspace_id=scoped.workspace_id
         WHERE scoped.id=${agentSessionParameter}
           AND scoped.workspace_id=${workspaceSql}
           AND scoped.team_id=${teamSql}
           AND (${resourceSql})
      )`
    }
    const resultColumn = (qualified: string, column: string): string =>
      agentSessionParameter ? `result.${column}` : qualified
    let sql: string
    const orderFields: Record<string, { sql: string; rowKey: string }> = {}
    if (view.entity_type === 'issue') {
      const currencyParameter = add(costRequested ? filters.cost!.currency : null)
      sql = `SELECT item.*,state.category AS status_category,
          coalesce(usage.cost_minor,0)::text AS cost_minor,usage.currency
        FROM work_items item
        JOIN workflow_states state ON state.id=item.status_id
        LEFT JOIN LATERAL (
          SELECT sum(record.cost_minor) AS cost_minor,min(record.currency) AS currency
            FROM usage_records record
            JOIN agent_sessions session ON session.id=record.session_id
           WHERE session.work_item_id=item.id
             AND record.currency=${currencyParameter}
        ) usage ON true
       WHERE item.workspace_id=$1 AND item.deleted_at IS NULL
         AND ${resultScope('item.workspace_id', 'item.team_id', 'scoped.work_item_id=item.id')}`
      if (filters.assigneeActorIds?.length) sql += ` AND item.responsible_human_actor_id=ANY(${add(filters.assigneeActorIds)}::uuid[])`
      if (filters.priorities?.length) sql += ` AND item.priority=ANY(${add(filters.priorities)}::text[])`
      if (filters.projectIds?.length) sql += ` AND item.project_id=ANY(${add(filters.projectIds)}::uuid[])`
      if (filters.cycleIds?.length) sql += ` AND item.cycle_id=ANY(${add(filters.cycleIds)}::uuid[])`
      if (filters.agentIds?.length) sql += ` AND EXISTS (SELECT 1 FROM agent_sessions session WHERE session.work_item_id=item.id AND session.agent_id=ANY(${add(filters.agentIds)}::uuid[]))`
      if (filters.sessionStates?.length) sql += ` AND EXISTS (SELECT 1 FROM agent_sessions session WHERE session.work_item_id=item.id AND session.state=ANY(${add(filters.sessionStates)}::agent_session_state[]))`
      if (filters.approvalStatuses?.length) sql += ` AND EXISTS (SELECT 1 FROM agent_sessions session JOIN approvals approval ON approval.session_id=session.id WHERE session.work_item_id=item.id AND approval.status=ANY(${add(filters.approvalStatuses)}::approval_status[]))`
      if (filters.cost?.minMinor !== undefined) sql += ` AND coalesce(usage.cost_minor,0)>=${add(filters.cost.minMinor)}`
      if (filters.cost?.maxMinor !== undefined) sql += ` AND coalesce(usage.cost_minor,0)<=${add(filters.cost.maxMinor)}`
      orderFields.priority = { sql: resultColumn('item.priority', 'priority'), rowKey: 'priority' }
      orderFields.createdAt = { sql: resultColumn('item.created_at', 'created_at'), rowKey: 'created_at' }
      orderFields.dueDate = { sql: resultColumn('item.due_date', 'due_date'), rowKey: 'due_date' }
    } else if (view.entity_type === 'project') {
      const currencyParameter = add(costRequested ? filters.cost!.currency : null)
      sql = `SELECT project.*,health.health,
          coalesce(usage.cost_minor,0)::text AS cost_minor,usage.currency
        FROM projects project
        LEFT JOIN LATERAL (
          SELECT update.health FROM project_health_updates update
           WHERE update.project_id=project.id AND update.status='published'
           ORDER BY update.published_at DESC LIMIT 1
        ) health ON true
        LEFT JOIN LATERAL (
          SELECT sum(record.cost_minor) AS cost_minor,min(record.currency) AS currency
            FROM usage_records record WHERE record.project_id=project.id
             AND record.currency=${currencyParameter}
        ) usage ON true
       WHERE project.workspace_id=$1 AND project.deleted_at IS NULL
         AND ${resultScope(
           'project.workspace_id',
           'project.team_id',
           'scoped.project_id=project.id OR scoped_item.project_id=project.id',
         )}`
      if (filters.projectIds?.length) sql += ` AND project.id=ANY(${add(filters.projectIds)}::uuid[])`
      if (filters.health?.length) sql += ` AND coalesce(health.health::text,'unknown')=ANY(${add(filters.health)}::text[])`
      if (filters.cost?.minMinor !== undefined) sql += ` AND coalesce(usage.cost_minor,0)>=${add(filters.cost.minMinor)}`
      if (filters.cost?.maxMinor !== undefined) sql += ` AND coalesce(usage.cost_minor,0)<=${add(filters.cost.maxMinor)}`
      orderFields.createdAt = { sql: resultColumn('project.created_at', 'created_at'), rowKey: 'created_at' }
      orderFields.targetDate = { sql: resultColumn('project.target_date', 'target_date'), rowKey: 'target_date' }
      orderFields.health = { sql: resultColumn('health.health', 'health'), rowKey: 'health' }
    } else if (view.entity_type === 'session') {
      const currencyParameter = add(costRequested ? filters.cost!.currency : null)
      sql = `SELECT session.*,coalesce(usage.cost_minor,0)::text AS cost_minor,usage.currency
         FROM agent_sessions session
         LEFT JOIN work_items item ON item.id=session.work_item_id
         LEFT JOIN LATERAL (
          SELECT sum(record.cost_minor) AS cost_minor,min(record.currency) AS currency
            FROM usage_records record WHERE record.session_id=session.id
             AND record.currency=${currencyParameter}
        ) usage ON true
       WHERE session.workspace_id=$1 AND ${resultScope(
         'session.workspace_id',
         'session.team_id',
         `session.id=${agentSessionParameter ?? 'session.id'}`,
       )}`
      if (filters.agentIds?.length) sql += ` AND session.agent_id=ANY(${add(filters.agentIds)}::uuid[])`
      if (filters.sessionStates?.length) sql += ` AND session.state=ANY(${add(filters.sessionStates)}::agent_session_state[])`
      if (filters.projectIds?.length) sql += ` AND coalesce(session.project_id,item.project_id)=ANY(${add(filters.projectIds)}::uuid[])`
      if (filters.approvalStatuses?.length) sql += ` AND EXISTS (SELECT 1 FROM approvals approval WHERE approval.session_id=session.id AND approval.status=ANY(${add(filters.approvalStatuses)}::approval_status[]))`
      if (filters.cost?.minMinor !== undefined) sql += ` AND coalesce(usage.cost_minor,0)>=${add(filters.cost.minMinor)}`
      if (filters.cost?.maxMinor !== undefined) sql += ` AND coalesce(usage.cost_minor,0)<=${add(filters.cost.maxMinor)}`
      orderFields.createdAt = { sql: resultColumn('session.created_at', 'created_at'), rowKey: 'created_at' }
      orderFields.state = { sql: resultColumn('session.state', 'state'), rowKey: 'state' }
    } else {
      sql = `SELECT initiative.* FROM initiatives initiative
       WHERE initiative.workspace_id=$1 AND ${agentSessionParameter
         ? `EXISTS (
           SELECT 1
             FROM initiative_projects link
             JOIN projects project
               ON project.id=link.project_id
              AND project.workspace_id=initiative.workspace_id
              AND project.deleted_at IS NULL
             JOIN agent_sessions scoped
               ON scoped.id=${agentSessionParameter}
              AND scoped.workspace_id=project.workspace_id
              AND scoped.team_id=project.team_id
             LEFT JOIN work_items scoped_item
               ON scoped_item.id=scoped.work_item_id
              AND scoped_item.workspace_id=scoped.workspace_id
            WHERE link.initiative_id=initiative.id
              AND (scoped.project_id=project.id OR scoped_item.project_id=project.id)
         )`
         : `(
           $2::boolean OR initiative.owner_actor_id=$3 OR EXISTS (
             SELECT 1 FROM initiative_projects link
             JOIN projects project ON project.id=link.project_id
             WHERE link.initiative_id=initiative.id AND EXISTS (
               SELECT 1 FROM memberships member WHERE member.workspace_id=project.workspace_id
                 AND member.team_id=project.team_id AND member.actor_id=$3
             )
           )
         )`}`
      if (filters.health?.length) sql += ` AND initiative.health=ANY(${add(filters.health)}::planning_health[])`
      orderFields.createdAt = { sql: resultColumn('initiative.created_at', 'created_at'), rowKey: 'created_at' }
      orderFields.priority = { sql: resultColumn('initiative.priority', 'priority'), rowKey: 'priority' }
      orderFields.health = { sql: resultColumn('initiative.health', 'health'), rowKey: 'health' }
    }
    if (agentSessionParameter) {
      const liveAuthorization = liveSessionReadPredicate(
        current,
        agentSessionParameter,
        'result.workspace_id',
        values,
      )
      sql = `SELECT result.* FROM (${sql}) result WHERE ${liveAuthorization}`
    }
    const requested = view.ordering.flatMap(order => {
      const field = orderFields[order.field]
      return field ? [{ field, direction: order.direction === 'desc' ? 'DESC' as const : 'ASC' as const }] : []
    })
    const effective = requested.length
      ? requested
      : [{ field: orderFields.createdAt ?? { sql: `${view.entity_type}.id`, rowKey: 'id' }, direction: 'DESC' as const }]
    const sort: PageSortField[] = effective.flatMap(({ field, direction }, index) => [
      {
        key: `null_${index}`,
        sql: `(${field.sql} IS NULL)`,
        direction: 'ASC' as const,
        value: row => row[field.rowKey] === null,
      },
      {
        key: field.rowKey,
        sql: field.sql,
        direction,
        value: row => {
          const value = row[field.rowKey]
          return value instanceof Date ? value.toISOString() : value as string | number | boolean | null
        },
      },
    ])
    const idSql = agentSessionParameter ? 'result.id'
      : view.entity_type === 'issue' ? 'item.id'
      : view.entity_type === 'project' ? 'project.id'
        : view.entity_type === 'session' ? 'session.id' : 'initiative.id'
    sort.push({ key: 'id', sql: idSql, direction: effective.at(-1)?.direction ?? 'DESC' })
    const page = helpers.paginator.prepare(request,request.query,{
      route:'/api/v1/advanced-views/:id/results',
      filters:{viewId,revision:view.revision,entityType:view.entity_type,filters,ordering:view.ordering},
      sort,
    },values)
    if(page.predicate) sql+=` AND ${page.predicate}`
    page.values.push(page.limit+1)
    await page.beforeQuery()
    const rows=(await db.query(`${sql} ORDER BY ${page.orderBy} LIMIT $${page.values.length}`,page.values)).rows as Record<string,unknown>[]
    return page.finish(rows)
  })

  app.post('/api/v1/projects/:id/health', async request => {
    const projectId = id(request)
    const body = projectHealthInputSchema.parse(request.body)
    const meta = helpers.meta(request, body, { id: projectId })
    const expected = parseRevision(helpers.header(request, 'if-match'))
    return command(db, meta, async tx => {
      const current = actor(request)
      const project = one((await tx.query<{ revision: number; team_id: string }>(
        'SELECT revision,team_id FROM projects WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
        [projectId, meta.actor.workspaceId],
      )).rows)
      if (project.revision !== expected) throw new DomainError('REVISION_CONFLICT', 'Project revision is stale')
      if (current.kind === 'human') await requireTeamWrite(tx, current, project.team_id)
      if (body.source === 'human' && current.kind !== 'human')
        throw new DomainError('FORBIDDEN', 'A human health update requires human identity')
      for (const source of body.sources) {
        let sourceExists = false
        if (source.kind === 'work_item') {
          sourceExists = Boolean((await tx.query(
            `SELECT 1 FROM work_items
              WHERE id=$1 AND workspace_id=$2 AND project_id=$3 AND deleted_at IS NULL`,
            [source.id, meta.actor.workspaceId, projectId],
          )).rowCount)
        } else if (source.kind === 'session') {
          sourceExists = Boolean((await tx.query(
            `SELECT 1 FROM agent_sessions session
             LEFT JOIN work_items item ON item.id=session.work_item_id
              WHERE session.id=$1 AND session.workspace_id=$2
                AND (session.project_id=$3 OR item.project_id=$3)`,
            [source.id, meta.actor.workspaceId, projectId],
          )).rowCount)
        } else if (source.kind === 'milestone') {
          sourceExists = Boolean((await tx.query(
            'SELECT 1 FROM project_milestones WHERE id=$1 AND workspace_id=$2 AND project_id=$3',
            [source.id, meta.actor.workspaceId, projectId],
          )).rowCount)
        } else if (source.kind === 'dependency') {
          sourceExists = Boolean((await tx.query(
            `SELECT 1 FROM project_dependencies dependency
              JOIN projects project ON project.id=dependency.project_id
             WHERE dependency.depends_on_project_id=$1 AND project.workspace_id=$2
               AND dependency.project_id=$3`,
            [source.id, meta.actor.workspaceId, projectId],
          )).rowCount)
        } else if (source.kind === 'project_update') {
          sourceExists = Boolean((await tx.query(
            'SELECT 1 FROM project_updates WHERE id=$1 AND workspace_id=$2 AND project_id=$3',
            [source.id, meta.actor.workspaceId, projectId],
          )).rowCount)
        } else if (source.kind === 'usage') {
          sourceExists = Boolean((await tx.query(
            'SELECT 1 FROM usage_records WHERE id=$1 AND workspace_id=$2 AND project_id=$3',
            [source.id, meta.actor.workspaceId, projectId],
          )).rowCount)
        }
        if (!sourceExists)
          throw new DomainError('HEALTH_SOURCE_SCOPE_INVALID', 'Project health source is missing or outside the Project scope', {
            sourceKind: source.kind,
            sourceId: source.id,
          })
      }
      if (body.source === 'agent') {
        if (current.kind !== 'agent' || !current.agentSessionId)
          throw new DomainError('AGENT_IDENTITY_REQUIRED', 'An agent Session token is required')
        const session = await loadAgentSessionForMutation(tx, current, current.agentSessionId)
        assertAgentWrite({
          actor: current,
          session,
          sessionId: current.agentSessionId,
          capability: 'work:write',
          operation: 'activity',
          idempotencyKey: meta.idempotencyKey,
          resourceId: projectId,
        })
        const exactPayload = {
          projectId,
          health: body.health,
          summary: body.summary,
          forecastAt: body.forecastAt?.toISOString() ?? null,
          confidence: body.confidence,
          uncertainty: body.uncertainty,
          sources: body.sources.map(source => ({
            kind: source.kind,
            id: source.id,
            observedAt: source.observedAt,
            value: source.value,
          })),
        }
        const exactHash = approvalPayloadHash(exactPayload)
        const approval = body.publish ? one((await tx.query<{
          id: string
          status: 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed' | 'canceled'
          expires_at: Date
          consumed_at: Date | null
          action_payload_hash: string
          action_payload_sanitized: unknown
        }>(
          `SELECT approval.id,approval.status,approval.expires_at,approval.consumed_at,
                  approval.action_payload_hash,approval.action_payload_sanitized
             FROM approvals approval
           JOIN agent_sessions session ON session.id=approval.session_id
           JOIN delegations delegation ON delegation.id=session.delegation_id AND delegation.status='active'
           WHERE approval.id=$1 AND approval.workspace_id=$2 AND approval.session_id=$3
             AND approval.action_name='project.health.publish'
           FOR UPDATE`,
          [body.approvalId, meta.actor.workspaceId, current.agentSessionId],
        )).rows) : null
        if (approval) {
          assertApprovalUsable({
            status: approval.status,
            expiresAt: approval.expires_at,
            consumedAt: approval.consumed_at,
            actionPayloadHash: approval.action_payload_hash,
          }, exactHash)
          if (approvalPayloadHash(approval.action_payload_sanitized) !== exactHash)
            throw new DomainError('APPROVAL_PAYLOAD_MISMATCH', 'Approval payload does not exactly match the project health publication')
          await tx.query(
            "UPDATE approvals SET status='consumed',consumed_at=now(),revision=revision+1,updated_at=now() WHERE id=$1",
            [approval.id],
          )
        }
      }
      const update = one((await tx.query<{ id: string; revision: number }>(
        `INSERT INTO project_health_updates(
           workspace_id,project_id,author_actor_id,source,health,summary,forecast_at,
           confidence,uncertainty,status,approval_id,published_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,revision`,
        [meta.actor.workspaceId, projectId, meta.actor.id, body.source, body.health, body.summary,
          body.forecastAt ?? null, body.confidence, body.uncertainty, body.publish ? 'published' : 'draft',
          body.approvalId ?? null, body.publish ? new Date() : null],
      )).rows)
      for (const [ordinal, source] of body.sources.entries()) {
        await tx.query(
          `INSERT INTO project_health_sources(update_id,ordinal,source_kind,source_id,observed_at,value)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [update.id, ordinal, source.kind, source.id, source.observedAt, source.value],
        )
      }
      await tx.query('UPDATE projects SET revision=revision+1,updated_at=now() WHERE id=$1', [projectId])
      await emit(tx, meta, body.publish ? 'project.health.published' : 'project.health.drafted',
        'project_health_update', update.id, {
          projectId, health: body.health, confidence: body.confidence, uncertainty: body.uncertainty,
          sources: body.sources.map(source => ({ kind: source.kind, id: source.id, observedAt: source.observedAt })),
        }, project.team_id, update.revision)
      return { id: update.id, revision: update.revision, projectRevision: project.revision + 1 }
    })
  })

  app.get('/api/v1/projects/:id/health', async request => {
    const projectId = id(request)
    const current = actor(request)
    const project = one((await db.query<{ team_id: string }>(
      'SELECT team_id FROM projects WHERE id=$1 AND workspace_id=$2',
      [projectId, current.workspaceId],
    )).rows)
    await helpers.readableTeam(request, project.team_id)
    if (current.kind === 'agent') {
      const authorizedProject = await db.query(
        `SELECT 1
           FROM agent_sessions scoped
           LEFT JOIN work_items scoped_item
             ON scoped_item.id=scoped.work_item_id
            AND scoped_item.workspace_id=scoped.workspace_id
          WHERE scoped.id=$1
            AND scoped.workspace_id=$2
            AND scoped.team_id=$3
            AND (scoped.project_id=$4 OR scoped_item.project_id=$4)`,
        [
          current.agentSessionId,
          current.workspaceId,
          project.team_id,
          projectId,
        ],
      )
      if (!authorizedProject.rowCount)
        throw new DomainError(
          'RESOURCE_SCOPE_DENIED',
          'Agent token cannot read this project',
        )
    }
    const values: unknown[] = [projectId, current.workspaceId]
    let liveAuthorization: string
    if (current.kind === 'agent') {
      values.push(current.agentSessionId)
      const sessionParameter = `$${values.length}`
      liveAuthorization = `${liveSessionReadPredicate(
        current,
        sessionParameter,
        'project.workspace_id',
        values,
      )} AND EXISTS (
        SELECT 1
          FROM agent_sessions scoped
          LEFT JOIN work_items scoped_item
            ON scoped_item.id=scoped.work_item_id
           AND scoped_item.workspace_id=scoped.workspace_id
         WHERE scoped.id=${sessionParameter}
           AND scoped.workspace_id=project.workspace_id
           AND scoped.team_id=project.team_id
           AND (scoped.project_id=project.id OR scoped_item.project_id=project.id)
      )`
    } else {
      liveAuthorization = liveHumanTeamReadPredicate(
        current,
        'project.workspace_id',
        'project.team_id',
        values,
      )
    }
    return helpers.paginator.query(db,request,request.query,{
      route:'/api/v1/projects/:id/health',filters:{projectId},
      sort:[{key:'created_at',sql:'update.created_at',direction:'DESC'},{key:'id',sql:'update.id',direction:'DESC'}],
    },
      `SELECT update.*,coalesce(jsonb_agg(jsonb_build_object(
          'kind',source.source_kind,'id',source.source_id,'observedAt',source.observed_at,'value',source.value
        ) ORDER BY source.ordinal) FILTER (WHERE source.update_id IS NOT NULL),'[]') AS sources
       FROM project_health_updates update
       JOIN projects project
         ON project.id=update.project_id
        AND project.workspace_id=$2
        AND project.deleted_at IS NULL
       LEFT JOIN project_health_sources source ON source.update_id=update.id
       WHERE update.project_id=$1 AND ${liveAuthorization}`,
      values,
      ' GROUP BY update.id')
  })

  app.get('/api/v1/automation-rules', async request => {
    const current = actor(request)
    const binding={route:'/api/v1/automation-rules',filters:{},sort:[{key:'updated_at',sql:'rule.updated_at',direction:'DESC' as const},{key:'id',sql:'rule.id',direction:'DESC' as const}]}
    if (current.kind === 'agent') {
      const values: unknown[] = [current.workspaceId, current.agentSessionId]
      const liveAuthorization = liveSessionReadPredicate(
        current,
        '$2',
        'rule.workspace_id',
        values,
      )
      return helpers.paginator.query(db,request,request.query,binding,
        `SELECT rule.*,version.version,version.trigger,version.condition,version.actions,version.max_attempts
           FROM automation_rules rule
           JOIN automation_rule_versions version ON version.id=rule.current_version_id
          WHERE rule.workspace_id=$1
            AND ${liveAuthorization}
            AND (
              rule.team_id IS NULL OR rule.team_id=(
                SELECT scoped.team_id FROM agent_sessions scoped
                WHERE scoped.id=$2 AND scoped.workspace_id=rule.workspace_id
              )
            )`,
        values,
      )
    }
    return helpers.paginator.query(db,request,request.query,binding,
      `SELECT rule.*,version.version,version.trigger,version.condition,version.actions,version.max_attempts
       FROM automation_rules rule JOIN automation_rule_versions version ON version.id=rule.current_version_id
       WHERE rule.workspace_id=$1 AND (
         $2::boolean OR rule.team_id IS NULL OR EXISTS (
           SELECT 1 FROM memberships member
           WHERE member.workspace_id=rule.workspace_id AND member.team_id=rule.team_id AND member.actor_id=$3
         )
       )`,
      [current.workspaceId, current.workspaceRole === 'admin', current.id],
    )
  })

  app.post('/api/v1/automation-rules', async request => {
    const body = automationRuleInputSchema.parse(request.body)
    requireAutomationActionFeatures(helpers.features, body.actions)
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      await requireTeamWrite(tx, actor(request), body.teamId)
      const rule = one((await tx.query<{ id: string; revision: number }>(
        `INSERT INTO automation_rules(workspace_id,team_id,name,created_by_actor_id)
         VALUES($1,$2,$3,$4) RETURNING id,revision`,
        [meta.actor.workspaceId, body.teamId ?? null, body.name, meta.actor.id],
      )).rows)
      const version = one((await tx.query<{ id: string }>(
        `INSERT INTO automation_rule_versions(
          rule_id,version,trigger,condition,actions,max_attempts,created_by_actor_id
        ) VALUES($1,1,$2,$3,$4,$5,$6) RETURNING id`,
        [rule.id, body.trigger, body.condition ?? null, JSON.stringify(body.actions), body.maxAttempts, meta.actor.id],
      )).rows)
      await tx.query('UPDATE automation_rules SET current_version_id=$1 WHERE id=$2', [version.id, rule.id])
      await emit(tx, meta, 'automation.rule.created', 'automation_rule', rule.id, {
        versionId: version.id, version: 1,
      }, body.teamId, rule.revision)
      return { ...rule, versionId: version.id }
    })
  })

  app.post('/api/v1/automation-rules/:id/versions', async request => {
    const ruleId = id(request)
    const body = automationRuleVersionInputSchema.parse(request.body)
    requireAutomationActionFeatures(helpers.features, body.actions)
    const meta = helpers.meta(request, body, { id: ruleId })
    const expected = parseRevision(helpers.header(request, 'if-match'))
    return command(db, meta, async tx => {
      const rule = one((await tx.query<{ revision: number; team_id: string | null; version: number }>(
        `SELECT rule.revision,rule.team_id,version.version FROM automation_rules rule
         JOIN automation_rule_versions version ON version.id=rule.current_version_id
         WHERE rule.id=$1 AND rule.workspace_id=$2 FOR UPDATE OF rule`,
        [ruleId, meta.actor.workspaceId],
      )).rows)
      await requireTeamWrite(tx, actor(request), rule.team_id)
      if (rule.revision !== expected) throw new DomainError('REVISION_CONFLICT', 'Automation Rule revision is stale')
      const version = one((await tx.query<{ id: string }>(
        `INSERT INTO automation_rule_versions(
          rule_id,version,trigger,condition,actions,max_attempts,created_by_actor_id
        ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [ruleId, rule.version + 1, body.trigger, body.condition ?? null, JSON.stringify(body.actions), body.maxAttempts, meta.actor.id],
      )).rows)
      await tx.query('UPDATE automation_rules SET current_version_id=$1,revision=revision+1,updated_at=now() WHERE id=$2', [version.id, ruleId])
      await emit(tx, meta, 'automation.rule.version_created', 'automation_rule', ruleId, {
        versionId: version.id, version: rule.version + 1,
      }, rule.team_id, rule.revision + 1)
      return { id: ruleId, revision: rule.revision + 1, versionId: version.id }
    })
  })

  app.post('/api/v1/automation-rules/:id/dry-run', async request => {
    const ruleId = id(request)
    const body = automationDryRunInputSchema.parse(request.body)
    const meta = helpers.meta(request, body, { id: ruleId })
    return command(db, meta, async tx => {
      const rule = one((await tx.query<{ team_id: string | null; actions: Array<{ type: string }> }>(
        `SELECT rule.team_id,version.actions FROM automation_rules rule
         JOIN automation_rule_versions version ON version.id=rule.current_version_id
         WHERE rule.id=$1 AND rule.workspace_id=$2`,
        [ruleId, meta.actor.workspaceId],
      )).rows)
      await requireTeamWrite(tx, actor(request), rule.team_id)
      requireAutomationActionFeatures(helpers.features, rule.actions)
      return admitAutomationOccurrence(tx, {
        meta: stage4Meta(meta), ruleId, occurrenceKey: body.occurrenceKey, payload: body.payload, dryRun: true,
        authorization: admissionAuthorization(actor(request)),
      })
    })
  })

  app.post('/api/v1/automation-rules/:id/trigger', async request => {
    const ruleId = id(request)
    const body = automationTriggerInputSchema.parse(request.body)
    const meta = helpers.meta(request, body, { id: ruleId })
    return command(db, meta, async tx => {
      const rule = one((await tx.query<{ team_id: string | null; actions: Array<{ type: string }> }>(
        `SELECT rule.team_id,version.actions FROM automation_rules rule
         JOIN automation_rule_versions version ON version.id=rule.current_version_id
         WHERE rule.id=$1 AND rule.workspace_id=$2`,
        [ruleId, meta.actor.workspaceId],
      )).rows)
      await requireTeamWrite(tx, actor(request), rule.team_id)
      requireAutomationActionFeatures(helpers.features, rule.actions)
      return admitAutomationOccurrence(tx, {
        meta: stage4Meta(meta), ruleId, occurrenceKey: body.occurrenceKey, eventId: body.eventId,
        scheduledFor: body.scheduledFor, payload: body.payload, dryRun: false,
        authorization: admissionAuthorization(actor(request)),
      })
    })
  })

  app.post('/api/v1/automation-rules/:id/state', async request => {
    const ruleId = id(request)
    const body = z.object({ state: z.enum(['active', 'paused', 'disabled']) }).parse(request.body)
    const meta = helpers.meta(request, body, { id: ruleId })
    const expected = parseRevision(helpers.header(request, 'if-match'))
    return command(db, meta, async tx => {
      const rule = one((await tx.query<{ revision: number; team_id: string | null }>(
        'SELECT revision,team_id FROM automation_rules WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
        [ruleId, meta.actor.workspaceId],
      )).rows)
      await requireTeamWrite(tx, actor(request), rule.team_id)
      if (rule.revision !== expected) throw new DomainError('REVISION_CONFLICT', 'Automation Rule revision is stale')
      await tx.query('UPDATE automation_rules SET state=$1,revision=revision+1,updated_at=now() WHERE id=$2', [body.state, ruleId])
      await emit(tx, meta, `automation.rule.${body.state}`, 'automation_rule', ruleId, {}, rule.team_id, rule.revision + 1)
      return { id: ruleId, revision: rule.revision + 1 }
    })
  })

  app.get('/api/v1/automation-runs', async request => {
    const current = actor(request)
    const query = z.object({ ruleId: uuid.optional(), loopId: uuid.optional() }).parse(request.query)
    const binding={route:'/api/v1/automation-runs',filters:{ruleId:query.ruleId??null,loopId:query.loopId??null},sort:[{key:'created_at',sql:'run.created_at',direction:'DESC' as const},{key:'id',sql:'run.id',direction:'DESC' as const}]}
    if (current.kind === 'agent') {
      const values: unknown[] = [
        current.workspaceId,
        query.ruleId ?? null,
        query.loopId ?? null,
        current.agentSessionId,
      ]
      const liveAuthorization = liveSessionReadPredicate(
        current,
        'run.session_id',
        'run.workspace_id',
        values,
      )
      return helpers.paginator.query(db,request,request.query,binding,
        `SELECT run.* FROM automation_runs run
          WHERE run.workspace_id=$1
            AND ($2::uuid IS NULL OR run.rule_id=$2)
            AND ($3::uuid IS NULL OR run.loop_id=$3)
            AND run.session_id=$4
            AND ${liveAuthorization}`,
        values,
      )
    }
    return helpers.paginator.query(db,request,request.query,binding,
      `SELECT run.* FROM automation_runs run
       WHERE run.workspace_id=$1 AND ($2::uuid IS NULL OR run.rule_id=$2)
         AND ($3::uuid IS NULL OR run.loop_id=$3)
         AND ($4::boolean OR run.team_id IS NULL OR EXISTS (
           SELECT 1 FROM memberships member
           WHERE member.workspace_id=run.workspace_id AND member.team_id=run.team_id AND member.actor_id=$5
         ))`,
      [current.workspaceId, query.ruleId ?? null, query.loopId ?? null, current.workspaceRole === 'admin', current.id],
    )
  })

  app.get('/api/v1/loops', async request => {
    const current = actor(request)
    const binding={route:'/api/v1/loops',filters:{},sort:[{key:'updated_at',sql:'loop.updated_at',direction:'DESC' as const},{key:'id',sql:'loop.id',direction:'DESC' as const}]}
    if (current.kind === 'agent') {
      const values: unknown[] = [current.workspaceId, current.id, current.agentSessionId]
      const liveAuthorization = liveSessionReadPredicate(
        current,
        '$3',
        'loop.workspace_id',
        values,
      )
      return helpers.paginator.query(db,request,request.query,binding,
        `SELECT loop.*,
          (SELECT jsonb_agg(recent ORDER BY recent.created_at DESC)
             FROM (SELECT run.id,run.status,run.session_id,run.created_at,run.finished_at
               FROM automation_runs run WHERE run.loop_id=loop.id ORDER BY run.created_at DESC LIMIT 10) recent
          ) AS recent_runs
         FROM loops loop
         WHERE loop.workspace_id=$1
           AND ${liveAuthorization}
           AND (
             loop.visibility='workspace'
             OR loop.owner_actor_id=$2
             OR loop.team_id=(
               SELECT scoped.team_id FROM agent_sessions scoped
               WHERE scoped.id=$3 AND scoped.workspace_id=loop.workspace_id
             )
           )`,
        values,
      )
    }
    return helpers.paginator.query(db,request,request.query,binding,
      `SELECT loop.*,
        (SELECT jsonb_agg(recent ORDER BY recent.created_at DESC)
           FROM (SELECT run.id,run.status,run.session_id,run.created_at,run.finished_at
             FROM automation_runs run WHERE run.loop_id=loop.id ORDER BY run.created_at DESC LIMIT 10) recent
        ) AS recent_runs
       FROM loops loop WHERE loop.workspace_id=$1 AND (
         $2::boolean OR loop.visibility='workspace' OR loop.owner_actor_id=$3 OR EXISTS (
           SELECT 1 FROM memberships member
           WHERE member.workspace_id=loop.workspace_id AND member.team_id=loop.team_id AND member.actor_id=$3
         )
       )`,
      [current.workspaceId, current.workspaceRole === 'admin', current.id],
    )
  })

  app.post('/api/v1/loops', async request => {
    const body = loopInputSchema.parse(request.body)
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      await requireTeamWrite(tx, actor(request), body.teamId)
      const template = one((await tx.query<{ kind: string; status: string }>(
        `SELECT template.kind,template.status FROM template_versions version
         JOIN templates template ON template.id=version.template_id
         WHERE version.id=$1 AND template.workspace_id=$2`,
        [body.runTemplateVersionId, meta.actor.workspaceId],
      )).rows)
      if (template.kind !== 'agent_run' || template.status !== 'active')
        throw new DomainError('RUN_TEMPLATE_INVALID', 'Loop must pin an active Agent Run Template version')
      const loop = one((await tx.query<{ id: string; revision: number }>(
        `INSERT INTO loops(
          workspace_id,team_id,project_id,name,owner_actor_id,agent_id,run_template_version_id,
          trigger,budget,no_overlap,visibility,failure_notification,next_run_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
          CASE WHEN $8->>'type'='schedule' THEN now() ELSE NULL END) RETURNING id,revision`,
        [meta.actor.workspaceId, body.teamId ?? null, body.projectId ?? null, body.name, body.ownerActorId,
          body.agentId, body.runTemplateVersionId, body.trigger, body.budget, body.noOverlap, body.visibility, body.failureNotification],
      )).rows)
      await emit(tx, meta, 'loop.created', 'loop', loop.id, {
        runTemplateVersionId: body.runTemplateVersionId, trigger: body.trigger,
      }, body.teamId, loop.revision)
      return loop
    })
  })

  app.post('/api/v1/loops/:id/run', async request => {
    const loopId = id(request)
    const body = z.object({ occurrenceKey: z.string().min(1).max(500), scheduledFor: z.coerce.date().default(() => new Date()) }).parse(request.body)
    const meta = helpers.meta(request, body, { id: loopId })
    return command(db, meta, tx => admitLoopRun(tx, {
      meta: stage4Meta(meta), loopId, occurrenceKey: body.occurrenceKey, scheduledFor: body.scheduledFor,
      authorization: admissionAuthorization(actor(request)),
      notificationChannels: !helpers.features.WORKMESH_BETA_PLANNING
        ? []
        : helpers.features.WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS
          ? ['in_app', 'browser', 'webhook']
          : ['in_app', 'browser'],
    }))
  })

  app.post('/api/v1/loops/:id/state', async request => {
    const loopId = id(request)
    const body = z.object({ state: z.enum(['active', 'paused', 'disabled']) }).parse(request.body)
    const meta = helpers.meta(request, body, { id: loopId })
    const expected = parseRevision(helpers.header(request, 'if-match'))
    return command(db, meta, async tx => {
      const loop = one((await tx.query<{ revision: number; team_id: string | null }>(
        'SELECT revision,team_id FROM loops WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
        [loopId, meta.actor.workspaceId],
      )).rows)
      await requireTeamWrite(tx, actor(request), loop.team_id)
      if (loop.revision !== expected) throw new DomainError('REVISION_CONFLICT', 'Loop revision is stale')
      await tx.query('UPDATE loops SET state=$1,revision=revision+1,updated_at=now(),next_run_at=CASE WHEN $1=\'active\' THEN next_run_at ELSE NULL END WHERE id=$2', [body.state, loopId])
      await emit(tx, meta, `loop.${body.state}`, 'loop', loopId, {}, loop.team_id, loop.revision + 1)
      return { id: loopId, revision: loop.revision + 1 }
    })
  })

  app.post('/api/v1/usage-records', async request => {
    const body = usageInputSchema.parse(request.body)
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      const current = actor(request)
      const session = one((await tx.query<{
        id: string
        team_id: string
        agent_id: string
        work_item_id: string | null
        project_id: string | null
      }>(
        `SELECT id,team_id,agent_id,work_item_id,project_id
           FROM agent_sessions
          WHERE id=$1 AND workspace_id=$2
          FOR UPDATE`,
        [body.sessionId, current.workspaceId],
      )).rows)
      const workItemProjectId = session.work_item_id
        ? one((await tx.query<{ project_id: string | null }>(
          `SELECT project_id FROM work_items
            WHERE id=$1 AND workspace_id=$2 AND team_id=$3 AND deleted_at IS NULL
            FOR SHARE`,
          [session.work_item_id, current.workspaceId, session.team_id],
        )).rows).project_id
        : null
      const authorizedProjectId = session.project_id ?? workItemProjectId
      if (body.agentId !== session.agent_id)
        throw new DomainError('RESOURCE_SCOPE_DENIED', 'Usage Agent must match the Agent Session')
      if ((body.projectId ?? null) !== authorizedProjectId)
        throw new DomainError('RESOURCE_SCOPE_DENIED', 'Usage Project must match the Agent Session resource')
      if (current.kind === 'human') {
        await requireTeamWrite(tx, current, session.team_id)
      } else if (current.kind === 'agent') {
        if (!current.agentSessionId || current.agentSessionId !== body.sessionId)
          throw new DomainError('RESOURCE_SCOPE_DENIED', 'Usage may only be recorded for the current Agent Session')
        const writableSession = await loadAgentSessionForMutation(tx, current, current.agentSessionId)
        assertAgentWrite({
          actor: current,
          session: writableSession,
          sessionId: current.agentSessionId,
          capability: 'work:read',
          operation: 'activity',
          idempotencyKey: meta.idempotencyKey,
          resourceId: session.work_item_id ?? authorizedProjectId,
        })
      } else {
        // HTTP authentication intentionally has no generic Service Actor path.
        // Trusted internal ingestion must use a separately capability-scoped
        // application command rather than impersonating an ordinary actor.
        throw new DomainError('FORBIDDEN', 'Trusted internal Usage ingestion is required for Service Actors')
      }
      const usage = await tx.query<{ id: string }>(
        `INSERT INTO usage_records(
          workspace_id,dedupe_key,agent_id,session_id,project_id,occurred_at,input_tokens,
          output_tokens,runtime_ms,tool_calls,cost_minor,currency,cost_source,metadata
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT(workspace_id,dedupe_key) DO NOTHING RETURNING id`,
        [meta.actor.workspaceId, body.dedupeKey, body.agentId, body.sessionId, body.projectId ?? null,
          body.occurredAt, body.inputTokens ?? null, body.outputTokens ?? null, body.runtimeMs ?? null,
          body.toolCalls ?? null, body.costMinor ?? null, body.currency, body.costSource, body.metadata],
      )
      if (!usage.rowCount) {
        const previous = one((await tx.query<{ id: string }>(
          'SELECT id FROM usage_records WHERE workspace_id=$1 AND dedupe_key=$2',
          [meta.actor.workspaceId, body.dedupeKey],
        )).rows)
        return { id: previous.id, duplicate: true }
      }
      await emit(tx, meta, 'usage.recorded', 'usage_record', usage.rows[0]!.id, {
        sessionId: body.sessionId, agentId: body.agentId, projectId: body.projectId ?? null,
        costMinor: body.costMinor ?? null, costSource: body.costSource, currency: body.currency,
      })
      return { id: usage.rows[0]!.id, duplicate: false }
    })
  })

  app.get('/api/v1/usage-summary', async request => {
    const current = actor(request)
    const query = z.object({
      agentId: uuid.optional(), sessionId: uuid.optional(), projectId: uuid.optional(),
      from: z.coerce.date().optional(), to: z.coerce.date().optional(),
    }).parse(request.query)
    const values = [current.workspaceId, query.agentId ?? null, query.sessionId ?? null, query.projectId ?? null,
      query.from ?? null, query.to ?? null, current.workspaceRole === 'admin', current.id]
    const visibleUsage = `usage.workspace_id=$1 AND ($2::uuid IS NULL OR usage.agent_id=$2)
         AND ($3::uuid IS NULL OR usage.session_id=$3) AND ($4::uuid IS NULL OR usage.project_id=$4)
         AND ($5::timestamptz IS NULL OR usage.occurred_at >= $5)
         AND ($6::timestamptz IS NULL OR usage.occurred_at < $6)
         AND (
           $7::boolean OR EXISTS (
             SELECT 1 FROM agent_sessions session
             LEFT JOIN memberships member ON member.workspace_id=session.workspace_id
               AND member.team_id=session.team_id AND member.actor_id=$8
             WHERE session.id=usage.session_id AND (member.actor_id IS NOT NULL OR session.team_id IS NULL)
           )
         )`
    const totals = one((await db.query(
      `SELECT coalesce(sum(input_tokens),0)::text AS input_tokens,
              coalesce(sum(output_tokens),0)::text AS output_tokens,
              coalesce(sum(runtime_ms),0)::text AS runtime_ms,
              coalesce(sum(tool_calls),0)::text AS tool_calls,
              count(*) FILTER (WHERE cost_source='unknown')::int AS unknown_cost_records
       FROM usage_records usage
       WHERE ${visibleUsage}`,
      values,
    )).rows)
    const currencyBuckets = (await db.query(
      `SELECT currency,
              coalesce(sum(cost_minor) FILTER (WHERE cost_source<>'unknown'),0)::text AS known_cost_minor,
              count(*) FILTER (WHERE cost_source='unknown')::int AS unknown_cost_records
         FROM usage_records usage WHERE ${visibleUsage}
        GROUP BY currency ORDER BY currency`,
      values,
    )).rows
    return { ...totals, currency_buckets: currencyBuckets }
  })

  app.post('/api/v1/budget-policies', async request => {
    const body = budgetPolicyInputSchema.parse(request.body)
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      requireAdmin(actor(request))
      const policy = one((await tx.query<{ id: string; revision: number }>(
        `INSERT INTO budget_policies(
          workspace_id,scope_type,scope_id,currency,soft_cost_minor,hard_cost_minor,
          soft_tokens,hard_tokens,created_by_actor_id
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(workspace_id,scope_type,scope_id,currency) DO UPDATE SET
          soft_cost_minor=EXCLUDED.soft_cost_minor,hard_cost_minor=EXCLUDED.hard_cost_minor,
          soft_tokens=EXCLUDED.soft_tokens,hard_tokens=EXCLUDED.hard_tokens,
          revision=budget_policies.revision+1,updated_at=now()
        RETURNING id,revision`,
        [meta.actor.workspaceId, body.scopeType, body.scopeId, body.currency, body.softCostMinor ?? null,
          body.hardCostMinor ?? null, body.softTokens ?? null, body.hardTokens ?? null, meta.actor.id],
      )).rows)
      await emit(tx, meta, 'budget.policy_set', 'budget_policy', policy.id, {
        scopeType: body.scopeType, scopeId: body.scopeId, currency: body.currency,
      }, null, policy.revision)
      return policy
    })
  })

  app.post('/api/v1/notifications', async request => {
    const body = notificationInputSchema.parse(request.body)
    requireExternalWebhooks(helpers.features, body.channels.includes('webhook'))
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      requireHuman(actor(request))
      const notification = await admitNotification(tx, {
        workspaceId: meta.actor.workspaceId,
        recipientActorId: body.recipientActorId,
        priority: body.priority,
        kind: body.kind,
        title: body.title,
        body: body.body,
        sourceType: body.sourceType,
        sourceId: body.sourceId,
        dedupeKey: body.dedupeKey,
        requestedChannels: body.channels,
      })
      await emit(tx, meta, 'notification.created', 'notification', notification.id, {
        recipientActorId: body.recipientActorId,
        priority: body.priority,
        channels: notification.channels,
        digest: notification.digest,
        suppressed: notification.suppressed,
      }, null)
      return { id: notification.id }
    })
  })

  app.put('/api/v1/notification-preferences', async request => {
    const body = notificationPreferenceInputSchema.parse(request.body)
    requireExternalWebhooks(
      helpers.features,
      body.channels.includes('webhook') || body.webhookUrl !== undefined,
    )
    if (body.webhookUrl) await assertWebhookUrl(body.webhookUrl)
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      const current = actor(request)
      if (current.kind !== 'human') throw new DomainError('FORBIDDEN', 'Human notification preferences are required')
      const preference = one((await tx.query<{ revision: number }>(
        `INSERT INTO notification_preferences(
          workspace_id,actor_id,channels,digest,minimum_priority,muted_kinds,webhook_url
        ) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(workspace_id,actor_id) DO UPDATE SET channels=EXCLUDED.channels,
          digest=EXCLUDED.digest,minimum_priority=EXCLUDED.minimum_priority,
          muted_kinds=EXCLUDED.muted_kinds,webhook_url=EXCLUDED.webhook_url,
          revision=notification_preferences.revision+1,updated_at=now()
        RETURNING revision`,
        [meta.actor.workspaceId, meta.actor.id, body.channels, body.digest, body.minimumPriority, body.mutedKinds, body.webhookUrl ?? null],
      )).rows)
      await emit(tx, meta, 'notification.preferences_updated', 'actor', meta.actor.id, {
        channels: body.channels, digest: body.digest, minimumPriority: body.minimumPriority,
      }, null, preference.revision)
      return { id: meta.actor.id, revision: preference.revision }
    })
  })

  app.get('/api/v1/templates/export', async request => {
    requireAdmin(actor(request))
    const bounds = one((await db.query<{ template_count: number; maximum_versions: number }>(
      `SELECT count(*)::int AS template_count,
        coalesce(max((SELECT count(*) FROM template_versions version WHERE version.template_id=template.id)),0)::int AS maximum_versions
       FROM templates template WHERE template.workspace_id=$1`,
      [actor(request).workspaceId],
    )).rows)
    if (bounds.template_count > 100 || bounds.maximum_versions > 100)
      throw new DomainError('TEMPLATE_EXPORT_LIMIT_EXCEEDED', 'Template export is limited to 100 templates and 100 versions per template')
    const rows = (await db.query<{
      id: string
      kind: string
      name: string
      description: string
      versions: Array<{ body: Record<string, unknown>; changeSummary: string }>
    }>(
      `SELECT template.id,template.kind,template.name,template.description,
        jsonb_agg(jsonb_build_object('body',version.body,'changeSummary',version.change_summary)
          ORDER BY version.version) AS versions
       FROM templates template JOIN template_versions version ON version.template_id=template.id
       WHERE template.workspace_id=$1 GROUP BY template.id ORDER BY template.kind,template.name`,
      [actor(request).workspaceId],
    )).rows
    return { formatVersion: 1, templates: rows.map(({ id: _id, ...template }) => template) }
  })

  app.get('/api/v1/templates', async request => {
    const current = actor(request)
    const binding={route:'/api/v1/templates',filters:{},sort:[{key:'kind',sql:'template.kind',direction:'ASC' as const},{key:'name',sql:'template.name',direction:'ASC' as const},{key:'id',sql:'template.id',direction:'ASC' as const}]}
    if (current.kind === 'agent') {
      if (!current.agentSessionId) {
        throw new DomainError('SESSION_SCOPE_DENIED', 'Agent Template access requires a current Session')
      }
      const values: unknown[] = [current.workspaceId, current.agentSessionId]
      const liveAuthorization = liveSessionReadPredicate(
        current,
        'run.session_id',
        'run.workspace_id',
        values,
      )
      return helpers.paginator.query(db,request,request.query,binding,
        `SELECT DISTINCT template.*,version.version,version.body,version.change_summary
         FROM automation_runs run
         JOIN loops loop ON loop.id=run.loop_id
         JOIN template_versions version ON version.id=loop.run_template_version_id
         JOIN templates template ON template.id=version.template_id
         WHERE run.workspace_id=$1 AND run.session_id=$2
           AND template.status='active'
           AND ${liveAuthorization}`,
        values,
      )
    }
    if (current.workspaceRole === 'admin') {
      return helpers.paginator.query(db,request,request.query,binding,
        `SELECT template.*,version.version,version.body,version.change_summary
         FROM templates template
         JOIN template_versions version ON version.id=template.current_version_id
         WHERE template.workspace_id=$1`,
        [current.workspaceId],
      )
    }
    return helpers.paginator.query(db,request,request.query,binding,
      `SELECT template.*,version.version,version.body,version.change_summary
       FROM templates template
       JOIN template_versions version ON version.id=template.current_version_id
       JOIN memberships member
         ON member.workspace_id=template.workspace_id
        AND member.team_id=template.team_id
       WHERE template.workspace_id=$1 AND member.actor_id=$2
         AND template.status='active' AND template.team_id IS NOT NULL`,
      [current.workspaceId, current.id],
    )
  })

  app.post('/api/v1/templates', async request => {
    const body = templateInputSchema.parse(request.body)
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      await requireTemplateManage(tx, actor(request), {
        teamId: body.teamId ?? null,
      })
      const template = one((await tx.query<{ id: string; revision: number }>(
        `INSERT INTO templates(workspace_id,team_id,kind,name,description,owner_actor_id,status)
         VALUES($1,$2,$3,$4,$5,$6,'draft') RETURNING id,revision`,
        [meta.actor.workspaceId, body.teamId ?? null, body.kind, body.name, body.description, meta.actor.id],
      )).rows)
      const version = one((await tx.query<{ id: string }>(
        `INSERT INTO template_versions(template_id,version,body,change_summary,created_by_actor_id)
         VALUES($1,1,$2,'Initial version',$3) RETURNING id`,
        [template.id, body.body, meta.actor.id],
      )).rows)
      await tx.query('UPDATE templates SET current_version_id=$1 WHERE id=$2', [version.id, template.id])
      await emit(tx, meta, 'template.created', 'template', template.id, { kind: body.kind, versionId: version.id }, body.teamId, 1)
      return { ...template, versionId: version.id }
    })
  })

  app.post('/api/v1/templates/:id/versions', async request => {
    const templateId = id(request)
    const body = templateVersionInputSchema.parse(request.body)
    const meta = helpers.meta(request, body, { id: templateId })
    const expected = parseRevision(helpers.header(request, 'if-match'))
    return command(db, meta, async tx => {
      requireHuman(actor(request))
      const template = one((await tx.query<{
        revision: number
        version: number
        team_id: string | null
        owner_actor_id: string
      }>(
        `SELECT template.revision,template.team_id,template.owner_actor_id,version.version
         FROM templates template
         JOIN template_versions version ON version.id=template.current_version_id
         WHERE template.id=$1 AND template.workspace_id=$2 FOR UPDATE OF template`,
        [templateId, meta.actor.workspaceId],
      )).rows)
      await requireTemplateManage(tx, actor(request), {
        teamId: template.team_id,
        ownerActorId: template.owner_actor_id,
      })
      if (template.revision !== expected) throw new DomainError('REVISION_CONFLICT', 'Template revision is stale')
      const version = one((await tx.query<{ id: string }>(
        `INSERT INTO template_versions(template_id,version,body,change_summary,created_by_actor_id)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [templateId, template.version + 1, body.body, body.changeSummary, meta.actor.id],
      )).rows)
      await tx.query('UPDATE templates SET current_version_id=$1,revision=revision+1,updated_at=now() WHERE id=$2', [version.id, templateId])
      await emit(tx, meta, 'template.version_created', 'template', templateId, {
        versionId: version.id, version: template.version + 1,
      }, template.team_id, template.revision + 1)
      return { id: templateId, revision: template.revision + 1, versionId: version.id }
    })
  })

  app.post('/api/v1/templates/:id/state', async request => {
    const templateId = id(request)
    const body = templateStateInputSchema.parse(request.body)
    const meta = helpers.meta(request, body, { id: templateId })
    const expected = parseRevision(helpers.header(request, 'if-match'))
    return command(db, meta, async tx => {
      requireHuman(actor(request))
      const template = one((await tx.query<{
        revision: number
        owner_actor_id: string
        team_id: string | null
        current_version_id: string | null
      }>(
        `SELECT revision,owner_actor_id,team_id,current_version_id FROM templates
          WHERE id=$1 AND workspace_id=$2 FOR UPDATE`,
        [templateId, meta.actor.workspaceId],
      )).rows)
      await requireTemplateManage(tx, actor(request), {
        teamId: template.team_id,
        ownerActorId: template.owner_actor_id,
      })
      if (template.revision !== expected) throw new DomainError('REVISION_CONFLICT', 'Template revision is stale')
      if (body.status === 'active' && !template.current_version_id)
        throw new DomainError('TEMPLATE_VERSION_REQUIRED', 'An active Template must pin a current version')
      await tx.query(
        'UPDATE templates SET status=$1,revision=revision+1,updated_at=now() WHERE id=$2',
        [body.status, templateId],
      )
      await emit(tx, meta, `template.${body.status}`, 'template', templateId, {
        currentVersionId: template.current_version_id,
      }, template.team_id, template.revision + 1)
      return { id: templateId, status: body.status, revision: template.revision + 1 }
    })
  })

  app.post('/api/v1/templates/import', async request => {
    const body = templateImportInputSchema.parse(request.body)
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      requireAdmin(actor(request))
      const imported: string[] = []
      for (const item of body.templates) {
        const template = one((await tx.query<{ id: string }>(
          `INSERT INTO templates(workspace_id,kind,name,description,owner_actor_id,status,imported_at)
           VALUES($1,$2,$3,$4,$5,'draft',now()) RETURNING id`,
          [meta.actor.workspaceId, item.kind, item.name, item.description, meta.actor.id],
        )).rows)
        let currentVersionId: string | undefined
        for (const [index, version] of item.versions.entries()) {
          const safeBody = sanitizeImportedTemplate(version.body)
          currentVersionId = one((await tx.query<{ id: string }>(
            `INSERT INTO template_versions(template_id,version,body,change_summary,created_by_actor_id)
             VALUES($1,$2,$3,$4,$5) RETURNING id`,
            [template.id, index + 1, safeBody, version.changeSummary, meta.actor.id],
          )).rows).id
        }
        await tx.query('UPDATE templates SET current_version_id=$1 WHERE id=$2', [currentVersionId, template.id])
        imported.push(template.id)
        await emit(tx, meta, 'template.imported_as_draft', 'template', template.id, {
          kind: item.kind, versionCount: item.versions.length, inert: true,
        })
      }
      return { ids: imported, status: 'draft' }
    })
  })

  // Narrow operational inspection endpoint for a single run, including effect
  // checkpoints. It is deliberately read-only and obeys the run's Team scope.
  app.get('/api/v1/automation-runs/:runId', async request => {
    const targetRunId = runId(request)
    const current = actor(request)
    return one((await db.query(
      `SELECT run.*,coalesce(jsonb_agg(effect ORDER BY effect.action_ordinal)
         FILTER (WHERE effect.id IS NOT NULL),'[]') AS effects
       FROM automation_runs run LEFT JOIN automation_effects effect ON effect.run_id=run.id
       WHERE run.id=$1 AND run.workspace_id=$2 AND (
         $3::boolean OR run.team_id IS NULL OR EXISTS (
           SELECT 1 FROM memberships member
           WHERE member.workspace_id=run.workspace_id AND member.team_id=run.team_id AND member.actor_id=$4
         )
       ) GROUP BY run.id`,
      [targetRunId, current.workspaceId, current.workspaceRole === 'admin', current.id],
    )).rows)
  })

  app.post('/api/v1/a2a-bindings', async request => {
    const body = z.object({
      agentId: uuid,
      protocolVersion: z.literal('0.3'),
      agentCard: z.object({
        protocolVersion: z.literal('0.3'),
        name: z.string().min(1).max(240),
        description: z.string().max(2_000).optional(),
        url: z.string().url(),
        skills: z.array(z.object({
          id: z.string().min(1).max(240),
          name: z.string().min(1).max(240),
          description: z.string().max(2_000).optional(),
        })).max(200),
        capabilities: z.object({ streaming: z.boolean().optional(), pushNotifications: z.boolean().optional() }).optional(),
      }),
    }).parse(request.body)
    await assertWebhookUrl(body.agentCard.url)
    const manifest = mapAgentCard(body.agentCard)
    const meta = helpers.meta(request, body)
    return command(db, meta, async tx => {
      requireAdmin(actor(request))
      const agent = one((await tx.query<{ id: string }>(
        `SELECT id FROM agent_definitions WHERE id=$1 AND workspace_id=$2 AND is_active
          AND 'a2a'=ANY(supported_protocols) FOR UPDATE`,
        [body.agentId, meta.actor.workspaceId],
      )).rows)
      const binding = one((await tx.query<{ id: string; revision: number }>(
        `INSERT INTO a2a_agent_bindings(
          workspace_id,agent_id,protocol_version,external_agent_url,card_hash
        ) VALUES($1,$2,$3,$4,encode(digest($5,'sha256'),'hex'))
        ON CONFLICT(agent_id,protocol_version) DO UPDATE SET
          external_agent_url=EXCLUDED.external_agent_url,card_hash=EXCLUDED.card_hash,
          active=true,revision=a2a_agent_bindings.revision+1,updated_at=now()
        RETURNING id,revision`,
        [meta.actor.workspaceId, agent.id, body.protocolVersion, manifest.endpointUrl, JSON.stringify(body.agentCard)],
      )).rows)
      await emit(tx, meta, 'a2a.binding.configured', 'a2a_binding', binding.id, {
        agentId: body.agentId, protocolVersion: body.protocolVersion, card: manifest,
      }, null, binding.revision)
      return binding
    })
  })

  app.post('/api/v1/a2a-bindings/:id/tasks', async request => {
    const bindingId = id(request)
    const body = z.object({
      teamId: uuid,
      workItemId: uuid,
      requestedCapabilities: z.array(z.string().min(1).max(120)).max(100).default([]),
      deliveryId: z.string().min(1).max(500),
      sequence: z.number().int().positive().safe(),
      task: z.unknown(),
    }).parse(request.body)
    const meta = helpers.meta(request, body, { id: bindingId })
    return command(db, meta, async tx => {
      requireHuman(actor(request))
      let target: {
        workspace_id: string
        agent_id: string
        agent_actor_id: string
        agent_capabilities: string[]
        team_capabilities: string[]
        project_id: string | null
      } | undefined
      let deliveryWasReplay = false
      const adapter = new A2AAdapter(
        async authorization => {
          target = (await tx.query<typeof target & object>(
            `SELECT binding.workspace_id,binding.agent_id,agent.actor_id AS agent_actor_id,
                    agent.approved_capabilities AS agent_capabilities,
                    access.approved_capabilities AS team_capabilities,item.project_id
               FROM a2a_agent_bindings binding
               JOIN agent_definitions agent ON agent.id=binding.agent_id AND agent.is_active
               JOIN agent_team_access access ON access.workspace_id=binding.workspace_id
                 AND access.agent_id=binding.agent_id AND access.team_id=$3 AND access.revoked_at IS NULL
               JOIN work_items item ON item.id=$4 AND item.workspace_id=binding.workspace_id
                 AND item.team_id=$3 AND item.deleted_at IS NULL
               JOIN memberships member ON member.workspace_id=binding.workspace_id
                 AND member.team_id=$3 AND member.actor_id=$5
              WHERE binding.id=$1 AND binding.workspace_id=$2 AND binding.active
                AND binding.protocol_version='0.3' FOR UPDATE OF binding`,
            [authorization.bindingId, authorization.workspaceId, body.teamId, body.workItemId, meta.actor.id],
          )).rows[0]
          if (!target) throw new DomainError('A2A_AUTHORIZATION_REVOKED', 'A2A binding or resource authorization is not active')
          if (!authorization.requestedCapabilities.every(capability =>
            target!.agent_capabilities.includes(capability) && target!.team_capabilities.includes(capability)))
            throw new DomainError('A2A_CAPABILITY_DENIED', 'A2A requested capability is not authorized')
        },
        async (taskCommand, authorization) => {
          if (!target) throw new DomainError('A2A_AUTHORIZATION_REQUIRED', 'A2A authorization must precede Session creation')
          const previousDelivery = (await tx.query<{
            session_id: string | null
            payload: unknown
            status: string
            sequence: string | null
          }>(
            `SELECT delivery.session_id,delivery.payload,delivery.status,delivery.sequence::text
               FROM a2a_deliveries delivery
              WHERE delivery.binding_id=$1 AND delivery.delivery_id=$2 FOR UPDATE`,
            [bindingId, body.deliveryId],
          )).rows[0]
          if (previousDelivery) {
            if (canonicalActionApprovalPayload(previousDelivery.payload) !== canonicalActionApprovalPayload(body.task))
              throw new DomainError('A2A_DELIVERY_CONFLICT', 'A2A delivery id was reused with different content')
            if (!previousDelivery.session_id)
              throw new DomainError('A2A_DELIVERY_IN_PROGRESS', 'A2A delivery is already being processed')
            const replayAuthorization = (await tx.query<{
              team_id: string
              work_item_id: string | null
              agent_id: string
              permissions_snapshot: string[]
              protocol_version: string
            }>(
              `SELECT session.team_id,session.work_item_id,session.agent_id,
                      delegation.permissions_snapshot,binding.protocol_version
                 FROM agent_sessions session
                 JOIN delegations delegation ON delegation.id=session.delegation_id
                 JOIN a2a_agent_bindings binding ON binding.id=$2
                   AND binding.workspace_id=session.workspace_id
                 JOIN a2a_task_bindings task_binding ON task_binding.binding_id=binding.id
                   AND task_binding.session_id=session.id AND task_binding.external_task_id=$3
                WHERE session.id=$1 AND session.workspace_id=$4`,
              [previousDelivery.session_id, bindingId, taskCommand.externalTaskId, meta.actor.workspaceId],
            )).rows[0]
            if (
              !replayAuthorization
              || previousDelivery.sequence !== String(body.sequence)
              || replayAuthorization.protocol_version !== '0.3'
              || replayAuthorization.team_id !== body.teamId
              || replayAuthorization.work_item_id !== body.workItemId
              || replayAuthorization.agent_id !== target.agent_id
              || !sameStringSet(replayAuthorization.permissions_snapshot, authorization.requestedCapabilities)
            )
              throw new DomainError('A2A_DELIVERY_CONFLICT', 'A2A delivery id was reused with a different authorization envelope')
            deliveryWasReplay = true
            return { sessionId: previousDelivery.session_id }
          }
          const latestSequence = BigInt((await tx.query<{ sequence: string | null }>(
            `SELECT max(sequence)::text AS sequence FROM a2a_deliveries
              WHERE binding_id=$1 AND external_task_id=$2 AND direction='inbound'`,
            [bindingId, taskCommand.externalTaskId],
          )).rows[0]?.sequence ?? '0')
          if (BigInt(body.sequence) <= latestSequence)
            throw new DomainError('A2A_DELIVERY_OUT_OF_ORDER', 'A2A delivery sequence must increase monotonically')
          await tx.query(
            `INSERT INTO a2a_deliveries(
               binding_id,delivery_id,external_task_id,direction,sequence,payload,status
             ) VALUES($1,$2,$3,'inbound',$4,$5,'received')`,
            [bindingId, body.deliveryId, taskCommand.externalTaskId, body.sequence, body.task],
          )
          const existing = (await tx.query<{
            session_id: string
            state: AgentSessionState
            revision: number
            sequence: string
          }>(
            `SELECT task.session_id,session.state,session.revision,session.sequence::text
               FROM a2a_task_bindings task
             JOIN agent_sessions session ON session.id=task.session_id
            WHERE task.binding_id=$1 AND task.external_task_id=$2
              AND session.workspace_id=$3
             FOR UPDATE OF session`,
            [bindingId, taskCommand.externalTaskId, meta.actor.workspaceId],
          )).rows[0]
          let session: {
            id: string
            state: AgentSessionState
            revision: number
            sequence: string
          }
          let created = false
          if (existing) {
            session = {
              id: existing.session_id,
              state: existing.state,
              revision: existing.revision,
              sequence: existing.sequence,
            }
          } else {
            const delegation = one((await tx.query<{ id: string }>(
              `INSERT INTO delegations(
                workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,
                role,scope_type,scope_id,permissions_snapshot,capability_scope
              ) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,$7,$8) RETURNING id`,
              [meta.actor.workspaceId, body.teamId, target.agent_id, target.agent_actor_id, meta.actor.id,
                body.workItemId, authorization.requestedCapabilities, {
                  teamIds: [body.teamId], workItemIds: [body.workItemId],
                  projectIds: target.project_id ? [target.project_id] : [],
                }],
            )).rows)
            const terminal = ['completed', 'failed', 'canceled'].includes(taskCommand.state)
            const inserted = one((await tx.query<{
              id: string
              state: AgentSessionState
              revision: number
              sequence: string
            }>(
              `INSERT INTO agent_sessions(
                workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state,
                result_summary,result_evidence,error_code,error_summary,ended_at
              ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
              RETURNING id,state,revision,sequence::text`,
              [meta.actor.workspaceId, body.teamId, target.agent_id, target.agent_actor_id, delegation.id,
                body.workItemId, taskCommand.state, taskCommand.state === 'completed' ? 'Completed through A2A' : null,
                JSON.stringify(taskCommand.artifacts), taskCommand.state === 'failed' ? 'A2A_TASK_FAILED' : null,
                taskCommand.state === 'failed' ? 'The A2A task reported failure.' : null, terminal ? new Date() : null],
            )).rows)
            session = inserted
            created = true
            await tx.query(
              `INSERT INTO a2a_task_bindings(binding_id,external_task_id,session_id)
               VALUES($1,$2,$3)`,
              [bindingId, taskCommand.externalTaskId, session.id],
            )
            await emit(tx, meta, 'agent.session.created', 'agent_session', session.id, {
              protocol: 'a2a', externalTaskId: taskCommand.externalTaskId, bindingId,
            }, body.teamId, session.revision)
          }
          for (const prompt of taskCommand.prompts) {
            if (!prompt.bodyMarkdown && prompt.data.length === 0) continue
            const bodyMarkdown = prompt.bodyMarkdown || `A2A data message ${prompt.externalMessageId}`
            const insertedPrompt = (await tx.query<{ id: string }>(
              `INSERT INTO agent_session_prompts(
                 session_id,author_actor_id,body_markdown,a2a_external_message_id
               ) SELECT $1,$2,$3,$4
                 WHERE NOT EXISTS (
                   SELECT 1 FROM agent_session_prompts existing
                    WHERE existing.session_id=$1 AND existing.a2a_external_message_id=$4
                 )
               RETURNING id`,
              [session.id, meta.actor.id, bodyMarkdown, prompt.externalMessageId],
            )).rows[0]
            if (insertedPrompt)
              await emit(tx, meta, 'agent.activity.created', 'agent_session', session.id, {
                sessionId: session.id,
                bodyMarkdown,
                externalMessageId: prompt.externalMessageId,
                protocol: 'a2a',
              }, body.teamId)
          }
          for (const artifact of taskCommand.artifacts) {
            const insertedArtifact = (await tx.query<{ id: string }>(
              `INSERT INTO artifacts(
                 workspace_id,session_id,work_item_id,producer_actor_id,type,title,uri,
                 source_tool,metadata
               ) SELECT $1,$2,$3,$4,$5,$6,$7,'a2a',$8
                WHERE NOT EXISTS (
                  SELECT 1 FROM artifacts existing WHERE existing.session_id=$2
                    AND existing.metadata->>'a2aExternalArtifactId'=$9
                ) RETURNING id`,
              [
                meta.actor.workspaceId, session.id, body.workItemId, target.agent_actor_id,
                artifact.type, artifact.title, artifact.uri ?? null,
                { ...artifact.metadata, a2aExternalArtifactId: artifact.externalArtifactId },
                artifact.externalArtifactId,
              ],
            )).rows[0]
            if (insertedArtifact) {
              await emit(tx, meta, 'artifact.created', 'artifact', insertedArtifact.id, {
                sessionId: session.id,
                artifactId: insertedArtifact.id,
                title: artifact.title,
                uri: artifact.uri ?? null,
                protocol: 'a2a',
              }, body.teamId)
            }
          }
          const transition = async (nextState: AgentSessionState): Promise<void> => {
            if (session.state === nextState) return
            assertAgentSessionTransition(session.state, nextState)
            const terminal = ['completed', 'failed', 'canceled'].includes(nextState)
            session = one((await tx.query<{
              id: string
              state: AgentSessionState
              revision: number
              sequence: string
            }>(
              `UPDATE agent_sessions
                  SET state=$2::agent_session_state,
                      state_reason=$3,
                      result_summary=CASE WHEN $2::agent_session_state='completed' THEN 'Completed through A2A' ELSE result_summary END,
                      result_evidence=CASE WHEN $2::agent_session_state='completed' THEN $4::jsonb ELSE result_evidence END,
                      error_code=CASE WHEN $2::agent_session_state='failed' THEN 'A2A_TASK_FAILED' ELSE error_code END,
                      error_summary=CASE WHEN $2::agent_session_state='failed' THEN 'The A2A task reported failure.' ELSE error_summary END,
                      ended_at=CASE WHEN $5 THEN now() ELSE ended_at END,
                      sequence=sequence+1,revision=revision+1,updated_at=now()
                WHERE id=$1
                RETURNING id,state,revision,sequence::text`,
              [
                session.id,
                nextState,
                `A2A task ${taskCommand.externalTaskId} reported ${nextState}`,
                JSON.stringify(taskCommand.artifacts),
                terminal,
              ],
            )).rows)
            await emit(tx, meta, 'agent.session.state_changed', 'agent_session', session.id, {
              sessionId: session.id,
              state: nextState,
              protocol: 'a2a',
              externalTaskId: taskCommand.externalTaskId,
            }, body.teamId, session.revision)
          }
          if (!created) {
            if (session.state === 'queued' && taskCommand.state === 'executing')
              await transition('acknowledged')
            await transition(taskCommand.state)
          }
          await tx.query(
            `UPDATE a2a_deliveries SET session_id=$1,status='processed',processed_at=now()
              WHERE binding_id=$2 AND delivery_id=$3`,
            [session.id, bindingId, body.deliveryId],
          )
          if (created)
            await emit(tx, meta, 'agent.session.state_changed', 'agent_session', session.id, {
              sessionId: session.id,
              state: taskCommand.state,
              protocol: 'a2a',
              externalTaskId: taskCommand.externalTaskId,
            }, body.teamId, session.revision)
          return { sessionId: session.id }
        },
      )
      let accepted
      try {
        accepted = await adapter.acceptTask(body.task, {
          workspaceId: meta.actor.workspaceId,
          bindingId,
          agentId: '',
          requestedCapabilities: body.requestedCapabilities,
          resource: { teamId: body.teamId, workItemId: body.workItemId },
        })
      } catch (error) {
        if (error instanceof A2AValidationError)
          throw new DomainError(error.code, error.message)
        throw error
      }
      if (!deliveryWasReplay)
        await emit(tx, meta, 'a2a.task.accepted', 'a2a_task', randomUUID(), {
          bindingId, externalTaskId: accepted.command.externalTaskId, sessionId: accepted.sessionId,
          deliveryId: body.deliveryId, sequence: body.sequence,
        }, body.teamId)
      return { sessionId: accepted.sessionId, externalTaskId: accepted.command.externalTaskId }
    })
  })

  app.get('/api/v1/a2a-bindings/:id/tasks/:taskId/events', async request => {
    const params = z.object({
      id: uuid,
      taskId: z.string().min(1).max(A2A_TASK_ID_MAX_LENGTH),
    }).parse(request.params)
    const query = z.object({ after: durableCursorSchema }).parse(request.query)
    const current = actor(request)
    const binding = one((await db.query<{ session_id: string; team_id: string }>(
      `SELECT task.session_id,session.team_id
         FROM a2a_agent_bindings binding
         JOIN a2a_task_bindings task ON task.binding_id=binding.id
           AND task.external_task_id=$2
         JOIN agent_sessions session ON session.id=task.session_id
        WHERE binding.id=$1 AND binding.workspace_id=$3 AND binding.active
          AND ($4::boolean OR EXISTS (
            SELECT 1 FROM memberships member WHERE member.workspace_id=binding.workspace_id
              AND member.team_id=session.team_id AND member.actor_id=$5
          ))`,
      [params.id, params.taskId, current.workspaceId, current.workspaceRole === 'admin', current.id],
    )).rows)
    const events = (await db.query<{
      cursor: string
      id: string
      event_type: string
      aggregate_id: string
      payload: Record<string, unknown>
      occurred_at: Date
    }>(
       `SELECT event.cursor::text,event.id,event.event_type,event.aggregate_id,event.payload,event.occurred_at
          FROM domain_events event
         WHERE event.workspace_id=$1 AND event.cursor>$2
         ORDER BY event.cursor LIMIT 200`,
      [current.workspaceId, query.after],
    )).rows
    const deliveries: Array<{ cursor: string; event: ReturnType<typeof mapStreamEvent> }> = []
    for (const event of events) {
      if (event.aggregate_id !== binding.session_id && event.payload.sessionId !== binding.session_id)
        continue
      let mapped: WorkMeshStreamEvent | undefined
      if (event.event_type.includes('state')) {
        const state = typeof event.payload.state === 'string' ? event.payload.state : undefined
        if (state && ['queued', 'executing', 'awaiting_input', 'awaiting_approval', 'completed', 'failed', 'canceled'].includes(state))
          mapped = {
            type: 'session.state_changed',
            sessionId: binding.session_id,
            state: state as Extract<WorkMeshStreamEvent, { type: 'session.state_changed' }>['state'],
            occurredAt: event.occurred_at.toISOString(),
          }
      } else if (event.event_type === 'agent.activity.created' && typeof event.payload.bodyMarkdown === 'string') {
        mapped = {
          type: 'session.message',
          sessionId: binding.session_id,
          messageId: event.id,
          bodyMarkdown: event.payload.bodyMarkdown,
          occurredAt: event.occurred_at.toISOString(),
        }
      } else if (event.event_type.includes('artifact') && typeof event.payload.title === 'string') {
        mapped = {
          type: 'artifact.created',
          sessionId: binding.session_id,
          artifactId: typeof event.payload.artifactId === 'string' ? event.payload.artifactId : event.aggregate_id,
          title: event.payload.title,
          uri: typeof event.payload.uri === 'string' ? event.payload.uri : undefined,
          occurredAt: event.occurred_at.toISOString(),
        }
      }
      if (!mapped) continue
      const payload = mapStreamEvent(params.taskId, mapped)
      await db.query(
        `INSERT INTO a2a_deliveries(
           binding_id,delivery_id,external_task_id,direction,sequence,session_id,domain_event_id,payload,status,processed_at
         ) VALUES($1,$2,$3,'outbound',$4,$5,$6,$7,'processed',now())
         ON CONFLICT(binding_id,domain_event_id) WHERE domain_event_id IS NOT NULL DO NOTHING`,
        [params.id, `event:${event.id}`, params.taskId, event.cursor, binding.session_id, event.id, payload],
      )
      deliveries.push({ cursor: event.cursor, event: payload })
    }
    return {
      events: deliveries,
      cursor: events.at(-1)?.cursor ?? query.after,
    }
  })
}
