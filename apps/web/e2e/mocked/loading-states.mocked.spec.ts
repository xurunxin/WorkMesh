import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const webUrl = 'http://127.0.0.1:3200'
const evidenceRoot = 'D:\\Cache\\Temp\\workmesh-web-ui-evidence-2026-08-23\\task-6.4'
const team = { id: '7d13dccc-2210-44db-b030-76d56db1b998', key: 'GEN', name: 'General', revision: 1 }
const human = { id: '1ea95f79-9388-4418-bdd3-56a72871d70e', display_name: 'Alex Morgan', email: 'alex@workmesh.test' }

type JsonResponse = Readonly<{ body: unknown; status?: number }>
type ResponsePlan = JsonResponse | Promise<JsonResponse>

function responseHeaders(route: Route): Record<string, string> {
  return {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'content-type, if-match, idempotency-key, x-csrf-token',
    'Access-Control-Allow-Methods': 'DELETE, GET, OPTIONS, PATCH, POST',
    'Access-Control-Allow-Origin': route.request().headers()['origin'] ?? webUrl,
    'Content-Type': 'application/json',
  }
}

function baseResponse(url: URL, method: string): JsonResponse | null {
  if (method !== 'GET') return null
  if (url.pathname === '/api/v1/install-status') return { body: { installed: true } }
  if (url.pathname === '/api/v1/auth/me') return {
    body: {
      actor: { ...human, kind: 'human', workspace_id: 'workspace-preview', workspace_role: 'admin' },
      csrfToken: 'loading-state-csrf',
    },
  }
  if (url.pathname === '/api/v1/info') return {
    body: { buildSha: 'loading-state-fixture', schemaBaseline: 24, serverVersion: '1.0.0' },
  }
  if (url.pathname === '/api/v1/features') return allFeatures
  if (url.pathname === '/api/v1/teams') return { body: { items: [team], nextCursor: null } }
  if (url.pathname === `/api/v1/teams/${team.id}/states`) return {
    body: { items: [{ category: 'backlog', color: '#a8a29e', id: 'state-backlog', name: 'Backlog', revision: 1 }], nextCursor: null },
  }
  if (url.pathname === '/api/v1/actors/humans') return { body: { items: [human], nextCursor: null } }
  if (url.pathname === '/api/v1/projects') return { body: { items: [], nextCursor: null } }
  if (url.pathname === '/api/v1/views') return { body: { items: [], nextCursor: null } }
  if (url.pathname === '/api/v1/agent-connections') return { body: { items: [], nextCursor: null } }
  if (url.pathname === '/api/v1/agent-sessions') return { body: { items: [], nextCursor: null } }
  if (url.pathname === '/api/v1/approvals') return { body: { items: [], nextCursor: null } }
  if (url.pathname === '/api/v1/human-attention') return { body: { items: [], nextCursor: null } }
  if (url.pathname === '/api/v1/events/stream') return { body: null, status: 204 }
  return null
}

function deferredResponse() {
  let resolve: (response: JsonResponse) => void = () => undefined
  const promise = new Promise<JsonResponse>(done => { resolve = done })
  return { promise, resolve }
}

type GeometrySelectors = Readonly<{
  localOverflowSelector?: string
  panelSelector?: string
}>

