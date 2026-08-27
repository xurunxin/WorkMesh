import { writeFile } from 'node:fs/promises'
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test'

import { focusGeometry, semanticSnapshot, tabUntilFocused } from './accessibility-fixtures'

const webUrl = 'http://127.0.0.1:3200'
const apiUrl = 'http://127.0.0.1:3201'
const scenario = 'final-tour' as const
const agentOriginRoute = '/agents?tab=agents&name=Codex&team=team-2&status=active'

type TourLocale = 'zh-CN' | 'en'

type TourViewport = Readonly<{
  height: number
  locale: TourLocale
  width: number
}>

type UniqueRecord = Readonly<{
  selector: string
  text?: string
  value?: string
}>

type WideContract =
  | 'agent-detail'
  | 'agent-registry'
  | 'agent-side-stack'
  | 'connect'
  | 'operations-standalone'
  | 'ordinary-dominant'
  | 'settings-operations'
  | 'settings-workspace'
  | 'work-item-detail'

type TourCase = Readonly<{
  compactTabsMaxWidth?: number
  dominantSelector: string
  initialMcpReadiness401Count: 0 | 1
  focusSelector: string
  hasAgentFilters?: boolean
  minimumTouchTarget?: boolean
  route: string
  rootSelector: string
  screenshotMode?: 'active-root' | 'full-page'
  slug: string
  unique: UniqueRecord
  wideContract: WideContract
}>

type Rect = Readonly<{
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}>

type MeasuredNode = Rect & Readonly<{
  clientWidth: number
  scrollLeft: number
  scrollWidth: number
}>

type MockLedgerEntry = Readonly<{
  cursor: string | null
  hasIdempotencyKey: boolean
  limit: number | null
  method: string
  outcome: 'client_aborted' | 'completed' | 'pending'
  path: string
  status: number
}>

type LedgerEquivalenceGroup = Readonly<{
  commitCount: number
  group: number
  requestCount: number
}>

type FinalTourLedger = Readonly<{
  count: number
  equivalenceGroups: readonly LedgerEquivalenceGroup[]
  requests: readonly MockLedgerEntry[]
  scenario: typeof scenario
}>

type LedgerExpectation = Readonly<{
  mcpReadiness401Count: 0 | 1 | 2
}>

const viewports = [
  { width: 390, height: 844, locale: 'zh-CN' },
  { width: 768, height: 1024, locale: 'en' },
  { width: 1440, height: 1000, locale: 'zh-CN' },
  { width: 1920, height: 1080, locale: 'en' },
] as const satisfies readonly TourViewport[]

