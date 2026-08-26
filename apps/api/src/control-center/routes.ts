import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Pool, QueryResult, QueryResultRow } from 'pg'
import { z } from 'zod'
import {
  actionPreviewResponseSchema,
  agentSessionControlActionSchema,
  controlCenterCollectionSchema,
  controlCenterResponseSchema,
  runExplanationResponseSchema,
  workItemExecutionSummaryResponseSchema,
  type ActionPreview,
} from '@workmesh/contracts'
import {
  DomainError,
  evaluateAgentSessionControl,
  type AgentSessionControlAction,
} from '@workmesh/domain'
import type { ApiActor } from '../agent/types.js'
import {
  liveHumanTeamReadPredicate,
  liveSessionReadPredicate,
} from '../live-read-authorization.js'
import type { Paginator } from '../pagination.js'
import {
  humanAttentionAuthorizationPredicate,
} from '../human-attention/routes.js'
import {
  humanAttentionProjectionSql,
  projectHumanAttentionRow,
  type HumanAttentionRow,
} from '../human-attention/projection.js'

const QUERY_TIMEOUT_MS = 1_500
const INITIAL_LIMIT = 10
const MAX_LIMIT = 100
const PREVIEW_TTL_MS = 30_000

type Helpers = Readonly<{ db: Pool; paginator: Paginator }>
type ControlCenterFilters = Readonly<{
  responsibleHumanActorId?: string
  agentActorId?: string
  risk?: 'at_risk'
  workItemState?: string
  timeWindow?: '24h' | '7d' | '30d'
}>
type DigestRow = QueryResultRow & Readonly<{
  id: string
  kind: string
  title: string
  summary: string
  project_id: string | null
  work_item_id: string | null
  session_id: string | null
  state: string
  revision: number
  source_type: string
  updated_at: Date | string
  responsible_human_id?: string | null
  responsible_human_name?: string | null
  active_agent_id?: string | null
  active_agent_name?: string | null
  work_item_title?: string | null
  plan_step_id?: string | null
  plan_step_title?: string | null
  plan_step_status?: z.infer<typeof import('@workmesh/contracts').planStepStatusSchema> | null
  plan_step_ordinal?: number | null
  heartbeat_health?: 'healthy' | 'degraded' | 'stale' | null
  last_heartbeat_at?: Date | string | null
  last_activity_id?: string | null
  last_activity_kind?: string | null
  last_activity_summary?: string | null
  last_activity_at?: Date | string | null
  pending_human_action_count?: string | number | null
  evidence_count?: string | number | null
  verified?: boolean | null
}>
type ProjectRow = QueryResultRow & Readonly<{ id: string; name: string; status: string; target_date: Date | string | null; lead_actor_id: string | null; lead_name: string | null; revision: number; updated_at: Date | string }>

