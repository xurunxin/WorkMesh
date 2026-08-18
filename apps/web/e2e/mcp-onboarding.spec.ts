import { expect, test } from '@playwright/test'

const webUrl = 'http://127.0.0.1:3100'
const apiUrl = 'http://127.0.0.1:3101'
const headers = {
  'Access-Control-Allow-Origin': webUrl,
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
}

// Task 3 migrated /connect to read copy from `useLocale().connectCopy`.
// The default locale is `zh-CN`, which would change the heading, label,
// and authority note to Chinese. This spec was written against the
// pre-migration English page; pin every navigation to `en` so the
// existing English assertions remain authoritative.
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: 'workmesh_locale', value: 'en', url: webUrl },
  ])
})

test('renders server-derived secret-safe MCP setup for every advertised client', async ({ page }) => {
  await page.route(`${apiUrl}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/.well-known/workmesh-agent') return body({
      protocolVersion: 'v1',
      mcpUrl: `${apiUrl}/mcp`,
      wellKnownUrl: `${apiUrl}/.well-known/workmesh-agent`,
      apiVersion: '1.0',
      supportedClients: ['codex', 'opencode', 'pi', 'generic_mcp'],
      skill: { name: 'workmesh', version: '1.1.0', sha256: 'a'.repeat(64), signature: 'ed25519:test' },
    })
    if (path === '/api/v1/info') return body({
      preferredClientProfileVersion: '1.0', supportedClientProfileVersions: ['1.0'], mcpVersion: '1.29.0',
    })
    if (path === '/mcp') return body({ error: { code: 'UNAUTHORIZED', message: 'credential required', correlationId: 'onboarding-e2e' } }, 401)
    return body({ error: { code: 'NOT_FOUND', message: `Unexpected ${path}`, correlationId: 'onboarding-e2e' } }, 404)
  })

  await page.goto('/connect#one-time-pairing-fragment')
  await expect(page.getByRole('heading', { name: 'Connect an Agent to WorkMesh' })).toBeVisible()
  await expect(page.getByText('Configuration ready')).toBeVisible()
  await expect(page.getByText('workmesh 1.1.0')).toBeVisible()
  const select = page.getByLabel('MCP client')
  for (const client of ['codex', 'opencode', 'pi', 'generic_mcp']) {
    await select.selectOption(client)
    const config = page.locator('.config-preview')
    await expect(config).toContainText('WORKMESH_INSTALLATION_TOKEN')
    await expect(config).not.toContainText('one-time-pairing-fragment')
    await expect(config).not.toContainText('installation-secret')
  }
  await expect(page.getByText('Authority stays server-side.')).toBeVisible()
})

test('fails closed when public discovery is unavailable', async ({ page }) => {
  await page.route(`${apiUrl}/**`, route => route.fulfill({
    status: 503,
    headers,
    body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'offline', correlationId: 'onboarding-e2e' } }),
  }))
  await page.goto('/connect#one-time-pairing-fragment')
  const alert = page.locator('[role="alert"][data-onboarding-state]')
  await expect(alert).toContainText('Discovery unavailable')
  await expect(alert).toContainText('Do not infer endpoints')
})

test('renders the server feature-disabled state without misclassifying discovery', async ({ page }) => {
  await page.route(`${apiUrl}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/info') return route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify({ preferredClientProfileVersion: '1.0', supportedClientProfileVersions: ['1.0'], mcpVersion: '1.29.0' }),
    })
    return route.fulfill({
      status: 403,
      headers,
      body: JSON.stringify({ error: { code: 'FEATURE_DISABLED', message: 'Coordination MCP is disabled', correlationId: 'onboarding-e2e' } }),
    })
  })
  await page.goto('/connect#one-time-pairing-fragment')
  const alert = page.locator('[role="alert"][data-onboarding-state]')
  await expect(alert).toHaveAttribute('data-onboarding-state', 'coordination_feature_disabled')
  await expect(alert).toContainText('Coordination feature disabled')
  await expect(alert).not.toContainText('Discovery unavailable')
})
