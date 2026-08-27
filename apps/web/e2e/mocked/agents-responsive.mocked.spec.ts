import { expect, test, type Locator, type Page, type Route, type TestInfo } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const evidenceRoot = 'D:\\Cache\\Temp\\workmesh-web-ui-evidence-2026-08-23\\task-6.5'
const team = { id: 'team-responsive', key: 'RSP', name: 'Responsive Team', revision: 1 }
const human = { id: 'human-responsive', display_name: 'Alex Morgan', email: 'alex@workmesh.test' }
const states = [
  { id: 'state-backlog', name: 'Backlog', category: 'backlog', color: '#a8a29e', revision: 1 },
  { id: 'state-started', name: 'In progress', category: 'started', color: '#2563eb', revision: 1 },
  { id: 'state-review', name: 'Review', category: 'started', color: '#16a34a', revision: 1 },
  { id: 'state-done', name: 'Done', category: 'completed', color: '#15803d', revision: 1 },
  { id: 'state-canceled', name: 'Canceled', category: 'canceled', color: '#919ba8', revision: 1 },
]
const project = { id: 'project-responsive', team_id: team.id, name: 'Responsive acceptance', summary: 'Measured PC and narrow reflow', description: null, status: 'in_progress', lead_actor_id: human.id, target_date: null, revision: 1 }
const workItem = {
  id: 'work-responsive', team_id: team.id, team_key: team.key, number: 65, title: 'Responsive acceptance Issue', description: 'A deliberately long detail description that remains contained without widening the document.',
  status_id: states[0]!.id, status_name: states[0]!.name, status_category: states[0]!.category, priority: 'high', due_date: null,
  responsible_human_actor_id: human.id, responsible_human: { actor_id: human.id, display_name: human.display_name }, active_executor: null, shared_reviewers: [],
  labels: ['frontend', 'responsive'], project_id: project.id, project_name: project.name, milestone_id: null, parent_id: null, revision: 2,
}
const agent = {
  actor_id: 'actor-agent-responsive', approved_capabilities: ['work:read'], description: 'Responsive fixture Agent.', heartbeat_interval_seconds: 30,
  id: 'agent-responsive', is_active: true, max_concurrency: 1, name: 'Responsive Agent', provider: 'openai', requested_capabilities: ['work:read'],
  revision: 1, skills: ['frontend'], slug: 'responsive-agent', supported_protocols: ['native_http'], team_access: [], version: '1.0.0', workspace_id: 'workspace-preview',
}
const approval = {
  action_name: 'Approve responsive release', approval_type: 'merge_pull_request', created_at: '2026-08-23T00:00:00.000Z', expires_at: '2026-08-24T00:00:00.000Z',
  id: 'approval-responsive', rationale_summary: 'Wide and narrow acceptance evidence is ready.', revision: 1, risk_level: 'medium', session_id: 'session-responsive', status: 'pending',
}
const canonicalFeatures = [
  { key: 'WORKMESH_BETA_PLANNING', tier: 'beta', enabled: true }, { key: 'WORKMESH_BETA_TEMPLATES', tier: 'beta', enabled: true },
  { key: 'WORKMESH_BETA_COSTS', tier: 'beta', enabled: true }, { key: 'WORKMESH_BETA_OPERATIONS_UI', tier: 'beta', enabled: true },
  { key: 'WORKMESH_EXPERIMENTAL_AUTOMATION', tier: 'experimental', enabled: true }, { key: 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS', tier: 'experimental', enabled: true },
] as const
const viewports = [
  { width: 320, height: 800 }, { width: 375, height: 812 }, { width: 390, height: 844 },
  { width: 760, height: 900 }, { width: 761, height: 900 }, { width: 768, height: 1024 },
  { width: 1440, height: 900 }, { width: 1440, height: 1000 }, { width: 1920, height: 1080 },
] as const

type JsonResponse = Readonly<{ body: unknown; status?: number }>

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function headers(route: Route): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': route.request().headers()['origin'] ?? '*', 'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'content-type, if-match, idempotency-key, x-csrf-token', 'Access-Control-Allow-Methods': 'DELETE, GET, OPTIONS, PATCH, POST',
    'Content-Type': 'application/json',
  }
}

