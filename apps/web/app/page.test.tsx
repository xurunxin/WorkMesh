// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from './lib/i18n'
import type { PagedCollection } from './lib/pagination'
import HomePage from './page'

const apiMock = vi.hoisted(() => ({ apiRequest: vi.fn(), publicRequest: vi.fn() }))
const paginationMock = vi.hoisted(() => ({ usePagedApiList: vi.fn() }))
const workSurfacesMock = vi.hoisted(() => ({ renders: 0 }))

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
    actor: { id: 'human-1', display_name: 'Ada', workspace_id: 'workspace-1', workspace_role: 'admin' },
    error: '',
    loading: false,
    refresh: vi.fn(async () => undefined),
  }),
}))
vi.mock('./lib/use-current-team', () => ({
  useCurrentTeam: () => ({
    error: null,
    initialized: true,
    loading: false,
    setTeamId: vi.fn(),
    teamId: 'team-1',
    teams: [{ id: 'team-1', key: 'RUN', name: 'Runtime', revision: 1 }],
  }),
}))
vi.mock('./lib/use-board-column-widths', () => ({ useBoardColumnWidths: () => ({ setWidth: vi.fn(), widths: {} }) }))
vi.mock('./lib/realtime', () => ({ useRealtimeSubscription: () => undefined }))
vi.mock('../features/work-items/work-surfaces', () => ({
  WorkSurfaces: (props: {
    initialLayout?: 'board' | 'list'
    onApplySavedView?: (view: { filters: { search: string }; layout: 'board'; name: string }) => void
    onLayoutChange?: (layout: 'board' | 'list') => void
    onQueryChange?: (query: { search: string }) => void
  }) => {
    workSurfacesMock.renders += 1
    return <section data-initial-layout={props.initialLayout} data-testid="work-surfaces-mock">
      <button onClick={() => props.onLayoutChange?.('board')} type="button">Mock board layout</button>
      <button onClick={() => props.onQueryChange?.({ search: 'latest-layout' })} type="button">Mock query change</button>
      <button onClick={() => props.onApplySavedView?.({ filters: { search: 'saved-layout' }, layout: 'board', name: 'Saved board' })} type="button">Mock saved board</button>
    </section>
  },
}))
vi.mock('./agent-work-panel', () => ({
  AgentWorkPanel: () => null,
  useAgentDelegationController: () => ({
    scopeKey: 'test-authority', agentsPage: { items: [], nextCursor: null, initialized: true, loading: false, loadingMore: false, error: null, refresh: vi.fn(async () => undefined), loadMore: vi.fn(async () => undefined) },
    eligibleAgents: [], directAgent: undefined, canDirect: false, canChoose: false, disabled: true, reason: 'no_eligible_agent',
    chooserRequest: 0, requestChooser: vi.fn(), consumeChooserRequest: vi.fn(), create: vi.fn(), error: null, busy: false, latest: null,
    clearLatest: vi.fn(), clearError: vi.fn(),
  }),
}))
vi.mock('./work-room', () => ({ InboxPanel: () => null, WorkRoom: () => null }))
vi.mock('./project-workspace', () => ({
  ProjectWorkspace: ({ project }: { project: { name: string } }) => <div data-testid="project-workspace">{project.name}</div>,
}))
vi.mock('./realtime-status', () => ({ RealtimeStatus: () => null }))

type TestRow = { id: string } & Record<string, unknown>

