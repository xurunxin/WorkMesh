import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import {
  conversationCreateInputSchema, conversationMessageResponseSchema,
  conversationResponseSchema, conversationTurnCreateInputSchema,
  conversationTurnStopInputSchema, turnResponseSchema,
} from '@workmesh/contracts'
import { appendEvent } from '@workmesh/db'
import { DomainError, assertRevision, parseRevision } from '@workmesh/domain'
import { mutate, type CommandContext } from './commands.js'
import type { ApiActor } from './agent/types.js'
import type { Paginator } from './pagination.js'

type Conversation = {
  id: string; workspace_id: string; team_id: string | null; project_id: string | null
  work_item_id: string | null; responsible_human_actor_id: string; title: string
  status: 'active' | 'archived'; agent_session_id: string | null
  default_llm_connection_id: string | null; default_llm_model_id: string | null
  context_pins: unknown; next_message_sequence: number; next_turn_sequence: number
  revision: number; created_by_actor_id: string; created_at: Date; updated_at: Date
  archived_at: Date | null
}
type Message = {
  id: string; conversation_id: string; turn_id: string | null; sequence: number
  role: 'user' | 'assistant' | 'system'; author_actor_id: string | null
  content_markdown: string; runner_attempt_id: string | null; created_at: Date
}
type Turn = {
  id: string; conversation_id: string; sequence: number; status: string
  initiated_by_actor_id: string; agent_session_id: string | null
  current_runner_attempt_id: string | null; stop_reason: string | null; error_code: string | null
  queued_at: Date; dispatch_requested_at: Date | null; started_at: Date | null
  settled_at: Date | null; created_at: Date; updated_at: Date
}
type Helpers = {
  db: Pool
  meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => CommandContext
  header: (request: FastifyRequest, name: string) => string | undefined
  paginator: Paginator
}
const actor = (request: FastifyRequest): ApiActor => request.actor as ApiActor
const human = (current: ApiActor): void => {
  if (current.kind !== 'human') throw new DomainError('FORBIDDEN', 'Human account required')
}
const one = <T>(rows: T[], label: string): T => {
  if (!rows[0]) throw new DomainError('NOT_FOUND', `${label} was not found`)
  return rows[0]
}
const id = (request: FastifyRequest): string => z.string().uuid().parse((request.params as { id?: unknown }).id)
const turnId = (request: FastifyRequest): string => z.string().uuid().parse((request.params as { turnId?: unknown }).turnId)
const iso = (value: Date | null): string | null => value?.toISOString() ?? null
const response = (row: Conversation) => conversationResponseSchema.parse({
  id: row.id, workspace_id: row.workspace_id, team_id: row.team_id,
  project_id: row.project_id, work_item_id: row.work_item_id,
  responsible_human_actor_id: row.responsible_human_actor_id, title: row.title,
  status: row.status, agent_session_id: row.agent_session_id,
  default_llm_connection_id: row.default_llm_connection_id,
  default_llm_model_id: row.default_llm_model_id, context_pins: row.context_pins,
  revision: row.revision, created_by_actor_id: row.created_by_actor_id,
  created_at: iso(row.created_at), updated_at: iso(row.updated_at), archived_at: iso(row.archived_at),
})
const messageResponse = (row: Message) => conversationMessageResponseSchema.parse({
  id: row.id, conversation_id: row.conversation_id, turn_id: row.turn_id,
  sequence: row.sequence, role: row.role, author_actor_id: row.author_actor_id,
  content_markdown: row.content_markdown, runner_attempt_id: row.runner_attempt_id,
  created_at: row.created_at.toISOString(),
})
const turnResponse = (row: Turn) => turnResponseSchema.parse({
  id: row.id, conversation_id: row.conversation_id, sequence: row.sequence,
  status: row.status, initiated_by_actor_id: row.initiated_by_actor_id,
  agent_session_id: row.agent_session_id,
  current_runner_attempt_id: row.current_runner_attempt_id,
  stop_reason: row.stop_reason, error_code: row.error_code,
  queued_at: iso(row.queued_at), dispatch_requested_at: iso(row.dispatch_requested_at),
  started_at: iso(row.started_at), settled_at: iso(row.settled_at),
  created_at: iso(row.created_at), updated_at: iso(row.updated_at),
})

