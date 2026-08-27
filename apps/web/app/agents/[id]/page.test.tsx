// @vitest-environment jsdom
import { Suspense } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../../lib/i18n'
import type { Agent } from '../../lib/agents'
import { ApiError, apiRequest } from '../../lib/api'
import AgentDetailPage from './page'

vi.mock('../../lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return { ...actual, apiRequest: vi.fn() }
})
vi.mock('../../lib/use-authenticated-actor', () => ({
  useAuthenticatedActor: () => ({
    actor: { id: 'human-1', display_name: 'Ada', workspace_id: 'workspace-1', workspace_role: 'admin' },
    loading: false,
    error: '',
    refresh: vi.fn(),
  }),
}))
vi.mock('../../realtime-status', () => ({ RealtimeStatus: () => null }))
vi.mock('../agent-workspace', () => ({ AgentWorkspace: ({ agentId }: { agentId: string }) => <div data-testid="agent-workspace">{agentId}</div> }))

afterEach(() => { cleanup() })
beforeEach(() => { vi.mocked(apiRequest).mockReset() })

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'agent-1', workspace_id: 'workspace-1', actor_id: 'actor-1', name: 'Coder Bot', slug: 'coder',
  description: 'Plans scoped work.', provider: 'openai', version: '1.2.3', supported_protocols: ['mcp'],
  skills: [], requested_capabilities: ['work:read'], approved_capabilities: ['work:read'], max_concurrency: 2,
  heartbeat_interval_seconds: 30, is_active: true, revision: 1, ...overrides,
})

function renderRoute(id: string) {
  const params = Promise.resolve({ id })
  Object.assign(params, { status: 'fulfilled', value: { id } })
  return render(<LocaleProvider><Suspense fallback={<p>route suspense</p>}><AgentDetailPage params={params} /></Suspense></LocaleProvider>)
}

describe('Agent detail route', () => {
  it('renders definition facts without claiming omitted Team Access is empty', async () => {
    vi.mocked(apiRequest).mockResolvedValue(agent())
    renderRoute('agent-1')

    expect(await screen.findByRole('heading', { name: 'Coder Bot' })).toBeInTheDocument()
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/agents/agent-1')
    expect(screen.getByRole('link', { name: /注册表|registry/i })).toHaveAttribute('href', '/agents?tab=agents')
    expect(screen.getByRole('link', { name: /Coder Bot/ })).toHaveAttribute('href', '/agents?tab=agents&teamAccessAgent=agent-1')
    expect(screen.queryByTestId('agent-team-access-projection')).toBeNull()
    expect(screen.getByTestId('agent-workspace')).toHaveTextContent('agent-1')
  })

  it('decodes the raw Next segment once, then encodes the logical id once for API and management URLs', async () => {
    vi.mocked(apiRequest).mockResolvedValue(agent({ id: 'agent/1' }))
    renderRoute('agent%2F1')
    await screen.findByRole('heading', { name: 'Coder Bot' })
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/agents/agent%2F1')
    expect(screen.getByRole('link', { name: /Coder Bot/ })).toHaveAttribute('href', '/agents?tab=agents&teamAccessAgent=agent%2F1')
  })

  it('displays the once-decoded logical id while its definition is loading', async () => {
    let resolveAgent: (value: Agent) => void = () => undefined
    const pending = new Promise<Agent>(resolve => { resolveAgent = resolve })
    vi.mocked(apiRequest).mockReturnValue(pending)
    renderRoute('agent%2F1')

    expect(screen.getByRole('heading', { name: 'agent/1' })).toBeInTheDocument()
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/agents/agent%2F1')
    await act(async () => { resolveAgent(agent()); await pending })
    expect(await screen.findByRole('heading', { name: 'Coder Bot' })).toBeInTheDocument()
  })

  it('round-trips an Agent id that contains the literal characters %2F without decoding twice', async () => {
    vi.mocked(apiRequest).mockResolvedValue(agent({ id: 'agent%2F1' }))
    renderRoute('agent%252F1')
    await screen.findByRole('heading', { name: 'Coder Bot' })
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/agents/agent%252F1')
    expect(screen.getByRole('link', { name: /Coder Bot/ })).toHaveAttribute('href', '/agents?tab=agents&teamAccessAgent=agent%252F1')
  })

  it('renders malformed percent encoding as a safe not-found state without requesting the API', async () => {
    renderRoute('agent%2')
    await waitFor(() => expect(document.querySelector('.wm-state-not_found')).not.toBeNull())
    expect(document.querySelector('.app-shell')).not.toBeNull()
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it('renders not-found and general errors inside AppShell', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(404, 'Agent not found'))
    const first = renderRoute('missing')
    await waitFor(() => expect(document.querySelector('.wm-state-not_found')).not.toBeNull())
    expect(document.querySelector('.app-shell')).not.toBeNull()
    first.unmount()

    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(500, 'Service unavailable'))
    renderRoute('broken')
    await waitFor(() => expect(document.querySelector('.wm-state-error')).not.toBeNull())
    expect(document.querySelector('.app-shell')).not.toBeNull()
  })
})
