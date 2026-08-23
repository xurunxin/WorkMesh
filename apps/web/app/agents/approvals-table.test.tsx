// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovalsTable } from './approvals-table'
import type { Approval, ApprovalDecision } from '../lib/agents'
import type { AgentsCopy } from '../lib/i18n'

// Testing Library's automatic cleanup only fires when the test environment
// is `jsdom` and the project has been initialized for it; in this monorepo
// the suite mixes node + jsdom files, so we unmount explicitly to keep each
// test's DOM isolated. (Same pattern as team-access-drawer.test.tsx.)
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
  expires_at: '2026-08-23T00:00:00.000Z',
  created_at: '2026-08-22T22:00:00.000Z',
  ...overrides,
})

/**
 * Minimal English copy used by the approvals-table tests. The keys mirror
 * the production `AgentsCopy` shape; only the ones the table reads are
 * populated. The table does not exercise locale persistence, so a flat
 * object keeps the assertions on the rendered English text.
 */
function copy(): AgentsCopy {
  const partial: Pick<AgentsCopy,
    'selectAllApprovals' | 'approvalRowCheckbox' | 'selectedApprovalsCount' | 'clearSelection' |
    'approveSelected' | 'rejectSelected' | 'bulkApproveError' | 'bulkRejectError' |
    'approvalTableAriaLabel' | 'approvalColumnAction' | 'approvalColumnRisk' |
    'approvalColumnRationale' | 'approvalColumnExpires' | 'approvalColumnSession' |
    'riskLabel' | 'reviewSession' | 'noApprovals'
  > = {
    selectAllApprovals: 'Select all on this page',
    approvalRowCheckbox: (actionName: string) => `Select approval: ${actionName}`,
    selectedApprovalsCount: (count: number) => `${count} selected`,
    clearSelection: 'Clear selection',
    approveSelected: 'Approve selected',
    rejectSelected: 'Reject selected',
    bulkApproveError: 'Unable to approve the selected approvals.',
    bulkRejectError: 'Unable to reject the selected approvals.',
    approvalTableAriaLabel: 'Pending approvals table',
    approvalColumnAction: 'Action',
    approvalColumnRisk: 'Risk',
    approvalColumnRationale: 'Rationale',
    approvalColumnExpires: 'Expires',
    approvalColumnSession: 'Session',
    riskLabel: (risk: string) => `${risk} risk`,
    reviewSession: 'Review session and evidence',
    noApprovals: 'No pending approvals.',
  }
  return partial as unknown as AgentsCopy
}

