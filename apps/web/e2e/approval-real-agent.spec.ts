import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { expect, test, type APIResponse, type Page } from '@playwright/test'
import { createDb } from '../../../packages/db/src/index.js'
import { FakeAgent, createFakeAgentServer } from '../../fake-agent/src/index.js'
import { createAgentWebhookWorker } from '../../worker/src/agent-webhook.js'

const apiUrl = 'http://127.0.0.1:3101'
const webUrl = 'http://127.0.0.1:3100'

type JsonRecord = Record<string, unknown>

async function json<T>(response: APIResponse, label: string): Promise<T> {
  const body = await response.json() as T
  expect(response.ok(), `${label}: ${response.status()} ${JSON.stringify(body)}`).toBe(true)
  return body
}

async function login(page: Page): Promise<{ actorId: string; csrf: string }> {
  const signedIn = await json<{ csrfToken: string }>(await page.request.post(`${apiUrl}/api/v1/auth/login`, {
    data: { email: 'alice@example.test', password: 'password-acceptance' },
    headers: {
      'idempotency-key': `m6-real-agent-login-${randomUUID()}`,
      origin: webUrl,
    },
  }), 'login')
  const me = await json<{ actor: { id: string } }>(await page.request.get(`${apiUrl}/api/v1/auth/me`, {
    headers: { 'x-csrf-token': signedIn.csrfToken, origin: webUrl },
  }), 'current actor')
  return { actorId: me.actor.id, csrf: signedIn.csrfToken }
}

function humanApi(page: Page, csrf: string) {
  return async <T>(method: 'GET' | 'POST' | 'PUT', path: string, data?: JsonRecord, headers: Record<string, string> = {}): Promise<T> => {
    const response = await page.request.fetch(`${apiUrl}${path}`, {
      method,
      data,
      headers: {
        origin: webUrl,
        'x-csrf-token': csrf,
        ...(method === 'GET' ? {} : { 'idempotency-key': `m6-real-agent-${randomUUID()}` }),
        ...headers,
      },
    })
    return json<T>(response, `${method} ${path}`)
  }
}

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

test('delivers an approval requirement through the real worker to a fake Agent and its evidence', async ({ page }) => {
  test.setTimeout(90_000)
  const { actorId, csrf } = await login(page)
  const call = humanApi(page, csrf)
  const db = createDb()
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
    await page.goto(`/agents?tab=approvals&approvalView=pending`, { waitUntil: 'domcontentloaded' })
    const row = page.getByTestId(`approval-row-${approval!.id}`)
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Other feedback' }).click()
    await row.getByLabel('Decision information for the Agent').fill(requirement)
    await row.getByRole('button', { name: 'Approve with requirements' }).click()
    await expect(row.locator('.approval-decision-status')).toContainText(requirement)

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

    await page.goto(`/agent-sessions/${started.session.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(requirement, { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Fake Agent conformance report', { exact: false }).first()).toBeVisible()

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
    await db.end()
  }
})
