import { expect, test } from '@playwright/test'
import type { AgentConnection } from '../app/lib/agents'

const apiUrl = 'http://127.0.0.1:3101'
const webUrl = 'http://127.0.0.1:3100'
const connectionsUrl = '/agents?tab=connections'
const headers = {
  'Access-Control-Allow-Origin': webUrl,
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
}

const discovery = {
  protocolVersion: 'v1',
  mcpUrl: `${apiUrl}/mcp?instance=${'diagnostics-'.repeat(18)}`,
  wellKnownUrl: `${apiUrl}/.well-known/workmesh-agent`,
  apiVersion: '1.0',
  supportedClients: ['codex'],
  skill: { name: 'workmesh', version: '1.0.0', sha256: 'a'.repeat(64), signature: 'ed25519:test' },
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])
})

const baseConnection: AgentConnection = {
  id: 'connection-fault', workspace_id: 'workspace-fault', team_id: 'team-fault',
  agent_actor_id: 'agent-fault', principal_human_actor_id: 'human-fault',
  name: 'Codex coordinator', agent_slug: 'codex-coordinator', client_type: 'codex',
  status: 'active', source: 'manual', enrollment_policy_id: null,
  requested_capabilities: ['work:read'], granted_capabilities: ['work:read'],
  grant_agent_delegate: false, skill_version: '1.0.0', skill_sha256: 'a'.repeat(64),
  credential_fingerprint_prefix: 'wm_safe1234', pairing_code_expires_at: null,
  last_used_at: '2026-08-10T00:00:00.000Z', rotated_at: null, revoked_at: null,
  revision: 1, redacted_token: true, created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z',
}

test('diagnoses expired, rotating, revoked, and mis-scoped Connections without rendering credentials', async ({ page }) => {
  let connection = { ...baseConnection }
  await page.route(`${apiUrl}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/.well-known/workmesh-agent') return body(discovery)
    if (path === '/api/v1/info') return body({ preferredClientProfileVersion: '1.0', supportedClientProfileVersions: ['1.0'], mcpVersion: '1.29.0' })
    if (path === '/api/v1/features') return body({ features: [{ key: 'WORKMESH_BETA_COORDINATION_MCP', enabled: true }] })
    if (path === '/mcp') return body({ error: { code: 'UNAUTHORIZED', message: 'credential required', correlationId: 'fault-e2e' } }, 401)
    if (path === '/api/v1/auth/me') return body({ actor: { id: 'human-fault', display_name: 'Rex', workspace_id: 'workspace-fault', workspace_role: 'admin' }, csrfToken: 'fault-csrf' })
    if (path === '/api/v1/teams') return body({ items: [{ id: 'team-fault', name: 'Platform', key: 'PLAT' }], nextCursor: null })
    if (path === '/api/v1/actors/humans') return body({ items: [{ id: 'human-fault', display_name: 'Rex' }], nextCursor: null })
    if (path === '/api/v1/agents' || path === '/api/v1/agent-sessions' || path === '/api/v1/approvals') return body({ items: [], nextCursor: null })
    if (path === '/api/v1/agent-connections') return body({ items: [connection], nextCursor: null })
    if (path === '/api/v1/agent-connections/connection-fault') return body(connection)
    if (path === '/api/v1/events/stream') return route.fulfill({ status: 204, headers })
    return body({ error: { code: 'NOT_FOUND', message: `Unexpected ${path}`, correlationId: 'fault-e2e' } }, 404)
  })

  const cases: Array<[Partial<AgentConnection>, string]> = [
    [{ status: 'pending', pairing_code_expires_at: '2026-08-09T00:00:00.000Z' }, 'Pairing expired'],
    [{ status: 'rotating', pairing_code_expires_at: null }, 'Rotation in progress'],
    [{ status: 'revoked', revoked_at: '2026-08-10T01:00:00.000Z' }, 'Revoked'],
    [{ status: 'active', team_id: 'missing-team', revoked_at: null }, 'Team scope unavailable'],
  ]

  for (const [fault, label] of cases) {
    connection = { ...baseConnection, ...fault }
    await page.goto(connectionsUrl)
    const diagnostic = page.getByTestId('connection-diagnostic')
    await expect(diagnostic).toContainText(label)
    await expect(diagnostic).toContainText('fingerprint wm_safe1234')
    await expect(diagnostic).toContainText('session and installation tokens stay server-side')
    await expect(diagnostic).not.toContainText('session-secret')
    await expect(diagnostic).not.toContainText('installation-secret')
  }

  connection = { ...baseConnection }
  await page.goto(connectionsUrl)
  await page.locator('.config-details summary').click()
  const configRegion = page.getByRole('region', { name: 'Configuration preview: Codex MCP server configuration' })
  await expect(configRegion).toHaveAttribute('tabindex', '0')
  await configRegion.focus()
  const startScroll = await configRegion.evaluate(element => element.scrollLeft)
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(250)
  await page.keyboard.up('ArrowRight')
  await expect.poll(() => configRegion.evaluate(element => element.scrollLeft)).toBeGreaterThan(startScroll)

  connection = { ...baseConnection, client_type: 'generic_mcp', name: 'Generic gateway' }
  await page.goto(connectionsUrl)
  await expect(page.getByTestId('connection-diagnostic').locator('.eyebrow')).toHaveText('Generic MCP')

  await page.getByRole('button', { name: 'New connection' }).click()
  const clientSelect = page.getByLabel('Client')
  await expect(clientSelect.locator('option')).toHaveText(['Codex', 'OpenCode', 'Pi', 'Generic MCP'])
})

test('classifies administrator MCP discovery failure without rendering raw public detail', async ({ page }) => {
  const unsafeDetailCanary = ['unsafe', 'detail', 'q7'].join('-')
  await page.route(`${apiUrl}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/.well-known/workmesh-agent') return body({ error: { code: 'SERVICE_UNAVAILABLE', message: unsafeDetailCanary, correlationId: 'fault-e2e' } }, 503)
    if (path === '/api/v1/info') return body({ preferredClientProfileVersion: '1.0', supportedClientProfileVersions: ['1.0'], mcpVersion: '1.29.0' })
    if (path === '/api/v1/features') return body({ features: [{ key: 'WORKMESH_BETA_COORDINATION_MCP', enabled: true }] })
    if (path === '/api/v1/auth/me') return body({ actor: { id: 'human-fault', display_name: 'Rex', workspace_id: 'workspace-fault', workspace_role: 'admin' }, csrfToken: 'fault-csrf' })
    if (path === '/api/v1/teams') return body({ items: [{ id: 'team-fault', name: 'Platform', key: 'PLAT' }], nextCursor: null })
    if (path === '/api/v1/actors/humans') return body({ items: [{ id: 'human-fault', display_name: 'Rex' }], nextCursor: null })
    if (path === '/api/v1/agents' || path === '/api/v1/agent-sessions' || path === '/api/v1/approvals') return body({ items: [], nextCursor: null })
    if (path === '/api/v1/agent-connections') return body({ items: [baseConnection], nextCursor: null })
    if (path === '/api/v1/events/stream') return route.fulfill({ status: 204, headers })
    return body({ error: { code: 'NOT_FOUND', message: 'Unexpected route.', correlationId: 'fault-e2e' } }, 404)
  })

  await page.goto(connectionsUrl)
  const diagnostic = page.getByTestId('mcp-onboarding-diagnostic')
  await expect(diagnostic.locator('[role="alert"]')).toHaveAttribute('data-onboarding-state', 'discovery_unavailable')
  await expect(diagnostic).toContainText('Discovery unavailable')
  expect(await diagnostic.evaluate(element => element.textContent?.includes(['unsafe', 'detail', 'q7'].join('-')) ?? false)).toBe(false)
  expect(await page.evaluate(() => document.body.textContent?.includes(['unsafe', 'detail', 'q7'].join('-')) ?? false)).toBe(false)
})

