import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '@workmesh/db'
import { buildApp } from '../src/server.js'
import { seedAgentSessionBearer } from './agent-session-test-credentials.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Workbench Runner integration requires a dedicated *test* database and RUN_INTEGRATION=1')
const db = createDb(databaseUrl)
const app = buildApp({ logger: { level: 'silent' } })
type Reply = { statusCode: number; headers: Record<string, string | string[] | number | undefined>; json: <T>() => T; body: string }
let cookie = '', csrf = '', actorId = '', teamId = '', workItemId = '', sessionId = '', bearer = '', agentId = ''
let installationToken = '', appUrl = ''
const execFileAsync = promisify(execFile)
const humanCall = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object, headers: Record<string, string> = {}): Promise<Reply> =>
  app.inject({ method, url, payload, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...headers } }) as unknown as Promise<Reply>
const runnerCall = (method: 'GET' | 'POST', url: string, payload?: object, headers: Record<string, string> = {}): Promise<Reply> =>
  app.inject({ method, url, payload, headers: { authorization: `Bearer ${bearer}`,
    'x-workmesh-runner-token': process.env.WORKMESH_RUNNER_SERVICE_TOKEN!, 'idempotency-key': randomUUID(), ...headers } }) as unknown as Promise<Reply>

describe('exact-session Pi Runner API', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
    appUrl = await app.listen({ port: 0, host: '127.0.0.1' })
    const installed = await app.inject({ method: 'POST', url: '/api/v1/auth/install',
      payload: { name: 'Runner Test', slug: `runner-${randomUUID().slice(0, 8)}`, adminName: 'Admin',
        email: `${randomUUID()}@runner.test`, password: 'runner-test-password' },
      headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! },
    }) as unknown as Reply
    expect(installed.statusCode, installed.body).toBe(200)
    const rawCookie = Array.isArray(installed.headers['set-cookie']) ? installed.headers['set-cookie'][0] : installed.headers['set-cookie']
    cookie = String(rawCookie ?? '').split(';')[0] ?? ''
    csrf = installed.json<{ csrfToken: string }>().csrfToken
    actorId = (await humanCall('GET', '/api/v1/auth/me')).json<{ actor: { id: string } }>().actor.id
    teamId = (await humanCall('GET', '/api/v1/teams')).json<{ items: Array<{ id: string }> }>().items[0]!.id
    const states = (await humanCall('GET', `/api/v1/teams/${teamId}/states`))
      .json<{ items: Array<{ id: string; name: string }> }>().items
    const stateId = states.find(state => state.name === 'Ready')!.id
    const work = await humanCall('POST', '/api/v1/work-items', {
      teamId, title: 'Runner acceptance', statusId: stateId, responsibleHumanActorId: actorId,
    })
    expect(work.statusCode, work.body).toBe(200)
    workItemId = work.json<{ id: string }>().id
    const registered = await humanCall('POST', '/api/v1/agents/register', {
      name: 'Pi Runner Fixture', slug: `pi-runner-${randomUUID().slice(0, 8)}`,
      provider: 'fake', version: '1', supportedProtocols: ['native_http'],
      requestedCapabilities: ['work:read','work:write'], approvedCapabilities: ['work:read','work:write'],
    })
    expect(registered.statusCode, registered.body).toBe(200)
    const agent = registered.json<{ id: string; installation_token: string }>()
    agentId = agent.id
    installationToken = agent.installation_token
    const granted = await humanCall('PUT', `/api/v1/agents/${agentId}/team-access/${teamId}`,
      { approvedCapabilities: ['work:read','work:write'] })
    expect(granted.statusCode, granted.body).toBe(200)
    const revision = (await db.query<{ revision: number }>(
      'SELECT revision FROM work_items WHERE id=$1', [workItemId])).rows[0]!.revision
    const started = await humanCall('POST', `/api/v1/work-items/${workItemId}/agent-session`, {
      agentId, principalHumanActorId: actorId, role: 'executor',
      requestedCapabilities: ['work:read','work:write'], initialPrompt: 'Answer the workbench turn', budget: {},
    }, { 'if-match': `"revision-${revision}"` })
    expect(started.statusCode, started.body).toBe(200)
    sessionId = started.json<{ session: { id: string } }>().session.id
    bearer = await seedAgentSessionBearer(db, sessionId, agentId)
    const ack = await runnerCall('POST', `/api/v1/agent-sessions/${sessionId}/ack`,
      { summary: 'Runner ready', externalUrls: [] })
    expect(ack.statusCode, ack.body).toBe(200)
    const executing = await runnerCall('POST', `/api/v1/agent-sessions/${sessionId}/state`,
      { state: 'executing', reason: 'Test session' },
      { 'if-match': `"revision-${ack.json<{ revision: number }>().revision}"` })
    expect(executing.statusCode, executing.body).toBe(200)
  }, 300_000)
  afterAll(async () => { await app.close(); await db.end() })

  it('fences stopped writers and keeps model credentials behind two credentials', async () => {
    const connection = await humanCall('POST', '/api/v1/workbench/llm-connections', {
      scope: 'workspace', name: 'MiniMax Fixture', apiType: 'openai-completions',
      baseUrl: 'https://api.minimax.cn/v1', secretMaterial: 'fixture-only-secret',
    })
    expect(connection.statusCode, connection.body).toBe(201)
    const connectionId = connection.json<{ id: string }>().id
    const model = await humanCall('POST', `/api/v1/workbench/llm-connections/${connectionId}/models`, {
      externalModelId: 'MiniMax-M3', displayName: 'MiniMax M3', enabled: true,
      capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false,
        contextWindowTokens: 204800, maxOutputTokens: 4096 },
    }, { 'if-match': '"revision-1"' })
    expect(model.statusCode, model.body).toBe(201)
    const modelId = model.json<{ id: string }>().id
    const created = await humanCall('POST', '/api/v1/workbench/conversations', {
      title: 'Runner test', workItemId, agentSessionId: sessionId,
      llmConnectionId: connectionId, llmModelId: modelId,
    })
    expect(created.statusCode, created.body).toBe(201)
    const conversationId = created.json<{ id: string }>().id
    const turnsUrl = `/api/v1/workbench/conversations/${conversationId}/turns`
    const sent = await humanCall('POST', turnsUrl, { messageMarkdown: 'Say hello.' },
      { 'if-match': '"revision-1"' })
    expect(sent.statusCode, sent.body).toBe(201)
    const turnId = sent.json<{ turn: { id: string } }>().turn.id
    const assignments = await app.inject({ method: 'GET', url: '/api/v1/workbench/runner/assignments',
      headers: { authorization: `Bearer ${installationToken}`,
        'x-workmesh-runner-token': process.env.WORKMESH_RUNNER_SERVICE_TOKEN! } }) as unknown as Reply
    expect(assignments.statusCode, assignments.body).toBe(200)
    expect(assignments.json<{ items: Array<{ sessionId: string; state: string }> }>().items)
      .toContainEqual({ sessionId, state: 'executing' })
    const queued = await runnerCall('GET', `/api/v1/agent-sessions/${sessionId}/workbench-turns`)
    expect(queued.statusCode, queued.body).toBe(200)
    expect(queued.json<{ items: Array<{ turnId: string }> }>().items.some(item => item.turnId === turnId)).toBe(true)
    const withoutRunnerToken = await runnerCall('GET', `/api/v1/agent-sessions/${sessionId}/workbench-turns`,
      undefined, { 'x-workmesh-runner-token': 'wrong' })
    expect(withoutRunnerToken.statusCode).toBe(403)
    const claimed = await runnerCall('POST', `/api/v1/workbench/turns/${turnId}/claim`)
    expect(claimed.statusCode, claimed.body).toBe(200)
    const attemptId = claimed.json<{ runnerAttemptId: string }>().runnerAttemptId
    const deniedCredential = await runnerCall('GET', `/api/v1/workbench/runner-attempts/${attemptId}/credential`,
      undefined, { 'x-workmesh-runner-token': 'wrong' })
    expect(deniedCredential.statusCode).toBe(403)
    const credential = await runnerCall('GET', `/api/v1/workbench/runner-attempts/${attemptId}/credential`)
    expect(credential.statusCode, credential.body).toBe(200)
    expect(credential.headers['cache-control']).toBe('no-store')
    const secret = credential.json<{ apiKey: string; fenceToken: string; messages: Array<{ role: string }> }>()
    expect(secret.apiKey).toBe('fixture-only-secret')
    expect(secret.messages).toMatchObject([{ role: 'user' }])
    expect(claimed.body).not.toContain(secret.fenceToken)
    const started = await runnerCall('POST', `/api/v1/workbench/runner-attempts/${attemptId}/start`,
      { fenceToken: secret.fenceToken })
    expect(started.statusCode, started.body).toBe(200)
    const stopped = await humanCall('POST', `${turnsUrl}/${turnId}/stop`,
      { reason: 'Stop the model call', stopMode: 'immediate' }, { 'if-match': '"revision-3"' })
    expect(stopped.statusCode, stopped.body).toBe(200)
    const stale = await runnerCall('POST', `/api/v1/workbench/runner-attempts/${attemptId}/settle`, {
      fenceToken: secret.fenceToken, assistantMessageMarkdown: 'Must not persist',
      settlement: { outcome: 'settled', summaryMarkdown: 'Completed', noArtifactReason: 'Text only' },
    })
    expect(stale.statusCode, stale.body).toBe(409)
    expect((await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM workbench_messages WHERE runner_attempt_id=$1",
      [attemptId])).rows[0]?.count).toBe(0)
    const next = await humanCall('POST', turnsUrl, { messageMarkdown: 'Say hi instead.' },
      { 'if-match': '"revision-4"' })
    expect(next.statusCode, next.body).toBe(201)
    const nextTurnId = next.json<{ turn: { id: string } }>().turn.id
    const nextClaim = await runnerCall('POST', `/api/v1/workbench/turns/${nextTurnId}/claim`)
    expect(nextClaim.statusCode, nextClaim.body).toBe(200)
    const nextAttemptId = nextClaim.json<{ runnerAttemptId: string }>().runnerAttemptId
    const nextCredential = (await runnerCall('GET', `/api/v1/workbench/runner-attempts/${nextAttemptId}/credential`))
      .json<{ fenceToken: string }>()
    expect((await runnerCall('POST', `/api/v1/workbench/runner-attempts/${nextAttemptId}/start`,
      { fenceToken: nextCredential.fenceToken })).statusCode).toBe(200)
    const settled = await runnerCall('POST', `/api/v1/workbench/runner-attempts/${nextAttemptId}/settle`, {
      fenceToken: nextCredential.fenceToken, assistantMessageMarkdown: 'Hi.',
      settlement: { outcome: 'settled', summaryMarkdown: 'Answered the user.',
        noArtifactReason: 'Text only', externalEffectsReconciled: true },
    })
    expect(settled.statusCode, settled.body).toBe(200)
    const messages = await humanCall('GET', `/api/v1/workbench/conversations/${conversationId}/messages`)
    expect(messages.statusCode, messages.body).toBe(200)
    expect(messages.json<{ items: Array<{ content_markdown: string }> }>().items[0]?.content_markdown).toBe('Hi.')
    const leaked = await db.query<{ payload: string }>(
      `SELECT payload::text FROM domain_events WHERE aggregate_id IN ($1,$2)`, [turnId, nextTurnId])
    expect(leaked.rows.map(row => row.payload).join(' ')).not.toContain('fixture-only-secret')
  })

  it('discovers a newly delegated Pi session and advances it through ACK and heartbeat before a turn exists', async () => {
    const states = (await humanCall('GET', `/api/v1/teams/${teamId}/states`))
      .json<{ items: Array<{ id: string; name: string }> }>().items
    const work = await humanCall('POST', '/api/v1/work-items', {
      teamId, title: 'Runner lifecycle acceptance', statusId: states.find(state => state.name === 'Ready')!.id,
      responsibleHumanActorId: actorId,
    })
    expect(work.statusCode, work.body).toBe(200)
    const newWorkItemId = work.json<{ id: string }>().id
    const registered = await humanCall('POST', '/api/v1/agents/register', {
      name: 'Pi Lifecycle Fixture', slug: `pi-lifecycle-${randomUUID().slice(0, 8)}`,
      provider: 'fake', version: '1', supportedProtocols: ['native_http'],
      requestedCapabilities: ['work:read','work:write'], approvedCapabilities: ['work:read','work:write'],
    })
    expect(registered.statusCode, registered.body).toBe(200)
    const lifecycleAgent = registered.json<{ id: string; installation_token: string }>()
    const grant = await humanCall('PUT', `/api/v1/agents/${lifecycleAgent.id}/team-access/${teamId}`,
      { approvedCapabilities: ['work:read','work:write'] })
    expect(grant.statusCode, grant.body).toBe(200)
    const workRevision = (await db.query<{ revision: number }>(
      'SELECT revision FROM work_items WHERE id=$1', [newWorkItemId])).rows[0]!.revision
    const created = await humanCall('POST', `/api/v1/work-items/${newWorkItemId}/agent-session`, {
      agentId: lifecycleAgent.id, principalHumanActorId: actorId, role: 'executor',
      requestedCapabilities: ['work:read','work:write'], initialPrompt: 'Wait for a workbench turn', budget: {},
    }, { 'if-match': `"revision-${workRevision}"` })
    expect(created.statusCode, created.body).toBe(200)
    const newSessionId = created.json<{ session: { id: string } }>().session.id
    const assignment = await app.inject({ method: 'GET', url: '/api/v1/workbench/runner/assignments',
      headers: { authorization: `Bearer ${lifecycleAgent.installation_token}`,
        'x-workmesh-runner-token': process.env.WORKMESH_RUNNER_SERVICE_TOKEN! } }) as unknown as Reply
    expect(assignment.statusCode, assignment.body).toBe(200)
    expect(assignment.json<{ items: Array<{ sessionId: string; state: string }> }>().items)
      .toContainEqual({ sessionId: newSessionId, state: 'queued' })
    const runnerRoot = join(import.meta.dirname, '../../agent-runner')
    const runnerEnv: NodeJS.ProcessEnv = { ...process.env, WORKMESH_API_URL: appUrl,
      WORKMESH_AGENT_INSTALLATION_TOKEN: lifecycleAgent.installation_token }
    delete runnerEnv.DATABASE_URL
    delete runnerEnv.WORKMESH_MASTER_KEY
    delete runnerEnv.WORKMESH_BOOTSTRAP_TOKEN
    const runner = await execFileAsync(process.execPath,
      [join(runnerRoot, 'node_modules/tsx/dist/cli.mjs'), join(runnerRoot, 'src/run-session.ts'), '--once'],
      { cwd: runnerRoot, env: runnerEnv, timeout: 30_000, maxBuffer: 1_000_000 })
    expect(runner.stderr, runner.stdout).toBe('')
    const live = (await db.query<{ state: string; last_heartbeat_at: Date | null }>(
      'SELECT state,last_heartbeat_at FROM agent_sessions WHERE id=$1', [newSessionId])).rows[0]!
    expect(live.state).toBe('executing')
    expect(live.last_heartbeat_at).not.toBeNull()
  })

  it.skipIf(process.env.RUN_WORKBENCH_LIVE !== '1' || !process.env.MINIMAX_CN_API_KEY)(
    'runs an exact-session MiniMax-M3 Pi turn through the durable API', async () => {
      const connection = await humanCall('POST', '/api/v1/workbench/llm-connections', {
        scope: 'workspace', name: 'MiniMax M3 Live', apiType: 'openai-completions',
        baseUrl: 'https://api.minimax.cn/v1', secretMaterial: process.env.MINIMAX_CN_API_KEY!,
      })
      expect(connection.statusCode).toBe(201)
      const connectionId = connection.json<{ id: string }>().id
      const model = await humanCall('POST', `/api/v1/workbench/llm-connections/${connectionId}/models`, {
        externalModelId: 'MiniMax-M3', displayName: 'MiniMax M3', enabled: true,
        capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false,
          contextWindowTokens: 204800, maxOutputTokens: 4096 },
      }, { 'if-match': '"revision-1"' })
      expect(model.statusCode).toBe(201)
      const modelId = model.json<{ id: string }>().id
      const created = await humanCall('POST', '/api/v1/workbench/conversations', {
        title: 'MiniMax live acceptance', workItemId, agentSessionId: sessionId,
        llmConnectionId: connectionId, llmModelId: modelId,
      })
      expect(created.statusCode, created.body).toBe(201)
      const conversationId = created.json<{ id: string }>().id
      const sent = await humanCall('POST', `/api/v1/workbench/conversations/${conversationId}/turns`, {
        messageMarkdown: 'Call workmesh_session_context exactly once, then answer in one brief sentence that the session context is ready.',
      }, { 'if-match': '"revision-1"' })
      expect(sent.statusCode, sent.body).toBe(201)
      const turnId = sent.json<{ turn: { id: string } }>().turn.id
      const runnerEnv: NodeJS.ProcessEnv = { ...process.env,
        WORKMESH_API_URL: appUrl,
        WORKMESH_AGENT_INSTALLATION_TOKEN: installationToken,
      }
      delete runnerEnv.MINIMAX_CN_API_KEY
      delete runnerEnv.DATABASE_URL
      delete runnerEnv.WORKMESH_MASTER_KEY
      delete runnerEnv.WORKMESH_BOOTSTRAP_TOKEN
      const runnerRoot = join(import.meta.dirname, '../../agent-runner')
      let stdout = ''
      try {
        const result = await execFileAsync(process.execPath,
          [join(runnerRoot, 'node_modules/tsx/dist/cli.mjs'),
            join(runnerRoot, 'src/run-session.ts'), '--once'],
          { cwd: runnerRoot, env: runnerEnv, timeout: 180_000, maxBuffer: 1_000_000 })
        stdout = result.stdout
      } catch (error) {
        const diagnostic = (error as { stderr?: string }).stderr?.trim().split('\n').at(-1) ?? 'no runner diagnostic'
        throw new Error(`LIVE_RUNNER_FAILED: ${diagnostic.slice(0, 200)}`)
      }
      const resultLine = stdout.trim().split('\n').at(-1) ?? '{}'
      const result = JSON.parse(resultLine) as { turnId: string; status: string; toolCalls: number }
      expect(result).toMatchObject({ turnId, status: 'settled' })
      expect(result.toolCalls).toBeGreaterThanOrEqual(1)
      const turns = await humanCall('GET', `/api/v1/workbench/conversations/${conversationId}/turns`)
      expect(turns.json<{ items: Array<{ status: string }> }>().items[0]?.status).toBe('settled')
      const messages = await humanCall('GET', `/api/v1/workbench/conversations/${conversationId}/messages`)
      expect(messages.json<{ items: Array<{ role: string; content_markdown: string }> }>().items[0])
        .toMatchObject({ role: 'assistant' })
      expect(messages.body).not.toContain(process.env.MINIMAX_CN_API_KEY!)
    }, 240_000,
  )
})
