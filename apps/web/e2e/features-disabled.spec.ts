import { expect, test } from '@playwright/test'

const apiUrl = 'http://127.0.0.1:3101'
const headers = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
}
const featureKeys = [
  'WORKMESH_BETA_PLANNING', 'WORKMESH_BETA_TEMPLATES', 'WORKMESH_BETA_COSTS',
  'WORKMESH_BETA_GITEA', 'WORKMESH_BETA_OPERATIONS_UI',
  'WORKMESH_EXPERIMENTAL_AUTOMATION', 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS',
  'WORKMESH_EXPERIMENTAL_A2A', 'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS',
  'WORKMESH_EXPERIMENTAL_MULTI_RUNTIME',
]

test('hides default-off Operations without requesting gated endpoints', async ({ page }) => {
  const gatedRequests: string[] = []
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const path = new URL(route.request().url()).pathname
    const body = (payload: unknown) => route.fulfill({ status: 200, headers, body: JSON.stringify(payload) })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/features') return body({
      features: featureKeys.map(key => ({ key, tier: key.includes('EXPERIMENTAL') ? 'experimental' : 'beta', enabled: false })),
    })
    if (path === '/api/v1/info') return body({
      serverVersion: '1.0.0', restApiVersion: '1.0', agentProtocolVersion: '1.0',
      mcpVersion: '1.0.0', a2aUpstreamVersion: '0.3', schemaBaseline: 1, buildSha: null,
    })
    if (path === '/api/v1/install-status') return body({ installed: true })
    if (path === '/api/v1/auth/me') return body({ actor: { id: 'human-1', displayName: 'Alex' }, csrfToken: 'csrf' })
    if (/^\/api\/v1\/(cycles|initiatives|advanced-views|automation-rules|automation-runs|loops|usage-summary|templates)/.test(path)) {
      gatedRequests.push(path)
      return route.abort()
    }
    return body([])
  })

  await page.goto('/')
  await expect(page.getByTestId('view-operations')).toHaveCount(0)
  await page.goto('/operations')
  await expect(page.getByTestId('operations-disabled')).toBeVisible()
  expect(gatedRequests).toEqual([])
})
