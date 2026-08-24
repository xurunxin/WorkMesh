import { writeFile } from 'node:fs/promises'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import {
  largeListId,
  readSettledMockRequests,
  requestsFor,
  resetMock,
  restoreDefaultMock,
  writeMockEvidence,
  type MockRequestLedger,
} from './mock-control'

const webUrl = 'http://127.0.0.1:3200'
const apiUrl = 'http://127.0.0.1:3201'
const pageCursors = [null, 'p2', 'p3'] as const

type BrowserPerformanceState = {
  cls: number
  longTasks: number[]
  startedAt: number
}

type LargeListPerformanceWindow = Window & {
  __workmeshLargeListPerformance?: BrowserPerformanceState
  __workmeshLargeListInteraction?: { eventType: InteractionEventType; startedAt: number | null }
}

type PerformanceEvidence = {
  cls: number
  clsSamples: number[]
  interactionMs: Record<string, number>
  interactionWallMs: Record<string, number>
  longTaskAggregateMs: number
  longTaskMaxMs: number
  longTaskSamplesMs: number[]
  longTaskTotalMs: number
  paginationMs: number[]
  domCounts: number[]
  windows: PerformanceWindowEvidence[]
}

type MeasuredInteraction = {
  durationMs: number
  name: string
  state: BrowserPerformanceState
  wallDurationMs: number
}

type InteractionEventType = 'click' | 'input' | 'keydown'

type StableDomCondition =
  | { kind: 'count'; selector: string; count: number }
  | { kind: 'inputValue'; selector: string; value: string }
  | { kind: 'selectedText'; selector: string; text: string }

type PerformanceWindowEvidence = {
  cls: number
  durationMs: number
  longTaskMaxMs: number
  longTaskSamplesMs: number[]
  longTaskTotalMs: number
  name: string
  wallDurationMs: number
}

type ActiveElementEvidence = {
  ariaLabel: string | null
  href: string | null
  parentTestId: string | null
  tag: string
}

test.setTimeout(90_000)

async function installPerformanceObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as LargeListPerformanceWindow
    target.__workmeshLargeListPerformance = { cls: 0, longTasks: [], startedAt: performance.now() }
    try {
      const layoutObserver = new PerformanceObserver(list => {
        const state = target.__workmeshLargeListPerformance
        if (!state) return
        for (const rawEntry of list.getEntries()) {
          const entry = rawEntry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }
          if (entry.startTime >= state.startedAt && !entry.hadRecentInput && typeof entry.value === 'number') state.cls += entry.value
        }
      })
      layoutObserver.observe({ buffered: true, type: 'layout-shift' })
    } catch { /* The assertion reads zero when the browser exposes no layout-shift observer. */ }
    try {
      const longTaskObserver = new PerformanceObserver(list => {
        const state = target.__workmeshLargeListPerformance
        if (state) state.longTasks.push(...list.getEntries()
          .filter(entry => entry.startTime >= state.startedAt)
          .map(entry => entry.duration))
      })
      longTaskObserver.observe({ buffered: true, type: 'longtask' })
    } catch { /* The assertion reads an empty sample when long-task entries are unavailable. */ }
  })
}

async function resetPerformance(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as LargeListPerformanceWindow
    target.__workmeshLargeListPerformance = { cls: 0, longTasks: [], startedAt: performance.now() }
  })
}

async function nextStableFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

async function prepareInteractionStart(page: Page, eventType: InteractionEventType): Promise<void> {
  await page.evaluate(type => {
    const target = window as LargeListPerformanceWindow
    target.__workmeshLargeListInteraction = { eventType: type, startedAt: null }
    window.addEventListener(type, () => {
      const state = target.__workmeshLargeListInteraction
      if (state && state.eventType === type && state.startedAt === null) state.startedAt = performance.now()
    }, { capture: true, once: true })
  }, eventType)
}

