// @vitest-environment jsdom
import { StrictMode, useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api'
import { LocaleProvider } from '../lib/i18n'
import type { PagedCollection } from '../lib/pagination'
import { toastStore } from '../lib/use-toast'
import SettingsPage from './page'

const paginationMock = vi.hoisted(() => ({ usePagedApiList: vi.fn() }))
const apiMock = vi.hoisted(() => ({ apiMutation: vi.fn(), apiRequest: vi.fn() }))
const authMock = vi.hoisted(() => ({
  actor: { id: 'human-1', display_name: 'Ada', workspace_id: 'workspace-1', workspace_role: 'admin' },
  error: '',
  loading: false,
  refresh: vi.fn(async () => undefined),
}))

vi.mock('../lib/pagination', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/pagination')>()
  return { ...actual, usePagedApiList: paginationMock.usePagedApiList }
})
vi.mock('../lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, apiMutation: apiMock.apiMutation, apiRequest: apiMock.apiRequest }
})
vi.mock('../lib/use-authenticated-actor', () => ({
  useAuthenticatedActor: () => authMock,
}))
vi.mock('../operations-content', () => ({
  OperationsContent: ({ embedded }: { embedded?: boolean }) => (
    <button data-testid="operations-content" type="button">{embedded ? 'Embedded Operations' : 'Operations'}</button>
  ),
}))

type TestItem = { id: string } & Record<string, unknown>
type TestCollection = PagedCollection<TestItem>
type MediaStub = {
  matches: boolean
  listeners: Set<(event: { matches: boolean }) => void>
  trigger: (next: boolean) => void
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

const collection = (items: TestItem[], overrides: Partial<TestCollection> = {}): TestCollection => ({
  error: null,
  initialized: true,
  items,
  loadMore: vi.fn(async () => undefined),
  loading: false,
  loadingMore: false,
  nextCursor: null,
  refresh: vi.fn(async () => undefined),
  ...overrides,
})

let teams: TestCollection
let states: TestCollection
let disabled: TestCollection
let requestedPaths: Array<string | null>

function installMatchMedia(initial: boolean): MediaStub {
  const stub: MediaStub = {
    matches: initial,
    listeners: new Set(),
    trigger(next) {
      stub.matches = next
      for (const listener of stub.listeners) listener({ matches: next })
    },
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      get matches() { return stub.matches },
      media: '(max-width: 720px)',
      onchange: null,
      addEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => stub.listeners.add(listener),
      removeEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => stub.listeners.delete(listener),
      addListener: (listener: (event: { matches: boolean }) => void) => stub.listeners.add(listener),
      removeListener: (listener: (event: { matches: boolean }) => void) => stub.listeners.delete(listener),
      dispatchEvent: () => true,
    }),
  })
  return stub
}

function renderPage() {
  return render(<LocaleProvider><SettingsPage /></LocaleProvider>)
}

function useMockPagedApiList(path: string | null): TestCollection {
  requestedPaths.push(path)
  const [scope, setScope] = useState<string | null>(null)
  useEffect(() => setScope(path), [path])
  if (scope !== path) return { ...disabled, initialized: false, loading: Boolean(path) }
  if (path === '/api/v1/teams') return teams
  if (path?.endsWith('/states')) return states
  return disabled
}

function renderStrictPage() {
  return render(<StrictMode><LocaleProvider><SettingsPage /></LocaleProvider></StrictMode>)
}

afterEach(() => {
  cleanup()
  toastStore.reset()
  vi.restoreAllMocks()
  document.cookie = 'workmesh_locale=; Path=/; Max-Age=0'
})

beforeEach(() => {
  toastStore.reset()
  authMock.actor = { id: 'human-1', display_name: 'Ada', workspace_id: 'workspace-1', workspace_role: 'admin' }
  authMock.error = ''
  authMock.loading = false
  authMock.refresh.mockClear()
  teams = collection([{ id: 'team-1', name: 'Runtime', key: 'RUN', revision: 1 }])
  states = collection([{ id: 'state-1', name: 'Planned', category: 'planned', color: '#73736f', revision: 1 }])
  disabled = collection([])
  requestedPaths = []
  paginationMock.usePagedApiList.mockReset()
  paginationMock.usePagedApiList.mockImplementation(useMockPagedApiList)
  apiMock.apiRequest.mockReset()
  apiMock.apiMutation.mockReset()
  apiMock.apiMutation.mockResolvedValue(undefined)
  installMatchMedia(false)
  window.history.replaceState({ retained: 'task-5.1' }, '', '/settings?team=team-1&opsQuery=Archived&x=keep#operations-templates')
})

