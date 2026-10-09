import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '@workmesh/db'
import { buildApp } from '../src/server.js'
import { seedAgentSessionBearer } from './agent-session-test-credentials.js'
import { createSessionLifecycleWorker } from '../../worker/src/session-lifecycle.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Execution waits require a dedicated test database and RUN_INTEGRATION=1')
const db = createDb(databaseUrl)
const app = buildApp({ logger: { level: 'silent' } })
type Reply = { statusCode: number; body: string; headers: Record<string, string | string[] | number | undefined>; json: <T>() => T }
let cookie = '', csrf = '', humanId = '', teamId = '', stateId = '', agentId = '', installation = '', connectionId = '', modelId = ''
const originalEnabled = process.env.WORKMESH_EXECUTION_WAITS_ENABLED
const human = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...headers } }) as unknown as Promise<Reply>
const agent = (token: string, method: 'GET' | 'POST', url: string, payload?: object, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}`,
    'x-workmesh-runner-token': process.env.WORKMESH_RUNNER_SERVICE_TOKEN!, 'idempotency-key': randomUUID(), ...headers } }) as unknown as Promise<Reply>
const revision = async (sessionId: string) => (await db.query<{ revision: number }>('SELECT revision FROM agent_sessions WHERE id=$1', [sessionId])).rows[0]!.revision
const match = (revision: number) => ({ 'if-match': `"revision-${revision}"` })
const sessionFixture = async () => {
  const work = await human('POST', '/api/v1/work-items', { teamId, title: 'Wait continuation', statusId: stateId, responsibleHumanActorId: humanId })
  expect(work.statusCode, work.body).toBe(200)
  const workId = work.json<{ id: string }>().id
  const workRevision = (await db.query<{ revision: number }>('SELECT revision FROM work_items WHERE id=$1', [workId])).rows[0]!.revision
  const started = await human('POST', `/api/v1/work-items/${workId}/agent-session`, { agentId, principalHumanActorId: humanId,
    role: 'executor', requestedCapabilities: ['work:read','work:write'], initialPrompt: 'Wait, then continue', budget: {} }, match(workRevision))
  expect(started.statusCode, started.body).toBe(200)
  const sessionId = started.json<{ session: { id: string } }>().session.id
  const token = await seedAgentSessionBearer(db, sessionId, agentId)
  expect((await agent(token, 'POST', `/api/v1/agent-sessions/${sessionId}/ack`, { summary: 'Ready', externalUrls: [] })).statusCode).toBe(200)
  expect((await agent(token, 'POST', `/api/v1/agent-sessions/${sessionId}/state`, { state: 'executing', reason: 'Start' }, match(await revision(sessionId)))).statusCode).toBe(200)
  const conversation = await human('POST', '/api/v1/workbench/conversations', { title: 'Wait continuation', workItemId: workId,
    agentSessionId: sessionId, llmConnectionId: connectionId, llmModelId: modelId })
  expect(conversation.statusCode, conversation.body).toBe(201)
  const conversationId = conversation.json<{ id: string }>().id
  const turn = await human('POST', `/api/v1/workbench/conversations/${conversationId}/turns`, { messageMarkdown: 'Please continue after the condition.' }, match(1))
  expect(turn.statusCode, turn.body).toBe(201)
  const turnId = turn.json<{ turn: { id: string } }>().turn.id
  const claim = await agent(token, 'POST', `/api/v1/workbench/turns/${turnId}/claim`, { executionWaits: true })
  expect(claim.statusCode, claim.body).toBe(200)
  const attemptId = claim.json<{ runnerAttemptId: string }>().runnerAttemptId
  const credential = await agent(token, 'GET', `/api/v1/workbench/runner-attempts/${attemptId}/credential`)
  expect(credential.statusCode, credential.body).toBe(200)
  const { fenceToken, executionWaitsEnabled } = credential.json<{ fenceToken: string; executionWaitsEnabled: boolean }>()
  expect(executionWaitsEnabled).toBe(true)
  expect((await agent(token, 'POST', `/api/v1/workbench/runner-attempts/${attemptId}/start`, { fenceToken })).statusCode).toBe(200)
  return { sessionId, token, conversationId, turnId, attemptId, fenceToken }
}
const worker = () => createSessionLifecycleWorker({ db, workerId: `wait-${randomUUID()}` })

describe('persisted execution wait and Worker continuation', () => {
  beforeAll(async () => {
    process.env.WORKMESH_EXECUTION_WAITS_ENABLED = 'true'
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
    const install = await app.inject({ method: 'POST', url: '/api/v1/auth/install', payload: {
      name: 'Wait Test', slug: `wait-${randomUUID().slice(0,8)}`, adminName: 'Owner', email: `${randomUUID()}@wait.test`, password: 'wait-test-password',
    }, headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! } }) as unknown as Reply
    expect(install.statusCode, install.body).toBe(200)
    const raw = install.headers['set-cookie']; cookie = String(Array.isArray(raw) ? raw[0] : raw).split(';')[0]!
    csrf = install.json<{ csrfToken: string }>().csrfToken
    humanId = (await human('GET', '/api/v1/auth/me')).json<{ actor: { id: string } }>().actor.id
    teamId = (await human('GET', '/api/v1/teams')).json<{ items: { id: string }[] }>().items[0]!.id
    stateId = (await human('GET', `/api/v1/teams/${teamId}/states`)).json<{ items: { id: string; name: string }[] }>().items.find(state => state.name === 'Ready')!.id
    const registration = await human('POST', '/api/v1/agents/register', { name: 'Wait Runner', slug: `wait-runner-${randomUUID().slice(0,8)}`,
      provider: 'fake', version: '1', supportedProtocols: ['native_http'],
      requestedCapabilities: ['work:read','work:write'], approvedCapabilities: ['work:read','work:write'] })
    expect(registration.statusCode, registration.body).toBe(200)
    const registered = registration.json<{ id: string; installation_token: string }>(); agentId = registered.id; installation = registered.installation_token
    const concurrency = await human('PATCH', `/api/v1/agents/${agentId}`, { maxConcurrency: 100 }, match(1))
    expect(concurrency.statusCode, concurrency.body).toBe(200)
    expect(concurrency.json<{ max_concurrency: number }>().max_concurrency).toBe(100)
    expect((await human('PUT', `/api/v1/agents/${agentId}/team-access/${teamId}`, { approvedCapabilities: ['work:read','work:write'] })).statusCode).toBe(200)
    const connection = await human('POST', '/api/v1/workbench/llm-connections', { scope: 'workspace', name: 'Wait model', apiType: 'openai-completions', baseUrl: 'https://api.minimax.cn/v1', secretMaterial: 'fixture-only-secret' })
    expect(connection.statusCode, connection.body).toBe(201); connectionId = connection.json<{ id: string }>().id
    const model = await human('POST', `/api/v1/workbench/llm-connections/${connectionId}/models`, { externalModelId: 'wait-model', displayName: 'Wait model', enabled: true,
      capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false, contextWindowTokens: 16384, maxOutputTokens: 2048 } }, match(1))
    expect(model.statusCode, model.body).toBe(201); modelId = model.json<{ id: string }>().id
  }, 300_000)
  afterAll(async () => {
    if (originalEnabled === undefined) delete process.env.WORKMESH_EXECUTION_WAITS_ENABLED
    else process.env.WORKMESH_EXECUTION_WAITS_ENABLED = originalEnabled
    await app.close(); await db.end()
  })

  it.each(['awaiting_approval', 'awaiting_input', 'blocked'] as const)('settles %s publicly and resumes exactly once through live admission', async state => {
    const f = await sessionFixture()
    let approval: { id: string; actionPayloadHash: string } | undefined
    if (state === 'awaiting_approval') {
      const payload = { action: 'text-continuation' }
      const requested = await agent(f.token, 'POST', '/api/v1/approvals', { sessionId: f.sessionId,
        approvalType: 'manual_gate', actionName: 'text-continuation', actionPayloadSanitized: payload,
        actionPayloadHash: `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
        riskLevel: 'low', rationaleSummary: 'Human approval before continuing', requiredApprovals: 1,
        expiresAt: new Date(Date.now()+3600_000).toISOString() })
      expect(requested.statusCode, requested.body).toBe(200)
      const original = requested.json<{ id: string; action_payload_hash: string }>()
      approval = { id: original.id, actionPayloadHash: original.action_payload_hash }
      expect(approval.actionPayloadHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    }
    const body = { fenceToken: f.fenceToken, assistantMessageMarkdown: `Waiting: ${state}`,
      settlement: { outcome: 'settled', summaryMarkdown: 'Public wait', noArtifactReason: 'Waiting for Human', externalEffectsReconciled: true },
      sessionWait: { ifMatch: await revision(f.sessionId), state, reason: 'Please approve or provide input', ...(approval ? { approval } : {}) } }
    const key = randomUUID()
    const settled = await agent(f.token, 'POST', `/api/v1/workbench/runner-attempts/${f.attemptId}/settle`, body, { 'idempotency-key': key })
    expect(settled.statusCode, settled.body).toBe(200)
    expect((await agent(f.token, 'POST', `/api/v1/workbench/runner-attempts/${f.attemptId}/settle`, body, { 'idempotency-key': key })).json()).toEqual(settled.json())
    const waitId = settled.json<{ executionWait: { id: string } }>().executionWait.id
    expect((await db.query('SELECT id FROM workbench_runner_attempts WHERE agent_session_id=$1 AND status IN (\'preparing\',\'running\')', [f.sessionId])).rowCount).toBe(0)
    expect(await worker().reconcileWorkbenchWaits()).toBe(0)
    const monitors = await agent(installation, 'GET', '/api/v1/workbench/runner/assignments?executionWaits=true')
    expect(monitors.statusCode, monitors.body).toBe(200)
    expect(monitors.json<{ items: unknown[] }>().items).toContainEqual({ sessionId: f.sessionId, state, purpose: 'monitor', waitId })
    if (approval) {
      const decided = await human('POST', `/api/v1/approvals/${approval.id}/decide`, { decision: 'approved', reason: 'Continue this exact action' }, match(1))
      expect(decided.statusCode, decided.body).toBe(200)
    } else {
      expect((await human('POST', `/api/v1/agent-sessions/${f.sessionId}/prompt`, { bodyMarkdown: 'The requested input is supplied.' })).statusCode).toBe(200)
    }
    const results = await Promise.all([worker().reconcileWorkbenchWaits(), worker().reconcileWorkbenchWaits()])
    expect(results.reduce((sum, count) => sum+count, 0)).toBe(1)
    expect(await worker().reconcileWorkbenchWaits()).toBe(0)
    const wait = (await db.query<{ continuation_turn_id: string; status: string; trigger_prompt_id: string | null }>('SELECT * FROM workbench_execution_waits WHERE id=$1', [waitId])).rows[0]!
    expect(wait.status).toBe('continued')
    const oldClaim = await agent(f.token, 'POST', `/api/v1/workbench/turns/${wait.continuation_turn_id}/claim`, {})
    expect(oldClaim.statusCode).toBe(403)
    const claim = await agent(f.token, 'POST', `/api/v1/workbench/turns/${wait.continuation_turn_id}/claim`, { executionWaits: true })
    expect(claim.statusCode, claim.body).toBe(200)
    const nextAttemptId = claim.json<{ runnerAttemptId: string }>().runnerAttemptId
    const credential = await agent(f.token, 'GET', `/api/v1/workbench/runner-attempts/${nextAttemptId}/credential`)
    expect(credential.statusCode, credential.body).toBe(200)
    const next = credential.json<{ fenceToken: string; continuation: { waitId: string } }>()
    expect(next.continuation.waitId).toBe(waitId)
    expect((await agent(f.token, 'POST', `/api/v1/workbench/runner-attempts/${nextAttemptId}/start`, { fenceToken: next.fenceToken })).statusCode).toBe(200)
    const finished = await agent(f.token, 'POST', `/api/v1/workbench/runner-attempts/${nextAttemptId}/settle`, { fenceToken: next.fenceToken,
      assistantMessageMarkdown: 'Continued successfully.', settlement: { outcome: 'settled', summaryMarkdown: 'Continued', noArtifactReason: 'Text only', externalEffectsReconciled: true } })
    expect(finished.statusCode, finished.body).toBe(200)
    expect((await db.query('SELECT id FROM workbench_runner_attempts WHERE turn_id=$1', [wait.continuation_turn_id])).rowCount).toBe(1)
    expect((await db.query('SELECT id FROM workbench_runner_attempts WHERE agent_session_id=$1 AND status IN (\'preparing\',\'running\')', [f.sessionId])).rowCount).toBe(0)
  }, 120_000)

  it('keeps pause ahead of a real prompt and only resumes after the Human control command', async () => {
    const f = await sessionFixture()
    const settled = await agent(f.token, 'POST', `/api/v1/workbench/runner-attempts/${f.attemptId}/settle`, {
      fenceToken: f.fenceToken, assistantMessageMarkdown: 'Waiting for input.',
      settlement: { outcome: 'settled', summaryMarkdown: 'Waiting', noArtifactReason: 'Waiting', externalEffectsReconciled: true },
      sessionWait: { ifMatch: await revision(f.sessionId), state: 'awaiting_input', reason: 'Input required' },
    })
    expect(settled.statusCode, settled.body).toBe(200)
    expect((await human('POST', `/api/v1/agent-sessions/${f.sessionId}/signals`, { signal: 'pause', reason: 'Hold execution' }, match(await revision(f.sessionId)))).statusCode).toBe(200)
    expect((await human('POST', `/api/v1/agent-sessions/${f.sessionId}/prompt`, { bodyMarkdown: 'Input while paused' })).statusCode).toBe(200)
    expect(await worker().reconcileWorkbenchWaits()).toBe(0)
    expect((await db.query<{ state: string }>('SELECT state FROM agent_sessions WHERE id=$1', [f.sessionId])).rows[0]!.state).toBe('paused')
    expect((await human('POST', `/api/v1/agent-sessions/${f.sessionId}/signals`, { signal: 'resume', reason: 'Continue now' }, match(await revision(f.sessionId)))).statusCode).toBe(200)
    expect(await worker().reconcileWorkbenchWaits()).toBe(1)
  }, 120_000)

  it.each(['stop','revoke'] as const)('keeps %s ahead of a matching input trigger', async action => {
    const f = await sessionFixture()
    const settled = await agent(f.token, 'POST', `/api/v1/workbench/runner-attempts/${f.attemptId}/settle`, {
      fenceToken: f.fenceToken, assistantMessageMarkdown: 'Waiting for input.',
      settlement: { outcome: 'settled', summaryMarkdown: 'Waiting', noArtifactReason: 'Waiting', externalEffectsReconciled: true },
      sessionWait: { ifMatch: await revision(f.sessionId), state: 'awaiting_input', reason: 'Input required' },
    })
    expect(settled.statusCode, settled.body).toBe(200)
    expect((await human('POST', `/api/v1/agent-sessions/${f.sessionId}/prompt`, { bodyMarkdown: 'Input supplied.' })).statusCode).toBe(200)
    if (action === 'stop') expect((await human('POST', `/api/v1/agent-sessions/${f.sessionId}/signals`,
      { signal: 'stop', reason: 'Do not resume', stopMode: 'graceful' }, match(await revision(f.sessionId)))).statusCode).toBe(200)
    else await db.query(`UPDATE delegations SET status='revoked',revoked_at=now(),revoked_by_actor_id=$2
      WHERE id=(SELECT delegation_id FROM agent_sessions WHERE id=$1)`, [f.sessionId, humanId])
    expect(await worker().reconcileWorkbenchWaits()).toBe(0)
    expect((await db.query<{ status: string; terminal_reason: string }>('SELECT status,terminal_reason FROM workbench_execution_waits WHERE agent_session_id=$1', [f.sessionId])).rows[0])
      .toEqual({ status: 'canceled', terminal_reason: action === 'stop' ? 'session_closed' : 'authority_revoked' })
    expect((await db.query<{ continuation_turn_id: string | null }>('SELECT continuation_turn_id FROM workbench_execution_waits WHERE agent_session_id=$1', [f.sessionId])).rows[0]!.continuation_turn_id).toBeNull()
    expect((await db.query('SELECT id FROM workbench_runner_attempts WHERE agent_session_id=$1', [f.sessionId])).rowCount).toBe(1)
    expect((await db.query('SELECT id FROM workbench_turns WHERE conversation_id=$1', [f.conversationId])).rowCount).toBe(1)
    expect(await worker().reconcileWorkbenchWaits()).toBe(0)
    const publicTurns = await human('GET', `/api/v1/workbench/conversations/${f.conversationId}/turns`)
    expect(publicTurns.statusCode, publicTurns.body).toBe(200)
    expect(publicTurns.json<{ items: { id: string; status: string }[] }>().items)
      .toEqual([expect.objectContaining({ id: f.turnId, status: 'settled' })])
    const publicMessages = await human('GET', `/api/v1/workbench/conversations/${f.conversationId}/messages`)
    expect(publicMessages.statusCode, publicMessages.body).toBe(200)
    expect(publicMessages.json<{ items: { role: string; content_markdown: string }[] }>().items.filter(item => item.role === 'assistant'))
      .toEqual([expect.objectContaining({ content_markdown: 'Waiting for input.' })])
  }, 120_000)

  it('rejects another Session prompt, then accepts only the exact target prompt', async () => {
    const f = await sessionFixture()
    const settled = await agent(f.token, 'POST', `/api/v1/workbench/runner-attempts/${f.attemptId}/settle`, {
      fenceToken: f.fenceToken, assistantMessageMarkdown: 'Waiting for exact input.',
      settlement: { outcome: 'settled', summaryMarkdown: 'Waiting', noArtifactReason: 'Waiting', externalEffectsReconciled: true },
      sessionWait: { ifMatch: await revision(f.sessionId), state: 'blocked', reason: 'Exact input required' },
    })
    expect(settled.statusCode, settled.body).toBe(200)
    const other = await sessionFixture()
    expect((await human('POST', `/api/v1/agent-sessions/${other.sessionId}/prompt`, { bodyMarkdown: 'The same input.' })).statusCode).toBe(200)
    expect(await worker().reconcileWorkbenchWaits()).toBe(0)
    expect((await human('POST', `/api/v1/agent-sessions/${f.sessionId}/prompt`, { bodyMarkdown: 'The same input.' })).statusCode).toBe(200)
    expect(await worker().reconcileWorkbenchWaits()).toBe(1)
    const wait = (await db.query<{ trigger_prompt_id: string }>('SELECT trigger_prompt_id FROM workbench_execution_waits WHERE agent_session_id=$1', [f.sessionId])).rows[0]!
    expect((await db.query<{ session_id: string }>('SELECT session_id FROM agent_session_prompts WHERE id=$1', [wait.trigger_prompt_id])).rows[0]!.session_id).toBe(f.sessionId)
  }, 120_000)

  it('refuses a different well-formed approval hash without partially settling the Turn', async () => {
    const f = await sessionFixture()
    const payload = { action: 'exact-gate' }
    const requested = await agent(f.token, 'POST', '/api/v1/approvals', { sessionId: f.sessionId,
      approvalType: 'manual_gate', actionName: 'exact-gate', actionPayloadSanitized: payload,
      actionPayloadHash: `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
      riskLevel: 'low', rationaleSummary: 'Exact gate', expiresAt: new Date(Date.now()+3600_000).toISOString() })
    expect(requested.statusCode, requested.body).toBe(200)
    const original = requested.json<{ id: string; action_payload_hash: string }>()
    const different = original.action_payload_hash.slice(0,-1)+(original.action_payload_hash.endsWith('a') ? 'b' : 'a')
    const denied = await agent(f.token, 'POST', `/api/v1/workbench/runner-attempts/${f.attemptId}/settle`, {
      fenceToken: f.fenceToken, assistantMessageMarkdown: 'Must roll back',
      settlement: { outcome: 'settled', summaryMarkdown: 'Wait', noArtifactReason: 'Waiting', externalEffectsReconciled: true },
      sessionWait: { ifMatch: await revision(f.sessionId), state: 'awaiting_approval', reason: 'Wait',
        approval: { id: original.id, actionPayloadHash: different } },
    })
    expect(denied.json<{ error: { code: string } }>().error.code).toBe('APPROVAL_PAYLOAD_MISMATCH')
    expect((await db.query<{ status: string }>('SELECT status FROM workbench_turns WHERE id=$1', [f.turnId])).rows[0]!.status).toBe('running')
    expect((await db.query('SELECT id FROM workbench_messages WHERE runner_attempt_id=$1', [f.attemptId])).rowCount).toBe(0)
    expect((await db.query('SELECT id FROM workbench_execution_waits WHERE agent_session_id=$1', [f.sessionId])).rowCount).toBe(0)
  }, 120_000)

  it('rolls back Session, public reply, Turn, Attempt, wait and receipt together when wait persistence fails', async () => {
    const f = await sessionFixture()
    const triggerName = `m1_wait_failure_${randomUUID().replaceAll('-','')}`
    const key = randomUUID(), beforeRevision = await revision(f.sessionId)
    // A dedicated test-DB trigger is removed in finally; it changes no shared service or production configuration.
    await db.query(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'M1_WAIT_FAILURE'; END $$`)
    await db.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON workbench_execution_waits FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`)
    try {
      const failed = await agent(f.token, 'POST', `/api/v1/workbench/runner-attempts/${f.attemptId}/settle`, {
        fenceToken: f.fenceToken, assistantMessageMarkdown: 'Must not survive failure',
        settlement: { outcome: 'settled', summaryMarkdown: 'Wait', noArtifactReason: 'Waiting', externalEffectsReconciled: true },
        sessionWait: { ifMatch: beforeRevision, state: 'awaiting_input', reason: 'Wait' },
      }, { 'idempotency-key': key })
      expect(failed.statusCode, failed.body).toBe(500)
      expect(await revision(f.sessionId)).toBe(beforeRevision)
      expect((await db.query<{ state: string }>('SELECT state FROM agent_sessions WHERE id=$1', [f.sessionId])).rows[0]!.state).toBe('executing')
      expect((await db.query<{ status: string }>('SELECT status FROM workbench_turns WHERE id=$1', [f.turnId])).rows[0]!.status).toBe('running')
      expect((await db.query<{ status: string }>('SELECT status FROM workbench_runner_attempts WHERE id=$1', [f.attemptId])).rows[0]!.status).toBe('running')
      expect((await db.query('SELECT id FROM workbench_messages WHERE runner_attempt_id=$1', [f.attemptId])).rowCount).toBe(0)
      expect((await db.query('SELECT id FROM workbench_execution_waits WHERE agent_session_id=$1', [f.sessionId])).rowCount).toBe(0)
      expect((await db.query('SELECT 1 FROM api_idempotency_keys WHERE idempotency_key=$1', [key])).rowCount).toBe(0)
    } finally {
      await db.query(`DROP TRIGGER ${triggerName} ON workbench_execution_waits`)
      await db.query(`DROP FUNCTION ${triggerName}()`)
    }
  }, 120_000)

  it.each(['expired', 'rejected', 'missing_quorum'] as const)('does not continue an approval wait with %s', async rejection => {
    const f = await sessionFixture(), payload = { action: 'approval-admission' }
    const requested = await agent(f.token, 'POST', '/api/v1/approvals', { sessionId: f.sessionId,
      approvalType: 'manual_gate', actionName: 'approval-admission', actionPayloadSanitized: payload,
      actionPayloadHash: `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
      riskLevel: 'low', rationaleSummary: 'Approval admission', expiresAt: new Date(Date.now()+3600_000).toISOString() })
    expect(requested.statusCode, requested.body).toBe(200)
    const original = requested.json<{ id: string; action_payload_hash: string }>()
    const settled = await agent(f.token, 'POST', `/api/v1/workbench/runner-attempts/${f.attemptId}/settle`, {
      fenceToken: f.fenceToken, assistantMessageMarkdown: 'Waiting for exact Human approval.',
      settlement: { outcome: 'settled', summaryMarkdown: 'Wait', noArtifactReason: 'Waiting', externalEffectsReconciled: true },
      sessionWait: { ifMatch: await revision(f.sessionId), state: 'awaiting_approval', reason: 'Approval required',
        approval: { id: original.id, actionPayloadHash: original.action_payload_hash } },
    })
    expect(settled.statusCode, settled.body).toBe(200)
    if (rejection === 'missing_quorum') {
      // Controlled inconsistent-status counterexample: no approval decision fact is fabricated.
      await db.query("UPDATE approvals SET status='approved' WHERE id=$1", [original.id])
    } else {
      const decided = await human('POST', `/api/v1/approvals/${original.id}/decide`,
        { decision: rejection === 'rejected' ? 'rejected' : 'approved', reason: 'Exact Human decision' }, match(1))
      expect(decided.statusCode, decided.body).toBe(200)
      if (rejection === 'expired') await db.query("UPDATE approvals SET expires_at=created_at+interval '1 millisecond' WHERE id=$1", [original.id])
    }
    expect(await worker().reconcileWorkbenchWaits()).toBe(0)
    expect((await db.query<{ status: string; continuation_turn_id: string | null }>(
      'SELECT status,continuation_turn_id FROM workbench_execution_waits WHERE agent_session_id=$1', [f.sessionId])).rows[0])
      .toEqual({ status: 'pending', continuation_turn_id: null })
    expect((await db.query('SELECT id FROM workbench_runner_attempts WHERE agent_session_id=$1', [f.sessionId])).rowCount).toBe(1)
    if (rejection === 'missing_quorum') {
      await db.query("UPDATE approvals SET status='pending' WHERE id=$1", [original.id])
      const decided = await human('POST', `/api/v1/approvals/${original.id}/decide`, { decision: 'approved', reason: 'Real quorum reached' }, match(1))
      expect(decided.statusCode, decided.body).toBe(200)
      expect(await worker().reconcileWorkbenchWaits()).toBe(1)
    }
  }, 120_000)

  it('enforces wait persistence shapes, uniqueness, exact prompt foreign keys and immutable origins in PostgreSQL', async () => {
    const f = await sessionFixture(), other = await sessionFixture()
    const waitFor = async (fixture: Awaited<ReturnType<typeof sessionFixture>>) => {
      const settled = await agent(fixture.token, 'POST', `/api/v1/workbench/runner-attempts/${fixture.attemptId}/settle`, {
        fenceToken: fixture.fenceToken, assistantMessageMarkdown: 'Waiting for exact input.',
        settlement: { outcome: 'settled', summaryMarkdown: 'Wait', noArtifactReason: 'Waiting', externalEffectsReconciled: true },
        sessionWait: { ifMatch: await revision(fixture.sessionId), state: 'awaiting_input', reason: 'Exact input required' },
      })
      expect(settled.statusCode, settled.body).toBe(200)
      return settled.json<{ executionWait: { id: string } }>().executionWait.id
    }
    const waitId = await waitFor(f), otherWaitId = await waitFor(other)
    const clone = (patch: Record<string, unknown>) => db.query(`INSERT INTO workbench_execution_waits
      SELECT (jsonb_populate_record(NULL::workbench_execution_waits,to_jsonb(source)||$2::jsonb)).*
      FROM workbench_execution_waits source WHERE id=$1`, [waitId, JSON.stringify({ id: randomUUID(), ...patch })])
    const canceled = { status: 'canceled', resolved_at: new Date().toISOString(), terminal_reason: 'DDL probe' }
    await expect(clone({ ...canceled, source_attempt_id: other.attemptId })).rejects.toMatchObject({ code: '23505',
      constraint: 'workbench_execution_waits_workspace_id_source_turn_id_key' })
    await expect(clone({ ...canceled, source_turn_id: other.turnId })).rejects.toMatchObject({ code: '23505',
      constraint: 'workbench_execution_waits_workspace_id_source_attempt_id_key' })
    // Use source facts with no wait so the earlier source UNIQUE constraints cannot mask this index.
    const unusedSource = await sessionFixture()
    await expect(clone({ source_turn_id: unusedSource.turnId, source_attempt_id: unusedSource.attemptId })).rejects.toMatchObject({ code: '23505',
      constraint: 'workbench_wait_one_pending_session' })
    await db.query("UPDATE workbench_execution_waits SET status='canceled',resolved_at=now(),terminal_reason='DDL probe' WHERE id=$1", [otherWaitId])
    await expect(db.query('UPDATE workbench_execution_waits SET input_message_sequence=NULL WHERE id=$1', [waitId]))
      .rejects.toMatchObject({ code: '23514' })

    const payload = { action: 'DDL approval binding' }
    const requested = await agent(f.token, 'POST', '/api/v1/approvals', { sessionId: f.sessionId,
      approvalType: 'manual_gate', actionName: 'ddl-gate', actionPayloadSanitized: payload,
      actionPayloadHash: `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
      riskLevel: 'low', rationaleSummary: 'Exact DDL gate', expiresAt: new Date(Date.now()+3600_000).toISOString() })
    expect(requested.statusCode, requested.body).toBe(200)
    const original = requested.json<{ id: string; action_payload_hash: string }>()
    const saveApprovalShape = (hash: string | null) => db.query(`UPDATE workbench_execution_waits
      SET wait_state='awaiting_approval',approval_id=$2,approval_action_payload_hash=$3,
        input_event_cursor=NULL,input_message_sequence=NULL WHERE id=$1`, [waitId, original.id, hash])
    for (const invalid of [null, original.action_payload_hash.slice(7), original.action_payload_hash.replace('sha256:', 'SHA256:')])
      await expect(saveApprovalShape(invalid)).rejects.toMatchObject({ code: '23514' })
    await saveApprovalShape(original.action_payload_hash)
    expect((await db.query<{ approval_action_payload_hash: string }>('SELECT approval_action_payload_hash FROM workbench_execution_waits WHERE id=$1', [waitId])).rows[0]!.approval_action_payload_hash)
      .toBe(original.action_payload_hash)
    await db.query(`UPDATE workbench_execution_waits SET wait_state='awaiting_input',approval_id=NULL,
      approval_action_payload_hash=NULL,input_event_cursor=0,input_message_sequence=1 WHERE id=$1`, [waitId])

    expect((await human('POST', `/api/v1/agent-sessions/${f.sessionId}/prompt`, { bodyMarkdown: 'Exact target prompt.' })).statusCode).toBe(200)
    expect((await human('POST', `/api/v1/agent-sessions/${other.sessionId}/prompt`, { bodyMarkdown: 'Other Session prompt.' })).statusCode).toBe(200)
    const prompt = (await db.query<{ id: string }>('SELECT id FROM agent_session_prompts WHERE session_id=$1 ORDER BY created_at DESC LIMIT 1', [f.sessionId])).rows[0]!.id
    const otherPrompt = (await db.query<{ id: string }>('SELECT id FROM agent_session_prompts WHERE session_id=$1 ORDER BY created_at DESC LIMIT 1', [other.sessionId])).rows[0]!.id
    await db.query(`UPDATE workbench_execution_waits SET status='continued',resolved_at=now(),
      continuation_turn_id=$2,trigger_kind='prompt',trigger_prompt_id=$3 WHERE id=$1`, [waitId, f.turnId, prompt])
    await expect(db.query('UPDATE workbench_execution_waits SET trigger_prompt_id=$2 WHERE id=$1', [waitId, otherPrompt]))
      .rejects.toMatchObject({ code: '23503' })
    await expect(db.query(`UPDATE workbench_execution_waits SET status='continued',terminal_reason=NULL,
      continuation_turn_id=$2,trigger_kind='prompt',trigger_prompt_id=$3 WHERE id=$1`, [otherWaitId, f.turnId, otherPrompt]))
      .rejects.toMatchObject({ code: '23505', constraint: 'workbench_execution_waits_workspace_id_continuation_turn_id_key' })
    const installationId = (await db.query<{ source_installation_token_id: string }>('SELECT source_installation_token_id FROM workbench_execution_waits WHERE id=$1', [waitId])).rows[0]!.source_installation_token_id
    await expect(db.query("UPDATE agent_installation_tokens SET origin_kind=NULL WHERE id=$1", [installationId]))
      .rejects.toThrow('INSTALLATION_ORIGIN_IMMUTABLE')
    await expect(db.query('INSERT INTO agent_installation_tokens(agent_id,token_hash,origin_connection_id) VALUES($1,$2,$3)',
      [agentId, randomUUID(), randomUUID()])).rejects.toMatchObject({ code: '23514' })
  }, 120_000)
})
