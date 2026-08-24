'use client'

import { type ChangeEvent } from 'react'
import { Button } from '@workmesh/ui'
import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react'
import type { Approval, ApprovalDecision } from '../lib/agents'
import { formatTime } from '../lib/agents'
import type { AgentsCopy } from '../lib/i18n'

export type ApprovalsTableProps = {
  /** All pending approvals loaded into the page. Rendered as one row each. */
  approvals: readonly Approval[]
  /** Selected approval ids as the page holds them; rows check themselves
   *  by membership. The component does not own selection state. */
  selectedIds: ReadonlySet<string>
  /** `true` while a bulk decide is in flight; disables every checkbox and
   *  the action-bar buttons so the user cannot double-submit. */
  bulkBusy: boolean
  /** i18n copy; the page passes its `agentsCopy` so the table and the bar
   *  stay in lock-step with the rest of the Agents page. */
  copy: AgentsCopy
  /** Called when the user toggles a row checkbox. The id is the approval id. */
  onToggle: (id: string) => void
  /** Called when the user toggles the header "select all" checkbox. The
   *  page decides which ids to add or clear; the component only reports
   *  the checked value through the native event. */
  onToggleAll: (event: ChangeEvent<HTMLInputElement>) => void
  /** Called when the user presses the "Clear selection" ghost button. */
  onClear: () => void
  /** Called when the user presses "Approve selected" or "Reject selected".
   *  The page is the only place that owns the actual `decideApproval` call. */
  onDecide: (decision: ApprovalDecision) => void
}

/**
 * Pending-approvals table + bulk action bar.
 *
 * Extracted from `apps/web/app/agents/page.tsx` so the table is unit-testable
 * without spinning up the full page (auth hook, paged list, realtime
 * subscription, etc.). The page owns the selection set and the busy flag;
 * this component only renders and forwards user intent.
 *
 * Selection is tri-state: the header checkbox is checked when every visible
 * row is selected, indeterminate when some are selected, and unchecked
 * when none are. The component sets the native `indeterminate` DOM
 * property via a ref callback because JSX does not express it.
 */
export function ApprovalsTable({ approvals, bulkBusy, copy, onClear, onDecide, onToggle, onToggleAll, selectedIds }: ApprovalsTableProps) {
  // The server query is status-scoped, but the transport boundary remains
  // defensive: decided rows from a stale cache or permissive proxy never
  // regain a checkbox or a decision action.
  const pendingApprovals = approvals.filter(approval => approval.status === 'pending')
  if (pendingApprovals.length === 0) return <p className="empty">{copy.noApprovals}</p>
  const visibleIds = pendingApprovals.map(approval => approval.id)
  const selectedLiveIds = visibleIds.filter(id => selectedIds.has(id))
  const selectedLiveCount = selectedLiveIds.length
  const allSelected = selectedLiveCount === visibleIds.length
  const someSelected = selectedLiveCount > 0 && !allSelected
  return <>
    {selectedLiveCount > 0 && <div className="approval-bulk-bar" role="group" aria-label={copy.approveSelected}>
      <span className="approval-bulk-count">{copy.selectedApprovalsCount(selectedLiveCount)}</span>
      <Button disabled={bulkBusy} icon={<CheckCircleIcon aria-hidden size={14} weight="bold" />} onClick={() => onDecide('approved')} type="button" variant="primary">{copy.approveSelected}</Button>
      <Button disabled={bulkBusy} icon={<XCircleIcon aria-hidden size={14} weight="bold" />} onClick={() => onDecide('rejected')} type="button" variant="danger">{copy.rejectSelected}</Button>
      <Button className="approval-bulk-clear" disabled={bulkBusy} onClick={onClear} type="button" variant="ghost">{copy.clearSelection}</Button>
    </div>}
    <div aria-label={copy.approvalTableAriaLabel} className="approval-table-wrap" role="region" tabIndex={0}>
    <table className="approval-table" aria-label={copy.approvalTableAriaLabel}>
      <thead>
        <tr>
          <th scope="col" className="approval-cell-checkbox">
            <input
              aria-label={copy.selectAllApprovals}
              checked={allSelected}
              data-testid="approval-select-all"
              disabled={bulkBusy}
              onChange={onToggleAll}
              ref={element => {
                // Tri-state: native checkbox can't render indeterminate
                // through JSX, so flip the DOM property after mount. The
                // ref callback runs on every render, but assigning the
                // same value is a no-op.
                if (element) element.indeterminate = someSelected
              }}
              type="checkbox"
            />
          </th>
          <th scope="col">{copy.approvalColumnAction}</th>
          <th scope="col">{copy.approvalColumnRisk}</th>
          <th scope="col">{copy.approvalColumnRationale}</th>
          <th scope="col">{copy.approvalColumnExpires}</th>
          <th scope="col">{copy.approvalColumnSession}</th>
        </tr>
      </thead>
      <tbody>
        {pendingApprovals.map(approval => {
          const isSelected = selectedIds.has(approval.id)
          const checkboxId = `approval-checkbox-${approval.id}`
          return <tr aria-selected={isSelected} className={isSelected ? 'is-selected' : ''} data-testid={`approval-row-${approval.id}`} key={approval.id}>
            <td className="approval-cell-checkbox">
              <label className="approval-row-checkbox-label" htmlFor={checkboxId}>
                <input
                  aria-label={copy.approvalRowCheckbox(approval.action_name)}
                  checked={isSelected}
                  data-testid={`approval-checkbox-${approval.id}`}
                  disabled={bulkBusy}
                  id={checkboxId}
                  onChange={() => onToggle(approval.id)}
                  type="checkbox"
                />
              </label>
            </td>
            <td className="approval-cell-action"><strong>{approval.action_name}</strong></td>
            <td className="approval-cell-risk"><span className={`risk-pill risk-${approval.risk_level}`}>{copy.riskLabel(approval.risk_level)}</span></td>
            <td className="approval-cell-rationale">{approval.rationale_summary}</td>
            <td className="approval-cell-expires">{formatTime(approval.expires_at)}</td>
            <td className="approval-cell-session"><a href={`/agent-sessions/${approval.session_id}`}>{copy.reviewSession}</a></td>
          </tr>
        })}
      </tbody>
    </table>
    </div>
  </>
}