describe('SettingsPage routed shared Tabs', () => {
  it('synchronously retires actor-owned destructive state when authenticated authority changes', async () => {
    const view = renderPage()
    expect(await screen.findByText('Planned')).toBeVisible()
    fireEvent.click(await screen.findByRole('button', { name: '删除团队' }))
    expect(screen.getByRole('dialog', { name: '删除团队' })).toBeVisible()

    const oldTeams = teams
    authMock.actor = { id: 'human-2', display_name: 'Grace', workspace_id: 'workspace-2', workspace_role: 'admin' }
    teams = collection([], { initialized: false, loading: true })
    states = collection([], { initialized: false, loading: true })
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)

    expect(screen.queryByRole('dialog', { name: '删除团队' })).toBeNull()
    expect(screen.queryByText('Runtime')).toBeNull()
    expect(screen.queryByText('Planned')).toBeNull()
    expect(screen.getByRole('status', { name: '正在加载设置…' })).toBeVisible()
    expect(new URL(window.location.href).searchParams.get('team')).toBe('team-1')
    oldTeams.items = [{ id: 'team-a-late', name: 'A late Team', key: 'LATE', revision: 2 }]
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    expect(screen.queryByText('A late Team')).toBeNull()
    expect(screen.getAllByText('Grace').length).toBeGreaterThan(0)
  })

  it('ignores an A-authority Team create that resolves after switching to B', async () => {
    const pendingCreate = deferred<{ id: string; name: string; key: string; revision: number }>()
    apiMock.apiRequest.mockImplementation(() => pendingCreate.promise)
    const pushState = vi.spyOn(window.history, 'pushState')
    const view = renderPage()
    const aRefresh = teams.refresh
    const teamNames = await screen.findAllByRole('textbox', { name: '团队名称' })
    const teamKeys = screen.getAllByRole('textbox', { name: '团队标识' })
    fireEvent.change(teamNames[0]!, { target: { value: 'A private Team' } })
    fireEvent.change(teamKeys[0]!, { target: { value: 'APRIV' } })
    fireEvent.click(screen.getByRole('button', { name: '新建团队' }))
    await waitFor(() => expect(apiMock.apiRequest).toHaveBeenCalledTimes(1))
    const urlBeforeSwitch = window.location.href

    authMock.actor = { id: 'human-2', display_name: 'Grace', workspace_id: 'workspace-2', workspace_role: 'admin' }
    teams = collection([], { initialized: false, loading: true })
    states = collection([], { initialized: false, loading: true })
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    await act(async () => {
      pendingCreate.resolve({ id: 'team-a-created', name: 'A private Team', key: 'APRIV', revision: 1 })
      await pendingCreate.promise
    })

    expect(aRefresh).not.toHaveBeenCalled()
    expect(toastStore.getSnapshot()).toHaveLength(0)
    expect(pushState).not.toHaveBeenCalled()
    expect(window.location.href).toBe(urlBeforeSwitch)
    expect(screen.queryByText('A private Team')).toBeNull()
  })

  it('retains the exact Settings action and focus during authenticated actor refresh', async () => {
    const view = renderPage()
    const action = await screen.findByRole('button', { name: '新建团队' })
    action.focus()

    authMock.loading = true
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)

    expect(screen.getByRole('button', { name: '新建团队' })).toBe(action)
    expect(document.activeElement).toBe(action)
    expect(document.querySelector('.settings-page')).toHaveAttribute('aria-busy', 'true')
  })

  it('gives workflow States an independent initialized authority and retains exact rows and focus on ordinary refresh failure', async () => {
    states = collection([], { initialized: false, loading: true, nextCursor: 'states-more' })
    const view = renderPage()
    const workflow = await screen.findByRole('region', { name: '工作流状态' })
    expect(within(workflow).getByRole('status', { name: '正在加载设置…' })).toBeVisible()
    expect(workflow.querySelector('.settings-states-loading')).not.toBeNull()
    expect(workflow.querySelectorAll('.settings-states-loading .skeleton-list-cell')).toHaveLength(5)
    expect(within(workflow).queryByText('尚未配置工作流状态。')).toBeNull()
    expect(within(workflow).queryByRole('textbox', { name: '状态名称' })).toBeNull()
    expect(screen.queryByTestId('load-more-workflow-states')).toBeNull()

    states.initialized = true
    states.loading = false
    states.items = [{ id: 'state-1', name: 'Planned', category: 'planned', color: '#73736f', revision: 1 }]
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    const row = (await within(workflow).findByText('Planned')).closest('article')
    const action = within(workflow).getByRole('textbox', { name: '状态名称' })
    action.focus()

    states.loading = true
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    expect((within(workflow).getByText('Planned')).closest('article')).toBe(row)
    expect(within(workflow).getByRole('textbox', { name: '状态名称' })).toBe(action)
    expect(document.activeElement).toBe(action)
    expect(workflow).toHaveAttribute('aria-busy', 'true')

    states.loading = false
    states.error = new TypeError('private state refresh diagnostic')
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    expect((within(workflow).getByText('Planned')).closest('article')).toBe(row)
    expect(within(workflow).getByRole('textbox', { name: '状态名称' })).toBe(action)
    expect(document.activeElement).toBe(action)
    expect(workflow).not.toHaveAttribute('aria-busy')
    expect(screen.queryByText('private state refresh diagnostic')).toBeNull()

    states.error = new ApiError(403, 'private forbidden diagnostic')
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    expect(within(workflow).queryByText('Planned')).toBeNull()
    expect(within(workflow).queryByRole('textbox', { name: '状态名称' })).toBeNull()
    expect(screen.queryByTestId('load-more-workflow-states')).toBeNull()
    expect(screen.queryByText('private forbidden diagnostic')).toBeNull()
  })

  it('retains initialized empty Team authority through refresh and ordinary failure, then revokes it on 403', async () => {
    teams = collection([])
    window.history.replaceState({ retained: 'empty-retention' }, '', '/settings')
    const view = renderPage()
    const create = await screen.findByRole('button', { name: '新建团队' })
    expect(screen.getAllByRole('combobox', { name: '当前团队' })[0]).toHaveTextContent('无团队')

    teams.loading = true
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    expect(screen.getByRole('button', { name: '新建团队' })).toBe(create)
    expect(document.querySelector('.settings-page')).toHaveAttribute('aria-busy', 'true')

    teams.loading = false
    teams.error = new TypeError('private empty refresh failure')
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    expect(screen.getByRole('button', { name: '新建团队' })).toBe(create)
    expect(screen.getByRole('alert')).toHaveTextContent('无法加载设置。')
    expect(screen.queryByText('private empty refresh failure')).toBeNull()

    teams.error = new ApiError(403, 'private authority diagnostic')
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    expect(screen.queryByRole('button', { name: '新建团队' })).toBeNull()
    for (const selector of screen.getAllByRole('combobox', { name: '当前团队' }))
      expect(selector).toHaveTextContent('所选团队不可用')
  })

  it('retains a resolved Team and exact selector on ordinary refresh failure but revokes it on 403', async () => {
    teams.nextCursor = 'teams-more'
    const view = renderPage()
    const selector = (await screen.findAllByRole('combobox', { name: '当前团队' }))[0]!
    selector.focus()
    expect(screen.getByTestId('load-more-teams')).toBeVisible()

    teams.loading = true
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    expect(screen.getAllByRole('combobox', { name: '当前团队' })[0]).toBe(selector)
    expect(document.activeElement).toBe(selector)

    teams.loading = false
    teams.error = new TypeError('private Team refresh failure')
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    expect(screen.getAllByRole('combobox', { name: '当前团队' })[0]).toBe(selector)
    expect(screen.getByTestId('load-more-teams')).toBeVisible()
    expect(screen.queryByText('private Team refresh failure')).toBeNull()

    teams.error = new ApiError(403, 'private Team forbidden')
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    expect(screen.queryByTestId('load-more-teams')).toBeNull()
    for (const current of screen.getAllByRole('combobox', { name: '当前团队' }))
      expect(current).not.toHaveTextContent('Runtime')
  })
  it('treats the URL Team as latent on Operations and hides the Team selector', async () => {
    window.history.replaceState(
      { retained: 'task-5.2' },
      '',
      '/settings?tab=operations&team=team-second-page&x=keep#operations-runs',
    )

    renderPage()
    const operations = await screen.findByRole('tab', { name: /运营与规划|Planning & Operations/ })
    await waitFor(() => expect(operations).toHaveAttribute('aria-selected', 'true'))

    expect(screen.queryByRole('combobox', { name: /当前团队|Current team/ })).toBeNull()
    expect(requestedPaths.filter((path): path is string => path !== null)).toEqual([])
    expect(new URL(window.location.href).searchParams.get('team')).toBe('team-second-page')
    expect(window.history.state).toEqual({ retained: 'task-5.2' })
  })

  it('serially drains Team pages until the requested Team resolves, then requests its states', async () => {
    const loadMore = vi.fn(async () => undefined)
    teams = collection(
      [{ id: 'team-1', name: 'Runtime', key: 'RUN', revision: 1 }],
      { loadMore, nextCursor: 'teams-page-2' },
    )
    window.history.replaceState({ retained: 'second-page' }, '', '/settings?team=team-2&x=keep#team-settings-heading')

    const view = renderPage()
    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(1))
    expect(requestedPaths.some(path => path?.endsWith('/states'))).toBe(false)
    expect(new URL(window.location.href).searchParams.get('team')).toBe('team-2')

    teams.items = [
      ...teams.items,
      { id: 'team-2', name: 'Platform', key: 'PLAT', revision: 1 },
    ]
    teams.nextCursor = null
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)

    await waitFor(() => expect(requestedPaths).toContain('/api/v1/teams/team-2/states'))
    for (const selector of screen.getAllByRole('combobox', { name: /当前团队|Current team/ }))
      expect(selector).toHaveValue('team-2')
    expect(loadMore).toHaveBeenCalledTimes(1)
  })

  it('corrects an unknown Team only after successful pagination exhaustion with replaceState', async () => {
    const loadMore = vi.fn(async () => undefined)
    teams = collection(
      [{ id: 'team-1', name: 'Runtime', key: 'RUN', revision: 1 }],
      { loadMore, nextCursor: 'teams-page-2' },
    )
    window.history.replaceState(
      { retained: 'unknown-team' },
      '',
      '/settings?team=unknown&opsQuery=retry&x=keep#team-settings-heading',
    )
    const replaceState = vi.spyOn(window.history, 'replaceState')

    const view = renderPage()
    await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(1))
    expect(replaceState).not.toHaveBeenCalled()
    expect(new URL(window.location.href).searchParams.get('team')).toBe('unknown')

    teams.nextCursor = null
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('team')).toBe('team-1'))

    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(window.history.state).toEqual({ retained: 'unknown-team' })
    expect(new URL(window.location.href).searchParams.get('opsQuery')).toBe('retry')
    expect(new URL(window.location.href).searchParams.get('x')).toBe('keep')
    expect(new URL(window.location.href).hash).toBe('#team-settings-heading')
  })

  it('blocks safely on Team request errors without correction, states, or a retry loop', async () => {
    const loadMore = vi.fn(async () => undefined)
    teams = collection([], {
      error: new Error('private upstream diagnostic'),
      initialized: false,
      loadMore,
      nextCursor: null,
    })
    window.history.replaceState(
      { retained: 'blocked-team' },
      '',
      '/settings?team=unknown&x=keep#team-settings-heading',
    )
    const replaceState = vi.spyOn(window.history, 'replaceState')

    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('所选团队不可用或你已无权访问。请重试以恢复工作区设置。')
    expect(alert).not.toHaveTextContent('private upstream diagnostic')
    expect(screen.queryByText('新建团队后即可配置工作流。')).toBeNull()
    expect(screen.queryByRole('group', { name: '状态颜色' })).toBeNull()
    expect(loadMore).not.toHaveBeenCalled()
    expect(teams.refresh).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect(requestedPaths.some(path => path?.endsWith('/states'))).toBe(false)
    expect(new URL(window.location.href).searchParams.get('team')).toBe('unknown')
    expect(window.history.state).toEqual({ retained: 'blocked-team' })
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(teams.refresh).toHaveBeenCalledTimes(1))
  })

  it('waits for first-page success before choosing the first authorized Team', async () => {
    teams = collection([], { initialized: false, loading: true })
    window.history.replaceState(
      { retained: 'first-team' },
      '',
      '/settings?opsQuery=retry&x=keep#team-settings-heading',
    )
    const replaceState = vi.spyOn(window.history, 'replaceState')

    const view = renderPage()
    await screen.findByRole('tab', { name: /工作区|Workspace/ })
    expect(replaceState).not.toHaveBeenCalled()
    expect(requestedPaths.some(path => path?.endsWith('/states'))).toBe(false)

    teams.loading = false
    teams.initialized = true
    teams.items = [{ id: 'team-1', name: 'Runtime', key: 'RUN', revision: 1 }]
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('team')).toBe('team-1'))

    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(window.history.state).toEqual({ retained: 'first-team' })
    expect(new URL(window.location.href).searchParams.get('opsQuery')).toBe('retry')
    expect(new URL(window.location.href).searchParams.get('x')).toBe('keep')
    expect(new URL(window.location.href).hash).toBe('#team-settings-heading')
  })

  it('deletes an unavailable Team from the URL only after a successful empty response', async () => {
    teams = collection([], { initialized: false, loading: true })
    window.history.replaceState({ retained: 'empty-team' }, '', '/settings?team=removed&x=keep#team-settings-heading')
    const replaceState = vi.spyOn(window.history, 'replaceState')

    const view = renderPage()
    await screen.findByRole('tab', { name: /工作区|Workspace/ })
    expect(new URL(window.location.href).searchParams.get('team')).toBe('removed')
    expect(replaceState).not.toHaveBeenCalled()

    teams.loading = false
    teams.initialized = true
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    await waitFor(() => expect(new URL(window.location.href).searchParams.has('team')).toBe(false))

    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(window.history.state).toEqual({ retained: 'empty-team' })
    expect(new URL(window.location.href).searchParams.get('x')).toBe('keep')
    expect(new URL(window.location.href).hash).toBe('#team-settings-heading')
    expect(requestedPaths.some(path => path?.endsWith('/states'))).toBe(false)
    expect(screen.getAllByText('新建团队后即可配置工作流。')).toHaveLength(2)
    expect(screen.queryByRole('group', { name: '状态颜色' })).toBeNull()
  })

  it('retains the exact states scope and focused Team control while refreshing, then corrects a removed Team after success', async () => {
    window.history.replaceState({ retained: 'removed-team' }, '', '/settings?team=team-1&x=keep#team-settings-heading')
    const replaceState = vi.spyOn(window.history, 'replaceState')

    const view = renderPage()
    await waitFor(() => expect(requestedPaths).toContain('/api/v1/teams/team-1/states'))
    const teamSelector = screen.getAllByRole('combobox', { name: '当前团队' })[0]!
    teamSelector.focus()
    requestedPaths = []

    teams.loading = true
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    expect(requestedPaths).toContain('/api/v1/teams/team-1/states')
    expect(screen.getAllByRole('combobox', { name: '当前团队' })[0]).toBe(teamSelector)
    expect(document.activeElement).toBe(teamSelector)
    expect(document.querySelector('.settings-page')).toHaveAttribute('aria-busy', 'true')
    expect(new URL(window.location.href).searchParams.get('team')).toBe('team-1')
    expect(replaceState).not.toHaveBeenCalled()

    teams.loading = false
    teams.items = [{ id: 'team-2', name: 'Platform', key: 'PLAT', revision: 1 }]
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('team')).toBe('team-2'))
    await waitFor(() => expect(requestedPaths).toContain('/api/v1/teams/team-2/states'))

    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(window.history.state).toEqual({ retained: 'removed-team' })
    expect(new URL(window.location.href).searchParams.get('x')).toBe('keep')
    expect(new URL(window.location.href).hash).toBe('#team-settings-heading')
  })

  it('shows a loading resolution state instead of inviting Team creation while pending', async () => {
    teams = collection([], { initialized: false, loading: true })
    window.history.replaceState({ retained: 'pending-team' }, '', '/settings?team=team-2')

    renderPage()
    await screen.findByRole('tab', { name: /工作区|Workspace/ })

    expect(screen.queryByText('新建团队后即可配置工作流。')).toBeNull()
    const status = screen.getByRole('status', { name: '正在加载设置…' })
    expect(status).toBeVisible()
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(1)
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByRole('combobox', { name: '当前团队' }).every(selector => !selector.textContent?.includes('无团队'))).toBe(true)
    expect(screen.queryByRole('group', { name: '状态颜色' })).toBeNull()
    expect(requestedPaths.some(path => path?.endsWith('/states'))).toBe(false)
  })

  it('resets committed request evidence across StrictMode active-inactive-active before accepting an empty page', async () => {
    window.history.replaceState(
      { retained: 'strict-empty' },
      '',
      '/settings?team=team-1&x=keep#team-settings-heading',
    )
    const replaceState = vi.spyOn(window.history, 'replaceState')

    const view = renderStrictPage()
    await waitFor(() => expect(requestedPaths).toContain('/api/v1/teams/team-1/states'))
    fireEvent.click(screen.getByRole('tab', { name: /运营与规划|Planning & Operations/ }))
    await waitFor(() => expect(screen.getByRole('tab', { name: /运营与规划|Planning & Operations/ })).toHaveAttribute('aria-selected', 'true'))
    expect(screen.queryByRole('combobox', { name: /当前团队|Current team/ })).toBeNull()

    teams = collection([], { initialized: false, loading: true })
    fireEvent.click(screen.getByRole('tab', { name: /工作区|Workspace/ }))
    await waitFor(() => expect(screen.getByRole('tab', { name: /工作区|Workspace/ })).toHaveAttribute('aria-selected', 'true'))
    expect(new URL(window.location.href).searchParams.get('team')).toBe('team-1')
    expect(replaceState).not.toHaveBeenCalled()
    expect(screen.queryByText('新建团队后即可配置工作流。')).toBeNull()

    teams.loading = false
    teams.initialized = true
    view.rerender(<StrictMode><LocaleProvider><SettingsPage /></LocaleProvider></StrictMode>)
    await waitFor(() => expect(new URL(window.location.href).searchParams.has('team')).toBe(false))

    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(window.history.state).toEqual({ retained: 'strict-empty' })
    expect(new URL(window.location.href).searchParams.get('x')).toBe('keep')
    expect(new URL(window.location.href).hash).toBe('#team-settings-heading')
    expect(screen.getAllByText('新建团队后即可配置工作流。')).toHaveLength(2)
  })

  it('refreshes the authorized Team collection before routing to a newly created Team', async () => {
    const order: string[] = []
    const created = { id: 'team-2', name: 'Platform', key: 'PLAT', revision: 1 }
    teams.refresh = vi.fn(async () => {
      order.push('refresh')
      teams.items = [...teams.items, created]
    })
    apiMock.apiRequest.mockImplementation(async () => {
      order.push('create')
      return created
    })
    window.history.replaceState({ retained: 'create-team' }, '', '/settings?team=team-1&x=keep#team-settings-heading')
    const originalPushState = window.history.pushState.bind(window.history)
    vi.spyOn(window.history, 'pushState').mockImplementation((state, unused, url) => {
      order.push('push')
      originalPushState(state, unused, url)
    })

    renderPage()
    const teamNames = await screen.findAllByRole('textbox', { name: '团队名称' })
    const teamKeys = screen.getAllByRole('textbox', { name: '团队标识' })
    fireEvent.change(teamNames[0]!, { target: { value: 'Platform' } })
    fireEvent.change(teamKeys[0]!, { target: { value: 'PLAT' } })
    fireEvent.click(screen.getByRole('button', { name: '新建团队' }))
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('team')).toBe('team-2'))

    expect(order).toEqual(['create', 'refresh', 'push'])
    expect(toastStore.getSnapshot()).toEqual([
      expect.objectContaining({
        description: '团队「Platform」已可使用。',
        title: '团队已创建',
        tone: 'success',
      }),
    ])
    expect(window.history.state).toEqual({ retained: 'create-team' })
    expect(new URL(window.location.href).searchParams.get('x')).toBe('keep')
    expect(new URL(window.location.href).hash).toBe('#team-settings-heading')
  })

  it('keeps create validation and update revision failures contextual without duplicating a toast', async () => {
    apiMock.apiRequest
      .mockRejectedValueOnce(new ApiError(400, 'Team key is already in use.', 'VALIDATION_FAILED'))
      .mockRejectedValueOnce(new ApiError(409, 'Team changed on the server.', 'REVISION_CONFLICT'))
    window.history.replaceState({ retained: 'team-errors' }, '', '/settings?team=team-1')
    renderPage()
    const teamNames = await screen.findAllByRole('textbox', { name: '团队名称' })
    const teamKeys = screen.getAllByRole('textbox', { name: '团队标识' })
    fireEvent.change(teamNames[0]!, { target: { value: 'Runtime duplicate' } })
    fireEvent.change(teamKeys[0]!, { target: { value: 'DUP' } })
    fireEvent.click(screen.getByRole('button', { name: '新建团队' }))
    expect(await screen.findByText('Team key is already in use.')).toBeVisible()
    expect(toastStore.getSnapshot()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: '保存更改' }))
    expect(await screen.findByText('Team changed on the server.')).toBeVisible()
    expect(screen.queryByText('Team key is already in use.')).toBeNull()
    expect(toastStore.getSnapshot()).toHaveLength(0)
  })

  it('pushes a user Team change while preserving history state and unrelated URL state', async () => {
    teams = collection([
      { id: 'team-1', name: 'Runtime', key: 'RUN', revision: 1 },
      { id: 'team-2', name: 'Platform', key: 'PLAT', revision: 1 },
    ])
    window.history.replaceState(
      { retained: 'user-team' },
      '',
      '/settings?team=team-1&opsQuery=retry&x=keep#team-settings-heading',
    )
    const pushState = vi.spyOn(window.history, 'pushState')

    renderPage()
    const selectors = await screen.findAllByRole('combobox', { name: /当前团队|Current team/ })
    fireEvent.change(selectors[0]!, { target: { value: 'team-2' } })
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('team')).toBe('team-2'))

    expect(pushState).toHaveBeenCalledTimes(1)
    expect(window.history.state).toEqual({ retained: 'user-team' })
    expect(new URL(window.location.href).searchParams.get('opsQuery')).toBe('retry')
    expect(new URL(window.location.href).searchParams.get('x')).toBe('keep')
    expect(new URL(window.location.href).hash).toBe('#team-settings-heading')
  })

  it('hydrates from the URL and passively follows popstate without stealing connected focus', async () => {
    renderPage()
    const workspace = await screen.findByRole('tab', { name: /工作区|Workspace/ })
    expect(workspace).toHaveAttribute('aria-selected', 'true')

    const localeControl = screen.getByRole('button', { name: '中' })
    localeControl.focus()
    window.history.replaceState(
      window.history.state,
      '',
      '/settings?team=team-1&opsQuery=Archived&x=keep&tab=operations#operations-templates',
    )
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')) })

    const operations = await screen.findByRole('tab', { name: /运营与规划|Planning & Operations/ })
    await waitFor(() => expect(operations).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByTestId('operations-content')).toBeVisible()
    expect(document.activeElement).toBe(localeControl)
    expect(window.history.state).toEqual({ retained: 'task-5.1' })
  })

  it('uses shared desktop Arrow/Home/End focus behavior and pushes only different tabs', async () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    renderPage()
    const workspace = await screen.findByRole('tab', { name: /工作区|Workspace/ })
    const operations = screen.getByRole('tab', { name: /运营与规划|Planning & Operations/ })

    workspace.focus()
    fireEvent.keyDown(workspace, { key: 'ArrowRight' })
    await waitFor(() => expect(operations).toHaveAttribute('aria-selected', 'true'))
    expect(document.activeElement).toBe(operations)
    expect(pushState).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(operations, { key: 'End' })
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(operations)

    fireEvent.keyDown(operations, { key: 'Home' })
    await waitFor(() => expect(workspace).toHaveAttribute('aria-selected', 'true'))
    expect(document.activeElement).toBe(workspace)
    expect(pushState).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(workspace, { key: 'ArrowLeft' })
    await waitFor(() => expect(operations).toHaveAttribute('aria-selected', 'true'))
    expect(document.activeElement).toBe(operations)
    expect(pushState).toHaveBeenCalledTimes(3)
    fireEvent.click(operations)
    expect(pushState).toHaveBeenCalledTimes(3)

    const url = new URL(window.location.href)
    expect(url.searchParams.get('tab')).toBe('operations')
    expect(url.searchParams.get('team')).toBe('team-1')
    expect(url.searchParams.get('opsQuery')).toBe('Archived')
    expect(url.searchParams.get('x')).toBe('keep')
    expect(url.hash).toBe('#operations-templates')
    expect(window.history.state).toEqual({ retained: 'task-5.1' })
  })

  it('uses one named compact select, keeps its focus, and preserves state across media changes', async () => {
    const media = installMatchMedia(true)
    renderPage()
    const selector = await screen.findByRole('combobox', { name: /设置分区|Settings sections/ })
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)

    selector.focus()
    fireEvent.change(selector, { target: { value: 'operations' } })
    await waitFor(() => expect(selector).toHaveValue('operations'))
    expect(document.activeElement).toBe(selector)
    expect(new URL(window.location.href).searchParams.get('tab')).toBe('operations')
    expect(new URL(window.location.href).hash).toBe('#operations-templates')

    act(() => { media.trigger(false) })
    const operations = await screen.findByRole('tab', { name: /运营与规划|Planning & Operations/ })
    expect(operations).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('combobox', { name: /设置分区|Settings sections/ })).toBeNull()

    act(() => { media.trigger(true) })
    const restored = await screen.findByRole('combobox', { name: /设置分区|Settings sections/ })
    expect(restored).toHaveValue('operations')
    expect(new URL(window.location.href).searchParams.get('team')).toBe('team-1')
    expect(new URL(window.location.href).searchParams.get('opsQuery')).toBe('Archived')
  })

  it('posts only the selected stable preset color and reports success even when refresh has no new row', async () => {
    teams = collection([
      { id: 'team-1', name: 'Runtime', key: 'RUN', revision: 1 },
      { id: 'team-2', name: 'Platform', key: 'PLAT', revision: 1 },
    ])
    apiMock.apiRequest.mockResolvedValue({ id: 'state-new', revision: 1 })
    window.history.replaceState({ retained: 'workflow-color' }, '', '/settings?team=team-1')

    renderPage()
    const workflow = await screen.findByRole('region', { name: '工作流状态' })
    fireEvent.change(within(workflow).getByRole('textbox', { name: '状态名称' }), { target: { value: 'Blocked' } })
    fireEvent.change(within(workflow).getByRole('combobox', { name: '分类' }), { target: { value: 'started' } })
    fireEvent.click(within(workflow).getByRole('radio', { name: '蓝色' }))
    fireEvent.click(within(workflow).getByRole('button', { name: '新建状态' }))

    await waitFor(() => expect(apiMock.apiRequest).toHaveBeenCalledTimes(1))
    const [path, request] = apiMock.apiRequest.mock.calls[0]!
    expect(path).toBe('/api/v1/teams/team-1/states')
    expect(JSON.parse(String(request?.body))).toEqual({
      name: 'Blocked',
      category: 'started',
      color: '#2563eb',
    })
    await waitFor(() => expect(toastStore.getSnapshot()).toEqual([
      expect.objectContaining({
        description: '状态「Blocked」已可使用。',
        title: '工作流状态已创建',
        tone: 'success',
      }),
    ]))
    expect(states.refresh).toHaveBeenCalledTimes(1)
    expect(within(workflow).getByText('Planned')).toBeVisible()
    expect(within(workflow).queryByText('Blocked')).toBeNull()
    expect(within(workflow).getByRole('radio', { name: '中性' })).toBeChecked()
    expect(within(workflow).getByRole('textbox', { name: '状态名称' })).toHaveValue('')
    expect(within(workflow).getByRole('combobox', { name: '分类' })).toHaveValue('planned')

    fireEvent.change(screen.getAllByRole('combobox', { name: '当前团队' })[0]!, { target: { value: 'team-2' } })
    expect(within(workflow).queryByRole('status')).toBeNull()
    expect(toastStore.getSnapshot()).toHaveLength(1)
  })

  it('keeps existing server-provided workflow colors independent from creation presets', async () => {
    states = collection([{ id: 'state-legacy', name: 'Legacy', category: 'planned', color: '#123abc', revision: 1 }])
    window.history.replaceState({ retained: 'workflow-existing-color' }, '', '/settings?team=team-1')

    renderPage()
    const item = (await screen.findByText('Legacy')).closest('article')
    expect(item?.querySelector<HTMLElement>('.workflow-color')?.style.backgroundColor).toBe('rgb(18, 58, 188)')
  })

  it('renders and focuses the native custom color control only for Custom, preserving it after failure', async () => {
    apiMock.apiRequest.mockRejectedValue(new Error('Create state failed'))
    window.history.replaceState({ retained: 'workflow-custom' }, '', '/settings?team=team-1')

    renderPage()
    const workflow = await screen.findByRole('region', { name: '工作流状态' })
    expect(within(workflow).queryByLabelText('自定义颜色')).toBeNull()
    fireEvent.click(within(workflow).getByRole('radio', { name: '自定义' }))
    const custom = await within(workflow).findByLabelText('自定义颜色')
    await waitFor(() => expect(custom).toHaveFocus())
    expect(custom).toHaveAttribute('type', 'color')
    expect(custom).toHaveValue('#8b5cf6')
    expect(within(workflow).getByRole('status', { name: '颜色值' })).toHaveTextContent('#8b5cf6')

    fireEvent.change(custom, { target: { value: '#123456' } })
    fireEvent.change(within(workflow).getByRole('textbox', { name: '状态名称' }), { target: { value: 'Waiting' } })
    fireEvent.click(within(workflow).getByRole('button', { name: '新建状态' }))

    await waitFor(() => expect(apiMock.apiRequest).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(apiMock.apiRequest.mock.calls[0]![1]?.body))).toEqual({
      name: 'Waiting',
      category: 'planned',
      color: '#123456',
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Create state failed')
    expect(within(workflow).getByRole('radio', { name: '自定义' })).toBeChecked()
    expect(within(workflow).getByLabelText('自定义颜色')).toHaveValue('#123456')
    expect(states.refresh).not.toHaveBeenCalled()
  })

  it('resets Custom to its UI-only initial color after a successful create', async () => {
    apiMock.apiRequest.mockResolvedValue({ id: 'state-new', revision: 1 })
    window.history.replaceState({ retained: 'workflow-custom-reset' }, '', '/settings?team=team-1')

    renderPage()
    const workflow = await screen.findByRole('region', { name: '工作流状态' })
    fireEvent.click(within(workflow).getByRole('radio', { name: '自定义' }))
    fireEvent.change(await within(workflow).findByLabelText('自定义颜色'), { target: { value: '#abcdef' } })
    fireEvent.change(within(workflow).getByRole('textbox', { name: '状态名称' }), { target: { value: 'Review' } })
    fireEvent.click(within(workflow).getByRole('button', { name: '新建状态' }))

    await waitFor(() => expect(toastStore.getSnapshot()).toEqual([
      expect.objectContaining({
        description: '状态「Review」已可使用。',
        title: '工作流状态已创建',
        tone: 'success',
      }),
    ]))
    expect(within(workflow).getByRole('radio', { name: '中性' })).toBeChecked()
    expect(within(workflow).queryByLabelText('自定义颜色')).toBeNull()
    fireEvent.click(within(workflow).getByRole('radio', { name: '自定义' }))
    expect(await within(workflow).findByLabelText('自定义颜色')).toHaveValue('#8b5cf6')
  })

  it('keeps every idle dialog dismissal path mutation-free and restores trigger focus', async () => {
    window.history.replaceState({ retained: 'delete-cancel' }, '', '/settings?team=team-1')
    renderPage()
    const trigger = await screen.findByRole('button', { name: '删除团队' })

    for (const dismiss of ['cancel', 'escape', 'header', 'backdrop'] as const) {
      trigger.focus()
      fireEvent.click(trigger)
      const dialog = await screen.findByRole('dialog', { name: '删除团队' })
      if (dismiss === 'cancel') fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
      if (dismiss === 'escape') fireEvent.keyDown(dialog, { key: 'Escape' })
      if (dismiss === 'header') fireEvent.click(within(dialog).getByRole('button', { name: '关闭 删除团队' }))
      if (dismiss === 'backdrop') fireEvent.mouseDown(dialog.parentElement!)
      await waitFor(() => expect(screen.queryByRole('dialog', { name: '删除团队' })).toBeNull())
      expect(trigger).toHaveFocus()
    }

    expect(apiMock.apiMutation).not.toHaveBeenCalled()
    expect(teams.refresh).not.toHaveBeenCalled()
  })

  it('guards rapid confirmation and sends the exact encoded snapshot mutation without a body', async () => {
    let resolveMutation: (() => void) | undefined
    apiMock.apiMutation.mockImplementation(() => new Promise<void>(resolve => { resolveMutation = resolve }))
    teams = collection([{ id: 'team/one', name: 'Runtime', key: 'RUN', revision: 7 }])
    window.history.replaceState({ retained: 'delete-once' }, '', '/settings?team=team%2Fone&x=keep#team-settings-heading')
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '删除团队' }))
    const confirm = await screen.findByRole('button', { name: /确认删除团队 Runtime/ })

    act(() => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(apiMock.apiMutation).toHaveBeenCalledTimes(1)
    const [operation, path, init] = apiMock.apiMutation.mock.calls[0]!
    expect(operation).toBe('delete-team:team/one:revision-7')
    expect(path).toBe('/api/v1/teams/team%2Fone')
    expect(init).toEqual({ method: 'DELETE', headers: { 'If-Match': '"revision-7"' } })
    expect(Object.hasOwn(init as object, 'body')).toBe(false)
    expect(screen.getByRole('status')).toHaveTextContent('正在删除…')
    expect(screen.getByRole('dialog')).toHaveFocus()

    await act(async () => { resolveMutation?.() })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(teams.refresh).toHaveBeenCalledTimes(1))
    expect(toastStore.getSnapshot()).toEqual([
      expect.objectContaining({
        description: '团队「Runtime」已从活动导航中移除。',
        title: '团队已删除',
        tone: 'success',
      }),
    ])
  })

  it('maps destructive conflicts locally, keeps the snapshot, and performs no refresh on failure', async () => {
    apiMock.apiMutation
      .mockRejectedValueOnce(new ApiError(409, 'private revision diagnostic', 'REVISION_CONFLICT'))
      .mockRejectedValueOnce(new ApiError(409, 'private active-Team diagnostic', 'LAST_ACTIVE_TEAM_CONFLICT'))
      .mockRejectedValueOnce(new TypeError('private network diagnostic'))
    window.history.replaceState({ retained: 'delete-errors' }, '', '/settings?team=team-1')
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '删除团队' }))
    const confirm = await screen.findByRole('button', { name: /确认删除团队 Runtime/ })

    fireEvent.click(confirm)
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('团队已被其他操作更新。请关闭对话框、刷新后重试。')
    expect(screen.getByRole('dialog')).not.toHaveTextContent('private revision diagnostic')
    expect(screen.getByRole('dialog')).toHaveTextContent('Runtime')
    expect(screen.getByRole('button', { name: '关闭 删除团队' })).toBeEnabled()

    fireEvent.click(confirm)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('无法删除最后一个活动团队。请先创建另一个活动团队。'))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    fireEvent.click(confirm)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('无法删除团队。请检查连接后重试。'))
    expect(screen.getByRole('dialog')).not.toHaveTextContent('private network diagnostic')
    expect(teams.refresh).not.toHaveBeenCalled()
    expect(toastStore.getSnapshot()).toHaveLength(0)
  })

  it('commits the close before one independent refresh and never relabels a refresh failure', async () => {
    teams.refresh = vi.fn(async () => {
      expect(screen.queryByRole('dialog')).toBeNull()
      throw new Error('private refresh diagnostic')
    })
    window.history.replaceState({ retained: 'delete-refresh' }, '', '/settings?team=team-1&x=keep#team-settings-heading')
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '删除团队' }))
    fireEvent.click(await screen.findByRole('button', { name: /确认删除团队 Runtime/ }))

    await waitFor(() => expect(teams.refresh).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('private refresh diagnostic')).toBeNull()
    expect(screen.queryByText('无法删除团队。请检查连接后重试。')).toBeNull()
    expect(toastStore.getSnapshot()).toEqual([
      expect.objectContaining({ title: '团队已删除', tone: 'success' }),
    ])
    await waitFor(() => expect(document.getElementById('team-settings-heading')).toHaveFocus())
    expect(window.history.state).toEqual({ retained: 'delete-refresh' })
    expect(new URL(window.location.href).searchParams.get('x')).toBe('keep')
    expect(new URL(window.location.href).hash).toBe('#team-settings-heading')
  })

  it('waits for post-delete Team resolution before moving focus once', async () => {
    let resolveRefresh: (() => void) | undefined
    teams = collection([
      { id: 'team-1', name: 'Runtime', key: 'RUN', revision: 2 },
      { id: 'team-2', name: 'Platform', key: 'PLAT', revision: 3 },
    ], {
      refresh: vi.fn(() => {
        teams.loading = true
        return new Promise<void>(resolve => { resolveRefresh = resolve })
      }),
    })
    window.history.replaceState({ retained: 'delete-focus-pending' }, '', '/settings?team=team-1')
    const view = renderPage()
    const trigger = await screen.findByRole('button', { name: '删除团队' })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('button', { name: /确认删除团队 Runtime/ }))
    await waitFor(() => expect(teams.refresh).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.getElementById('team-settings-heading')).not.toHaveFocus()

    await act(async () => { resolveRefresh?.() })
    expect(teams.loading).toBe(true)
    expect(document.getElementById('team-settings-heading')).not.toHaveFocus()

    teams.items = [{ id: 'team-2', name: 'Platform', key: 'PLAT', revision: 3 }]
    teams.loading = false
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('team')).toBe('team-2'))
    await waitFor(() => expect(document.getElementById('team-settings-heading')).toHaveFocus())
    expect(teams.refresh).toHaveBeenCalledTimes(1)
  })

  it('retains one post-delete focus intent across refresh failure until Team retry reconciliation completes', async () => {
    const surviving = { id: 'team-2', name: 'Platform', key: 'PLAT', revision: 3 }
    let refreshAttempt = 0
    teams = collection([
      { id: 'team-1', name: 'Runtime', key: 'RUN', revision: 2 },
      surviving,
    ], {
      refresh: vi.fn(async () => {
        refreshAttempt += 1
        if (refreshAttempt === 1) {
          teams.error = new Error('initial refresh failed')
          return
        }
        teams.error = null
        teams.items = [surviving]
      }),
    })
    window.history.replaceState({ retained: 'delete-focus-retry' }, '', '/settings?team=team-1')
    const view = renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '删除团队' }))
    fireEvent.click(await screen.findByRole('button', { name: /确认删除团队 Runtime/ }))
    await waitFor(() => expect(teams.refresh).toHaveBeenCalledTimes(1))
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)

    const retry = await screen.findByRole('button', { name: '重试' })
    retry.focus()
    fireEvent.click(retry)
    await waitFor(() => expect(teams.refresh).toHaveBeenCalledTimes(2))
    view.rerender(<LocaleProvider><SettingsPage /></LocaleProvider>)

    await waitFor(() => expect(new URL(window.location.href).searchParams.get('team')).toBe('team-2'))
    await waitFor(() => expect(document.getElementById('team-settings-heading')).toHaveFocus())
    expect(window.history.state).toEqual({ retained: 'delete-focus-retry' })
  })

  it('preserves a newer Team route and never resumes deleted-Team states after an in-flight delete', async () => {
    let resolveMutation: (() => void) | undefined
    apiMock.apiMutation.mockImplementation(() => new Promise<void>(resolve => { resolveMutation = resolve }))
    const surviving = { id: 'team-2', name: 'Platform', key: 'PLAT', revision: 3 }
    teams = collection([
      { id: 'team-1', name: 'Runtime', key: 'RUN', revision: 2 },
      surviving,
    ], {
      refresh: vi.fn(async () => { teams.items = [surviving] }),
    })
    window.history.replaceState({ retained: 'delete-route' }, '', '/settings?team=team-1&x=keep#team-settings-heading')
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '删除团队' }))
    fireEvent.click(await screen.findByRole('button', { name: /确认删除团队 Runtime/ }))
    const selectors = screen.getAllByRole('combobox', { name: '当前团队' })
    fireEvent.change(selectors[0]!, { target: { value: 'team-2' } })
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('team')).toBe('team-2'))
    requestedPaths = []

    await act(async () => { resolveMutation?.() })
    await waitFor(() => expect(teams.refresh).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(requestedPaths).toContain('/api/v1/teams/team-2/states'))
    expect(requestedPaths).not.toContain('/api/v1/teams/team-1/states')
    expect(new URL(window.location.href).searchParams.get('team')).toBe('team-2')
    await waitFor(() => expect(document.getElementById('team-settings-heading')).toHaveFocus())
    expect(window.history.state).toEqual({ retained: 'delete-route' })
    expect(new URL(window.location.href).searchParams.get('x')).toBe('keep')
  })
})
