import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const webUrl = 'http://127.0.0.1:3200'
const apiUrl = 'http://127.0.0.1:3201'
const validRunSessionId = '11111111-1111-4111-8111-111111111111'
const headers = {
  'Access-Control-Allow-Origin': webUrl,
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
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

type FeatureKey = typeof canonicalFeatures[number]['key']

const operations = 'WORKMESH_BETA_OPERATIONS_UI' as const
const allOperationsFeatures: readonly FeatureKey[] = [
  operations,
  'WORKMESH_BETA_COSTS',
  'WORKMESH_BETA_PLANNING',
  'WORKMESH_EXPERIMENTAL_AUTOMATION',
  'WORKMESH_EXPERIMENTAL_AGENT_LOOPS',
  'WORKMESH_BETA_TEMPLATES',
]

const sectionHrefs = [
  '#operations-metrics',
  '#operations-cycles',
  '#operations-initiatives',
  '#operations-automation',
  '#operations-loops',
  '#operations-runs',
  '#operations-templates',
]

const repeated = (count: number) => Array.from({ length: count }, (_, index) => index + 1)

const collectionPaths = [
  '/api/v1/cycles',
  '/api/v1/initiatives',
  '/api/v1/automation-rules',
  '/api/v1/loops',
  '/api/v1/automation-runs',
  '/api/v1/templates',
] as const
type CollectionPath = typeof collectionPaths[number]
type UsageFixture = Readonly<{
  input_tokens: string
  output_tokens: string
  runtime_ms: string
  tool_calls: string
  unknown_cost_records: number
  currency_buckets: ReadonlyArray<Readonly<{
    currency: string
    known_cost_minor: string
    unknown_cost_records: number
  }>>
}>
const defaultUsage: UsageFixture = {
  input_tokens: '1200',
  output_tokens: '300',
  runtime_ms: '45000',
  tool_calls: '7',
  unknown_cost_records: 0,
  currency_buckets: [],
}
const largeUsage: UsageFixture = {
  input_tokens: '9007199254740993',
  output_tokens: '7',
  runtime_ms: '3660500',
  tool_calls: '9007199254740995',
  unknown_cost_records: 6,
  currency_buckets: [
    { currency: 'USD', known_cost_minor: '9007199254740993', unknown_cost_records: 1 },
    { currency: 'JPY', known_cost_minor: '1234', unknown_cost_records: 0 },
    { currency: 'KWD', known_cost_minor: '1234', unknown_cost_records: 2 },
    { currency: 'ZZZ', known_cost_minor: '12345678901234567890', unknown_cost_records: 3 },
  ],
}
type SettingsTeamFixture = Readonly<{
  id: string
  name: string
  key: string
  revision: number
}>
type SettingsTeamPageFixture = Readonly<{
  items: readonly SettingsTeamFixture[]
  nextCursor: string | null
}>
type SettingsStateFixture = Readonly<{
  id: string
  name: string
  category: string
  color: string
  revision: number
}>
type SettingsDeleteResponse = Readonly<{
  abort?: boolean
  body?: unknown
  status?: number
}>
const settingsTeamOne: SettingsTeamFixture = {
  id: 'team-1',
  name: 'Runtime',
  key: 'RUN',
  revision: 1,
}
const settingsTeamTwo: SettingsTeamFixture = {
  id: 'team-second-page',
  name: 'Platform',
  key: 'PLAT',
  revision: 2,
}
const settingsRouteFixtures = {
  settingsTeamPages: {
    first: { items: [settingsTeamOne], nextCursor: null },
  },
  settingsStates: {
    [settingsTeamOne.id]: [{ id: 'state-runtime', name: 'Ready', category: 'planned', color: '#64748b', revision: 1 }],
  },
} satisfies Pick<OperationsRouteOptions, 'settingsTeamPages' | 'settingsStates'>
type OperationsRouteOptions = Readonly<{
  usageDelayMs?: number
  usage?: () => UsageFixture
  collectionDelayMs?: Partial<Record<CollectionPath, number>>
  collectionDeferred?: Partial<Record<CollectionPath, Promise<void>>>
  emptyCollections?: readonly CollectionPath[]
  requestLog?: string[]
  paginatedRuns?: boolean
  settingsTeamPages?: Readonly<Record<string, SettingsTeamPageFixture>>
  settingsStates?: Readonly<Record<string, readonly SettingsStateFixture[]>>
  settingsDelete?: (request: Request) => Promise<SettingsDeleteResponse> | SettingsDeleteResponse
}>

const collectionPathSet = new Set<string>(collectionPaths)
const isCollectionPath = (path: string): path is CollectionPath => collectionPathSet.has(path)

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

async function installOperationsRoutes(
  page: Page,
  enabled: () => readonly FeatureKey[],
  options: OperationsRouteOptions = {},
) {
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    options.requestLog?.push(url.toString())
    const body = (payload: unknown) => route.fulfill({ status: 200, headers, body: JSON.stringify(payload) })
    if (path === '/api/v1/features') return body({
      features: canonicalFeatures.map(feature => ({ ...feature, enabled: enabled().includes(feature.key) })),
    })
    if (route.request().method() === 'DELETE' && /^\/api\/v1\/teams\/[^/]+$/.test(path) && options.settingsDelete) {
      const response = await options.settingsDelete(route.request())
      if (response.abort) return route.abort('failed')
      return route.fulfill({
        status: response.status ?? 204,
        headers,
        body: response.body === undefined ? '' : JSON.stringify(response.body),
      })
    }
    if (path === '/api/v1/teams' && options.settingsTeamPages) {
      const pageKey = url.searchParams.get('cursor') ?? 'first'
      return body(options.settingsTeamPages[pageKey] ?? { items: [], nextCursor: null })
    }
    const settingsStateMatch = path.match(/^\/api\/v1\/teams\/([^/]+)\/states$/)
    if (settingsStateMatch && options.settingsStates) {
      const teamId = decodeURIComponent(settingsStateMatch[1]!)
      return body({ items: options.settingsStates[teamId] ?? [], nextCursor: null })
    }
    if (path === `/api/v1/agent-sessions/${validRunSessionId}`) return body({
      id: validRunSessionId,
      agent_id: 'agent-operations',
      agent_actor_id: 'actor-operations',
      principal_human_actor_id: 'human-operations',
      delegation_id: 'delegation-operations',
      work_item_id: null,
      state: 'completed',
      state_reason: null,
      revision: 3,
      current_plan_version_id: null,
      budget: { maxRuntimeSeconds: 120 },
      last_heartbeat_at: '2026-08-23T01:05:00Z',
      retry_of_session_id: null,
      stop_requested_at: null,
      error_code: null,
      error_summary: null,
      created_at: '2026-08-23T01:00:00Z',
      updated_at: '2026-08-23T01:05:00Z',
    })
    if (
      path === `/api/v1/agent-sessions/${validRunSessionId}/activities`
      || path === `/api/v1/agent-sessions/${validRunSessionId}/plans`
      || path === '/api/v1/artifacts'
      || path === '/api/v1/approvals'
      || path === '/api/v1/actors/humans'
    ) return body({ items: [], nextCursor: null })
    if (path === '/api/v1/usage-summary') {
      if (options.usageDelayMs) await new Promise(resolve => setTimeout(resolve, options.usageDelayMs))
      return body(options.usage?.() ?? defaultUsage)
    }
    if (isCollectionPath(path)) {
      const delay = options.collectionDelayMs?.[path]
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      const collectionDeferred = options.collectionDeferred?.[path]
      if (collectionDeferred) await collectionDeferred
      if (options.emptyCollections?.includes(path)) return body({ items: [], nextCursor: null })
    }
    if (path === '/api/v1/cycles') return body({
      items: [
        { id: 'cycle-current', name: 'Nightly planning', state: 'current', starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-08-31T00:00:00Z', total_items: 12, completed_items: 5 },
        { id: 'cycle-upcoming', name: 'Launch readiness', state: 'upcoming', starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-09-30T00:00:00Z', total_items: 8, completed_items: 0 },
        { id: 'cycle-history', name: 'Foundation review', state: 'history', starts_at: '2026-07-01T00:00:00Z', ends_at: '2026-07-31T00:00:00Z', total_items: 10, completed_items: 10 },
      ],
      nextCursor: null,
    })
    if (path === '/api/v1/initiatives') return body({
      items: [
        { id: 'initiative-1', name: 'Runtime reliability', status: 'active', priority: 'urgent', health: 'on_track' },
        { id: 'initiative-2', name: 'Queue recovery', status: 'planned', priority: 'high', health: 'at_risk' },
        { id: 'initiative-3', name: 'Legacy retirement', status: 'paused', priority: 'medium', health: 'off_track' },
        { id: 'initiative-4', name: 'Documentation', status: 'completed', priority: 'low', health: 'unknown' },
        { id: 'initiative-5', name: 'Discarded experiment', status: 'canceled', priority: 'none', health: 'unknown' },
      ],
      nextCursor: null,
    })
    if (path === '/api/v1/automation-rules') return body({
      items: repeated(8).map(index => ({
        id: `rule-${index}`,
        name: index === 1 ? 'Webhook retry' : `Rule ${index}`,
        state: index === 1 ? 'disabled' : index === 2 ? 'paused' : 'active',
        revision: 1,
        version: 1,
        trigger: index === 1 ? { type: 'schedule', cron: '0 2 * * *', timezone: 'UTC' } : { type: 'event' },
      })),
      nextCursor: null,
    })
    if (path === '/api/v1/loops') return body({
      items: repeated(6).map(index => ({ id: `loop-${index}`, name: index === 1 ? 'Release guard' : `Loop ${index}`, state: index === 1 ? 'disabled' : index === 2 ? 'paused' : 'active', revision: 1, next_run_at: '2026-08-23T02:00:00Z', no_overlap: index !== 3 })),
      nextCursor: null,
    })
    if (path === '/api/v1/automation-runs') {
      if (url.searchParams.get('cursor') === 'runs-page-2') return body({
        items: [{ id: 'run-page2-match', rule_id: 'rule-1', loop_id: null, session_id: null, dry_run: false, status: 'failed', attempt_count: 3, max_attempts: 3, created_at: '2026-08-23T03:00:00Z', last_error: 'Delayed retry queue exhausted' }],
        nextCursor: null,
      })
      const statuses = ['pending', 'claimed', 'running', 'succeeded', 'failed', 'dead', 'canceled', 'dry_run'] as const
      return body({
        items: repeated(8).map(index => ({
          id: `run-${String(index).padStart(4, '0')}-record`,
          rule_id: `rule-${index}`,
          loop_id: null,
          session_id: index === 1 ? validRunSessionId : null,
          dry_run: statuses[index - 1] === 'dry_run',
          status: statuses[index - 1],
          attempt_count: index === 5 ? 3 : 1,
          max_attempts: 3,
          created_at: '2026-08-23T01:00:00Z',
          last_error: index === 5
            ? 'Provider retry failed after the upstream execution service returned a deliberately long diagnostic summary that must wrap inside the local table without widening the page.'
            : null,
        })),
        nextCursor: options.paginatedRuns ? 'runs-page-2' : null,
      })
    }
    if (path === '/api/v1/templates') return body({
      items: [
        { id: 'template-1', kind: 'work_item', name: 'Issue starter', status: 'draft', version: 1 },
        { id: 'template-2', kind: 'project', name: 'Project launch', status: 'active', version: 2 },
        { id: 'template-3', kind: 'agent_run', name: 'Agent recovery', status: 'archived', version: 3 },
        { id: 'template-4', kind: 'handoff', name: 'Incident handoff', status: 'active', version: 1 },
        { id: 'template-5', kind: 'automation', name: 'Automation bootstrap', status: 'draft', version: 1 },
      ],
      nextCursor: null,
    })
    return route.continue()
  })
}

async function navigationHrefs(page: Page) {
  return page.getByTestId('operations-section-navigation').getByRole('link').evaluateAll(links =>
    links.map(link => link.getAttribute('href')),
  )
}

async function expectWideNavigation(page: Page) {
  const navigation = page.getByTestId('operations-section-navigation')
  await expect(navigation).toBeVisible()
  await expect.poll(() => navigationHrefs(page)).toEqual(sectionHrefs)

  const linkRows = await navigation.getByRole('link').evaluateAll(links =>
    [...new Set(links.map(link => Math.round(link.getBoundingClientRect().top)))],
  )
  expect(linkRows).toHaveLength(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  const targets = page.locator('.operations-section-target')
  await expect(targets).toHaveCount(7)
  expect(await targets.evaluateAll(elements => ({
    ids: elements.map(element => element.id),
    tabIndexes: elements.map(element => element.getAttribute('tabindex')),
  }))).toEqual({
    ids: sectionHrefs.map(href => href.slice(1)),
    tabIndexes: sectionHrefs.map(() => '-1'),
  })

  const runs = navigation.getByRole('link', { name: 'Recent runs' })
  await runs.click()
  await expect(page).toHaveURL(/#operations-runs$/)
  await expect(runs).toHaveAttribute('aria-current', 'location')
  await expect(page.locator('#operations-runs')).toBeFocused()

  await page.getByRole('button', { name: 'Refresh' }).focus()
  await runs.click()
  await expect(page.locator('#operations-runs')).toBeFocused()
  await expect(navigation.locator('[aria-current="location"]')).toHaveCount(1)
}

async function measureOperationsGeometry(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.operations-tab')
    const search = document.querySelector<HTMLElement>('.operations-search')
    const navigation = document.querySelector<HTMLElement>('.operations-section-navigation')
    const panel = document.querySelector<HTMLElement>('#operations-cycles')
    if (!root || !search || !navigation || !panel) throw new Error('Operations geometry target missing')
    const measure = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      root: measure(root),
      search: measure(search),
      navigation: measure(navigation),
      panel: measure(panel),
    }
  })
}

