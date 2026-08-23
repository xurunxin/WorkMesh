// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OperationsContent, shouldReanchorOperationsSection } from './operations-content'
import { ApiError, apiRequest } from './lib/api'
import { LocaleProvider } from './lib/i18n'
import type { PagedCollection } from './lib/pagination'
import { ToastViewport } from './lib/toast-viewport'
import { toastStore } from './lib/use-toast'

vi.mock('./lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('./lib/api')>()
  return { ...actual, apiRequest: vi.fn() }
})

const paginationMock = vi.hoisted(() => ({ usePagedApiList: vi.fn() }))

vi.mock('./lib/pagination', () => ({
  LoadMoreButton: ({
    collection,
    label,
    loadMoreLabel,
  }: {
    collection: Pick<PagedCollection<{ id: string }>, 'nextCursor' | 'loading' | 'loadingMore' | 'loadMore'>
    label: string
    loadMoreLabel?: string
  }) => collection.nextCursor ? (
    <button
      data-testid={`load-more-${label.toLowerCase().replaceAll(' ', '-')}`}
      disabled={collection.loading || collection.loadingMore}
      onClick={() => void collection.loadMore()}
      type="button"
    >
      {loadMoreLabel}
    </button>
  ) : null,
  usePagedApiList: paginationMock.usePagedApiList,
}))

type TestItem = { id: string } & Record<string, unknown>
type TestCollection = PagedCollection<TestItem>

const collections = new Map<string, TestCollection>()
const emptyCollection = (overrides: Partial<TestCollection> = {}): TestCollection => ({
  error: null,
  initialized: true,
  items: [],
  loadMore: vi.fn(async () => undefined),
  loading: false,
  loadingMore: false,
  nextCursor: null,
  refresh: vi.fn(async () => undefined),
  ...overrides,
})

function mockCollection(path: string, overrides: Partial<TestCollection>) {
  const collection = emptyCollection(overrides)
  collections.set(path, collection)
  return collection
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

const featureRegistry = (enabled: readonly FeatureKey[]) => ({
  features: canonicalFeatures.map(feature => ({
    ...feature,
    enabled: enabled.includes(feature.key),
  })),
})

const usage = {
  input_tokens: '0',
  output_tokens: '0',
  runtime_ms: '0',
  tool_calls: '0',
  unknown_cost_records: 0,
  currency_buckets: [],
}

const operations = 'WORKMESH_BETA_OPERATIONS_UI' as const
const allOperationsFeatures: readonly FeatureKey[] = [
  operations,
  'WORKMESH_BETA_COSTS',
  'WORKMESH_BETA_PLANNING',
  'WORKMESH_EXPERIMENTAL_AUTOMATION',
  'WORKMESH_EXPERIMENTAL_AGENT_LOOPS',
  'WORKMESH_BETA_TEMPLATES',
]
const scrollIntoView = vi.fn()

function renderContent(embedded = false, authorityKey: string | null = 'test-authority') {
  return render(<LocaleProvider><OperationsContent authorityKey={authorityKey} embedded={embedded} /><ToastViewport /></LocaleProvider>)
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => { resolve = res })
  return { promise, resolve }
}

function mockFeatures(enabled: readonly FeatureKey[]) {
  vi.mocked(apiRequest).mockResolvedValueOnce(featureRegistry(enabled))
  if (enabled.includes('WORKMESH_BETA_COSTS'))
    vi.mocked(apiRequest).mockResolvedValueOnce(usage)
}

afterEach(() => { cleanup(); toastStore.reset() })
beforeEach(() => {
  toastStore.reset()
  vi.mocked(apiRequest).mockReset()
  collections.clear()
  paginationMock.usePagedApiList.mockImplementation((path: string | null) =>
    path ? collections.get(path) ?? emptyCollection() : emptyCollection())
  scrollIntoView.mockReset()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })
  window.history.replaceState(null, '', '/operations')
})

describe('shouldReanchorOperationsSection', () => {
  it.each([
    {
      expected: true,
      input: { embedded: false, hash: '#operations-runs', layoutDidInitialize: true, section: 'runs', targetIsActive: true },
      label: 'a focused standalone target after initial layout growth',
    },
    {
      expected: false,
      input: { embedded: true, hash: '#operations-runs', layoutDidInitialize: true, section: 'runs', targetIsActive: true },
      label: 'an embedded target',
    },
    {
      expected: false,
      input: { embedded: false, hash: '#operations-loops', layoutDidInitialize: true, section: 'runs', targetIsActive: true },
      label: 'a changed hash',
    },
    {
      expected: false,
      input: { embedded: false, hash: '#operations-runs', layoutDidInitialize: true, section: 'runs', targetIsActive: false },
      label: 'a target after the user moved focus',
    },
    {
      expected: false,
      input: { embedded: false, hash: '#operations-runs', layoutDidInitialize: false, section: 'runs', targetIsActive: true },
      label: 'an ordinary refresh without an initialization transition',
    },
  ] as const)('returns $expected for $label', ({ expected, input }) => {
    expect(shouldReanchorOperationsSection(input)).toBe(expected)
  })
})