const tourCases = [
  {
    slug: 'issues-list',
    route: '/?view=my-work',
    unique: { selector: '[data-work-item-id="work-101"]', text: 'Final visual tour Issue' },
    focusSelector: '[data-work-item-id="work-101"] .wm-work-item-title',
    rootSelector: '.content',
    dominantSelector: '[data-testid="work-list"]',
    initialMcpReadiness401Count: 0,
    minimumTouchTarget: true,
    wideContract: 'ordinary-dominant',
  },
  {
    slug: 'project-board',
    route: '/?view=projects&project=project-1&tab=board',
    unique: { selector: '[data-testid="board"] [data-work-item-id="work-101"]', text: 'Final visual tour Issue' },
    focusSelector: '[data-testid="board"] [data-work-item-id="work-101"] .wm-work-item-title',
    rootSelector: '.content',
    dominantSelector: '[data-testid="board"]',
    initialMcpReadiness401Count: 0,
    minimumTouchTarget: true,
    wideContract: 'ordinary-dominant',
  },
  {
    slug: 'work-101-detail',
    route: '/?view=my-work&workItem=work-101',
    unique: { selector: '[data-testid="work-item-detail"] .work-item-execution-header h3', text: 'Final visual tour Issue' },
    focusSelector: '.work-item-detail-agent-action .wm-button',
    rootSelector: '.work-item-full-page',
    dominantSelector: '.work-item-detail-layout',
    initialMcpReadiness401Count: 0,
    compactTabsMaxWidth: 1180,
    minimumTouchTarget: true,
    screenshotMode: 'active-root',
    wideContract: 'work-item-detail',
  },
  {
    slug: 'agents-filtered',
    route: agentOriginRoute,
    unique: { selector: '[data-testid="agent-registry-agent/1"]', text: 'Codex' },
    focusSelector: '[data-agent-roving-link="true"][data-agent-id="agent/1"]',
    rootSelector: '.agent-center',
    dominantSelector: '.agent-registry',
    initialMcpReadiness401Count: 1,
    hasAgentFilters: true,
    compactTabsMaxWidth: 720,
    minimumTouchTarget: true,
    wideContract: 'agent-registry',
  },
  {
    slug: 'agent-sessions',
    route: '/agents?tab=sessions',
    unique: { selector: '[data-testid="session-card-session-1"]', text: 'Codex' },
    focusSelector: '[data-testid="session-card-session-1"]',
    rootSelector: '.agent-center',
    dominantSelector: '.session-card-list',
    initialMcpReadiness401Count: 1,
    compactTabsMaxWidth: 720,
    minimumTouchTarget: true,
    wideContract: 'agent-side-stack',
  },
  {
    slug: 'approvals-pending',
    route: '/agents?tab=approvals&approvalView=pending',
    unique: { selector: '[data-testid="approval-row-approval-pending"]', text: 'Final tour approval' },
    focusSelector: '[data-testid="approval-row-approval-pending"] .approval-row-actions button:first-of-type',
    rootSelector: '.agent-center',
    dominantSelector: '.approval-grid',
    initialMcpReadiness401Count: 1,
    compactTabsMaxWidth: 720,
    minimumTouchTarget: true,
    wideContract: 'agent-side-stack',
  },
  {
    slug: 'approvals-history-rejected',
    route: '/agents?tab=approvals&approvalView=history&approvalStatus=rejected',
    unique: { selector: '[data-testid="approval-history-row-approval-rejected"]', text: 'Rejected final tour approval' },
    focusSelector: '.approval-history-status select',
    rootSelector: '.agent-center',
    dominantSelector: '.approval-history-table-wrap',
    initialMcpReadiness401Count: 1,
    compactTabsMaxWidth: 720,
    minimumTouchTarget: true,
    wideContract: 'agent-side-stack',
  },
  {
    slug: 'agent-detail-agent-1',
    route: '/agents/agent%2F1',
    unique: { selector: '.agent-detail-page h1', text: 'Codex' },
    focusSelector: '.agent-detail-management a',
    rootSelector: '.agent-center.agent-detail-page',
    dominantSelector: '.agent-detail-panel',
    initialMcpReadiness401Count: 1,
    wideContract: 'agent-detail',
  },
  {
    slug: 'settings-workspace-team-page-2',
    route: '/settings?tab=workspace&team=team-page-2',
    unique: { selector: '.workflow-state-list article:has-text("Final tour active")', text: 'Final tour active' },
    focusSelector: '.workflow-state-create-form input[name="name"]',
    rootSelector: '.settings-page',
    dominantSelector: '.settings-page > .wm-tabs > .wm-tab-panel:not([hidden])',
    initialMcpReadiness401Count: 0,
    compactTabsMaxWidth: 720,
    minimumTouchTarget: true,
    wideContract: 'settings-workspace',
  },
  {
    slug: 'settings-operations-failed-runs',
    route: '/settings?tab=operations&team=team-page-2&opsQuery=Failed#operations-runs',
    unique: { selector: '[data-testid="run-row-run-failed"] + .operations-run-error-row #run-error-run-failed', text: 'Failed deterministic final-tour run' },
    focusSelector: '#operations-loaded-search',
    rootSelector: '.settings-page',
    dominantSelector: '[data-testid="operations-table-scroll"]',
    initialMcpReadiness401Count: 0,
    compactTabsMaxWidth: 720,
    minimumTouchTarget: true,
    wideContract: 'settings-operations',
  },
  {
    slug: 'connect',
    route: '/connect#test',
    unique: { selector: '[data-mcp-guide-client="opencode"]' },
    focusSelector: '.onboarding-card-actions .wm-button',
    rootSelector: '.onboarding-shell',
    dominantSelector: '.onboarding-grid',
    initialMcpReadiness401Count: 1,
    minimumTouchTarget: true,
    wideContract: 'connect',
  },
] as const satisfies readonly TourCase[]

const connectTourCase: TourCase = tourCases[10]
const invocations = [
  ...viewports.flatMap(viewport => tourCases.map(tourCase => ({ tourCase, viewport }))),
  {
    tourCase: connectTourCase,
    viewport: { width: 390, height: 844, locale: 'en' } as const,
  },
] as const

function requiredNode(node: MeasuredNode | null, label: string): MeasuredNode {
  expect(node, `${label} geometry should exist`).not.toBeNull()
  if (!node) throw new Error(`${label} geometry is missing`)
  return node
}

function expectRange(value: number, minimum: number, maximum: number, label: string): void {
  expect(value, `${label} should be >= ${minimum}`).toBeGreaterThanOrEqual(minimum)
  expect(value, `${label} should be <= ${maximum}`).toBeLessThanOrEqual(maximum)
}

function expectHorizontalContainment(node: MeasuredNode, viewportWidth: number, label: string): void {
  expect(node.width, `${label} should have positive width`).toBeGreaterThan(0)
  expect(node.left, `${label} should not escape left`).toBeGreaterThanOrEqual(-0.5)
  expect(node.right, `${label} should not escape right`).toBeLessThanOrEqual(viewportWidth + 0.5)
}

async function setScenario(request: APIRequestContext, nextScenario: 'default' | typeof scenario): Promise<void> {
  const response = await request.post(`${apiUrl}/__test/reset`, { data: { scenario: nextScenario } })
  const body = await response.json() as unknown
  expect(response.ok(), JSON.stringify(body)).toBe(true)
  expect(body).toEqual({ scenario: nextScenario, requestCount: 0 })
}

async function readLedger(request: APIRequestContext): Promise<FinalTourLedger> {
  const response = await request.get(`${apiUrl}/__test/requests`)
  const body = await response.json() as FinalTourLedger
  expect(response.ok(), JSON.stringify(body)).toBe(true)
  expect(body.scenario).toBe(scenario)
  expect(body.count).toBe(body.requests.length)
  return body
}

