// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkItemExecutionWorkspace } from './work-item-execution-workspace'
import type { WorkItemDetailModel } from './contracts'
import { LocaleProvider } from '../../../app/lib/i18n'

const apiRequest = vi.hoisted(() => vi.fn())

vi.mock('../../../app/lib/api', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../app/lib/api')>()),
  apiRequest,
}))
vi.mock('../../../app/lib/realtime', () => ({ useRealtimeSubscription: vi.fn() }))
vi.mock('../../../app/agent-run-timeline', () => ({ AgentRunTimeline: ({ sessionId }: { sessionId: string }) => <div>Timeline {sessionId}</div> }))

const model: WorkItemDetailModel = {
  id: 'work-1', key: 'GEN-1', revision: 4, title: 'Ship the governed workspace', description: '',
  workflowState: { id: 'started', name: 'In Progress', category: 'started' }, priority: 'high', dueDate: '', labels: [], projectId: 'project-1', milestoneId: null, parentId: null,
  responsibleHuman: { actorId: 'human-1', displayName: 'Human Owner' }, agentExecutions: [],
}

const renderWorkspace = (relationships?: ReactNode) => render(
  <LocaleProvider>
    <WorkItemExecutionWorkspace model={model} onOpenAgent={vi.fn()} relationships={relationships} />
  </LocaleProvider>,
)

const attentionItem = {
  projectionVersion: 1,
  id: 'v1:approval:00000000-0000-4000-8000-000000000001',
  kind: 'approval', status: 'open', workspaceId: '00000000-0000-4000-8000-000000000002', teamId: null, projectId: null,
  workItemId: null, sessionId: '00000000-0000-4000-8000-000000000003', planVersionId: null, planStepId: null,
  title: 'Approve release', summary: 'Review the acceptance evidence.', summaryDerived: true,
  reasonCodes: ['approval.response_required'], severity: 'low', urgency: 'soon',
  requestedBy: { id: '00000000-0000-4000-8000-000000000004', kind: 'agent', displayName: 'Codex' },
  responsibleHuman: { id: '00000000-0000-4000-8000-000000000005', kind: 'human', displayName: 'Human Owner' },
  options: [{ id: 'approve', label: 'Approve', command: 'decideApproval', method: 'POST', path: '/api/v1/approvals/00000000-0000-4000-8000-000000000001/decide', targetRevision: 4, requiredCapabilities: ['work:write'], requiredActorKinds: ['human'], requiresApproval: false }],
  recommendedOptionId: 'approve', audience: { relationship: 'assigned_to_me', canRespond: true },
  response: { workflow: 'approval', requiresReason: false, requiresMessage: false, choices: [], expectedStatus: 'decided' },
  bulk: { eligible: false, compatibilityKey: null, prohibitedReason: 'bulk.exact_payload_required', revalidateIndividually: true },
  impactSummary: 'Release is blocked until approval.', affectedResources: [], evidence: [], expiresAt: '2099-08-28T00:00:00.000Z',
  sourceRevision: 4, source: { type: 'approval', id: '00000000-0000-4000-8000-000000000001', status: 'pending' },
  freshness: { state: 'current', observedAt: '2026-08-28T00:00:00.000Z', sourceUpdatedAt: '2026-08-28T00:00:00.000Z' },
  correlationId: 'work-item-test', createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z',
} as const

