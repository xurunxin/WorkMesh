// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Approval } from '../lib/agents'
import { ApprovalHistoryTable, type ApprovalHistoryCopy } from './approval-history-table'

afterEach(() => { cleanup() })

const baseApproval = (overrides: Partial<Approval> = {}): Approval => ({
  id: 'approval-1',
  session_id: 'session-1',
  approval_type: 'merge_pull_request',
  action_name: 'Merge PR #42',
  risk_level: 'high',
  rationale_summary: 'Squash merges a platform-blocking change.',
  status: 'approved',
  revision: 2,
  expires_at: '2026-08-23T00:00:00.000Z',
  created_at: '2026-08-22T22:00:00.000Z',
  ...overrides,
})

const copy: ApprovalHistoryCopy = {
  ariaLabel: 'Approval history',
  empty: 'No approvals with this outcome.',
  loading: 'Loading approval history…',
  status: 'Outcome',
  action: 'Action',
  risk: 'Risk',
  rationale: 'Rationale',
  requestedAt: 'Requested',
  expiresAt: 'Expires',
  session: 'Session',
  reviewSession: 'Review session and evidence',
  riskLabel: risk => `${risk} risk`,
  statusLabel: status => status,
}

describe('ApprovalHistoryTable', () => {
  it('renders only the selected terminal status and links to the source Session', () => {
    render(<ApprovalHistoryTable
      approvalStatus="approved"
      approvals={[
        baseApproval(),
        baseApproval({ id: 'approval-2', action_name: 'Delete environment', status: 'rejected', session_id: 'session-2' }),
      ]}
      copy={copy}
    />)

    expect(screen.getByText('Merge PR #42')).toBeInTheDocument()
    expect(screen.queryByText('Delete environment')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: copy.reviewSession })).toHaveAttribute('href', '/agent-sessions/session-1')
  })

  it('is an immutable projection without selection, bulk decisions, or undo', () => {
    render(<ApprovalHistoryTable approvalStatus="approved" approvals={[baseApproval()]} copy={copy} />)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/undo/i)).not.toBeInTheDocument()
  })

  it('renders the immutable Human decision reason, including attached requirements', () => {
    render(<ApprovalHistoryTable approvalStatus="approved" approvals={[baseApproval({
      decisions: [{
        actor_id: 'human-1',
        decision: 'approved',
        reason: 'Keep rollback evidence attached before proceeding.',
        source: 'human',
        policy_workspace_id: null,
        policy_revision: null,
        decided_at: '2026-08-23T00:01:00.000Z',
      }],
      quorum: { required: 1, approved: 1, rejected: 0, reached: true },
    })]} copy={copy} />)

    expect(screen.getByTestId('approval-history-decision-reason-approval-1-0')).toHaveTextContent('Keep rollback evidence attached before proceeding.')
  })

  it('keeps horizontal scrolling inside a labelled region for narrow viewports', () => {
    render(<ApprovalHistoryTable approvalStatus="approved" approvals={[baseApproval()]} copy={copy} />)

    const region = screen.getByRole('region', { name: copy.ariaLabel })
    expect(region).toHaveClass('approval-history-table-wrap')
    expect(region).toHaveAttribute('tabindex', '0')
  })

  it('renders the status-specific empty state when the response has no matching rows', () => {
    render(<ApprovalHistoryTable
      approvalStatus="approved"
      approvals={[baseApproval({ status: 'rejected' })]}
      copy={copy}
    />)
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('announces loading instead of showing a false empty result', () => {
    render(<ApprovalHistoryTable
      approvalStatus="approved"
      approvals={[]}
      copy={copy}
      loading
    />)

    expect(screen.getByRole('status', { name: copy.loading })).toBeVisible()
    expect(screen.queryByText(copy.empty)).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('keeps the loading state while a terminal-status switch replaces the query scope', () => {
    const { rerender } = render(<ApprovalHistoryTable
      approvalStatus="approved"
      approvals={[baseApproval()]}
      copy={copy}
    />)
    expect(screen.getByText('Merge PR #42')).toBeInTheDocument()

    rerender(<ApprovalHistoryTable
      approvalStatus="rejected"
      approvals={[baseApproval()]}
      copy={copy}
      loading
    />)
    expect(screen.getByRole('status', { name: copy.loading })).toBeVisible()
    expect(screen.queryByText(copy.empty)).not.toBeInTheDocument()
    expect(screen.queryByText('Merge PR #42')).not.toBeInTheDocument()

    rerender(<ApprovalHistoryTable
      approvalStatus="rejected"
      approvals={[baseApproval({ action_name: 'Delete environment', status: 'rejected' })]}
      copy={copy}
    />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('Delete environment')).toBeInTheDocument()
  })

  it('retains the same History table node and focus during a same-scope refresh', () => {
    const { rerender } = render(<ApprovalHistoryTable
      approvalStatus="approved"
      approvals={[baseApproval()]}
      copy={copy}
      initialized
    />)
    const region = screen.getByRole('region', { name: copy.ariaLabel })
    region.focus()

    rerender(<ApprovalHistoryTable
      approvalStatus="approved"
      approvals={[baseApproval()]}
      copy={copy}
      initialized
      loading
    />)

    expect(screen.getByRole('region', { name: copy.ariaLabel })).toBe(region)
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(document.activeElement).toBe(region)
    expect(screen.getByText('Merge PR #42')).toBeVisible()
  })
})