async function measureSettingsGeometry(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('#workmesh-main')
    const content = document.querySelector<HTMLElement>('.settings-page')
    const tabs = content?.querySelector<HTMLElement>(':scope > .wm-tabs') ?? null
    const panel = tabs?.querySelector<HTMLElement>(':scope > .wm-tab-panel:not([hidden])') ?? null
    const operationsRoot = panel?.querySelector<HTMLElement>('.operations-tab') ?? null
    if (!main || !content || !tabs || !panel || !operationsRoot)
      throw new Error('Settings geometry target missing')
    const measure = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, width: rect.width, height: rect.height }
    }
    const style = getComputedStyle(content)
    const innerWidth = content.clientWidth
      - Number.parseFloat(style.paddingLeft)
      - Number.parseFloat(style.paddingRight)
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      main: measure(main),
      content: measure(content),
      contentInnerWidth: innerWidth,
      tabs: measure(tabs),
      panel: measure(panel),
      operationsRoot: measure(operationsRoot),
    }
  })
}

async function measureWorkspaceSettingsGeometry(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('#workmesh-main')
    const content = document.querySelector<HTMLElement>('.settings-page')
    const tabs = content?.querySelector<HTMLElement>(':scope > .wm-tabs') ?? null
    const panel = tabs?.querySelector<HTMLElement>(':scope > .wm-tab-panel') ?? null
    const settingsGrid = panel?.querySelector<HTMLElement>('.settings-grid') ?? null
    const selector = [...document.querySelectorAll<HTMLElement>('.team-switcher select')]
      .find(element => element.getBoundingClientRect().width > 0) ?? null
    if (!main || !content || !tabs || !panel || !settingsGrid || !selector)
      throw new Error('Workspace Settings geometry target missing')
    const measure = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, width: rect.width, height: rect.height }
    }
    const style = getComputedStyle(content)
    const innerWidth = content.clientWidth
      - Number.parseFloat(style.paddingLeft)
      - Number.parseFloat(style.paddingRight)
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      main: measure(main),
      content: measure(content),
      contentInnerWidth: innerWidth,
      tabs: measure(tabs),
      panel: measure(panel),
      settingsGrid: measure(settingsGrid),
      selector: measure(selector),
    }
  })
}

async function removeNextDevelopmentIndicatorForEvidence(page: Page) {
  return page.evaluate(() => {
    const indicators = [...document.querySelectorAll('nextjs-portal')]
    for (const indicator of indicators) indicator.remove()
    return indicators.length
  })
}

async function measureDeleteTeamDialogGeometry(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('.delete-team-dialog')
    const content = dialog?.querySelector<HTMLElement>('.ui-dialog-content') ?? null
    const facts = dialog?.querySelector<HTMLElement>('.delete-team-facts') ?? null
    const actions = dialog?.querySelector<HTMLElement>('.delete-team-actions') ?? null
    if (!dialog || !content || !facts || !actions) throw new Error('Delete Team dialog geometry target missing')
    const measure = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      return { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width }
    }
    const dialogRect = measure(dialog)
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      dialog: dialogRect,
      content: measure(content),
      facts: measure(facts),
      actions: measure(actions),
      contentScroll: {
        clientHeight: content.clientHeight,
        scrollHeight: content.scrollHeight,
      },
      centeredDelta: Math.abs(dialogRect.left - (window.innerWidth - dialogRect.right)),
      overflowCount: [...dialog.querySelectorAll<HTMLElement>('*')]
        .filter(element => element.scrollWidth > element.clientWidth + 1).length,
    }
  })
}

async function measureRunsTableGeometry(page: Page) {
  return page.getByTestId('operations-table-scroll').evaluate(async element => {
    const scroll = element as HTMLElement
    const table = scroll.querySelector<HTMLTableElement>('table')
    const headers = [...scroll.querySelectorAll<HTMLTableCellElement>('thead th')]
    const firstHeader = headers[0]
    if (!table || !firstHeader || headers.length !== 6) throw new Error('Runs table geometry target missing')

    const measure = (target: HTMLElement) => {
      const rect = target.getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }
    scroll.scrollLeft = 0
    scroll.scrollTop = 0
    scroll.focus()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const wrapper = measure(scroll)
    const tableRect = measure(table)
    const columnWidths = headers.map(header => measure(header).width)

    scroll.scrollLeft = scroll.scrollWidth
    scroll.scrollTop = scroll.scrollHeight
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const stickyHeader = measure(firstHeader)
    const focusStyle = getComputedStyle(scroll)

    return {
      wrapper,
      table: tableRect,
      columnWidths,
      clientWidth: scroll.clientWidth,
      scrollWidth: scroll.scrollWidth,
      clientHeight: scroll.clientHeight,
      scrollHeight: scroll.scrollHeight,
      scrollLeftAfter: scroll.scrollLeft,
      scrollTopAfter: scroll.scrollTop,
      stickyHeaderTopAfter: stickyHeader.top,
      focusOutlineStyle: focusStyle.outlineStyle,
      focusOutlineWidth: focusStyle.outlineWidth,
    }
  })
}

async function measureUsageMetricsGeometry(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('#operations-metrics')
    const grid = section?.querySelector<HTMLElement>('.operations-metrics-grid') ?? null
    const cards = grid ? [...grid.querySelectorAll<HTMLElement>('.operations-metric-card')] : []
    if (!section || !grid || cards.length === 0) throw new Error('Usage metrics geometry target missing')
    const measure = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right }
    }
    const cardRects = cards.map(measure)
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      section: measure(section),
      grid: measure(grid),
      cards: cardRects,
      rowCount: new Set(cardRects.map(card => Math.round(card.top))).size,
      overflowingCardCount: cards.filter(card => card.scrollWidth > card.clientWidth).length,
      svgCount: section.querySelectorAll('svg').length,
    }
  })
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])
})

test('keeps disabled and Operations-only deployments out of blank navigation', async ({ page }) => {
  let enabled: readonly FeatureKey[] = []
  await installOperationsRoutes(page, () => enabled)

  await page.goto('/operations')
  await expect(page.getByTestId('operations-disabled')).toBeVisible()
  await expect(page.getByTestId('operations-section-navigation')).toHaveCount(0)

  enabled = [operations]
  await page.reload()
  await expect(page.getByTestId('operations-sections-empty')).toContainText('No Operations modules are available')
  await expect(page.getByTestId('operations-section-navigation')).toHaveCount(0)
  await expect(page.locator('.operations-grid')).toHaveCount(0)
})

test('matches each child feature to only its owned anchors', async ({ page }) => {
  let enabled: readonly FeatureKey[] = [operations, 'WORKMESH_BETA_COSTS']
  await installOperationsRoutes(page, () => enabled)
  const matrix: Array<readonly [FeatureKey, readonly string[]]> = [
    ['WORKMESH_BETA_COSTS', ['#operations-metrics']],
    ['WORKMESH_BETA_PLANNING', ['#operations-cycles', '#operations-initiatives']],
    ['WORKMESH_EXPERIMENTAL_AUTOMATION', ['#operations-automation', '#operations-runs']],
    ['WORKMESH_EXPERIMENTAL_AGENT_LOOPS', ['#operations-loops']],
    ['WORKMESH_BETA_TEMPLATES', ['#operations-templates']],
  ]

  for (const [feature, expected] of matrix) {
    enabled = [operations, feature]
    await page.goto(`/operations?feature=${encodeURIComponent(feature)}`)
    await expect.poll(() => navigationHrefs(page)).toEqual(expected)
  }
})

