// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentConnectionsPanel } from './agent-connections-panel'
import { ApiError } from './lib/api'
import type { AgentConnection } from './lib/agents'
import { LocaleProvider } from './lib/i18n'
import type { PagedCollection } from './lib/pagination'

const paginationMock = vi.hoisted(() => ({ usePagedApiList: vi.fn() }))
const operationMock = vi.hoisted(() => ({
  confirm: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  rotate: vi.fn(),
}))

vi.mock('./lib/pagination', async importOriginal => {
  const actual = await importOriginal<typeof import('./lib/pagination')>()
  return { ...actual, usePagedApiList: paginationMock.usePagedApiList }
})
vi.mock('./lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('./lib/api')>()
  return {
    ...actual,
    apiRequest: vi.fn(() => new Promise(() => undefined)),
    publicRequest: vi.fn(() => new Promise(() => undefined)),
  }
})
vi.mock('./lib/agents', async importOriginal => {
  const actual = await importOriginal<typeof import('./lib/agents')>()
  return {
    ...actual,
    confirmAgentConnectionRotation: operationMock.confirm,
    createAgentConnection: operationMock.create,
    revokeAgentConnection: operationMock.revoke,
    rotateAgentConnection: operationMock.rotate,
  }
})

const baseConnection = (overrides: Partial<AgentConnection> = {}): AgentConnection => ({
  agent_actor_id: 'agent-1',
  agent_slug: 'runtime-agent',
  client_type: 'codex',
  created_at: '2026-08-23T00:00:00.000Z',
  credential_fingerprint_prefix: 'wm_safe1234',
  grant_agent_delegate: false,
  granted_capabilities: ['work:read'],
  id: 'connection-1',
  last_used_at: null,
  name: 'Runtime Agent',
  pairing_code_expires_at: null,
  principal_human_actor_id: 'human-1',
  redacted_token: true,
  requested_capabilities: ['work:read'],
  revision: 1,
  revoked_at: null,
  rotated_at: null,
  skill_sha256: 'a'.repeat(64),
  skill_version: '1.0.0',
  status: 'active',
  source: 'manual',
  enrollment_policy_id: null,
  team_id: 'team-1',
  updated_at: '2026-08-23T00:00:00.000Z',
  workspace_id: 'workspace-1',
  ...overrides,
})

let connections: PagedCollection<AgentConnection>

const props = (overrides: Partial<Parameters<typeof AgentConnectionsPanel>[0]> = {}) => ({
  admin: true,
  authorityKey: 'workspace-1:human-1:admin',
  contextError: null,
  contextInitialized: true,
  contextLoading: false,
  currentHumanId: 'human-1',
  humans: [{ display_name: 'Ada', id: 'human-1' }],
  onError: vi.fn(),
  onRefreshContext: vi.fn(),
  teams: [{ id: 'team-1', key: 'RUN', name: 'Runtime' }],
  ...overrides,
})

beforeEach(() => {
  connections = {
    error: null,
    initialized: true,
    items: [baseConnection()],
    loadMore: vi.fn(async () => undefined),
    loading: false,
    loadingMore: false,
    nextCursor: null,
    refresh: vi.fn(async () => undefined),
  }
  paginationMock.usePagedApiList.mockReset()
  paginationMock.usePagedApiList.mockImplementation(() => connections)
  operationMock.confirm.mockReset()
  operationMock.create.mockReset()
  operationMock.revoke.mockReset()
  operationMock.rotate.mockReset()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  document.cookie = 'workmesh_locale=; Path=/; Max-Age=0'
})

