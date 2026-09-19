// @vitest-environment jsdom
import { Suspense } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

const agentId = '10000000-0000-4000-8000-000000000001'
const agent = (overrides: Partial<Agent> = {}): Agent => ({
  id: agentId, workspace_id: '10000000-0000-4000-8000-000000000002', actor_id: '10000000-0000-4000-8000-000000000003', name: 'Coder Bot', slug: 'coder',
  description: 'Plans scoped work.', provider: 'openai', version: '1.2.3', supported_protocols: ['mcp'],
  icon: null, endpoint_url: null, skills: [], requested_capabilities: ['work:read'], approved_capabilities: ['work:read'], output_artifact_types: [], max_concurrency: 2,
  heartbeat_interval_seconds: 30, metadata: {}, team_access: [], is_active: true, lifecycle_status: 'active', revision: 1,
  archived_at: null, archived_by_actor_id: null, archived_reason: null, created_at: '2026-08-29T00:00:00.000Z', updated_at: '2026-08-29T00:00:00.000Z', ...overrides,
})

function renderRoute(id: string) {
  const params = Promise.resolve({ id })
  Object.assign(params, { status: 'fulfilled', value: { id } })
  return render(<LocaleProvider><Suspense fallback={<p>route suspense</p>}><AgentDetailPage params={params} /></Suspense></LocaleProvider>)
}

describe('Agent detail route', () => {
  it('renders validated definition facts and the authoritative empty Team Access projection', async () => {
    vi.mocked(apiRequest).mockResolvedValue(agent())
    renderRoute(agentId)

    expect(await screen.findByRole('heading', { name: 'Coder Bot' })).toBeInTheDocument()
    expect(apiRequest).toHaveBeenCalledWith(`/api/v1/agents/${agentId}`)
    expect(screen.getByRole('link', { name: /注册表|registry/i })).toHaveAttribute('href', '/agents?tab=agents')
    expect(screen.getByRole('link', { name: /Coder Bot/ })).toHaveAttribute('href', `/agents?tab=agents&teamAccessAgent=${agentId}`)
    expect(screen.getByTestId('agent-team-access-projection')).toBeInTheDocument()
    expect(screen.getByTestId('agent-workspace')).toHaveTextContent(agentId)
  })

  it('contains malformed Agent payloads as a retryable local error', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ ...agent(), supported_protocols: '{mcp}' })
    renderRoute(agentId)

    await waitFor(() => expect(document.querySelector('.wm-state-error')).not.toBeNull())
    expect(document.querySelector('.app-shell')).not.toBeNull()
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