describe('OperationsContent section navigation', () => {
  it('keeps the page header stable while feature authority resolves without exposing dependent anchors', async () => {
    const pendingFeatures = deferred<ReturnType<typeof featureRegistry>>()
    vi.mocked(apiRequest).mockReturnValueOnce(pendingFeatures.promise)
    renderContent()
    const heading = screen.getByRole('heading', { name: '运营与规划' })
    const refresh = screen.getByRole('button', { name: '刷新' })
    expect(screen.getByRole('link', { name: '返回工作区' })).toBeVisible()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('navigation', { name: '运营分区' })).toBeNull()

    await act(async () => {
      pendingFeatures.resolve(featureRegistry([operations, 'WORKMESH_BETA_PLANNING']))
      await pendingFeatures.promise
    })

    expect(screen.getByRole('heading', { name: '运营与规划' })).toBe(heading)
    expect(screen.getByRole('button', { name: '刷新' })).toBe(refresh)
    expect(await screen.findByRole('navigation', { name: '运营分区' })).toBeVisible()
  })

  it('renders disabled and Operations-only states without a blank navigation or grid', async () => {
    mockFeatures([])
    const disabled = renderContent()
    expect(await screen.findByTestId('operations-disabled')).toBeVisible()
    expect(screen.queryByRole('navigation', { name: '运营分区' })).toBeNull()
    disabled.unmount()

    mockFeatures([operations])
    renderContent()
    expect(await screen.findByRole('heading', { name: '尚无可用运营模块' })).toBeVisible()
    expect(screen.getByText('此部署已启用运营页面，但尚未启用任何运营模块。')).toBeVisible()
    expect(screen.queryByRole('navigation', { name: '运营分区' })).toBeNull()
    expect(document.querySelector('.operations-grid')).toBeNull()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('uses ordinary anchors and unique focusable targets in deterministic order', async () => {
    mockFeatures(allOperationsFeatures)
    renderContent()

    const navigation = await screen.findByRole('navigation', { name: '运营分区' })
    const links = within(navigation).getAllByRole('link')
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '#operations-metrics',
      '#operations-cycles',
      '#operations-initiatives',
      '#operations-automation',
      '#operations-loops',
      '#operations-runs',
      '#operations-templates',
    ])

    const targetIds = links.map(link => link.getAttribute('href')?.slice(1) ?? '')
    expect(new Set(targetIds).size).toBe(targetIds.length)
    for (const id of targetIds) {
      const target = document.getElementById(id)
      expect(target).not.toBeNull()
      expect(target).toHaveAttribute('tabindex', '-1')
    }
  })

  it('hydrates hash state, gives one link current-location ownership, and focuses on a same-hash click', async () => {
    window.history.replaceState(null, '', '/operations#operations-runs')
    mockFeatures(allOperationsFeatures)
    renderContent()

    const navigation = await screen.findByRole('navigation', { name: '运营分区' })
    const runsLink = within(navigation).getByRole('link', { name: '近期运行' })
    await waitFor(() => expect(runsLink).toHaveAttribute('aria-current', 'location'))
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(within(navigation).getAllByRole('link').filter(link => link.hasAttribute('aria-current'))).toEqual([runsLink])

    const refresh = screen.getByRole('button', { name: '刷新' })
    refresh.focus()
    expect(document.activeElement).toBe(refresh)
    expect(fireEvent.click(runsLink)).toBe(true)
    expect(document.activeElement).toBe(document.getElementById('operations-runs'))
  })

  it('reanchors a still-focused direct hash after initial collection layout growth only', async () => {
    window.history.replaceState(null, '', '/operations#operations-runs')
    const rules = mockCollection('/api/v1/automation-rules', { initialized: false, loading: true })
    const loops = mockCollection('/api/v1/loops', { initialized: false, loading: true })
    mockFeatures([operations, 'WORKMESH_EXPERIMENTAL_AUTOMATION', 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS'])
    const view = renderContent()

    const navigation = await screen.findByRole('navigation', { name: '运营分区' })
    const runsLink = within(navigation).getByRole('link', { name: '近期运行' })
    const runsTarget = document.getElementById('operations-runs')
    await waitFor(() => expect(runsLink).toHaveAttribute('aria-current', 'location'))
    await waitFor(() => expect(document.activeElement).toBe(runsTarget))
    scrollIntoView.mockClear()

    rules.initialized = true
    rules.loading = false
    view.rerender(<LocaleProvider><OperationsContent authorityKey="test-authority" /><ToastViewport /></LocaleProvider>)
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    expect(document.activeElement).toBe(runsTarget)

    const refresh = screen.getByRole('button', { name: '刷新' })
    refresh.focus()
    scrollIntoView.mockClear()
    loops.initialized = true
    loops.loading = false
    view.rerender(<LocaleProvider><OperationsContent authorityKey="test-authority" /><ToastViewport /></LocaleProvider>)
    await act(async () => { await Promise.resolve() })
    expect(document.activeElement).toBe(refresh)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not reanchor a direct hash during an ordinary feature refresh', async () => {
    window.history.replaceState(null, '', '/operations#operations-runs')
    const enabled = [operations, 'WORKMESH_EXPERIMENTAL_AUTOMATION'] as const
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(featureRegistry(enabled))
      .mockResolvedValueOnce(featureRegistry(enabled))
    renderContent()

    const navigation = await screen.findByRole('navigation', { name: '运营分区' })
    const runsLink = within(navigation).getByRole('link', { name: '近期运行' })
    await waitFor(() => expect(runsLink).toHaveAttribute('aria-current', 'location'))
    const refresh = screen.getByRole('button', { name: '刷新' })
    refresh.focus()
    scrollIntoView.mockClear()
    fireEvent.click(refresh)

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2))
    expect(document.activeElement).toBe(refresh)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it.each(['#operations-runs', '#operations-unknown'])('leaves hidden or unknown hash %s untouched and without a current location', async hash => {
    window.history.replaceState(null, '', `/operations${hash}`)
    mockFeatures([operations, 'WORKMESH_BETA_PLANNING'])
    renderContent()

    const navigation = await screen.findByRole('navigation', { name: '运营分区' })
    await waitFor(() => expect(within(navigation).getAllByRole('link')).toHaveLength(2))
    expect(window.location.hash).toBe(hash)
    expect(within(navigation).getAllByRole('link').some(link => link.hasAttribute('aria-current'))).toBe(false)
    expect(document.getElementById('operations-runs')).toBeNull()
  })

  it('synchronizes current location and focus on hashchange', async () => {
    mockFeatures(allOperationsFeatures)
    renderContent()
    const navigation = await screen.findByRole('navigation', { name: '运营分区' })
    expect(within(navigation).getAllByRole('link').some(link => link.hasAttribute('aria-current'))).toBe(false)

    window.history.replaceState(null, '', '/operations#operations-loops')
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    const loopsLink = within(navigation).getByRole('link', { name: 'Agent 循环' })
    await waitFor(() => expect(loopsLink).toHaveAttribute('aria-current', 'location'))
    expect(document.activeElement).toBe(document.getElementById('operations-loops'))
  })

  it('clears stale current state when a refresh hides its target', async () => {
    window.history.replaceState(null, '', '/operations#operations-runs')
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(featureRegistry(allOperationsFeatures))
      .mockResolvedValueOnce(usage)
      .mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_BETA_PLANNING']))
    renderContent()

    const firstNavigation = await screen.findByRole('navigation', { name: '运营分区' })
    await waitFor(() => expect(within(firstNavigation).getByRole('link', { name: '近期运行' })).toHaveAttribute('aria-current', 'location'))
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))

    await waitFor(() => expect(screen.queryByRole('link', { name: '近期运行' })).toBeNull())
    const nextNavigation = screen.getByRole('navigation', { name: '运营分区' })
    expect(within(nextNavigation).getAllByRole('link').some(link => link.hasAttribute('aria-current'))).toBe(false)
    expect(window.location.hash).toBe('#operations-runs')
  })

  it('mounts Costs and independent collection surfaces while usage is still pending', async () => {
    let resolveUsage: (value: typeof usage) => void = () => undefined
    const pendingUsage = new Promise<typeof usage>(resolve => { resolveUsage = resolve })
    mockCollection('/api/v1/cycles', { items: [
      { id: 'cycle-visible', name: 'Visible while usage waits', state: 'current', starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-08-31T00:00:00Z', total_items: 2, completed_items: 1 },
    ] })
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_BETA_COSTS', 'WORKMESH_BETA_PLANNING']))
      .mockReturnValueOnce(pendingUsage)
    renderContent()

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/v1/usage-summary', expect.objectContaining({ signal: expect.any(AbortSignal) })))
    const pendingNavigation = screen.getByRole('navigation', { name: '运营分区' })
    expect(within(pendingNavigation).getByRole('link', { name: '使用量与成本' })).toBeVisible()
    expect(document.getElementById('operations-metrics')).not.toHaveAttribute('aria-busy')
    expect(within(document.getElementById('operations-metrics')!).getByRole('status', { name: '正在加载运营数据…' })).toBeVisible()
    expect(document.querySelectorAll('.operations-usage-loading .skeleton-list-cell')).toHaveLength(5)
    expect(screen.getByText('Visible while usage waits')).toBeVisible()

    await act(async () => { resolveUsage(usage); await pendingUsage })
    const navigation = await screen.findByRole('navigation', { name: '运营分区' })
    expect(within(navigation).getByRole('link', { name: '使用量与成本' })).toHaveAttribute('href', '#operations-metrics')
    expect(document.getElementById('operations-metrics')).toHaveAttribute('tabindex', '-1')
    expect(document.getElementById('operations-metrics')).not.toHaveAttribute('aria-busy')
  })

  it('renders a fetched malformed usage root as unavailable instead of leaving Costs loading', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_BETA_COSTS']))
      .mockResolvedValueOnce(null)
    renderContent()

    expect(await screen.findByText('使用量数据不可用')).toBeVisible()
    expect(document.getElementById('operations-metrics')).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('navigation', { name: '运营分区' })).toBeVisible()
  })

  it('treats Costs off to on as a new pending scope instead of synthesized zero usage', async () => {
    let resolveUsage: (value: typeof usage) => void = () => undefined
    const pendingUsage = new Promise<typeof usage>(resolve => { resolveUsage = resolve })
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(featureRegistry([operations]))
      .mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_BETA_COSTS']))
      .mockReturnValueOnce(pendingUsage)
    renderContent()

    expect(await screen.findByTestId('operations-sections-empty')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))

    const metrics = await waitFor(() => {
      const current = document.getElementById('operations-metrics')
      expect(current).not.toBeNull()
      return current as HTMLElement
    })
    expect(metrics).not.toHaveAttribute('aria-busy')
    expect(within(metrics).getByRole('status', { name: '正在加载运营数据…' })).toBeVisible()
    expect(within(metrics).queryByRole('list', { name: '使用量与成本' })).toBeNull()

    await act(async () => { resolveUsage({ ...usage, input_tokens: '333' }); await pendingUsage })
    expect(await within(metrics).findByText('333')).toBeVisible()
    expect(metrics).not.toHaveAttribute('aria-busy')
  })

  it('retains resolved Costs DOM and focus during an on to on refresh', async () => {
    let resolveUsage: (value: typeof usage) => void = () => undefined
    const pendingUsage = new Promise<typeof usage>(resolve => { resolveUsage = resolve })
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_BETA_COSTS']))
      .mockResolvedValueOnce({ ...usage, input_tokens: '111' })
      .mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_BETA_COSTS']))
      .mockReturnValueOnce(pendingUsage)
    renderContent()

    expect(await screen.findByText('111')).toBeVisible()
    const metrics = document.getElementById('operations-metrics')!
    const usageList = within(metrics).getByRole('list', { name: '使用量与成本' })
    metrics.focus()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))

    await waitFor(() => expect(metrics).toHaveAttribute('aria-busy', 'true'))
    expect(within(metrics).getByRole('list', { name: '使用量与成本' })).toBe(usageList)
    expect(within(metrics).getByText('111')).toBeVisible()
    expect(document.activeElement).toBe(metrics)

    await act(async () => { resolveUsage({ ...usage, input_tokens: '222' }); await pendingUsage })
    expect(await within(metrics).findByText('222')).toBeVisible()
    expect(within(metrics).queryByText('111')).toBeNull()
    expect(document.activeElement).toBe(metrics)
    expect(metrics).not.toHaveAttribute('aria-busy')
  })

  it('retains resolved Costs and focus on an ordinary refresh failure, then revokes them on 403', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_BETA_COSTS']))
      .mockResolvedValueOnce({ ...usage, input_tokens: '444' })
      .mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_BETA_COSTS']))
      .mockRejectedValueOnce(new TypeError('private usage refresh diagnostic'))
      .mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_BETA_COSTS']))
      .mockRejectedValueOnce(new ApiError(403, 'private usage forbidden diagnostic'))
    renderContent()

    expect(await screen.findByText('444')).toBeVisible()
    const metrics = document.getElementById('operations-metrics')!
    const usageList = within(metrics).getByRole('list', { name: '使用量与成本' })
    metrics.focus()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))

    expect(await within(metrics).findByText('请稍后重试或联系工作区管理员。')).toBeVisible()
    expect(within(metrics).getByRole('list', { name: '使用量与成本' })).toBe(usageList)
    expect(within(metrics).getByText('444')).toBeVisible()
    expect(document.activeElement).toBe(metrics)
    expect(screen.queryByText('private usage refresh diagnostic')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(within(metrics).queryByRole('list', { name: '使用量与成本' })).toBeNull())
    expect(within(metrics).getByText('请稍后重试或联系工作区管理员。')).toBeVisible()
    expect(screen.queryByText('private usage forbidden diagnostic')).toBeNull()
  })

  it('aborts StrictMode feature discovery and ignores its late response', async () => {
    let resolveFirst: (value: ReturnType<typeof featureRegistry>) => void = () => undefined
    let resolveSecond: (value: ReturnType<typeof featureRegistry>) => void = () => undefined
    const first = new Promise<ReturnType<typeof featureRegistry>>(resolve => { resolveFirst = resolve })
    const second = new Promise<ReturnType<typeof featureRegistry>>(resolve => { resolveSecond = resolve })
    vi.mocked(apiRequest).mockReturnValueOnce(first).mockReturnValueOnce(second)

    render(<StrictMode><LocaleProvider><OperationsContent authorityKey="test-authority" /></LocaleProvider></StrictMode>)
    await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.filter(([path]) => path === '/api/v1/features')).toHaveLength(2))
    const firstSignal = vi.mocked(apiRequest).mock.calls[0]?.[1]?.signal
    expect(firstSignal).toBeInstanceOf(AbortSignal)
    expect((firstSignal as AbortSignal).aborted).toBe(true)

    await act(async () => { resolveFirst(featureRegistry(allOperationsFeatures)); await first })
    expect(screen.queryByRole('navigation', { name: '运营分区' })).toBeNull()

    await act(async () => { resolveSecond(featureRegistry([operations])); await second })
    expect(await screen.findByTestId('operations-sections-empty')).toBeVisible()
    expect(screen.queryByRole('navigation', { name: '运营分区' })).toBeNull()
  })

  it('aborts superseded usage, accepts only the latest generation, and keeps collection surfaces mounted', async () => {
    let resolveOldUsage: (value: typeof usage) => void = () => undefined
    let resolveNewUsage: (value: typeof usage) => void = () => undefined
    const oldUsage = new Promise<typeof usage>(resolve => { resolveOldUsage = resolve })
    const newUsage = new Promise<typeof usage>(resolve => { resolveNewUsage = resolve })
    let usageCalls = 0
    vi.mocked(apiRequest).mockImplementation((path: string) => {
      if (path === '/api/v1/features') return Promise.resolve(featureRegistry([operations, 'WORKMESH_BETA_COSTS']))
      usageCalls += 1
      return usageCalls === 1 ? oldUsage : newUsage
    })
    renderContent()
    await waitFor(() => expect(usageCalls).toBe(1))
    const oldUsageCall = vi.mocked(apiRequest).mock.calls.find(([path]) => path === '/api/v1/usage-summary')
    const oldSignal = oldUsageCall?.[1]?.signal
    expect(oldSignal).toBeInstanceOf(AbortSignal)

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(usageCalls).toBe(2))
    expect((oldSignal as AbortSignal).aborted).toBe(true)

    await act(async () => { resolveNewUsage({ ...usage, input_tokens: '222' }); await newUsage })
    expect(await screen.findByText('222')).toBeVisible()
    await act(async () => { resolveOldUsage({ ...usage, input_tokens: '111' }); await oldUsage })
    expect(screen.getByText('222')).toBeVisible()
    expect(screen.queryByText('111')).toBeNull()
  })

  it('renders the same anchor membership when embedded in Settings', async () => {
    mockFeatures([operations, 'WORKMESH_EXPERIMENTAL_AUTOMATION'])
    renderContent(true)

    const navigation = await screen.findByRole('navigation', { name: '运营分区' })
    expect(within(navigation).getAllByRole('link').map(link => link.getAttribute('href'))).toEqual([
      '#operations-automation',
      '#operations-runs',
    ])
    expect(screen.queryByRole('link', { name: '返回工作区' })).toBeNull()
  })

  it('restores embedded current state on mount and popstate without passive focus or scrolling', async () => {
    window.history.replaceState(null, '', '/settings?tab=operations#operations-runs')
    mockFeatures(allOperationsFeatures)
    render(<LocaleProvider>
      <button data-testid="connected-focus" type="button">Connected focus</button>
      <OperationsContent authorityKey="test-authority" embedded />
    </LocaleProvider>)
    const connected = screen.getByTestId('connected-focus')
    connected.focus()

    const navigation = await screen.findByRole('navigation', { name: '运营分区' })
    const runs = within(navigation).getByRole('link', { name: '近期运行' })
    await waitFor(() => expect(runs).toHaveAttribute('aria-current', 'location'))
    expect(document.activeElement).toBe(connected)
    expect(scrollIntoView).not.toHaveBeenCalled()

    window.history.replaceState(null, '', '/settings?tab=operations#operations-loops')
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })
    const loops = within(navigation).getByRole('link', { name: 'Agent 循环' })
    await waitFor(() => expect(loops).toHaveAttribute('aria-current', 'location'))
    expect(runs).not.toHaveAttribute('aria-current')
    expect(document.activeElement).toBe(connected)
    expect(scrollIntoView).not.toHaveBeenCalled()

    fireEvent.click(loops)
    expect(document.activeElement).toBe(document.getElementById('operations-loops'))
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
  })
})

