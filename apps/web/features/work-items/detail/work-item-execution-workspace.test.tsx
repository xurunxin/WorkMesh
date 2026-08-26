// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkItemExecutionWorkspace } from './work-item-execution-workspace'
import type { WorkItemDetailModel } from './contracts'

const apiRequest = vi.hoisted(() => vi.fn())

vi.mock('../../../app/lib/api', () => ({ apiRequest }))
vi.mock('../../../app/lib/realtime', () => ({ useRealtimeSubscription: vi.fn() }))
vi.mock('../../../app/agent-run-timeline', () => ({ AgentRunTimeline: ({ sessionId }: { sessionId: string }) => <div>Timeline {sessionId}</div> }))

const model: WorkItemDetailModel = {
  id: 'work-1', key: 'GEN-1', revision: 4, title: 'Ship the governed workspace', description: '',
  workflowState: { id: 'started', name: 'In Progress', category: 'started' }, priority: 'high', dueDate: '', labels: [], projectId: 'project-1', milestoneId: null, parentId: null,
  responsibleHuman: { actorId: 'human-1', displayName: 'Human Owner' }, agentExecutions: [],
}

describe('WorkItemExecutionWorkspace', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (path: string) => path.includes('/execution-summary') ? {
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
      items: [{ id: 'v1:approval:00000000-0000-0000-0000-000000000001', title: 'Approve release', summary: 'Review the acceptance evidence.', impactSummary: 'Release is blocked until approval.' }], nextCursor: null,
    })
  })
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('renders responsibility, live execution, Human attention, and verified evidence from server projections', async () => {
    render(<WorkItemExecutionWorkspace model={model} onOpenAgent={vi.fn()} relationships={<p>Blocked by GEN-0</p>} />)

    expect(await screen.findByText('Human Owner')).toBeVisible()
    expect(screen.getByText('Codex')).toBeVisible()
    expect(screen.getByText('Run acceptance checks')).toBeVisible()
    expect(screen.getByText('Web tests passed')).toBeVisible()
    expect(screen.getByText('Approve release')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Review and respond' })).toHaveAttribute('href', expect.stringContaining('attentionSelected='))
    expect(screen.getByText('Verified')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Focused test report/ }))
    expect(screen.getByRole('dialog', { name: 'Focused test report' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open external evidence' })).toHaveAttribute('href', 'https://example.test/evidence')
    expect(screen.getByText('Blocked by GEN-0')).toBeVisible()
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2))
  })

  it('degrades a partial execution-summary payload to empty projections', async () => {
    apiRequest.mockImplementation(async (path: string) => path.includes('/execution-summary') ? { freshness: { state: 'partial' } } : { items: [] })
    render(<WorkItemExecutionWorkspace model={model} onOpenAgent={vi.fn()} />)

    expect(await screen.findByText('No active Run exists.')).toBeVisible()
    expect(screen.getByText('No evidence has been published.')).toBeVisible()
  })
})
