import { expect, test, type Page, type Route } from '@playwright/test'
import type { RecoveryItem } from '@workmesh/contracts'

test.use({ storageState: { cookies: [], origins: [] } })

const id = (suffix: number): string =>
  `20000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const timestamp = '2026-08-27T08:00:00.000Z'
const item: RecoveryItem = {
  projectionVersion: 1,
  id: `v1:session_failed:${id(1)}`,
  condition: 'session_failed',
  lifecycle: 'active',
  severity: 'high',
  title: 'Agent Session failed',
  summary: 'Validation worker exited after three attempts.',
  happenedAt: timestamp,
  scope: {
    workspaceId: id(2), teamId: id(3), projectId: id(4), projectName: 'Runtime Reliability',
    workItemId: id(5), workItemTitle: 'Recover execution', sessionId: id(6), planStepId: null,
    responsibleHuman: { id: id(7), kind: 'human', displayName: 'Roadmap Human' },
  },
  source: { type: 'agent_session', id: id(1), status: 'failed', revision: 4, eventCursor: '91', updatedAt: timestamp },
  freshness: { state: 'current', observedAt: timestamp, sourceUpdatedAt: timestamp },
  executor: {
    state: 'terminal_only_assignment', active: false,
    agent: { id: id(8), kind: 'agent', displayName: 'Runtime Agent' }, delegationId: id(9),
    delegationStatus: 'active', sessionState: 'failed', connectionStatus: 'active',
  },
  lease: { id: null, status: 'none', version: null, expiresAt: null },
  authority: { sessionState: 'failed', delegationStatus: 'active', connectionStatus: 'active', currentStateRequired: true },
  preservedWork: {
    artifacts: [{ type: 'commit', id: id(10), title: 'Commit abc123', status: 'produced' }],
    messages: 3, contextSnapshotId: id(11), uncommitted: 'unknown',
    uncommittedExplanation: 'Only durable facts are preserved; runtime work is unknown.',
  },
  attempts: { used: 2, limit: 3, remaining: 1, circuitBreaker: 'closed' },
  downstreamImpact: 'Dependent work remains blocked until a governed replacement starts.',
  recommendedActionId: 'retry',
  actions: [
    { id: 'retry', kind: 'retry', label: 'Preview and Retry', method: 'POST', path: `/api/v1/agent-sessions/${id(6)}/retry`, consequencePreviewPath: `/api/v1/agent-sessions/${id(6)}/control-preview`, dangerous: true, requiresCurrent: true, requiredCapabilities: ['work:write'], requiresApproval: false, requiresReason: true, tradeoff: 'Creates a distinct Session.' },
    { id: 'open_run', kind: 'open_run', label: 'Open Run details', method: 'GET', path: `/agent-sessions/${id(6)}`, consequencePreviewPath: null, dangerous: false, requiresCurrent: false, requiredCapabilities: ['work:read'], requiresApproval: false, requiresReason: false, tradeoff: 'Read only.' },
  ],
  technicalDetailsPath: `/api/v1/recovery-items/v1:session_failed:${id(1)}`,
}

const fulfill = (route: Route, body: unknown) => route.fulfill({
  body: JSON.stringify(body), contentType: 'application/json',
})

async function installRecoveryRoutes(page: Page): Promise<void> {
  await page.route('**/api/v1/recovery-items**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === `/api/v1/recovery-items/${item.id}`) return fulfill(route, item)
    if (url.pathname === '/api/v1/recovery-items') return fulfill(route, {
      items: url.searchParams.get('lifecycle') === 'resolved' ? [] : [item],
      nextCursor: null,
      freshness: item.freshness,
    })
    return route.fallback()
  })
}

test('Recovery Center preserves evidence, governed actions, canonical state, and responsive layout', async ({ page, context }, testInfo) => {
  const status = await context.request.get('http://127.0.0.1:3101/api/v1/install-status')
  const installed = (await status.json() as { installed: boolean }).installed
  if (installed) {
    const login = await context.request.post('http://127.0.0.1:3101/api/v1/auth/login', {
      data: { email: 'alice@example.test', password: 'password-acceptance' },
      headers: { 'idempotency-key': `recovery-login-${Date.now()}`, origin: 'http://127.0.0.1:3100' },
    })
    expect(login.ok()).toBeTruthy()
  } else {
    await page.goto('/install')
    const install = page.getByTestId('install-form')
    await install.getByPlaceholder('部署启动令牌').fill(process.env.WORKMESH_BOOTSTRAP_TOKEN!)
    await install.getByPlaceholder('My Workspace', { exact: true }).fill('Recovery acceptance workspace')
    await install.getByPlaceholder('workspace-slug').fill('recovery-acceptance-workspace')
    await install.getByPlaceholder('管理员姓名').fill('Alice')
    await install.getByPlaceholder('name@example.com').fill('alice@example.test')
    await install.getByPlaceholder('至少 12 个字符').fill('password-acceptance')
    await install.getByTestId('install-submit').click()
    await expect(page.getByRole('heading', { name: 'WorkMesh' })).toBeVisible()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await page.waitForTimeout(1_000)
  }
  await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: 'http://127.0.0.1:3100' }])
  await installRecoveryRoutes(page)
  await page.goto('/?view=recovery&recoveryLifecycle=active')

  const center = page.getByTestId('recovery-center')
  await expect(center.getByRole('heading', { name: 'Recovery Center' })).toBeVisible()
  await center.getByRole('button', { name: /Agent Session failed/ }).click()
  await expect(page).toHaveURL(new RegExp('recoveryItem=v1%3Asession_failed'))
  await expect(center.getByText(/Terminal-only assignment/).first()).toBeVisible()
  await expect(center.getByText(/Commit abc123/)).toBeVisible()
  await expect(center.getByText(/runtime work is unknown/)).toBeVisible()
  await expect(center.getByRole('button', { name: 'Preview and Retry' })).toBeEnabled()

  await page.reload()
  await expect(center.getByRole('heading', { name: 'Agent Session failed' })).toBeVisible()
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width)
  }
  await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath('recovery-center.png') })
})