async function expectFinalTourLedger(
  request: APIRequestContext,
  expectation: LedgerExpectation,
): Promise<FinalTourLedger> {
  if (expectation.mcpReadiness401Count > 0) {
    await expect.poll(
      async () => (await readLedger(request)).requests.filter(entry => (
        entry.method === 'GET'
        && entry.path === '/mcp'
        && entry.status === 401
      )).length,
      { message: 'the expected MCP readiness probes should complete before evidence capture', timeout: 10_000 },
    ).toBe(expectation.mcpReadiness401Count)
  }

  await expect.poll(
    async () => (await readLedger(request)).requests.filter(entry => entry.outcome === 'pending').length,
    { message: 'all final-tour requests should settle before evidence capture', timeout: 10_000 },
  ).toBe(0)

  const ledger = await readLedger(request)
  expect(ledger.requests.filter(entry => entry.outcome !== 'completed')).toEqual([])

  const intentionalMcpUnauthorized = ledger.requests.filter(entry => (
    entry.method === 'GET'
    && entry.path === '/mcp'
    && entry.status === 401
  ))
  expect(intentionalMcpUnauthorized).toHaveLength(expectation.mcpReadiness401Count)
  const unexpectedStatuses = ledger.requests.filter(entry => {
    if (entry.status === 200 || entry.status === 204) return false
    return !(entry.method === 'GET'
      && entry.path === '/mcp'
      && entry.status === 401)
  })
  expect(unexpectedStatuses).toEqual([])

  const idempotentRequests = ledger.requests.filter(entry => entry.hasIdempotencyKey)
  const groupedRequestCount = ledger.equivalenceGroups.reduce(
    (total, group) => total + group.requestCount,
    0,
  )
  expect(groupedRequestCount).toBe(idempotentRequests.length)
  expect(ledger.equivalenceGroups.every(group => (
    Number.isInteger(group.group)
    && group.requestCount > 0
    && (group.commitCount === 0 || group.commitCount === 1)
  ))).toBe(true)
  expect(idempotentRequests).toEqual([])
  expect(ledger.equivalenceGroups).toEqual([])
  return ledger
}

async function expectExactRoute(page: Page, route: string): Promise<void> {
  const actual = new URL(page.url())
  const expected = new URL(route, webUrl)
  expect(actual.pathname).toBe(expected.pathname)
  expect(actual.search).toBe(expected.search)
  expect(actual.hash).toBe(expected.hash)
}

async function expectUniqueRecord(page: Page, record: UniqueRecord): Promise<void> {
  const locator = page.locator(record.selector)
  await expect(locator).toHaveCount(1)
  await expect(locator).toBeVisible()
  if (record.text) await expect(locator).toContainText(record.text)
  if (record.value) await expect(locator).toHaveValue(record.value)
}

async function expectActiveSurfaceReady(page: Page, tourCase: TourCase): Promise<Locator> {
  const activeRoot = page.locator(tourCase.rootSelector)
  await expect(activeRoot).toHaveCount(1)
  await expect(activeRoot).toBeVisible()
  await expect(activeRoot).not.toHaveAttribute('aria-busy', 'true')
  await expect(activeRoot.locator(
    '.wm-skeleton:visible, [data-testid="loading"]:visible, [aria-busy="true"]:visible',
  )).toHaveCount(0)

  const activeHeading = activeRoot.locator('h1:visible')
  await expect(activeHeading).toHaveCount(1)
  await expect(activeHeading).toBeVisible()
  expect(await activeRoot.evaluate(root => Boolean(root.closest('main')))).toBe(true)
  const exposedOutsideHeadings = await page.evaluate(rootSelector => {
    const root = document.querySelector(rootSelector)
    if (!root) return ['missing active root']
    return [...document.querySelectorAll<HTMLElement>('h1')]
      .filter(heading => {
        if (root.contains(heading)) return false
        const bounds = heading.getBoundingClientRect()
        const style = getComputedStyle(heading)
        const rendered = bounds.width > 0
          && bounds.height > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
        return rendered && !heading.closest('[hidden], [inert], [aria-hidden="true"]')
      })
      .map(heading => heading.textContent?.trim() ?? '')
  }, tourCase.rootSelector)
  expect(exposedOutsideHeadings).toEqual([])
  return activeRoot
}

type FocusGeometrySnapshot = Awaited<ReturnType<typeof focusGeometry>>

async function reachByKeyboardWithVisibleFocus(
  page: Page,
  focusTarget: Locator,
): Promise<FocusGeometrySnapshot> {
  if (await focusTarget.evaluate(element => element === document.activeElement)) {
    await page.keyboard.press('Shift+Tab')
    await expect(focusTarget).not.toBeFocused()
  }

  const before = await focusGeometry(focusTarget)
  const reached = await tabUntilFocused(page, focusTarget, 240)
  expect(reached, 'the declared operation control should be reachable with Tab').toBe(true)
  await expect(focusTarget).toBeFocused()
  expect(
    await focusTarget.evaluate(element => element.matches(':focus-visible')),
    'keyboard focus should match :focus-visible',
  ).toBe(true)

  const after = await focusGeometry(focusTarget)
  const outlineChanged = after.outlineStyle !== before.outlineStyle
    || after.outlineWidth !== before.outlineWidth
  const shadowChanged = after.boxShadow !== before.boxShadow
  expect(
    outlineChanged || shadowChanged,
    'keyboard focus should visibly change the control outline or shadow',
  ).toBe(true)
  return after
}

