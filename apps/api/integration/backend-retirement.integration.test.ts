import type { AddressInfo } from 'node:net'
import { randomUUID, createHash, verify } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { createDb, applyMigrations } from '@workmesh/db'
import { FakeAgent, createFakeAgentServer } from '../../fake-agent/src/index.js'
import { createAgentWebhookWorker } from '../../worker/src/agent-webhook.js'
import { createProviderActionWorker } from '../../worker/src/provider-actions.js'
import { FakeGitProvider } from '@workmesh/git-provider'
import { buildApp } from '../src/server.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Backend retirement requires a dedicated test database')
const db = createDb(databaseUrl)
let app = buildApp({ logger: { level: 'error' } })
const previousPrivateWebhooks = process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS
let apiUrl = '', cookie = '', csrf = '', actorId = ''
type JsonRecord = Record<string, unknown>
const call = async <T>(method: 'GET' | 'POST' | 'PUT', url: string, payload?: JsonRecord, extra: Record<string, string> = {}): Promise<T> => {
  const response = await app.inject({ method, url, payload, headers: {
    cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...extra,
  } })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<T>()
}
beforeAll(async () => {
  process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS = 'true'
  await applyMigrations(db)
  await db.query('TRUNCATE workspaces CASCADE')
  await app.listen({ host: '127.0.0.1', port: 0 })
  apiUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/install',
    headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! },
    payload: { name: 'Backend retirement', slug: 'retirement', adminName: 'Admin', email: 'retirement@example.test', password: 'retirement-integration-password' },
  })
  expect(response.statusCode, response.body).toBe(200)
  const setCookie = response.headers['set-cookie']
  cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? ''
  csrf = response.json<{ csrfToken: string }>().csrfToken
  actorId = (await call<{ actor: { id: string } }>('GET', '/api/v1/auth/me')).actor.id
}, 120_000)
afterAll(async () => {
  if (previousPrivateWebhooks === undefined) delete process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS
  else process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS = previousPrivateWebhooks
  await app.close(); await db.end()
})

it('固定 Skill 下载路径返回签名原字节，未声明路径和穿越请求拒绝', async () => {
  const response = await fetch(`${apiUrl}/skills/workmesh-1.1.0.md`)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/markdown')
  const bytes = Buffer.from(await response.arrayBuffer())
  const asset = await readFile(new URL('../assets/skills/workmesh-1.1.0.md', import.meta.url))
  expect(bytes.equals(asset)).toBe(true)
  expect(bytes.includes(13)).toBe(false)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('8dd4c67f92a758e3df2f82ea6c838a22b9db16dbb5e16d1c9b1f5dcd74a170ad')
  const { workmeshSkillManifest } = await import('@workmesh/contracts')
  const publicKey = await readFile(new URL('../../../skills/workmesh/public-key.pem', import.meta.url))
  expect(verify(null, bytes, publicKey, Buffer.from(workmeshSkillManifest.signature.slice(8), 'base64'))).toBe(true)
  for (const path of ['/skills/unlisted.md', '/skills/%2e%2e%2fprivate-key.pem'])
    expect([401, 403, 404]).toContain((await fetch(`${apiUrl}${path}`)).status)
})

it('liteInstallCookieCsrf：接口会话可管理，缺 Cookie 或 CSRF 拒绝', async () => {
  const anonymous = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })
  expect(anonymous.statusCode).toBe(401)
  const teamId = (await call<{ items: Array<{ id: string }> }>('GET', '/api/v1/teams')).items[0]!.id
  const rejected = await app.inject({ method: 'POST', url: '/api/v1/projects',
    headers: { cookie, 'idempotency-key': randomUUID() }, payload: { teamId, name: 'Missing CSRF' } })
  expect(rejected.statusCode).toBe(403)
  expect((await call<{ actor: { id: string } }>('GET', '/api/v1/auth/me')).actor.id).toBe(actorId)
})

