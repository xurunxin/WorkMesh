// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api'
import type { Approval, ApprovalDecision, ApprovalDecisionResponse } from '../lib/agents'
import { LocaleProvider } from '../lib/i18n'
import type { PagedCollection } from '../lib/pagination'
import { ToastViewport } from '../lib/toast-viewport'
import { toastStore } from '../lib/use-toast'
import AgentsPage from './page'

const agentsMock = vi.hoisted(() => ({ decideApproval: vi.fn() }))
const agentCardRenderMock = vi.hoisted(() => ({ render: vi.fn() }))
const paginationMock = vi.hoisted(() => ({ usePagedApiList: vi.fn() }))
const routeMock = vi.hoisted(() => ({
  state: {
    approvalStatus: 'approved',
    approvalView: 'pending',
    capability: '',
    name: '',
    status: 'all',
    tab: 'approvals',
    teamAccessAgentId: '',
    teamId: '',
  },
  update: vi.fn(),
}))
const authMock = vi.hoisted(() => ({
  actor: { id: 'human-1', display_name: 'Ada', workspace_id: 'workspace-1', workspace_role: 'admin' },
  error: '',
  loading: false,
  refresh: vi.fn(async () => undefined),
}))

vi.mock('../lib/agents', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/agents')>()
  return { ...actual, decideApproval: agentsMock.decideApproval }
})
vi.mock('../lib/pagination', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/pagination')>()
  return { ...actual, usePagedApiList: paginationMock.usePagedApiList }
})
vi.mock('../lib/use-authenticated-actor', () => ({
  useAuthenticatedActor: () => ({
    actor: authMock.actor,
    error: authMock.error,
    loading: authMock.loading,
    refresh: authMock.refresh,
  }),
}))
vi.mock('../lib/use-media-query', () => ({ useMediaQuery: () => false }))
vi.mock('../lib/realtime', () => ({ useRealtimeSubscription: () => undefined }))
vi.mock('../realtime-status', () => ({ RealtimeStatus: () => null }))
vi.mock('../agent-connections-panel', () => ({
  AgentConnectionsPanel: ({ humans, teams }: { humans: Array<{ display_name: string }>; teams: Array<{ name: string }> }) => <div>
    Connections remain actionable {teams.map(team => team.name).join(' ')} {humans.map(human => human.display_name).join(' ')}
  </div>,
}))
vi.mock('./agent-peek', () => ({
  AgentPeek: ({ agent, open }: { agent: { name?: string } | null; open: boolean }) => open && agent ? <div data-testid="agent-peek-proof">Peek {agent.name}</div> : null,
}))
vi.mock('./agent-registry-card', async () => {
  const { memo } = await import('react')
  return {
    AgentRegistryCard: memo(function MockAgentRegistryCard({ agent, focused, linkRef, onFocus, onManageTeamAccess, onPeek }: {
      agent: { id: string; name?: string }
      focused: boolean
      linkRef?: (agentId: string, node: HTMLAnchorElement | null) => void
      onFocus: (agentId: string) => void
      onManageTeamAccess: (agentId: string) => void
      onPeek: (agentId: string) => void
    }) {
      agentCardRenderMock.render(agent.id)
      return <article>
        <span>{agent.name}</span>
        <a
          data-agent-id={agent.id}
          data-agent-roving-link="true"
          data-testid={`agent-roving-${agent.id}`}
          href={`/agents/${agent.id}`}
          onFocus={() => onFocus(agent.id)}
          ref={node => linkRef?.(agent.id, node)}
          tabIndex={focused ? 0 : -1}
        >Details {agent.name}</a>
        <button onClick={() => onPeek(agent.id)} type="button">Peek {agent.name}</button>
        <button onClick={() => onManageTeamAccess(agent.id)} type="button">Access {agent.name}</button>
      </article>
    }),
  }
})
vi.mock('./team-access-drawer', () => ({
  TeamAccessDrawer: ({ agent, open }: { agent: { name?: string } | null; open: boolean }) => open && agent ? <div data-testid="team-access-proof">Access drawer {agent.name}</div> : null,
}))
vi.mock('./approval-route-state', async importOriginal => {
  const actual = await importOriginal<typeof import('./approval-route-state')>()
  return {
    ...actual,
    useAgentsRouteState: () => ({
      state: routeMock.state,
      update: routeMock.update,
    }),
  }
})

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

