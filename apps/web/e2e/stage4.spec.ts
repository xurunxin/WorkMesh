import { expect, test } from '@playwright/test'

const apiUrl = 'http://127.0.0.1:3101'
const headers = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
}

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
    if (path === '/api/v1/cycles') return body([{
      id: 'cycle-1',
      name: 'Cycle 12',
      state: 'current',
      starts_at: '2026-07-20T00:00:00.000Z',
      ends_at: '2026-08-03T00:00:00.000Z',
      total_items: 8,
      completed_items: 5,
    }])
    if (path === '/api/v1/initiatives') return body([{
      id: 'initiative-1',
      name: 'Reliable agent operations',
      status: 'active',
      priority: 'high',
      health: 'at_risk',
    }])
    if (path === '/api/v1/automation-rules' && method === 'GET') return body([{
      id: 'rule-1',
      name: 'Triage new work',
      state: ruleState,
      revision: ruleState === 'active' ? 1 : 2,
      version: 3,
      trigger: { type: 'event' },
    }])
    if (path === '/api/v1/automation-rules/rule-1/dry-run' && method === 'POST') {
      dryRuns += 1
      return body({ id: `dry-run-${dryRuns}`, dry_run: true, status: 'dry_run', effectCount: 0 })
    }
    if (path === '/api/v1/automation-rules/rule-1/state' && method === 'POST') {
      expect(route.request().headers()['if-match']).toBe('"revision-1"')
      ruleState = 'paused'
      return body({ id: 'rule-1', state: ruleState, revision: 2 })
    }
    if (path === '/api/v1/loops') return body([{
      id: 'loop-1',
      name: 'Scheduled triage',
      state: 'active',
      revision: 1,
      next_run_at: '2026-07-27T01:00:00.000Z',
      no_overlap: true,
    }])
    if (path === '/api/v1/automation-runs') return body([{
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
    }])
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
    if (path === '/api/v1/templates') return body([{
      id: 'template-1',
      kind: 'agent_run',
      name: 'Triage playbook',
      status: 'active',
      version: 4,
    }])
    return body({ error: { message: `Unexpected ${method} ${path}` } }, 404)
  })

  await page.goto('/operations')
  await expect(page.getByRole('heading', { name: 'Planning & Operations' })).toBeVisible()
  await expect(page.getByTestId('cycles-panel')).toContainText('Cycle 12')
  await expect(page.getByTestId('initiatives-panel')).toContainText('at_risk')
  await expect(page.getByTestId('loops-panel')).toContainText('No overlap')
  await expect(page.getByTestId('runs-panel')).toContainText('succeeded')
  await expect(page.getByTestId('templates-panel')).toContainText('Triage playbook')
  await expect(page.getByLabel('Usage and cost')).toContainText('Never treated as zero.')

  await page.getByTestId('automation-panel').getByRole('button', { name: 'Dry run' }).click()
  await expect.poll(() => dryRuns).toBe(1)
  await page.getByTestId('automation-panel').getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByTestId('automation-panel')).toContainText('paused')
})