async function waitForStableDom(page: Page, condition: StableDomCondition): Promise<number> {
  return page.evaluate(async expected => {
    const target = window as LargeListPerformanceWindow
    const matches = (): boolean => {
      const elements = [...document.querySelectorAll(expected.selector)]
      if (expected.kind === 'count') return elements.length === expected.count
      if (expected.kind === 'inputValue')
        return elements.length === 1 && elements[0] instanceof HTMLInputElement && elements[0].value === expected.value
      return elements.length === 1 && elements[0]?.textContent?.trim() === expected.text
    }
    if (!matches()) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          observer.disconnect()
          reject(new Error(`DOM condition did not settle: ${JSON.stringify(expected)}`))
        }, 2_000)
        const observer = new MutationObserver(() => {
          if (!matches()) return
          window.clearTimeout(timeout)
          observer.disconnect()
          resolve()
        })
        observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true })
      })
    }
    const startedAt = target.__workmeshLargeListInteraction?.startedAt
    if (startedAt === null || startedAt === undefined)
      throw new Error(`Expected a real ${target.__workmeshLargeListInteraction?.eventType ?? 'interaction'} event`)
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return performance.now() - startedAt
  }, condition)
}

async function measureInteraction(
  page: Page,
  name: string,
  eventType: InteractionEventType,
  action: () => Promise<void>,
  condition: StableDomCondition,
): Promise<MeasuredInteraction> {
  await resetPerformance(page)
  await prepareInteractionStart(page, eventType)
  const wallStarted = Date.now()
  await action()
  const durationMs = await waitForStableDom(page, condition)
  const wallDurationMs = Date.now() - wallStarted
  await page.waitForTimeout(0)
  return { durationMs, name, state: await performanceState(page), wallDurationMs }
}

async function performanceState(page: Page): Promise<BrowserPerformanceState> {
  return page.evaluate(() => {
    const state = (window as LargeListPerformanceWindow).__workmeshLargeListPerformance
    return state
      ? { cls: state.cls, longTasks: [...state.longTasks], startedAt: state.startedAt }
      : { cls: 0, longTasks: [], startedAt: performance.now() }
  })
}

async function attachEvidence(testInfo: TestInfo, name: string, evidence: PerformanceEvidence): Promise<void> {
  const path = testInfo.outputPath(`${name}.performance.json`)
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  await testInfo.attach(name, {
    path,
    contentType: 'application/json',
  })
}

function assertPerformance(evidence: PerformanceEvidence): void {
  expect(evidence.cls).toBeLessThanOrEqual(0.10)
  expect(evidence.longTaskMaxMs).toBeLessThanOrEqual(200)
  expect(evidence.longTaskTotalMs).toBeLessThanOrEqual(500)
  expect(evidence.windows.every(window => window.cls <= 0.10)).toBe(true)
  expect(evidence.windows.every(window => window.longTaskMaxMs <= 200)).toBe(true)
  expect(evidence.windows.every(window => window.longTaskTotalMs <= 500)).toBe(true)
  expect(evidence.paginationMs.every(duration => duration <= 1_500)).toBe(true)
  expect(Object.values(evidence.interactionMs).every(duration => duration <= 250)).toBe(true)
}

function summarizePerformance(
  samples: MeasuredInteraction[],
  interactionMs: Record<string, number>,
  paginationMs: number[],
  domCounts: number[],
): PerformanceEvidence {
  const longTaskSamplesMs = samples.flatMap(sample => sample.state.longTasks)
  const clsSamples = samples.map(sample => sample.state.cls)
  const windows = samples.map(sample => ({
    cls: sample.state.cls,
    durationMs: sample.durationMs,
    longTaskMaxMs: Math.max(0, ...sample.state.longTasks),
    longTaskSamplesMs: sample.state.longTasks,
    longTaskTotalMs: sample.state.longTasks.reduce((total, duration) => total + duration, 0),
    name: sample.name,
    wallDurationMs: sample.wallDurationMs,
  }))
  return {
    cls: Math.max(0, ...clsSamples),
    clsSamples,
    interactionMs,
    interactionWallMs: Object.fromEntries(samples
      .filter(sample => Object.hasOwn(interactionMs, sample.name))
      .map(sample => [sample.name, sample.wallDurationMs])),
    longTaskAggregateMs: longTaskSamplesMs.reduce((total, duration) => total + duration, 0),
    longTaskMaxMs: Math.max(0, ...longTaskSamplesMs),
    longTaskSamplesMs,
    longTaskTotalMs: Math.max(0, ...windows.map(window => window.longTaskTotalMs)),
    paginationMs,
    domCounts,
    windows,
  }
}

