// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentWorkPanel, useAgentDelegationController, type AgentDelegationController } from './agent-work-panel'
import { createAgentSession, type Agent, type AgentSession } from './lib/agents'
import { LocaleProvider } from './lib/i18n'

const paginationState = vi.hoisted(() => ({ agentNextCursor: null as string | null, sessionsInitialized: true, sessionsLoading: false }))

vi.mock('./lib/agents', async () => {
  const actual = await vi.importActual<typeof import('./lib/agents')>('./lib/agents')
  return { ...actual, createAgentSession: vi.fn() }
})

vi.mock('./lib/pagination', async () => {
  const actual = await vi.importActual<typeof import('./lib/pagination')>('./lib/pagination')
  return {
    ...actual,
    usePagedApiList: vi.fn((path: string) => ({
      items: path.includes('/agent-sessions?') || path.includes('/plans') || path.includes('/approvals?') ? [] : [agent],
      nextCursor: path.includes('/agent-sessions?') || path.includes('/plans') || path.includes('/approvals?') ? null : paginationState.agentNextCursor,
      initialized: path.includes('/agent-sessions?') ? paginationState.sessionsInitialized : true,
      loading: path.includes('/agent-sessions?') ? paginationState.sessionsLoading : false,
      loadingMore: false,
      error: null,
      refresh: vi.fn(async () => undefined),
      loadMore: vi.fn(async () => undefined),
    })),
  }
})

vi.mock('./lib/realtime', () => ({ useRealtimeSubscription: vi.fn() }))
vi.mock('./lib/realtime-refresh', () => ({ agentWorkRefreshTargets: vi.fn(() => new Set<string>()) }))

const agent: Agent = {
  id: 'agent-a', workspace_id: 'workspace-a', actor_id: 'actor-a', slug: 'agent-a', description: null,
  supported_protocols: ['native_http'], skills: [], requested_capabilities: ['work:read', 'work:write'],
  approved_capabilities: ['work:read', 'work:write'], max_concurrency: 1, is_active: true, revision: 1,
  team_access: [{ agent_id: 'agent-a', team_id: 'team-a', approved_capabilities: ['work:read', 'work:write'], status: 'active', approved_by_actor_id: 'human-a', revision: 1, created_at: '', updated_at: '', revoked_at: null }],
}

const session = { id: 'session-a', agent_id: agent.id, state: 'executing' } as AgentSession

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