async function installFixture(page: Page, agentsPlan?: Promise<JsonResponse>) {
  const unexpected: string[] = []
  let nextWorkResponse: Promise<JsonResponse> | null = null
  const setNextWorkResponse = (plan: Promise<JsonResponse>): void => { nextWorkResponse = plan }
  await page.route('**/.well-known/workmesh-agent', route => route.fulfill({ status: 200, headers: headers(route), body: JSON.stringify({
    apiVersion: 'v1', protocolVersion: 'v1', mcpUrl: 'http://127.0.0.1:3201/mcp', wellKnownUrl: 'http://127.0.0.1:3201/.well-known/workmesh-agent', supportedClients: ['generic_mcp'],
    skill: { name: 'workmesh', version: '1.1.0', sha256: `sha256:${'a'.repeat(64)}`, signature: 'ed25519:responsive-fixture' },
  }) }))
  await page.route('**/mcp', route => route.fulfill({ status: 401, headers: headers(route), body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'credential required', correlationId: 'responsive-fixture' } }) }))
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const responseHeaders = headers(route)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: responseHeaders })
    const url = new URL(request.url())
    const path = url.pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers: responseHeaders, body: JSON.stringify(payload) })
    const list = (items: unknown[]) => body({ items, nextCursor: null })
    if (path === '/api/v1/install-status') return body({ installed: true })
    if (path === '/api/v1/auth/me') return body({ actor: { ...human, kind: 'human', workspace_id: 'workspace-preview', workspace_role: 'admin' }, csrfToken: 'responsive-fixture' })
    if (path === '/api/v1/info') return body({ serverVersion: '1.0.0', buildSha: 'responsive-fixture', schemaBaseline: 24, preferredClientProfileVersion: '1.0', supportedClientProfileVersions: ['1.0'], mcpVersion: '1.29.0' })
    if (path === '/api/v1/features') return body({ features: canonicalFeatures })
    if (path === '/api/v1/teams') return list([team])
    if (path === `/api/v1/teams/${team.id}/states`) return list(states)
    if (path === '/api/v1/actors/humans') return list([human])
    if (path === '/api/v1/projects') return list([project])
    if (path === `/api/v1/projects/${project.id}`) return body(project)
    if (path === `/api/v1/projects/${project.id}/control-center`) {
      const empty = { items: [], nextCursor: null }
      return body({
        projectionVersion: 1,
        scope: { workspaceId: 'workspace-preview', projectId: project.id },
        project: { id: project.id, name: project.name, status: project.status, targetDate: project.target_date, responsibleHuman: { id: human.id, displayName: human.display_name, kind: 'human' }, revision: project.revision },
        revision: project.revision,
        freshness: { state: 'fresh', observedAt: '2026-08-27T00:00:00.000Z', sourceUpdatedAt: '2026-08-27T00:00:00.000Z' },
        collections: { attention: empty, running: empty, risks: empty, recently_verified: empty, ready_work: empty, blocked_work: empty },
      })
    }
    if (path === `/api/v1/projects/${project.id}/milestones`) return list([])
    if (path === `/api/v1/projects/${project.id}/delivery`) return body({ milestones: [], updates: [], artifacts: [], dependencies: [], completionSuggestions: [], providerPullRequests: [], providerReviews: [], workMeshStructuredReviews: [], mergeApprovals: [] })
    if (path === '/api/v1/views') return list([])
    if (path === '/api/v1/work-items') {
      if (nextWorkResponse) { const plan = nextWorkResponse; nextWorkResponse = null; const result = await plan; return body(result.body, result.status) }
      return list([workItem])
    }
    if (path === `/api/v1/work-items/${workItem.id}` && request.method() === 'PATCH') return body({ ...workItem, status_id: states[1]!.id, status_name: states[1]!.name, status_category: states[1]!.category, revision: 3 })
    if (path === `/api/v1/work-items/${workItem.id}`) return body(workItem)
    if (path === `/api/v1/work-items/${workItem.id}/execution-summary`) return body({
      projectionVersion: 1,
      workItem: { id: workItem.id, title: workItem.title, revision: workItem.revision, status: workItem.status_name },
      activeRuns: [],
      recentRuns: [],
      evidence: [],
      freshness: { state: 'current', observedAt: '2026-08-27T00:00:00.000Z', sourceUpdatedAt: '2026-08-27T00:00:00.000Z' },
    })
    if (path === '/api/v1/human-attention') return list([])
    if (path === `/api/v1/work-items/${workItem.id}/comments` || path === `/api/v1/work-items/${workItem.id}/relations`) return list([])
    if (path === '/api/v1/agents') {
      if (agentsPlan) { const result = await agentsPlan; return body(result.body, result.status) }
      return list([agent])
    }
    if (path === '/api/v1/agent-sessions') return list([])
    if (path === '/api/v1/agent-connections') return list([])
    if (path === '/api/v1/approvals') return list(url.searchParams.get('status') === 'pending' ? [approval] : [])
    if (path === '/api/v1/usage-summary') return body({ input_tokens: '1200', output_tokens: '300', runtime_ms: '45000', tool_calls: '7', unknown_cost_records: 0, currency_buckets: [] })
    if (path === '/api/v1/cycles') return list([{ id: 'cycle-responsive', name: 'Responsive review', state: 'current', starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-08-31T00:00:00Z', total_items: 12, completed_items: 8 }])
    if (path === '/api/v1/initiatives') return list([{ id: 'initiative-responsive', name: 'Runtime reliability', status: 'active', priority: 'high', health: 'on_track' }])
    if (path === '/api/v1/automation-rules') return list([{ id: 'rule-responsive', name: 'Responsive rule', state: 'active', revision: 1, version: 1, trigger: { type: 'manual' } }])
    if (path === '/api/v1/loops') return list([{ id: 'loop-responsive', name: 'Responsive loop', state: 'active', revision: 1, next_run_at: '2026-08-23T02:00:00Z', no_overlap: true }])
    if (path === '/api/v1/automation-runs') return list([{ id: 'run-responsive', rule_id: 'rule-responsive', loop_id: null, session_id: null, dry_run: false, status: 'succeeded', attempt_count: 1, max_attempts: 3, created_at: '2026-08-23T01:00:00Z', last_error: null }])
    if (path === '/api/v1/templates') return list([{ id: 'template-responsive', kind: 'work_item', name: 'Responsive template', status: 'active', version: 1 }])
    if (path === '/api/v1/events/stream') return route.fulfill({ status: 204, headers: responseHeaders })
    if (path === '/api/v1/artifacts' || path === '/api/v1/delegations' || path === '/api/v1/messages' || path === '/api/v1/agent-messages') return list([])
    const key = `${request.method()} ${path}${url.search}`
    unexpected.push(key)
    return body({ error: { code: 'UNEXPECTED_MOCK_REQUEST', message: 'Unexpected mocked request.', correlationId: 'responsive-fixture' } }, 500)
  })
  return { setNextWorkResponse, unexpected }
}