function assertThreePages(ledger: MockRequestLedger, path: '/api/v1/work-items' | '/api/v1/agents'): void {
  const requests = requestsFor(ledger, 'GET', path)
  assertInitialRequestLifecycle(requests)
  expect(requests.every(entry => pageCursors.includes(entry.cursor as typeof pageCursors[number]))).toBe(true)
  for (const cursor of ['p2', 'p3'] as const) {
    const pageRequests = requests.filter(entry => entry.cursor === cursor)
    expect(pageRequests).toEqual([expect.objectContaining({ cursor, limit: 100, outcome: 'completed', status: 200 })])
  }
  const completed = requests.filter(entry => entry.outcome === 'completed')
  expect(completed.map(entry => entry.cursor)).toEqual(pageCursors)
  expect(completed.map(entry => entry.limit)).toEqual([100, 100, 100])
}

function assertOnlyInitialPageCompleted(ledger: MockRequestLedger, path: '/api/v1/work-items' | '/api/v1/agents'): void {
  const requests = requestsFor(ledger, 'GET', path)
  assertInitialRequestLifecycle(requests)
  expect(requests.every(entry => entry.cursor === null)).toBe(true)
  const completed = requests.filter(entry => entry.outcome === 'completed')
  expect(completed.map(entry => ({ cursor: entry.cursor, limit: entry.limit }))).toEqual([{ cursor: null, limit: 100 }])
}

function assertInitialRequestLifecycle(requests: ReturnType<typeof requestsFor>): void {
  expect(requests.length).toBeGreaterThan(0)
  expect(requests.every(entry => entry.limit === 100 && entry.outcome !== 'pending')).toBe(true)
  const initial = requests.filter(entry => entry.cursor === null)
  const completed = initial.filter(entry => entry.outcome === 'completed')
  expect(completed).toEqual([expect.objectContaining({ cursor: null, limit: 100, outcome: 'completed', status: 200 })])
  const aborted = initial.filter(entry => entry.outcome === 'client_aborted')
  expect(aborted.length).toBeLessThanOrEqual(1)
  if (aborted.length === 1) {
    expect(aborted[0]).toMatchObject({ cursor: null, limit: 100, outcome: 'client_aborted', status: 0 })
    expect(requests.findIndex(entry => entry.outcome === 'client_aborted' && entry.cursor === null))
      .toBeLessThan(requests.findIndex(entry => entry.outcome === 'completed' && entry.cursor === null))
  }
}

async function issueIds(page: Page): Promise<string[]> {
  return page.locator('[data-work-item-id^="large-work-"]').evaluateAll(elements => elements
    .map(element => element.getAttribute('data-work-item-id'))
    .filter((value): value is string => value !== null))
}

async function agentIds(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="agent-registry-large-agent-"]').evaluateAll(elements => elements
    .map(element => element.getAttribute('data-testid')?.replace('agent-registry-', '') ?? null)
    .filter((value): value is string => value !== null))
}

async function activeElementEvidence(page: Page): Promise<ActiveElementEvidence | null> {
  return page.evaluate(() => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return null
    return {
      ariaLabel: active.getAttribute('aria-label'),
      href: active instanceof HTMLAnchorElement ? active.getAttribute('href') : null,
      parentTestId: active.closest('[data-testid]')?.getAttribute('data-testid') ?? null,
      tag: active.tagName.toLowerCase(),
    }
  })
}

async function assertBoundariesReachable(page: Page, kind: 'issue' | 'agent'): Promise<void> {
  for (const ordinal of [99, 100, 101, 199, 200, 201]) {
    const id = kind === 'issue' ? largeListId.workItem(ordinal) : largeListId.agent(ordinal)
    const control = kind === 'issue'
      ? page.locator(`[data-work-item-id="${id}"]`).getByRole('button', { name: `Large Issue ${String(ordinal).padStart(3, '0')}` })
      : page.getByTestId(`agent-registry-${id}`).getByRole('link', { name: `Open details for Large Agent ${String(ordinal).padStart(3, '0')}` })
    await control.scrollIntoViewIfNeeded()
    await control.focus()
    await expect(control).toBeFocused()
  }
}

test.beforeEach(async ({ context, page, request }) => {
  await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])
  await resetMock(request, 'large-list')
  await installPerformanceObservers(page)
})

test.afterEach(async ({ request }) => {
  await restoreDefaultMock(request)
})

test('scopes exact limit and cursor validation to the large-list scenario', async ({ request }) => {
  const wrongLimit = await request.get(`${apiUrl}/api/v1/work-items?limit=99`)
  const wrongCursor = await request.get(`${apiUrl}/api/v1/agents?limit=100&cursor=p4`)
  expect(wrongLimit.status()).toBe(422)
  expect(await wrongLimit.json()).toMatchObject({ error: { code: 'LARGE_LIST_LIMIT_REQUIRED' } })
  expect(wrongCursor.status()).toBe(422)
  expect(await wrongCursor.json()).toMatchObject({ error: { code: 'LARGE_LIST_CURSOR_INVALID' } })
})

