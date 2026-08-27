// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { humanAttentionItemSchema, type HumanAttentionItem } from '@workmesh/contracts'
import { AttentionCenter } from './attention-center'
import { LocaleProvider } from './lib/i18n'
import { apiMutation, apiRequest } from './lib/api'

vi.mock('./lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('./lib/api')>()
  return { ...actual, apiMutation: vi.fn(), apiRequest: vi.fn() }
})
vi.mock('./lib/realtime', () => ({
  useRealtimeConnectionState: () => 'connected',
  useRealtimeSubscription: vi.fn(),
}))
vi.mock('./lib/product-telemetry', () => ({
  productMetricError: () => 'none',
  recordProductMetric: vi.fn(),
  startProductMetric: () => vi.fn(),
}))

const uuid = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`

const attention = (): HumanAttentionItem => humanAttentionItemSchema.parse({
  projectionVersion: 1,
  id: `v1:approval:${uuid(1)}`,
  kind: 'approval',
  status: 'open',
  workspaceId: uuid(2),
  teamId: uuid(3),
  projectId: uuid(4),
  workItemId: uuid(5),
  sessionId: uuid(6),
  planVersionId: null,
  planStepId: null,
  title: 'Publish release evidence',
  summary: 'The Agent needs authority to publish the verified release evidence.',
  summaryDerived: true,
  reasonCodes: ['approval.response_required'],
  severity: 'low',
  urgency: 'soon',
  requestedBy: { id: uuid(7), kind: 'agent', displayName: 'Release Agent' },
  responsibleHuman: { id: uuid(8), kind: 'human', displayName: 'Release Owner' },
  options: [
    { id: 'approve', label: 'Approve', command: 'decideApproval', method: 'POST', path: `/api/v1/approvals/${uuid(1)}/decide`, targetRevision: 4, requiredCapabilities: ['work:write'], requiredActorKinds: ['human'], requiresApproval: false },
    { id: 'reject', label: 'Reject', command: 'decideApproval', method: 'POST', path: `/api/v1/approvals/${uuid(1)}/decide`, targetRevision: 4, requiredCapabilities: ['work:write'], requiredActorKinds: ['human'], requiresApproval: false },
  ],
  recommendedOptionId: 'approve',
  audience: { relationship: 'assigned_to_me', canRespond: true },
  response: { workflow: 'approval', requiresReason: false, requiresMessage: false, choices: [], expectedStatus: 'decided' },
  bulk: { eligible: true, compatibilityKey: 'approval:payload', prohibitedReason: null, revalidateIndividually: true },
  impactSummary: 'Publishing remains blocked until a Human decides.',
  affectedResources: [{ type: 'work_item', id: uuid(5) }],
  evidence: [],
  expiresAt: '2099-08-28T00:00:00.000Z',
  sourceRevision: 4,
  source: { type: 'approval', id: uuid(1), status: 'pending' },
  freshness: { state: 'current', observedAt: '2026-08-28T00:00:00.000Z', sourceUpdatedAt: '2026-08-28T00:00:00.000Z' },
  correlationId: 'approval-journey',
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
})

const approvalRead = (overrides: Record<string, unknown> = {}) => ({
  id: uuid(1), session_id: uuid(6), approval_type: 'release', action_name: 'Publish release evidence',
  action_payload_sanitized: { projectId: uuid(4), release: 'm6' }, action_payload_hash: `sha256:${'a'.repeat(64)}`,
  risk_level: 'low', rationale_summary: 'Publish verified evidence.', required_approvals: 1, status: 'pending',
  expires_at: '2099-08-28T00:00:00.000Z', consumed_at: null, revision: 4,
  created_at: '2026-08-28T00:00:00.000Z', updated_at: '2026-08-28T00:00:00.000Z', decisions: [],
  quorum: { required: 1, approved: 0, rejected: 0, reached: false },
  viewer_actionability: { status: 'actionable', allowed_decisions: ['approved', 'rejected'] },
  ...overrides,
})

describe('Human Attention inline approval', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockImplementation(async (path: string) => path.includes('/api/v1/approvals/')
      ? approvalRead()
      : { items: [attention()], nextCursor: null })
    vi.mocked(apiMutation).mockResolvedValue({
      approval: {
        id: uuid(1), session_id: uuid(6), approval_type: 'release', action_name: 'Publish release evidence', risk_level: 'low',
        rationale_summary: 'Publish verified evidence.', status: 'approved', revision: 5, expires_at: '2099-08-28T00:00:00.000Z', created_at: '2026-08-28T00:00:00.000Z',
        viewer_actionability: { status: 'blocked', reason: 'already_decided' },
      },
      decision: { actor_id: uuid(8), decision: 'approved', reason: 'Human approved without additional requirements', source: 'human', policy_workspace_id: null, policy_revision: null, decided_at: '2026-08-28T00:01:00.000Z' },
      quorum: { required: 1, approved: 1, rejected: 0, reached: true },
      status: 'approved',
    })
  })
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('offers direct decisions without a required text field', async () => {
    render(<LocaleProvider><AttentionCenter actor={{ id: uuid(8), workspace_id: uuid(2), workspace_role: 'member' }} /></LocaleProvider>)

    fireEvent.click(await screen.findByRole('button', { name: /Review and respond|查看与处理/ }))
    expect(await screen.findByRole('button', { name: /Approve$|^通过$/ })).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Approve$|^通过$/ }))

    await waitFor(() => expect(apiMutation).toHaveBeenCalled())
    expect(JSON.parse(String(vi.mocked(apiMutation).mock.calls[0]?.[2]?.body))).toEqual({
      decision: 'approved',
      reason: 'Human approved without additional requirements',
    })
    expect(await screen.findByText(/Approval decision recorded|已记录通过决定/)).toBeVisible()
  })

  it('sends approve-with-requirements as the immutable approval reason', async () => {
    render(<LocaleProvider><AttentionCenter actor={{ id: uuid(8), workspace_id: uuid(2), workspace_role: 'member' }} /></LocaleProvider>)

    fireEvent.click(await screen.findByRole('button', { name: /Review and respond|查看与处理/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Other feedback|其他意见/ }))
    fireEvent.change(screen.getByLabelText(/Decision information for the Agent|给 Agent 的决定信息/), { target: { value: 'Keep rollback evidence attached.' } })
    fireEvent.click(screen.getByRole('button', { name: /Approve with requirements|通过并附带要求/ }))

    await waitFor(() => expect(apiMutation).toHaveBeenCalled())
    expect(JSON.parse(String(vi.mocked(apiMutation).mock.calls[0]?.[2]?.body))).toEqual({
      decision: 'approved',
      reason: 'Keep rollback evidence attached.',
    })
  })

  it('keeps decisions fail-closed until the complete Approval scope is loaded', async () => {
    let resolveApproval: ((value: ReturnType<typeof approvalRead>) => void) | undefined
    const pendingApproval = new Promise<ReturnType<typeof approvalRead>>(resolve => { resolveApproval = resolve })
    vi.mocked(apiRequest).mockImplementation(async (path: string) => path.includes('/api/v1/approvals/')
      ? pendingApproval
      : { items: [attention()], nextCursor: null })
    render(<LocaleProvider><AttentionCenter actor={{ id: uuid(8), workspace_id: uuid(2), workspace_role: 'member' }} /></LocaleProvider>)

    fireEvent.click(await screen.findByRole('button', { name: /Review and respond|查看与处理/ }))
    expect(await screen.findByText(/Loading authoritative approval scope|正在加载权威审批范围/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /Approve$|^通过$/ })).not.toBeInTheDocument()

    resolveApproval?.(approvalRead())
    expect(await screen.findByRole('button', { name: /Approve$|^通过$/ })).toBeVisible()
  })

  it('keeps decisions disabled and offers retry when the full Approval read fails', async () => {
    vi.mocked(apiRequest).mockImplementation(async (path: string) => {
      if (path.includes('/api/v1/approvals/')) throw new Error('approval detail unavailable')
      return { items: [attention()], nextCursor: null }
    })
    render(<LocaleProvider><AttentionCenter actor={{ id: uuid(8), workspace_id: uuid(2), workspace_role: 'member' }} /></LocaleProvider>)

    fireEvent.click(await screen.findByRole('button', { name: /Review and respond|查看与处理/ }))
    expect(await screen.findByText(/complete approval scope could not be loaded|无法加载完整审批范围/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /Approve$|^通过$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry|重试/ })).toBeVisible()
  })
})