async function openTourCase(page: Page, tourCase: TourCase): Promise<void> {
  if (tourCase.slug !== 'agent-detail-agent-1') {
    await page.goto(tourCase.route, { waitUntil: 'domcontentloaded' })
    return
  }

  await page.goto(agentOriginRoute, { waitUntil: 'domcontentloaded' })
  const originLink = page.locator('[data-agent-roving-link="true"][data-agent-id="agent/1"]')
  await expect(originLink).toBeVisible()
  await originLink.focus()
  await page.keyboard.press('Enter')
}

async function exerciseLinearRegistryClosure(page: Page) {
  const links = page.locator('[data-agent-roving-link="true"]')
  await expect(links).toHaveCount(2)
  const first = page.locator('[data-agent-roving-link="true"][data-agent-id="agent/1"]')
  const second = page.locator('[data-agent-roving-link="true"][data-agent-id="agent/2"]')

  await first.focus()
  await page.keyboard.press('j')
  await expect(second).toBeFocused()
  await expectExactRoute(page, agentOriginRoute)
  await page.keyboard.press('ArrowDown')
  await expect(first).toBeFocused()
  await page.keyboard.press('k')
  await expect(second).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(first).toBeFocused()
  await expectExactRoute(page, agentOriginRoute)
  await expect(page.getByRole('dialog', { name: /Codex/ })).toHaveCount(0)

  await page.keyboard.press('Space')
  await expect(page.getByRole('dialog', { name: /Codex/ })).toBeVisible()
  await expectExactRoute(page, agentOriginRoute)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /Codex/ })).toHaveCount(0)
  await expect(first).toBeFocused()
  return {
    finalFocusedAgentId: await first.getAttribute('data-agent-id'),
    finalRoute: new URL(page.url()).pathname + new URL(page.url()).search,
    sequence: ['j', 'ArrowDown', 'k', 'ArrowUp', 'Space', 'Escape'],
  }
}

async function exerciseGlobalAgentNavigation(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('g')
  await page.keyboard.press('a')
  await expect(page).toHaveURL(`${webUrl}/agents`)
  await expect(page.getByTestId('command-center')).toHaveCount(0)
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0)
  return {
    commandCenterCount: await page.getByTestId('command-center').count(),
    finalRoute: new URL(page.url()).pathname + new URL(page.url()).search,
    modalCount: await page.locator('[aria-modal="true"]').count(),
    sequence: ['g', 'a'],
  }
}

async function captureGeometry(page: Page, rootSelector: string, dominantSelector: string) {
  return page.evaluate(({ dominantSelector: dominantQuery, rootSelector: rootQuery }) => {
    const rect = (node: Element): Rect => {
      const value = node.getBoundingClientRect()
      return {
        bottom: value.bottom,
        height: value.height,
        left: value.left,
        right: value.right,
        top: value.top,
        width: value.width,
      }
    }
    const measure = (selector: string): MeasuredNode | null => {
      const node = document.querySelector<HTMLElement>(selector)
      return node ? {
        ...rect(node),
        clientWidth: node.clientWidth,
        scrollLeft: node.scrollLeft,
        scrollWidth: node.scrollWidth,
      } : null
    }
    const root = document.querySelector<HTMLElement>(rootQuery)
    const dominant = document.querySelector<HTMLElement>(dominantQuery)
    if (!root) throw new Error(`Missing final-tour root: ${rootQuery}`)
    if (!dominant) throw new Error(`Missing final-tour dominant surface: ${dominantQuery}`)
    const content = document.querySelector<HTMLElement>('.content, .agent-center')
    const contentStyle = content ? getComputedStyle(content) : null
    const usageCards = Array.from(document.querySelectorAll<HTMLElement>('.operations-metric-card')).map(rect)
    const cssTimeMs = (value: string): number => Math.max(0, ...value.split(',').map(part => {
      const token = part.trim()
      const parsed = Number.parseFloat(token)
      if (!Number.isFinite(parsed)) return 0
      if (token.endsWith('ms')) return parsed
      if (token.endsWith('s')) return parsed * 1_000
      return 0
    }))
    const rendered = (node: HTMLElement): boolean => {
      const style = getComputedStyle(node)
      const bounds = node.getBoundingClientRect()
      return bounds.width > 0
        && bounds.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
    }
    const visibleMotionNodes = [root, ...root.querySelectorAll<HTMLElement>('*')].filter(rendered)
    let maximumAnimationDurationMs = 0
    let maximumTransitionDurationMs = 0
    const motionViolations: Array<{
      animationDurationMs: number
      node: string
      transitionDurationMs: number
    }> = []
    for (const node of visibleMotionNodes) {
      const style = getComputedStyle(node)
      const animationDurationMs = cssTimeMs(style.animationDuration)
      const transitionDurationMs = cssTimeMs(style.transitionDuration)
      maximumAnimationDurationMs = Math.max(maximumAnimationDurationMs, animationDurationMs)
      maximumTransitionDurationMs = Math.max(maximumTransitionDurationMs, transitionDurationMs)
      if (animationDurationMs <= 0.02 && transitionDurationMs <= 0.02) continue
      if (motionViolations.length < 20) {
        const classes = [...node.classList].slice(0, 2).map(value => `.${value}`).join('')
        motionViolations.push({
          animationDurationMs,
          node: `${node.tagName.toLocaleLowerCase()}${node.id ? `#${node.id}` : classes}`,
          transitionDurationMs,
        })
      }
    }

    return {
      body: {
        clientWidth: document.body.clientWidth,
        scrollWidth: document.body.scrollWidth,
      },
      contentInnerWidth: content && contentStyle
        ? content.clientWidth - Number.parseFloat(contentStyle.paddingLeft) - Number.parseFloat(contentStyle.paddingRight)
        : null,
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      nodes: {
        agentRegistry: measure('.agent-registry'),
        agentSideStack: measure('.agent-side-stack'),
        boardScroll: measure('.wm-work-item-board-scroll'),
        configPreview: measure('.config-preview'),
        connectShell: measure('.onboarding-shell'),
        content: measure('.content, .agent-center'),
        dominant: measure(dominantQuery),
        main: measure('main#workmesh-main'),
        operationsGrid: measure('.operations-grid'),
        operationsMetrics: measure('.operations-metrics'),
        root: measure(rootQuery),
        runsTable: measure('.operations-runs-table'),
        runsWrapper: measure('[data-testid="operations-table-scroll"]'),
        settingsPanel: measure('.settings-page > .wm-tabs > .wm-tab-panel:not([hidden])'),
        sidebar: measure('.app-sidebar'),
        workflowForm: measure('.workflow-state-create-form'),
        workItemDetail: measure('.work-item-full-page > .work-item-detail'),
        workspace: measure('.app-workspace'),
      },
      reducedMotion: {
        matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
        maximumAnimationDurationMs,
        maximumTransitionDurationMs,
        violations: motionViolations,
        visibleNodeCount: visibleMotionNodes.length,
      },
      usage: {
        cardWidths: usageCards.map(card => card.width),
        rows: new Set(usageCards.map(card => Math.round(card.top))).size,
      },
    }
  }, { dominantSelector, rootSelector })
}

