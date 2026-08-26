// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecoveryItem } from '@workmesh/contracts'
import type { PagedCollection } from './lib/pagination'
import { RecoveryCenter } from './recovery-center'

const paginationMock = vi.hoisted(() => ({ usePagedApiList: vi.fn() }))
const realtimeMock = vi.hoisted(() => ({ state: 'connected', callback: undefined as undefined | ((value: { reason: 'resync' | 'event' }) => unknown) }))
vi.mock('./lib/pagination', async importOriginal => ({ ...(await importOriginal<typeof import('./lib/pagination')>()), usePagedApiList: paginationMock.usePagedApiList }))
vi.mock('./lib/realtime', () => ({
  useRealtimeConnectionState: () => realtimeMock.state,
  useRealtimeSubscription: (_resources: unknown, callback: typeof realtimeMock.callback) => { realtimeMock.callback = callback },
}))
vi.mock('./agent-control-dialog', () => ({ AgentControlDialog: ({ open }: { open: boolean }) => open ? <div>Governed control preview</div> : null }))
vi.mock('./lib/i18n', () => ({ useLocale: () => ({ locale: 'en' }) }))

const id = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const item: RecoveryItem = {
  projectionVersion: 1, id: `v1:session_failed:${id(1)}`, condition: 'session_failed', lifecycle: 'active', severity: 'high',
  title: 'Agent Session failed', summary: 'Validation worker exited.', happenedAt: '2026-08-27T01:00:00.000Z',
  scope: { workspaceId: id(2), teamId: id(3), projectId: id(4), projectName: 'Runtime Reliability', workItemId: id(5), workItemTitle: 'Recover execution', sessionId: id(6), planStepId: id(7), responsibleHuman: { id: id(8), kind: 'human', displayName: 'Owner' } },
  source: { type: 'agent_session', id: id(1), status: 'failed', revision: 4, eventCursor: '91', updatedAt: '2026-08-27T01:00:00.000Z' },
  freshness: { state: 'current', observedAt: '2026-08-27T01:01:00.000Z', sourceUpdatedAt: '2026-08-27T01:00:00.000Z' },
  executor: { state: 'terminal_only_assignment', active: false, agent: { id: id(9), kind: 'agent', displayName: 'Runtime Agent' }, delegationId: id(10), delegationStatus: 'active', sessionState: 'failed', connectionStatus: 'active' },
  lease: { id: null, status: 'none', version: null, expiresAt: null }, authority: { sessionState: 'failed', delegationStatus: 'active', connectionStatus: 'active', currentStateRequired: true },
  preservedWork: { artifacts: [{ type: 'commit', id: id(11), title: 'Commit abc123', status: 'produced' }], messages: 3, contextSnapshotId: id(12), uncommitted: 'unknown', uncommittedExplanation: 'Only durable facts are preserved.' },
  attempts: { used: 2, limit: 3, remaining: 1, circuitBreaker: 'closed' }, downstreamImpact: 'Dependent work remains blocked.', recommendedActionId: 'retry',
  actions: [
    { id: 'retry', kind: 'retry', label: 'Preview and Retry', method: 'POST', path: `/api/v1/agent-sessions/${id(6)}/retry`, consequencePreviewPath: `/api/v1/agent-sessions/${id(6)}/control-preview`, dangerous: true, requiresCurrent: true, requiredCapabilities: ['work:write'], requiresApproval: false, requiresReason: true, tradeoff: 'Creates a distinct Session.' },
    { id: 'open_run', kind: 'open_run', label: 'Open Run details', method: 'GET', path: `/agent-sessions/${id(6)}`, consequencePreviewPath: null, dangerous: false, requiresCurrent: false, requiredCapabilities: ['work:read'], requiresApproval: false, requiresReason: false, tradeoff: 'Read only.' },
  ], technicalDetailsPath: `/api/v1/recovery-items/v1:session_failed:${id(1)}`,
}

function collection(items: RecoveryItem[]): PagedCollection<RecoveryItem> {
  return { items, nextCursor: null, initialized: true, loading: false, loadingMore: false, error: null, refresh: vi.fn(async () => undefined), loadMore: vi.fn(async () => undefined) }
}

beforeEach(() => {
  window.history.replaceState({}, '', '/?view=recovery&recoveryLifecycle=active')
  realtimeMock.state = 'connected'; realtimeMock.callback = undefined
  paginationMock.usePagedApiList.mockReset(); paginationMock.usePagedApiList.mockReturnValue(collection([item]))
})
afterEach(cleanup)

describe('RecoveryCenter', () => {
  it('distinguishes terminal-only assignment and opens preserved recovery context', () => {
    render(<RecoveryCenter actor={{ id: id(8), workspace_id: id(2), workspace_role: 'admin' }} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Session failed/ }))
    expect(screen.getAllByText(/Terminal-only assignment/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Commit abc123/)).toBeVisible()
    expect(screen.getByText(/Only durable facts are preserved/)).toBeVisible()
    expect(window.location.search).toContain('recoveryItem=')
    fireEvent.click(screen.getByRole('button', { name: 'Preview and Retry' }))
    expect(screen.getByText('Governed control preview')).toBeVisible()
  })

  it('keeps read-only context available but disables current-state actions offline', () => {
    realtimeMock.state = 'offline'
    render(<RecoveryCenter actor={{ id: id(8), workspace_id: id(2), workspace_role: 'admin' }} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Session failed/ }))
    expect(screen.getByRole('button', { name: 'Preview and Retry' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Open Run details' })).toHaveAttribute('href', `/agent-sessions/${id(6)}`)
    expect(screen.getByText(/requires a current projection/)).toBeVisible()
  })
})
