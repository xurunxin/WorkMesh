// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './lib/api'
import { LocaleProvider } from './lib/i18n'
import type { PagedCollection } from './lib/pagination'
import { ToastViewport } from './lib/toast-viewport'
import { toastStore } from './lib/use-toast'
import HomePage from './page'

const apiMock = vi.hoisted(() => ({
  apiMutation: vi.fn(),
  apiRequest: vi.fn(),
  publicRequest: vi.fn(),
}))
const paginationMock = vi.hoisted(() => ({ usePagedApiList: vi.fn() }))
const authMock = vi.hoisted(() => ({
  actor: { id: 'human-1', display_name: 'Ada', workspace_id: 'workspace-1', workspace_role: 'admin' },
  error: '',
  loading: false,
  refresh: vi.fn(async () => undefined),
}))
const currentTeamMock = vi.hoisted(() => ({
  error: null as Error | null,
  initialized: true,
  loading: false,
  setTeamId: vi.fn(),
  teamId: 'team-1' as string | null,
  teams: [{ id: 'team-1', key: 'RUN', name: 'Runtime', revision: 1 }],
}))
const boardWidthsMock = vi.hoisted(() => ({ setWidth: vi.fn(), widths: {} }))
const workSurfacesMock = vi.hoisted(() => ({ refresh: vi.fn(async () => undefined) }))

vi.mock('./lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('./lib/api')>()
  return { ...actual, ...apiMock }
})
vi.mock('./lib/pagination', async importOriginal => {
  const actual = await importOriginal<typeof import('./lib/pagination')>()
  return { ...actual, usePagedApiList: paginationMock.usePagedApiList }
})
vi.mock('./lib/use-authenticated-actor', () => ({
  useAuthenticatedActor: () => ({
    actor: authMock.actor,
    error: authMock.error,
    loading: authMock.loading,
    refresh: authMock.refresh,
  }),
}))
vi.mock('./lib/use-current-team', () => ({
  useCurrentTeam: () => currentTeamMock,
}))
vi.mock('./lib/use-board-column-widths', () => ({
  useBoardColumnWidths: () => boardWidthsMock,
}))
vi.mock('./lib/realtime', () => ({ useRealtimeSubscription: () => undefined }))
vi.mock('../features/work-items/work-surfaces', () => ({
  WorkSurfaces: (props: {
    authorityKey: string | null
    onOpenItem?: (id: string) => void | Promise<void>
    onRefreshReady?: (refresh: (() => Promise<void>) | null) => void
    projects?: Array<{ name: string }>
  }) => {
    props.onRefreshReady?.(workSurfacesMock.refresh)
    return <div data-authority={props.authorityKey ?? ''} data-testid="work-surfaces">
      Authorized work remains visible
      {props.projects?.map(project => <span key={project.name}>{project.name}</span>)}
      <button onClick={() => void props.onOpenItem?.('work-item-a')} type="button">Open authorized item</button>
    </div>
  },
}))
vi.mock('./agent-work-panel', () => ({ AgentWorkPanel: () => null }))
vi.mock('./work-room', () => ({ InboxPanel: () => null, WorkRoom: () => null }))
vi.mock('./project-workspace', () => ({ ProjectWorkspace: () => null }))
vi.mock('./realtime-status', () => ({ RealtimeStatus: () => null }))

type TestItem = { id: string } & Record<string, unknown>
type TestCollection = PagedCollection<TestItem>

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function collection(items: TestItem[]): TestCollection {
  return {
    error: null,
    initialized: true,
    items,
    loadMore: vi.fn(async () => undefined),
    loading: false,
    loadingMore: false,
    nextCursor: null,
    refresh: vi.fn(async () => undefined),
  }
}

let teams: TestCollection
let states: TestCollection
let humans: TestCollection
let projects: TestCollection
let empty: TestCollection

function renderPage(): void {
  render(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)
}