type TourGeometry = Awaited<ReturnType<typeof captureGeometry>>

function expectCommonGeometry(geometry: TourGeometry, viewport: TourViewport): void {
  expect(geometry.document.clientWidth).toBe(viewport.width)
  expect(geometry.document.scrollWidth).toBe(viewport.width)
  expect(geometry.body.clientWidth).toBe(viewport.width)
  expect(geometry.body.scrollWidth).toBe(viewport.width)
  expectHorizontalContainment(requiredNode(geometry.nodes.root, 'root'), viewport.width, 'root')
  expectHorizontalContainment(requiredNode(geometry.nodes.dominant, 'dominant'), viewport.width, 'dominant')
  expect(geometry.reducedMotion.matches).toBe(true)
  expect(geometry.reducedMotion.visibleNodeCount).toBeGreaterThan(0)
  expect(geometry.reducedMotion.maximumAnimationDurationMs).toBeLessThanOrEqual(0.02)
  expect(geometry.reducedMotion.maximumTransitionDurationMs).toBeLessThanOrEqual(0.02)
  expect(geometry.reducedMotion.violations).toEqual([])
}

function expectWideShell(geometry: TourGeometry): void {
  const sidebar = requiredNode(geometry.nodes.sidebar, 'sidebar')
  const workspace = requiredNode(geometry.nodes.workspace, 'workspace')
  const main = requiredNode(geometry.nodes.main, 'main')
  expectRange(sidebar.width, 247, 249, 'sidebar width')
  expectRange(workspace.width, 1670, 1674, 'workspace width')
  expectRange(main.width, 1670, 1674, 'main width')
}

function expectOrdinaryBounded(geometry: TourGeometry): void {
  expectWideShell(geometry)
  const content = requiredNode(geometry.nodes.content, 'ordinary content')
  const workspace = requiredNode(geometry.nodes.workspace, 'workspace')
  expectRange(content.width, 1421, 1482, 'ordinary content width')
  const leftWhitespace = content.left - workspace.left
  const rightWhitespace = workspace.right - content.right
  expect(Math.abs(leftWhitespace - rightWhitespace)).toBeLessThanOrEqual(2)
}

function expectDominantContentWidth(geometry: TourGeometry): void {
  const dominant = requiredNode(geometry.nodes.dominant, 'dominant surface')
  expect(geometry.contentInnerWidth).not.toBeNull()
  if (geometry.contentInnerWidth === null) throw new Error('content inner width is missing')
  expect(dominant.width / geometry.contentInnerWidth).toBeGreaterThanOrEqual(0.98)
}