const requestActor = (request: FastifyRequest): ApiActor => request.actor as ApiActor
const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : new Date(value).toISOString()
const dateOnly = (value: Date | string): string => value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)
const idParam = (request: FastifyRequest, key: string): string => z.object({ [key]: z.string().uuid() }).parse(request.params)[key]!
const boundedQuery = async <T extends QueryResultRow>(db: Pool, text: string, values: unknown[]): Promise<QueryResult<T>> => {
  const client = await db.connect()
  try {
    await client.query('BEGIN READ ONLY')
    await client.query(`SET LOCAL statement_timeout='${QUERY_TIMEOUT_MS}ms'`)
    const result = await client.query<T>(text, values)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const sourceScopePredicate = (
  current: ApiActor,
  columns: Readonly<{ workspace: string; team: string; project: string; session: string; workItem: string }>,
  values: unknown[],
): string => {
  if (current.kind === 'human')
    return liveHumanTeamReadPredicate(current, columns.workspace, columns.team, values)
  values.push(current.agentSessionId ?? null)
  const exactSession = `$${values.length}`
  const live = liveSessionReadPredicate(current, 'reader.id', 'reader.workspace_id', values)
  return `EXISTS (
    SELECT 1
      FROM agent_sessions reader
      LEFT JOIN work_items reader_item
        ON reader_item.id=reader.work_item_id
       AND reader_item.workspace_id=reader.workspace_id
       AND reader_item.deleted_at IS NULL
     WHERE reader.id=${exactSession}
       AND reader.workspace_id=${columns.workspace}
       AND ${live}
       AND (
         ${columns.session}=reader.id
         OR (${columns.workItem} IS NOT NULL AND ${columns.workItem}=reader.work_item_id)
         OR (${columns.project} IS NOT NULL AND ${columns.project}=COALESCE(reader.project_id,reader_item.project_id))
         OR (reader.session_kind='coordination' AND ${columns.team}=reader.team_id)
       )
  )`
}

const digest = (row: DigestRow) => ({
  id: `${row.source_type}:${row.id}`,
  kind: row.kind,
  title: row.title,
  summary: row.summary,
  projectId: row.project_id,
  workItemId: row.work_item_id,
  sessionId: row.session_id,
  state: row.state,
  revision: Number(row.revision),
  source: { type: row.source_type, id: row.id, revision: Number(row.revision) },
  responsibleHuman: row.responsible_human_id && row.responsible_human_name
    ? { id: row.responsible_human_id, kind: 'human' as const, displayName: row.responsible_human_name }
    : null,
  activeAgent: row.active_agent_id && row.active_agent_name
    ? { id: row.active_agent_id, kind: 'agent' as const, displayName: row.active_agent_name }
    : null,
  workItem: row.work_item_id && row.work_item_title
    ? { id: row.work_item_id, title: row.work_item_title }
    : null,
  currentStep: row.plan_step_id && row.plan_step_title && row.plan_step_status !== null && row.plan_step_status !== undefined && row.plan_step_ordinal !== null && row.plan_step_ordinal !== undefined
    ? { id: row.plan_step_id, title: row.plan_step_title, status: row.plan_step_status, ordinal: Number(row.plan_step_ordinal) }
    : null,
  health: row.heartbeat_health
    ? { heartbeat: row.heartbeat_health, lastHeartbeatAt: row.last_heartbeat_at ? iso(row.last_heartbeat_at) : null }
    : null,
  lastActivity: row.last_activity_id && row.last_activity_kind && row.last_activity_summary && row.last_activity_at
    ? { id: row.last_activity_id, kind: row.last_activity_kind, summary: row.last_activity_summary, createdAt: iso(row.last_activity_at) }
    : null,
  pendingHumanActionCount: Number(row.pending_human_action_count ?? 0),
  evidenceCount: Number(row.evidence_count ?? 0),
  verified: row.verified === true,
  updatedAt: iso(row.updated_at),
})

const sessionDigestColumns = `
       ,responsible.id AS responsible_human_id,responsible.display_name AS responsible_human_name,
        agent.id AS active_agent_id,agent.display_name AS active_agent_name,item.title AS work_item_title,
        item_state.category::text AS work_item_state,
        step.id AS plan_step_id,step.title AS plan_step_title,step.status AS plan_step_status,step.ordinal AS plan_step_ordinal,
        session.heartbeat_health,session.last_heartbeat_at,
        activity.id AS last_activity_id,activity.kind AS last_activity_kind,
        activity.summary AS last_activity_summary,activity.created_at AS last_activity_at,
        ((SELECT count(*) FROM decisions decision WHERE decision.session_id=session.id AND decision.status='proposed')
          +(SELECT count(*) FROM approvals approval WHERE approval.session_id=session.id AND approval.status='pending' AND approval.expires_at>now())
          +(SELECT count(*) FROM inbox_items inbox WHERE inbox.session_id=session.id AND inbox.status='open' AND inbox.requires_response=true)) AS pending_human_action_count,
        (SELECT count(*) FROM artifacts artifact WHERE artifact.session_id=session.id AND artifact.workspace_id=session.workspace_id) AS evidence_count,
        EXISTS(SELECT 1 FROM artifacts artifact WHERE artifact.session_id=session.id AND artifact.workspace_id=session.workspace_id) AS verified`

const sessionDigestJoins = `
      JOIN actors agent ON agent.id=session.agent_actor_id AND agent.workspace_id=session.workspace_id
      LEFT JOIN work_items item ON item.id=session.work_item_id AND item.workspace_id=session.workspace_id AND item.deleted_at IS NULL
      LEFT JOIN workflow_states item_state ON item_state.id=item.status_id AND item_state.workspace_id=session.workspace_id
      LEFT JOIN actors responsible ON responsible.id=item.responsible_human_actor_id AND responsible.workspace_id=session.workspace_id AND responsible.kind='human'
      LEFT JOIN LATERAL (
        SELECT candidate.id,candidate.title,candidate.status,candidate.ordinal
          FROM agent_plan_steps candidate
         WHERE candidate.plan_version_id=session.current_plan_version_id
         ORDER BY (candidate.id=session.heartbeat_current_step_id) DESC,(candidate.status='in_progress') DESC,candidate.ordinal
         LIMIT 1
      ) step ON true
      LEFT JOIN LATERAL (
        SELECT candidate.id,candidate.kind,candidate.summary,candidate.created_at
          FROM agent_activities candidate
         WHERE candidate.session_id=session.id AND candidate.ephemeral=false AND candidate.kind<>'heartbeat'
         ORDER BY candidate.sequence DESC,candidate.id DESC
         LIMIT 1
      ) activity ON true`

const collectionSql = (collection: z.infer<typeof controlCenterCollectionSchema>) => {
  if (collection === 'running') return `
    SELECT session.id,'run'::text AS kind,agent.display_name AS title,
           COALESCE(NULLIF(session.state_reason,''),concat('Agent Session is ',session.state::text)) AS summary,
           COALESCE(session.project_id,item.project_id) AS project_id,session.work_item_id,session.id AS session_id,
           session.state::text AS state,session.revision,'agent_session'::text AS source_type,session.updated_at,
           session.team_id,session.workspace_id${sessionDigestColumns}
      FROM agent_sessions session
      ${sessionDigestJoins}
     WHERE session.workspace_id=$1
       AND session.state IN ('queued','acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked','paused','stopping','stale')`
  if (collection === 'risks') return `
    SELECT session.id,'risk'::text AS kind,concat('Session ',session.state::text) AS title,
           COALESCE(NULLIF(session.error_summary,''),NULLIF(session.state_reason,''),'Execution health needs review') AS summary,
           COALESCE(session.project_id,item.project_id) AS project_id,session.work_item_id,session.id AS session_id,
           session.state::text AS state,session.revision,'agent_session'::text AS source_type,session.updated_at,
           session.team_id,session.workspace_id${sessionDigestColumns}
      FROM agent_sessions session
      ${sessionDigestJoins}
     WHERE session.workspace_id=$1
       AND (session.state IN ('blocked','failed','stale') OR session.heartbeat_health IN ('degraded','stale'))`
  if (collection === 'recently_verified') return `
    SELECT session.id,'verified_outcome'::text AS kind,COALESCE(item.title,'Completed Agent Session') AS title,
           COALESCE(NULLIF(session.result_summary,''),'Execution completed with recorded evidence') AS summary,
           COALESCE(session.project_id,item.project_id) AS project_id,session.work_item_id,session.id AS session_id,
           session.state::text AS state,session.revision,'agent_session'::text AS source_type,session.updated_at,
           session.team_id,session.workspace_id${sessionDigestColumns}
      FROM agent_sessions session
      ${sessionDigestJoins}
     WHERE session.workspace_id=$1 AND session.state='completed'
       AND EXISTS(SELECT 1 FROM artifacts evidence WHERE evidence.session_id=session.id AND evidence.workspace_id=session.workspace_id)`
  if (collection === 'ready_work') return `
    SELECT item.id,'ready_work'::text AS kind,item.title,
           COALESCE(NULLIF(item.description,''),'Work Item is ready for execution') AS summary,
           item.project_id,item.id AS work_item_id,NULL::uuid AS session_id,
           state.category::text AS state,item.revision,'work_item'::text AS source_type,item.updated_at,
           item.team_id,item.workspace_id,responsible.id AS responsible_human_id,
           responsible.display_name AS responsible_human_name,item.title AS work_item_title,
           NULL::uuid AS active_agent_id,NULL::text AS active_agent_name,
           state.category::text AS work_item_state,NULL::text AS heartbeat_health
      FROM work_items item
      JOIN workflow_states state ON state.id=item.status_id AND state.workspace_id=item.workspace_id
      LEFT JOIN actors responsible ON responsible.id=item.responsible_human_actor_id AND responsible.workspace_id=item.workspace_id AND responsible.kind='human'
     WHERE item.workspace_id=$1 AND item.deleted_at IS NULL AND state.category='planned'
       AND NOT EXISTS (SELECT 1 FROM agent_sessions active WHERE active.work_item_id=item.id AND active.workspace_id=item.workspace_id AND active.state NOT IN ('completed','failed','canceled'))`
  return `
    SELECT item.id,'blocked_work'::text AS kind,item.title,
           COALESCE(NULLIF(blocked.state_reason,''),'Work Item has a blocked Agent execution') AS summary,
           item.project_id,item.id AS work_item_id,blocked.id AS session_id,
           blocked.state::text AS state,GREATEST(item.revision,blocked.revision) AS revision,'work_item'::text AS source_type,
           GREATEST(item.updated_at,blocked.updated_at) AS updated_at,item.team_id,item.workspace_id,
           responsible.id AS responsible_human_id,responsible.display_name AS responsible_human_name,
           blocked.agent_actor_id AS active_agent_id,blocked.agent_name AS active_agent_name,
           item.title AS work_item_title,item_state.category::text AS work_item_state,
           blocked.heartbeat_health,blocked.last_heartbeat_at
      FROM work_items item
      JOIN workflow_states item_state ON item_state.id=item.status_id AND item_state.workspace_id=item.workspace_id
      LEFT JOIN actors responsible ON responsible.id=item.responsible_human_actor_id AND responsible.workspace_id=item.workspace_id AND responsible.kind='human'
      JOIN LATERAL (
        SELECT session.id,session.state,session.state_reason,session.revision,session.updated_at,
               session.agent_actor_id,agent.display_name AS agent_name,session.heartbeat_health,session.last_heartbeat_at
          FROM agent_sessions session
          JOIN actors agent ON agent.id=session.agent_actor_id AND agent.workspace_id=session.workspace_id
         WHERE session.workspace_id=item.workspace_id AND session.work_item_id=item.id AND session.state='blocked'
         ORDER BY session.updated_at DESC,session.id DESC LIMIT 1
      ) blocked ON true
     WHERE item.workspace_id=$1 AND item.deleted_at IS NULL`
}

const applyTimeWindow = (column: string, timeWindow: ControlCenterFilters['timeWindow'], where: string[]) => {
  if (timeWindow === '24h') where.push(`${column}>=now()-interval '24 hours'`)
  else if (timeWindow === '7d') where.push(`${column}>=now()-interval '7 days'`)
  else if (timeWindow === '30d') where.push(`${column}>=now()-interval '30 days'`)
}

async function readAttentionPage(h: Helpers, request: FastifyRequest, projectId: string | undefined, rawPage: unknown, filters: ControlCenterFilters) {
  const current = requestActor(request)
  const values: unknown[] = [current.workspaceId]
  const where = [humanAttentionAuthorizationPredicate(current, values), "attention.status='open'"]
  if (projectId) { values.push(projectId); where.push(`attention.project_id=$${values.length}`) }
  if (filters.responsibleHumanActorId) { values.push(filters.responsibleHumanActorId); where.push(`attention.responsible_human_actor_id=$${values.length}`) }
  if (filters.agentActorId) { values.push(filters.agentActorId); where.push(`attention.requested_by_actor_id=$${values.length} AND requester.kind='agent'`) }
  if (filters.risk === 'at_risk') where.push(`(attention.risk_level IN ('high','critical') OR attention.kind IN ('conflict','recovery'))`)
  if (filters.workItemState) {
    values.push(filters.workItemState)
    where.push(`EXISTS (SELECT 1 FROM work_items filtered_item JOIN workflow_states filtered_state ON filtered_state.id=filtered_item.status_id AND filtered_state.workspace_id=filtered_item.workspace_id WHERE filtered_item.id=attention.work_item_id AND filtered_item.workspace_id=attention.workspace_id AND filtered_item.deleted_at IS NULL AND filtered_state.category::text=$${values.length})`)
  }
  applyTimeWindow('attention.updated_at', filters.timeWindow, where)
  const page = h.paginator.prepare(request, rawPage, {
    route: projectId ? '/api/v1/projects/:projectId/control-center:attention' : '/api/v1/control-center:attention',
    filters: { projectId: projectId ?? null, collection: 'attention', ...filters },
    sort: [{ key: 'updated_cursor', sql: `to_char(attention.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, direction: 'DESC' }, { key: 'source_id', sql: 'attention.source_id', direction: 'DESC' }],
  }, values)
  page.values.push(page.limit + 1)
  await page.beforeQuery()
  const result = await boundedQuery<HumanAttentionRow & QueryResultRow>(h.db,
    `${humanAttentionProjectionSql} AND ${where.join(' AND ')}${page.predicate ? ` AND ${page.predicate}` : ''} ORDER BY ${page.orderBy} LIMIT $${page.values.length}`,
    page.values,
  )
  const projected = page.finish<HumanAttentionRow & QueryResultRow>(result.rows)
  return { ...projected, items: projected.items.map(row => {
    const item = projectHumanAttentionRow(row)
    return {
      id: item.id, kind: item.kind, title: item.title, summary: item.summary,
      projectId: item.projectId, workItemId: item.workItemId, sessionId: item.sessionId,
      state: item.status, revision: item.sourceRevision,
      source: { type: item.source.type, id: item.source.id, revision: item.sourceRevision },
      responsibleHuman: item.responsibleHuman,
      activeAgent: item.requestedBy.kind === 'agent' ? item.requestedBy : null,
      workItem: null,
      currentStep: null,
      health: null,
      lastActivity: null,
      pendingHumanActionCount: item.status === 'open' ? 1 : 0,
      evidenceCount: item.evidence.length,
      verified: item.status === 'verified',
      updatedAt: item.updatedAt,
    }
  }) }
}

async function readDigestPage(
  h: Helpers,
  request: FastifyRequest,
  collection: Exclude<z.infer<typeof controlCenterCollectionSchema>, 'attention'>,
  projectId: string | undefined,
  rawPage: unknown,
  filters: ControlCenterFilters,
) {
  const current = requestActor(request)
  const values: unknown[] = [current.workspaceId]
  const sql = collectionSql(collection)
  const scope = sourceScopePredicate(current, {
    workspace: 'source.workspace_id', team: 'source.team_id', project: 'source.project_id',
    session: 'source.session_id', workItem: 'source.work_item_id',
  }, values)
  const where = [scope]
  if (projectId) { values.push(projectId); where.push(`source.project_id=$${values.length}`) }
  if (filters.responsibleHumanActorId) { values.push(filters.responsibleHumanActorId); where.push(`source.responsible_human_id=$${values.length}`) }
  if (filters.agentActorId) { values.push(filters.agentActorId); where.push(`source.active_agent_id=$${values.length}`) }
  if (filters.risk === 'at_risk') where.push(`(source.kind='risk' OR source.state IN ('blocked','failed','stale') OR source.heartbeat_health IN ('degraded','stale'))`)
  if (filters.workItemState) { values.push(filters.workItemState); where.push(`source.work_item_state=$${values.length}`) }
  applyTimeWindow('source.updated_at', filters.timeWindow, where)
  const route = projectId ? `/api/v1/projects/:projectId/control-center:${collection}` : `/api/v1/control-center:${collection}`
  const page = h.paginator.prepare(request, rawPage, {
    route,
    filters: { projectId: projectId ?? null, collection, ...filters },
    sort: [{ key: 'updated_cursor', sql: `to_char(source.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, direction: 'DESC' }, { key: 'id', sql: 'source.id', direction: 'DESC' }],
  }, values)
  page.values.push(page.limit + 1)
  await page.beforeQuery()
  const result = await boundedQuery<DigestRow>(h.db,
    `SELECT source.*,to_char(source.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_cursor FROM (${sql}) source WHERE ${where.join(' AND ')}${page.predicate ? ` AND ${page.predicate}` : ''} ORDER BY ${page.orderBy} LIMIT $${page.values.length}`,
    page.values,
  )
  const resultPage = page.finish<DigestRow>(result.rows)
  return { ...resultPage, items: resultPage.items.map(digest) }
}

async function buildControlCenter(h: Helpers, request: FastifyRequest, reply: FastifyReply, projectId?: string) {
  const query = z.object({
    collection: controlCenterCollectionSchema.optional(),
    cursor: z.string().max(8_192).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(20),
    responsibleHumanActorId: z.string().uuid().optional(),
    agentActorId: z.string().uuid().optional(),
    risk: z.literal('at_risk').optional(),
    workItemState: z.enum(['backlog', 'planned', 'started', 'completed', 'canceled']).optional(),
    timeWindow: z.enum(['24h', '7d', '30d']).optional(),
  }).parse(request.query)
  const filters: ControlCenterFilters = {
    responsibleHumanActorId: query.responsibleHumanActorId,
    agentActorId: query.agentActorId,
    risk: query.risk,
    workItemState: query.workItemState,
    timeWindow: query.timeWindow,
  }
  const current = requestActor(request)
  let project: ProjectRow | null = null
  if (projectId) {
    const values: unknown[] = [projectId, current.workspaceId]
    const auth = sourceScopePredicate(current, {
      workspace: 'project.workspace_id', team: 'project.team_id', project: 'project.id',
      session: 'NULL::uuid', workItem: 'NULL::uuid',
    }, values)
    project = (await boundedQuery<ProjectRow>(h.db,
      `SELECT project.id,project.name,project.status,project.target_date,project.lead_actor_id,lead.display_name AS lead_name,project.revision,project.updated_at FROM projects project LEFT JOIN actors lead ON lead.id=project.lead_actor_id AND lead.workspace_id=project.workspace_id AND lead.kind='human' WHERE project.id=$1 AND project.workspace_id=$2 AND project.deleted_at IS NULL AND ${auth}`,
      values,
    )).rows[0] ?? null
    if (!project) throw new DomainError('NOT_FOUND', 'Project Control Center not found')
  }
  const collections = controlCenterCollectionSchema.options
  const pages = await Promise.all(collections.map(async collection => {
    if (query.collection && query.collection !== collection) return [collection, { items: [], nextCursor: null }] as const
    const rawPage = { cursor: query.collection === collection ? query.cursor : undefined, limit: query.collection ? query.limit : INITIAL_LIMIT }
    const page = collection === 'attention'
      ? await readAttentionPage(h, request, projectId, rawPage, filters)
      : await readDigestPage(h, request, collection, projectId, rawPage, filters)
    return [collection, page] as const
  }))
  const sectionMap = Object.fromEntries(pages)
  const allItems = pages.flatMap(([, page]) => page.items as Array<{ revision: number; updatedAt: string }>)
  const revision = Math.max(project?.revision ?? 1, ...allItems.map(item => item.revision))
  const sourceUpdatedAt = allItems.map(item => item.updatedAt).sort().at(-1) ?? project?.updated_at ?? new Date()
  const observedAt = new Date().toISOString()
  reply.header('ETag', `"control-center-v1-${revision}"`)
  return controlCenterResponseSchema.parse({
    projectionVersion: 1,
    scope: { workspaceId: current.workspaceId, projectId: projectId ?? null },
    project: project ? {
      id: project.id,
      name: project.name,
      status: project.status,
      targetDate: project.target_date ? dateOnly(project.target_date) : null,
      responsibleHuman: project.lead_actor_id && project.lead_name ? { id: project.lead_actor_id, kind: 'human', displayName: project.lead_name } : null,
      revision: project.revision,
    } : null,
    revision,
    freshness: { state: 'current', observedAt, sourceUpdatedAt: iso(sourceUpdatedAt) },
    collections: sectionMap,
  })
}

const controlActions = agentSessionControlActionSchema.options

const groupActivities = (rows: Array<{ id: string; sequence: string | number; kind: string; summary: string }>) => {
  const groups: Array<{ id: string; kind: string; summary: string; count: number; firstSequence: number; lastSequence: number; sourceActivityIds: string[] }> = []
  for (const row of rows) {
    const sequence = Number(row.sequence)
    const previous = groups.at(-1)
    const lowValue = row.kind === 'heartbeat' || row.kind === 'action_completed'
    if (lowValue && previous?.kind === row.kind && previous.summary === row.summary) {
      previous.count += 1
      previous.lastSequence = sequence
      previous.sourceActivityIds.push(row.id)
    } else groups.push({ id: `activity-group:${row.id}`, kind: row.kind, summary: row.summary, count: 1, firstSequence: sequence, lastSequence: sequence, sourceActivityIds: [row.id] })
  }
  return groups
}

async function readRunExplanation(h: Helpers, request: FastifyRequest, reply: FastifyReply, sessionId: string) {
  const current = requestActor(request)
  const values: unknown[] = [sessionId, current.workspaceId]
  const auth = liveSessionReadPredicate(current, 'session.id', 'session.workspace_id', values)
  const result = await boundedQuery<QueryResultRow & {
    id: string; state: z.infer<typeof import('@workmesh/contracts').agentSessionStateSchema>; revision: number; state_reason: string | null; updated_at: Date | string
    work_item_id: string | null; work_item_title: string | null; work_item_revision: number | null
    responsible_id: string | null; responsible_name: string | null; agent_actor_id: string; agent_name: string
    plan_id: string | null; plan_revision: number | null; change_summary: string | null
    step_id: string | null; step_title: string | null; step_status: z.infer<typeof import('@workmesh/contracts').planStepStatusSchema> | null; step_ordinal: number | null
    heartbeat_health: 'healthy' | 'degraded' | 'stale'; last_heartbeat_at: Date | string | null; lease_count: string; approval_count: string
  }>(h.db, `
    SELECT session.id,session.state,session.revision,session.state_reason,session.updated_at,
           session.work_item_id,item.title AS work_item_title,item.revision AS work_item_revision,
           responsible.id AS responsible_id,responsible.display_name AS responsible_name,
           session.agent_actor_id,agent.display_name AS agent_name,
           plan.id AS plan_id,plan.revision AS plan_revision,plan.change_summary,
           step.id AS step_id,step.title AS step_title,step.status AS step_status,step.ordinal AS step_ordinal,
           session.heartbeat_health,session.last_heartbeat_at,
           (SELECT count(*) FROM leases lease WHERE lease.session_id=session.id AND lease.workspace_id=session.workspace_id AND lease.status='active') AS lease_count,
           (SELECT count(*) FROM approvals approval WHERE approval.session_id=session.id AND approval.workspace_id=session.workspace_id AND approval.status IN ('pending','approved')) AS approval_count
      FROM agent_sessions session
      JOIN actors agent ON agent.id=session.agent_actor_id AND agent.workspace_id=session.workspace_id
      LEFT JOIN work_items item ON item.id=session.work_item_id AND item.workspace_id=session.workspace_id AND item.deleted_at IS NULL
      LEFT JOIN actors responsible ON responsible.id=item.responsible_human_actor_id AND responsible.workspace_id=session.workspace_id AND responsible.kind='human'
      LEFT JOIN agent_plan_versions plan ON plan.id=session.current_plan_version_id
      LEFT JOIN LATERAL (
        SELECT candidate.id,candidate.title,candidate.status,candidate.ordinal
          FROM agent_plan_steps candidate
         WHERE candidate.plan_version_id=session.current_plan_version_id
         ORDER BY (candidate.id=session.heartbeat_current_step_id) DESC,(candidate.status='in_progress') DESC,candidate.ordinal
         LIMIT 1
      ) step ON true
     WHERE session.id=$1 AND session.workspace_id=$2 AND ${auth}`,
    values,
  )
  const row = result.rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Run Explanation not found')
  const activityValues: unknown[] = [sessionId, current.workspaceId]
  const activityAuth = liveSessionReadPredicate(current, 'session.id', 'session.workspace_id', activityValues)
  const artifactValues: unknown[] = [sessionId, current.workspaceId]
  const artifactAuth = liveSessionReadPredicate(current, 'session.id', 'session.workspace_id', artifactValues)
  const [activities, artifacts, attention] = await Promise.all([
    boundedQuery<{ id: string; sequence: string | number; kind: string; summary: string } & QueryResultRow>(h.db,
      `SELECT activity.id,activity.sequence,activity.kind,activity.summary FROM agent_sessions session JOIN LATERAL (SELECT * FROM agent_activities source WHERE source.session_id=session.id ORDER BY source.sequence DESC,source.id DESC LIMIT 200) activity ON true WHERE session.id=$1 AND session.workspace_id=$2 AND ${activityAuth} ORDER BY activity.sequence,activity.id`, activityValues),
    boundedQuery<{ id: string; type: string; title: string; uri: string | null } & QueryResultRow>(h.db,
      `SELECT artifact.id,artifact.type,artifact.title,artifact.uri FROM agent_sessions session JOIN LATERAL (SELECT source.id,source.type,source.title,source.uri,source.created_at FROM artifacts source WHERE source.session_id=session.id AND source.workspace_id=session.workspace_id ORDER BY source.created_at DESC,source.id DESC LIMIT 200) artifact ON true WHERE session.id=$1 AND session.workspace_id=$2 AND ${artifactAuth} ORDER BY artifact.created_at DESC,artifact.id DESC`, artifactValues),
    (() => {
      const attentionValues: unknown[] = [current.workspaceId]
      const attentionAuth = humanAttentionAuthorizationPredicate(current, attentionValues)
      attentionValues.push(sessionId)
      return boundedQuery<HumanAttentionRow & QueryResultRow>(h.db,
        `${humanAttentionProjectionSql} AND ${attentionAuth} AND attention.session_id=$${attentionValues.length} AND attention.status='open' ORDER BY attention.updated_at DESC,attention.source_id DESC LIMIT 100`, attentionValues)
    })(),
  ])
  const observedAt = new Date().toISOString()
  const policies = controlActions.map(action => evaluateAgentSessionControl(row.state, action))
  reply.header('ETag', `"run-explanation-v1-${row.revision}"`)
  return runExplanationResponseSchema.parse({
    projectionVersion: 1,
    session: { id: row.id, state: row.state, revision: row.revision, stateReason: row.state_reason, updatedAt: iso(row.updated_at) },
    workItem: row.work_item_id ? { id: row.work_item_id, title: row.work_item_title!, revision: row.work_item_revision! } : null,
    responsibleHuman: row.responsible_id ? { id: row.responsible_id, kind: 'human', displayName: row.responsible_name! } : null,
    activeAgent: { id: row.agent_actor_id, kind: 'agent', displayName: row.agent_name },
    plan: row.plan_id ? { id: row.plan_id, revision: row.plan_revision!, changeSummary: row.change_summary! } : null,
    currentStep: row.step_id ? { id: row.step_id, title: row.step_title!, status: row.step_status!, ordinal: row.step_ordinal! } : null,
    causalGroups: groupActivities(activities.rows),
    pendingAttention: attention.rows.map(item => projectHumanAttentionRow(item)),
    changes: [
      { type: 'agent_session', id: row.id, revision: row.revision },
      ...(row.work_item_id ? [{ type: 'work_item', id: row.work_item_id, revision: row.work_item_revision! }] : []),
      ...artifacts.rows.map(item => ({ type: 'artifact', id: item.id, label: item.title })),
    ],
    evidence: artifacts.rows.map(item => ({ type: item.type, id: item.id, title: item.title, ...(item.uri ? { uri: item.uri } : {}) })),
    health: { heartbeat: row.heartbeat_health, lastHeartbeatAt: row.last_heartbeat_at ? iso(row.last_heartbeat_at) : null, leaseCount: Number(row.lease_count), pendingApprovalCount: Number(row.approval_count) },
    freshness: { state: row.heartbeat_health === 'stale' ? 'stale' : 'current', observedAt, sourceUpdatedAt: iso(row.updated_at) },
    allowedControls: policies,
  })
}

async function readExecutionSummary(h: Helpers, request: FastifyRequest, reply: FastifyReply, workItemId: string) {
  const current = requestActor(request)
  const values: unknown[] = [workItemId, current.workspaceId]
  const auth = sourceScopePredicate(current, {
    workspace: 'item.workspace_id', team: 'item.team_id', project: 'item.project_id', session: 'NULL::uuid', workItem: 'item.id',
  }, values)
  const item = (await boundedQuery<{ id: string; title: string; revision: number; status: string; updated_at: Date | string } & QueryResultRow>(h.db,
    `SELECT item.id,item.title,item.revision,state.name AS status,item.updated_at FROM work_items item JOIN workflow_states state ON state.id=item.status_id WHERE item.id=$1 AND item.workspace_id=$2 AND item.deleted_at IS NULL AND ${auth}`,
    values,
  )).rows[0]
  if (!item) throw new DomainError('NOT_FOUND', 'Work Item execution summary not found')
  const runValues: unknown[] = [workItemId, current.workspaceId]
  const runAuth = sourceScopePredicate(current, {
    workspace: 'work.workspace_id', team: 'work.team_id', project: 'work.project_id', session: 'session.id', workItem: 'work.id',
  }, runValues)
  const runs = (await boundedQuery<DigestRow>(h.db, `
    SELECT session.id,'run'::text AS kind,agent.display_name AS title,
           COALESCE(NULLIF(session.result_summary,''),NULLIF(session.state_reason,''),concat('Agent Session is ',session.state::text)) AS summary,
           COALESCE(session.project_id,work.project_id) AS project_id,session.work_item_id,session.id AS session_id,
           session.state::text AS state,session.revision,'agent_session'::text AS source_type,session.updated_at
      FROM agent_sessions session
      JOIN actors agent ON agent.id=session.agent_actor_id
      JOIN work_items work ON work.id=session.work_item_id AND work.workspace_id=session.workspace_id
     WHERE session.work_item_id=$1 AND session.workspace_id=$2 AND ${runAuth}
     ORDER BY session.updated_at DESC,session.id DESC LIMIT 100`, runValues)).rows
  const artifactValues: unknown[] = [workItemId, current.workspaceId]
  const artifactAuth = sourceScopePredicate(current, {
    workspace: 'item.workspace_id', team: 'item.team_id', project: 'item.project_id', session: 'artifact.session_id', workItem: 'item.id',
  }, artifactValues)
  const artifacts = (await boundedQuery<{ id: string; type: string; title: string; uri: string | null } & QueryResultRow>(h.db,
    `SELECT artifact.id,artifact.type,artifact.title,artifact.uri FROM artifacts artifact JOIN work_items item ON item.id=artifact.work_item_id AND item.workspace_id=artifact.workspace_id AND item.deleted_at IS NULL WHERE artifact.work_item_id=$1 AND artifact.workspace_id=$2 AND ${artifactAuth} ORDER BY artifact.created_at DESC,artifact.id DESC LIMIT 200`, artifactValues)).rows
  const active = new Set(['queued','acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked','paused','stopping','stale'])
  reply.header('ETag', `"execution-summary-v1-${item.revision}"`)
  return workItemExecutionSummaryResponseSchema.parse({
    projectionVersion: 1,
    workItem: { id: item.id, title: item.title, revision: item.revision, status: item.status },
    activeRuns: runs.filter(row => active.has(row.state)).map(digest),
    recentRuns: runs.filter(row => !active.has(row.state)).map(digest),
    evidence: artifacts.map(artifact => ({ type: artifact.type, id: artifact.id, title: artifact.title, ...(artifact.uri ? { uri: artifact.uri } : {}) })),
    freshness: { state: 'current', observedAt: new Date().toISOString(), sourceUpdatedAt: iso(item.updated_at) },
  })
}

const consequences = (action: AgentSessionControlAction, leaseCount: number) => {
  if (action === 'stop') return [
    { code: 'session.transition.stopping', summary: 'The Session enters stopping and ordinary writes are blocked.' },
    ...(leaseCount ? [{ code: 'lease.release', summary: `${leaseCount} active Lease(s) will be released by the stop command.` }] : []),
  ]
  if (action === 'pause') return [{ code: 'session.transition.paused', summary: 'Execution pauses while durable Session history and artifacts remain.' }]
  if (action === 'resume') return [{ code: 'session.transition.executing', summary: 'Execution resumes after final authority and revision validation.' }]
  if (action === 'retry') return [{ code: 'session.retry.create', summary: 'A distinct queued retry Session is created; terminal history is not reopened.' }]
  if (action === 'handoff') return [{ code: 'handoff.offer', summary: 'A scoped Handoff package is offered; acceptance remains a separate command.' }]
  if (action === 'replan') return [{ code: 'plan.revision.request', summary: 'The Agent is asked to publish a new immutable Plan version.' }]
  return [{ code: 'session.prompt', summary: 'A Human prompt steers the current Session without rewriting prior facts.' }]
}

async function previewControl(h: Helpers, request: FastifyRequest, reply: FastifyReply, sessionId: string) {
  const current = requestActor(request)
  const input = z.object({ action: agentSessionControlActionSchema }).parse(request.body)
  const values: unknown[] = [sessionId, current.workspaceId]
  const auth = liveSessionReadPredicate(current, 'session.id', 'session.workspace_id', values)
  const row = (await boundedQuery<QueryResultRow & {
    id: string; state: z.infer<typeof import('@workmesh/contracts').agentSessionStateSchema>; revision: number; updated_at: Date | string
    project_id: string | null; work_item_id: string | null; team_id: string; lease_count: string; approval_ids: string[]; delegation_status: string; agent_active: boolean; team_active: boolean; direct_retry_exists: boolean
  }>(h.db, `
    SELECT session.id,session.state,session.revision,session.updated_at,COALESCE(session.project_id,item.project_id) AS project_id,
           session.work_item_id,session.team_id,delegation.status AS delegation_status,agent.is_active AS agent_active,
           EXISTS(SELECT 1 FROM agent_team_access access WHERE access.workspace_id=session.workspace_id AND access.agent_id=session.agent_id AND access.team_id=session.team_id AND access.revoked_at IS NULL) AS team_active,
           EXISTS(SELECT 1 FROM agent_sessions retry WHERE retry.retry_of_session_id=session.id) AS direct_retry_exists,
           (SELECT count(*) FROM leases lease WHERE lease.workspace_id=session.workspace_id AND lease.session_id=session.id AND lease.status='active') AS lease_count,
           COALESCE((SELECT array_agg(approval.id ORDER BY approval.id) FROM approvals approval WHERE approval.workspace_id=session.workspace_id AND approval.session_id=session.id AND approval.status IN ('pending','approved')),'{}'::uuid[]) AS approval_ids
      FROM agent_sessions session
      JOIN delegations delegation ON delegation.id=session.delegation_id
      JOIN agent_definitions agent ON agent.id=session.agent_id
      LEFT JOIN work_items item ON item.id=session.work_item_id AND item.workspace_id=session.workspace_id AND item.deleted_at IS NULL
     WHERE session.id=$1 AND session.workspace_id=$2 AND ${auth}`,
    values,
  )).rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Session control preview not found')
  const policy = evaluateAgentSessionControl(row.state, input.action)
  const retryAuthority = input.action !== 'retry' || (row.delegation_status === 'active' && row.agent_active && row.team_active && !row.direct_retry_exists)
  const allowed = policy.allowed && retryAuthority
  const leaseCount = Number(row.lease_count)
  const observedAt = new Date()
  const expiresAt = new Date(observedAt.getTime() + PREVIEW_TTL_MS).toISOString()
  const warnings = [
    'This preview is advisory; the final command revalidates all authority and current state.',
    ...(input.action === 'stop' ? ['Uncommitted runtime work may require Agent cleanup before stop acknowledgement.'] : []),
    ...(!retryAuthority ? ['Retry authority, Agent grant, or direct-retry uniqueness is no longer valid.'] : []),
  ]
  const response: ActionPreview = {
    projectionVersion: 1,
    action: input.action,
    allowed,
    reasonCode: allowed ? policy.reasonCode : retryAuthority ? policy.reasonCode : 'retry.authority_unavailable',
    sourceRevision: row.revision,
    currentState: row.state,
    targetState: policy.targetState,
    affectedResources: [
      { type: 'agent_session', id: row.id, revision: row.revision },
      ...(row.project_id ? [{ type: 'project', id: row.project_id }] : []),
      ...(row.work_item_id ? [{ type: 'work_item', id: row.work_item_id }] : []),
    ],
    consequences: consequences(input.action, leaseCount),
    reversible: input.action === 'pause' || input.action === 'resume' || input.action === 'steer' || input.action === 'replan',
    releaseLease: input.action === 'stop',
    preserveArtifacts: true,
    preserveUncommittedWork: input.action === 'stop' ? 'runtime_dependent' : 'yes',
    nextWorkItemState: null,
    invalidatedApprovals: input.action === 'retry' || input.action === 'stop' ? row.approval_ids.map(id => ({ type: 'approval', id })) : [],
    requiredReason: true,
    requiredApproval: { required: false, approvalType: null },
    warnings,
    expiresAt,
    freshness: { state: 'current', observedAt: observedAt.toISOString(), sourceUpdatedAt: iso(row.updated_at), invalidAfter: expiresAt },
    advisory: true,
  }
  reply.header('ETag', `"control-preview-v1-${row.revision}"`)
  return actionPreviewResponseSchema.parse(response)
}

export function registerControlCenterRoutes(app: FastifyInstance, h: Helpers): void {
  app.get('/api/v1/control-center', async (request, reply) => buildControlCenter(h, request, reply))
  app.get('/api/v1/projects/:projectId/control-center', async (request, reply) => buildControlCenter(h, request, reply, idParam(request, 'projectId')))
  app.get('/api/v1/agent-sessions/:sessionId/explanation', async (request, reply) => readRunExplanation(h, request, reply, idParam(request, 'sessionId')))
  app.get('/api/v1/work-items/:workItemId/execution-summary', async (request, reply) => readExecutionSummary(h, request, reply, idParam(request, 'workItemId')))
  app.post('/api/v1/agent-sessions/:sessionId/control-preview', async (request, reply) => previewControl(h, request, reply, idParam(request, 'sessionId')))
}