async function geometry(page: Page, target: Locator | string) {
  const locator = typeof target === 'string' ? page.locator(target) : target
  return locator.evaluate(element => {
    const rect = (node: Element) => { const value = node.getBoundingClientRect(); return { height: value.height, left: value.left, right: value.right, top: value.top, width: value.width } }
    const root = element as HTMLElement
    const workspace = document.querySelector<HTMLElement>('.app-workspace')
    const content = document.querySelector<HTMLElement>('.content, .agent-center, .operations-tab')
    const rootStyle = content ? getComputedStyle(content) : null
    const innerContentWidth = content && rootStyle ? content.clientWidth - Number.parseFloat(rootStyle.paddingLeft) - Number.parseFloat(rootStyle.paddingRight) : null
    return {
      body: { clientWidth: document.body.clientWidth, scrollWidth: document.body.scrollWidth },
      content: content ? rect(content) : null,
      contentInnerWidth: innerContentWidth,
      document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      root: { ...rect(root), clientWidth: root.clientWidth, scrollWidth: root.scrollWidth },
      workspace: workspace ? rect(workspace) : null,
    }
  })
}

async function saveSurface(page: Page, name: string): Promise<string> {
  await mkdir(evidenceRoot, { recursive: true })
  const path = join(evidenceRoot, `${name}.png`)
  await page.screenshot({ path })
  return path
}

async function saveGeometry(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  await mkdir(evidenceRoot, { recursive: true })
  const path = join(evidenceRoot, `${name}.json`)
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8')
  await testInfo.attach(name, { path, contentType: 'application/json' })
}