it('liteProviderConnectionReplay 与 liteExactProjectContext：幂等拒变体，worker 发布精确范围', async () => {
  const teamId = (await call<{ items: Array<{ id: string }> }>('GET', '/api/v1/teams')).items[0]!.id
  const project = await call<{ id: string }>('POST', '/api/v1/projects', { teamId, name: 'Lite context' })
  const key = randomUUID()
  const input = { provider: 'fake', externalAccountId: `retirement-${randomUUID()}`, displayName: 'Fake provider', webhookSecret: 'retirement-fixture-not-a-real-secret' }
  const connection = await call<{ id: string }>('POST', '/api/v1/provider-connections', input, { 'idempotency-key': key })
  expect((await call<{ id: string }>('POST', '/api/v1/provider-connections', input, { 'idempotency-key': key })).id).toBe(connection.id)
  const changed = await app.inject({ method: 'POST', url: '/api/v1/provider-connections',
    headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': key }, payload: { ...input, displayName: 'Changed' } })
  expect(changed.statusCode).toBe(409)
  expect(changed.json<{ error: { code: string } }>().error.code).toBe('IDEMPOTENCY_KEY_REUSED')
  expect((await db.query('SELECT 1 FROM provider_connections WHERE external_account_id=$1', [input.externalAccountId])).rowCount).toBe(1)
  const repository = await call<{ id: string }>('POST', '/api/v1/repositories', {
    connectionId: connection.id, teamId, externalId: 'retirement/fixture', fullName: 'retirement/fixture', defaultBranch: 'main', requiredChecks: [],
  })
  const contextInput = { projectId: project.id, baseBranch: 'main', baseSha: 'retirement-base-sha', branchPattern: 'workmesh/{workItemKey}-{slug}', allowedPaths: ['**'], permissions: ['read'] }
  const actionKey = randomUUID()
  const action = await call<{ id: string }>('POST', `/api/v1/repositories/${repository.id}/context`, contextInput, { 'idempotency-key': actionKey })
  expect((await call<{ id: string }>('POST', `/api/v1/repositories/${repository.id}/context`, contextInput, { 'idempotency-key': actionKey })).id).toBe(action.id)
  const provider = new FakeGitProvider()
  provider.seedRepository(connection.id, 'retirement/fixture', 'main', contextInput.baseSha)
  provider.seedRepositoryFiles(connection.id, 'retirement/fixture', contextInput.baseSha, { 'AGENTS.md': '# Exact repository guidance\n' })
  await createProviderActionWorker({ db, resolveProvider: () => provider, workerId: 'retirement-context' }).tick()
  const contexts = await call<Array<{ provider_action_id: string; repository_id: string; project_id: string; work_item_id: string | null; session_id: string | null; base_sha: string; permissions: string[]; guidance: Array<{ content: string }> }>>('GET', `/api/v1/repositories/${repository.id}/context`)
  expect(contexts).toHaveLength(1)
  expect(contexts[0]).toMatchObject({ provider_action_id: action.id, repository_id: repository.id, project_id: project.id, work_item_id: null, session_id: null, base_sha: contextInput.baseSha, permissions: ['read'] })
  expect(contexts[0]!.guidance[0]!.content).toBe('# Exact repository guidance\n')
})

it('API 重启后保留 Human 会话与 durable SSE cursor，断线接续不丢事件', async () => {
  const teamId = (await call<{ items: Array<{ id: string }> }>('GET', '/api/v1/teams')).items[0]!.id
  const cursor = (await db.query<{ cursor: string }>('SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events')).rows[0]!.cursor
  const first = await call<{ id: string }>('POST', '/api/v1/projects', { teamId, name: 'Before restart' })
  const receive = async (after: string, expected: string) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(`${apiUrl}/api/v1/events/stream`, { headers: { cookie, 'Last-Event-ID': after }, signal: controller.signal })
      expect(response.status).toBe(200)
      const reader = response.body!.getReader(), decoder = new TextDecoder()
      let buffered = ''
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) throw new Error('SSE ended before durable event')
          buffered += decoder.decode(chunk.value, { stream: true })
          let end: number
          while ((end = buffered.indexOf('\n\n')) >= 0) {
            const frame = buffered.slice(0, end); buffered = buffered.slice(end + 2)
            const data = /^data: (.+)$/m.exec(frame), id = /^id: (\d+)$/m.exec(frame)
            if (data && id && JSON.parse(data[1]!).aggregate_id === expected) return id[1]!
          }
        }
      } finally { await reader.cancel() }
    } finally { clearTimeout(timeout); controller.abort() }
  }
  const firstCursor = await receive(cursor, first.id)
  await app.close()
  app = buildApp({ logger: { level: 'error' } })
  await app.listen({ host: '127.0.0.1', port: 0 })
  apiUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  expect((await call<{ actor: { id: string } }>('GET', '/api/v1/auth/me')).actor.id).toBe(actorId)
  const second = await call<{ id: string }>('POST', '/api/v1/projects', { teamId, name: 'After restart' })
  expect(BigInt(await receive(firstCursor, second.id))).toBeGreaterThan(BigInt(firstCursor))
})