describe('ApprovalsTable', () => {
  it('renders the empty-state copy when there are no approvals', () => {
    const { container } = render(
      <ApprovalsTable
        approvals={[]}
        bulkBusy={false}
        copy={copy()}
        onClear={() => undefined}
        onDecide={() => undefined}
        onToggle={() => undefined}
        onToggleAll={() => undefined}
        selectedIds={new Set()}
      />,
    )
    expect(screen.getByText('No pending approvals.')).toBeInTheDocument()
    expect(container.querySelector('table')).toBeNull()
  })

  it('renders one row per approval with a per-row checkbox and column headers', () => {
    const approvals = [
      baseApproval({ id: 'a-1', action_name: 'Merge PR #42' }),
      baseApproval({ id: 'a-2', action_name: 'Rotate key', risk_level: 'medium' }),
    ]
    render(
      <ApprovalsTable
        approvals={approvals}
        bulkBusy={false}
        copy={copy()}
        onClear={() => undefined}
        onDecide={() => undefined}
        onToggle={() => undefined}
        onToggleAll={() => undefined}
        selectedIds={new Set()}
      />,
    )
    expect(screen.getByRole('columnheader', { name: 'Action' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Risk' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Rationale' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Expires' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Session' })).toBeInTheDocument()
    // The "Select all" checkbox sits in the first header cell.
    expect(screen.getByTestId('approval-select-all')).toBeInTheDocument()
    // Per-row checkboxes.
    expect(screen.getByTestId('approval-checkbox-a-1')).toBeInTheDocument()
    expect(screen.getByTestId('approval-checkbox-a-2')).toBeInTheDocument()
    // Action names + risk pills.
    expect(screen.getByText('Merge PR #42')).toBeInTheDocument()
    expect(screen.getByText('Rotate key')).toBeInTheDocument()
    expect(screen.getByText('high risk')).toBeInTheDocument()
    expect(screen.getByText('medium risk')).toBeInTheDocument()
  })

  it('defensively excludes approvals that are no longer pending', () => {
    render(
      <ApprovalsTable
        approvals={[
          baseApproval({ id: 'pending', action_name: 'Pending action' }),
          baseApproval({ id: 'approved', action_name: 'Approved action', status: 'approved' }),
          baseApproval({ id: 'rejected', action_name: 'Rejected action', status: 'rejected' }),
        ]}
        bulkBusy={false}
        copy={copy()}
        onClear={() => undefined}
        onDecide={() => undefined}
        onToggle={() => undefined}
        onToggleAll={() => undefined}
        selectedIds={new Set()}
      />,
    )

    expect(screen.getByText('Pending action')).toBeInTheDocument()
    expect(screen.queryByText('Approved action')).not.toBeInTheDocument()
    expect(screen.queryByText('Rejected action')).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('does not render the action bar when nothing is selected', () => {
    render(
      <ApprovalsTable
        approvals={[baseApproval()]}
        bulkBusy={false}
        copy={copy()}
        onClear={() => undefined}
        onDecide={() => undefined}
        onToggle={() => undefined}
        onToggleAll={() => undefined}
        selectedIds={new Set()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Approve selected' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject selected' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull()
  })

  it('renders the action bar with the live count and forwards approve / reject / clear to the page', () => {
    const onDecide = vi.fn<(decision: ApprovalDecision) => void>()
    const onClear = vi.fn()
    const onToggle = vi.fn()
    const onToggleAll = vi.fn()
    const approvals = [baseApproval({ id: 'a-1' }), baseApproval({ id: 'a-2' })]
    const { rerender } = render(
      <ApprovalsTable
        approvals={approvals}
        bulkBusy={false}
        copy={copy()}
        onClear={onClear}
        onDecide={onDecide}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
        selectedIds={new Set()}
      />,
    )

    // No selection yet — the bar must stay hidden.
    expect(screen.queryByText('2 selected')).toBeNull()

    rerender(
      <ApprovalsTable
        approvals={approvals}
        bulkBusy={false}
        copy={copy()}
        onClear={onClear}
        onDecide={onDecide}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
        selectedIds={new Set(['a-1', 'a-2'])}
      />,
    )
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))

    expect(onDecide).toHaveBeenCalledTimes(2)
    expect(onDecide).toHaveBeenNthCalledWith(1, 'approved')
    expect(onDecide).toHaveBeenNthCalledWith(2, 'rejected')
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('reports per-row toggle and select-all via the page handlers', () => {
    const onToggle = vi.fn()
    const onToggleAll = vi.fn()
    render(
      <ApprovalsTable
        approvals={[baseApproval({ id: 'a-1' })]}
        bulkBusy={false}
        copy={copy()}
        onClear={() => undefined}
        onDecide={() => undefined}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
        selectedIds={new Set()}
      />,
    )

    fireEvent.click(screen.getByTestId('approval-checkbox-a-1'))
    fireEvent.click(screen.getByTestId('approval-select-all'))

    expect(onToggle).toHaveBeenCalledWith('a-1')
    expect(onToggleAll).toHaveBeenCalledTimes(1)
  })

  it('marks the selected rows and sets the header checkbox to checked when every row is selected', () => {
    const approvals = [baseApproval({ id: 'a-1' }), baseApproval({ id: 'a-2' })]
    render(
      <ApprovalsTable
        approvals={approvals}
        bulkBusy={false}
        copy={copy()}
        onClear={() => undefined}
        onDecide={() => undefined}
        onToggle={() => undefined}
        onToggleAll={() => undefined}
        selectedIds={new Set(['a-1', 'a-2'])}
      />,
    )
    const rows = screen.getAllByTestId(/^approval-row-/)
    expect(rows).toHaveLength(2)
    rows.forEach(row => expect(row.className).toContain('is-selected'))
    const header = screen.getByTestId('approval-select-all') as HTMLInputElement
    expect(header.checked).toBe(true)
  })

  it('marks the header checkbox indeterminate when only some rows are selected', () => {
    render(
      <ApprovalsTable
        approvals={[baseApproval({ id: 'a-1' }), baseApproval({ id: 'a-2' })]}
        bulkBusy={false}
        copy={copy()}
        onClear={() => undefined}
        onDecide={() => undefined}
        onToggle={() => undefined}
        onToggleAll={() => undefined}
        selectedIds={new Set(['a-1'])}
      />,
    )
    const header = screen.getByTestId('approval-select-all') as HTMLInputElement
    expect(header.checked).toBe(false)
    expect(header.indeterminate).toBe(true)
  })

  it('disables every checkbox and the action bar while a bulk decide is in flight', () => {
    const approvals = [baseApproval({ id: 'a-1' })]
    render(
      <ApprovalsTable
        approvals={approvals}
        bulkBusy={true}
        copy={copy()}
        onClear={() => undefined}
        onDecide={() => undefined}
        onToggle={() => undefined}
        onToggleAll={() => undefined}
        selectedIds={new Set(['a-1'])}
      />,
    )
    expect((screen.getByTestId('approval-select-all') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId('approval-checkbox-a-1') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Approve selected' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Reject selected' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Clear selection' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