describe('useAgentDelegationController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    paginationState.agentNextCursor = null
    paginationState.sessionsInitialized = true
    paginationState.sessionsLoading = false
    agent.team_access![0]!.approved_capabilities = ['work:read', 'work:write']
  })
  afterEach(() => cleanup())

  it('clears pending Issue A state before the first Issue B render and ignores the late result', async () => {
    const pending = deferred<AgentSession>()
    vi.mocked(createAgentSession).mockReturnValueOnce(pending.promise)
    const props = (workItemId: string) => ({
      workItemId, workItemTeamId: 'team-a', workItemRevision: 1, humanActorId: 'human-a', scopeKey: 'authority-a',
    })
    const { result, rerender } = renderHook(input => useAgentDelegationController(input), { initialProps: props('work-a') })

    await act(async () => { void result.current.create(agent, 'Take Issue A') })
    expect(result.current.busy).toBe(true)

    rerender(props('work-b'))
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.latest).toBeNull()
    expect(result.current.chooserRequest).toBe(0)

    await act(async () => { pending.resolve(session); await pending.promise })
    expect(result.current.busy).toBe(false)
    expect(result.current.latest).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('shares availability decisions and reason between direct and chooser actions', () => {
    const props = { workItemId: 'work-a', workItemTeamId: 'team-a', workItemRevision: 1, humanActorId: 'human-a', scopeKey: 'authority-a' }
    const { result } = renderHook(() => useAgentDelegationController(props))
    expect(result.current.canDirect).toBe(true)
    expect(result.current.canChoose).toBe(true)
    expect(result.current.disabled).toBe(false)
    expect(result.current.reason).toBeNull()
  })

  it('does not offer an Agent missing either required execution capability', () => {
    agent.team_access![0]!.approved_capabilities = ['work:read']
    const props = { workItemId: 'work-a', workItemTeamId: 'team-a', workItemRevision: 1, humanActorId: 'human-a', scopeKey: 'authority-a' }
    const { result } = renderHook(() => useAgentDelegationController(props))
    expect(result.current.eligibleAgents).toEqual([])
    expect(result.current.canDirect).toBe(false)
    expect(result.current.canChoose).toBe(false)
    expect(result.current.reason).toBe('no_eligible_agent')

    render(<LocaleProvider><AgentWorkPanel controller={result.current} workItemId="work-a" workItemRevision={1} workItemTeamId="team-a" workspaceId="workspace-a" humanActorId="human-a" /></LocaleProvider>)
    expect(screen.getByTestId('delegate-unavailable-reason')).toHaveTextContent('work:read')
    expect(screen.getByTestId('delegate-unavailable-reason')).toHaveTextContent('work:write')
    expect(screen.getByRole('button', { name: '选择智能体' })).toHaveAttribute('title', expect.stringContaining('work:write'))
  })

  it('opens the chooser while more Agent pages remain without guessing a direct default', async () => {
    paginationState.agentNextCursor = 'agents-page-2'
    const props = { workItemId: 'work-a', workItemTeamId: 'team-a', workItemRevision: 1, humanActorId: 'human-a', scopeKey: 'authority-a' }
    const { result } = renderHook(() => useAgentDelegationController(props))
    expect(result.current.canDirect).toBe(false)
    expect(result.current.canChoose).toBe(true)
    expect(result.current.disabled).toBe(false)
    expect(result.current.reason).toBeNull()

    render(<LocaleProvider><AgentWorkPanel controller={result.current} workItemId="work-a" workItemRevision={1} workItemTeamId="team-a" workspaceId="workspace-a" humanActorId="human-a" /></LocaleProvider>)
    fireEvent.click(screen.getByRole('button', { name: '选择智能体' }))
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus())
    expect(screen.getByTestId('delegate-agent-form')).not.toHaveAttribute('hidden')
  })

  it('focuses the Agent selector when the disclosure opens', async () => {
    const controller: AgentDelegationController = {
      scopeKey: 'authority-a:work-a', agentsPage: { items: [agent], nextCursor: null, initialized: true, loading: false, loadingMore: false, error: null, refresh: vi.fn(async () => undefined), loadMore: vi.fn(async () => undefined) },
      eligibleAgents: [agent], directAgent: agent, canDirect: true, canChoose: true, disabled: false, reason: null,
      chooserRequest: 0, requestChooser: vi.fn(), consumeChooserRequest: vi.fn(), create: vi.fn(async () => session), error: null, busy: false, latest: null,
      clearLatest: vi.fn(), clearError: vi.fn(),
    }
    render(<LocaleProvider><AgentWorkPanel controller={controller} workItemId="work-a" workItemRevision={1} workItemTeamId="team-a" workspaceId="workspace-a" humanActorId="human-a" /></LocaleProvider>)
    const disclosure = screen.getByRole('button', { name: '高级配置' })
    expect(disclosure).toHaveAttribute('aria-controls', 'agent-delegation-form')
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(disclosure)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus())
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  })

  it('explains forced replacement and does not render a false empty state while sessions load', () => {
    paginationState.sessionsInitialized = false
    paginationState.sessionsLoading = true
    const props = { workItemId: 'work-a', workItemTeamId: 'team-a', workItemRevision: 1, humanActorId: 'human-a', scopeKey: 'authority-a' }
    const { result } = renderHook(() => useAgentDelegationController(props))

    render(<LocaleProvider><AgentWorkPanel activeExecutorName="Agent Previous" controller={result.current} workItemId="work-a" workItemRevision={1} workItemTeamId="team-a" workspaceId="workspace-a" humanActorId="human-a" /></LocaleProvider>)

    expect(screen.getByRole('button', { name: '强制改派' })).toBeEnabled()
    expect(screen.getByText(/人类委派是强制任务分配/)).toBeVisible()
    expect(screen.getByText(/将停止 Agent Previous 的当前执行/)).toBeVisible()
    expect(screen.getByTestId('sessions-loading')).toHaveTextContent('正在加载智能体执行记录')
    expect(screen.queryByText('尚未委派任何智能体 Session。')).not.toBeInTheDocument()
    expect(screen.getByTestId('live-agent-panel')).toHaveAttribute('aria-busy', 'true')
  })

  it.each([
    { humanActorId: '', reason: 'missing_responsible_human' as const, expectedReason: 'delegate-no-responsible' },
    { humanActorId: 'human-a', reason: 'no_eligible_agent' as const, expectedReason: 'delegate-unavailable-reason' },
  ])('disables the panel Header when delegation is unavailable ($reason)', ({ humanActorId, reason, expectedReason }) => {
    const controller: AgentDelegationController = {
      scopeKey: `authority-a:${reason}`, agentsPage: { items: [], nextCursor: null, initialized: true, loading: false, loadingMore: false, error: null, refresh: vi.fn(async () => undefined), loadMore: vi.fn(async () => undefined) },
      eligibleAgents: [], directAgent: undefined, canDirect: false, canChoose: false, disabled: true, reason,
      chooserRequest: 0, requestChooser: vi.fn(), consumeChooserRequest: vi.fn(), create: vi.fn(async () => session), error: null, busy: false, latest: null,
      clearLatest: vi.fn(), clearError: vi.fn(),
    }
    render(<LocaleProvider><AgentWorkPanel controller={controller} workItemId="work-a" workItemRevision={1} workItemTeamId="team-a" workspaceId="workspace-a" humanActorId={humanActorId} /></LocaleProvider>)
    const primary = screen.getByRole('button', { name: '选择智能体' })
    expect(primary).toBeDisabled()
    expect(primary).toHaveAttribute('title')
    expect(screen.getByTestId(expectedReason)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '高级配置' })).toBeDisabled()
  })

  it('consumes a Header chooser request so a same-scope remount stays closed', async () => {
    let chooserRequest = 1
    const consumeChooserRequest = vi.fn(() => { chooserRequest = 0 })
    const controller = (): AgentDelegationController => ({
      scopeKey: 'authority-a:work-a', agentsPage: { items: [agent], nextCursor: 'agents-page-2', initialized: true, loading: false, loadingMore: false, error: null, refresh: vi.fn(async () => undefined), loadMore: vi.fn(async () => undefined) },
      eligibleAgents: [agent], directAgent: undefined, canDirect: false, canChoose: true, disabled: false, reason: null,
      chooserRequest, requestChooser: vi.fn(), consumeChooserRequest, create: vi.fn(async () => session), error: null, busy: false, latest: null,
      clearLatest: vi.fn(), clearError: vi.fn(),
    })
    const first = render(<LocaleProvider><AgentWorkPanel controller={controller()} workItemId="work-a" workItemRevision={1} workItemTeamId="team-a" workspaceId="workspace-a" humanActorId="human-a" /></LocaleProvider>)
    await waitFor(() => expect(consumeChooserRequest).toHaveBeenCalledOnce())
    expect(screen.getByTestId('delegate-agent-form')).not.toHaveAttribute('hidden')
    first.unmount()

    render(<LocaleProvider><AgentWorkPanel controller={controller()} workItemId="work-a" workItemRevision={1} workItemTeamId="team-a" workspaceId="workspace-a" humanActorId="human-a" /></LocaleProvider>)
    expect(screen.getByTestId('delegate-agent-form')).toHaveAttribute('hidden')
  })
})