describe('AgentConnectionsPanel collection authority', () => {
  it('uses the active locale for the Agent name placeholder', () => {
    document.cookie = 'workmesh_locale=zh-CN; Path=/'
    render(<LocaleProvider><AgentConnectionsPanel {...props()} /></LocaleProvider>)

    fireEvent.click(screen.getByRole('button', { name: '新建连接' }))

    expect(screen.getByLabelText('智能体名称')).toHaveAttribute('placeholder', '规划协调员')
  })

  it('removes stale detail and actions synchronously when the selected row leaves the successful collection', async () => {
    const { rerender } = render(<LocaleProvider><AgentConnectionsPanel {...props()} /></LocaleProvider>)
    expect(await screen.findByTestId('connection-diagnostic')).toBeVisible()

    connections.items = []
    rerender(<LocaleProvider><AgentConnectionsPanel {...props()} /></LocaleProvider>)

    expect(screen.queryByTestId('connection-diagnostic')).toBeNull()
    expect(screen.queryByRole('button', { name: '轮换凭据' })).toBeNull()
  })

  it('starts a new pending collection authority when the actor scope changes even if the old row was listed', async () => {
    let activeCollection = connections
    paginationMock.usePagedApiList.mockImplementation(() => activeCollection)
    const { rerender } = render(<LocaleProvider><AgentConnectionsPanel {...props()} /></LocaleProvider>)
    expect(await screen.findByTestId('connection-diagnostic')).toBeVisible()

    activeCollection = {
      ...connections,
      initialized: false,
      items: [],
      loading: true,
    }
    rerender(<LocaleProvider><AgentConnectionsPanel {...props({ authorityKey: 'workspace-2:human-1:admin' })} /></LocaleProvider>)

    expect(screen.queryByTestId('connection-diagnostic')).toBeNull()
    expect(screen.queryByRole('button', { name: '轮换凭据' })).toBeNull()
    expect(screen.getByRole('status', { name: '正在加载连接…' })).toBeVisible()
  })

  it('retains the exact detail through ordinary refresh failure but revokes it for own or context 403', async () => {
    const initialProps = props()
    const { rerender } = render(<LocaleProvider><AgentConnectionsPanel {...initialProps} /></LocaleProvider>)
    const detail = await screen.findByTestId('connection-diagnostic')

    connections.error = new TypeError('network refresh failed')
    rerender(<LocaleProvider><AgentConnectionsPanel {...initialProps} /></LocaleProvider>)
    expect(screen.getByTestId('connection-diagnostic')).toBe(detail)

    connections.error = null
    rerender(<LocaleProvider><AgentConnectionsPanel {...props({ contextError: new TypeError('context refresh failed') })} /></LocaleProvider>)
    expect(screen.getByTestId('connection-diagnostic')).toBe(detail)

    connections.error = new ApiError(403, 'forbidden')
    rerender(<LocaleProvider><AgentConnectionsPanel {...initialProps} /></LocaleProvider>)
    expect(screen.queryByTestId('connection-diagnostic')).toBeNull()

    connections.error = null
    rerender(<LocaleProvider><AgentConnectionsPanel {...props({ contextError: new ApiError(403, 'context forbidden') })} /></LocaleProvider>)
    expect(screen.queryByTestId('connection-diagnostic')).toBeNull()
  })

  it('revokes all connection detail synchronously when the authenticated actor is no longer an admin', async () => {
    const { rerender } = render(<LocaleProvider><AgentConnectionsPanel {...props()} /></LocaleProvider>)
    expect(await screen.findByTestId('connection-diagnostic')).toBeVisible()

    rerender(<LocaleProvider><AgentConnectionsPanel {...props({ admin: false })} /></LocaleProvider>)

    expect(screen.queryByTestId('connection-diagnostic')).toBeNull()
    expect(screen.queryByRole('button', { name: '轮换凭据' })).toBeNull()
  })

  it('marks the stable panel busy without replacing detail during own or context refresh', async () => {
    const initialProps = props()
    const { rerender } = render(<LocaleProvider><AgentConnectionsPanel {...initialProps} /></LocaleProvider>)
    const detail = await screen.findByTestId('connection-diagnostic')

    connections.loading = true
    rerender(<LocaleProvider><AgentConnectionsPanel {...props({ contextLoading: true })} /></LocaleProvider>)

    expect(screen.getAllByRole('region', { name: '连接' })[0]).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('connection-diagnostic')).toBe(detail)
  })

  it('keeps a committed rotation result when its post-commit refresh fails', async () => {
    const rotated = baseConnection({ revision: 2, status: 'rotating' })
    operationMock.rotate.mockResolvedValue({ connection: rotated, connect_url: 'https://safe.invalid/connect' })
    connections.refresh = vi.fn(async () => { connections.error = new TypeError('refresh failed') })
    render(<LocaleProvider><AgentConnectionsPanel {...props()} /></LocaleProvider>)
    await screen.findByTestId('connection-diagnostic')

    fireEvent.click(screen.getByRole('button', { name: '轮换凭据' }))

    expect(await screen.findByRole('button', { name: '确认完成轮换' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '轮换凭据' })).toBeNull()
    await waitFor(() => expect(connections.refresh).toHaveBeenCalledTimes(1))
  })

  it('lets a newer successful list revision replace an older committed local mutation result', async () => {
    const rotated = baseConnection({ revision: 2, status: 'rotating' })
    operationMock.rotate.mockResolvedValue({ connection: rotated, connect_url: 'https://safe.invalid/connect' })
    connections.refresh = vi.fn(async () => undefined)
    const { rerender } = render(<LocaleProvider><AgentConnectionsPanel {...props()} /></LocaleProvider>)
    await screen.findByTestId('connection-diagnostic')
    fireEvent.click(screen.getByRole('button', { name: '轮换凭据' }))
    expect(await screen.findByRole('button', { name: '确认完成轮换' })).toBeVisible()

    connections.items = [baseConnection({ revision: 3, status: 'active' })]
    rerender(<LocaleProvider><AgentConnectionsPanel {...props()} /></LocaleProvider>)

    expect(screen.getByRole('button', { name: '轮换凭据' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '确认完成轮换' })).toBeNull()
  })

  it('keeps a committed rotation confirmation when its post-commit refresh fails', async () => {
    connections.items = [baseConnection({ revision: 2, status: 'rotating' })]
    operationMock.confirm.mockResolvedValue(baseConnection({ revision: 3, status: 'active' }))
    connections.refresh = vi.fn(async () => { connections.error = new TypeError('refresh failed') })
    render(<LocaleProvider><AgentConnectionsPanel {...props()} /></LocaleProvider>)

    fireEvent.click(await screen.findByRole('button', { name: '确认完成轮换' }))

    expect(await screen.findByRole('button', { name: '轮换凭据' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '确认完成轮换' })).toBeNull()
    await waitFor(() => expect(connections.refresh).toHaveBeenCalledTimes(1))
  })

  it('keeps a committed revocation result when its post-commit refresh fails', async () => {
    operationMock.revoke.mockResolvedValue(undefined)
    connections.refresh = vi.fn(async () => { connections.error = new TypeError('refresh failed') })
    render(<LocaleProvider><AgentConnectionsPanel {...props()} /></LocaleProvider>)
    await screen.findByTestId('connection-diagnostic')

    fireEvent.click(screen.getByRole('button', { name: '撤销连接' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: '撤销连接' })).toBeNull())
    expect(screen.getByTestId('connection-diagnostic')).toBeVisible()
  })

  it('keeps a just-created result after refresh failure, then rebuilds detail without its one-time URL in a new authority scope', async () => {
    const created = baseConnection({
      id: 'connection-created',
      name: 'Created Agent',
      principal_human_actor_id: 'human-2',
      revision: 1,
      status: 'pending',
    })
    operationMock.create.mockResolvedValue({
      connect_url: 'https://safe.invalid/connect',
      connection: created,
      skill: { name: 'workmesh', sha256: 'a'.repeat(64), signature: 'safe', version: '1.0.0' },
    })
    connections.refresh = vi.fn(async () => { connections.error = new TypeError('refresh failed') })
    const initialProps = props({ humans: [
      { display_name: 'Ada', id: 'human-1' },
      { display_name: 'Grace', id: 'human-2' },
    ] })
    const { rerender } = render(<LocaleProvider><AgentConnectionsPanel {...initialProps} /></LocaleProvider>)
    await screen.findByTestId('connection-diagnostic')

    fireEvent.click(screen.getByRole('button', { name: '新建连接' }))
    fireEvent.change(screen.getByRole('textbox', { name: '智能体名称' }), { target: { value: 'Created Agent' } })
    fireEvent.change(screen.getByRole('textbox', { name: '智能体标识' }), { target: { value: 'created-agent' } })
    fireEvent.click(screen.getByRole('button', { name: '生成连接语句' }))

    await waitFor(() => expect(screen.getByTestId('connection-diagnostic')).toHaveTextContent('Created Agent'))
    expect(document.querySelector('.connection-instruction')).toHaveTextContent('https://safe.invalid/connect')

    connections.error = null
    connections.items = [created]
    rerender(<LocaleProvider><AgentConnectionsPanel {...initialProps} /></LocaleProvider>)
    expect(screen.getByTestId('connection-diagnostic')).toHaveTextContent('Created Agent')
    expect(document.querySelector('.connection-instruction')).toHaveTextContent('https://safe.invalid/connect')

    const newScopeConnections: PagedCollection<AgentConnection> = {
      ...connections,
      initialized: false,
      items: [],
      loading: true,
    }
    paginationMock.usePagedApiList.mockImplementation(() => newScopeConnections)
    rerender(<LocaleProvider><AgentConnectionsPanel {...props({
      authorityKey: 'workspace-2:human-1:admin',
      humans: initialProps.humans,
    })} /></LocaleProvider>)
    expect(screen.queryByTestId('connection-diagnostic')).toBeNull()
    expect(document.querySelector('.connection-instruction')).toBeNull()

    newScopeConnections.initialized = true
    newScopeConnections.items = [created]
    newScopeConnections.loading = false
    rerender(<LocaleProvider><AgentConnectionsPanel {...props({
      authorityKey: 'workspace-2:human-1:admin',
      humans: initialProps.humans,
    })} /></LocaleProvider>)
    expect(await screen.findByTestId('connection-diagnostic')).toHaveTextContent('Created Agent')
    expect(document.querySelector('.connection-instruction')).toBeNull()
  })
})