async function measureSkeleton(page: Page, selector: string, selectors: GeometrySelectors = {}) {
  return page.locator(selector).evaluate((element, options) => {
    const rect = (node: Element) => {
      const value = node.getBoundingClientRect()
      return { bottom: value.bottom, height: value.height, left: value.left, right: value.right, top: value.top, width: value.width }
    }
    const contentRect = (node: Element) => {
      const value = node.getBoundingClientRect()
      const nodeStyle = getComputedStyle(node)
      const leftInset = Number.parseFloat(nodeStyle.borderLeftWidth) + Number.parseFloat(nodeStyle.paddingLeft)
      const rightInset = Number.parseFloat(nodeStyle.borderRightWidth) + Number.parseFloat(nodeStyle.paddingRight)
      const topInset = Number.parseFloat(nodeStyle.borderTopWidth) + Number.parseFloat(nodeStyle.paddingTop)
      const bottomInset = Number.parseFloat(nodeStyle.borderBottomWidth) + Number.parseFloat(nodeStyle.paddingBottom)
      return {
        bottom: value.bottom - bottomInset,
        height: value.height - topInset - bottomInset,
        left: value.left + leftInset,
        right: value.right - rightInset,
        top: value.top + topInset,
        width: value.width - leftInset - rightInset,
      }
    }
    const cells = Array.from(element.querySelectorAll<HTMLElement>('.skeleton-list-cell'))
    const cellRects = cells.map(rect)
    const lefts: number[] = []
    for (const cell of cellRects)
      if (!lefts.some(left => Math.abs(left - cell.left) <= 0.5)) lefts.push(cell.left)
    const panel = (options.panelSelector ? element.closest<HTMLElement>(options.panelSelector) : null)
      ?? element.closest<HTMLElement>('.work-surfaces, .settings-grid, .operations-tab, .surface-panel, .settings-card, .operations-metrics')
      ?? element.parentElement
      ?? element
    const explicitLocalOverflow = options.localOverflowSelector
      ? element.closest<HTMLElement>(options.localOverflowSelector)
      : null
    const localOverflow = explicitLocalOverflow
      ?? (element.scrollWidth > element.clientWidth ? element as HTMLElement : element.closest<HTMLElement>('.work-surface-board-loading'))
    const main = document.querySelector<HTMLElement>('#workmesh-main') ?? document.querySelector<HTMLElement>('main') ?? panel
    const style = getComputedStyle(element)
    return {
      busyOwners: element.querySelectorAll('[aria-busy="true"]').length + (element.getAttribute('aria-busy') === 'true' ? 1 : 0),
      cellMaxWidths: cells.map(cell => getComputedStyle(cell).maxWidth),
      cells: cellRects,
      columns: lefts.length,
      document: { clientWidth: document.documentElement.clientWidth, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      focusableCount: element.querySelectorAll('a[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])').length,
      gap: Number.parseFloat(style.columnGap),
      main: rect(main),
      localOverflow: localOverflow ? { ...rect(localOverflow), clientWidth: localOverflow.clientWidth, scrollWidth: localOverflow.scrollWidth } : null,
      panel: contentRect(panel),
      root: rect(element),
      viewport: { height: innerHeight, width: innerWidth },
    }
  }, selectors)
}

async function measureResolvedContainment(page: Page, localSelector?: string) {
  return page.evaluate(selector => {
    const local = selector ? document.querySelector<HTMLElement>(selector) : null
    const localRect = local?.getBoundingClientRect()
    return {
      document: { clientWidth: document.documentElement.clientWidth, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      local: local && localRect ? {
        clientWidth: local.clientWidth,
        left: localRect.left,
        right: localRect.right,
        scrollWidth: local.scrollWidth,
        width: localRect.width,
      } : null,
    }
  }, localSelector)
}

async function measureRects(page: Page, selector: string) {
  return page.locator(selector).evaluateAll(elements => elements.map(element => {
    const value = element.getBoundingClientRect()
    return { bottom: value.bottom, height: value.height, left: value.left, right: value.right, top: value.top, width: value.width }
  }))
}

async function measureResolvedGrid(page: Page, selector: string, itemSelector: string) {
  return page.locator(selector).evaluate((element, childSelector) => {
    const rect = (node: Element) => {
      const value = node.getBoundingClientRect()
      return { bottom: value.bottom, height: value.height, left: value.left, right: value.right, top: value.top, width: value.width }
    }
    const items = Array.from(element.querySelectorAll<HTMLElement>(childSelector))
    const itemRects = items.map(rect)
    const lefts: number[] = []
    for (const item of itemRects)
      if (!lefts.some(left => Math.abs(left - item.left) <= 0.5)) lefts.push(item.left)
    const style = getComputedStyle(element)
    return {
      columns: lefts.length,
      document: { clientWidth: document.documentElement.clientWidth, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      gap: Number.parseFloat(style.columnGap),
      items: itemRects,
      root: rect(element),
    }
  }, itemSelector)
}

async function persistEvidence(page: Page, testInfo: TestInfo, name: string, payload: unknown): Promise<void> {
  await mkdir(evidenceRoot, { recursive: true })
  const jsonPath = join(evidenceRoot, `${name}.json`)
  const screenshotPath = join(evidenceRoot, `${name}.png`)
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8')
  await page.screenshot({ path: screenshotPath })
  await testInfo.attach(name, { path: jsonPath, contentType: 'application/json' })
  await testInfo.attach(`${name}-screenshot`, { path: screenshotPath, contentType: 'image/png' })
}

function expectContainedSkeleton(
  geometry: Awaited<ReturnType<typeof measureSkeleton>>,
  expectedColumns: number,
  allowLocalOverflow = false,
): void {
  expect(geometry.columns).toBe(expectedColumns)
  expect(geometry.document.overflow).toBe(0)
  expect(geometry.focusableCount).toBe(0)
  expect(geometry.cellMaxWidths.every(value => value === 'none')).toBe(true)
  expect(geometry.root.left).toBeGreaterThanOrEqual(geometry.panel.left - 0.5)
  if (allowLocalOverflow) {
    expect(geometry.localOverflow).not.toBeNull()
    expect(geometry.localOverflow!.left).toBeGreaterThanOrEqual(geometry.panel.left - 0.5)
    expect(geometry.localOverflow!.right).toBeLessThanOrEqual(geometry.panel.right + 0.5)
    expect(geometry.localOverflow!.scrollWidth).toBeGreaterThan(geometry.localOverflow!.clientWidth)
  } else expect(geometry.root.right).toBeLessThanOrEqual(geometry.panel.right + 0.5)
  expect(geometry.root.width / geometry.panel.width).toBeGreaterThanOrEqual(0.98)
}

class RouteScenarios {
  readonly requests: string[] = []
  readonly unexpected: string[] = []
  private readonly plans = new Map<string, ResponsePlan>()

  set(path: string, plan: ResponsePlan): void {
    this.plans.set(path, plan)
  }

  setRequest(method: string, path: string, plan: ResponsePlan): void {
    this.plans.set(`${method.toUpperCase()} ${path}`, plan)
  }

  async install(page: Page): Promise<void> {
    await page.route('**/api/v1/**', async (route: Route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ headers: responseHeaders(route), status: 204 })
        return
      }
      const url = new URL(request.url())
      const key = `${url.pathname}${url.search}`
      this.requests.push(key)
      const plan = this.plans.get(`${request.method()} ${key}`)
        ?? this.plans.get(`${request.method()} ${url.pathname}`)
        ?? this.plans.get(key)
        ?? this.plans.get(url.pathname)
      const response = plan ? await plan : baseResponse(url, request.method())
      if (!response) {
        const unexpected = `${request.method()} ${key}`
        this.unexpected.push(unexpected)
        await route.fulfill({
          body: JSON.stringify({ error: { code: 'UNEXPECTED_MOCK_REQUEST', correlationId: 'loading-state-fixture', message: 'Unexpected mocked request.' } }),
          headers: responseHeaders(route),
          status: 500,
        })
        return
      }
      await route.fulfill({
        body: response.status === 204 ? undefined : JSON.stringify(response.body),
        headers: responseHeaders(route),
        status: response.status ?? 200,
      })
    })
  }

  async waitFor(path: string, count = 1): Promise<void> {
    await expect.poll(() => this.requests.filter(request => request === path).length).toBeGreaterThanOrEqual(count)
  }
}