beforeEach(() => {
  toastStore.reset()
  workSurfacesMock.refresh.mockClear()
  authMock.actor = { id: 'human-1', display_name: 'Ada', workspace_id: 'workspace-1', workspace_role: 'admin' }
  authMock.error = ''
  authMock.loading = false
  currentTeamMock.error = null
  currentTeamMock.initialized = true
  currentTeamMock.loading = false
  currentTeamMock.teamId = 'team-1'
  currentTeamMock.teams = [{ id: 'team-1', key: 'RUN', name: 'Runtime', revision: 1 }]
  teams = collection([{ id: 'team-1', key: 'RUN', name: 'Runtime', revision: 1 }])
  states = collection([{ id: 'state-1', category: 'backlog', color: '#73736f', name: 'Backlog', revision: 1 }])
  humans = collection([])
  projects = collection([])
  empty = collection([])
  paginationMock.usePagedApiList.mockReset()
  paginationMock.usePagedApiList.mockImplementation((path: string | null) => {
    if (path === '/api/v1/teams') return teams
    if (path?.endsWith('/states')) return states
    if (path?.startsWith('/api/v1/actors/humans')) return humans
    if (path === '/api/v1/projects') return projects
    return empty
  })
  apiMock.publicRequest.mockReset()
  apiMock.publicRequest.mockImplementation(async (path: string) => {
    if (path === '/api/v1/install-status') return { installed: true }
    return { buildSha: 'test', schemaBaseline: 1, serverVersion: 'test' }
  })
  apiMock.apiRequest.mockReset()
  apiMock.apiRequest.mockImplementation(async (path: string) => {
    if (path === '/api/v1/features') return { features: [] }
    return { id: 'work-item-1' }
  })
  apiMock.apiMutation.mockReset()
  window.history.replaceState({}, '', '/?view=my-work')
})

afterEach(() => {
  cleanup()
  toastStore.reset()
  document.cookie = 'workmesh_locale=; Path=/; Max-Age=0'
  window.localStorage.removeItem('workmesh_locale')
})