describe('OperationsContent dry-run outcomes', () => {
  const rule = {
    id: 'rule-1',
    name: 'Nightly coordinator',
    revision: 4,
    state: 'active',
    trigger: { cron: '0 1 * * *', type: 'cron' },
    version: 2,
  }

  function prepareAutomation(): TestCollection {
    mockCollection('/api/v1/automation-rules', { items: [rule] })
    const runs = mockCollection('/api/v1/automation-runs', { items: [] })
    mockFeatures([operations, 'WORKMESH_EXPERIMENTAL_AUTOMATION'])
    return runs
  }

  it('emits one localized success toast and clears an earlier conflict on retry', async () => {
    prepareAutomation()
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new ApiError(409, 'private dry-run conflict', 'REVISION_CONFLICT'))
      .mockResolvedValueOnce({ id: 'run-1' })
    renderContent()
    const dryRun = await screen.findByRole('button', { name: '试运行' })

    fireEvent.click(dryRun)
    expect(await screen.findByText('private dry-run conflict')).toBeVisible()
    expect(toastStore.getSnapshot()).toHaveLength(0)

    fireEvent.click(dryRun)
    await waitFor(() => expect(screen.queryByText('private dry-run conflict')).toBeNull())
    expect(toastStore.getSnapshot()).toEqual([
      expect.objectContaining({
        description: '已为「Nightly coordinator」创建试运行。',
        title: '试运行已启动',
        tone: 'success',
      }),
    ])
  })

  it('ignores an A-authority dry run that settles after B replaces the Operations scope', async () => {
    const runs = prepareAutomation()
    const pendingDryRun = deferred<{ id: string }>()
    vi.mocked(apiRequest).mockReturnValueOnce(pendingDryRun.promise)
    const view = renderContent(false, 'workspace-a:actor-a:admin')
    fireEvent.click(await screen.findByRole('button', { name: '试运行' }))
    await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path === '/api/v1/automation-rules/rule-1/dry-run')).toBe(true))
    vi.mocked(apiRequest).mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_EXPERIMENTAL_AUTOMATION']))

    view.rerender(<LocaleProvider><OperationsContent authorityKey="workspace-b:actor-b:member" /><ToastViewport /></LocaleProvider>)
    await act(async () => {
      pendingDryRun.resolve({ id: 'run-a-late' })
      await pendingDryRun.promise
    })

    expect(runs.refresh).not.toHaveBeenCalled()
    expect(toastStore.getSnapshot()).toHaveLength(0)
  })

  it.each([401, 403])('keeps HTTP %s authorization failures contextual with no toast', async status => {
    prepareAutomation()
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(status, 'Authorization is required.', 'FORBIDDEN'))
    renderContent()
    fireEvent.click(await screen.findByRole('button', { name: '试运行' }))

    expect(await screen.findByText('Authorization is required.')).toBeVisible()
    expect(toastStore.getSnapshot()).toHaveLength(0)
  })

  it('uses fixed bilingual copy for a transient failure and never exposes the raw diagnostic', async () => {
    prepareAutomation()
    vi.mocked(apiRequest).mockRejectedValueOnce(new TypeError('private socket diagnostic'))
    renderContent()
    fireEvent.click(await screen.findByRole('button', { name: '试运行' }))

    await waitFor(() => expect(toastStore.getSnapshot()).toEqual([
      expect.objectContaining({
        description: '请检查连接后重试。',
        title: '无法启动试运行',
        tone: 'error',
      }),
    ]))
    expect(screen.queryByText('private socket diagnostic')).toBeNull()
  })

  it('does not clear a safe independent collection failure when a dry run succeeds', async () => {
    const runs = prepareAutomation()
    runs.error = new Error('Runs collection is unavailable')
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: 'run-1' })
    renderContent()
    expect(await screen.findByText('请稍后重试或联系工作区管理员。')).toBeVisible()
    expect(screen.queryByText('Runs collection is unavailable')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '试运行' }))

    await waitFor(() => expect(toastStore.getSnapshot()).toHaveLength(1))
    expect(screen.getByText('请稍后重试或联系工作区管理员。')).toBeVisible()
  })

  it('clears a contextual mutation error when its Retry action refreshes successfully', async () => {
    prepareAutomation()
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new ApiError(409, 'private retry conflict', 'REVISION_CONFLICT'))
      .mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_EXPERIMENTAL_AUTOMATION']))
    renderContent()
    fireEvent.click(await screen.findByRole('button', { name: '试运行' }))
    expect(await screen.findByText('private retry conflict')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByText('private retry conflict')).toBeNull())
    expect(toastStore.getSnapshot()).toHaveLength(0)
  })
})

