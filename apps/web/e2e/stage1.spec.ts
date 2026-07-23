import { expect, test, type Page } from '@playwright/test'

const apiUrl = 'http://127.0.0.1:3101'
const corsHeaders = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:3100', 'Access-Control-Allow-Credentials': 'true', 'Content-Type': 'application/json' }

async function humanApi<T>(page: Page, path: string, method = 'GET', body?: unknown): Promise<{ status: number; body: T }> {
  return page.evaluate(async ({ apiUrl, path, method, body }) => {
    const headers = new Headers({ Accept: 'application/json' })
    if (method !== 'GET') { headers.set('Content-Type', 'application/json'); headers.set('Idempotency-Key', crypto.randomUUID()); headers.set('X-CSRF-Token', sessionStorage.getItem('workmesh.csrf-token') ?? '') }
    const response = await fetch(`${apiUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'include' })
    return { status: response.status, body: await response.json() }
  }, { apiUrl, path, method, body })
}

test.describe('Stage 1 agent browser acceptance', () => {
  test('delegates and starts one queued session with the atomic work-item command', async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill('alice@example.test')
    await page.getByPlaceholder('Password').fill('password-acceptance')
    await page.getByTestId('login-submit').click()
    await expect(page.getByRole('heading', { name: 'WorkMesh' })).toBeVisible()

    const capabilities = ['work:read', 'work:write', 'plan:write', 'artifact:write']
    const teamCapabilities = ['work:read', 'plan:write']
    const registered = await humanApi<{ id: string; installation_token: string }>(page, '/api/v1/agents/register', 'POST', {
      name: 'Acceptance agent', slug: 'acceptance-agent', provider: 'playwright', version: '1.0.0', supportedProtocols: ['native_http'], requestedCapabilities: capabilities, approvedCapabilities: capabilities, outputArtifactTypes: ['test_report'], maxConcurrency: 1, heartbeatIntervalSeconds: 30,
    })
    expect(registered.status).toBeLessThan(300)
    const ungranted = await humanApi<{ id: string }>(page, '/api/v1/agents/register', 'POST', {
      name: 'Ungranted agent', slug: 'ungranted-agent', provider: 'playwright', version: '1.0.0', supportedProtocols: ['native_http'], requestedCapabilities: capabilities, approvedCapabilities: capabilities, outputArtifactTypes: ['test_report'], maxConcurrency: 1, heartbeatIntervalSeconds: 30,
    })
    expect(ungranted.status).toBeLessThan(300)
    const me = await humanApi<{ actor: { id: string } }>(page, '/api/v1/auth/me')
    expect(me.status).toBe(200)

    const team = await humanApi<{ id: string }>(page, '/api/v1/teams', 'POST', { name: 'Stage 1 delivery', key: 'S1E' })
    expect(team.status).toBeLessThan(300)
    const access = await humanApi(page, `/api/v1/agents/${registered.body.id}/team-access/${team.body.id}`, 'PUT', { approvedCapabilities: teamCapabilities })
    expect(access.status).toBeLessThan(300)
    const ready = await humanApi<{ id: string }>(page, `/api/v1/teams/${team.body.id}/states`, 'POST', { name: 'Ready', category: 'planned', position: 0 })
    const work = await humanApi<{ id: string; revision: number }>(page, '/api/v1/work-items', 'POST', { teamId: team.body.id, title: 'Agent session browser flow', statusId: ready.body.id, priority: 'high', responsibleHumanActorId: me.body.actor.id })
    expect(work.status).toBeLessThan(300)

    await page.goto('/')
    await page.getByLabel('Current team').selectOption(team.body.id)
    await page.getByTestId(`work-${work.body.id}`).click()
    const drawer = page.getByTestId('work-item-drawer')
    await drawer.getByRole('button', { name: 'Delegate' }).click()
    const delegation = drawer.getByTestId('delegate-agent-form')
    await expect(delegation.getByRole('option', { name: 'Ungranted agent · No active grant for this team' })).toHaveAttribute('disabled', '')
    await delegation.getByLabel('Agent').selectOption(registered.body.id)
    await delegation.getByPlaceholder('What should this agent do?').fill('Inspect the acceptance work item and report progress.')
    const mutationPaths: string[] = []
    page.on('request', request => { if (request.method() === 'POST') mutationPaths.push(new URL(request.url()).pathname) })
    const atomicPath = `/api/v1/work-items/${work.body.id}/agent-session`
    const atomicRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === atomicPath)
    const createdSessionResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === atomicPath)
    await delegation.getByRole('button', { name: 'Start session' }).click()
    await expect(drawer.getByTestId('live-agent-panel')).toContainText('queued')

    expect((await atomicRequest).postDataJSON().requestedCapabilities).toEqual(teamCapabilities)
    const created = await (await createdSessionResponse).json() as { delegation: { id: string; permissions_snapshot: string[]; capability_scope: { capabilities: string[] } }; session: { id: string } }
    expect(created.delegation.id).toBeTruthy()
    expect(created.delegation.permissions_snapshot).toEqual(teamCapabilities)
    expect(created.delegation.capability_scope.capabilities).toEqual(teamCapabilities)
    expect(created.session.id).toBeTruthy()
    expect(mutationPaths.filter(path => path === atomicPath)).toHaveLength(1)
    expect(mutationPaths).not.toContain(`/api/v1/work-items/${work.body.id}/delegations`)
    expect(mutationPaths).not.toContain('/api/v1/agent-sessions')
    await expect(drawer.getByTestId('live-agent-panel').getByRole('button', { name: 'Pause' })).toHaveCount(0)
    await drawer.getByTestId('live-agent-panel').getByRole('button', { name: 'Stop' }).click()
    await expect(drawer.getByTestId('live-agent-panel')).toContainText(/stopping|stop/i)

    await page.goto('/agents')
    const registry = page.getByTestId(`agent-registry-${registered.body.id}`)
    await expect(registry).toContainText('Requested capabilities')
    await expect(registry).toContainText('Definition approved')
    await expect(registry).toContainText('1 concurrent session')
    const teamAccess = page.getByTestId(`team-access-${registered.body.id}-${team.body.id}`)
    await expect(teamAccess).toContainText('active')
    await expect(teamAccess).toContainText('work:read')
    await expect(teamAccess.getByRole('button', { name: 'Update grant' })).toBeVisible()
    await expect(teamAccess.getByRole('button', { name: 'Revoke' })).toBeVisible()
  })

  test('offers retry for a failed session and navigates to the new queued session', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill('alice@example.test')
    await page.getByPlaceholder('Password').fill('password-acceptance')
    await page.getByTestId('login-submit').click()
    await expect(page.getByRole('heading', { name: 'WorkMesh' })).toBeVisible()

    const sourceId = '00000000-0000-4000-8000-000000000101'
    const nextId = '00000000-0000-4000-8000-000000000102'
    const sourceSession = {
      id: sourceId, agent_id: '00000000-0000-4000-8000-000000000103', agent_actor_id: '00000000-0000-4000-8000-000000000104',
      delegation_id: '00000000-0000-4000-8000-000000000105', work_item_id: '00000000-0000-4000-8000-000000000106',
      state: 'failed', state_reason: 'Agent process exited.', revision: 4, current_plan_version_id: null, budget: {},
      last_heartbeat_at: null, retry_of_session_id: null, stop_requested_at: null, error_code: 'AGENT_EXITED',
      error_summary: 'Agent process exited.', created_at: '2026-07-23T00:00:00.000Z', updated_at: '2026-07-23T00:01:00.000Z',
    }
    const nextSession = {
      ...sourceSession, id: nextId, state: 'queued', state_reason: 'Retry queued.', revision: 1,
      retry_of_session_id: sourceId, error_code: null, error_summary: null, updated_at: '2026-07-23T00:02:00.000Z',
    }
    await page.route(`${apiUrl}/api/v1/agent-sessions/${sourceId}`, route => route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(sourceSession) }))
    await page.route(`${apiUrl}/api/v1/agent-sessions/${nextId}`, route => route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(nextSession) }))
    await page.route(`${apiUrl}/api/v1/agent-sessions/${sourceId}/retry`, route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...corsHeaders, 'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key, If-Match, X-CSRF-Token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
      return route.fulfill({ status: 201, headers: corsHeaders, body: JSON.stringify(nextSession) })
    })

    await page.goto(`/agent-sessions/${sourceId}`)
    const detail = page.getByTestId('agent-session-detail')
    await expect(detail).toContainText('failed')
    await expect(detail.getByRole('button', { name: 'Pause' })).toHaveCount(0)
    const retryRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === `/api/v1/agent-sessions/${sourceId}/retry`)
    await detail.getByRole('button', { name: 'Retry' }).click()
    const request = await retryRequest
    expect(request.headers()['if-match']).toBe('"revision-4"')
    expect(request.postDataJSON()).toEqual({ reason: 'Human requested a retry from WorkMesh.', reuseContext: true })
    await expect(page).toHaveURL(`/agent-sessions/${nextId}`)
    await expect(page.getByTestId('agent-session-detail')).toContainText('queued')
    await expect(page.getByTestId('agent-session-detail').getByRole('button', { name: 'Pause' })).toHaveCount(0)
  })

  test('shows projected team access data read-only to non-admin humans', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill('alice@example.test')
    await page.getByPlaceholder('Password').fill('password-acceptance')
    await page.getByTestId('login-submit').click()
    await expect(page.getByRole('heading', { name: 'WorkMesh' })).toBeVisible()

    const agentId = '00000000-0000-4000-8000-000000000201'
    const teamId = '00000000-0000-4000-8000-000000000202'
    const memberActor = { id: '00000000-0000-4000-8000-000000000203', display_name: 'Read-only member', workspace_role: 'member' }
    const agent = {
      id: agentId, workspace_id: '00000000-0000-4000-8000-000000000204', actor_id: '00000000-0000-4000-8000-000000000205',
      display_name: 'Controlled agent', slug: 'controlled-agent', description: 'A real registry projection.', supported_protocols: ['native_http'],
      skills: [], requested_capabilities: ['work:read', 'work:write'], approved_capabilities: ['work:read'], max_concurrency: 2,
      is_active: true, revision: 1, manifest: { provider: 'playwright', version: '1.0.0', heartbeatIntervalSeconds: 30 },
      team_access: [{
        agent_id: agentId, team_id: teamId, approved_capabilities: ['work:read'], status: 'active',
        approved_by_actor_id: memberActor.id, revision: 2, created_at: '2026-07-23T00:00:00.000Z',
        updated_at: '2026-07-23T00:01:00.000Z', revoked_at: null,
      }],
    }
    await page.route(`${apiUrl}/api/v1/auth/me`, route => route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ actor: memberActor, csrfToken: 'member-csrf' }) }))
    await page.route(`${apiUrl}/api/v1/agents`, route => route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([agent]) }))
    await page.route(`${apiUrl}/api/v1/teams`, route => route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([{ id: teamId, name: 'Read team', key: 'READ' }]) }))
    await page.route(`${apiUrl}/api/v1/agent-sessions`, route => route.fulfill({ status: 200, headers: corsHeaders, body: '[]' }))
    await page.route(`${apiUrl}/api/v1/approvals?status=pending`, route => route.fulfill({ status: 200, headers: corsHeaders, body: '[]' }))

    await page.goto('/agents')
    const registry = page.getByTestId(`agent-registry-${agentId}`)
    await expect(registry).toContainText('work:read, work:write')
    await expect(registry).toContainText('Definition approved')
    await expect(registry).toContainText('2 concurrent sessions')
    const teamAccess = page.getByTestId(`team-access-${agentId}-${teamId}`)
    await expect(teamAccess).toContainText('active')
    await expect(teamAccess).toContainText('Approved: work:read')
    await expect(teamAccess.getByRole('button', { name: /grant|revoke/i })).toHaveCount(0)
  })
})