describe('Home mutation outcomes', () => {
  it('synchronously retires actor-owned dialog state when authenticated authority changes', async () => {
    const view = render(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)
    fireEvent.click(await screen.findByRole('button', { name: '新建 Issue' }))
    expect(screen.getByRole('dialog', { name: '创建 Issue' })).toBeVisible()

    authMock.actor = { id: 'human-2', display_name: 'Grace', workspace_id: 'workspace-2', workspace_role: 'member' }
    view.rerender(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)

    expect(screen.queryByRole('dialog', { name: '创建 Issue' })).toBeNull()
    expect(screen.getAllByText('Grace').length).toBeGreaterThan(0)
  })

  it('keeps the exact open detail and focus when auth refresh returns a new actor object for the same authority', async () => {
    apiMock.apiRequest.mockImplementation(async (path: string) => {
      if (path === '/api/v1/features') return { features: [] }
      if (path === '/api/v1/work-items/work-item-a') return {
        id: 'work-item-a',
        title: 'Authority-stable detail',
        description: null,
        number: 8,
        revision: 2,
        status_id: 'state-1',
        status_name: 'Backlog',
        status_category: 'backlog',
        team_id: 'team-1',
        team_key: 'RUN',
        priority: 'high',
        due_date: null,
        responsible_human_actor_id: 'human-1',
        responsible_human: { actor_id: 'human-1', display_name: 'Ada' },
        active_executor: null,
        shared_reviewers: [],
        labels: [],
        project_id: null,
        milestone_id: null,
        parent_id: null,
      }
      return { id: 'work-item-1' }
    })
    const view = render(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Open authorized item' }))
    const detail = await screen.findByRole('dialog', { name: 'RUN-8' })
    const close = within(detail).getByRole('button', { name: '关闭 RUN-8' })
    close.focus()

    authMock.actor = { ...authMock.actor, display_name: 'Ada refreshed' }
    view.rerender(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)

    expect(screen.getByRole('dialog', { name: 'RUN-8' })).toBe(detail)
    expect(within(detail).getByRole('button', { name: '关闭 RUN-8' })).toBe(close)
    expect(document.activeElement).toBe(close)
  })

  it('ignores a completed A-authority create after switching to B without toast, refresh, URL, or focus side effects', async () => {
    const pendingCreate = deferred<unknown>()
    apiMock.apiRequest.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/v1/features') return Promise.resolve({ features: [] })
      if (path === '/api/v1/work-items' && init?.method === 'POST') return pendingCreate.promise
      return Promise.resolve({ id: 'work-item-1' })
    })
    const view = render(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)
    fireEvent.click(await screen.findByRole('button', { name: '新建 Issue' }))
    const dialog = screen.getByRole('dialog', { name: '创建 Issue' })
    const title = within(dialog).getByRole('textbox', { name: '标题' })
    fireEvent.change(title, { target: { value: 'A private issue' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '创建 Issue' }))
    await waitFor(() => expect(apiMock.apiRequest).toHaveBeenCalledWith('/api/v1/work-items', expect.objectContaining({ method: 'POST' })))
    const urlBeforeSwitch = window.location.href

    authMock.actor = { id: 'human-2', display_name: 'Grace', workspace_id: 'workspace-2', workspace_role: 'member' }
    currentTeamMock.teamId = 'team-2'
    currentTeamMock.teams = [{ id: 'team-2', key: 'NEXT', name: 'Next', revision: 1 }]
    teams.items = [{ id: 'team-2', key: 'NEXT', name: 'Next', revision: 1 }]
    view.rerender(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)
    expect(screen.getByTestId('work-surfaces')).toHaveAttribute('data-authority', 'workspace-2:human-2:member')

    await act(async () => {
      pendingCreate.resolve({ id: 'work-item-a' })
      await pendingCreate.promise
    })

    expect(title.isConnected).toBe(false)
    expect(toastStore.getSnapshot()).toHaveLength(0)
    expect(workSurfacesMock.refresh).not.toHaveBeenCalled()
    expect(window.location.href).toBe(urlBeforeSwitch)
    expect(document.activeElement).not.toBe(title)
  })

  it('keeps AppShell mounted and shows a Team skeleton while either Team authority is unresolved', async () => {
    currentTeamMock.initialized = false
    currentTeamMock.loading = true
    currentTeamMock.teamId = null
    currentTeamMock.teams = []
    teams.initialized = false
    teams.loading = true
    teams.items = []

    renderPage()

    expect(await screen.findByRole('button', { name: '新建 Issue' })).toBeVisible()
    expect(screen.getByRole('status', { name: '正在加载 团队' })).toBeVisible()
    const teamSwitchers = screen.getAllByRole('combobox', { name: '当前团队' })
    expect(teamSwitchers).toHaveLength(2)
    for (const teamSwitcher of teamSwitchers) {
      expect(teamSwitcher).toHaveTextContent('正在加载 团队')
      expect(within(teamSwitcher).queryByText('无团队')).toBeNull()
    }
    expect(document.querySelector('.content > .empty')).toBeNull()
  })

  it('shows the no-Team outcome only after both Team authorities resolve empty', async () => {
    currentTeamMock.initialized = true
    currentTeamMock.teamId = null
    currentTeamMock.teams = []
    teams.initialized = true
    teams.items = []

    renderPage()

    expect(await screen.findByRole('button', { name: '新建 Issue' })).toBeVisible()
    expect(document.querySelector('.content > .empty')).toHaveTextContent('无团队 · 设置')
    expect(screen.queryByRole('status', { name: '正在加载 团队' })).toBeNull()
  })

  it('keeps the Team authority pending when an unrelated Projects collection fails', async () => {
    currentTeamMock.initialized = false
    currentTeamMock.loading = true
    currentTeamMock.teamId = null
    currentTeamMock.teams = []
    teams.initialized = false
    teams.loading = true
    teams.items = []
    projects.error = new Error('projects failed')

    renderPage()

    const status = await screen.findByRole('status', { name: '正在加载 团队' })
    expect(status).toBeVisible()
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(1)
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('alert')).toBeVisible()
    expect(document.querySelector('.content > .empty')).toBeNull()
  })

  it('retains the exact AppShell action and focus during an authenticated actor refresh', async () => {
    const { rerender } = render(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)
    const action = await screen.findByRole('button', { name: '新建 Issue' })
    action.focus()

    authMock.loading = true
    rerender(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)

    expect(screen.getByRole('button', { name: '新建 Issue' })).toBe(action)
    expect(document.activeElement).toBe(action)
    expect(document.querySelector('.content')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByTestId('loading')).toBeNull()
  })

  it('retains resolved Team content for a network refresh failure but revokes it for 403', async () => {
    currentTeamMock.error = new TypeError('network refresh failed')
    teams.error = new TypeError('network refresh failed')
    teams.nextCursor = 'teams-more'
    const { rerender } = render(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)
    expect(await screen.findByTestId('work-surfaces')).toBeVisible()
    expect(screen.getAllByTestId('load-more-团队')).toHaveLength(2)

    currentTeamMock.error = new ApiError(403, 'forbidden')
    teams.error = new ApiError(403, 'forbidden')
    rerender(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)

    expect(screen.queryByTestId('work-surfaces')).toBeNull()
    expect(screen.queryByTestId('load-more-团队')).toBeNull()
    expect(document.querySelector('.content > .empty')).toBeNull()
    for (const switcher of screen.getAllByRole('combobox', { name: '当前团队' }))
      expect(switcher).not.toHaveTextContent('Runtime')
  })

  it('keeps the exact Team selector and focused action while same-scope Team refresh is busy', async () => {
    const { rerender } = render(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)
    const selector = screen.getAllByRole('combobox', { name: '当前团队' })[0]
    const action = await screen.findByRole('button', { name: '新建 Issue' })
    action.focus()

    currentTeamMock.loading = true
    teams.loading = true
    rerender(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)

    expect(screen.getAllByRole('combobox', { name: '当前团队' })[0]).toBe(selector)
    expect(screen.getByRole('button', { name: '新建 Issue' })).toBe(action)
    expect(document.activeElement).toBe(action)
    expect(document.querySelector('.content')).toHaveAttribute('aria-busy', 'true')

    currentTeamMock.loading = false
    teams.loading = false
    rerender(<LocaleProvider><HomePage /><ToastViewport /></LocaleProvider>)
    expect(document.querySelector('.content')).not.toHaveAttribute('aria-busy')
  })

  it('emits exactly one localized success toast while the authorized page remains rendered', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '新建 Issue' }))
    const dialog = screen.getByRole('dialog', { name: '创建 Issue' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '标题' }), { target: { value: '宽屏验收' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '创建 Issue' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '创建 Issue' })).toBeNull())
    expect(screen.getByTestId('work-surfaces')).toBeVisible()
    expect(toastStore.getSnapshot()).toEqual([
      expect.objectContaining({
        description: '已创建「宽屏验收」。',
        title: 'Issue 已创建',
        tone: 'success',
      }),
    ])
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '关闭通知：Issue 已创建（1/1）' })).toBeVisible()
  })

  it('keeps a structured conflict in the top modal, preserves the form, emits no toast, and clears it on reopen', async () => {
    apiMock.apiRequest.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/v1/features') return { features: [] }
      if (init?.method === 'POST') throw new ApiError(409, 'This title conflicts with a current issue.', 'REVISION_CONFLICT')
      return { id: 'work-item-1' }
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '新建 Issue' }))
    let dialog = screen.getByRole('dialog', { name: '创建 Issue' })
    const title = within(dialog).getByRole('textbox', { name: '标题' })
    fireEvent.change(title, { target: { value: 'Keep this draft' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '创建 Issue' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This title conflicts with a current issue.')
    expect(title).toHaveValue('Keep this draft')
    expect(toastStore.getSnapshot()).toHaveLength(0)
    expect(screen.queryByRole('region', { name: '通知' })).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    fireEvent.click(screen.getByRole('button', { name: '新建 Issue' }))
    dialog = screen.getByRole('dialog', { name: '创建 Issue' })
    expect(within(dialog).queryByRole('alert')).toBeNull()
  })

  it('keeps collection failures durable and never duplicates them into the toast queue', async () => {
    projects.error = new Error('Projects could not refresh')
    renderPage()

    expect(await screen.findByText('Projects could not refresh')).toBeVisible()
    expect(toastStore.getSnapshot()).toHaveLength(0)
    expect(screen.queryByRole('region', { name: '通知' })).toBeNull()
  })
})