const canonicalFeatures = [
  { key: 'WORKMESH_BETA_PLANNING', tier: 'beta' },
  { key: 'WORKMESH_BETA_TEMPLATES', tier: 'beta' },
  { key: 'WORKMESH_BETA_COSTS', tier: 'beta' },
  { key: 'WORKMESH_BETA_GITEA', tier: 'beta' },
  { key: 'WORKMESH_BETA_OPERATIONS_UI', tier: 'beta' },
  { key: 'WORKMESH_BETA_COORDINATION_MCP', tier: 'beta' },
  { key: 'WORKMESH_EXPERIMENTAL_AUTOMATION', tier: 'experimental' },
  { key: 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS', tier: 'experimental' },
  { key: 'WORKMESH_EXPERIMENTAL_A2A', tier: 'experimental' },
  { key: 'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS', tier: 'experimental' },
  { key: 'WORKMESH_EXPERIMENTAL_MULTI_RUNTIME', tier: 'experimental' },
] as const

const allFeatures = {
  body: { features: canonicalFeatures.map(feature => ({ ...feature, enabled: true })) },
} satisfies JsonResponse
const usage = {
  body: {
    currency_buckets: [],
    input_tokens: '1200',
    output_tokens: '300',
    runtime_ms: '45000',
    tool_calls: '7',
    unknown_cost_records: 0,
  },
} satisfies JsonResponse
const collectionPayloads: Readonly<Record<string, JsonResponse>> = {
  '/api/v1/cycles': { body: { items: [], nextCursor: null } },
  '/api/v1/initiatives': { body: { items: [], nextCursor: null } },
  '/api/v1/automation-rules': { body: { items: [{ id: 'rule-loading-matrix', name: 'Retained browser rule', revision: 1, state: 'active', trigger: { type: 'manual' }, version: 1 }], nextCursor: null } },
  '/api/v1/loops': { body: { items: [], nextCursor: null } },
  '/api/v1/automation-runs': { body: { items: [], nextCursor: null } },
  '/api/v1/templates': { body: { items: [], nextCursor: null } },
}

const browserWorkItem = {
  description: null,
  due_date: null,
  id: 'work-loading-matrix',
  labels: [],
  number: 64,
  priority: 'high',
  project_id: null,
  responsible_human_actor_id: human.id,
  revision: 3,
  status_category: 'backlog',
  status_id: 'state-backlog',
  status_name: 'Backlog',
  team_id: team.id,
  team_key: team.key,
  title: 'Retained loading matrix item',
}

const browserAgent = {
  actor_id: 'actor-agent-loading-matrix',
  approved_capabilities: ['work:read'],
  description: 'Exercises independent Agent registry loading authority.',
  heartbeat_interval_seconds: 30,
  id: 'agent-loading-matrix',
  is_active: true,
  max_concurrency: 1,
  name: 'Loading Matrix Agent',
  provider: 'openai',
  requested_capabilities: ['work:read'],
  revision: 1,
  skills: ['frontend'],
  slug: 'loading-matrix-agent',
  supported_protocols: ['native_http'],
  team_access: [],
  version: '1.0.0',
  workspace_id: 'workspace-preview',
}

const browserAgents = Array.from({ length: 4 }, (_, index) => ({
  ...browserAgent,
  actor_id: `actor-agent-loading-${index + 1}`,
  id: `agent-loading-${index + 1}`,
  name: `Loading Matrix Agent ${index + 1}`,
  slug: `loading-matrix-agent-${index + 1}`,
}))

const browserSessions = Array.from({ length: 4 }, (_, index) => ({
  agent_actor_id: browserAgents[index]!.actor_id,
  agent_id: browserAgents[index]!.id,
  budget: {},
  created_at: '2026-08-23T00:00:00.000Z',
  current_plan_version_id: null,
  delegation_id: `delegation-loading-${index + 1}`,
  error_code: null,
  error_summary: null,
  id: `session-loading-${index + 1}`,
  last_heartbeat_at: '2026-08-23T00:05:00.000Z',
  principal_human_actor_id: human.id,
  revision: 1,
  state: 'executing',
  state_reason: null,
  stop_requested_at: null,
  updated_at: '2026-08-23T00:05:00.000Z',
  work_item_id: null,
}))

const browserConnections = Array.from({ length: 4 }, (_, index) => ({
  agent_actor_id: browserAgents[index]!.actor_id,
  agent_slug: browserAgents[index]!.slug,
  client_type: 'codex',
  created_at: '2026-08-23T00:00:00.000Z',
  credential_fingerprint_prefix: null,
  grant_agent_delegate: false,
  granted_capabilities: ['work:read'],
  id: `connection-loading-${index + 1}`,
  last_used_at: null,
  name: `Loading Connection ${index + 1}`,
  pairing_code_expires_at: null,
  principal_human_actor_id: human.id,
  redacted_token: true,
  requested_capabilities: ['work:read'],
  revision: 1,
  revoked_at: null,
  rotated_at: null,
  skill_sha256: null,
  skill_version: null,
  status: 'active',
  team_id: team.id,
  updated_at: '2026-08-23T00:00:00.000Z',
  workspace_id: 'workspace-preview',
}))

const browserApproval = {
  action_name: 'Review loading authority',
  approval_type: 'merge_pull_request',
  created_at: '2026-08-23T00:00:00.000Z',
  expires_at: '2026-08-24T00:00:00.000Z',
  id: 'approval-loading-matrix',
  rationale_summary: 'Keeps pending approval authority independent.',
  revision: 1,
  risk_level: 'medium',
  session_id: 'session-loading-matrix',
  status: 'pending',
}

const workflowStates = [
  { category: 'backlog', color: '#a8a29e', id: 'state-backlog', name: 'Backlog', revision: 1 },
  { category: 'planned', color: '#7c3aed', id: 'state-planned', name: 'Planned', revision: 1 },
  { category: 'started', color: '#2563eb', id: 'state-started', name: 'In progress', revision: 1 },
  { category: 'completed', color: '#16a34a', id: 'state-completed', name: 'Completed', revision: 1 },
  { category: 'canceled', color: '#dc2626', id: 'state-canceled', name: 'Canceled', revision: 1 },
] as const

test.describe('Task 6.4 Home loading authority', () => {
  test.use({ viewport: { height: 900, width: 1440 } })

  test('keeps one initial owner and isolates a late Work Item scope response', async ({ page }) => {
    const routes = new RouteScenarios()
    await routes.install(page)
    await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])

    const teamsPending = deferredResponse()
    const workItemsPending = deferredResponse()
    routes.set('/api/v1/teams', teamsPending.promise)
    routes.set('/api/v1/work-items', workItemsPending.promise)
    await page.goto('/?view=my-work&layout=list', { waitUntil: 'domcontentloaded' })

    const content = page.locator('.content')
    await expect(content.locator('.skeleton-list')).toHaveCount(1)
    await expect(content.locator('[aria-busy="true"]')).toHaveCount(1)
    await expect(content.locator('.skeleton-list [tabindex], .skeleton-list button, .skeleton-list a, .skeleton-list input, .skeleton-list select')).toHaveCount(0)
    await expect(page.getByRole('option', { name: 'Loading Team' })).toHaveCount(1)
    await expect(page.getByRole('option', { name: 'No Team' })).toHaveCount(0)

    const teamsResponse = { body: { items: [team], nextCursor: null } } satisfies JsonResponse
    routes.set('/api/v1/teams', teamsResponse)
    teamsPending.resolve(teamsResponse)
    const workSurfaces = page.getByTestId('work-surfaces')
    await expect(workSurfaces.locator('.skeleton-list')).toBeVisible()
    await expect(workSurfaces).not.toHaveAttribute('aria-busy')
    await expect(workSurfaces.locator('[aria-busy="true"]')).toHaveCount(1)

    const initialItems = { body: { items: [browserWorkItem], nextCursor: null } } satisfies JsonResponse
    routes.set('/api/v1/work-items', initialItems)
    workItemsPending.resolve(initialItems)
    const retainedTitle = page.getByRole('button', { name: /Retained loading matrix item/ })
    await expect(retainedTitle).toBeVisible()

    const search = page.locator('[data-hotkey-filter="true"]')
    const oldPending = deferredResponse()
    const oldPath = `/api/v1/work-items?teamId=${team.id}&search=old-scope&limit=100`
    routes.set(oldPath, oldPending.promise)
    await search.fill('old-scope')
    await routes.waitFor(oldPath)
    await expect(retainedTitle).toHaveCount(0)
    await expect(workSurfaces.locator('.skeleton-list')).toBeVisible()

    const newItem = { ...browserWorkItem, id: 'work-new-scope', number: 65, title: 'New scope authority item' }
    const newPath = `/api/v1/work-items?teamId=${team.id}&search=new-scope&limit=100`
    routes.set(newPath, { body: { items: [newItem], nextCursor: null } })
    await search.fill('new-scope')
    await routes.waitFor(newPath)
    const newTitle = page.getByRole('button', { name: 'New scope authority item' })
    await expect(newTitle).toBeVisible()

    oldPending.resolve({ body: { items: [{ ...browserWorkItem, id: 'work-late-scope', title: 'Late stale scope item' }], nextCursor: null } })
    await page.waitForTimeout(100)
    await expect(newTitle).toBeVisible()
    await expect(page.getByText('Late stale scope item')).toHaveCount(0)
    expect(routes.unexpected).toEqual([])
  })

  test('distinguishes initial durable failure, real Team empty, and null downstream paths', async ({ page }) => {
    const routes = new RouteScenarios()
    await routes.install(page)
    await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])
    const teamsPath = '/api/v1/teams?limit=100'
    routes.setRequest('GET', teamsPath, {
      body: { error: { code: 'TEMPORARY_UNAVAILABLE', correlationId: 'safe-team-initial', message: 'Unable to load Team.' } },
      status: 500,
    })
    await page.goto('/?view=my-work', { waitUntil: 'domcontentloaded' })
    const content = page.locator('.content')
    await expect(content.getByRole('alert')).toBeVisible()
    await expect(content.locator('.skeleton-list')).toHaveCount(0)
    await expect(page.getByTestId('work-surfaces')).toHaveCount(0)
    await expect(page.getByText('safe-team-initial')).toHaveCount(0)

    routes.setRequest('GET', teamsPath, { body: { items: [], nextCursor: null } })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(content.locator('.empty')).toContainText('No team')
    await expect(content.getByRole('alert')).toHaveCount(0)
    await expect(content.locator('.skeleton-list')).toHaveCount(0)
    await expect(page.getByTestId('work-surfaces')).toHaveCount(0)
    expect(routes.requests.some(request => request.startsWith('/api/v1/work-items'))).toBe(false)
    expect(routes.requests.some(request => request.includes('/states'))).toBe(false)

    await page.goto('/settings?tab=workspace', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.settings-loading-skeleton')).toHaveCount(0)
    await expect(page.getByRole('option', { name: /No team/i })).toHaveCount(1)
    await expect(page.locator('[aria-labelledby="workflow-settings-heading"] .skeleton-list')).toHaveCount(0)
    expect(routes.requests.some(request => request.includes('/states'))).toBe(false)
    expect(routes.unexpected).toEqual([])
  })
})

