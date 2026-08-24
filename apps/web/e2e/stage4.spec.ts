import { expect, test } from '@playwright/test'

const webUrl = 'http://127.0.0.1:3100'
const apiUrl = 'http://127.0.0.1:3101'
const headers = {
  'Access-Control-Allow-Origin': webUrl,
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
}

// Task 5 migrated /operations to read copy from `useLocale().operationsCopy`.
// The default locale is `zh-CN`, which now renders the page heading, panel
// titles, status badges, and metric labels in Chinese. This spec was
// written against the pre-migration English page; pin every test in this
// file to the `en` locale so the existing English assertions remain
// authoritative.
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: 'workmesh_locale', value: 'en', url: webUrl },
  ])
})

test('renders durable Stage 4 operations and invokes real rule controls', async ({ page }) => {
  let dryRuns = 0
  let ruleState: 'active' | 'paused' = 'active'
  await page.addInitScript(() => {
    window.sessionStorage.setItem('workmesh.csrf-token', 'stage4-e2e-csrf')
  })
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const method = route.request().method()
    const body = (payload: unknown, status = 200) =>
      route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/auth/me') return body({
      actor: {
        id: 'human-stage4',
        display_name: 'Stage 4 admin',
        workspace_id: 'workspace-stage4',
        workspace_role: 'admin',
      },
      csrfToken: 'stage4-e2e-csrf',
    })
    if (path === '/api/v1/features') return body({
      features: [
        { key: 'WORKMESH_BETA_PLANNING', tier: 'beta', enabled: true },
        { key: 'WORKMESH_BETA_TEMPLATES', tier: 'beta', enabled: true },
        { key: 'WORKMESH_BETA_COSTS', tier: 'beta', enabled: true },
        { key: 'WORKMESH_BETA_GITEA', tier: 'beta', enabled: false },
        { key: 'WORKMESH_BETA_OPERATIONS_UI', tier: 'beta', enabled: true },
        { key: 'WORKMESH_EXPERIMENTAL_AUTOMATION', tier: 'experimental', enabled: true },
        { key: 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS', tier: 'experimental', enabled: true },
        { key: 'WORKMESH_EXPERIMENTAL_A2A', tier: 'experimental', enabled: false },
        { key: 'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS', tier: 'experimental', enabled: false },
        { key: 'WORKMESH_EXPERIMENTAL_MULTI_RUNTIME', tier: 'experimental', enabled: false },
      ],
    })
    if (path === '/api/v1/info') return body({
      serverVersion: '1.0.0',
      restApiVersion: '1.0',
      agentProtocolVersion: '1.0',
      mcpVersion: '1.0.0',
      a2aUpstreamVersion: '0.3',
      schemaBaseline: 1,
      buildSha: 'stage4-e2e',
    })
    if (path === '/api/v1/cycles') return body({ items: [{
      id: 'cycle-1',
      name: 'Cycle 12',
      state: 'current',
      starts_at: '2026-07-20T00:00:00.000Z',
      ends_at: '2026-08-03T00:00:00.000Z',
      total_items: 8,
      completed_items: 5,
    }], nextCursor: null })
    if (path === '/api/v1/initiatives') return body({ items: [{
      id: 'initiative-1',
      name: 'Reliable agent operations',
      status: 'active',
      priority: 'high',
      health: 'at_risk',
    }], nextCursor: null })
    if (path === '/api/v1/automation-rules' && method === 'GET') return body({ items: [{
      id: 'rule-1',
      name: 'Triage new work',
      state: ruleState,
      revision: ruleState === 'active' ? 1 : 2,
      version: 3,
      trigger: { type: 'event' },
    }], nextCursor: null })
    if (path === '/api/v1/automation-rules/rule-1/dry-run' && method === 'POST') {
      dryRuns += 1
      return body({ id: `dry-run-${dryRuns}`, dry_run: true, status: 'dry_run', effectCount: 0 })
    }
    if (path === '/api/v1/automation-rules/rule-1/state' && method === 'POST') {
      expect(route.request().headers()['if-match']).toBe('"revision-1"')
      ruleState = 'paused'
      return body({ id: 'rule-1', state: ruleState, revision: 2 })
    }
    if (path === '/api/v1/loops') return body({ items: [{
      id: 'loop-1',
      name: 'Scheduled triage',
      state: 'active',
      revision: 1,
      next_run_at: '2026-07-27T01:00:00.000Z',
      no_overlap: true,
    }], nextCursor: null })
    if (path === '/api/v1/automation-runs') return body({ items: [{
      id: 'run-00000001',
      rule_id: null,
      loop_id: 'loop-1',
      session_id: 'session-00000001',
      dry_run: false,
      status: 'succeeded',
      attempt_count: 1,
      max_attempts: 5,
      created_at: '2026-07-26T01:00:00.000Z',
      last_error: null,
    }], nextCursor: null })
    if (path === '/api/v1/usage-summary') return body({
      input_tokens: '1200',
      output_tokens: '300',
      runtime_ms: '45000',
      tool_calls: '7',
      unknown_cost_records: 2,
      currency_buckets: [
        { currency: 'EUR', known_cost_minor: '11', unknown_cost_records: 0 },
        { currency: 'USD', known_cost_minor: '42', unknown_cost_records: 2 },
      ],
    })
    if (path === '/api/v1/templates') return body({ items: [{
      id: 'template-1',
      kind: 'agent_run',
      name: 'Triage playbook',
      status: 'active',
      version: 4,
    }], nextCursor: null })
    return body({ error: { message: `Unexpected ${method} ${path}` } }, 404)
  })

  await page.goto('/operations')
  await expect(page.getByRole('heading', { name: 'Planning & Operations' })).toBeVisible()
  await expect(page.getByTestId('cycles-panel')).toContainText('Cycle 12')
  await expect(page.getByTestId('initiatives-panel')).toContainText('At risk')
  await expect(page.getByTestId('loops-panel')).toContainText('No overlap')
  await expect(page.getByTestId('runs-panel')).toContainText('Succeeded')
  await expect(page.getByTestId('templates-panel')).toContainText('Triage playbook')
  await expect(page.getByRole('region', { name: 'Usage and cost' })).toContainText(
    'Never treated as zero.',
  )

  await page.getByTestId('automation-panel').getByRole('button', { name: 'Dry run' }).click()
  await expect.poll(() => dryRuns).toBe(1)
  await page.getByTestId('automation-panel').getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByTestId('automation-panel')).toContainText('Paused')
})