function collection(items: TestRow[]): PagedCollection<TestRow> {
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

const projects = [
  { id: 'project-1', team_id: 'team-1', name: 'Runtime reliability', summary: null, description: null, status: 'in_progress', lead_actor_id: null, target_date: null, revision: 1 },
  { id: 'project-2', team_id: 'team-1', name: 'Responsive operations', summary: null, description: null, status: 'in_progress', lead_actor_id: null, target_date: null, revision: 1 },
]
const fullPageWorkItem = {
  id: 'work-full-page',
  title: 'Full-page semantic Issue',
  description: 'Deterministic full-page detail.',
  number: 73,
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
  labels: ['frontend'],
  project_id: 'project-1',
  milestone_id: null,
  parent_id: null,
}

beforeEach(() => {
  document.cookie = 'workmesh_locale=en; Path=/'
  window.history.replaceState({}, '', '/?view=projects')
  const teams = collection([{ id: 'team-1', key: 'RUN', name: 'Runtime', revision: 1 }])
  const states = collection([{ id: 'state-1', category: 'backlog', color: '#73736f', name: 'Backlog', revision: 1 }])
  const humans = collection([])
  const projectRows = collection(projects)
  const empty = collection([])
  paginationMock.usePagedApiList.mockReset()
  workSurfacesMock.renders = 0
  paginationMock.usePagedApiList.mockImplementation((path: string | null) => {
    if (path === '/api/v1/teams') return teams
    if (path?.endsWith('/states')) return states
    if (path?.startsWith('/api/v1/actors/humans')) return humans
    if (path === '/api/v1/projects') return projectRows
    return empty
  })
  apiMock.publicRequest.mockReset()
  apiMock.publicRequest.mockImplementation(async (path: string) => path === '/api/v1/install-status'
    ? { installed: true }
    : { buildSha: 'test', schemaBaseline: 1, serverVersion: 'test' })
  apiMock.apiRequest.mockReset()
  apiMock.apiRequest.mockImplementation(async (path: string) => {
    if (path === '/api/v1/features') return { features: [] }
    return projects.find(candidate => path === `/api/v1/projects/${candidate.id}`) ?? { id: 'fixture' }
  })
})

afterEach(() => {
  cleanup()
  document.cookie = 'workmesh_locale=; Path=/; Max-Age=0'
})

describe('Home project strip keyboard contract', () => {
  it('updates the Work Surface layout URL without a duplicate HomePage render and reuses the latest layout on the next query render', async () => {
    window.history.replaceState({}, '', '/?view=my-work&layout=list')
    render(<LocaleProvider><HomePage /></LocaleProvider>)

    const surface = await screen.findByTestId('work-surfaces-mock')
    await screen.findAllByTestId('release-info')
    expect(surface).toHaveAttribute('data-initial-layout', 'list')
    const renderCountBeforeLayout = workSurfacesMock.renders

    fireEvent.click(screen.getByRole('button', { name: 'Mock board layout' }))
    expect(new URLSearchParams(window.location.search).get('layout')).toBe('board')
    expect(workSurfacesMock.renders).toBe(renderCountBeforeLayout)

    fireEvent.click(screen.getByRole('button', { name: 'Mock query change' }))
    await waitFor(() => expect(screen.getByTestId('work-surfaces-mock')).toHaveAttribute('data-initial-layout', 'board'))
    expect(new URLSearchParams(window.location.search).get('search')).toBe('latest-layout')
    expect(new URLSearchParams(window.location.search).get('layout')).toBe('board')
  })

  it('restores the latest presentation layout from popstate and saved views', async () => {
    window.history.replaceState({}, '', '/?view=my-work&layout=board')
    render(<LocaleProvider><HomePage /></LocaleProvider>)
    await waitFor(() => expect(screen.getByTestId('work-surfaces-mock')).toHaveAttribute('data-initial-layout', 'board'))

    window.history.pushState({}, '', '/?view=my-work&layout=list')
    fireEvent.popState(window)
    await waitFor(() => expect(screen.getByTestId('work-surfaces-mock')).toHaveAttribute('data-initial-layout', 'list'))

    fireEvent.click(screen.getByRole('button', { name: 'Mock saved board' }))
    await waitFor(() => expect(screen.getByTestId('work-surfaces-mock')).toHaveAttribute('data-initial-layout', 'board'))
    expect(new URLSearchParams(window.location.search).get('search')).toBe('saved-layout')
    expect(new URLSearchParams(window.location.search).get('layout')).toBe('board')
  })

  it('localizes the release build and schema labels', async () => {
    document.cookie = 'workmesh_locale=zh-CN; Path=/'
    render(<LocaleProvider><HomePage /></LocaleProvider>)

    const releaseInfo = await screen.findAllByTestId('release-info')
    expect(releaseInfo).not.toHaveLength(0)
    for (const element of releaseInfo) {
      expect(element).toHaveTextContent('vtest · 构建 test · 数据库架构 1')
    }
  })

  it('uses the Guidance copy contract for editor and preview chrome', async () => {
    window.history.replaceState({}, '', '/?view=guidance')
    apiMock.apiRequest.mockImplementation(async (path: string) => {
      if (path === '/api/v1/features') return { features: [] }
      if (path === '/api/v1/workspaces/workspace-1/guidance') return {
        scope: 'workspace',
        scopeId: 'workspace-1',
        documentId: 'guidance-1',
        status: 'active',
        revision: 1,
        currentRevision: null,
        markdown: '',
        updatedAt: '2026-08-23T00:00:00.000Z',
      }
      if (path === '/api/v1/workspaces/workspace-1/guidance/history') return {
        scope: 'workspace',
        scopeId: 'workspace-1',
        documentId: 'guidance-1',
        revision: 1,
        status: 'active',
        currentRevisionId: null,
        revisions: [],
        audit: [],
      }
      return { id: 'fixture' }
    })
    render(<LocaleProvider><HomePage /></LocaleProvider>)

    expect(await screen.findByRole('tab', { name: 'Edit' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(screen.getByText('0 characters')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Rendered Markdown preview' })).toBeInTheDocument()
    expect(screen.getByText('Write Markdown in edit mode, then switch to preview to see the rendered result.')).toBeInTheDocument()
  })

  it('is a named focusable local-scroll region with owned Arrow movement and ordinary child activation', async () => {
    render(<LocaleProvider><HomePage /></LocaleProvider>)
    const strip = await screen.findByRole('region', { name: 'Projects' })
    expect(strip).toHaveAttribute('tabindex', '0')
    Object.defineProperties(strip, {
      clientWidth: { configurable: true, value: 240 },
      scrollWidth: { configurable: true, value: 720 },
    })
    strip.scrollLeft = 0
    strip.focus()

    expect(fireEvent.keyDown(strip, { key: 'ArrowRight' })).toBe(false)
    expect(strip.scrollLeft).toBeGreaterThan(0)
    expect(fireEvent.keyDown(strip, { key: 'ArrowLeft' })).toBe(false)
    expect(strip.scrollLeft).toBe(0)

    const projectButton = screen.getByRole('button', { name: /Responsive operations/ })
    const beforeChildArrow = strip.scrollLeft
    expect(fireEvent.keyDown(projectButton, { key: 'ArrowRight' })).toBe(false)
    expect(strip.scrollLeft).toBe(beforeChildArrow)
    expect(fireEvent.keyDown(projectButton, { key: 'Enter' })).toBe(true)
    fireEvent.click(projectButton)

    await waitFor(() => expect(window.location.search).toContain('project=project-2'))
    expect(await screen.findByTestId('project-workspace')).toHaveTextContent('Responsive operations')
  })
})

describe('Home full-page WorkItem semantics', () => {
  it('exposes only the active detail h1 and removes the obscured page content from semantics', async () => {
    window.localStorage.clear()
    window.history.replaceState({}, '', `/?view=my-work&workItem=${fullPageWorkItem.id}`)
    apiMock.apiRequest.mockImplementation(async (path: string) => {
      if (path === '/api/v1/features') return { features: [] }
      if (path === `/api/v1/work-items/${fullPageWorkItem.id}`) return fullPageWorkItem
      return projects.find(candidate => path === `/api/v1/projects/${candidate.id}`) ?? { id: 'fixture' }
    })

    render(<LocaleProvider><HomePage /></LocaleProvider>)

    const detail = await screen.findByTestId('work-item-detail')
    const surface = detail.closest('.work-item-full-page')
    expect(surface).not.toBeNull()
    const activeHeadings = screen.getAllByRole('heading', { level: 1 })
    expect(activeHeadings).toHaveLength(1)
    const activeHeading = activeHeadings[0]
    if (!activeHeading) throw new Error('Active full-page Issue heading is missing.')
    expect(activeHeading).toHaveTextContent(fullPageWorkItem.title)
    expect(surface).toContainElement(activeHeading)
    expect(surface).toHaveAttribute('aria-labelledby', activeHeading.id)

    const obscuredHeading = screen.getByRole('heading', { hidden: true, level: 1, name: 'Issues' })
    const obscuredContent = obscuredHeading.closest('.content')
    expect(obscuredContent).toHaveAttribute('aria-hidden', 'true')
    expect(obscuredContent).toHaveAttribute('inert')
    expect(obscuredContent).not.toHaveAttribute('hidden')
    expect(obscuredHeading.closest('header')).toHaveAttribute('hidden')
  })
})