test.describe('Task 6.4 Agents loading authority', () => {
  test.use({ viewport: { height: 900, width: 1440 } })

  test('keeps Registry authority and focus independent through a failed refresh', async ({ page }) => {
    const routes = new RouteScenarios()
    await routes.install(page)
    await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])

    const agentsPending = deferredResponse()
    routes.set('/api/v1/agents', agentsPending.promise)
    await page.goto('/agents?tab=agents', { waitUntil: 'domcontentloaded' })

    const registry = page.locator('.agent-registry')
    await expect(registry.locator('.skeleton-list')).toBeVisible()
    await expect(registry).not.toHaveAttribute('aria-busy')
    await expect(registry.locator('[aria-busy="true"]')).toHaveCount(1)
    await expect(registry.locator('.skeleton-list button, .skeleton-list a, .skeleton-list input, .skeleton-list [tabindex]')).toHaveCount(0)

    const agentsResponse = { body: { items: [browserAgent], nextCursor: null } } satisfies JsonResponse
    routes.set('/api/v1/agents', agentsResponse)
    agentsPending.resolve(agentsResponse)
    const agentLink = page.locator('[data-agent-roving-link="true"]')
    await expect(agentLink).toHaveCount(1)
    await agentLink.focus()
    await agentLink.evaluate(element => { element.dataset.loadingIdentity = 'retained-agent-link' })

    const refreshPending = deferredResponse()
    const agentsPath = '/api/v1/agents?limit=100'
    const priorRequests = routes.requests.filter(request => request === agentsPath).length
    routes.set(agentsPath, refreshPending.promise)
    await page.getByRole('button', { name: 'Refresh', exact: true }).evaluate((button: HTMLButtonElement) => button.click())
    await routes.waitFor(agentsPath, priorRequests + 1)
    await expect(registry).toHaveAttribute('aria-busy', 'true')
    await expect(agentLink).toHaveAttribute('data-loading-identity', 'retained-agent-link')
    await expect(agentLink).toBeFocused()

    routes.set(agentsPath, agentsResponse)
    refreshPending.resolve({
      body: { error: { code: 'TEMPORARY_UNAVAILABLE', correlationId: 'safe-agent-refresh', message: 'Please retry.' } },
      status: 500,
    })
    await expect(registry).not.toHaveAttribute('aria-busy')
    await expect(agentLink).toHaveAttribute('data-loading-identity', 'retained-agent-link')
    await expect(agentLink).toBeFocused()
    await expect(page.getByText('Loading Matrix Agent')).toBeVisible()
    await expect(page.getByText('safe-agent-refresh')).toHaveCount(0)
    expect(routes.unexpected).toEqual([])
  })
})

test.describe('Task 6.4 Agent secondary surfaces', () => {
  test.use({ viewport: { height: 900, width: 1440 } })

  test('owns Sessions, Diagnostics, Connections and Approval states without stale actions', async ({ page }) => {
    const routes = new RouteScenarios()
    await routes.install(page)
    await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])

    const sessionsPath = '/api/v1/agent-sessions?limit=100'
    const connectionsPath = '/api/v1/agent-connections?limit=50'
    const pendingPath = '/api/v1/approvals?status=pending&limit=100'
    const historyPath = '/api/v1/approvals?status=approved&limit=100'
    const sessionsPending = deferredResponse()
    const connectionsPending = deferredResponse()
    const attentionPending = deferredResponse()
    const pendingApprovals = deferredResponse()
    const historyPending = deferredResponse()
    routes.set('/api/v1/agents', { body: { items: [browserAgent], nextCursor: null } })
    routes.set(sessionsPath, sessionsPending.promise)
    routes.set(connectionsPath, connectionsPending.promise)
    routes.set('/api/v1/human-attention', attentionPending.promise)
    routes.set(pendingPath, pendingApprovals.promise)
    routes.set(historyPath, historyPending.promise)
    await page.goto('/agents?tab=sessions&approvalView=history&approvalStatus=approved', { waitUntil: 'domcontentloaded' })

    const sessions = page.getByRole('region', { name: 'Sessions', exact: true })
    const diagnostics = page.getByRole('region', { name: 'Diagnostics', exact: true })
    const connections = page.getByRole('region', { name: 'Connections', exact: true })
    await expect(sessions.locator('.skeleton-list')).toBeVisible()
    await expect(diagnostics.locator('.skeleton-list')).toBeVisible()
    await expect(connections.locator('.skeleton-list')).toBeVisible()
    await expect(sessions).not.toHaveAttribute('aria-busy')
    await expect(diagnostics).not.toHaveAttribute('aria-busy')
    await expect(connections).not.toHaveAttribute('aria-busy')

    const notFound = {
      body: { error: { code: 'NOT_FOUND', correlationId: 'safe-optional-404', message: 'Not found.' } },
      status: 404,
    } satisfies JsonResponse
    routes.set(sessionsPath, { body: { items: [], nextCursor: null } })
    sessionsPending.resolve(notFound)
    routes.set(connectionsPath, { body: { items: [], nextCursor: null } })
    connectionsPending.resolve({ body: { items: [], nextCursor: null } })
    routes.set('/api/v1/human-attention', { body: { items: [], nextCursor: null } })
    attentionPending.resolve({ body: { items: [], nextCursor: null } })
    await expect(sessions.locator('.skeleton-list')).toHaveCount(0)
    await expect(diagnostics.locator('.skeleton-list')).toHaveCount(0)
    await expect(connections.locator('.skeleton-list')).toHaveCount(0)
    await expect(connections.locator('.connection-empty')).toBeVisible()
    await page.getByRole('tab', { name: 'Approvals', exact: true }).click()
    await expect(page.locator('.approval-history .skeleton-list')).toBeVisible()
    routes.set(historyPath, { body: { items: [], nextCursor: null } })
    historyPending.resolve(notFound)
    await expect(page.locator('.approval-history .skeleton-list')).toHaveCount(0)
    await expect(page.getByText('safe-optional-404')).toHaveCount(0)

    await page.getByRole('tab', { name: 'Pending', exact: true }).click()
    const pendingProjection = page.locator('.approval-projection').filter({ has: page.locator('.skeleton-list') })
    await expect(pendingProjection.locator('.skeleton-list')).toBeVisible()
    await expect(pendingProjection).not.toHaveAttribute('aria-busy')
    const pendingResponse = { body: { items: [browserApproval], nextCursor: 'cursor-pending' } } satisfies JsonResponse
    routes.set(pendingPath, pendingResponse)
    pendingApprovals.resolve(pendingResponse)
    await expect(page.getByTestId(`approval-row-${browserApproval.id}`)).toBeVisible()
    await expect(page.getByTestId('load-more-approvals')).toBeVisible()

    const priorPendingRequests = routes.requests.filter(request => request === pendingPath).length
    routes.set(pendingPath, {
      body: { error: { code: 'RESOURCE_SCOPE_DENIED', correlationId: 'safe-pending-revoke', message: 'Denied.' } },
      status: 403,
    })
    await page.getByRole('button', { name: 'Refresh', exact: true }).evaluate((button: HTMLButtonElement) => button.click())
    await routes.waitFor(pendingPath, priorPendingRequests + 1)
    await expect(page.getByTestId(`approval-row-${browserApproval.id}`)).toHaveCount(0)
    await expect(page.getByTestId('load-more-approvals')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Agent workspace needs attention' })).toBeVisible()
    await expect(page.locator('.control-summary')).toHaveCount(0)
    await expect(page.locator('.approval-projection .empty')).toHaveCount(0)
    await expect(page.getByText('safe-pending-revoke')).toHaveCount(0)
    expect(routes.unexpected).toEqual([])
  })
})