test('proves all eight feature sets on standalone and embedded surfaces without unrelated Operations requests', async ({ context }) => {
  test.slow()
  expect(canonicalFeatures).toHaveLength(11)

  const relevantDataPaths = ['/api/v1/usage-summary', ...collectionPaths] as const
  const relevantDataPathSet = new Set<string>(relevantDataPaths)
  const scenarios: Array<Readonly<{
    name: string
    enabled: readonly FeatureKey[]
    hrefs: readonly string[]
    apiPaths: readonly string[]
    hasSearch: boolean
  }>> = [
    { name: 'master-off', enabled: [], hrefs: [], apiPaths: [], hasSearch: false },
    { name: 'Operations-only', enabled: [operations], hrefs: [], apiPaths: [], hasSearch: false },
    {
      name: 'Planning-only',
      enabled: [operations, 'WORKMESH_BETA_PLANNING'],
      hrefs: ['#operations-cycles', '#operations-initiatives'],
      apiPaths: ['/api/v1/cycles', '/api/v1/initiatives'],
      hasSearch: true,
    },
    {
      name: 'Costs-only',
      enabled: [operations, 'WORKMESH_BETA_COSTS'],
      hrefs: ['#operations-metrics'],
      apiPaths: ['/api/v1/usage-summary'],
      hasSearch: false,
    },
    {
      name: 'Automation-only',
      enabled: [operations, 'WORKMESH_EXPERIMENTAL_AUTOMATION'],
      hrefs: ['#operations-automation', '#operations-runs'],
      apiPaths: ['/api/v1/automation-rules', '/api/v1/automation-runs'],
      hasSearch: true,
    },
    {
      name: 'Loops-only',
      enabled: [operations, 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS'],
      hrefs: ['#operations-loops'],
      apiPaths: ['/api/v1/loops'],
      hasSearch: true,
    },
    {
      name: 'Templates-only',
      enabled: [operations, 'WORKMESH_BETA_TEMPLATES'],
      hrefs: ['#operations-templates'],
      apiPaths: ['/api/v1/templates'],
      hasSearch: true,
    },
    {
      name: 'all-enabled',
      enabled: allOperationsFeatures,
      hrefs: sectionHrefs,
      apiPaths: relevantDataPaths,
      hasSearch: true,
    },
  ]
  const surfaces = [
    { name: 'standalone', url: '/operations' },
    { name: 'embedded', url: '/settings?tab=operations' },
  ] as const

  for (const scenario of scenarios) {
    for (const surface of surfaces) {
      const scenarioPage = await context.newPage()
      const requestLog: string[] = []
      const label = `${scenario.name} / ${surface.name}`
      try {
        await installOperationsRoutes(scenarioPage, () => scenario.enabled, { requestLog })
        await scenarioPage.goto(surface.url)

        if (scenario.name === 'master-off') {
          await expect(scenarioPage.getByTestId('operations-disabled'), label).toBeVisible()
        } else if (scenario.name === 'Operations-only') {
          await expect(scenarioPage.getByTestId('operations-sections-empty'), label).toBeVisible()
        }

        const navigation = scenarioPage.getByTestId('operations-section-navigation')
        if (scenario.hrefs.length === 0) {
          await expect(navigation, `${label}: navigation`).toHaveCount(0)
        } else {
          await expect(navigation, `${label}: navigation`).toBeVisible()
          await expect.poll(
            () => navigationHrefs(scenarioPage),
            { message: `${label}: ordered anchors` },
          ).toEqual(scenario.hrefs)
        }

        const targets = scenarioPage.locator('.operations-section-target')
        await expect(targets, `${label}: target count`).toHaveCount(scenario.hrefs.length)
        expect(
          await targets.evaluateAll(elements => elements.map(element => `#${element.id}`)),
          `${label}: ordered targets`,
        ).toEqual(scenario.hrefs)
        for (const href of sectionHrefs) {
          await expect(
            scenarioPage.locator(href),
            `${label}: ${scenario.hrefs.includes(href) ? 'owned' : 'hidden'} target ${href}`,
          ).toHaveCount(scenario.hrefs.includes(href) ? 1 : 0)
        }

        await expect(
          scenarioPage.getByTestId('operations-search'),
          `${label}: search ${scenario.hasSearch ? 'present' : 'absent'}`,
        ).toHaveCount(scenario.hasSearch ? 1 : 0)

        await expect.poll(
          () => requestLog.some(value => new URL(value).pathname === '/api/v1/features'),
          { message: `${label}: feature registry request completed` },
        ).toBe(true)
        const expectedApiPaths = [...scenario.apiPaths].sort()
        const observedApiPaths = () => [...new Set(
          requestLog
            .map(value => new URL(value).pathname)
            .filter(path => relevantDataPathSet.has(path)),
        )].sort()
        if (expectedApiPaths.length > 0) {
          await expect.poll(
            observedApiPaths,
            { message: `${label}: relevant API presence and absence` },
          ).toEqual(expectedApiPaths)
        }
        await scenarioPage.evaluate(() => new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        }))
        expect(observedApiPaths(), `${label}: zero unrelated Operations endpoints`).toEqual(expectedApiPaths)
      } finally {
        await scenarioPage.close()
      }
    }
  }
})

test('keeps real Operations controls in the initial viewport at supported widths', async ({ page }) => {
  await installOperationsRoutes(page, () => allOperationsFeatures)
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto(`/operations?viewport=${viewport.width}`)
    const box = await page.getByTestId('operations-section-navigation').boundingBox()
    expect(box, `${viewport.width}x${viewport.height} navigation bounds`).not.toBeNull()
    expect(box?.y ?? viewport.height).toBeLessThan(viewport.height)
  }
})

test('scrolls an asynchronously mounted direct-hash target into view before focusing it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installOperationsRoutes(page, () => allOperationsFeatures, { usageDelayMs: 250 })
  await page.goto('/operations#operations-runs')

  const navigation = page.getByTestId('operations-section-navigation')
  const runs = navigation.getByRole('link', { name: 'Recent runs' })
  const target = page.locator('#operations-runs')
  await expect(runs).toHaveAttribute('aria-current', 'location')
  await expect(target).toBeFocused()
  await expect.poll(async () => (await target.boundingBox())?.y ?? 900).toBeLessThan(900)
})

