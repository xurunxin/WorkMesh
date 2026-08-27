// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovalsTable, type ApprovalsTableProps } from './approvals-table'
import type { Agent, AgentSession, Approval } from '../lib/agents'
import type { AgentsCopy } from '../lib/i18n'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const baseApproval = (overrides: Partial<Approval> = {}): Approval => ({
  id: 'approval-1',
  session_id: 'session-1',
  approval_type: 'merge_pull_request',
  action_name: 'Merge PR #42',
  action_payload_sanitized: { repository: 'acme/workmesh', workItemId: 'work-item-12345678', note: '<b>text only</b>' },
  action_payload_hash: `sha256:${'a'.repeat(64)}`,
  risk_level: 'high',
  rationale_summary: 'Squash merges a platform-blocking change.',
  status: 'pending',
  revision: 1,
  expires_at: '2099-08-23T00:00:00.000Z',
  created_at: '2026-08-22T22:00:00.000Z',
  viewer_actionability: { status: 'actionable', allowed_decisions: ['approved', 'rejected'] },
  ...overrides,
})

function copy(): AgentsCopy {
  return {
    agents: 'Agents',
    selectAllApprovals: 'Select all on this page',
    approvalRowCheckbox: (actionName: string) => `Select approval: ${actionName}`,
    selectedApprovalsCount: (count: number) => `${count} selected`,
    clearSelection: 'Clear selection',
    approveSelected: 'Approve selected',
    rejectSelected: 'Reject selected',
    bulkApproveError: 'Unable to approve the selected approvals.',
    bulkRejectError: 'Unable to reject the selected approvals.',
    approvalTableAriaLabel: 'Pending approvals',
    approvalBulkActions: 'Bulk approval actions',
    approvalColumnAction: 'Action',
    approvalColumnRisk: 'Risk',
    approvalColumnRationale: 'Rationale',
    approvalColumnExpires: 'Expires',
    approvalColumnSession: 'Session',
    approvalColumnDecision: 'Decision',
    approvalDecisionActions: actionName => `Approval actions for ${actionName}`,
    approvalApprove: 'Approve',
    approvalReject: 'Reject',
    approvalOtherFeedback: 'Other feedback',
    approvalApproveWithRequirements: 'Approve with requirements',
    approvalRejectWithFeedback: 'Reject with feedback',
    approvalFeedbackLabel: 'Decision information for the Agent',
    approvalFeedbackPlaceholder: 'Describe requirements',
    approvalFeedbackRequired: 'Enter feedback.',
    approvalCancel: 'Cancel',
    approvalConfirmDecisionTitle: 'Confirm high-risk approval scope',
    approvalConfirmScope: (actionName, risk) => `Confirm ${actionName} (${risk}).`,
    approvalConfirmApprove: 'Confirm approval',
    approvalConfirmReject: 'Confirm rejection',
    approvalDecisionWorking: 'Submitting…',
    approvalDecisionRecorded: decision => `${decision} recorded`,
    approvalDecisionQuorum: (approved, required) => `${approved}/${required} approvals`,
    approvalUnavailable: 'Unavailable',
    approvalBlockedReason: reason => `Blocked: ${reason}`,
    approvalDecisionFailure: kind => `Failed: ${kind}`,
    approvalRetry: 'Retry',
    riskLabel: (risk: string) => `${risk} risk`,
    reviewSession: 'Review session and evidence',
    approvalPayloadLabel: 'Sanitized scope and payload',
    approvalContextLabel: 'Approval context',
    approvalEvidenceLink: 'View evidence',
    workItemLabel: (id: string) => `Work item ${id}`,
    noApprovals: 'No pending approvals.',
  } as AgentsCopy
}

function renderTable(overrides: Partial<ApprovalsTableProps> = {}) {
  const props: ApprovalsTableProps = {
    approvals: [baseApproval()],
    bulkBusy: false,
    copy: copy(),
    decisionStates: {},
    onClear: vi.fn(),
    onDecide: vi.fn(),
    onDecideApproval: vi.fn(async () => true),
    onToggle: vi.fn(),
    onToggleAll: vi.fn(),
    selectedIds: new Set(),
    ...overrides,
  }
  return { ...render(<ApprovalsTable {...props} />), props }
}