async function load(tx: PoolClient, current: ApiActor, conversationId: string, lock = false): Promise<Conversation> {
  return one((await tx.query<Conversation>(
    `SELECT * FROM workbench_conversations WHERE workspace_id=$1 AND id=$2 ${lock ? 'FOR UPDATE' : ''}`,
    [current.workspaceId, conversationId],
  )).rows, 'Conversation')
}
async function authorize(tx: PoolClient, current: ApiActor, row: Conversation): Promise<void> {
  human(current)
  if (row.workspace_id !== current.workspaceId) throw new DomainError('NOT_FOUND', 'Conversation was not found')
  if (row.responsible_human_actor_id === current.id) return
  if (!row.team_id) throw new DomainError('NOT_FOUND', 'Conversation was not found')
  if (current.workspaceRole === 'admin') return
  const member = await tx.query('SELECT 1 FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3',
    [current.workspaceId, row.team_id, current.id])
  if (!member.rowCount) throw new DomainError('NOT_FOUND', 'Conversation was not found')
}
async function authorizeTeam(tx: PoolClient, current: ApiActor, teamId: string): Promise<void> {
  const team = await tx.query('SELECT 1 FROM teams WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL',
    [current.workspaceId, teamId])
  if (!team.rowCount) throw new DomainError('NOT_FOUND', 'Team was not found')
  if (current.workspaceRole === 'admin') return
  const member = await tx.query('SELECT 1 FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3',
    [current.workspaceId, teamId, current.id])
  if (!member.rowCount) throw new DomainError('NOT_FOUND', 'Team was not found')
}
async function authorizeModel(tx: PoolClient, current: ApiActor, teamId: string | null,
  connectionId: string | null, modelId: string | null): Promise<void> {
  if (!connectionId && !modelId) return
  if (!connectionId || !modelId) throw new DomainError('VALIDATION_ERROR', 'Choose both a connection and a model')
  const result = await tx.query<{scope: string; owner_actor_id: string | null; team_id: string | null}>(
    `SELECT connection.scope,connection.owner_actor_id,connection.team_id
       FROM workbench_llm_connections connection JOIN workbench_llm_models model
         ON model.connection_id=connection.id AND model.workspace_id=connection.workspace_id
      WHERE connection.workspace_id=$1 AND connection.id=$2 AND model.id=$3
        AND connection.status='active' AND model.enabled=true`,
    [current.workspaceId, connectionId, modelId])
  const row = result.rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Active model was not found')
  if (row.scope === 'personal' && row.owner_actor_id !== current.id)
    throw new DomainError('NOT_FOUND', 'Active model was not found')
  if (row.scope === 'team' && row.team_id !== teamId)
    throw new DomainError('NOT_FOUND', 'Active model was not found')
}
async function event(tx: PoolClient, current: ApiActor, context: CommandContext, row: Conversation,
  type: string, aggregateType: string, aggregateId: string, revision: number | undefined,
  payload: Record<string, unknown>): Promise<void> {
  await appendEvent(tx, {
    workspaceId: current.workspaceId, teamId: row.team_id ?? undefined,
    audienceActorId: row.team_id ? undefined : row.responsible_human_actor_id,
    actorId: current.id, correlationId: context.correlationId,
    idempotencyKey: context.idempotencyKey, type, aggregateType, aggregateId,
    revision, payload,
  })
}
const pageQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.number().int().positive().optional() }).strict()