function expectContained(value: Awaited<ReturnType<typeof geometry>>): void {
  expect(value.document.scrollWidth).toBeLessThanOrEqual(value.document.clientWidth)
  expect(value.body.scrollWidth).toBeLessThanOrEqual(value.body.clientWidth)
  expect(value.root.right).toBeLessThanOrEqual(value.document.clientWidth + .5)
  expect(value.root.left).toBeGreaterThanOrEqual(-.5)
}

for (const viewport of viewports) {
  test(`responsive product surfaces at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: String(testInfo.project.use.baseURL) }])
    const fixture = await installFixture(page)
    const evidence: Record<string, unknown> = { viewport }

    await page.goto('/?view=my-work&layout=list', { waitUntil: 'domcontentloaded' })
    const issueList = page.getByRole('region', { name: 'Issue list' })
    const issueArticle = issueList.getByRole('article', { name: `${team.key}-${workItem.number}: ${workItem.title}` })
    await expect(issueArticle).toBeVisible()
    evidence.issues = await geometry(page, '.work-surfaces')
    const issueCard = await geometry(page, issueArticle)
    evidence.issueCard = issueCard
    expectContained(evidence.issues as Awaited<ReturnType<typeof geometry>>)
    if (viewport.width >= 1440) expect(issueCard.root.height).toBeLessThanOrEqual(320)
    await saveSurface(page, `issues-${viewport.width}x${viewport.height}`)

    await page.goto('/agents?tab=agents', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(agent.name, { exact: true }).first()).toBeVisible()
    const registry = await geometry(page, '.agent-registry')
    expectContained(registry)
    const filterColumns = await page.locator('.agent-registry-filters').evaluate(element => new Set(Array.from(element.children).map(child => Math.round(child.getBoundingClientRect().left))).size)
    expect(filterColumns).toBe(viewport.width <= 900 ? 2 : 4)
    evidence.registry = { ...registry, filterColumns }

    await page.goto('/agents?tab=approvals&approvalView=pending', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId(`approval-row-${approval.id}`)).toBeVisible()
    const approvals = await geometry(page, '.approval-table-wrap')
    expectContained(approvals)
    expect(approvals.root.scrollWidth).toBeGreaterThanOrEqual(approvals.root.clientWidth)
    evidence.approvals = approvals
    await saveSurface(page, `agents-pending-${viewport.width}x${viewport.height}`)

    await page.goto('/settings?tab=workspace', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.workflow-state-list article').first()).toBeVisible()
    const settings = await geometry(page, '.settings-page')
    expectContained(settings)
    evidence.settings = settings
    await saveSurface(page, `settings-${viewport.width}x${viewport.height}`)

    await page.goto('/operations', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.operations-runs-table tbody tr').first()).toBeVisible()
    const operations = await geometry(page, '.operations-tab')
    const runs = await geometry(page, '.operations-table-scroll')
    const metrics = await geometry(page, '.operations-metrics')
    const containmentOwners = await page.locator('.operations-tab, .operations-tab > .operations-header, .operations-search, .operations-section-navigation, .operations-metrics, .operations-grid, .operations-table-scroll').evaluateAll(elements => elements.map(element => {
      const node = element as HTMLElement
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return {
        borderInline: `${style.borderLeftWidth} ${style.borderRightWidth}`,
        boxSizing: style.boxSizing,
        clientWidth: node.clientWidth,
        maxWidth: style.maxWidth,
        offsetWidth: node.offsetWidth,
        paddingInline: `${style.paddingLeft} ${style.paddingRight}`,
        rect: { left: rect.left, right: rect.right, width: rect.width },
        scrollWidth: node.scrollWidth,
        selector: node.className,
        width: style.width,
      }
    }))
    const usage = await page.locator('.operations-metrics-grid').evaluate(element => {
      const root = element.getBoundingClientRect()
      const cards = Array.from(element.children).map(child => child.getBoundingClientRect())
      const rows = new Set(cards.map(card => Math.round(card.top))).size
      return { cardWidths: cards.map(card => card.width), rootWidth: root.width, rows }
    })
    expect(operations.document.scrollWidth, JSON.stringify(containmentOwners)).toBeLessThanOrEqual(operations.document.clientWidth)
    expectContained(operations)
    expectContained(runs)
    evidence.operations = { containmentOwners, operations, runs, metrics, usage }
    await saveSurface(page, `operations-${viewport.width}x${viewport.height}`)

    await page.goto(`/?view=projects&project=${project.id}&workItem=${workItem.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('work-item-detail')).toBeVisible()
    const detail = await geometry(page, '.work-item-full-page > .work-item-detail')
    expectContained(detail)
    evidence.detail = detail
    await saveSurface(page, `work-item-detail-${viewport.width}x${viewport.height}`)

    if (viewport.width === 1920) {
      const issues = evidence.issues as Awaited<ReturnType<typeof geometry>>
      expect(issues.workspace).not.toBeNull()
      expect(issues.content).not.toBeNull()
      const standardRatio = issues.content!.width / issues.workspace!.width
      const leftMargin = issues.content!.left - issues.workspace!.left
      const rightMargin = issues.workspace!.right - issues.content!.right
      expect(standardRatio).toBeGreaterThanOrEqual(.85)
      expect(standardRatio).toBeLessThanOrEqual(.9)
      expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(2)
      expect(settings.contentInnerWidth).not.toBeNull()
      expect(settings.root.width / settings.contentInnerWidth!).toBeGreaterThanOrEqual(.98)
      expect(runs.root.width).toBeGreaterThanOrEqual(1118)
      expect(runs.root.width).toBeLessThanOrEqual(1122)
      expect(detail.root.width).toBeGreaterThanOrEqual(1178)
      expect(detail.root.width).toBeLessThanOrEqual(1182)
      expect(metrics.workspace).not.toBeNull()
      expect(metrics.root.width / metrics.workspace!.width).toBeGreaterThanOrEqual(.85)
      expect(usage.cardWidths.every(width => width >= 200 && width <= 289)).toBe(true)
      expect(usage.rows).toBeGreaterThanOrEqual(2)
      expect(usage.rows).toBeLessThanOrEqual(3)
    }
    expect(fixture.unexpected).toEqual([])
    await saveGeometry(testInfo, `responsive-surfaces-${viewport.width}x${viewport.height}`, evidence)
  })
}