describe('OperationsContent loaded-record search', () => {
  it('keeps six collection authorities independent and never renders false empty before initialization', async () => {
    const cycles = mockCollection('/api/v1/cycles', { initialized: false, loading: true })
    mockCollection('/api/v1/initiatives', { items: [
      { id: 'initiative-ready', name: 'Independent initiative', status: 'active', priority: 'high', health: 'on_track' },
    ] })
    mockFeatures([operations, 'WORKMESH_BETA_PLANNING'])
    const view = renderContent()

    const cyclesPanel = await screen.findByTestId('cycles-panel')
    expect(within(cyclesPanel).getByRole('status', { name: '正在加载规划周期' })).toBeVisible()
    expect(within(cyclesPanel).queryByRole('heading', { name: '尚未配置规划周期' })).toBeNull()
    expect(screen.getByText('Independent initiative')).toBeVisible()

    cycles.initialized = true
    cycles.loading = false
    view.rerender(<LocaleProvider><OperationsContent authorityKey="test-authority" /><ToastViewport /></LocaleProvider>)
    expect(await within(cyclesPanel).findByRole('heading', { name: '尚未配置规划周期' })).toBeVisible()
  })

  it.each([
    {
      feature: 'WORKMESH_BETA_PLANNING',
      item: { id: 'cycle-loaded', name: 'Loaded cycle', state: 'current', starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-08-31T00:00:00Z', total_items: 1, completed_items: 0 },
      label: '规划周期',
      path: '/api/v1/cycles',
      panelId: 'cycles-panel',
    },
    {
      feature: 'WORKMESH_BETA_PLANNING',
      item: { id: 'initiative-loaded', name: 'Loaded initiative', status: 'active', priority: 'high', health: 'on_track' },
      label: '主题',
      path: '/api/v1/initiatives',
      panelId: 'initiatives-panel',
    },
    {
      feature: 'WORKMESH_EXPERIMENTAL_AUTOMATION',
      item: { id: 'rule-loaded', name: 'Loaded rule', revision: 1, state: 'active', trigger: { type: 'manual' }, version: 1 },
      label: '自动化规则',
      path: '/api/v1/automation-rules',
      panelId: 'automation-panel',
    },
    {
      feature: 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS',
      item: { id: 'loop-loaded', name: 'Loaded loop', state: 'active', revision: 1, next_run_at: null, no_overlap: true },
      label: 'Agent 循环',
      path: '/api/v1/loops',
      panelId: 'loops-panel',
    },
    {
      feature: 'WORKMESH_EXPERIMENTAL_AUTOMATION',
      item: { id: 'run-loaded', rule_id: 'rule-loaded', loop_id: null, session_id: null, dry_run: false, status: 'succeeded', attempt_count: 1, max_attempts: 1, created_at: '2026-08-23T00:00:00Z', last_error: null },
      label: '近期运行',
      path: '/api/v1/automation-runs',
      panelId: 'runs-panel',
    },
    {
      feature: 'WORKMESH_BETA_TEMPLATES',
      item: { id: 'template-loaded', kind: 'work_item', name: 'Loaded template', status: 'active', version: 1 },
      label: '模板与剧本',
      path: '/api/v1/templates',
      panelId: 'templates-panel',
    },
  ] as const)('keeps $label pending, new failure, refresh retention, and revoked authority states independent', async ({ feature, item, label, panelId, path }) => {
    const collection = mockCollection(path, {
      initialized: false,
      loading: true,
      nextCursor: 'next-page',
    })
    mockFeatures([operations, feature])
    const view = renderContent()
    const panel = await screen.findByTestId(panelId)

    expect(panel).not.toHaveAttribute('aria-busy')
    expect(within(panel).getByRole('status', { name: `正在加载${label}` })).toBeVisible()
    expect(within(panel).queryByRole('button', { name: `加载更多 ${label}` })).toBeNull()

    collection.loading = false
    collection.error = new TypeError('private collection diagnostic')
    view.rerender(<LocaleProvider><OperationsContent authorityKey="test-authority" /><ToastViewport /></LocaleProvider>)
    expect(within(panel).queryByRole('status', { name: `正在加载${label}` })).toBeNull()
    expect(within(panel).getByText('请稍后重试或联系工作区管理员。')).toBeVisible()
    expect(within(panel).queryByText('private collection diagnostic')).toBeNull()
    expect(within(panel).queryByRole('button', { name: `加载更多 ${label}` })).toBeNull()

    collection.error = null
    collection.initialized = true
    collection.items = [item]
    view.rerender(<LocaleProvider><OperationsContent authorityKey="test-authority" /><ToastViewport /></LocaleProvider>)
    const continuation = within(panel).getByRole('button', { name: `加载更多 ${label}` })
    continuation.focus()

    collection.loading = true
    view.rerender(<LocaleProvider><OperationsContent authorityKey="test-authority" /><ToastViewport /></LocaleProvider>)
    expect(within(panel).getByRole('button', { name: `加载更多 ${label}` })).toBe(continuation)
    expect(document.activeElement).toBe(continuation)
    expect(panel).toHaveAttribute('aria-busy', 'true')

    collection.loading = false
    collection.error = new TypeError('private refresh diagnostic')
    view.rerender(<LocaleProvider><OperationsContent authorityKey="test-authority" /><ToastViewport /></LocaleProvider>)
    expect(within(panel).getByRole('button', { name: `加载更多 ${label}` })).toBe(continuation)
    expect(document.activeElement).toBe(continuation)
    expect(panel).not.toHaveAttribute('aria-busy')
    expect(within(panel).getByText('请稍后重试或联系工作区管理员。')).toBeVisible()
    expect(within(panel).queryByText('private refresh diagnostic')).toBeNull()

    collection.error = new ApiError(403, 'private forbidden diagnostic')
    view.rerender(<LocaleProvider><OperationsContent authorityKey="test-authority" /><ToastViewport /></LocaleProvider>)
    expect(within(panel).queryByRole('button', { name: `加载更多 ${label}` })).toBeNull()
    expect(within(panel).getByText('请稍后重试或联系工作区管理员。')).toBeVisible()
    expect(within(panel).queryByText('private forbidden diagnostic')).toBeNull()
  })

  it('synchronously clears Operations local projections and aborts an old authority refresh', async () => {
    mockFeatures([operations, 'WORKMESH_BETA_PLANNING'])
    const view = renderContent(false, 'workspace-a:actor-a:admin')
    const search = await screen.findByRole('searchbox', { name: '搜索已加载的运营记录' })
    fireEvent.change(search, { target: { value: 'actor A private filter' } })

    const stale = deferred<ReturnType<typeof featureRegistry>>()
    vi.mocked(apiRequest).mockImplementationOnce((_path, init) => stale.promise.then(value => value))
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    const staleSignal = vi.mocked(apiRequest).mock.calls.at(-1)?.[1]?.signal as AbortSignal
    vi.mocked(apiRequest).mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_BETA_PLANNING']))

    view.rerender(<LocaleProvider><OperationsContent authorityKey="workspace-b:actor-b:member" /><ToastViewport /></LocaleProvider>)

    expect(staleSignal.aborted).toBe(true)
    expect(screen.queryByDisplayValue('actor A private filter')).toBeNull()
    expect(screen.getByRole('status', { name: '正在加载运营数据…' })).toBeVisible()
    stale.resolve(featureRegistry([operations, 'WORKMESH_BETA_PLANNING']))
    expect((await screen.findByRole('searchbox', { name: '搜索已加载的运营记录' }) as HTMLInputElement).value).toBe('')
  })

  it('stamps an initial unowned route query and clears it before a new authority can hydrate it', async () => {
    window.history.replaceState(null, '', '/operations?scope=team&opsQuery=A-private#operations-cycles')
    mockFeatures([operations, 'WORKMESH_BETA_PLANNING'])
    const view = renderContent(false, 'workspace-a:actor-a:admin')
    expect((await screen.findByRole('searchbox', { name: '搜索已加载的运营记录' }) as HTMLInputElement).value).toBe('A-private')
    expect(window.history.state).toEqual({ workmeshOperationsAuthorityKey: 'workspace-a:actor-a:admin' })

    vi.mocked(apiRequest).mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_BETA_PLANNING']))
    view.rerender(<LocaleProvider><OperationsContent authorityKey="workspace-b:actor-b:member" /><ToastViewport /></LocaleProvider>)

    expect((await screen.findByRole('searchbox', { name: '搜索已加载的运营记录' }) as HTMLInputElement).value).toBe('')
    expect(window.location.search).toBe('?scope=team')
    expect(window.location.hash).toBe('#operations-cycles')
    expect(window.history.state).toEqual({ workmeshOperationsAuthorityKey: 'workspace-b:actor-b:member' })
  })

  it('retains exact collection controls and focus during refresh and ordinary failure, then revokes them on 403', async () => {
    const rules = mockCollection('/api/v1/automation-rules', {
      items: [{ id: 'rule-retained', name: 'Retained rule', revision: 1, state: 'active', trigger: { type: 'manual' }, version: 1 }],
      nextCursor: 'rules-more',
    })
    mockCollection('/api/v1/automation-runs', {})
    mockFeatures([operations, 'WORKMESH_EXPERIMENTAL_AUTOMATION'])
    const view = renderContent()
    const action = await screen.findByRole('button', { name: '试运行' })
    action.focus()

    rules.loading = true
    view.rerender(<LocaleProvider><OperationsContent authorityKey="test-authority" /><ToastViewport /></LocaleProvider>)
    expect(screen.getByRole('button', { name: '试运行' })).toBe(action)
    expect(document.activeElement).toBe(action)
    expect(screen.getByTestId('automation-panel')).toHaveAttribute('aria-busy', 'true')
    expect(document.querySelectorAll('.operations-tab > .sr-only[role="status"]')).toHaveLength(1)

    rules.loading = false
    rules.error = new TypeError('private collection refresh diagnostic')
    view.rerender(<LocaleProvider><OperationsContent authorityKey="test-authority" /><ToastViewport /></LocaleProvider>)
    expect(screen.getByRole('button', { name: '试运行' })).toBe(action)
    expect(document.activeElement).toBe(action)
    expect(screen.getByTestId('automation-panel')).not.toHaveAttribute('aria-busy')
    expect(screen.queryByText('private collection refresh diagnostic')).toBeNull()
    expect(screen.getByTestId('load-more-自动化规则')).toBeVisible()

    rules.error = new ApiError(403, 'private forbidden diagnostic')
    view.rerender(<LocaleProvider><OperationsContent authorityKey="test-authority" /><ToastViewport /></LocaleProvider>)
    expect(screen.queryByRole('button', { name: '试运行' })).toBeNull()
    expect(screen.queryByTestId('load-more-自动化规则')).toBeNull()
    expect(screen.queryByText('private forbidden diagnostic')).toBeNull()
  })
  it('hydrates opsQuery and preserves history state, unrelated parameters, and hash on input', async () => {
    mockCollection('/api/v1/cycles', { items: [
      { id: 'cycle-nightly', name: 'Nightly sync', state: 'current', starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-08-31T00:00:00Z', total_items: 12, completed_items: 5 },
      { id: 'cycle-daytime', name: 'Daytime review', state: 'upcoming', starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-09-30T00:00:00Z', total_items: 6, completed_items: 0 },
    ] })
    window.history.replaceState({ retained: 'task-4.2' }, '', '/operations?scope=team&opsQuery=%20nightly%20#operations-cycles')
    mockFeatures([operations, 'WORKMESH_BETA_PLANNING'])
    renderContent()

    const search = await screen.findByRole('searchbox', { name: '搜索已加载的运营记录' })
    expect(search).toHaveAttribute('data-hotkey-filter', 'true')
    await waitFor(() => expect(search).toHaveValue('nightly'))
    expect(screen.getByText('Nightly sync')).toBeVisible()
    expect(screen.queryByText('Daytime review')).toBeNull()

    fireEvent.change(search, { target: { value: 'failed queue' } })
    expect(new URLSearchParams(window.location.search).get('scope')).toBe('team')
    expect(new URLSearchParams(window.location.search).get('opsQuery')).toBe('failed queue')
    expect(window.location.hash).toBe('#operations-cycles')
    expect(window.history.state).toEqual({ retained: 'task-4.2', workmeshOperationsAuthorityKey: 'test-authority' })

    fireEvent.change(search, { target: { value: '   ' } })
    expect(new URLSearchParams(window.location.search).has('opsQuery')).toBe(false)
    expect(new URLSearchParams(window.location.search).get('scope')).toBe('team')
    expect(window.location.hash).toBe('#operations-cycles')
  })

  it('rereads same-Operations-tab popstate without taking over a Settings cross-tab URL', async () => {
    mockCollection('/api/v1/cycles', { items: [
      { id: 'cycle-first', name: 'First cycle', state: 'current', starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-08-31T00:00:00Z', total_items: 1, completed_items: 0 },
      { id: 'cycle-second', name: 'Second cycle', state: 'upcoming', starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-09-30T00:00:00Z', total_items: 1, completed_items: 0 },
    ] })
    window.history.replaceState(null, '', '/settings?tab=operations&opsQuery=first')
    mockFeatures([operations, 'WORKMESH_BETA_PLANNING'])
    renderContent(true)
    const search = await screen.findByRole('searchbox', { name: '搜索已加载的运营记录' })
    await waitFor(() => expect(search).toHaveValue('first'))

    window.history.pushState(null, '', '/settings?tab=operations&opsQuery=second')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(search).toHaveValue('second'))

    window.history.replaceState(null, '', '/settings?tab=workspace&opsQuery=first')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(search).toHaveValue('second')
  })

  it('distinguishes initial loading, exhausted server-empty, and loaded no-match states', async () => {
    mockCollection('/api/v1/cycles', { initialized: false, loading: true })
    mockFeatures([operations, 'WORKMESH_BETA_PLANNING'])
    const loading = renderContent()
    expect(await screen.findByRole('status', { name: '正在加载规划周期' })).toBeVisible()
    loading.unmount()

    mockCollection('/api/v1/cycles', { items: [], loading: false, nextCursor: null })
    mockFeatures([operations, 'WORKMESH_BETA_PLANNING'])
    const empty = renderContent()
    expect(await screen.findByRole('heading', { name: '尚未配置规划周期' })).toBeVisible()
    empty.unmount()

    mockCollection('/api/v1/cycles', { items: [
      { id: 'cycle-nightly', name: 'Nightly sync', state: 'current', starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-08-31T00:00:00Z', total_items: 12, completed_items: 5 },
    ] })
    window.history.replaceState(null, '', '/operations?opsQuery=missing')
    mockFeatures([operations, 'WORKMESH_BETA_PLANNING'])
    renderContent()
    expect(await screen.findByRole('heading', { name: '已加载的规划周期中没有匹配项' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: '尚未配置规划周期' })).toBeNull()
  })

  it('keeps the unfiltered Load More control available while an active query has no matches', async () => {
    const cycles = mockCollection('/api/v1/cycles', {
      items: [{ id: 'cycle-nightly', name: 'Nightly sync', state: 'current', starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-08-31T00:00:00Z', total_items: 12, completed_items: 5 }],
      nextCursor: 'cycle-page-2',
    })
    window.history.replaceState(null, '', '/operations?opsQuery=second-page')
    mockFeatures([operations, 'WORKMESH_BETA_PLANNING'])
    renderContent()

    expect(await screen.findByRole('heading', { name: '已加载的规划周期中没有匹配项' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '加载更多 规划周期' }))
    expect(cycles.loadMore).toHaveBeenCalledTimes(1)
  })

  it('matches localized rendered values and dates but not hidden raw enums or full identifiers', async () => {
    const created = '2026-08-23T01:00:00Z'
    const visibleDate = new Date(created).toLocaleString('zh-CN')
    mockCollection('/api/v1/initiatives', { items: [
      { id: 'initiative-1', name: 'Runtime reliability', status: 'active', priority: 'urgent', health: 'on_track' },
    ] })
    mockCollection('/api/v1/automation-runs', { items: [
      { id: 'run-visible-123456789', rule_id: 'rule-1', loop_id: null, session_id: 'session-visible-987654321', dry_run: true, status: 'dry_run', attempt_count: 1, max_attempts: 3, created_at: created, last_error: 'Retry queue exhausted' },
    ] })
    mockFeatures([operations, 'WORKMESH_BETA_PLANNING', 'WORKMESH_EXPERIMENTAL_AUTOMATION'])
    renderContent()
    const search = await screen.findByRole('searchbox', { name: '搜索已加载的运营记录' })

    fireEvent.change(search, { target: { value: '健康' } })
    expect(screen.getByText('Runtime reliability')).toBeVisible()
    fireEvent.change(search, { target: { value: 'on_track' } })
    expect(screen.queryByText('Runtime reliability')).toBeNull()

    fireEvent.change(search, { target: { value: visibleDate } })
    expect(screen.getByText('run-visi')).toBeVisible()
    fireEvent.change(search, { target: { value: '123456789' } })
    expect(screen.queryByText('run-visi')).toBeNull()
    fireEvent.change(search, { target: { value: '试运行' } })
    expect(screen.getByText('run-visi')).toBeVisible()
  })

  it('keeps the aggregate metrics anchor visible and outside loaded-record matching', async () => {
    mockCollection('/api/v1/cycles', { items: [
      { id: 'cycle-nightly', name: 'Nightly sync', state: 'current', starts_at: '2026-08-01T00:00:00Z', ends_at: '2026-08-31T00:00:00Z', total_items: 12, completed_items: 5 },
    ] })
    window.history.replaceState(null, '', '/operations?opsQuery=9%2C007%2C199%2C254%2C740%2C993#operations-metrics')
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(featureRegistry([operations, 'WORKMESH_BETA_COSTS', 'WORKMESH_BETA_PLANNING']))
      .mockResolvedValueOnce({
        ...usage,
        input_tokens: '9007199254740993',
      })
    renderContent()

    expect(await screen.findByRole('list', { name: '使用量与成本' })).toBeVisible()
    const metrics = document.getElementById('operations-metrics')
    expect(metrics).toHaveAttribute('aria-label', '使用量与成本')
    expect(metrics).toHaveAttribute('tabindex', '-1')
    expect(screen.getByText('9,007,199,254,740,993')).toBeVisible()
    expect(screen.getByRole('heading', { name: '已加载的规划周期中没有匹配项' })).toBeVisible()
  })
})
