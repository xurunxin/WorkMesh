// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../lib/i18n'
import { apiRequest } from '../lib/api'
import { usePagedApiList } from '../lib/pagination'
import { AgentWorkspace } from './agent-workspace'

vi.mock('../lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, apiRequest: vi.fn() }
})
vi.mock('../lib/pagination', () => ({
  LoadMoreButton: () => null,
  usePagedApiList: vi.fn(),
}))
vi.mock('../agent-session-detail', () => ({
  AgentSessionDetail: ({ sessionId }: { sessionId: string }) => <div data-testid="session-detail">{sessionId}</div>,
}))

const collection = {
  items: [{
    id: '11111111-1111-4111-8111-111111111111', agent_id: 'agent-1', agent_actor_id: 'actor-1', delegation_id: 'delegation-1', work_item_id: 'work-1',
    state: 'executing' as const, state_reason: null, revision: 3, current_plan_version_id: 'plan-1', context_snapshot_id: 'snapshot-1', budget: {}, last_heartbeat_at: '2026-08-28T01:00:00.000Z',
    stop_requested_at: null, error_code: null, error_summary: null, created_at: '2026-08-28T00:00:00.000Z', updated_at: '2026-08-28T01:00:00.000Z',
  }],
  nextCursor: null,
  initialized: true,
  loading: false,
  loadingMore: false,
  error: null,
  refresh: vi.fn(async () => undefined),
  loadMore: vi.fn(async () => undefined),
}

afterEach(cleanup)
beforeEach(() => {
  vi.mocked(apiRequest).mockReset()
  vi.mocked(usePagedApiList).mockReturnValue(collection)
  vi.mocked(apiRequest).mockResolvedValue({
    contextSnapshotId: 'snapshot-1',
    guidanceUris: ['https://docs.example.test/project'],
    guidancePins: [{ uri: 'https://docs.example.test/project', title: 'Project brief' }],
    workItem: { id: 'work-1', title: 'Authority-first workspace', team_key: 'GEN', number: 505 },
    plan: { id: 'plan-1', revision: 4, change_summary: 'Responsive human workspace', steps: [{ id: 'step-1', title: 'Render shared content', description: 'Use one safe renderer.', status: 'in_progress', ordinal: 1 }] },
  })
})

describe('AgentWorkspace', () => {
  it('connects the latest authoritative Session to context, plan, approvals and evidence surfaces', async () => {
    render(<LocaleProvider><AgentWorkspace agentId="agent-1" /></LocaleProvider>)

    expect(usePagedApiList).toHaveBeenCalledWith('/api/v1/agent-sessions?agentId=agent-1', { scopeKey: 'agent-1' })
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/v1/agent-sessions/11111111-1111-4111-8111-111111111111/context'))
    expect(await screen.findByText('Project brief')).toHaveAttribute('href', 'https://docs.example.test/project')
    expect(screen.getByText(/v4.*Responsive human workspace/)).toBeInTheDocument()
    expect(screen.getByText('Render shared content')).toBeInTheDocument()
    expect(screen.getByTestId('session-detail')).toHaveTextContent('11111111-1111-4111-8111-111111111111')
  })

  it('keeps an initialized empty collection distinct from loading', () => {
    vi.mocked(usePagedApiList).mockReturnValue({ ...collection, items: [] })
    render(<LocaleProvider><AgentWorkspace agentId="agent-empty" /></LocaleProvider>)
    expect(screen.getByText(/尚无可见 Session|no visible Sessions/i)).toBeInTheDocument()
    expect(apiRequest).not.toHaveBeenCalled()
  })
})