test('real Skeleton and stale refresh remove animation under reduced motion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: String(testInfo.project.use.baseURL) }])
  const agentsPending = deferred<JsonResponse>()
  const fixture = await installFixture(page, agentsPending.promise)
  await page.goto('/agents?tab=agents', { waitUntil: 'domcontentloaded' })
  const registry = page.getByRole('region', { name: 'Registry' })
  const skeletonOwner = registry.getByRole('status', { name: 'Loading Agent workspace' })
  const skeleton = skeletonOwner.locator('[role="presentation"]').first()
  await expect(skeletonOwner).toBeVisible()
  await expect(skeleton).toBeVisible()
  const skeletonAnimation = await skeleton.evaluate(element => getComputedStyle(element).animationName)
  expect(skeletonAnimation).toBe('none')
  agentsPending.resolve({ body: { items: [agent], nextCursor: null } })
  await expect(page.getByText(agent.name, { exact: true }).first()).toBeVisible()

  await page.goto('/?view=my-work&layout=list', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: workItem.title })).toBeVisible()
  const refreshPending = deferred<JsonResponse>()
  fixture.setNextWorkResponse(refreshPending.promise)
  await page.getByRole('combobox', { name: `Move ${workItem.title}` }).selectOption(states[1]!.id)
  const stale = page.locator('[data-stale="true"]')
  await expect(stale).toBeVisible()
  const refreshingState = page.getByTestId('work-surface-state-refreshing')
  await expect(refreshingState).toBeVisible()
  const staleAnimation = await stale.evaluate(element => getComputedStyle(element).animationName)
  expect(staleAnimation).toBe('none')
  const stateVisible = await refreshingState.locator('[aria-hidden="true"]').first().isVisible()
  await saveGeometry(testInfo, 'reduced-motion-real-products', { skeletonAnimation, staleAnimation, stateVisible })
  await saveSurface(page, 'reduced-motion-real-products')
  refreshPending.resolve({ body: { items: [{ ...workItem, status_id: states[1]!.id, status_name: states[1]!.name, status_category: states[1]!.category, revision: 3 }], nextCursor: null } })
  await expect(stale).toHaveCount(0)
  expect(stateVisible).toBe(true)
  expect(fixture.unexpected).toEqual([])
})