test.describe('Task 6.4 Settings loading authority', () => {
  test.use({ viewport: { height: 900, width: 1440 } })

  test('separates Team and State initialization and retains the State surface through refresh failure', async ({ page }) => {
    const routes = new RouteScenarios()
    await routes.install(page)
    await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])

    const teamsPending = deferredResponse()
    const statesPending = deferredResponse()
    const statesPath = `/api/v1/teams/${team.id}/states`
    routes.set('/api/v1/teams', teamsPending.promise)
    routes.setRequest('GET', statesPath, statesPending.promise)
    await page.goto('/settings?tab=workspace', { waitUntil: 'domcontentloaded' })

    const settings = page.locator('.settings-page')
    const initialSkeleton = settings.locator('.settings-loading-skeleton .skeleton-list')
    await expect(initialSkeleton).toBeVisible()
    await expect(settings).not.toHaveAttribute('aria-busy')
    await expect(settings.locator('[aria-busy="true"]')).toHaveCount(1)
    await expect(settings.getByText('No Team', { exact: true })).toHaveCount(0)

    const teamsResponse = { body: { items: [team], nextCursor: null } } satisfies JsonResponse
    routes.set('/api/v1/teams', teamsResponse)
    teamsPending.resolve(teamsResponse)
    const workflow = settings.locator('[aria-labelledby="workflow-settings-heading"]')
    await expect(workflow.locator('.skeleton-list')).toBeVisible()
    await expect(workflow).not.toHaveAttribute('aria-busy')
    await expect(workflow.locator('[aria-busy="true"]')).toHaveCount(1)

    const state = { category: 'backlog', color: '#a8a29e', id: 'state-backlog', name: 'Backlog', revision: 1 }
    const statesResponse = { body: { items: [state], nextCursor: null } } satisfies JsonResponse
    routes.setRequest('GET', statesPath, statesResponse)
    statesPending.resolve(statesResponse)
    const stateRow = workflow.locator('.workflow-state-list article').first()
    await expect(stateRow).toContainText('Backlog')

    const stateName = workflow.locator('input[name="name"]')
    await stateName.fill('Review')
    await stateName.evaluate(element => { element.dataset.loadingIdentity = 'retained-state-form' })
    const refreshPending = deferredResponse()
    const pagedStatesPath = `${statesPath}?limit=100`
    const priorRequests = routes.requests.filter(request => request === pagedStatesPath).length
    routes.setRequest('POST', statesPath, { body: { ...state, id: 'state-review', name: 'Review' } })
    routes.setRequest('GET', pagedStatesPath, refreshPending.promise)
    await workflow.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit())
    await routes.waitFor(pagedStatesPath, priorRequests + 1)
    await expect(workflow).toHaveAttribute('aria-busy', 'true')
    await expect(stateRow).toContainText('Backlog')
    await expect(stateName).toHaveAttribute('data-loading-identity', 'retained-state-form')
    await expect(stateName).toBeFocused()

    routes.setRequest('GET', pagedStatesPath, statesResponse)
    refreshPending.resolve({
      body: { error: { code: 'TEMPORARY_UNAVAILABLE', correlationId: 'safe-state-refresh', message: 'Please retry.' } },
      status: 500,
    })
    await expect(workflow).not.toHaveAttribute('aria-busy')
    await expect(stateRow).toContainText('Backlog')
    await expect(stateName).toHaveAttribute('data-loading-identity', 'retained-state-form')
    await expect(stateName).toBeFocused()
    await expect(workflow.locator('[role="status"]')).toHaveCount(0)
    await expect(page.locator('.settings-page [role="alert"]')).toContainText('Unable to load Settings.')
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    await expect(page.getByText('safe-state-refresh')).toHaveCount(0)
    expect(routes.unexpected).toEqual([])
  })
})