function expectWideContract(geometry: TourGeometry, contract: WideContract): void {
  if (contract === 'connect') {
    const shell = requiredNode(geometry.nodes.connectShell, 'Connect shell')
    expectRange(shell.width, 1118, 1122, 'Connect shell width')
    expect(Math.abs(shell.left - (1920 - shell.right))).toBeLessThanOrEqual(2)
    return
  }

  if (contract === 'operations-standalone') {
    expectWideShell(geometry)
    const main = requiredNode(geometry.nodes.main, 'main')
    const root = requiredNode(geometry.nodes.root, 'Operations root')
    const grid = requiredNode(geometry.nodes.operationsGrid, 'Operations grid')
    const metrics = requiredNode(geometry.nodes.operationsMetrics, 'Usage metrics')
    const wrapper = requiredNode(geometry.nodes.runsWrapper, 'Runs wrapper')
    const table = requiredNode(geometry.nodes.runsTable, 'Runs table')
    expect(root.width / main.width).toBeGreaterThanOrEqual(0.95)
    expect(geometry.contentInnerWidth).not.toBeNull()
    if (geometry.contentInnerWidth === null) throw new Error('Operations content inner width is missing')
    expect(grid.width / geometry.contentInnerWidth).toBeGreaterThanOrEqual(0.98)
    expect(metrics.width / root.width).toBeGreaterThanOrEqual(0.85)
    expect(geometry.usage.cardWidths.length).toBeGreaterThanOrEqual(7)
    expect(geometry.usage.cardWidths.every(width => width >= 200 && width <= 289)).toBe(true)
    expectRange(geometry.usage.rows, 2, 3, 'Usage row count')
    expectRange(wrapper.width, 1118, 1122, 'Runs wrapper width')
    expectRange(table.width, 1118, 1122, 'Runs table width')
    expect(wrapper.scrollWidth).toBe(wrapper.clientWidth)
    expect(wrapper.scrollLeft).toBe(0)
    return
  }

  expectOrdinaryBounded(geometry)

  if (contract === 'ordinary-dominant') {
    expectDominantContentWidth(geometry)
    return
  }
  if (contract === 'work-item-detail') {
    const detail = requiredNode(geometry.nodes.workItemDetail, 'WorkItem detail')
    expectRange(detail.width, 1178, 1182, 'WorkItem detail width')
    return
  }
  if (contract === 'agent-registry') {
    const registry = requiredNode(geometry.nodes.agentRegistry, 'Agent registry')
    expect(geometry.contentInnerWidth).not.toBeNull()
    if (geometry.contentInnerWidth === null) throw new Error('Agent content inner width is missing')
    expect(registry.width / geometry.contentInnerWidth).toBeGreaterThanOrEqual(0.98)
    return
  }
  if (contract === 'agent-side-stack') {
    const stack = requiredNode(geometry.nodes.agentSideStack, 'Agent side stack')
    expect(geometry.contentInnerWidth).not.toBeNull()
    if (geometry.contentInnerWidth === null) throw new Error('Agent content inner width is missing')
    expect(stack.width / geometry.contentInnerWidth).toBeGreaterThanOrEqual(0.98)
    return
  }
  if (contract === 'agent-detail') {
    expectDominantContentWidth(geometry)
    return
  }
  if (contract === 'settings-workspace') {
    const panel = requiredNode(geometry.nodes.settingsPanel, 'Settings panel')
    const form = requiredNode(geometry.nodes.workflowForm, 'workflow form')
    expect(geometry.contentInnerWidth).not.toBeNull()
    if (geometry.contentInnerWidth === null) throw new Error('Settings content inner width is missing')
    expect(panel.width / geometry.contentInnerWidth).toBeGreaterThanOrEqual(0.98)
    expectRange(form.width, 720, 960, 'workflow form width')
    return
  }
  if (contract === 'settings-operations') {
    const panel = requiredNode(geometry.nodes.settingsPanel, 'Settings panel')
    const wrapper = requiredNode(geometry.nodes.runsWrapper, 'Runs wrapper')
    const table = requiredNode(geometry.nodes.runsTable, 'Runs table')
    expect(geometry.contentInnerWidth).not.toBeNull()
    if (geometry.contentInnerWidth === null) throw new Error('Settings content inner width is missing')
    expect(panel.width / geometry.contentInnerWidth).toBeGreaterThanOrEqual(0.98)
    expectRange(wrapper.width, 1118, 1122, 'Runs wrapper width')
    expectRange(table.width, 1118, 1122, 'Runs table width')
    expect(wrapper.scrollWidth).toBe(wrapper.clientWidth)
    expect(wrapper.scrollLeft).toBe(0)
  }
}

async function gridColumns(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate(element => new Set(
    Array.from(element.children).map(child => Math.round(child.getBoundingClientRect().left)),
  ).size)
}

