import type { AddressInfo } from 'node:net'
import { randomUUID, createHash, verify } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { createDb, applyMigrations } from '@workmesh/db'
import { FakeAgent, createFakeAgentServer } from '../../fake-agent/src/index.js'
import { createAgentWebhookWorker } from '../../worker/src/agent-webhook.js'
import { buildApp } from '../src/server.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Backend retirement requires a dedicated test database')
const db = createDb(databaseUrl)
const app = buildApp({ logger: { level: 'error' } })
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