test.describe('Task 6.4 Operations loading authority', () => {
  test.use({ viewport: { height: 900, width: 1440 } })

  test('uses real pending owners, resolves independently, and retains focus through refresh failure', async ({ page }) => {
    const routes = new RouteScenarios()
    await routes.install(page)
    await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])

    const featuresPending = deferredResponse()
    routes.set('/api/v1/features', featuresPending.promise)
    await page.goto('/operations', { waitUntil: 'domcontentloaded' })

    const featureStatus = page.getByRole('status', { name: 'Loading Operations' })
    await expect(featureStatus).toBeVisible()
    await expect(page.locator('.operations-loading')).not.toHaveAttribute('aria-busy')
    await expect(page.locator('.operations-loading [aria-busy="true"]')).toHaveCount(1)

    const pendingCollections = new Map<string, ReturnType<typeof deferredResponse>>()
    for (const path of Object.keys(collectionPayloads)) {
      const pending = deferredResponse()
      pendingCollections.set(path, pending)
      routes.set(path, pending.promise)
    }
    const usagePending = deferredResponse()
    routes.set('/api/v1/usage-summary', usagePending.promise)
    routes.set('/api/v1/features', allFeatures)
    featuresPending.resolve(allFeatures)

    await expect(page.locator('.operations-usage-loading .skeleton-list')).toBeVisible()
    await expect(page.locator('.operations-grid .skeleton-list')).toHaveCount(6)
    await expect(page.locator('.operations-grid section[aria-busy="true"]')).toHaveCount(0)
    await expect(page.locator('.operations-grid .skeleton-list[aria-busy="true"]')).toHaveCount(6)

    routes.set('/api/v1/usage-summary', usage)
    usagePending.resolve(usage)
    for (const [path, pending] of pendingCollections) {
      const response = collectionPayloads[path]!
      routes.set(path, response)
      pending.resolve(response)
    }

    const dryRun = page.getByRole('button', { name: 'Dry run' })
    await expect(dryRun).toBeVisible()
    await dryRun.focus()
    const automation = page.getByTestId('automation-panel')
    await dryRun.evaluate(element => { element.dataset.loadingIdentity = 'retained-rule-control' })

    const rulesFailure = deferredResponse()
    routes.set('/api/v1/automation-rules', rulesFailure.promise)
    const rulesPath = '/api/v1/automation-rules?limit=100'
    const priorRuleRequests = routes.requests.filter(request => request === rulesPath).length
    await page.getByRole('button', { name: 'Refresh' }).evaluate((button: HTMLButtonElement) => button.click())
    await routes.waitFor(rulesPath, priorRuleRequests + 1)
    await expect(automation).toHaveAttribute('aria-busy', 'true')
    await expect(dryRun).toHaveAttribute('data-loading-identity', 'retained-rule-control')
    await expect(dryRun).toBeFocused()
    await expect(page.locator('.operations-tab > .sr-only[role="status"]')).toHaveCount(1)

    routes.set('/api/v1/automation-rules', collectionPayloads['/api/v1/automation-rules']!)
    rulesFailure.resolve({
      body: { error: { code: 'TEMPORARY_UNAVAILABLE', correlationId: 'safe-browser-diagnostic', message: 'Please retry.' } },
      status: 500,
    })
    await expect(automation).not.toHaveAttribute('aria-busy')
    await expect(dryRun).toHaveAttribute('data-loading-identity', 'retained-rule-control')
    await expect(dryRun).toBeFocused()
    await expect(page.getByText('Retained browser rule')).toBeVisible()
    await expect(automation.getByText('Unable to load Operations.')).toBeVisible()
    await expect(page.locator('.operations-tab > .sr-only[role="status"]')).toHaveCount(0)
    expect(routes.unexpected).toEqual([])
  })
})

const loadingViewports = [
  { height: 844, width: 390 },
  { height: 900, width: 1440 },
  { height: 1080, width: 1920 },
] as const