test('discovers an existing Connection without browser-local state and distinguishes load failure from empty state', async ({ page }) => {
  let failCollection = false
  await page.route(`${apiUrl}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/.well-known/workmesh-agent') return body(discovery)
    if (path === '/api/v1/info') return body({ preferredClientProfileVersion: '1.0', supportedClientProfileVersions: ['1.0'], mcpVersion: '1.29.0' })
    if (path === '/api/v1/features') return body({ features: [{ key: 'WORKMESH_BETA_COORDINATION_MCP', enabled: true }] })
    if (path === '/mcp') return body({ error: { code: 'UNAUTHORIZED', message: 'credential required', correlationId: 'fault-e2e' } }, 401)
    if (path === '/api/v1/auth/me') return body({ actor: { id: 'human-fault', display_name: 'Rex', workspace_id: 'workspace-fault', workspace_role: 'admin' }, csrfToken: 'fault-csrf' })
    if (path === '/api/v1/teams') return body({ items: [{ id: 'team-fault', name: 'Platform', key: 'PLAT' }], nextCursor: null })
    if (path === '/api/v1/actors/humans') return body({ items: [{ id: 'human-fault', display_name: 'Rex' }], nextCursor: null })
    if (path === '/api/v1/agents' || path === '/api/v1/agent-sessions' || path === '/api/v1/approvals') return body({ items: [], nextCursor: null })
    if (path === '/api/v1/agent-connections') return failCollection
      ? body({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Connection catalog unavailable', correlationId: 'fault-e2e' } }, 503)
      : body({ items: [baseConnection], nextCursor: null })
    if (path === '/api/v1/events/stream') return route.fulfill({ status: 204, headers })
    return body({ error: { code: 'NOT_FOUND', message: `Unexpected ${path}`, correlationId: 'fault-e2e' } }, 404)
  })

  await page.goto(connectionsUrl)
  await expect(page.getByTestId('connection-diagnostic')).toContainText('Codex coordinator')
  await expect(page.getByText('No Connections yet')).toHaveCount(0)

  failCollection = true
  await page.reload()
  await expect(page.locator('.connection-load-error')).toContainText('Unable to load Connections')
  await expect(page.getByText('No Connections yet')).toHaveCount(0)
})