describe('ApprovalsTable', () => {
  it('renders an empty state with no approval grid', () => {
    const { container } = renderTable({ approvals: [] })
    expect(screen.getByText('No pending approvals.')).toBeInTheDocument()
    expect(container.querySelector('.approval-grid')).toBeNull()
  })

  it('shows direct decisions on every actionable row before any bulk selection', () => {
    renderTable({ approvals: [
      baseApproval({ id: 'a-1', action_name: 'Merge PR #42', risk_level: 'low' }),
      baseApproval({ id: 'a-2', action_name: 'Rotate key', risk_level: 'medium' }),
    ] })

    expect(screen.getByRole('columnheader', { name: 'Decision' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Other feedback' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Approve selected' })).not.toBeInTheDocument()
  })

  it('keeps Agent, WorkItem, Session, and evidence context next to the decision', () => {
    renderTable({
      agents: [{ id: 'agent-1', name: 'Planner Agent' } as Agent],
      sessions: [{ id: 'session-1', agent_id: 'agent-1', work_item_id: 'work-item-12345678' } as AgentSession],
    })

    expect(screen.getByText('Agents: Planner Agent')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Work item work-ite' })).toHaveAttribute('href', '/?workItemId=work-item-12345678')
    expect(screen.getByRole('link', { name: 'Session session-' })).toHaveAttribute('href', '/agent-sessions/session-1')
    expect(screen.getByRole('link', { name: 'View evidence' })).toHaveAttribute('href', '/agent-sessions/session-1?tab=artifacts')
  })

  it('shows the exact sanitized payload as escaped text beside the decision', () => {
    renderTable({ approvals: [baseApproval({ risk_level: 'low' })] })

    expect(screen.getByTestId('approval-scope-approval-1')).toBeInTheDocument()
    expect(screen.getByTestId('approval-payload-approval-1')).toHaveTextContent('acme/workmesh')
    expect(screen.getByTestId('approval-payload-approval-1')).toHaveTextContent('<b>text only</b>')
    expect(screen.getByTestId('approval-payload-approval-1').querySelector('b')).toBeNull()
    expect(screen.getByText(`sha256:${'a'.repeat(64)}`)).toBeInTheDocument()
  })

  it('shows why a server-blocked approval cannot be decided and excludes it from bulk selection', () => {
    renderTable({ approvals: [baseApproval({
      viewer_actionability: { status: 'blocked', reason: 'session_inactive' },
    })] })

    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.getByText('Blocked: session_inactive')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('approval-checkbox-approval-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('approval-select-all')).toBeDisabled()
  })

  it('keeps a recorded viewer decision visible while quorum waits after refresh', () => {
    renderTable({ approvals: [baseApproval({
      viewer_actionability: { status: 'blocked', reason: 'viewer_already_decided' },
      decisions: [{
        actor_id: 'human-1',
        decision: 'approved',
        reason: 'Keep rollback evidence attached before proceeding.',
        source: 'human',
        policy_workspace_id: null,
        policy_revision: null,
        decided_at: '2026-08-23T00:01:00.000Z',
      }],
      quorum: { required: 2, approved: 1, rejected: 0, reached: false },
    })] })

    expect(screen.getByText('1/2 approvals')).toBeInTheDocument()
    expect(screen.getByTestId('approval-decision-reason-approval-1')).toHaveTextContent('Keep rollback evidence attached before proceeding.')
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('approval-checkbox-approval-1')).not.toBeInTheDocument()
  })

  it('keeps current approvals actionable only with an authoritative projection and blocks expired rows', () => {
    renderTable({ approvals: [
      baseApproval({ id: 'current', action_name: 'Current action', risk_level: 'low' }),
      baseApproval({ id: 'expired', action_name: 'Expired action', expires_at: '2020-01-01T00:00:00.000Z' }),
    ] })

    expect(screen.getByTestId('approval-checkbox-current')).toBeInTheDocument()
    expect(screen.queryByTestId('approval-checkbox-expired')).not.toBeInTheDocument()
    expect(screen.getByText('Blocked: expired')).toBeInTheDocument()
  })

  it('submits a low-risk quick approval without requiring text', async () => {
    const onDecideApproval = vi.fn(async () => true)
    renderTable({ approvals: [baseApproval({ risk_level: 'low' })], onDecideApproval })

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(onDecideApproval).toHaveBeenCalledWith(expect.objectContaining({ id: 'approval-1' }), 'approved', undefined))
    expect(screen.queryByText('Confirm high-risk approval scope')).not.toBeInTheDocument()
  })

  it('requires a scope confirmation for high and critical risk quick decisions', async () => {
    const onDecideApproval = vi.fn(async () => true)
    renderTable({ onDecideApproval })

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByText('Confirm high-risk approval scope')).toBeInTheDocument()
    expect(screen.getByTestId('approval-confirm-payload-approval-1')).toHaveTextContent('acme/workmesh')
    expect(screen.getByTestId('approval-confirm-payload-approval-1')).toHaveTextContent('<b>text only</b>')
    expect(screen.getByTestId('approval-confirm-payload-approval-1').querySelector('b')).toBeNull()
    expect(screen.getAllByText(`sha256:${'a'.repeat(64)}`).length).toBeGreaterThan(0)
    expect(onDecideApproval).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))

    await waitFor(() => expect(onDecideApproval).toHaveBeenCalledWith(expect.anything(), 'approved', undefined))
  })

  it('requires feedback and submits approve-with-requirements immediately', async () => {
    const onDecideApproval = vi.fn(async () => true)
    renderTable({ approvals: [baseApproval({ risk_level: 'low' })], onDecideApproval })

    fireEvent.click(screen.getByRole('button', { name: 'Other feedback' }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve with requirements' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter feedback.')

    fireEvent.change(screen.getByLabelText('Decision information for the Agent'), { target: { value: 'Keep rollback evidence.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve with requirements' }))

    await waitFor(() => expect(onDecideApproval).toHaveBeenCalledWith(expect.anything(), 'approved', 'Keep rollback evidence.'))
  })

  it('announces a per-row error and retries only that decision', async () => {
    const onDecideApproval = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const approval = baseApproval({ risk_level: 'low' })
    const { rerender, props } = renderTable({ approvals: [approval], onDecideApproval })

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    rerender(<ApprovalsTable {...props} decisionStates={{
      [approval.id]: { status: 'error', decision: 'rejected', message: 'Network failed.', retryable: true },
    }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Network failed.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(onDecideApproval).toHaveBeenNthCalledWith(2, expect.anything(), 'rejected', undefined))
  })

  it('moves keyboard focus to the durable result after a successful decision', async () => {
    const onDecideApproval = vi.fn(async () => true)
    const approval = baseApproval({ risk_level: 'low' })
    const { rerender, props } = renderTable({ approvals: [approval], onDecideApproval })

    const approveButton = screen.getByRole('button', { name: 'Approve' })
    approveButton.focus()
    fireEvent.click(approveButton)
    await waitFor(() => expect(onDecideApproval).toHaveBeenCalledOnce())

    rerender(<ApprovalsTable {...props} decisionStates={{
      [approval.id]: { status: 'success', decision: 'approved', message: 'Approval recorded.' },
    }} />)

    await waitFor(() => expect(screen.getByTestId('approval-decision-status-approval-1')).toHaveFocus())
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('moves focus to the next actionable approval when a successful row is removed on refresh', async () => {
    const first = baseApproval({ id: 'first', action_name: 'First action', risk_level: 'low' })
    const second = baseApproval({ id: 'second', action_name: 'Second action', risk_level: 'low' })
    const { rerender, props } = renderTable({ approvals: [first, second] })

    rerender(<ApprovalsTable {...props} decisionStates={{
      [first.id]: { status: 'success', decision: 'approved', message: 'Approval recorded.' },
    }} />)
    await waitFor(() => expect(screen.getByTestId(`approval-decision-status-${first.id}`)).toHaveFocus())

    rerender(<ApprovalsTable {...props} approvals={[second]} />)
    await waitFor(() => expect(screen.getByTestId(`approval-row-${second.id}`).querySelector('.approval-row-actions button')).toHaveFocus())
    expect(document.body).not.toHaveFocus()
  })

  it('focuses the stable approval region when the last successful row is removed', async () => {
    const approval = baseApproval({ id: 'last', risk_level: 'low' })
    const { rerender, props } = renderTable({ approvals: [approval] })

    rerender(<ApprovalsTable {...props} decisionStates={{
      [approval.id]: { status: 'success', decision: 'approved', message: 'Approval recorded.' },
    }} />)
    await waitFor(() => expect(screen.getByTestId(`approval-decision-status-${approval.id}`)).toHaveFocus())

    rerender(<ApprovalsTable {...props} approvals={[]} />)
    await waitFor(() => expect(screen.getByRole('region', { name: 'Pending approvals' })).toHaveFocus())
    expect(document.body).not.toHaveFocus()
  })

  it('returns focus to the feedback opener after canceling elevated-risk confirmation', () => {
    vi.useFakeTimers()
    renderTable({ approvals: [baseApproval({ risk_level: 'high' })] })

    const feedbackOpener = screen.getByRole('button', { name: 'Other feedback' })
    feedbackOpener.focus()
    fireEvent.click(feedbackOpener)
    fireEvent.change(screen.getByLabelText('Decision information for the Agent'), { target: { value: 'Keep rollback evidence.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve with requirements' }))
    expect(screen.getByText('Confirm high-risk approval scope')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    act(() => { vi.runOnlyPendingTimers() })
    expect(screen.getByRole('button', { name: 'Other feedback' })).toHaveFocus()
  })

  it('focuses the quorum status when an approval becomes blocked without unmounting', async () => {
    const approval = baseApproval({ id: 'quorum', risk_level: 'low' })
    const { rerender, props } = renderTable({ approvals: [approval] })

    rerender(<ApprovalsTable {...props} decisionStates={{
      [approval.id]: { status: 'success', decision: 'approved', message: 'Approval recorded.' },
    }} />)
    await waitFor(() => expect(screen.getByTestId(`approval-decision-status-${approval.id}`)).toHaveFocus())

    rerender(<ApprovalsTable {...props} approvals={[{
      ...approval,
      viewer_actionability: { status: 'blocked', reason: 'viewer_already_decided' },
      decisions: [{
        actor_id: 'human-1',
        decision: 'approved',
        reason: 'Waiting for another approver.',
        source: 'human',
        policy_workspace_id: null,
        policy_revision: null,
        decided_at: '2026-08-23T00:01:00.000Z',
      }],
      quorum: { required: 2, approved: 1, rejected: 0, reached: false },
    }]} />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveFocus())
    expect(document.body).not.toHaveFocus()
  })

  it('does not steal external focus when another approval becomes blocked', async () => {
    const approval = baseApproval({ id: 'external-focus', risk_level: 'low' })
    const { rerender, props } = renderTable({ approvals: [approval] })

    rerender(<ApprovalsTable {...props} decisionStates={{
      [approval.id]: { status: 'success', decision: 'approved', message: 'Approval recorded.' },
    }} />)
    await waitFor(() => expect(screen.getByTestId(`approval-decision-status-${approval.id}`)).toHaveFocus())

    const external = document.createElement('button')
    external.type = 'button'
    external.textContent = 'Keep focus here'
    document.body.append(external)
    external.focus()

    rerender(<ApprovalsTable {...props} approvals={[{
      ...approval,
      viewer_actionability: { status: 'blocked', reason: 'viewer_already_decided' },
      decisions: [{
        actor_id: 'human-1',
        decision: 'approved',
        reason: 'Waiting for another approver.',
        source: 'human',
        policy_workspace_id: null,
        policy_revision: null,
        decided_at: '2026-08-23T00:01:00.000Z',
      }],
      quorum: { required: 2, approved: 1, rejected: 0, reached: false },
    }]} />)
    await Promise.resolve()
    expect(external).toHaveFocus()
    external.remove()
  })

  it('keeps bulk selection secondary and exposes tri-state selection', () => {
    const approvals = [baseApproval({ id: 'a-1' }), baseApproval({ id: 'a-2' })]
    const onDecide = vi.fn()
    const { rerender, props } = renderTable({ approvals, onDecide, selectedIds: new Set(['a-1']) })
    const header = screen.getByTestId('approval-select-all') as HTMLInputElement
    expect(header.indeterminate).toBe(true)
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve selected' }))
    expect(onDecide).toHaveBeenCalledWith('approved')

    rerender(<ApprovalsTable {...props} bulkBusy selectedIds={new Set(['a-1', 'a-2'])} />)
    expect(screen.getByTestId('approval-select-all')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject selected' })).toBeDisabled()
  })
})