export function registerWorkbenchConversationRoutes(app: FastifyInstance, h: Helpers): void {
  app.get('/api/v1/workbench/conversations', async request => {
    const current = actor(request); human(current)
    const page = await h.paginator.query<Conversation>(h.db, request, request.query, {
      route: '/api/v1/workbench/conversations', filters: {},
      sort: [{ key: 'updated_at', sql: 'conversation.updated_at', direction: 'DESC' },
        { key: 'id', sql: 'conversation.id', direction: 'DESC' }],
    },
      `SELECT conversation.* FROM workbench_conversations conversation
        WHERE conversation.workspace_id=$1 AND (
          conversation.responsible_human_actor_id=$2 OR
          (conversation.team_id IS NOT NULL AND ($3='admin' OR EXISTS (
            SELECT 1 FROM memberships member WHERE member.workspace_id=$1
              AND member.team_id=conversation.team_id AND member.actor_id=$2))))`,
      [current.workspaceId, current.id, current.workspaceRole])
    return { items: page.items.map(response), nextCursor: page.nextCursor }
  })

  app.post('/api/v1/workbench/conversations', async (request, reply) => {
    const body = conversationCreateInputSchema.parse(request.body)
    const current = actor(request); human(current)
    const context = h.meta(request, body)
    const created = await mutate(h.db, context, async tx => {
      if (body.contextPins.length) throw new DomainError('VALIDATION_ERROR', 'Context pin admission is not available yet')
      let teamId = body.teamId ?? null
      let projectId = body.projectId ?? null
      let responsible = current.id
      if (body.workItemId) {
        const item = one((await tx.query<{team_id: string; project_id: string | null; responsible_human_actor_id: string | null}>(
          'SELECT team_id,project_id,responsible_human_actor_id FROM work_items WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL',
          [current.workspaceId, body.workItemId])).rows, 'Work item')
        if ((teamId && teamId !== item.team_id) || (projectId && projectId !== item.project_id))
          throw new DomainError('VALIDATION_ERROR', 'Conversation context must belong to one team and project')
        teamId = item.team_id; projectId = item.project_id
        responsible = item.responsible_human_actor_id ?? current.id
      }
      if (projectId) {
        const project = one((await tx.query<{team_id: string}>(
          'SELECT team_id FROM projects WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL',
          [current.workspaceId, projectId])).rows, 'Project')
        if (teamId && teamId !== project.team_id)
          throw new DomainError('VALIDATION_ERROR', 'Project belongs to a different team')
        teamId = project.team_id
      }
      if (teamId) await authorizeTeam(tx, current, teamId)
      if (body.agentSessionId) {
        if (current.id !== responsible || (!body.workItemId && !projectId))
          throw new DomainError('FORBIDDEN', 'Only the responsible human can bind a session to its work context')
        const session = one((await tx.query<{
          team_id: string | null; project_id: string | null; work_item_id: string | null
          state: string; delegation_status: string; principal_human_actor_id: string
        }>(`SELECT session.team_id,session.project_id,session.work_item_id,session.state,
            delegation.status AS delegation_status,delegation.principal_human_actor_id
          FROM agent_sessions session JOIN delegations delegation ON delegation.id=session.delegation_id
          WHERE session.workspace_id=$1 AND session.id=$2 AND delegation.workspace_id=$1`,
        [current.workspaceId, body.agentSessionId])).rows, 'Agent session')
        if (session.team_id !== teamId || session.work_item_id !== (body.workItemId ?? null)
          || session.project_id !== (body.workItemId ? null : projectId)
          || session.principal_human_actor_id !== responsible || session.delegation_status !== 'active'
          || ['stopping','stale','completed','failed','canceled'].includes(session.state))
          throw new DomainError('INVALID_STATE', 'Agent session does not match the active conversation context')
      }
      await authorizeModel(tx, current, teamId, body.llmConnectionId ?? null, body.llmModelId ?? null)
      const row = one((await tx.query<Conversation>(
        `INSERT INTO workbench_conversations
         (workspace_id,team_id,project_id,work_item_id,responsible_human_actor_id,title,
          agent_session_id,default_llm_connection_id,default_llm_model_id,created_by_actor_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [current.workspaceId, teamId, projectId, body.workItemId ?? null, responsible,
          body.title, body.agentSessionId ?? null, body.llmConnectionId ?? null,
          body.llmModelId ?? null, current.id])).rows, 'Conversation')
      await event(tx, current, context, row, 'workbench.conversation.created', 'workbench_conversation',
        row.id, row.revision, { conversationId: row.id, responsibleHumanActorId: responsible,
          workItemId: row.work_item_id, agentSessionId: row.agent_session_id })
      return response(row)
    })
    return reply.code(201).send(created)
  })

  app.get('/api/v1/workbench/conversations/:id', async request => {
    const current = actor(request); human(current)
    const client = await h.db.connect()
    try { const row = await load(client, current, id(request)); await authorize(client, current, row); return response(row) }
    finally { client.release() }
  })

  app.post('/api/v1/workbench/conversations/:id/archive', async request => {
    const current = actor(request); human(current)
    const conversationId = id(request)
    const context = h.meta(request, {}, { id: conversationId })
    return mutate(h.db, context, async tx => {
      const row = await load(tx, current, conversationId, true); await authorize(tx, current, row)
      if (row.responsible_human_actor_id !== current.id)
        throw new DomainError('FORBIDDEN', 'Responsible human is required to archive the conversation')
      assertRevision(parseRevision(h.header(request, 'if-match')), row.revision)
      if (row.status !== 'active') throw new DomainError('INVALID_STATE', 'Conversation is already archived')
      const pending = await tx.query(`SELECT 1 FROM workbench_turns
        WHERE workspace_id=$1 AND conversation_id=$2 AND status NOT IN ('settled','failed','canceled','stopped') LIMIT 1`,
      [current.workspaceId, row.id])
      if (pending.rowCount) throw new DomainError('INVALID_STATE', 'Settle or stop active turns before archiving')
      const archived = one((await tx.query<Conversation>(
        `UPDATE workbench_conversations SET status='archived',archived_at=now(),
          revision=revision+1,updated_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING *`,
        [current.workspaceId, row.id])).rows, 'Conversation')
      await event(tx, current, context, archived, 'workbench.conversation.archived',
        'workbench_conversation', archived.id, archived.revision,
        { conversationId: archived.id, revision: archived.revision })
      return response(archived)
    }, { authorizeReplay: async tx => authorize(tx, current, await load(tx, current, conversationId)) })
  })

  app.get('/api/v1/workbench/conversations/:id/messages', async request => {
    const current = actor(request); human(current)
    const { limit, before } = pageQuery.parse(request.query)
    const client = await h.db.connect()
    try {
      const row = await load(client, current, id(request)); await authorize(client, current, row)
      const result = await client.query<Message>(
        `SELECT * FROM workbench_messages WHERE workspace_id=$1 AND conversation_id=$2
          AND ($3::integer IS NULL OR sequence < $3) ORDER BY sequence DESC LIMIT $4`,
        [current.workspaceId, row.id, before ?? null, limit + 1])
      const items = result.rows.slice(0, limit)
      return { items: items.map(messageResponse), nextBefore: result.rows.length > limit ? items.at(-1)?.sequence : null }
    } finally { client.release() }
  })

  app.get('/api/v1/workbench/conversations/:id/turns', async request => {
    const current = actor(request); human(current)
    const { limit, before } = pageQuery.parse(request.query)
    const client = await h.db.connect()
    try {
      const row = await load(client, current, id(request)); await authorize(client, current, row)
      const result = await client.query<Turn>(
        `SELECT * FROM workbench_turns WHERE workspace_id=$1 AND conversation_id=$2
          AND ($3::integer IS NULL OR sequence < $3) ORDER BY sequence DESC LIMIT $4`,
        [current.workspaceId, row.id, before ?? null, limit + 1])
      const items = result.rows.slice(0, limit)
      return { items: items.map(turnResponse), nextBefore: result.rows.length > limit ? items.at(-1)?.sequence : null }
    } finally { client.release() }
  })

  app.post('/api/v1/workbench/conversations/:id/turns', async (request, reply) => {
    const body = conversationTurnCreateInputSchema.parse(request.body)
    const current = actor(request); human(current)
    const conversationId = id(request)
    const context = h.meta(request, body, { id: conversationId })
    const result = await mutate(h.db, context, async tx => {
      const row = await load(tx, current, conversationId, true); await authorize(tx, current, row)
      assertRevision(parseRevision(h.header(request, 'if-match')), row.revision)
      if (row.status !== 'active') throw new DomainError('INVALID_STATE', 'Conversation is archived')
      if (row.agent_session_id) {
        const session = one((await tx.query<{ state: string; delegation_status: string }>(
          `SELECT session.state,delegation.status AS delegation_status
            FROM agent_sessions session JOIN delegations delegation ON delegation.id=session.delegation_id
            WHERE session.workspace_id=$1 AND session.id=$2 AND delegation.workspace_id=$1`,
          [current.workspaceId, row.agent_session_id])).rows, 'Agent session')
        if (session.delegation_status !== 'active'
          || ['stopping','stale','completed','failed','canceled'].includes(session.state))
          throw new DomainError('INVALID_STATE', 'Bound agent session cannot accept a new turn')
      }
      const connectionId = body.llmConnectionId ?? row.default_llm_connection_id
      const modelId = body.llmModelId ?? row.default_llm_model_id
      if (!connectionId || !modelId) throw new DomainError('VALIDATION_ERROR', 'Choose an active connection and model before sending')
      await authorizeModel(tx, current, row.team_id, connectionId, modelId)
      const turn = one((await tx.query<Turn>(
        `INSERT INTO workbench_turns(workspace_id,conversation_id,sequence,initiated_by_actor_id,
          agent_session_id,llm_connection_id,llm_model_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [current.workspaceId, row.id, row.next_turn_sequence, current.id,
          row.agent_session_id, connectionId, modelId])).rows, 'Turn')
      const message = one((await tx.query<Message>(
        `INSERT INTO workbench_messages(workspace_id,conversation_id,turn_id,sequence,role,
          author_actor_id,content_markdown) VALUES($1,$2,$3,$4,'user',$5,$6) RETURNING *`,
        [current.workspaceId, row.id, turn.id, row.next_message_sequence, current.id, body.messageMarkdown])).rows, 'Message')
      await tx.query(`UPDATE workbench_conversations SET next_turn_sequence=next_turn_sequence+1,
        next_message_sequence=next_message_sequence+1,revision=revision+1,updated_at=now()
        WHERE workspace_id=$1 AND id=$2`, [current.workspaceId, row.id])
      await event(tx, current, context, row, 'workbench.message.appended', 'workbench_message',
        message.id, undefined, { conversationId: row.id, messageId: message.id, turnId: turn.id,
          role: 'user', sequence: message.sequence })
      await event(tx, current, context, row, 'workbench.turn.queued', 'workbench_turn', turn.id,
        undefined, { conversationId: row.id, turnId: turn.id, initiatedByActorId: current.id })
      return { message: messageResponse(message), turn: turnResponse(turn), conversationRevision: row.revision + 1 }
    }, { authorizeReplay: async tx => authorize(tx, current, await load(tx, current, conversationId)) })
    return reply.code(201).send(result)
  })

  app.post('/api/v1/workbench/conversations/:id/turns/:turnId/stop', async request => {
    const body = conversationTurnStopInputSchema.parse(request.body)
    const current = actor(request); human(current)
    const conversationId = id(request); const targetTurnId = turnId(request)
    const context = h.meta(request, request.body, { id: conversationId, turnId: targetTurnId })
    return mutate(h.db, context, async tx => {
      const row = await load(tx, current, conversationId, true); await authorize(tx, current, row)
      assertRevision(parseRevision(h.header(request, 'if-match')), row.revision)
      const turn = one((await tx.query<Turn>(
        'SELECT * FROM workbench_turns WHERE workspace_id=$1 AND conversation_id=$2 AND id=$3 FOR UPDATE',
        [current.workspaceId, row.id, targetTurnId])).rows, 'Turn')
      if (!['queued','dispatching','running'].includes(turn.status))
        throw new DomainError('INVALID_STATE', 'Turn is already terminal')
      if (turn.status !== 'queued' && body.stopMode !== 'immediate')
        throw new DomainError('VALIDATION_ERROR', 'An active Runner turn requires immediate stop')
      if (turn.current_runner_attempt_id) {
        const attempt = one((await tx.query<{ id: string; attempt_no: number }>(
          `UPDATE workbench_runner_attempts SET status='aborted',stop_reason='user_stop',
            settled_at=now(),updated_at=now() WHERE workspace_id=$1 AND id=$2
            AND status IN ('preparing','running') RETURNING id,attempt_no`,
          [current.workspaceId, turn.current_runner_attempt_id])).rows, 'Runner attempt')
        await event(tx, current, context, row, 'workbench.runner_attempt.settled',
          'workbench_runner_attempt', attempt.id, undefined,
          { conversationId: row.id, turnId: turn.id, runnerAttemptId: attempt.id,
            attemptNo: attempt.attempt_no, outcome: 'aborted', usage: null })
      }
      const stopped = one((await tx.query<Turn>(
        `UPDATE workbench_turns SET status='stopped',stop_reason='user_stop',
          dispatch_requested_at=COALESCE(dispatch_requested_at,now()),settled_at=now(),updated_at=now()
          WHERE workspace_id=$1 AND id=$2 RETURNING *`, [current.workspaceId, turn.id])).rows, 'Turn')
      await tx.query('UPDATE workbench_conversations SET revision=revision+1,updated_at=now() WHERE workspace_id=$1 AND id=$2',
        [current.workspaceId, row.id])
      await event(tx, current, context, row, 'workbench.turn.settled', 'workbench_turn', turn.id,
        undefined, { conversationId: row.id, turnId: turn.id, runnerAttemptId: null,
          outcome: 'stopped', stopReason: 'user_stop', errorCode: null })
      return { turn: turnResponse(stopped), conversationRevision: row.revision + 1 }
    }, { authorizeReplay: async tx => authorize(tx, current, await load(tx, current, conversationId)) })
  })
}