test('restores embedded current state without taking focus when the real Settings tab becomes visible', async ({ page }, testInfo) => {
  await installOperationsRoutes(page, () => allOperationsFeatures, settingsRouteFixtures)
  await page.goto('/settings?tab=workspace&team=team-1&opsQuery=Archived&x=keep#operations-runs')
  const workspaceTab = page.getByRole('tab', { name: 'Workspace' })
  await expect(workspaceTab).toHaveAttribute('aria-selected', 'true')

  const beforeMount = await page.evaluate(async () => {
    window.scrollTo(0, Math.min(120, document.documentElement.scrollHeight - window.innerHeight))
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return { scrollY: window.scrollY, viewportHeight: window.innerHeight }
  })
  expect(beforeMount.scrollY).toBeGreaterThan(0)
  const workspaceTabBox = await workspaceTab.boundingBox()
  expect(workspaceTabBox).not.toBeNull()
  expect(workspaceTabBox?.y ?? -1).toBeGreaterThanOrEqual(0)
  expect((workspaceTabBox?.y ?? beforeMount.viewportHeight) + (workspaceTabBox?.height ?? 0)).toBeLessThan(beforeMount.viewportHeight)

  const operationsTab = page.getByRole('tab', { name: 'Planning & Operations' })
  await operationsTab.click()
  const navigation = page.getByTestId('operations-section-navigation')
  await expect(navigation).toBeVisible()
  await expect(page).toHaveURL('/settings?tab=operations&team=team-1&opsQuery=Archived&x=keep#operations-runs')
  await expect(navigation.getByRole('link', { name: 'Recent runs' })).toHaveAttribute('aria-current', 'location')
  await expect(operationsTab).toBeFocused()
  const runsTarget = page.locator('#operations-runs')
  await expect(runsTarget).not.toBeFocused()
  const afterMount = await runsTarget.evaluate(element => ({
    scrollY: window.scrollY,
    targetTop: element.getBoundingClientRect().top,
    viewportHeight: window.innerHeight,
  }))
  expect(Math.abs(afterMount.scrollY - beforeMount.scrollY)).toBeLessThanOrEqual(1)
  expect(afterMount.targetTop).toBeGreaterThan(afterMount.viewportHeight)

  const localeControl = page.getByRole('button', { exact: true, name: 'EN' })
  await localeControl.focus()
  const templatesTarget = page.locator('#operations-templates')
  const beforeHash = await templatesTarget.evaluate(element => ({
    scrollY: window.scrollY,
    targetTop: element.getBoundingClientRect().top,
  }))
  await page.evaluate(() => {
    const url = new URL(window.location.href)
    url.hash = '#operations-templates'
    window.history.replaceState(window.history.state, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  await expect(navigation.getByRole('link', { name: 'Templates' })).toHaveAttribute('aria-current', 'location')
  const afterHash = await templatesTarget.evaluate(element => ({
    scrollY: window.scrollY,
    targetTop: element.getBoundingClientRect().top,
  }))
  expect(Math.abs(afterHash.scrollY - beforeHash.scrollY)).toBeLessThanOrEqual(1)
  expect(Math.abs(afterHash.targetTop - beforeHash.targetTop)).toBeLessThanOrEqual(1)
  await expect(localeControl).toBeFocused()
  await expect(templatesTarget).not.toBeFocused()

  const beforePopstate = await runsTarget.evaluate(element => ({
    scrollY: window.scrollY,
    targetTop: element.getBoundingClientRect().top,
  }))
  await page.evaluate(() => {
    const url = new URL(window.location.href)
    url.hash = '#operations-runs'
    window.history.replaceState(window.history.state, '', url)
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  })
  await expect(navigation.getByRole('link', { name: 'Recent runs' })).toHaveAttribute('aria-current', 'location')
  const afterPopstate = await runsTarget.evaluate(element => ({
    scrollY: window.scrollY,
    targetTop: element.getBoundingClientRect().top,
  }))
  expect(Math.abs(afterPopstate.scrollY - beforePopstate.scrollY)).toBeLessThanOrEqual(1)
  expect(Math.abs(afterPopstate.targetTop - beforePopstate.targetTop)).toBeLessThanOrEqual(1)
  await expect(localeControl).toBeFocused()
  await expect(runsTarget).not.toBeFocused()

  const evidencePath = testInfo.outputPath('task-5.1-embedded-passive-scroll-pass.json')
  await writeFile(evidencePath, JSON.stringify({
    beforeMount,
    workspaceTabBox,
    afterMount,
    hashchange: { before: beforeHash, after: afterHash },
    popstate: { before: beforePopstate, after: afterPopstate },
  }, null, 2), 'utf8')
  await testInfo.attach('task-5.1-embedded-passive-scroll-pass', {
    contentType: 'application/json',
    path: evidencePath,
  })
})

test('keeps Settings route history, shared responsive semantics, and dense 390/1920 geometry', async ({ page }, testInfo) => {
  const directUrl = '/settings?tab=operations&team=team-1&opsQuery=Archived&x=keep#operations-templates'
  const routedOperationsUrl = '/settings?team=team-1&opsQuery=Archived&x=keep&tab=operations#operations-templates'
  await installOperationsRoutes(page, () => allOperationsFeatures, settingsRouteFixtures)

  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(directUrl)
  const operationsTab = page.getByRole('tab', { name: 'Planning & Operations' })
  const workspaceTab = page.getByRole('tab', { name: 'Workspace' })
  await expect(operationsTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('searchbox', { name: 'Search loaded Operations records' })).toHaveValue('Archived')
  await expect(page.getByRole('link', { name: 'Templates' })).toHaveAttribute('aria-current', 'location')
  await expect(page).toHaveURL(`${webUrl}${directUrl}`)

  await page.reload()
  await expect(page.getByRole('tab', { name: 'Planning & Operations' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('link', { name: 'Templates' })).toHaveAttribute('aria-current', 'location')
  await expect(page).toHaveURL(`${webUrl}${directUrl}`)
  await page.evaluate(() => window.history.replaceState({ ...window.history.state, task51: 'kept' }, '', window.location.href))

  const initialLength = await page.evaluate(() => window.history.length)
  await page.getByRole('tab', { name: 'Workspace' }).click()
  await expect(page).toHaveURL(`${webUrl}/settings?team=team-1&opsQuery=Archived&x=keep#operations-templates`)
  expect(await page.evaluate(() => window.history.length)).toBe(initialLength + 1)
  expect(await page.evaluate(() => window.history.state.task51)).toBe('kept')

  await page.getByRole('tab', { name: 'Workspace' }).click()
  expect(await page.evaluate(() => window.history.length)).toBe(initialLength + 1)

  await page.getByRole('tab', { name: 'Workspace' }).press('End')
  await expect(page.getByRole('tab', { name: 'Planning & Operations' })).toBeFocused()
  await expect(page).toHaveURL(`${webUrl}${routedOperationsUrl}`)
  expect(await page.evaluate(() => window.history.length)).toBe(initialLength + 2)

  await page.getByRole('tab', { name: 'Planning & Operations' }).press('End')
  expect(await page.evaluate(() => window.history.length)).toBe(initialLength + 2)
  await page.getByRole('tab', { name: 'Planning & Operations' }).press('Home')
  await expect(page.getByRole('tab', { name: 'Workspace' })).toBeFocused()
  expect(await page.evaluate(() => window.history.length)).toBe(initialLength + 3)
  await page.getByRole('tab', { name: 'Workspace' }).press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Planning & Operations' })).toBeFocused()
  expect(await page.evaluate(() => window.history.length)).toBe(initialLength + 4)

  const localeControl = page.getByRole('button', { exact: true, name: 'EN' })
  await localeControl.focus()
  await page.goBack()
  await expect(page).toHaveURL(`${webUrl}/settings?team=team-1&opsQuery=Archived&x=keep#operations-templates`)
  await expect(page.getByRole('tab', { name: 'Workspace' })).toHaveAttribute('aria-selected', 'true')
  await expect(localeControl).toBeFocused()
  await page.goForward()
  await expect(page).toHaveURL(`${webUrl}${routedOperationsUrl}`)
  await expect(page.getByRole('tab', { name: 'Planning & Operations' })).toHaveAttribute('aria-selected', 'true')
  await expect(localeControl).toBeFocused()

  const geometry: Awaited<ReturnType<typeof measureSettingsGeometry>>[] = []
  const wide = await measureSettingsGeometry(page)
  geometry.push(wide)
  expect(wide.document.scrollWidth).toBe(wide.document.clientWidth)
  expect(wide.content.width / wide.main.width).toBeGreaterThanOrEqual(.85)
  expect(wide.content.width).toBeLessThanOrEqual(1480)
  expect(wide.panel.width / wide.contentInnerWidth).toBeGreaterThanOrEqual(.98)
  expect(wide.operationsRoot.width / wide.panel.width).toBeGreaterThanOrEqual(.98)
  const wideScreenshot = testInfo.outputPath('task-5.1-settings-wide-pass.png')
  await page.screenshot({ fullPage: true, path: wideScreenshot })
  await testInfo.attach('task-5.1-settings-wide-pass', { contentType: 'image/png', path: wideScreenshot })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(directUrl)
  const selector = page.getByRole('combobox', { name: 'Settings sections' })
  await expect(selector).toHaveValue('operations')
  await expect(page.getByRole('tablist')).toHaveCount(0)
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  await selector.focus()
  await selector.selectOption('workspace')
  await expect(selector).toBeFocused()
  await expect(page).toHaveURL(`${webUrl}/settings?team=team-1&opsQuery=Archived&x=keep#operations-templates`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)

  await selector.selectOption('operations')
  await expect(selector).toBeFocused()
  const narrow = await measureSettingsGeometry(page)
  geometry.push(narrow)
  expect(narrow.document.scrollWidth).toBe(narrow.document.clientWidth)
  expect(narrow.content.width).toBeLessThanOrEqual(390)
  expect(narrow.panel.width / narrow.contentInnerWidth).toBeGreaterThanOrEqual(.98)
  const narrowScreenshot = testInfo.outputPath('task-5.1-settings-narrow-pass.png')
  await page.screenshot({ fullPage: true, path: narrowScreenshot })
  await testInfo.attach('task-5.1-settings-narrow-pass', { contentType: 'image/png', path: narrowScreenshot })

  const geometryPath = testInfo.outputPath('task-5.1-settings-geometry-pass.json')
  await writeFile(geometryPath, JSON.stringify(geometry, null, 2), 'utf8')
  await testInfo.attach('task-5.1-settings-geometry-pass', { contentType: 'application/json', path: geometryPath })
})

test('scopes Team resolution to Workspace with serial deep-link pagination and dense 390/1920 geometry', async ({ page }, testInfo) => {
  const requestLog: string[] = []
  const teamRequestSequence = () => requestLog
    .map(request => new URL(request))
    .filter(url => url.pathname === '/api/v1/teams' || /^\/api\/v1\/teams\/[^/]+\/states$/.test(url.pathname))
    .map(url => `${url.pathname}${url.search}`)
  const resolutionSequence = [
    '/api/v1/teams?limit=100',
    '/api/v1/teams?limit=100&cursor=teams-page-2',
    '/api/v1/teams/team-second-page/states?limit=100',
  ]
  await installOperationsRoutes(page, () => allOperationsFeatures, {
    requestLog,
    settingsTeamPages: {
      first: { items: [settingsTeamOne], nextCursor: 'teams-page-2' },
      'teams-page-2': { items: [settingsTeamTwo], nextCursor: null },
    },
    settingsStates: {
      [settingsTeamOne.id]: [{ id: 'state-runtime', name: 'Ready', category: 'planned', color: '#64748b', revision: 1 }],
      [settingsTeamTwo.id]: [{ id: 'state-platform', name: 'In progress', category: 'started', color: '#2563eb', revision: 1 }],
    },
  })

  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/settings?team=team-second-page&x=keep#team-settings-heading')
  await expect(page).toHaveURL(`${webUrl}/settings?team=team-second-page&x=keep#team-settings-heading`)
  await expect.poll(() => ({ href: page.url(), sequence: teamRequestSequence() })).toEqual({
    href: `${webUrl}/settings?team=team-second-page&x=keep#team-settings-heading`,
    sequence: resolutionSequence,
  })
  await expect(page.getByRole('combobox', { name: 'Current team' })).toHaveValue('team-second-page')
  await expect(page.getByRole('heading', { name: 'Team details' })).toBeVisible()
  await expect(page.locator('input[name="name"][value="Platform"]')).toBeVisible()

  await page.getByRole('tab', { name: 'Planning & Operations' }).click()
  await expect(page.getByRole('tab', { name: 'Planning & Operations' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox', { name: 'Current team' })).toHaveCount(0)
  await expect(page).toHaveURL(`${webUrl}/settings?team=team-second-page&x=keep&tab=operations#team-settings-heading`)
  const operationsRequestBoundary = teamRequestSequence().length
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  expect(teamRequestSequence().slice(operationsRequestBoundary)).toEqual([])

  await page.getByRole('tab', { name: 'Workspace' }).click()
  await expect.poll(teamRequestSequence).toEqual([...resolutionSequence, ...resolutionSequence])
  await expect(page.getByRole('combobox', { name: 'Current team' })).toHaveValue('team-second-page')
  await expect(page).toHaveURL(`${webUrl}/settings?team=team-second-page&x=keep#team-settings-heading`)

  const geometry: Awaited<ReturnType<typeof measureWorkspaceSettingsGeometry>>[] = []
  const wide = await measureWorkspaceSettingsGeometry(page)
  geometry.push(wide)
  expect(wide.document.scrollWidth).toBe(wide.document.clientWidth)
  expect(wide.content.width / wide.main.width).toBeGreaterThanOrEqual(.85)
  expect(wide.content.width).toBeLessThanOrEqual(1480)
  expect(wide.panel.width / wide.contentInnerWidth).toBeGreaterThanOrEqual(.98)
  expect(wide.settingsGrid.width / wide.panel.width).toBeGreaterThanOrEqual(.98)
  expect(wide.selector.width).toBeGreaterThanOrEqual(120)
  expect(wide.selector.width).toBeLessThanOrEqual(260)
  expect(wide.selector.width / wide.main.width).toBeLessThan(.2)
  expect(await removeNextDevelopmentIndicatorForEvidence(page)).toBeGreaterThan(0)
  const wideScreenshot = testInfo.outputPath('task-5.2-settings-wide-pass.png')
  await page.screenshot({ fullPage: true, path: wideScreenshot })
  await testInfo.attach('task-5.2-settings-wide-pass', { contentType: 'image/png', path: wideScreenshot })

  await page.setViewportSize({ width: 390, height: 844 })
  const settingsSelector = page.getByRole('combobox', { name: 'Settings sections' })
  await expect(settingsSelector).toHaveValue('workspace')
  await settingsSelector.selectOption('operations')
  await expect(settingsSelector).toHaveValue('operations')
  await expect(page.getByRole('combobox', { name: 'Current team' })).toHaveCount(0)
  await expect(page).toHaveURL(`${webUrl}/settings?team=team-second-page&x=keep&tab=operations#team-settings-heading`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)

  await settingsSelector.selectOption('workspace')
  await expect(settingsSelector).toHaveValue('workspace')
  await expect.poll(teamRequestSequence).toEqual([
    ...resolutionSequence,
    ...resolutionSequence,
    ...resolutionSequence,
  ])
  await page.getByText('Menu', { exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Current team' })).toHaveValue('team-second-page')
  const narrow = await measureWorkspaceSettingsGeometry(page)
  geometry.push(narrow)
  expect(narrow.document.scrollWidth).toBe(narrow.document.clientWidth)
  expect(narrow.content.width).toBeLessThanOrEqual(390)
  expect(narrow.panel.width / narrow.contentInnerWidth).toBeGreaterThanOrEqual(.98)
  expect(narrow.settingsGrid.width / narrow.panel.width).toBeGreaterThanOrEqual(.98)
  await removeNextDevelopmentIndicatorForEvidence(page)
  const narrowScreenshot = testInfo.outputPath('task-5.2-settings-narrow-pass.png')
  await page.screenshot({ fullPage: true, path: narrowScreenshot })
  await testInfo.attach('task-5.2-settings-narrow-pass', { contentType: 'image/png', path: narrowScreenshot })

  const geometryPath = testInfo.outputPath('task-5.2-settings-team-geometry-pass.json')
  await writeFile(geometryPath, JSON.stringify(geometry, null, 2), 'utf8')
  await testInfo.attach('task-5.2-settings-team-geometry-pass', { contentType: 'application/json', path: geometryPath })
  const requestSequencePath = testInfo.outputPath('task-5.2-team-request-sequence-pass.json')
  await writeFile(requestSequencePath, JSON.stringify({ sequence: teamRequestSequence() }, null, 2), 'utf8')
  await testInfo.attach('task-5.2-team-request-sequence-pass', { contentType: 'application/json', path: requestSequencePath })
})

test('keeps destructive retries revision-specific and contains long failure content at 390', async ({ page }, testInfo) => {
  const longName = `Runtime ${'reliability-and-recovery '.repeat(55)}`.trim()
  const longKey = `RUN-${'LONG-'.repeat(48)}`
  let revision = 7
  let deleteCount = 0
  const privateKeys: string[] = []
  const evidence: Array<{
    bodyLength: number
    count: number
    idempotencyKeyPresent: boolean
    ifMatch: string | undefined
    path: string
    sameAsFirst: boolean | null
  }> = []
  const target: SettingsTeamFixture = {
    id: 'team/delete-target',
    key: longKey,
    name: longName,
    get revision() { return revision },
  }
  const pages = {
    get first(): SettingsTeamPageFixture { return { items: [target, settingsTeamTwo], nextCursor: null } },
  }
  await installOperationsRoutes(page, () => allOperationsFeatures, {
    settingsDelete: request => {
      deleteCount += 1
      const key = request.headers()['idempotency-key'] ?? ''
      privateKeys.push(key)
      evidence.push({
        bodyLength: request.postDataBuffer()?.byteLength ?? 0,
        count: deleteCount,
        idempotencyKeyPresent: key.length > 0,
        ifMatch: request.headers()['if-match'],
        path: new URL(request.url()).pathname,
        sameAsFirst: deleteCount === 1 ? null : key === privateKeys[0],
      })
      if (deleteCount <= 2) return { abort: true }
      return {
        body: { error: { code: 'REVISION_CONFLICT', message: 'private revision diagnostic' } },
        status: 409,
      }
    },
    settingsStates: {
      [target.id]: [{ id: 'state-delete-target', name: 'Ready', category: 'planned', color: '#64748b', revision: 1 }],
      [settingsTeamTwo.id]: [{ id: 'state-platform', name: 'Ready', category: 'planned', color: '#64748b', revision: 1 }],
    },
    settingsTeamPages: pages,
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/settings?team=${encodeURIComponent(target.id)}#team-settings-heading`)
  await expect(page.getByRole('region', { name: 'Team details' }).getByLabel('Team name')).toHaveValue(longName)
  await page.getByRole('button', { name: 'Delete team', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Delete Team' })
  let confirm = dialog.getByRole('button', { name: new RegExp(`Delete Team ${longName.slice(0, 28)}`) })
  await confirm.click()
  await expect(dialog.getByRole('alert')).toHaveText('Unable to delete this Team. Check your connection and try again.')
  await confirm.click()
  await expect.poll(() => deleteCount).toBe(2)
  await expect(dialog.getByRole('alert')).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  revision = 8
  await page.reload()
  await page.getByRole('button', { name: 'Delete team', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Delete Team' })
  confirm = dialog.getByRole('button', { name: new RegExp(`Delete Team ${longName.slice(0, 28)}`) })
  await confirm.click()
  await expect(dialog.getByRole('alert')).toHaveText('This Team changed in another operation. Close this dialog, refresh, and try again.')
  await expect(dialog).not.toContainText('private revision diagnostic')

  const dialogContent = dialog.locator('.ui-dialog-content')
  await dialogContent.evaluate(element => { element.scrollTop = 0 })
  const geometry = await measureDeleteTeamDialogGeometry(page)
  expect(geometry.viewport).toEqual({ width: 390, height: 844 })
  expect(geometry.document.scrollWidth).toBe(geometry.document.clientWidth)
  expect(geometry.dialog.left).toBeGreaterThanOrEqual(-1)
  expect(geometry.dialog.right).toBeLessThanOrEqual(391)
  expect(geometry.dialog.height).toBe(844)
  expect(geometry.contentScroll.scrollHeight).toBeGreaterThan(geometry.contentScroll.clientHeight)
  await dialog.focus()
  await removeNextDevelopmentIndicatorForEvidence(page)
  const topScreenshotPath = testInfo.outputPath('task-5.4-delete-dialog-narrow-top-pass.png')
  await page.screenshot({ path: topScreenshotPath })
  await testInfo.attach('task-5.4-delete-dialog-narrow-top-pass', { contentType: 'image/png', path: topScreenshotPath })
  const scrollMovement = await dialogContent.evaluate(element => {
    const before = element.scrollTop
    element.scrollTop = element.scrollHeight
    return { after: element.scrollTop, before, maximum: element.scrollHeight - element.clientHeight }
  })
  expect(scrollMovement.before).toBe(0)
  expect(scrollMovement.after).toBeGreaterThan(0)
  expect(scrollMovement.after).toBe(scrollMovement.maximum)
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeInViewport()
  expect(evidence).toEqual([
    { bodyLength: 0, count: 1, idempotencyKeyPresent: true, ifMatch: '"revision-7"', path: '/api/v1/teams/team%2Fdelete-target', sameAsFirst: null },
    { bodyLength: 0, count: 2, idempotencyKeyPresent: true, ifMatch: '"revision-7"', path: '/api/v1/teams/team%2Fdelete-target', sameAsFirst: true },
    { bodyLength: 0, count: 3, idempotencyKeyPresent: true, ifMatch: '"revision-8"', path: '/api/v1/teams/team%2Fdelete-target', sameAsFirst: false },
  ])

  const screenshotPath = testInfo.outputPath('task-5.4-delete-dialog-narrow-pass.png')
  await page.screenshot({ path: screenshotPath })
  await testInfo.attach('task-5.4-delete-dialog-narrow-pass', { contentType: 'image/png', path: screenshotPath })
  const evidencePath = testInfo.outputPath('task-5.4-delete-dialog-retry-request-geometry-pass.json')
  await writeFile(evidencePath, JSON.stringify({ geometry, requests: evidence, scrollMovement }, null, 2), 'utf8')
  await testInfo.attach('task-5.4-delete-dialog-retry-request-geometry-pass', { contentType: 'application/json', path: evidencePath })
})

test('blocks busy destructive interaction and focuses a surviving context after committed deletion', async ({ page }, testInfo) => {
  const target = { id: 'team/delete-me', name: 'Runtime Reliability', key: 'RUN', revision: 11 } satisfies SettingsTeamFixture
  const survivor = { id: 'team-survivor', name: 'Platform', key: 'PLAT', revision: 4 } satisfies SettingsTeamFixture
  let deleted = false
  let targetRevision = target.revision
  let releaseDelete = deferred()
  let lastPrivateKey = ''
  const requestEvidence: Array<{
    bodyLength: number
    count: number
    differentFromPrevious: boolean | null
    idempotencyKeyPresent: boolean
    ifMatch: string | undefined
    path: string
  }> = []
  const statePaths: string[] = []
  page.on('request', request => {
    const path = new URL(request.url()).pathname
    if (request.method() === 'GET' && /^\/api\/v1\/teams\/[^/]+\/states$/.test(path)) statePaths.push(path)
  })
  const dynamicTarget: SettingsTeamFixture = {
    ...target,
    get revision() { return targetRevision },
  }
  const pages = {
    get first(): SettingsTeamPageFixture {
      return { items: deleted ? [survivor] : [dynamicTarget, survivor], nextCursor: null }
    },
  }
  await installOperationsRoutes(page, () => allOperationsFeatures, {
    settingsDelete: async request => {
      const key = request.headers()['idempotency-key'] ?? ''
      requestEvidence.push({
        bodyLength: request.postDataBuffer()?.byteLength ?? 0,
        count: requestEvidence.length + 1,
        differentFromPrevious: requestEvidence.length === 0 ? null : key !== lastPrivateKey,
        idempotencyKeyPresent: key.length > 0,
        ifMatch: request.headers()['if-match'],
        path: new URL(request.url()).pathname,
      })
      lastPrivateKey = key
      await releaseDelete.promise
      deleted = true
      return { status: 204 }
    },
    settingsStates: {
      [target.id]: [{ id: 'state-target', name: 'Ready', category: 'planned', color: '#64748b', revision: 1 }],
      [survivor.id]: [{ id: 'state-survivor', name: 'Ready', category: 'planned', color: '#64748b', revision: 1 }],
    },
    settingsTeamPages: pages,
  })

  const geometries: Awaited<ReturnType<typeof measureDeleteTeamDialogGeometry>>[] = []
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`/settings?team=${encodeURIComponent(target.id)}&x=keep#team-settings-heading`)
  await page.getByRole('button', { name: 'Delete team', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Delete Team' })
  const wideGeometry = await measureDeleteTeamDialogGeometry(page)
  geometries.push(wideGeometry)
  expect(wideGeometry.document.scrollWidth).toBe(wideGeometry.document.clientWidth)
  expect(wideGeometry.dialog.width).toBeLessThanOrEqual(560)
  expect(wideGeometry.centeredDelta).toBeLessThanOrEqual(2)
  expect(wideGeometry.overflowCount).toBe(0)
  await removeNextDevelopmentIndicatorForEvidence(page)
  const wideScreenshotPath = testInfo.outputPath('task-5.4-delete-dialog-wide-pass.png')
  await page.screenshot({ path: wideScreenshotPath })
  await testInfo.attach('task-5.4-delete-dialog-wide-pass', { contentType: 'image/png', path: wideScreenshotPath })

  const confirm = dialog.getByRole('button', { name: 'Delete Team Runtime Reliability' })
  await confirm.click()
  await expect.poll(() => requestEvidence.length).toBe(1)
  await expect(dialog.getByRole('status')).toHaveText('Deleting…')
  await expect(dialog).toBeFocused()
  await expect(dialog.getByRole('button', { name: 'Close Delete Team' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await dialog.locator('..').dispatchEvent('mousedown')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(dialog).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog).toBeFocused()
  await confirm.evaluate(element => {
    if (!(element instanceof HTMLButtonElement)) throw new Error('Delete confirmation button missing')
    element.click()
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }))
  })
  expect(requestEvidence).toHaveLength(1)

  await page.evaluate(survivingTeamId => {
    const selector = [...document.querySelectorAll<HTMLSelectElement>('.team-switcher select')]
      .find(element => element.getBoundingClientRect().width > 0)
    if (!selector) throw new Error('Visible Team selector missing')
    selector.value = survivingTeamId
    selector.dispatchEvent(new Event('change', { bubbles: true }))
  }, survivor.id)
  await expect(page).toHaveURL(new RegExp(`team=${survivor.id}`))
  statePaths.length = 0
  releaseDelete.resolve()
  await expect(dialog).toHaveCount(0)
  const desktopSelector = page.getByRole('combobox', { name: 'Current team' })
  await expect(desktopSelector).toHaveValue(survivor.id)
  await expect(desktopSelector).toBeFocused()
  expect(statePaths).not.toContain('/api/v1/teams/team%2Fdelete-me/states')
  await expect(page).toHaveURL(`${webUrl}/settings?team=${survivor.id}&x=keep#team-settings-heading`)

  deleted = false
  targetRevision = 12
  releaseDelete = deferred()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/settings?team=${encodeURIComponent(target.id)}&x=keep#team-settings-heading`)
  await expect(page.locator('.mobile-navigation')).not.toHaveAttribute('open', '')
  await page.getByRole('button', { name: 'Delete team', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Delete Team' })
  const narrowGeometry = await measureDeleteTeamDialogGeometry(page)
  geometries.push(narrowGeometry)
  expect(narrowGeometry.document.scrollWidth).toBe(narrowGeometry.document.clientWidth)
  expect(narrowGeometry.dialog.width).toBe(390)
  await dialog.getByRole('button', { name: 'Delete Team Runtime Reliability' }).click()
  await expect.poll(() => requestEvidence.length).toBe(2)
  releaseDelete.resolve()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(`${webUrl}/settings?team=${survivor.id}&x=keep#team-settings-heading`)
  const teamsHeading = page.getByRole('heading', { name: 'Teams' })
  await expect(teamsHeading).toBeFocused()
  await expect(page.locator('.mobile-navigation')).not.toHaveAttribute('open', '')
  await expect(page.locator('.team-switcher select:focus')).toHaveCount(0)

  expect(requestEvidence).toEqual([
    { bodyLength: 0, count: 1, differentFromPrevious: null, idempotencyKeyPresent: true, ifMatch: '"revision-11"', path: '/api/v1/teams/team%2Fdelete-me' },
    { bodyLength: 0, count: 2, differentFromPrevious: true, idempotencyKeyPresent: true, ifMatch: '"revision-12"', path: '/api/v1/teams/team%2Fdelete-me' },
  ])
  const evidencePath = testInfo.outputPath('task-5.4-delete-dialog-success-request-geometry-pass.json')
  await writeFile(evidencePath, JSON.stringify({ geometries, requests: requestEvidence }, null, 2), 'utf8')
  await testInfo.attach('task-5.4-delete-dialog-success-request-geometry-pass', { contentType: 'application/json', path: evidencePath })
})

test('keeps all-enabled navigation wide, sticky, focus-owned, and shared with Settings', async ({ page }) => {
  test.info().annotations.push({ type: 'viewport', description: '1920x1080 wide-PC acceptance' })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await installOperationsRoutes(page, () => allOperationsFeatures)
  expect(canonicalFeatures).toHaveLength(11)

  await page.goto('/operations')
  await expectWideNavigation(page)

  const standaloneNavigation = page.getByTestId('operations-section-navigation')
  await standaloneNavigation.evaluate(element => element.scrollIntoView({ block: 'start' }))
  await page.evaluate(() => window.scrollBy(0, 160))
  await expect.poll(async () => Math.round((await standaloneNavigation.boundingBox())?.y ?? -1)).toBe(48)

  await page.goto('/settings?tab=operations')
  await expectWideNavigation(page)
  await expect(page).toHaveURL(/tab=operations.*#operations-runs$/)
})

test('keeps a deferred collection in loading state until its first loaded page arrives', async ({ page }) => {
  const cycles = deferred()
  await installOperationsRoutes(page, () => allOperationsFeatures, {
    collectionDeferred: { '/api/v1/cycles': cycles.promise },
  })
  await page.goto('/operations?opsQuery=Current')

  const panel = page.getByTestId('cycles-panel')
  await expect(panel.getByRole('status', { name: 'Loading Cycles' })).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'No Cycles configured' })).toHaveCount(0)
  cycles.resolve()
  await expect(panel.getByText('Nightly planning')).toBeVisible()
})

test('renders successful exhausted collections as server-empty rather than loading or client no-match', async ({ context }) => {
  const page = await context.newPage()
  const requestLog: string[] = []
  try {
    await installOperationsRoutes(page, () => allOperationsFeatures, {
      emptyCollections: collectionPaths,
      requestLog,
    })
    await page.goto('/operations')

    const serverEmptyHeadings = [
      ['cycles-panel', 'No Cycles configured'],
      ['initiatives-panel', 'No Initiatives configured'],
      ['automation-panel', 'No Rules configured'],
      ['loops-panel', 'No Loops configured'],
      ['runs-panel', 'No run history yet'],
      ['templates-panel', 'No Templates configured'],
    ] as const
    for (const [panelId, heading] of serverEmptyHeadings) {
      const panel = page.getByTestId(panelId)
      await expect(panel.getByRole('heading', { name: heading }), `${panelId}: exhausted empty`).toBeVisible()
      await expect(panel.getByRole('heading', { name: /^Loading / }), `${panelId}: not loading`).toHaveCount(0)
      await expect(panel.getByRole('heading', { name: /^No loaded .* match$/ }), `${panelId}: not client no-match`).toHaveCount(0)
    }

    const observedCollectionPaths = [...new Set(
      requestLog
        .map(value => new URL(value).pathname)
        .filter(path => collectionPathSet.has(path)),
    )].sort()
    expect(observedCollectionPaths).toEqual([...collectionPaths].sort())
    expect(requestLog.every(value => !new URL(value).searchParams.has('opsQuery'))).toBe(true)
  } finally {
    await page.close()
  }
})

test('filters only loaded localized values, keeps metrics and pagination, and restores the same-tab URL', async ({ page }) => {
  const requestLog: string[] = []
  await installOperationsRoutes(page, () => allOperationsFeatures, { paginatedRuns: true, requestLog })
  await page.goto('/operations?context=keep#operations-runs')
  const search = page.getByRole('searchbox', { name: 'Search loaded Operations records' })
  await expect(search).toBeVisible()
  await page.evaluate(() => window.history.replaceState({ ...window.history.state, task42: 'keep' }, '', window.location.href))

  await search.fill('Current')
  await expect(page.getByTestId('cycles-panel').getByText('Nightly planning')).toBeVisible()
  await expect(page.locator('#operations-metrics')).toBeVisible()
  await expect(page.locator('#operations-metrics')).toContainText('Tokens')
  expect(await page.evaluate(() => window.history.state.task42)).toBe('keep')
  expect(new URL(page.url()).searchParams.get('context')).toBe('keep')
  expect(new URL(page.url()).hash).toBe('#operations-runs')

  await search.fill('On track')
  await expect(page.getByTestId('initiatives-panel').getByText('Runtime reliability')).toBeVisible()
  await search.fill('on_track')
  await expect(page.getByTestId('initiatives-panel').getByText('Runtime reliability')).toHaveCount(0)

  await search.fill('Webhook retry')
  await expect(page.getByTestId('automation-panel').getByText('Webhook retry')).toBeVisible()
  await expect(page.getByTestId('automation-panel')).toContainText('Disabled')
  await search.fill('schedule 0 2 * * *')
  await expect(page.getByTestId('automation-panel').getByText('Webhook retry')).toBeVisible()
  await expect(page.getByTestId('automation-panel')).toContainText('v1 · schedule 0 2 * * *')
  await search.fill('Release guard')
  await expect(page.getByTestId('loops-panel').getByText('Release guard')).toBeVisible()
  await expect(page.getByTestId('loops-panel')).toContainText('No overlap')

  await search.fill('Dry run')
  await expect(page.getByTestId('runs-panel').getByText('run-0008')).toBeVisible()
  await search.fill('dry_run')
  await expect(page.getByTestId('runs-panel').getByText('run-0008')).toHaveCount(0)

  await search.fill('Agent run')
  await expect(page.getByTestId('templates-panel').getByText('Agent recovery')).toBeVisible()
  await search.fill('agent_run')
  await expect(page.getByTestId('templates-panel').getByText('Agent recovery')).toHaveCount(0)

  await search.fill('Delayed retry queue exhausted')
  await expect(page.getByTestId('runs-panel').getByRole('heading', { name: 'No loaded Recent runs match' })).toBeVisible()
  await expect(page.locator('#operations-metrics')).toBeVisible()
  await expect(page.locator('#operations-metrics')).toContainText('Tokens')
  await page.getByRole('button', { name: 'Load more Recent runs' }).click()
  await expect(page.getByTestId('runs-panel').getByText('Delayed retry queue exhausted')).toBeVisible()

  await page.reload()
  await expect(search).toHaveValue('Delayed retry queue exhausted')
  await expect(page.getByRole('button', { name: 'Load more Recent runs' })).toBeVisible()
  await search.fill('Current')
  await page.evaluate(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('opsQuery', 'On track')
    window.history.pushState({ ...window.history.state, task42: 'keep' }, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(search).toHaveValue('On track')
  await page.goBack()
  await expect(search).toHaveValue('Current')
  await page.goForward()
  await expect(search).toHaveValue('On track')

  await page.goto('/settings?tab=operations&context=keep&opsQuery=Agent+run#operations-templates')
  const embeddedSearch = page.getByRole('searchbox', { name: 'Search loaded Operations records' })
  await expect(embeddedSearch).toHaveValue('Agent run')
  await embeddedSearch.fill('Archived')
  const embeddedUrl = new URL(page.url())
  expect(embeddedUrl.searchParams.get('tab')).toBe('operations')
  expect(embeddedUrl.searchParams.get('context')).toBe('keep')
  expect(embeddedUrl.searchParams.get('opsQuery')).toBe('Archived')
  expect(embeddedUrl.hash).toBe('#operations-templates')

  const collectionRequests = requestLog.filter(value => isCollectionPath(new URL(value).pathname))
  expect(collectionRequests.length).toBeGreaterThan(0)
  expect(collectionRequests.some(value => new URL(value).searchParams.get('cursor') === 'runs-page-2')).toBe(true)
  expect(collectionRequests.every(value => !new URL(value).searchParams.has('opsQuery'))).toBe(true)
})

test('searches every collection by its exact display projection while excluding hidden raw fields', async ({ context }) => {
  const page = await context.newPage()
  const requestLog: string[] = []
  const readText = async (locator: Locator, label: string) => {
    const value = (await locator.textContent())?.trim() ?? ''
    expect(value, label).not.toBe('')
    return value
  }
  try {
    await installOperationsRoutes(page, () => allOperationsFeatures, { requestLog })
    await page.goto('/operations')

    const search = page.getByRole('searchbox', { name: 'Search loaded Operations records' })
    await expect(search).toBeVisible()

    const cyclePanel = page.getByTestId('cycles-panel')
    const cycle = cyclePanel.locator('article').filter({ hasText: 'Nightly planning' })
    const cycleState = await readText(cycle.locator('.status'), 'Cycle localized state')
    const cycleDate = await readText(cycle.locator('small'), 'Cycle localized date range')

    const initiativePanel = page.getByTestId('initiatives-panel')
    const initiative = initiativePanel.locator('article').filter({ hasText: 'Runtime reliability' })
    const initiativeHealth = await readText(initiative.locator('.health'), 'Initiative localized health')
    const initiativeLine = await readText(initiative.locator('p'), 'Initiative localized status and priority')

    const automationPanel = page.getByTestId('automation-panel')
    const rule = automationPanel.locator('article').filter({ hasText: 'Webhook retry' })
    const ruleState = await readText(rule.locator('.status'), 'Automation localized state')
    const ruleKind = await readText(rule.locator('small'), 'Automation rendered trigger kind')

    const loopsPanel = page.getByTestId('loops-panel')
    const loop = loopsPanel.locator('article').filter({ hasText: 'Release guard' })
    const loopState = await readText(loop.locator('.status'), 'Loop localized state')
    const loopSchedule = await readText(loop.locator('small'), 'Loop localized schedule')

    const runsPanel = page.getByTestId('runs-panel')
    const failedRun = page.getByTestId('run-row-run-0005-record')
    const failedRunKind = await readText(failedRun.locator('td').nth(1), 'Run localized kind')
    const failedRunState = await readText(failedRun.locator('.status'), 'Run localized state')
    const failedRunDate = await readText(failedRun.locator('time'), 'Run localized date')
    const failedRunError = await readText(
      runsPanel.getByText(/Provider retry failed after the upstream execution service/),
      'Run historical error',
    )

    const templatesPanel = page.getByTestId('templates-panel')
    const template = templatesPanel.locator('.template-list > span').filter({ hasText: 'Agent recovery' })
    const templateLine = await readText(template.locator('small'), 'Template localized kind and status')

    const expectVisibleFor = async (query: string, item: Locator, label: string) => {
      await search.fill(query)
      await expect(item, `${label}: exact rendered query`).toBeVisible()
    }
    const expectHiddenFor = async (
      query: string,
      item: Locator,
      panel: Locator,
      noMatchHeading: string,
      label: string,
    ) => {
      await search.fill(query)
      await expect(item, `${label}: hidden raw field`).toHaveCount(0)
      await expect(panel.getByRole('heading', { name: noMatchHeading }), `${label}: client no-match`).toBeVisible()
    }

    await expectVisibleFor(cycleState, cycle, 'Cycle state')
    await expectVisibleFor(cycleDate, cycle, 'Cycle date')
    await expectHiddenFor('cycle-current', cycle, cyclePanel, 'No loaded Cycles match', 'Cycle full ID')

    await expectVisibleFor(initiativeHealth, initiative, 'Initiative health')
    await expectVisibleFor(initiativeLine, initiative, 'Initiative status/priority')
    await expectHiddenFor('on_track', initiative, initiativePanel, 'No loaded Initiatives match', 'Initiative raw health')

    await expectVisibleFor(ruleState, rule, 'Automation state')
    await expectVisibleFor(ruleKind, rule, 'Automation trigger')
    await expectHiddenFor('rule-1', rule, automationPanel, 'No loaded Automation rules match', 'Automation raw ID')
    await expectHiddenFor('UTC', rule, automationPanel, 'No loaded Automation rules match', 'Automation undisplayed timezone')

    await expectVisibleFor(loopState, loop, 'Loop state')
    await expectVisibleFor(loopSchedule, loop, 'Loop schedule')
    await expectHiddenFor('no_overlap', loop, loopsPanel, 'No loaded Loops match', 'Loop raw overlap enum')

    await expectVisibleFor(failedRunKind, failedRun, 'Run kind')
    await expectVisibleFor(failedRunState, failedRun, 'Run status')
    await expectVisibleFor(failedRunDate, failedRun, 'Run date')
    await expectVisibleFor(failedRunError, failedRun, 'Run historical error')
    const dryRun = page.getByTestId('run-row-run-0008-record')
    await expectHiddenFor('dry_run', dryRun, runsPanel, 'No loaded Recent runs match', 'Run raw status')
    await expectHiddenFor('rule-5', failedRun, runsPanel, 'No loaded Recent runs match', 'Run undisplayed rule ID')

    await expectVisibleFor(templateLine, template, 'Template kind/status')
    await expectHiddenFor('agent_run', template, templatesPanel, 'No loaded Templates & playbooks match', 'Template raw kind')
    await expectHiddenFor('template-3', template, templatesPanel, 'No loaded Templates & playbooks match', 'Template raw ID')

    const collectionRequests = requestLog.filter(value => collectionPathSet.has(new URL(value).pathname))
    expect(collectionRequests.length).toBeGreaterThan(0)
    expect(collectionRequests.every(value => !new URL(value).searchParams.has('opsQuery'))).toBe(true)
  } finally {
    await page.close()
  }
})

test('keeps Recent runs semantic, linked, and locally scrollable at narrow and wide widths', async ({ page }, testInfo) => {
  const geometry: Array<{
    viewport: { width: number; height: number }
    documentWidth: number
    table: Awaited<ReturnType<typeof measureRunsTableGeometry>>
  }> = []
  await installOperationsRoutes(page, () => allOperationsFeatures)

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto(`/operations?tableViewport=${viewport.width}#operations-runs`)

    const panel = page.getByTestId('runs-panel')
    const table = panel.getByRole('table', { name: 'Recent runs' })
    await expect(table).toBeVisible()
    const headers = table.getByRole('columnheader')
    await expect(headers).toHaveCount(6)
    expect(await headers.evaluateAll(cells => cells.map(cell => cell.getAttribute('scope')))).toEqual(
      Array.from({ length: 6 }, () => 'col'),
    )
    await expect(table.locator('thead')).toHaveCount(1)
    await expect(table.locator('tbody')).toHaveCount(1)

    const failedRow = page.getByTestId('run-row-run-0005-record')
    const historicalError = panel.getByText(/Provider retry failed after the upstream execution service/)
    const errorId = await historicalError.getAttribute('id')
    expect(errorId).toBe('run-error-run-0005-record')
    await expect(failedRow).toHaveAttribute('aria-describedby', errorId ?? '')
    await expect(historicalError.locator('xpath=ancestor::td')).toHaveAttribute('colspan', '6')
    await expect(historicalError.locator('xpath=ancestor::tr')).not.toHaveAttribute('data-testid', 'run-row-run-0005-record')
    await expect(panel.getByRole('alert')).toHaveCount(0)

    const noSessionRow = page.getByTestId('run-row-run-0002-record')
    await expect(noSessionRow.getByText('—')).toBeVisible()
    await expect(noSessionRow.getByRole('link')).toHaveCount(0)
    await expect(page.getByTestId('run-row-run-0001-record').locator('time')).toHaveAttribute(
      'datetime',
      '2026-08-23T01:00:00Z',
    )

    const tableScroll = page.getByTestId('operations-table-scroll')
    await tableScroll.focus()
    await expect(tableScroll).toBeFocused()
    const measured = await measureRunsTableGeometry(page)
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    geometry.push({ viewport, documentWidth, table: measured })

    expect(documentWidth).toBe(viewport.width)
    expect(measured.scrollHeight).toBeGreaterThan(measured.clientHeight)
    expect(measured.scrollTopAfter).toBeGreaterThan(0)
    expect(Math.abs(measured.stickyHeaderTopAfter - measured.wrapper.top)).toBeLessThanOrEqual(2)
    expect(measured.focusOutlineStyle).not.toBe('none')
    expect(Number.parseFloat(measured.focusOutlineWidth)).toBeGreaterThanOrEqual(2)

    if (viewport.width === 390) {
      expect(measured.scrollWidth).toBeGreaterThan(measured.clientWidth)
      expect(measured.scrollLeftAfter).toBeGreaterThan(0)
      expect(measured.table.width).toBeGreaterThan(measured.wrapper.width)
    } else {
      expect(measured.scrollWidth).toBe(measured.clientWidth)
      expect(measured.scrollLeftAfter).toBe(0)
      expect(measured.table.width).toBeLessThanOrEqual(1121)
      expect(Math.max(...measured.columnWidths)).toBeLessThanOrEqual(310)
      expect(Math.min(...measured.columnWidths)).toBeGreaterThan(100)
    }

    await tableScroll.evaluate(element => {
      element.scrollLeft = 0
      element.scrollTop = 0
    })
    const viewportName = viewport.width === 390 ? 'narrow' : 'wide'
    const screenshotPath = testInfo.outputPath(`task-4.3-runs-table-${viewportName}-pass.png`)
    await panel.screenshot({ path: screenshotPath })
    await testInfo.attach(`task-4.3-runs-table-${viewportName}-pass`, {
      contentType: 'image/png',
      path: screenshotPath,
    })
  }

  const geometryPath = testInfo.outputPath('task-4.3-runs-table-geometry-pass.json')
  await writeFile(geometryPath, JSON.stringify(geometry, null, 2), 'utf8')
  await testInfo.attach('task-4.3-runs-table-geometry-pass', {
    contentType: 'application/json',
    path: geometryPath,
  })

  const sessionLink = page.getByRole('link', { name: `Session: ${validRunSessionId}` })
  await sessionLink.focus()
  await expect(sessionLink).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(`/agent-sessions/${encodeURIComponent(validRunSessionId)}`)
  await expect(page.getByTestId('agent-session-detail')).toBeVisible()
})

test('projects precise aggregate metrics without charts at narrow and wide widths', async ({ page }, testInfo) => {
  const geometry: Awaited<ReturnType<typeof measureUsageMetricsGeometry>>[] = []
  await installOperationsRoutes(page, () => allOperationsFeatures, { usage: () => largeUsage })

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto(`/operations?opsQuery=9%2C007%2C199%2C254%2C741%2C000&metricsViewport=${viewport.width}#operations-metrics`)

    const section = page.locator('#operations-metrics')
    const metrics = section.getByRole('list', { name: 'Usage and cost' })
    await expect(metrics).toBeVisible()
    await expect(page.getByRole('searchbox', { name: 'Search loaded Operations records' })).toHaveValue('9,007,199,254,741,000')
    await expect(section.getByText('9,007,199,254,741,000')).toBeVisible()
    await expect(section.getByText('9,007,199,254,740,995')).toBeVisible()
    await expect(section.getByText('1h 1m 1s')).toBeVisible()
    await expect(section.getByRole('listitem', { name: 'USD' }).getByText('$90,071,992,547,409.93')).toBeVisible()
    await expect(section.getByRole('listitem', { name: 'JPY' }).getByText('¥1,234')).toBeVisible()
    await expect(section.getByRole('listitem', { name: 'KWD' }).getByText(/KWD\s*1\.234/)).toBeVisible()
    const unsupported = section.getByRole('listitem', { name: 'ZZZ' })
    await expect(unsupported.getByText('12,345,678,901,234,567,890')).toBeVisible()
    await expect(unsupported.getByText('ZZZ minor units')).toBeVisible()
    await expect(section.getByTestId('usage-currency-bucket')).toHaveCount(4)
    await expect(section.locator('svg')).toHaveCount(0)
    expect((await section.textContent()) ?? '').not.toMatch(/trend|over time|time[- ]?series|timeline/i)
    await expect(page.getByTestId('cycles-panel').getByRole('heading', { name: 'No loaded Cycles match' })).toBeVisible()

    const measured = await measureUsageMetricsGeometry(page)
    geometry.push(measured)
    expect(measured.document.scrollWidth).toBe(measured.document.clientWidth)
    expect(measured.section.left).toBeGreaterThanOrEqual(-1)
    expect(measured.section.right).toBeLessThanOrEqual(measured.document.clientWidth + 1)
    expect(measured.grid.width).toBeLessThanOrEqual(measured.section.width + 1)
    expect(measured.overflowingCardCount).toBe(0)
    expect(measured.svgCount).toBe(0)
    expect(measured.cards.every(card =>
      card.left >= measured.grid.left - 1 && card.right <= measured.grid.right + 1,
    )).toBe(true)

    const cardWidths = measured.cards.map(card => card.width)
    if (viewport.width === 390) {
      expect(measured.rowCount).toBe(measured.cards.length)
      expect(Math.min(...cardWidths)).toBeGreaterThan(300)
      expect(Math.max(...cardWidths)).toBeLessThanOrEqual(measured.grid.width + 1)
    } else {
      expect(measured.rowCount).toBeGreaterThanOrEqual(2)
      expect(measured.rowCount).toBeLessThanOrEqual(3)
      expect(Math.min(...cardWidths)).toBeGreaterThanOrEqual(200)
      expect(Math.max(...cardWidths)).toBeLessThanOrEqual(289)
    }

    const viewportName = viewport.width === 390 ? 'narrow' : 'wide'
    const screenshotPath = testInfo.outputPath(`task-4.4-usage-metrics-${viewportName}-pass.png`)
    await section.screenshot({ path: screenshotPath })
    await testInfo.attach(`task-4.4-usage-metrics-${viewportName}-pass`, {
      contentType: 'image/png',
      path: screenshotPath,
    })
  }

  const geometryPath = testInfo.outputPath('task-4.4-usage-metrics-geometry-pass.json')
  await writeFile(geometryPath, JSON.stringify(geometry, null, 2), 'utf8')
  await testInfo.attach('task-4.4-usage-metrics-geometry-pass', {
    contentType: 'application/json',
    path: geometryPath,
  })
})

test('keeps unknown-only usage explicit and malformed usage unavailable', async ({ page }) => {
  let usage: UsageFixture = {
    ...defaultUsage,
    unknown_cost_records: 3,
    currency_buckets: [],
  }
  await installOperationsRoutes(page, () => [operations, 'WORKMESH_BETA_COSTS'], { usage: () => usage })
  await page.goto('/operations#operations-metrics')

  const section = page.locator('#operations-metrics')
  await expect(section.getByText('No known cost')).toBeVisible()
  const globalUnknown = section.getByRole('listitem', { name: 'Unknown cost' })
  await expect(globalUnknown.getByText('3')).toBeVisible()
  await expect(globalUnknown.getByText('Never treated as zero.')).toBeVisible()

  usage = {
    ...defaultUsage,
    unknown_cost_records: 3,
    currency_buckets: [
      { currency: 'USD', known_cost_minor: '0', unknown_cost_records: 3 },
    ],
  }
  await page.reload()
  const bucket = section.getByRole('listitem', { name: 'USD' })
  await expect(bucket.getByText('$0.00')).toBeVisible()
  await expect(bucket.getByText('3')).toBeVisible()
  await expect(bucket.getByText('Never treated as zero.')).toBeVisible()
  await expect(bucket.getByText(/total cost/i)).toHaveCount(0)

  usage = {
    ...defaultUsage,
    input_tokens: '01',
    runtime_ms: ' 500',
    currency_buckets: [
      { currency: 'USD', known_cost_minor: '1e3', unknown_cost_records: 0 },
    ],
  }
  await page.reload()
  await expect(section.getByTestId('usage-metrics-unavailable')).toHaveText('Usage data unavailable')
  await expect(section.getByRole('list', { name: 'Usage and cost' })).toHaveCount(0)
  await expect(section.locator('svg')).toHaveCount(0)
})

test('contains search and panels at 390 and 1920 with auditable PASS artifacts', async ({ page }, testInfo) => {
  const requestLog: string[] = []
  const geometry: Awaited<ReturnType<typeof measureOperationsGeometry>>[] = []
  await installOperationsRoutes(page, () => allOperationsFeatures, {
    collectionDelayMs: { '/api/v1/templates': 40 },
    paginatedRuns: true,
    requestLog,
  })

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto(`/operations?opsQuery=Current&viewport=${viewport.width}#operations-cycles`)
    const search = page.getByRole('searchbox', { name: 'Search loaded Operations records' })
    await expect(search).toHaveValue('Current')
    await expect(page.getByTestId('cycles-panel').getByText('Nightly planning')).toBeVisible()
    await expect(page.locator('#operations-metrics')).toBeVisible()
    await expect(page.locator('#operations-metrics')).toContainText('Tokens')

    const measured = await measureOperationsGeometry(page)
    geometry.push(measured)
    expect(measured.document.scrollWidth).toBe(measured.viewport.width)
    expect(measured.search.width).toBeLessThanOrEqual(Math.min(512, measured.root.width) + 1)
    expect(measured.search.left).toBeGreaterThanOrEqual(measured.root.left - 1)
    expect(measured.search.left + measured.search.width).toBeLessThanOrEqual(measured.root.left + measured.root.width + 1)
    expect(measured.panel.width).toBeLessThanOrEqual(measured.root.width + 1)
    expect(measured.panel.width).toBeGreaterThan(250)

    const screenshotPath = testInfo.outputPath(`task-4.2-search-${viewport.width}-pass.png`)
    await page.screenshot({ fullPage: true, path: screenshotPath })
    await testInfo.attach(`task-4.2-search-${viewport.width}-pass`, { contentType: 'image/png', path: screenshotPath })

    if (viewport.width === 1920) {
      await expect(page.getByTestId('runs-panel').getByRole('heading', { name: 'No loaded Recent runs match' })).toBeVisible()
      await page.getByRole('button', { name: 'Load more Recent runs' }).click()
      await expect.poll(() => requestLog.some(value => new URL(value).searchParams.get('cursor') === 'runs-page-2')).toBe(true)
    }
  }

  const collectionRequests = requestLog.filter(value => isCollectionPath(new URL(value).pathname))
  const paginationRequests = collectionRequests.filter(value => new URL(value).searchParams.has('cursor'))
  const evidencePath = testInfo.outputPath('task-4.2-request-geometry-pass.json')
  await writeFile(evidencePath, JSON.stringify({
    collectionRequests,
    geometry,
    opsQueryLeakedToApi: collectionRequests.some(value => new URL(value).searchParams.has('opsQuery')),
    paginationRequests,
  }, null, 2), 'utf8')
  await testInfo.attach('task-4.2-request-geometry-pass', { contentType: 'application/json', path: evidencePath })
  expect(paginationRequests).toHaveLength(1)
  expect(collectionRequests.every(value => !new URL(value).searchParams.has('opsQuery'))).toBe(true)
})