async function listen(server: ReturnType<typeof createFakeAgentServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address() as AddressInfo | null
  if (!address) throw new Error('Fake Agent webhook server did not expose an address')
  return address.port
}

async function close(server: ReturnType<typeof createFakeAgentServer>): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

it('审批要求由真实 worker 投递给 fake Agent，并进入完成结果和证据', async () => {
  const webhookSecrets: string[] = []
  let fakeServer: ReturnType<typeof createFakeAgentServer> | undefined

  try {
    const teams = await call<{ items: Array<{ id: string }> }>('GET', '/api/v1/teams?limit=100')
    const teamId = teams.items[0]?.id
    if (!teamId) throw new Error('Acceptance Team is missing')
    const states = await call<{ items: Array<{ id: string; name: string }> }>('GET', `/api/v1/teams/${teamId}/states?limit=100`)
    const readyId = states.items.find(state => state.name === 'Ready')?.id
    if (!readyId) throw new Error('Ready workflow state is missing')

    const workItem = await call<{ id: string; revision: number }>('POST', '/api/v1/work-items', {
      teamId,
      title: `M6 real approval journey ${randomUUID().slice(0, 8)}`,
      description: 'A real fake-Agent journey for Human approval requirements and evidence.',
      statusId: readyId,
      responsibleHumanActorId: actorId,
      priority: 'high',
    })
    const capabilities = ['work:read', 'work:write', 'plan:write', 'artifact:write', 'message:write']
    const agent = await call<{ id: string; revision: number; installation_token: string }>('POST', '/api/v1/agents/register', {
      name: `M6 Approval Agent ${randomUUID().slice(0, 8)}`,
      slug: `m6-approval-agent-${randomUUID().slice(0, 8)}`,
      provider: 'fake',
      version: 'm6.7',
      supportedProtocols: ['native_http'],
      requestedCapabilities: capabilities,
      approvedCapabilities: capabilities,
    })
    await call('PUT', `/api/v1/agents/${agent.id}/team-access/${teamId}`, { approvedCapabilities: capabilities })

    const fakeAgent = new FakeAgent({
      apiUrl,
      installationToken: agent.installation_token,
      webhookSecrets,
      requestApproval: true,
    })
    fakeServer = createFakeAgentServer(fakeAgent)
    const fakePort = await listen(fakeServer)
    const endpoint = await call<{ id: string }>('POST', `/api/v1/agents/${agent.id}/webhook-endpoints`, {
      url: `http://127.0.0.1:${fakePort}/workmesh/events`,
    })
    const currentAgent = await call<{ revision: number }>('GET', `/api/v1/agents/${agent.id}`)
    const rotated = await call<{ secret: string }>('POST', `/api/v1/agents/${agent.id}/webhook-endpoints/${endpoint.id}/rotate-secret`, {}, {
      'if-match': `"revision-${currentAgent.revision}"`,
    })
    webhookSecrets.push(rotated.secret)

    const started = await call<{ session: { id: string } }>('POST', `/api/v1/work-items/${workItem.id}/agent-session`, {
      agentId: agent.id,
      principalHumanActorId: actorId,
      role: 'executor',
      requestedCapabilities: capabilities,
      initialPrompt: 'Request Human approval, retain any requirement verbatim, and answer it in the result summary with evidence.',
      budget: { maxRuntimeSeconds: 600 },
    }, { 'if-match': `"revision-${workItem.revision}"` })
    const worker = createAgentWebhookWorker({ db, allowPrivateAgentWebhooks: true, random: () => 0.5 })

    let approval: { id: string; revision: number } | undefined
    for (let attempt = 0; attempt < 20 && !approval; attempt += 1) {
      await worker.tick()
      await fakeAgent.whenIdle()
      const pending = await call<{ items: Array<{ id: string; revision: number; action_name: string }> }>('GET', `/api/v1/approvals?status=pending&sessionId=${started.session.id}&limit=100`)
      approval = pending.items.find(item => item.action_name === 'fake_agent.finish')
      if (!approval) await new Promise(resolve => setTimeout(resolve, 100))
    }
    expect(approval, `Fake Agent errors: ${fakeAgent.errors.join(', ')}`).toBeDefined()

    const requirement = 'Keep the rollback evidence attached and answer this requirement in the result summary.'
    await call('POST', `/api/v1/approvals/${approval!.id}/decide`, { decision: 'approved', reason: requirement }, {
      'if-match': `"revision-${approval!.revision}"`,
    })

    for (let attempt = 0; attempt < 20 && fakeAgent.resultSummaries.length === 0; attempt += 1) {
      await worker.tick()
      await fakeAgent.whenIdle()
      if (fakeAgent.resultSummaries.length === 0) await new Promise(resolve => setTimeout(resolve, 100))
    }
    expect(fakeAgent.errors).toEqual([])
    expect(fakeAgent.approvalDecisions).toContainEqual(expect.objectContaining({
      approvalId: approval!.id,
      decision: 'approved',
      immutable: true,
      reason: requirement,
      sessionId: started.session.id,
    }))
    expect(fakeAgent.resultSummaries.at(-1)).toContain(requirement)

    const completed = await call<{ state: string; state_reason: string }>('GET', `/api/v1/agent-sessions/${started.session.id}`)
    expect(completed.state).toBe('completed')
    expect(completed.state_reason).toContain(requirement)
    const artifacts = await call<{ items: Array<{ title: string; metadata?: Record<string, unknown> }> }>('GET', `/api/v1/artifacts?sessionId=${started.session.id}&limit=100`)
    expect(artifacts.items).toContainEqual(expect.objectContaining({
      title: 'Fake Agent conformance report',
      metadata: expect.objectContaining({ humanDecision: 'approved', humanDecisionReason: requirement }),
    }))

    const deliveryFacts = await db.query<{ event_type: string; status: string }>(
      `SELECT event_type,status FROM agent_webhook_deliveries
        WHERE session_id=$1 AND event_type IN ('agent.session.created','approval.decision.recorded','approval.approved')`,
      [started.session.id],
    )
    expect(deliveryFacts.rows).toEqual(expect.arrayContaining([
      { event_type: 'agent.session.created', status: 'delivered' },
      { event_type: 'approval.decision.recorded', status: 'delivered' },
      { event_type: 'approval.approved', status: 'delivered' },
    ]))
  } finally {
    if (fakeServer) await close(fakeServer)

  }
}, 90_000)