describe('WorkItemExecutionWorkspace', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (path: string) => path.includes('/api/v1/approvals/')
      ? Promise.reject(new Error('Approval detail unavailable in this partial fixture'))
      : path.includes('/execution-summary') ? {
      projectionVersion: 1,
      workItem: { id: model.id, title: model.title, revision: model.revision, status: 'started' },
      activeRuns: [{
        id: 'run-1', kind: 'session', title: 'Implement governed workspace', summary: 'Validation is running.', projectId: 'project-1', workItemId: model.id, sessionId: 'session-1', state: 'executing', revision: 7,
        source: { type: 'session', id: 'session-1', revision: 7 }, responsibleHuman: { id: 'human-1', kind: 'human', displayName: 'Human Owner' }, activeAgent: { id: 'agent-1', kind: 'agent', displayName: 'Codex' }, workItem: { id: model.id, title: model.title },
        currentStep: { id: 'step-1', title: 'Run acceptance checks', status: 'in_progress', ordinal: 2 }, health: { heartbeat: 'healthy', lastHeartbeatAt: '2026-08-27T01:00:00.000Z' },
        lastActivity: { id: 'activity-1', kind: 'validation', summary: 'Web tests passed', createdAt: '2026-08-27T01:00:00.000Z' }, pendingHumanActionCount: 1, evidenceCount: 1, verified: true, updatedAt: '2026-08-27T01:00:00.000Z',
      }],
      recentRuns: [],
      evidence: [{ id: 'evidence-1', type: 'test_result', title: 'Focused test report', uri: 'https://example.test/evidence', summary: 'Tests passed' }],
      freshness: { state: 'current', observedAt: '2026-08-27T01:00:00.000Z', sourceUpdatedAt: '2026-08-27T01:00:00.000Z' },
    } : {
      items: [attentionItem], nextCursor: null,
    })
  })
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('renders responsibility, live execution, Human attention, and verified evidence from server projections', async () => {
    renderWorkspace(<p>Blocked by GEN-0</p>)

    expect(await screen.findByText('Human Owner')).toBeVisible()
    expect(screen.getByText('Codex')).toBeVisible()
    expect(screen.getByText('Run acceptance checks')).toBeVisible()
    expect(screen.getByText('Web tests passed')).toBeVisible()
    expect(screen.getByText('Approve release')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Full decision context' })).toHaveAttribute('href', expect.stringContaining('attentionSelected='))
    expect(screen.getByText('Verified')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Focused test report/ }))
    expect(screen.getByRole('dialog', { name: 'Focused test report' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open external evidence' })).toHaveAttribute('href', 'https://example.test/evidence')
    expect(screen.getByText('Blocked by GEN-0')).toBeVisible()
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(3))
  })

  it('degrades a partial execution-summary payload to empty projections', async () => {
    apiRequest.mockImplementation(async (path: string) => path.includes('/execution-summary') ? { freshness: { state: 'partial' } } : { items: [] })
    renderWorkspace()

    expect(await screen.findByText('No active Run exists.')).toBeVisible()
    expect(screen.getByText('No evidence has been published.')).toBeVisible()
  })

  it('scans later attention pages when an earlier open row is not actionable for the viewer', async () => {
    const blocked = { ...attentionItem, id: 'v1:approval:00000000-0000-4000-8000-000000000006', audience: { ...attentionItem.audience, canRespond: false } }
    const attentionPaths: string[] = []
    apiRequest.mockImplementation(async (path: string) => {
      if (path.includes('/execution-summary')) return {
        projectionVersion: 1,
        workItem: { id: model.id, title: model.title, revision: model.revision, status: 'started' },
        activeRuns: [], recentRuns: [], evidence: [], freshness: { state: 'current', observedAt: '2026-08-28T00:00:00.000Z', sourceUpdatedAt: '2026-08-28T00:00:00.000Z' },
      }
      if (path.includes('/human-attention?status=open')) {
        attentionPaths.push(path)
        return path.includes('cursor=next-open')
          ? { items: [attentionItem], nextCursor: null }
          : { items: [blocked], nextCursor: 'next-open' }
      }
      if (path.includes('/api/v1/approvals/')) return Promise.reject(new Error('Approval detail unavailable in this partial fixture'))
      return { items: [] }
    })
    renderWorkspace()

    expect(await screen.findByText('Approve release')).toBeVisible()
    expect(attentionPaths).toHaveLength(2)
    expect(attentionPaths[0]).toContain('limit=100')
    expect(attentionPaths[1]).toContain('cursor=next-open')
  })
})
