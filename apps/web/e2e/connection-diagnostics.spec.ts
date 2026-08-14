import { expect, test } from '@playwright/test'
import type { AgentConnection } from '../app/lib/agents'

const apiUrl = 'http://127.0.0.1:3101'
const headers = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
}

const baseConnection: AgentConnection = {
  id: 'connection-fault', workspace_id: 'workspace-fault', team_id: 'team-fault',
  agent_actor_id: 'agent-fault', principal_human_actor_id: 'human-fault',
  name: 'Codex coordinator', agent_slug: 'codex-coordinator', client_type: 'codex',
  status: 'active', requested_capabilities: ['work:read'], granted_capabilities: ['work:read'],
  grant_agent_delegate: false, skill_version: '1.0.0', skill_sha256: 'a'.repeat(64),
  credential_fingerprint_prefix: 'wm_safe1234', pairing_code_expires_at: null,
  last_used_at: '2026-08-10T00:00:00.000Z', rotated_at: null, revoked_at: null,
  revision: 1, redacted_token: true, created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z',
}

test('diagnoses expired, rotating, revoked, and mis-scoped Connections without rendering credentials', async ({ page }) => {
  let connection = { ...baseConnection }
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const path = new URL(route.request().url()).pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
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
    await page.goto('/agents')
    const diagnostic = page.getByTestId('connection-diagnostic')
    await expect(diagnostic).toContainText(label)
    await expect(diagnostic).toContainText('fingerprint wm_safe1234')
    await expect(diagnostic).toContainText('session and installation tokens stay server-side')
    await expect(diagnostic).not.toContainText('session-secret')
    await expect(diagnostic).not.toContainText('installation-secret')
  }
})

test('discovers an existing Connection without browser-local state and distinguishes load failure from empty state', async ({ page }) => {
  let failCollection = false
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const path = new URL(route.request().url()).pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
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

  await page.goto('/agents')
  await expect(page.getByTestId('connection-diagnostic')).toContainText('Codex coordinator')
  await expect(page.getByText('No Connections yet')).toHaveCount(0)

  failCollection = true
  await page.reload()
  await expect(page.locator('.connection-load-error')).toContainText('Unable to load Connections')
  await expect(page.getByText('No Connections yet')).toHaveCount(0)
})