for (const viewport of loadingViewports) {
  test.describe(`Task 6.4 loading geometry at ${viewport.width}px`, () => {
    test.use({ viewport })

    test('fills real Operations, Settings and Board panels without a narrow skeleton island', async ({ page }, testInfo) => {
      const routes = new RouteScenarios()
      await routes.install(page)
      await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])
      await mkdir(evidenceRoot, { recursive: true })

      const featuresPending = deferredResponse()
      const usageGeometryPending = deferredResponse()
      routes.set('/api/v1/features', featuresPending.promise)
      routes.set('/api/v1/usage-summary', usageGeometryPending.promise)
      for (const [path, response] of Object.entries(collectionPayloads)) routes.set(path, response)
      await page.goto('/operations', { waitUntil: 'domcontentloaded' })
      const operationsHeader = page.locator('.operations-tab > .operations-header')
      await expect(operationsHeader).toBeVisible()
      await operationsHeader.evaluate(element => { element.dataset.loadingIdentity = 'stable-operations-header' })
      const operationsHeaderPending = (await measureRects(page, '.operations-tab > .operations-header'))[0]!
      const operationsPending = await measureSkeleton(page, '.operations-loading .skeleton-list', { panelSelector: '.operations-tab' })
      expectContainedSkeleton(operationsPending, viewport.width <= 960 ? 1 : 2)
      expect(operationsPending.busyOwners).toBe(1)
      await page.screenshot({ path: join(evidenceRoot, `loading-operations-pending-${viewport.width}x${viewport.height}.png`) })

      routes.set('/api/v1/features', allFeatures)
      featuresPending.resolve(allFeatures)
      await expect(page.locator('.operations-usage-loading .skeleton-list')).toBeVisible()
      await expect(page.locator('.operations-grid > .operations-panel')).toHaveCount(6)
      const usagePending = await measureSkeleton(page, '.operations-usage-loading .skeleton-list', { panelSelector: '.operations-metrics' })
      // Task 6.5 supersedes the original 1920px five-column snapshot: keeping
      // the metrics root at 85% of the workspace yields four readable columns
      // and two rows without changing the loading owner or pending/resolved seam.
      const expectedUsageColumns = viewport.width <= 560 ? 1 : viewport.width >= 1440 ? 4 : 5
      expectContainedSkeleton(usagePending, expectedUsageColumns)
      expect(usagePending.cells).toHaveLength(5)
      expect(usagePending.focusableCount).toBe(0)
      expect(usagePending.document.overflow).toBe(0)
      if (viewport.width === 1920) {
        expect(usagePending.root.width / usagePending.main.width).toBeGreaterThanOrEqual(.85)
        expect(new Set(usagePending.cells.map(cell => Math.round(cell.top))).size).toBe(2)
      }
      routes.set('/api/v1/usage-summary', usage)
      usageGeometryPending.resolve(usage)
      await expect(page.locator('.operations-metrics-grid > .operations-metric-card')).toHaveCount(5)
      const usageResolved = await measureResolvedGrid(page, '.operations-metrics-grid', ':scope > .operations-metric-card')
      expect(usageResolved.columns).toBe(usagePending.columns)
      expect(usageResolved.document.overflow).toBe(0)
      expect(Math.abs(usageResolved.root.width - usagePending.root.width)).toBeLessThanOrEqual(2)
      usageResolved.items.forEach((card, index) => expect(Math.abs(card.width - usagePending.cells[index]!.width)).toBeLessThanOrEqual(2))
      if (viewport.width === 1920)
        expect(new Set(usageResolved.items.map(card => Math.round(card.top))).size).toBe(2)
      const operationsResolved = await measureRects(page, '.operations-grid > .operations-panel')
      const operationsContainment = await measureResolvedContainment(page)
      const operationsHeaderResolved = (await measureRects(page, '.operations-tab > .operations-header'))[0]!
      expect(operationsContainment.document.overflow).toBe(0)
      await expect(operationsHeader).toHaveAttribute('data-loading-identity', 'stable-operations-header')
      expect(Math.abs(operationsHeaderPending.top - operationsHeaderResolved.top)).toBeLessThanOrEqual(2)
      expect(Math.abs(operationsPending.cells[0]!.width - operationsResolved[0]!.width)).toBeLessThanOrEqual(2)
      expect(Math.abs(operationsPending.cells[1]!.width - operationsResolved[1]!.width)).toBeLessThanOrEqual(2)
      expect(Math.abs(operationsPending.cells[2]!.width - operationsResolved[2]!.width)).toBeLessThanOrEqual(2)
      await persistEvidence(page, testInfo, `loading-operations-geometry-${viewport.width}x${viewport.height}`, {
        header: { pending: operationsHeaderPending, resolved: operationsHeaderResolved },
        pending: operationsPending,
        resolvedContainment: operationsContainment,
        resolvedPanels: operationsResolved,
        usage: { pending: usagePending, resolved: usageResolved },
      })

      const teamsPending = deferredResponse()
      const statesGeometryPending = deferredResponse()
      const statesPath = `/api/v1/teams/${team.id}/states`
      routes.setRequest('GET', '/api/v1/teams', teamsPending.promise)
      routes.setRequest('GET', statesPath, statesGeometryPending.promise)
      await page.goto('/settings?tab=workspace', { waitUntil: 'domcontentloaded' })
      const settingsHeader = page.locator('.settings-page > header').first()
      await settingsHeader.evaluate(element => { element.dataset.loadingIdentity = 'stable-settings-header' })
      const settingsHeaderPending = (await measureRects(page, '.settings-page > header'))[0]!
      const settingsPending = await measureSkeleton(page, '.settings-loading-skeleton .skeleton-list', { panelSelector: '.settings-grid' })
      expectContainedSkeleton(settingsPending, viewport.width <= 720 ? 1 : 2)
      expect(settingsPending.busyOwners).toBe(1)
      await page.screenshot({ path: join(evidenceRoot, `loading-settings-pending-${viewport.width}x${viewport.height}.png`) })

      const teamsResponse = { body: { items: [team], nextCursor: null } } satisfies JsonResponse
      routes.setRequest('GET', '/api/v1/teams', teamsResponse)
      teamsPending.resolve(teamsResponse)
      await expect(page.locator('.settings-states-loading .skeleton-list')).toBeVisible()
      const statesPending = await measureSkeleton(page, '.settings-states-loading .skeleton-list', { panelSelector: '.settings-card' })
      expectContainedSkeleton(statesPending, viewport.width <= 560 ? 1 : workflowStates.length)
      expect(statesPending.cells).toHaveLength(workflowStates.length)
      expect(statesPending.document.overflow).toBe(0)
      expect(statesPending.focusableCount).toBe(0)
      const statesResponse = { body: { items: workflowStates, nextCursor: null } } satisfies JsonResponse
      routes.setRequest('GET', statesPath, statesResponse)
      statesGeometryPending.resolve(statesResponse)
      await expect(page.locator('.settings-grid > .settings-card')).toHaveCount(3)
      await expect(page.locator('.workflow-state-list > article')).toHaveCount(workflowStates.length)
      const statesResolved = await measureResolvedGrid(page, '.workflow-state-list', ':scope > article')
      expect(statesResolved.columns).toBe(statesPending.columns)
      expect(statesResolved.document.overflow).toBe(0)
      expect(Math.abs(statesResolved.root.width - statesPending.root.width)).toBeLessThanOrEqual(2)
      statesResolved.items.forEach((card, index) => expect(Math.abs(card.width - statesPending.cells[index]!.width)).toBeLessThanOrEqual(2))
      const settingsResolved = await measureRects(page, '.settings-grid > .settings-card')
      const settingsContainment = await measureResolvedContainment(page)
      const settingsHeaderResolved = (await measureRects(page, '.settings-page > header'))[0]!
      expect(settingsContainment.document.overflow).toBe(0)
      await expect(settingsHeader).toHaveAttribute('data-loading-identity', 'stable-settings-header')
      expect(Math.abs(settingsHeaderPending.top - settingsHeaderResolved.top)).toBeLessThanOrEqual(2)
      for (const index of [0, 1, 2])
        expect(Math.abs(settingsPending.cells[index]!.width - settingsResolved[index]!.width)).toBeLessThanOrEqual(8)
      await persistEvidence(page, testInfo, `loading-settings-geometry-${viewport.width}x${viewport.height}`, {
        header: { pending: settingsHeaderPending, resolved: settingsHeaderResolved },
        pending: settingsPending,
        resolvedCards: settingsResolved,
        resolvedContainment: settingsContainment,
        states: { pending: statesPending, resolved: statesResolved },
      })

      const workItemsPending = deferredResponse()
      routes.setRequest('GET', `/api/v1/teams/${team.id}/states`, { body: { items: workflowStates, nextCursor: null } })
      routes.set('/api/v1/work-items', workItemsPending.promise)
      await page.goto('/?view=my-work&layout=board', { waitUntil: 'domcontentloaded' })
      const boardControls = page.locator('.work-surface-layout-toggle')
      await boardControls.evaluate(element => { element.dataset.loadingIdentity = 'stable-board-controls' })
      const boardControlsPending = (await measureRects(page, '.work-surface-layout-toggle'))[0]!
      const boardPending = await measureSkeleton(page, '.work-surfaces .skeleton-list', { panelSelector: '.work-surfaces' })
      expectContainedSkeleton(boardPending, viewport.width <= 560 ? 1 : workflowStates.length, viewport.width > 560)
      expect(boardPending.busyOwners).toBe(1)
      expect(boardPending.cells).toHaveLength(workflowStates.length)
      if (viewport.width > 560)
        expect(boardPending.cells.every(cell => Math.abs(cell.width - 320) <= 2)).toBe(true)
      await page.screenshot({ path: join(evidenceRoot, `loading-board-pending-${viewport.width}x${viewport.height}.png`) })

      const workItemsResponse = { body: { items: [browserWorkItem], nextCursor: null } } satisfies JsonResponse
      routes.set('/api/v1/work-items', workItemsResponse)
      workItemsPending.resolve(workItemsResponse)
      await expect(page.locator('.wm-work-item-column')).toHaveCount(workflowStates.length)
      const boardResolved = await measureRects(page, '.wm-work-item-column')
      const boardContainment = await measureResolvedContainment(page, '.wm-work-item-board-scroll')
      const boardControlsResolved = (await measureRects(page, '.work-surface-layout-toggle'))[0]!
      expect(boardContainment.document.overflow).toBe(0)
      await expect(boardControls).toHaveAttribute('data-loading-identity', 'stable-board-controls')
      expect(Math.abs(boardControlsPending.top - boardControlsResolved.top)).toBeLessThanOrEqual(2)
      if (viewport.width > 560)
        boardResolved.forEach((column, index) => expect(Math.abs(boardPending.cells[index]!.width - column.width)).toBeLessThanOrEqual(2))
      await persistEvidence(page, testInfo, `loading-board-geometry-${viewport.width}x${viewport.height}`, { controls: { pending: boardControlsPending, resolved: boardControlsResolved }, pending: boardPending, resolvedColumns: boardResolved, resolvedContainment: boardContainment })
      expect(routes.unexpected).toEqual([])
    })

    test('matches real Registry, Sessions and Connections grids without focusable placeholders', async ({ page }, testInfo) => {
      const routes = new RouteScenarios()
      await routes.install(page)
      await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])

      const registryPendingResponse = deferredResponse()
      routes.set('/api/v1/agents', registryPendingResponse.promise)
      await page.goto('/agents?tab=agents', { waitUntil: 'domcontentloaded' })
      const registryHeader = page.locator('.agent-registry > .surface-header')
      await registryHeader.evaluate(element => { element.dataset.loadingIdentity = 'stable-registry-header' })
      const registryHeaderPending = (await measureRects(page, '.agent-registry > .surface-header'))[0]!
      const registryPending = await measureSkeleton(page, '.agent-registry > .skeleton-list', { panelSelector: '.agent-registry' })
      expectContainedSkeleton(registryPending, 1)
      expect(registryPending.busyOwners).toBe(1)
      await page.screenshot({ path: join(evidenceRoot, `loading-agents-registry-pending-${viewport.width}x${viewport.height}.png`) })

      const agentsResponse = { body: { items: browserAgents, nextCursor: null } } satisfies JsonResponse
      routes.set('/api/v1/agents', agentsResponse)
      registryPendingResponse.resolve(agentsResponse)
      await expect(page.locator('.registry-list > article')).toHaveCount(browserAgents.length)
      const registryResolved = await measureResolvedGrid(page, '.registry-list', ':scope > article')
      const registryHeaderResolved = (await measureRects(page, '.agent-registry > .surface-header'))[0]!
      expect(registryResolved.columns).toBe(1)
      expect(registryResolved.document.overflow).toBe(0)
      expect(Math.abs(registryResolved.root.width - registryPending.root.width)).toBeLessThanOrEqual(2)
      expect(Math.abs(registryResolved.items[0]!.width - registryPending.cells[0]!.width)).toBeLessThanOrEqual(2)
      expect(Math.abs(registryHeaderPending.top - registryHeaderResolved.top)).toBeLessThanOrEqual(2)
      await expect(registryHeader).toHaveAttribute('data-loading-identity', 'stable-registry-header')
      await persistEvidence(page, testInfo, `loading-agents-registry-geometry-${viewport.width}x${viewport.height}`, {
        header: { pending: registryHeaderPending, resolved: registryHeaderResolved },
        pending: registryPending,
        resolved: registryResolved,
      })

      const sessionsPath = '/api/v1/agent-sessions?limit=100'
      const connectionsPath = '/api/v1/agent-connections?limit=50'
      const sessionsPendingResponse = deferredResponse()
      const connectionsPendingResponse = deferredResponse()
      routes.set(sessionsPath, sessionsPendingResponse.promise)
      routes.set(connectionsPath, connectionsPendingResponse.promise)
      await page.goto('/agents?tab=sessions', { waitUntil: 'domcontentloaded' })
      const sessionsRegion = page.getByRole('region', { name: 'Sessions', exact: true })
      const connectionsRegion = page.getByRole('region', { name: 'Connections', exact: true })
      const sessionsHeader = sessionsRegion.locator('.surface-header')
      const connectionsHeader = connectionsRegion.locator('.surface-header')
      await sessionsHeader.evaluate(element => { element.dataset.loadingIdentity = 'stable-sessions-header' })
      await connectionsHeader.evaluate(element => { element.dataset.loadingIdentity = 'stable-connections-header' })
      const sessionsHeaderPending = (await measureRects(page, '[aria-label="Sessions"] > .surface-header'))[0]!
      const connectionsHeaderPending = (await measureRects(page, '.connection-panel > .surface-header'))[0]!
      const sessionsPending = await measureSkeleton(page, '.agent-sessions-loading .skeleton-list', { panelSelector: '.surface-panel' })
      const connectionsPending = await measureSkeleton(page, '.agent-connections-loading .skeleton-list', { panelSelector: '.connection-panel' })
      const expectedCardColumns = viewport.width <= 560 ? 1 : browserSessions.length
      expectContainedSkeleton(sessionsPending, expectedCardColumns)
      expectContainedSkeleton(connectionsPending, expectedCardColumns)
      expect(sessionsPending.busyOwners).toBe(1)
      expect(connectionsPending.busyOwners).toBe(1)
      if (viewport.width > 560) {
        expect(sessionsPending.cells.every(cell => cell.width > 224)).toBe(true)
        expect(connectionsPending.cells.every(cell => cell.width > 224)).toBe(true)
      }
      await page.screenshot({ path: join(evidenceRoot, `loading-agents-secondary-pending-${viewport.width}x${viewport.height}.png`) })

      const sessionsResponse = { body: { items: browserSessions, nextCursor: null } } satisfies JsonResponse
      const connectionsResponse = { body: { items: browserConnections, nextCursor: null } } satisfies JsonResponse
      routes.set(sessionsPath, sessionsResponse)
      sessionsPendingResponse.resolve(sessionsResponse)
      await expect(page.locator('.session-card-list > .session-card')).toHaveCount(browserSessions.length)
      const sessionsResolved = await measureResolvedGrid(page, '.session-card-list', ':scope > .session-card')
      const sessionsHeaderResolved = (await measureRects(page, '[aria-label="Sessions"] > .surface-header'))[0]!
      routes.set(connectionsPath, connectionsResponse)
      connectionsPendingResponse.resolve(connectionsResponse)
      await expect(page.locator('.connection-list > button')).toHaveCount(browserConnections.length)
      const connectionsResolved = await measureResolvedGrid(page, '.connection-list', ':scope > button')
      const connectionsHeaderResolved = (await measureRects(page, '.connection-panel > .surface-header'))[0]!
      expect(sessionsResolved.columns).toBe(sessionsPending.columns)
      expect(connectionsResolved.columns).toBe(connectionsPending.columns)
      expect(sessionsResolved.document.overflow).toBe(0)
      expect(connectionsResolved.document.overflow).toBe(0)
      expect(Math.abs(sessionsResolved.root.width - sessionsPending.root.width)).toBeLessThanOrEqual(2)
      expect(Math.abs(connectionsResolved.root.width - connectionsPending.root.width)).toBeLessThanOrEqual(2)
      sessionsResolved.items.forEach((card, index) => expect(Math.abs(card.width - sessionsPending.cells[index]!.width)).toBeLessThanOrEqual(2))
      connectionsResolved.items.forEach((card, index) => expect(Math.abs(card.width - connectionsPending.cells[index]!.width)).toBeLessThanOrEqual(2))
      expect(Math.abs(sessionsHeaderPending.top - sessionsHeaderResolved.top)).toBeLessThanOrEqual(2)
      expect(Math.abs(connectionsHeaderPending.top - connectionsHeaderResolved.top)).toBeLessThanOrEqual(2)
      await expect(sessionsHeader).toHaveAttribute('data-loading-identity', 'stable-sessions-header')
      await expect(connectionsHeader).toHaveAttribute('data-loading-identity', 'stable-connections-header')
      await persistEvidence(page, testInfo, `loading-agents-secondary-geometry-${viewport.width}x${viewport.height}`, {
        connections: { header: { pending: connectionsHeaderPending, resolved: connectionsHeaderResolved }, pending: connectionsPending, resolved: connectionsResolved },
        sessions: { header: { pending: sessionsHeaderPending, resolved: sessionsHeaderResolved }, pending: sessionsPending, resolved: sessionsResolved },
      })
      expect(routes.unexpected).toEqual([])
    })
  })
}