function approval(id: string, actionName: string): Approval {
  return {
    action_name: actionName,
    approval_type: 'tool',
    created_at: '2026-08-23T00:00:00.000Z',
    expires_at: '2099-08-24T00:00:00.000Z',
    id,
    rationale_summary: 'Operator review required',
    revision: 1,
    risk_level: 'medium',
    session_id: `session-${id}`,
    status: 'pending',
  }
}

function decisionResponse(item: Approval, decision: ApprovalDecision): ApprovalDecisionResponse {
  const approved = decision === 'approved' ? 1 : 0
  const rejected = decision === 'rejected' ? 1 : 0
  return {
    approval: { ...item, status: decision, revision: item.revision + 1 },
    decision: {
      actor_id: authMock.actor.id,
      decision,
      source: 'human',
      policy_workspace_id: null,
      policy_revision: null,
      reason: 'Recorded by the fixture.',
      decided_at: '2026-08-28T00:00:00.000Z',
    },
    quorum: { approved, reached: approved === 1, rejected, required: 1 },
    status: decision,
  }
}

let agents: TestCollection
let teams: TestCollection
let humans: TestCollection
let sessions: TestCollection
let attention: TestCollection
let pending: TestCollection
let history: TestCollection

function renderPage(): void {
  render(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
}

function selectAllAndApprove(): void {
  fireEvent.click(screen.getByTestId('approval-select-all'))
  fireEvent.click(screen.getByRole('button', { name: '通过所选' }))
}

beforeEach(() => {
  toastStore.reset()
  authMock.actor = { id: 'human-1', display_name: 'Ada', workspace_id: 'workspace-1', workspace_role: 'admin' }
  authMock.error = ''
  authMock.loading = false
  pending = collection([
    approval('approval-1', 'Deploy runtime'),
    approval('approval-2', 'Rotate cache'),
    approval('approval-3', 'Publish report'),
  ])
  agents = collection([])
  teams = collection([])
  humans = collection([])
  sessions = collection([])
  attention = collection([])
  history = collection([])
  routeMock.state.approvalStatus = 'approved'
  routeMock.state.approvalView = 'pending'
  routeMock.state.capability = ''
  routeMock.state.name = ''
  routeMock.state.status = 'all'
  routeMock.state.tab = 'approvals'
  routeMock.state.teamAccessAgentId = ''
  routeMock.state.teamId = ''
  routeMock.update.mockReset()
  agentCardRenderMock.render.mockReset()
  paginationMock.usePagedApiList.mockReset()
  paginationMock.usePagedApiList.mockImplementation((path: string | null) => {
    if (path?.startsWith('/api/v1/agents?lifecycle=active')) return agents
    if (path === '/api/v1/agents?lifecycle=archived') return collection([])
    if (path === '/api/v1/teams') return teams
    if (path === '/api/v1/actors/humans') return humans
    if (path === '/api/v1/agent-sessions') return sessions
    if (path === '/api/v1/human-attention?status=open') return attention
    if (path === '/api/v1/approvals?status=pending') return pending
    return history
  })
  agentsMock.decideApproval.mockReset()
  agentsMock.decideApproval.mockImplementation((item: Approval, decision: ApprovalDecision) => Promise.resolve(decisionResponse(item, decision)))
})

afterEach(() => {
  cleanup()
  toastStore.reset()
  document.cookie = 'workmesh_locale=; Path=/; Max-Age=0'
  window.localStorage.removeItem('workmesh_locale')
})

describe('Agents bulk approval outcomes', () => {
  it('owns all Agent surface aria labels in the active locale', () => {
    document.cookie = 'workmesh_locale=zh-CN; Path=/'
    const view = render(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)

    expect(document.querySelector('.control-summary')).toHaveAttribute('aria-label', '智能体控制摘要')
    expect(document.querySelector('.approval-inbox')).toHaveAttribute('aria-label', '审批')

    routeMock.state.tab = 'agents'
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    expect(document.querySelector('.agent-registry')).toHaveAttribute('aria-label', '注册表')

    routeMock.state.tab = 'sessions'
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    expect(document.querySelector('section[aria-label="Sessions"]')).not.toBeNull()
    expect(document.querySelector('section[aria-label="诊断"]')).not.toBeNull()
  })

  it('synchronously clears actor-owned approval selection when authenticated authority changes', () => {
    const view = render(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    fireEvent.click(screen.getByTestId('approval-select-all'))
    expect(screen.getAllByTestId(/approval-checkbox-/).every(input => (input as HTMLInputElement).checked)).toBe(true)

    authMock.actor = { id: 'human-2', display_name: 'Grace', workspace_id: 'workspace-2', workspace_role: 'member' }
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)

    expect(screen.getAllByTestId(/approval-checkbox-/).every(input => !(input as HTMLInputElement).checked)).toBe(true)
    expect(screen.getAllByText('Grace').length).toBeGreaterThan(0)
  })

  it('revokes every A-authority Agent projection and open surface before B collections resolve', () => {
    routeMock.state.tab = 'agents'
    routeMock.update.mockImplementation((patch: Partial<typeof routeMock.state>) => Object.assign(routeMock.state, patch))
    agents.items = [{
      id: 'agent-a', workspace_id: 'workspace-1', actor_id: 'agent-actor-a', name: 'A private Agent', slug: 'a-private',
      description: null, supported_protocols: ['mcp'], skills: [], requested_capabilities: ['work:read'], approved_capabilities: ['work:read'],
      max_concurrency: 1, is_active: true, revision: 1, team_access: [],
    }]
    teams.items = [{ id: 'team-a', name: 'A private Team', key: 'APRIV' }]
    humans.items = [{ id: 'human-a', display_name: 'A private Human' }]
    sessions.items = [{
      id: 'session-a', agent_id: 'agent-a', agent_actor_id: 'agent-actor-a', delegation_id: 'delegation-a', work_item_id: null,
      state: 'executing', state_reason: null, revision: 1, current_plan_version_id: null, budget: {}, last_heartbeat_at: null,
      stop_requested_at: null, error_code: null, error_summary: null, created_at: '2026-08-23T00:00:00.000Z', updated_at: '2026-08-23T00:00:00.000Z',
    }]
    const oldCollections = [agents, teams, humans, sessions, attention, pending]
    const view = render(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    expect(screen.getByText('A private Agent')).toBeVisible()
    expect(screen.getAllByText(/A private Team/).length).toBeGreaterThan(0)
    routeMock.state.tab = 'connections'
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    expect(screen.getByText(/A private Human/)).toBeVisible()
    routeMock.state.tab = 'agents'
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Peek A private Agent' }))
    expect(screen.getByTestId('agent-peek-proof')).toHaveTextContent('A private Agent')
    fireEvent.click(screen.getByRole('button', { name: 'Access A private Agent' }))
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    expect(screen.getByTestId('team-access-proof')).toHaveTextContent('A private Agent')
    routeMock.state.tab = 'sessions'
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    expect(screen.getByTestId('session-card-session-a')).toBeInTheDocument()
    routeMock.state.tab = 'approvals'
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    expect(screen.getByTestId('approval-checkbox-approval-1')).toBeInTheDocument()

    authMock.actor = { id: 'human-2', display_name: 'Grace', workspace_id: 'workspace-2', workspace_role: 'member' }
    agents = { ...collection([]), initialized: false, loading: true }
    teams = { ...collection([]), initialized: false, loading: true }
    humans = { ...collection([]), initialized: false, loading: true }
    sessions = { ...collection([]), initialized: false, loading: true }
    attention = { ...collection([]), initialized: false, loading: true }
    pending = { ...collection([]), initialized: false, loading: true }
    history = { ...collection([]), initialized: false, loading: true }
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)

    expect(screen.queryByText(/A private Agent|A private Team|A private Human/)).toBeNull()
    expect(screen.queryByTestId('session-card-session-a')).toBeNull()
    expect(screen.queryByTestId('approval-checkbox-approval-1')).toBeNull()
    expect(screen.queryByTestId('agent-peek-proof')).toBeNull()
    expect(screen.queryByTestId('team-access-proof')).toBeNull()
    oldCollections.forEach(oldCollection => { oldCollection.items = [{ id: 'late-a', name: 'A late result' }] })
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    expect(screen.queryByText('A late result')).toBeNull()
  })

  it('ignores an A-authority bulk decision that settles after switching to B', async () => {
    const pendingDecision = deferred<void>()
    agentsMock.decideApproval.mockImplementation(() => pendingDecision.promise)
    const view = render(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    const aRefresh = pending.refresh
    selectAllAndApprove()
    await waitFor(() => expect(agentsMock.decideApproval).toHaveBeenCalledTimes(3))

    authMock.actor = { id: 'human-2', display_name: 'Grace', workspace_id: 'workspace-2', workspace_role: 'member' }
    pending = { ...collection([]), initialized: false, loading: true }
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    await act(async () => {
      pendingDecision.resolve()
      await pendingDecision.promise
    })

    expect(aRefresh).not.toHaveBeenCalled()
    expect(toastStore.getSnapshot()).toHaveLength(0)
    expect(screen.queryByTestId('approval-checkbox-approval-1')).toBeNull()
  })

  it('retains the exact AppShell action and focus during an authenticated actor refresh', () => {
    const { rerender } = render(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    const action = screen.getByRole('button', { name: '刷新' })
    action.focus()

    authMock.loading = true
    rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)

    expect(screen.getByRole('button', { name: '刷新' })).toBe(action)
    expect(document.activeElement).toBe(action)
    expect(document.querySelector('.agent-center')).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps 300 stable Agent cards out of Peek and four-keystroke filter rerenders', async () => {
    routeMock.state.tab = 'agents'
    agents.items = Array.from({ length: 300 }, (_, offset) => {
      const number = String(offset + 1).padStart(3, '0')
      return {
        id: `agent-${number}`,
        name: `Agent ${number}`,
        slug: `agent-${number}`,
        is_active: true,
        requested_capabilities: ['work:read'],
        approved_capabilities: ['work:read'],
        max_concurrency: 1,
        team_access: [],
      }
    })
    const view = render(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    expect(agentCardRenderMock.render).toHaveBeenCalledTimes(300)

    fireEvent.click(screen.getByRole('button', { name: 'Peek Agent 150' }))
    expect(screen.getByTestId('agent-peek-proof')).toHaveTextContent('Agent 150')
    expect(agentCardRenderMock.render).toHaveBeenCalledTimes(300)

    const nameFilter = screen.getByRole('searchbox', { name: '名称' })
    nameFilter.focus()
    for (const name of ['A', 'Ag', 'Age', 'Agen']) {
      routeMock.state.name = name
      view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    }
    expect(nameFilter).toHaveValue('Agen')
    expect(document.activeElement).toBe(nameFilter)
    expect(agentCardRenderMock.render).toHaveBeenCalledTimes(300)

    routeMock.state.name = 'Agent 2'
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)

    await waitFor(() => expect(screen.queryByTestId('agent-peek-proof')).toBeNull())
    expect(document.activeElement).toBe(nameFilter)
    expect(screen.getAllByTestId(/agent-roving-agent-2/)).toHaveLength(100)
    expect(agentCardRenderMock.render).toHaveBeenCalledTimes(301)
  })

  it('closes a filtered Peek and transfers orphaned roving focus to the first visible Agent link', async () => {
    routeMock.state.tab = 'agents'
    agents.items = [
      {
        id: 'agent-101', name: 'Agent 101', slug: 'agent-101', is_active: true,
        requested_capabilities: ['work:read'], approved_capabilities: ['work:read'], max_concurrency: 1, team_access: [],
      },
      {
        id: 'agent-250', name: 'Agent 250', slug: 'agent-250', is_active: true,
        requested_capabilities: ['work:read'], approved_capabilities: ['work:read'], max_concurrency: 1, team_access: [],
      },
    ]
    const view = render(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    const agent101 = screen.getByTestId('agent-roving-agent-101')
    agent101.focus()
    fireEvent.click(screen.getByRole('button', { name: 'Peek Agent 101' }))
    expect(screen.getByTestId('agent-peek-proof')).toHaveTextContent('Agent 101')

    routeMock.state.name = 'Agent 250'
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)

    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('agent-roving-agent-250')))
    expect(screen.queryByTestId('agent-peek-proof')).toBeNull()
    expect(screen.getByTestId('agent-roving-agent-250')).toHaveAttribute('tabindex', '0')

    routeMock.state.name = ''
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    expect(screen.getByTestId('agent-roving-agent-101')).toBeVisible()
    expect(screen.queryByTestId('agent-peek-proof')).toBeNull()
  })

  it('does not steal focus from a surviving filter control when a route filter hides the roving Agent', async () => {
    routeMock.state.tab = 'agents'
    agents.items = [
      {
        id: 'agent-101', name: 'Agent 101', slug: 'agent-101', is_active: true,
        requested_capabilities: ['work:read'], approved_capabilities: ['work:read'], max_concurrency: 1, team_access: [],
      },
      {
        id: 'agent-250', name: 'Agent 250', slug: 'agent-250', is_active: true,
        requested_capabilities: ['work:read'], approved_capabilities: ['work:read'], max_concurrency: 1, team_access: [],
      },
    ]
    const view = render(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    screen.getByTestId('agent-roving-agent-101').focus()
    const nameFilter = screen.getByRole('searchbox', { name: '名称' })
    nameFilter.focus()

    routeMock.state.name = 'Agent 250'
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)

    await waitFor(() => expect(screen.getByTestId('agent-roving-agent-250')).toHaveAttribute('tabindex', '0'))
    expect(document.activeElement).toBe(nameFilter)
  })

  it('keeps Summary pending when only the inactive History authority fails', () => {
    agents.initialized = false
    agents.loading = true
    history.error = new Error('history failed')
    history.initialized = false

    renderPage()

    expect(screen.getByRole('status', { name: '正在加载智能体工作区' })).toBeVisible()
    expect(screen.getByRole('alert')).toBeVisible()
  })

  it('keeps Registry pending independently of a Team collection failure', () => {
    routeMock.state.tab = 'agents'
    agents.initialized = false
    agents.loading = true
    teams.error = new Error('teams failed')
    teams.initialized = false

    renderPage()

    const registry = screen.getByRole('region', { name: '注册表' })
    expect(within(registry).getByRole('status', { name: '正在加载智能体工作区' })).toBeVisible()
    expect(within(registry).queryByText('没有符合当前筛选的已注册智能体。')).toBeNull()
  })

  it('keeps the Registry skeleton as its sole busy owner when retained Teams refresh concurrently', () => {
    routeMock.state.tab = 'agents'
    agents.initialized = false
    agents.loading = true
    teams.initialized = true
    teams.loading = true

    renderPage()

    const registry = screen.getByRole('region', { name: '注册表' })
    const status = within(registry).getByRole('status', { name: '正在加载智能体工作区' })
    expect(registry).not.toHaveAttribute('aria-busy')
    expect(within(registry).getAllByRole('status')).toEqual([status])
    expect(registry.querySelectorAll('[aria-busy="true"]')).toHaveLength(1)
    expect(status).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps Sessions pending independently of an Agents collection failure', () => {
    routeMock.state.tab = 'sessions'
    sessions.initialized = false
    sessions.loading = true
    agents.error = new Error('agents failed')
    agents.initialized = false

    renderPage()

    const sessionPanel = screen.getByRole('region', { name: 'Sessions' })
    expect(within(sessionPanel).getByRole('status', { name: '正在加载智能体工作区' })).toBeVisible()
    expect(within(sessionPanel).queryByText('当前没有可见的智能体 Session。')).toBeNull()
  })

  it('does not render a History skeleton after its new scope fails', () => {
    routeMock.state.approvalView = 'history'
    history.initialized = false
    history.loading = false
    history.error = new Error('history scope failed')

    renderPage()

    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.queryByRole('status', { name: '正在加载审批历史记录…' })).toBeNull()
  })

  it('retains pending approvals for a network refresh failure but revokes them for 403', () => {
    pending.error = new TypeError('network refresh failed')
    pending.nextCursor = 'pending-more'
    const { rerender } = render(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    expect(screen.getAllByTestId(/approval-checkbox-/)).toHaveLength(3)
    expect(screen.getByTestId('load-more-approvals')).toBeVisible()

    pending.error = new ApiError(403, 'forbidden')
    rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)

    expect(screen.queryAllByTestId(/approval-checkbox-/)).toHaveLength(0)
    expect(screen.queryByRole('region', { name: 'Agent control summary' })).toBeNull()
    expect(screen.queryByTestId('load-more-approvals')).toBeNull()
    expect(screen.getByRole('alert')).toBeVisible()
  })

  it('does not report clear diagnostics or expose stale pagination after its authorities are revoked', () => {
    routeMock.state.tab = 'sessions'
    sessions.nextCursor = 'sessions-more'
    sessions.error = new ApiError(403, 'forbidden')
    attention.error = new ApiError(403, 'forbidden')

    renderPage()

    const diagnostics = screen.getByRole('region', { name: '诊断' })
    expect(within(diagnostics).queryByRole('list')).toBeNull()
    expect(screen.queryByTestId('load-more-sessions')).toBeNull()
  })

  it('counts and renders only server-projected Human Attention items', () => {
    routeMock.state.tab = 'sessions'
    sessions.items = [{
      id: 'failed-session',
      agent_id: 'agent-1',
      agent_actor_id: 'agent-actor-1',
      delegation_id: 'delegation-1',
      work_item_id: 'work-1',
      state: 'failed',
      state_reason: 'Failed source fixture',
      revision: 1,
      current_plan_version_id: null,
      budget: {},
      last_heartbeat_at: null,
      stop_requested_at: null,
      error_code: 'FAILED',
      error_summary: 'Failed source fixture',
      created_at: '2026-08-26T00:00:00.000Z',
      updated_at: '2026-08-26T00:00:00.000Z',
    }]
    const view = render(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)
    expect(screen.getByText('需要关注').closest('article')).toHaveTextContent('0')

    attention.items = [{
      id: 'v1:agent_session:00000000-0000-4000-8000-000000000001',
      title: 'Authoritative recovery item',
      summary: 'The server projection requires a Human recovery decision.',
      sessionId: 'failed-session',
    }]
    view.rerender(<LocaleProvider><AgentsPage /><ToastViewport /></LocaleProvider>)

    expect(screen.getByText('需要关注').closest('article')).toHaveTextContent('1')
    expect(screen.getByRole('link', { name: 'Authoritative recovery item' }))
      .toHaveAttribute('href', '/agent-sessions/failed-session')
    expect(screen.getByText('The server projection requires a Human recovery decision.')).toBeVisible()
  })

  it('submits a direct approval without bulk selection and reports success on that row', async () => {
    renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: '通过' })[0]!)

    await waitFor(() => expect(agentsMock.decideApproval).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'approval-1' }),
      'approved',
      undefined,
    ))
    expect(await screen.findByText('已记录通过决定。')).toBeVisible()
    expect(screen.queryByText('已选 1 项')).toBeNull()
  })

  it('shows a safe per-row revision conflict and refreshes instead of replaying the decision', async () => {
    agentsMock.decideApproval.mockRejectedValueOnce(new ApiError(409, 'private revision diagnostic', 'REVISION_CONFLICT'))
    renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: '通过' })[0]!)

    expect(await screen.findByText('审批已发生变化，列表已刷新，请重新确认。')).toBeVisible()
    await waitFor(() => expect(pending.refresh).toHaveBeenCalledTimes(1))
    expect(agentsMock.decideApproval).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('private revision diagnostic')).toBeNull()
  })

  it('keeps a quorum-pending decision visible as waiting for other reviewers', async () => {
    const item = pending.items[0] as Approval
    agentsMock.decideApproval.mockResolvedValueOnce({
      ...decisionResponse(item, 'approved'),
      approval: { ...item, revision: 2 },
      quorum: { approved: 1, reached: false, rejected: 0, required: 2 },
      status: 'pending',
    })
    renderPage()

    fireEvent.click(screen.getAllByRole('button', { name: '通过' })[0]!)

    const row = screen.getByTestId('approval-row-approval-1')
    expect(await within(row).findByText(/当前 1\/2 票通过/)).toBeVisible()
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('emits one localized success toast only after every selected decision succeeds', async () => {
    renderPage()
    selectAllAndApprove()

    await waitFor(() => expect(agentsMock.decideApproval).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(toastStore.getSnapshot()).toEqual([
      expect.objectContaining({ title: '已批准 3 项请求', tone: 'success' }),
    ]))
    expect(screen.getAllByTestId(/approval-checkbox-/)).toHaveLength(3)
    expect(screen.getAllByTestId(/approval-checkbox-/).every(input => !(input as HTMLInputElement).checked)).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    ['network-only partial', (id: string) => id === 'approval-1' ? Promise.resolve() : Promise.reject(new TypeError(`private network ${id}`))],
    ['mixed conflict and network', (id: string) => id === 'approval-1'
      ? Promise.resolve()
      : id === 'approval-2'
        ? Promise.reject(new ApiError(409, 'private revision diagnostic', 'REVISION_CONFLICT'))
        : Promise.reject(new TypeError('private transport diagnostic'))],
  ])('keeps %s aggregate detail contextual, retains only failed selection, and emits no toast', async (_label, outcome) => {
    agentsMock.decideApproval.mockImplementation((item: Approval, decision: ApprovalDecision) => outcome(item.id).then(() => decisionResponse(item, decision)))
    renderPage()
    selectAllAndApprove()

    expect(await screen.findByText(/部分审批未完成/)).toHaveTextContent('已完成 1 项，2 项仍保留供重试。')
    expect(screen.queryByText(/private revision diagnostic|private transport diagnostic|private network/)).toBeNull()
    expect((screen.getByTestId('approval-checkbox-approval-1') as HTMLInputElement).checked).toBe(false)
    expect((screen.getByTestId('approval-checkbox-approval-2') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('approval-checkbox-approval-3') as HTMLInputElement).checked).toBe(true)
    expect(toastStore.getSnapshot()).toHaveLength(0)
  })

  it('keeps all failed rows selected with safe contextual copy and no raw or toast output', async () => {
    agentsMock.decideApproval.mockRejectedValue(new TypeError('private total outage'))
    renderPage()
    selectAllAndApprove()

    expect(await screen.findByText(/审批操作未完成/)).toHaveTextContent('所选请求仍保留，请检查连接后重试。')
    expect(screen.queryByText('private total outage')).toBeNull()
    expect(screen.getAllByTestId(/approval-checkbox-/).every(input => (input as HTMLInputElement).checked)).toBe(true)
    expect(toastStore.getSnapshot()).toHaveLength(0)
  })

  it('does not relabel a committed success when the post-commit refresh fails', async () => {
    pending.refresh = vi.fn(async () => { throw new Error('private refresh diagnostic') })
    renderPage()
    selectAllAndApprove()

    expect(await screen.findByText('无法加载智能体。')).toBeVisible()
    expect(screen.queryByText('private refresh diagnostic')).toBeNull()
    expect(toastStore.getSnapshot()).toEqual([
      expect.objectContaining({ title: '已批准 3 项请求', tone: 'success' }),
    ])
  })
})