for (const initialLayout of ['list', 'board'] as const) {
  test(`loads Issues explicitly to 300 from ${initialLayout} and retains the exact set across layout changes`, async ({ page, request }, testInfo) => {
    await page.goto(`/?view=my-work&layout=${initialLayout}`)
    const cards = page.locator('[data-work-item-id^="large-work-"]')
    await expect(cards).toHaveCount(100)
    await page.waitForTimeout(250)
    assertOnlyInitialPageCompleted(await readSettledMockRequests(request, 'GET', '/api/v1/work-items'), '/api/v1/work-items')

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(250)
    assertOnlyInitialPageCompleted(await readSettledMockRequests(request, 'GET', '/api/v1/work-items'), '/api/v1/work-items')

    const samples: MeasuredInteraction[] = []
    const paginationMs: number[] = []
    for (const expectedCount of [200, 300]) {
      const pageNumber = expectedCount / 100
      const sample = await measureInteraction(page, `issues-${initialLayout}-page-${pageNumber}`, 'click', async () => {
        await page.locator('.wm-work-surface-pagination').click()
      }, { kind: 'count', selector: '[data-work-item-id^="large-work-"]', count: expectedCount })
      await expect(cards).toHaveCount(expectedCount)
      samples.push(sample)
      paginationMs.push(sample.durationMs)
    }
    await expect(page.locator('.wm-work-surface-pagination')).toHaveCount(0)

    const loadedIds = await issueIds(page)
    expect(loadedIds).toHaveLength(300)
    expect(new Set(loadedIds).size).toBe(300)
    expect([...loadedIds].sort()).toEqual(Array.from({ length: 300 }, (_, index) => largeListId.workItem(index + 1)))
    await assertBoundariesReachable(page, 'issue')

    const otherLayout = initialLayout === 'list' ? 'Board' : 'List'
    const initialLabel = initialLayout === 'list' ? 'List' : 'Board'
    const interactionMs: Record<string, number> = {}
    const domCounts = [await cards.count()]
    const switchToOtherName = `switch-to-${otherLayout.toLocaleLowerCase()}`
    const switchToOther = await measureInteraction(page, switchToOtherName, 'click', async () => {
      await page.getByRole('button', { name: otherLayout, exact: true }).click()
    }, { kind: 'selectedText', selector: '.work-surface-layout-toggle button.selected', text: otherLayout })
    await expect(cards).toHaveCount(300)
    samples.push(switchToOther)
    interactionMs[switchToOtherName] = switchToOther.durationMs
    domCounts.push(await cards.count())
    const switchToInitialName = `switch-to-${initialLabel.toLocaleLowerCase()}`
    const switchToInitial = await measureInteraction(page, switchToInitialName, 'click', async () => {
      await page.getByRole('button', { name: initialLabel, exact: true }).click()
    }, { kind: 'selectedText', selector: '.work-surface-layout-toggle button.selected', text: initialLabel })
    await expect(cards).toHaveCount(300)
    samples.push(switchToInitial)
    interactionMs[switchToInitialName] = switchToInitial.durationMs
    domCounts.push(await cards.count())
    expect(domCounts).toEqual([300, 300, 300])

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(250)
    const ledger = await readSettledMockRequests(request, 'GET', '/api/v1/work-items')
    assertThreePages(ledger, '/api/v1/work-items')

    const evidence = summarizePerformance(samples, interactionMs, paginationMs, domCounts)
    await attachEvidence(testInfo, `large-list-issues-${initialLayout}`, evidence)
    await writeMockEvidence({ ledger, name: `large-list-issues-${initialLayout}`, page, testInfo })
    assertPerformance(evidence)
  })
}

