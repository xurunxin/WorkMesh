// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovalsTable, type ApprovalsTableProps } from './approvals-table'
import type { Agent, AgentSession, Approval } from '../lib/agents'
import type { AgentsCopy } from '../lib/i18n'

afterEach(() => { cleanup() })

const baseApproval = (overrides: Partial<Approval> = {}): Approval => ({
  id: 'approval-1',
  session_id: 'session-1',
  approval_type: 'merge_pull_request',
  action_name: 'Merge PR #42',
  risk_level: 'high',
  rationale_summary: 'Squash merges a platform-blocking change.',
  status: 'pending',
  revision: 1,
  expires_at: '2099-08-23T00:00:00.000Z',
  created_at: '2026-08-22T22:00:00.000Z',
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
    expect(screen.getByRole('link', { name: 'Review session and evidence' })).toHaveAttribute('href', '/agent-sessions/session-1')
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

  it('derives rolling-upgrade actionability only for pending unexpired legacy payloads', () => {
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