async function expectViewportContract(
  page: Page,
  tourCase: TourCase,
  viewport: TourViewport,
  geometry: TourGeometry,
  focus: FocusGeometrySnapshot,
): Promise<void> {
  if (viewport.width === 390) {
    if (tourCase.wideContract === 'connect') {
      expect(await gridColumns(page, '.onboarding-grid')).toBe(1)
    } else {
      await expect(page.locator('.app-sidebar')).toBeHidden()
      await expect(page.locator('.mobile-navigation')).toBeVisible()
    }
    if (tourCase.minimumTouchTarget) {
      expect(focus.height, `focused control geometry: ${JSON.stringify(focus)}`).toBeGreaterThanOrEqual(40)
    }
    if (tourCase.slug === 'agent-sessions') expect(await gridColumns(page, '.session-card-list')).toBe(1)
    if (tourCase.slug === 'settings-workspace-team-page-2') {
      expect(await gridColumns(page, '.settings-grid')).toBe(1)
      expect(await gridColumns(page, '.workflow-state-create-form')).toBe(1)
    }
    if (tourCase.slug === 'connect') {
      await expect(page.locator('.onboarding-heading')).toHaveCSS('flex-direction', 'column')
    }
  }

  if (viewport.width >= 768) {
    if (tourCase.wideContract === 'connect') {
      expect(await gridColumns(page, '.onboarding-grid')).toBe(2)
    } else {
      await expect(page.locator('.app-sidebar')).toBeVisible()
      await expect(page.locator('.mobile-navigation')).toBeHidden()
    }
  }

  if (tourCase.compactTabsMaxWidth !== undefined) {
    const activeRoot = page.locator(tourCase.rootSelector)
    const compactTabs = activeRoot.locator('.wm-tabs-compact:visible')
    const desktopTabs = activeRoot.locator('.wm-tab-list[role="tablist"]:visible')
    if (viewport.width <= tourCase.compactTabsMaxWidth) {
      expect(await compactTabs.count()).toBeGreaterThanOrEqual(1)
      await expect(desktopTabs).toHaveCount(0)
    } else {
      expect(await desktopTabs.count()).toBeGreaterThanOrEqual(1)
      await expect(compactTabs).toHaveCount(0)
    }
  }

  if (tourCase.hasAgentFilters) {
    const expectedColumns = viewport.width <= 900 ? 2 : 4
    expect(await gridColumns(page, '.agent-registry-filters')).toBe(expectedColumns)
  }

  if (viewport.width <= 768 && tourCase.slug === 'project-board') {
    const owner = requiredNode(geometry.nodes.boardScroll, 'board scroll owner')
    expect(owner.scrollWidth).toBeGreaterThan(owner.clientWidth)
  }
  if (viewport.width <= 768 && (tourCase.slug === 'approvals-pending' || tourCase.slug === 'approvals-history-rejected')) {
    const owner = requiredNode(geometry.nodes.dominant, 'approval scroll owner')
    // Pending approvals become cards below the desktop grid breakpoint. The
    // decision group must remain visible in the card and the page itself must
    // not acquire horizontal scrolling just to reach the buttons.
    if (tourCase.slug === 'approvals-history-rejected') {
      // Historical approvals intentionally keep their dense table in a local
      // scroll frame; only the frame, never the page, may overflow.
      expect(owner.scrollWidth).toBeGreaterThan(owner.clientWidth)
      expect(geometry.document.scrollWidth).toBe(viewport.width)
    } else {
      expect(owner.scrollWidth).toBe(owner.clientWidth)
    }
    if (tourCase.slug === 'approvals-pending') {
      const row = page.getByTestId('approval-row-approval-pending')
      await expect(row.locator('.approval-row-actions')).toBeVisible()
      await expect(row.getByRole('button', { name: 'Approve' })).toBeVisible()
      await expect(row.getByRole('button', { name: 'Reject' })).toBeVisible()
      await expect(row.getByRole('button', { name: 'Other feedback' })).toBeVisible()
      const actionBounds = await row.locator('.approval-row-actions .wm-button').evaluateAll(buttons => buttons.map(button => {
        const bounds = button.getBoundingClientRect()
        return { bottom: bounds.bottom, left: bounds.left, right: bounds.right, top: bounds.top }
      }))
      expect(actionBounds.length).toBe(3)
      expect(actionBounds.every(bounds => bounds.left >= -0.5 && bounds.right <= viewport.width + 0.5 && bounds.top >= -0.5 && bounds.bottom <= viewport.height + 0.5)).toBe(true)
    }
  }
  if (viewport.width <= 768 && tourCase.slug === 'settings-operations-failed-runs') {
    const owner = requiredNode(geometry.nodes.runsWrapper, 'Runs scroll owner')
    expect(owner.scrollWidth).toBeGreaterThan(owner.clientWidth)
  }
  if (viewport.width === 390 && tourCase.slug === 'connect') {
    const owner = requiredNode(geometry.nodes.configPreview, 'configuration preview scroll owner')
    expect(owner.scrollWidth).toBeGreaterThanOrEqual(owner.clientWidth)
  }

  if (viewport.width === 1920) expectWideContract(geometry, tourCase.wideContract)
}