test('loads 300 Agents explicitly and preserves keyboard, Peek, filter, terminal-cursor, and performance contracts', async ({ page, request }, testInfo) => {
  await page.goto('/agents?tab=agents')
  const cards = page.locator('[data-testid^="agent-registry-large-agent-"]')
  await expect(cards).toHaveCount(100)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(250)
  assertOnlyInitialPageCompleted(await readSettledMockRequests(request, 'GET', '/api/v1/agents'), '/api/v1/agents')

  const samples: MeasuredInteraction[] = []
  const paginationMs: number[] = []
  for (const expectedCount of [200, 300]) {
    const pageNumber = expectedCount / 100
    const sample = await measureInteraction(page, `agents-page-${pageNumber}`, 'click', async () => {
      await page.getByRole('button', { name: 'Load more agents' }).click()
    }, { kind: 'count', selector: '[data-testid^="agent-registry-large-agent-"]', count: expectedCount })
    await expect(cards).toHaveCount(expectedCount)
    samples.push(sample)
    paginationMs.push(sample.durationMs)
  }
  await expect(page.getByRole('button', { name: 'Load more agents' })).toHaveCount(0)
  const loadedIds = await agentIds(page)
  expect(loadedIds).toHaveLength(300)
  expect(new Set(loadedIds).size).toBe(300)
  expect(loadedIds).toEqual(Array.from({ length: 300 }, (_, index) => largeListId.agent(index + 1)))
  await assertBoundariesReachable(page, 'agent')

  const item100 = page.getByTestId(`agent-registry-${largeListId.agent(100)}`).getByRole('link')
  const item101 = page.getByTestId(`agent-registry-${largeListId.agent(101)}`).getByRole('link')
  await item100.focus()
  await page.keyboard.press('j')
  await expect(item101).toBeFocused()

  const interactionMs: Record<string, number> = {}
  const peekOpen = await measureInteraction(page, 'peekOpen', 'keydown', async () => {
    await page.keyboard.press('Space')
  }, { kind: 'count', selector: '[role="dialog"][aria-modal="true"]', count: 1 })
  await expect(page.getByRole('dialog', { name: 'Peek at Large Agent 101' })).toBeVisible()
  samples.push(peekOpen)
  interactionMs.peekOpen = peekOpen.durationMs
  const peekClose = await measureInteraction(page, 'peekClose', 'keydown', async () => {
    await page.keyboard.press('Escape')
  }, { kind: 'count', selector: '[role="dialog"][aria-modal="true"]', count: 0 })
  await expect(page.getByRole('dialog', { name: 'Peek at Large Agent 101' })).toHaveCount(0)
  await expect(item101).toBeFocused()
  samples.push(peekClose)
  interactionMs.peekClose = peekClose.durationMs
  const nameInput = page.getByLabel('Name')
  await nameInput.focus()
  let filterPrefix = ''
  for (const [index, character] of [...'Large Agent 250'].entries()) {
    filterPrefix += character
    const name = `filter-key-${String(index + 1).padStart(2, '0')}`
    const sample = await measureInteraction(page, name, 'keydown', async () => {
      await nameInput.pressSequentially(character)
    }, { kind: 'inputValue', selector: 'input[aria-label="Name"]', value: filterPrefix })
    samples.push(sample)
    interactionMs[name] = sample.durationMs
  }
  await expect(cards).toHaveCount(1)
  await expect(nameInput).toHaveValue('Large Agent 250')

  await nameInput.fill('')
  await expect(cards).toHaveCount(300)
  await item101.focus()
  await expect(item101).toBeFocused()
  const filterFocusBefore = await activeElementEvidence(page)
  await page.evaluate(name => {
    const url = new URL(window.location.href)
    url.searchParams.set('name', name)
    window.history.pushState(window.history.state, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, 'Large Agent 250')
  await expect(cards).toHaveCount(1)
  await nextStableFrame(page)
  const item250 = page.getByTestId(`agent-registry-${largeListId.agent(250)}`).getByRole('link')
  await expect(page.getByLabel('Name')).toHaveValue('Large Agent 250')
  const filterFocusAfter = await activeElementEvidence(page)
  expect(filterFocusAfter, JSON.stringify({ filterFocusBefore, filterFocusAfter })).toMatchObject({
    ariaLabel: 'Open details for Large Agent 250',
    parentTestId: `agent-registry-${largeListId.agent(250)}`,
    tag: 'a',
  })
  await expect(item250).toBeFocused()
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0)

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(250)
  const ledger = await readSettledMockRequests(request, 'GET', '/api/v1/agents')
  assertThreePages(ledger, '/api/v1/agents')

  const evidence = summarizePerformance(samples, interactionMs, paginationMs, [300, 1])
  await attachEvidence(testInfo, 'large-list-agents', evidence)
  await writeMockEvidence({ ledger, name: 'large-list-agents', page, testInfo })
  assertPerformance(evidence)
})
