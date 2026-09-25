import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { completeAgentSessionInputSchema, workbenchRunnerCredentialSchema, workbenchRunnerSettleInputSchema, workbenchUsageSchema } from '@workmesh/contracts'
import { appendEvent, withTx } from '@workmesh/db'
import { DomainError } from '@workmesh/domain'
import { agentMutate, finishSessionInTransaction } from './agent/commands.js'
import { assertAgentWrite, loadAgentSessionForMutation } from './agent/guard.js'
import type { ApiActor } from './agent/types.js'
import type { CommandContext } from './commands.js'

type Helpers = {
  db: Pool
  meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => CommandContext
  header: (request: FastifyRequest, name: string) => string | undefined
}
type TurnRow = {
  id: string; workspace_id: string; conversation_id: string; agent_session_id: string | null
  status: string; sequence: number; current_runner_attempt_id: string | null
  llm_connection_id: string | null; llm_model_id: string | null
  team_id: string | null; responsible_human_actor_id: string; conversation_status: string
}
type AttemptRow = {
  id: string; workspace_id: string; conversation_id: string; turn_id: string
  agent_session_id: string; attempt_no: number; fence_token: string; status: string
  llm_connection_id: string | null; llm_model_id: string | null
}
const actor = (request: FastifyRequest): ApiActor => request.actor as ApiActor
const id = (request: FastifyRequest): string => z.string().uuid().parse((request.params as { id?: unknown }).id)
const one = <T>(rows: T[], label: string): T => {
  if (!rows[0]) throw new DomainError('NOT_FOUND', `${label} was not found`)
  return rows[0]
}
const serviceToken = (request: FastifyRequest, h: Helpers): void => {
  const configured = process.env.WORKMESH_RUNNER_SERVICE_TOKEN
  if (!configured || configured.length < 32) throw new DomainError('INTERNAL_ERROR', 'Runner service is unavailable')
  const received = h.header(request, 'x-workmesh-runner-token') ?? ''
  const left = Buffer.from(configured), right = Buffer.from(received)
  if (left.length !== right.length || !timingSafeEqual(left, right))
    throw new DomainError('FORBIDDEN', 'Runner service authentication failed')
}
const exactAgentSession = (current: ApiActor, expected?: string): string => {
  const sessionId = current.agentSessionId
  if (current.kind !== 'agent' || current.authentication !== 'agent_session' || !sessionId
    || (expected && expected !== sessionId))
    throw new DomainError('FORBIDDEN', 'Exact Agent Session credential required')
  return sessionId
}
async function turnRow(tx: PoolClient, workspaceId: string, turnId: string, lock = false): Promise<TurnRow> {
  return one((await tx.query<TurnRow>(
    `SELECT turn.*,conversation.team_id,conversation.responsible_human_actor_id,
       conversation.status AS conversation_status
     FROM workbench_turns turn JOIN workbench_conversations conversation
       ON conversation.id=turn.conversation_id AND conversation.workspace_id=turn.workspace_id
     WHERE turn.workspace_id=$1 AND turn.id=$2 ${lock ? 'FOR UPDATE OF turn' : ''}`,
    [workspaceId, turnId])).rows, 'Turn')
}
async function attemptRow(tx: PoolClient, workspaceId: string, attemptId: string, lock = false): Promise<AttemptRow> {
  return one((await tx.query<AttemptRow>(
    `SELECT * FROM workbench_runner_attempts WHERE workspace_id=$1 AND id=$2 ${lock ? 'FOR UPDATE' : ''}`,
    [workspaceId, attemptId])).rows, 'Runner attempt')
}
function sameFence(expected: string, received: string): boolean {
  const left = Buffer.from(expected), right = Buffer.from(received)
  return left.length === right.length && timingSafeEqual(left, right)
}
const fenceFingerprint = (value: string): string => createHash('sha256').update(value).digest('hex')
async function event(tx: PoolClient, current: ApiActor, context: CommandContext, turn: TurnRow,
  type: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>): Promise<void> {
  await appendEvent(tx, {
    workspaceId: current.workspaceId, teamId: turn.team_id ?? undefined,
    audienceActorId: turn.team_id ? undefined : turn.responsible_human_actor_id,
    actorId: current.id, correlationId: context.correlationId,
    idempotencyKey: context.idempotencyKey, sessionId: turn.agent_session_id ?? undefined,
    type, aggregateType, aggregateId, payload,
  })
}
export function registerWorkbenchRunnerRoutes(app: FastifyInstance, h: Helpers): void {
  app.get('/api/v1/workbench/runner/assignments', async request => {
    serviceToken(request, h)
    const current = actor(request)
    if (current.kind !== 'agent' || current.authentication !== 'installation_target' || !current.credentialHash)
      throw new DomainError('FORBIDDEN', 'Active Agent installation credential required')
    const result = await h.db.query<{ session_id: string; state: string }>(
      `SELECT session.id AS session_id,session.state
       FROM agent_installation_tokens installation
       JOIN agent_definitions definition ON definition.id=installation.agent_id
       JOIN agent_sessions session ON session.agent_id=definition.id
       JOIN delegations delegation ON delegation.id=session.delegation_id
       JOIN agent_team_access grant_row ON grant_row.workspace_id=session.workspace_id
         AND grant_row.agent_id=session.agent_id AND grant_row.team_id=session.team_id
       WHERE installation.token_hash=$1 AND installation.revoked_at IS NULL
         AND (installation.expires_at IS NULL OR installation.expires_at>now())
         AND definition.workspace_id=$2 AND definition.actor_id=$3 AND definition.is_active
         AND session.workspace_id=$2 AND session.state IN ('queued','acknowledged','executing')
         AND delegation.status='active' AND grant_row.revoked_at IS NULL
       ORDER BY CASE session.state WHEN 'queued' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
         session.created_at,session.id LIMIT 100`,
      [current.credentialHash, current.workspaceId, current.id])
    return { items: result.rows.map(row => ({ sessionId: row.session_id, state: row.state })) }
  })

  app.get('/api/v1/agent-sessions/:id/workbench-turns', async request => {
    serviceToken(request, h)
    const current = actor(request); const sessionId = exactAgentSession(current, id(request))
    const result = await h.db.query<{ id: string; conversation_id: string }>(
      `SELECT turn.id,turn.conversation_id FROM workbench_turns turn
       JOIN workbench_conversations conversation ON conversation.id=turn.conversation_id
       JOIN agent_sessions session ON session.id=turn.agent_session_id
       JOIN delegations delegation ON delegation.id=session.delegation_id
       WHERE turn.workspace_id=$1 AND turn.agent_session_id=$2 AND turn.status='queued'
         AND conversation.status='active' AND session.state='executing'
         AND delegation.status='active'
       ORDER BY turn.queued_at,turn.id LIMIT 25`,
      [current.workspaceId, sessionId])
    return { items: result.rows.map(row => ({ turnId: row.id, conversationId: row.conversation_id })) }
  })

  app.post('/api/v1/workbench/turns/:id/claim', async request => {
    serviceToken(request, h)
    const current = actor(request); const sessionId = exactAgentSession(current)
    const targetId = id(request)
    const context = h.meta(request, {}, { id: targetId })
    return agentMutate(h.db, context, async tx => {
      const session = await loadAgentSessionForMutation(tx, current, sessionId)
      assertAgentWrite({ actor: current, session, sessionId, capability: 'work:write',
        operation: 'activity', idempotencyKey: context.idempotencyKey })
      if (session.state !== 'executing') throw new DomainError('SESSION_NOT_ACTIVE', 'Runner claim requires an executing session')
      const parent = one((await tx.query<{ conversation_id: string }>(
        'SELECT conversation_id FROM workbench_turns WHERE workspace_id=$1 AND id=$2',
        [current.workspaceId, targetId])).rows, 'Turn')
      await tx.query('SELECT id FROM workbench_conversations WHERE workspace_id=$1 AND id=$2 FOR UPDATE',
        [current.workspaceId, parent.conversation_id])
      const turn = await turnRow(tx, current.workspaceId, targetId, true)
      if (turn.agent_session_id !== sessionId || turn.conversation_status !== 'active')
        throw new DomainError('RESOURCE_SCOPE_DENIED', 'Turn is outside the active Agent Session')
      if (turn.status !== 'queued') throw new DomainError('INVALID_STATE', 'Turn is no longer queued')
      const predecessor = await tx.query(
        `SELECT 1 FROM workbench_turns WHERE conversation_id=$1 AND sequence<$2
          AND status NOT IN ('settled','failed','canceled','stopped') LIMIT 1`,
        [turn.conversation_id, turn.sequence])
      if (predecessor.rowCount) throw new DomainError('INVALID_STATE', 'Earlier conversation turn is still active')
      const active = await tx.query(
        `SELECT 1 FROM workbench_turns WHERE conversation_id=$1 AND id<>$2
          AND status IN ('dispatching','running') LIMIT 1`,
        [turn.conversation_id, turn.id])
      if (active.rowCount) throw new DomainError('INVALID_STATE', 'Conversation already has an active Runner')
      const attempt = one((await tx.query<AttemptRow>(
        `INSERT INTO workbench_runner_attempts
          (workspace_id,conversation_id,turn_id,agent_session_id,attempt_no,fence_token,
           status,llm_connection_id,llm_model_id,external_effects_reconciled)
         VALUES($1,$2,$3,$4,1,$5,'preparing',$6,$7,true) RETURNING *`,
        [current.workspaceId, turn.conversation_id, turn.id, sessionId,
          randomBytes(32).toString('base64url'), turn.llm_connection_id, turn.llm_model_id])).rows, 'Runner attempt')
      await tx.query(`UPDATE workbench_turns SET status='dispatching',
        current_runner_attempt_id=$3,dispatch_requested_at=now(),updated_at=now()
        WHERE workspace_id=$1 AND id=$2`, [current.workspaceId, turn.id, attempt.id])
      await tx.query(`UPDATE workbench_conversations SET revision=revision+1,updated_at=now()
        WHERE workspace_id=$1 AND id=$2`, [current.workspaceId, turn.conversation_id])
      await event(tx, current, context, turn, 'workbench.turn.dispatched', 'workbench_turn', turn.id,
        { conversationId: turn.conversation_id, turnId: turn.id,
          runnerAttemptId: attempt.id, attemptNo: 1 })
      return { runnerAttemptId: attempt.id, turnId: turn.id }
    })
  })

  app.get('/api/v1/workbench/runner-attempts/:id/credential', async (request, reply) => {
    serviceToken(request, h)
    const current = actor(request); const sessionId = exactAgentSession(current)
    const attemptId = id(request)
    const key = process.env.WORKMESH_MASTER_KEY
    if (!key) throw new DomainError('INTERNAL_ERROR', 'Model credential decryption is unavailable')
    const result = await withTx(h.db, async tx => {
      const session = await loadAgentSessionForMutation(tx, current, sessionId)
      if (session.state !== 'executing' || session.delegation_status !== 'active')
        throw new DomainError('SESSION_STOPPED', 'Agent Session is not executable')
      const attempt = await attemptRow(tx, current.workspaceId, attemptId)
      const turn = await turnRow(tx, current.workspaceId, attempt.turn_id)
      if (attempt.agent_session_id !== sessionId || turn.current_runner_attempt_id !== attempt.id
        || turn.status !== 'dispatching' || attempt.status !== 'preparing')
        throw new DomainError('RUNNER_FENCE_STALE', 'Runner attempt is no longer current')
      const model = one((await tx.query<{
        base_url: string; api_type: string; api_key: string; external_model_id: string
        display_name: string; capabilities: unknown; connection_revision: number; model_revision: number
      }>(`SELECT connection.base_url,connection.api_type,
           pgp_sym_decrypt(connection.secret_ciphertext,$4) AS api_key,
           model.external_model_id,model.display_name,model.capabilities,
           connection.revision AS connection_revision,model.revision AS model_revision
         FROM workbench_llm_connections connection JOIN workbench_llm_models model
           ON model.connection_id=connection.id AND model.workspace_id=connection.workspace_id
         WHERE connection.workspace_id=$1 AND connection.id=$2 AND model.id=$3
           AND connection.status='active' AND model.enabled=true`,
        [current.workspaceId, attempt.llm_connection_id, attempt.llm_model_id, key])).rows, 'Active model')
      const messages = await tx.query<{ role: string; content_markdown: string }>(
        `SELECT role,content_markdown FROM workbench_messages WHERE conversation_id=$1
          AND sequence <= (SELECT MAX(sequence) FROM workbench_messages WHERE turn_id=$2)
          ORDER BY sequence LIMIT 101`, [attempt.conversation_id, attempt.turn_id])
      if (messages.rows.length > 100) throw new DomainError('VALIDATION_ERROR', 'Conversation exceeds Runner context limit')
      const totalChars = messages.rows.reduce((sum, message) => sum + message.content_markdown.length, 0)
      if (totalChars > 200_000) throw new DomainError('VALIDATION_ERROR', 'Conversation exceeds Runner context limit')
      return {
        runnerAttemptId: attempt.id, fenceToken: attempt.fence_token,
        baseUrl: model.base_url, apiType: model.api_type, apiKey: model.api_key,
        modelId: model.external_model_id, modelName: model.display_name,
        capabilities: model.capabilities, connectionRevision: model.connection_revision,
        modelRevision: model.model_revision, messages: messages.rows,
      }
    })
    reply.header('Cache-Control', 'no-store')
    return workbenchRunnerCredentialSchema.parse(result)
  })

  app.post('/api/v1/workbench/runner-attempts/:id/start', async request => {
    serviceToken(request, h)
    const current = actor(request); const sessionId = exactAgentSession(current)
    const attemptId = id(request)
    const body = z.object({ fenceToken: z.string().min(16).max(128) }).strict().parse(request.body)
    const context = h.meta(request, { fenceFingerprint: fenceFingerprint(body.fenceToken) }, { id: attemptId })
    return agentMutate(h.db, context, async tx => {
      const session = await loadAgentSessionForMutation(tx, current, sessionId)
      assertAgentWrite({ actor: current, session, sessionId, capability: 'work:write',
        operation: 'activity', idempotencyKey: context.idempotencyKey })
      if (session.state !== 'executing') throw new DomainError('SESSION_NOT_ACTIVE', 'Runner start requires executing session')
      const locator = await attemptRow(tx, current.workspaceId, attemptId)
      await tx.query('SELECT id FROM workbench_conversations WHERE workspace_id=$1 AND id=$2 FOR UPDATE',
        [current.workspaceId, locator.conversation_id])
      const turn = await turnRow(tx, current.workspaceId, locator.turn_id, true)
      const attempt = await attemptRow(tx, current.workspaceId, attemptId, true)
      if (attempt.agent_session_id !== sessionId || turn.current_runner_attempt_id !== attempt.id
        || !sameFence(attempt.fence_token, body.fenceToken) || attempt.status !== 'preparing'
        || turn.status !== 'dispatching')
        throw new DomainError('RUNNER_FENCE_STALE', 'Runner attempt is no longer current')
      await tx.query(`UPDATE workbench_runner_attempts SET status='running',started_at=now(),updated_at=now()
        WHERE workspace_id=$1 AND id=$2`, [current.workspaceId, attempt.id])
      await tx.query(`UPDATE workbench_turns SET status='running',started_at=now(),updated_at=now()
        WHERE workspace_id=$1 AND id=$2`, [current.workspaceId, turn.id])
      await event(tx, current, context, turn, 'workbench.runner_attempt.started',
        'workbench_runner_attempt', attempt.id,
        { conversationId: turn.conversation_id, turnId: turn.id,
          runnerAttemptId: attempt.id, attemptNo: attempt.attempt_no })
      return { runnerAttemptId: attempt.id, status: 'running' }
    })
  })

  app.get('/api/v1/workbench/runner-attempts/:id/status', async request => {
    serviceToken(request, h)
    const current = actor(request); const sessionId = exactAgentSession(current)
    const attempt = one((await h.db.query<AttemptRow>(
      'SELECT * FROM workbench_runner_attempts WHERE workspace_id=$1 AND id=$2',
      [current.workspaceId, id(request)])).rows, 'Runner attempt')
    if (attempt.agent_session_id !== sessionId) throw new DomainError('NOT_FOUND', 'Runner attempt was not found')
    const state = one((await h.db.query<{ turn_status: string; session_state: string; delegation_status: string }>(
      `SELECT turn.status AS turn_status,session.state AS session_state,
        delegation.status AS delegation_status FROM workbench_turns turn
        JOIN agent_sessions session ON session.id=turn.agent_session_id
        JOIN delegations delegation ON delegation.id=session.delegation_id
        WHERE turn.workspace_id=$1 AND turn.id=$2`,
      [current.workspaceId, attempt.turn_id])).rows, 'Turn')
    return { attemptStatus: attempt.status, turnStatus: state.turn_status,
      sessionState: state.session_state, delegationStatus: state.delegation_status }
  })

  app.post('/api/v1/workbench/runner-attempts/:id/settle', async request => {
    serviceToken(request, h)
    const current = actor(request); const sessionId = exactAgentSession(current)
    const attemptId = id(request)
    const body = workbenchRunnerSettleInputSchema.parse(request.body)
    const context = h.meta(request, {
      ...body, fenceToken: undefined, fenceFingerprint: fenceFingerprint(body.fenceToken),
    }, { id: attemptId })
    return agentMutate(h.db, context, async tx => {
      const session = await loadAgentSessionForMutation(tx, current, sessionId)
      assertAgentWrite({ actor: current, session, sessionId, capability: 'work:write',
        operation: 'activity', idempotencyKey: context.idempotencyKey })
      const locator = await attemptRow(tx, current.workspaceId, attemptId)
      await tx.query('SELECT id FROM workbench_conversations WHERE workspace_id=$1 AND id=$2 FOR UPDATE',
        [current.workspaceId, locator.conversation_id])
      const turn = await turnRow(tx, current.workspaceId, locator.turn_id, true)
      const attempt = await attemptRow(tx, current.workspaceId, attemptId, true)
      if (attempt.agent_session_id !== sessionId || turn.current_runner_attempt_id !== attempt.id
        || !sameFence(attempt.fence_token, body.fenceToken)
        || attempt.status !== 'running' || turn.status !== 'running')
        throw new DomainError('RUNNER_FENCE_STALE', 'Runner attempt is no longer current')
      const outcome = body.settlement.outcome
      const turnStatus = outcome === 'settled' ? 'settled' : outcome === 'aborted' ? 'canceled' : 'failed'
      const usage = body.settlement.usage ? workbenchUsageSchema.parse(body.settlement.usage) : null
      await tx.query(`UPDATE workbench_runner_attempts SET status=$3,usage=$4,error_code=$5,
        settled_at=now(),updated_at=now() WHERE workspace_id=$1 AND id=$2`,
      [current.workspaceId, attempt.id, outcome, usage, body.settlement.errorCode ?? null])
      await tx.query(`UPDATE workbench_turns SET status=$3,error_code=$4,settled_at=now(),updated_at=now()
        WHERE workspace_id=$1 AND id=$2`,
      [current.workspaceId, turn.id, turnStatus, body.settlement.errorCode ?? null])
      if (body.assistantMessageMarkdown) {
        const message = one((await tx.query<{ id: string; sequence: number }>(
          `INSERT INTO workbench_messages(workspace_id,conversation_id,turn_id,sequence,role,
            author_actor_id,content_markdown,runner_attempt_id)
            SELECT $1,$2,$3,next_message_sequence,'assistant',$4,$5,$6
            FROM workbench_conversations WHERE workspace_id=$1 AND id=$2 RETURNING id,sequence`,
          [current.workspaceId, turn.conversation_id, turn.id, current.id,
            body.assistantMessageMarkdown, attempt.id])).rows, 'Assistant message')
        await tx.query(`UPDATE workbench_conversations SET next_message_sequence=next_message_sequence+1,
          revision=revision+1,updated_at=now() WHERE workspace_id=$1 AND id=$2`,
        [current.workspaceId, turn.conversation_id])
        await event(tx, current, context, turn, 'workbench.message.appended', 'workbench_message', message.id,
          { conversationId: turn.conversation_id, messageId: message.id, turnId: turn.id,
            role: 'assistant', sequence: message.sequence })
      } else {
        await tx.query(`UPDATE workbench_conversations SET revision=revision+1,updated_at=now()
          WHERE workspace_id=$1 AND id=$2`, [current.workspaceId, turn.conversation_id])
      }
      await event(tx, current, context, turn, 'workbench.runner_attempt.settled',
        'workbench_runner_attempt', attempt.id,
        { conversationId: turn.conversation_id, turnId: turn.id,
          runnerAttemptId: attempt.id, attemptNo: attempt.attempt_no, outcome, usage })
      await event(tx, current, context, turn, 'workbench.turn.settled', 'workbench_turn', turn.id,
        { conversationId: turn.conversation_id, turnId: turn.id,
          runnerAttemptId: attempt.id, outcome: turnStatus, stopReason: null,
          errorCode: body.settlement.errorCode ?? null })
      if (body.sessionCompletion) {
        const completion = completeAgentSessionInputSchema.parse(body.sessionCompletion.body)
        await finishSessionInTransaction(tx,
          { ...context, idempotencyKey: body.sessionCompletion.operationKey },
          sessionId, body.sessionCompletion.ifMatch, completion)
      }
      return { runnerAttemptId: attempt.id, turnId: turn.id, status: turnStatus,
        sessionCompletion: body.sessionCompletion ? 'completed' : 'not_requested' }
    })
  })
}