async function verifyAndCapture(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
  tourCase: TourCase,
  viewport: TourViewport,
  interactionEvidence: unknown = null,
): Promise<void> {
  await expectUniqueRecord(page, tourCase.unique)
  const activeRoot = await expectActiveSurfaceReady(page, tourCase)
  await expectExactRoute(page, tourCase.route)

  const focusTarget = page.locator(tourCase.focusSelector)
  await expect(focusTarget).toHaveCount(1)
  await expect(focusTarget).toBeVisible()
  const focus = await reachByKeyboardWithVisibleFocus(page, focusTarget)

  const semantics = await semanticSnapshot(page)
  expect(semantics.mainCount).toBe(1)
  expect(semantics.missingReferences).toEqual([])
  expect(semantics.duplicateIds).toEqual([])
  expect(semantics.nestedInteractive).toEqual([])
  expect(semantics.documentClientWidth).toBe(viewport.width)
  expect(semantics.documentScrollWidth).toBe(viewport.width)

  expect(focus.left).toBeGreaterThanOrEqual(-1)
  expect(focus.top).toBeGreaterThanOrEqual(-1)
  expect(focus.right).toBeLessThanOrEqual(focus.viewportWidth + 1)
  expect(focus.bottom).toBeLessThanOrEqual(focus.viewportHeight + 1)

  const geometry = await captureGeometry(page, tourCase.rootSelector, tourCase.dominantSelector)
  expectCommonGeometry(geometry, viewport)
  await expectViewportContract(page, tourCase, viewport, geometry, focus)

  const cookies = await page.context().cookies(webUrl)
  const localeCookie = cookies.find(cookie => cookie.name === 'workmesh_locale')?.value ?? null
  expect(localeCookie).toBe(viewport.locale)
  const ledger = await expectFinalTourLedger(request, {
    mcpReadiness401Count: tourCase.initialMcpReadiness401Count,
  })

  const activeElement = await page.evaluate(() => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return null
    return {
      ariaLabel: active.getAttribute('aria-label'),
      dataAgentId: active.getAttribute('data-agent-id'),
      dataTestId: active.getAttribute('data-testid'),
      id: active.id || null,
      tag: active.tagName.toLocaleLowerCase(),
    }
  })
  const currentUrl = new URL(page.url())
  const name = `final-tour-${tourCase.slug}-${viewport.width}x${viewport.height}-${viewport.locale}`
  const screenshotPath = testInfo.outputPath(`${name}.png`)
  const evidencePath = testInfo.outputPath(`${name}.json`)
  const evidence = {
    schemaVersion: 1,
    name,
    route: {
      hash: currentUrl.hash,
      pathname: currentUrl.pathname,
      search: currentUrl.search,
    },
    locale: {
      cookie: localeCookie,
      requested: viewport.locale,
    },
    viewport: { height: viewport.height, width: viewport.width },
    focus: { activeElement, geometry: focus },
    aria: semantics,
    geometry,
    requests: {
      count: ledger.count,
      entries: ledger.requests,
      equivalenceGroups: ledger.equivalenceGroups,
    },
    interactions: interactionEvidence,
  }

  if (tourCase.screenshotMode === 'active-root') {
    await activeRoot.screenshot({ animations: 'disabled', path: screenshotPath })
  } else {
    await page.screenshot({ animations: 'disabled', fullPage: true, path: screenshotPath })
  }
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  await testInfo.attach(`${name}-geometry`, { path: evidencePath, contentType: 'application/json' })
  await testInfo.attach(`${name}-screenshot`, { path: screenshotPath, contentType: 'image/png' })
}

async function writeClosureEvidence(testInfo: TestInfo, name: string, evidence: unknown): Promise<void> {
  const path = testInfo.outputPath(`${name}.json`)
  await writeFile(path, `${JSON.stringify({ schemaVersion: 1, name, evidence }, null, 2)}\n`, 'utf8')
  await testInfo.attach(name, { path, contentType: 'application/json' })
}

test.describe('Task 7.3 deterministic final visual tour', () => {
  test.beforeEach(async ({ request }) => {
    await setScenario(request, scenario)
  })

  test.afterEach(async ({ request }) => {
    await setScenario(request, 'default')
  })

  for (const { tourCase, viewport } of invocations) {
    test(`${tourCase.slug} at ${viewport.width}x${viewport.height} ${viewport.locale}`, async ({ context, page, request }, testInfo) => {
      await context.addCookies([{ name: 'workmesh_locale', value: viewport.locale, url: webUrl }])
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await openTourCase(page, tourCase)

      const interactionEvidence = tourCase.slug === 'agents-filtered'
        ? await exerciseLinearRegistryClosure(page)
        : null
      await verifyAndCapture(page, request, testInfo, tourCase, viewport, interactionEvidence)

      if (tourCase.slug === 'issues-list') {
        const closure = await exerciseGlobalAgentNavigation(page)
        const closureLedger = await expectFinalTourLedger(request, { mcpReadiness401Count: 1 })
        await writeClosureEvidence(
          testInfo,
          `final-tour-${tourCase.slug}-${viewport.width}x${viewport.height}-${viewport.locale}-global-navigation`,
          { ...closure, requestCount: closureLedger.count },
        )
      }
      if (tourCase.slug === 'agent-detail-agent-1') {
        await page.goBack()
        await expectExactRoute(page, agentOriginRoute)
        const returnTarget = page.locator('[data-agent-roving-link="true"][data-agent-id="agent/1"]')
        await expect(returnTarget).toBeFocused()
        const closureLedger = await expectFinalTourLedger(request, { mcpReadiness401Count: 2 })
        await writeClosureEvidence(
          testInfo,
          `final-tour-${tourCase.slug}-${viewport.width}x${viewport.height}-${viewport.locale}-back`,
          {
            focusedAgentId: await returnTarget.getAttribute('data-agent-id'),
            requestCount: closureLedger.count,
            restoredRoute: new URL(page.url()).pathname + new URL(page.url()).search,
            sequence: ['Enter', 'Back'],
          },
        )
      }
    })
  }

  test('standalone Operations and Usage meet the 1920 numeric contract', async ({ context, page, request }, testInfo) => {
    const viewport = { width: 1920, height: 1080, locale: 'en' } as const
    const operationCase = {
      slug: 'operations-usage-standalone',
      route: '/operations#operations-metrics',
      unique: { selector: '[data-testid="run-row-run-failed"] + .operations-run-error-row #run-error-run-failed', text: 'Failed deterministic final-tour run' },
      focusSelector: '#operations-loaded-search',
      rootSelector: '.operations-tab',
      dominantSelector: '.operations-grid',
      initialMcpReadiness401Count: 0,
      minimumTouchTarget: true,
      wideContract: 'operations-standalone',
    } as const satisfies TourCase

    await context.addCookies([{ name: 'workmesh_locale', value: viewport.locale, url: webUrl }])
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(operationCase.route, { waitUntil: 'domcontentloaded' })
    await verifyAndCapture(page, request, testInfo, operationCase, viewport)
  })
})
