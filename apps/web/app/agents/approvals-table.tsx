'use client'

import { type ChangeEvent } from 'react'
import { Button } from '@workmesh/ui'
import { CheckCircleIcon, XCircleIcon } from '@phosphor-icons/react'
import type { Agent, AgentSession, Approval, ApprovalDecision } from '../lib/agents'
import { agentName, approvalActionability, formatApprovalPayload, formatTime } from '../lib/agents'
import type { AgentsCopy } from '../lib/i18n'
import { ApprovalDecisionControls, type ApprovalDecisionUiState } from './approval-decision-controls'

export type ApprovalsTableProps = {
  approvals: readonly Approval[]
  agents?: readonly Agent[]
  sessions?: readonly AgentSession[]
  selectedIds: ReadonlySet<string>
  bulkBusy: boolean
  copy: AgentsCopy
  decisionStates: Readonly<Record<string, ApprovalDecisionUiState | undefined>>
  onToggle: (id: string) => void
  onToggleAll: (event: ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
  onDecide: (decision: ApprovalDecision) => void
  onDecideApproval: (approval: Approval, decision: ApprovalDecision, reason?: string) => Promise<boolean>
}

/**
 * One responsive approval grid: desktop gets aligned scan columns and narrow
 * screens collapse each row into a card without duplicating interactive DOM.
 */
export function ApprovalsTable({
  approvals,
  agents = [],
  bulkBusy,
  copy,
  decisionStates,
  onClear,
  onDecide,
  onDecideApproval,
  onToggle,
  onToggleAll,
  selectedIds,
  sessions = [],
}: ApprovalsTableProps) {
  const pendingApprovals = approvals.filter(approval => approval.status === 'pending')

  const actionableIds = pendingApprovals
    .filter(approval => approvalActionability(approval).status === 'actionable')
    .map(approval => approval.id)
  const selectedLiveIds = actionableIds.filter(id => selectedIds.has(id))
  const selectedLiveCount = selectedLiveIds.length
  const allSelected = actionableIds.length > 0 && selectedLiveCount === actionableIds.length
  const someSelected = selectedLiveCount > 0 && !allSelected

  return <div aria-label={copy.approvalTableAriaLabel} className="approval-table-region" role="region">
    {pendingApprovals.length === 0 ? <p className="empty">{copy.noApprovals}</p> : <>
      {selectedLiveCount > 0 && <div className="approval-bulk-bar" role="group" aria-label={copy.approvalBulkActions}>
      <span className="approval-bulk-count">{copy.selectedApprovalsCount(selectedLiveCount)}</span>
      <Button disabled={bulkBusy} icon={<CheckCircleIcon aria-hidden size={14} weight="bold" />} onClick={() => onDecide('approved')} type="button" variant="primary">{copy.approveSelected}</Button>
      <Button disabled={bulkBusy} icon={<XCircleIcon aria-hidden size={14} weight="bold" />} onClick={() => onDecide('rejected')} type="button" variant="danger">{copy.rejectSelected}</Button>
      <Button className="approval-bulk-clear" disabled={bulkBusy} onClick={onClear} type="button" variant="ghost">{copy.clearSelection}</Button>
      </div>}

      <div aria-label={copy.approvalTableAriaLabel} className="approval-grid" role="table">
      <div className="approval-grid-header" role="row">
        <div className="approval-cell-checkbox" role="columnheader">
          <input
            aria-label={copy.selectAllApprovals}
            checked={allSelected}
            data-testid="approval-select-all"
            disabled={bulkBusy || actionableIds.length === 0}
            onChange={onToggleAll}
            ref={element => { if (element) element.indeterminate = someSelected }}
            type="checkbox"
          />
        </div>
        <div role="columnheader">{copy.approvalColumnAction}</div>
        <div role="columnheader">{copy.approvalColumnRisk}</div>
        <div role="columnheader">{copy.approvalColumnExpires}</div>
        <div role="columnheader">{copy.approvalColumnSession}</div>
        <div role="columnheader">{copy.approvalColumnDecision}</div>
      </div>

      <div className="approval-grid-body" role="rowgroup">
        {pendingApprovals.map(approval => {
          const session = sessions.find(candidate => candidate.id === approval.session_id)
          const requestingAgent = agents.find(candidate => candidate.id === session?.agent_id)
          const actionable = approvalActionability(approval).status === 'actionable'
          const isSelected = actionable && selectedIds.has(approval.id)
          const checkboxId = `approval-checkbox-${approval.id}`
          const rowState = decisionStates[approval.id] ?? (bulkBusy && isSelected ? { status: 'busy' as const } : undefined)
          return <article aria-selected={isSelected || undefined} className={`approval-grid-row${isSelected ? ' is-selected' : ''}${actionable ? '' : ' is-blocked'}`} data-testid={`approval-row-${approval.id}`} key={approval.id} role="row">
            <div className="approval-cell-checkbox" role="cell">
              {actionable ? <label className="approval-row-checkbox-label" htmlFor={checkboxId}>
                <input
                  aria-label={copy.approvalRowCheckbox(approval.action_name)}
                  checked={isSelected}
                  data-testid={`approval-checkbox-${approval.id}`}
                  disabled={bulkBusy || rowState?.status === 'busy' || rowState?.status === 'success'}
                  id={checkboxId}
                  onChange={() => onToggle(approval.id)}
                  type="checkbox"
                />
              </label> : <span aria-hidden="true" className="approval-selection-placeholder">—</span>}
            </div>
            <div className="approval-cell-action" role="cell">
              <span className="approval-cell-label">{copy.approvalColumnAction}</span>
              <strong>{approval.action_name}</strong>
              <p>{approval.rationale_summary}</p>
              <details className="approval-scope-details" data-testid={`approval-scope-${approval.id}`}>
                <summary>{copy.approvalPayloadLabel}</summary>
                <pre className="approval-payload" data-testid={`approval-payload-${approval.id}`}>{formatApprovalPayload(approval.action_payload_sanitized)}</pre>
                {approval.action_payload_hash && <code className="approval-payload-hash">{approval.action_payload_hash}</code>}
              </details>
            </div>
            <div className="approval-cell-risk" role="cell">
              <span className="approval-cell-label">{copy.approvalColumnRisk}</span>
              <span className={`risk-pill risk-${approval.risk_level}`}>{copy.riskLabel(approval.risk_level)}</span>
            </div>
            <div className="approval-cell-expires" role="cell">
              <span className="approval-cell-label">{copy.approvalColumnExpires}</span>
              <time dateTime={approval.expires_at}>{formatTime(approval.expires_at)}</time>
            </div>
            <div className="approval-cell-session" role="cell">
              <span className="approval-cell-label">{copy.approvalColumnSession}</span>
              {session && <span className="approval-authority-context">{copy.agents}: {agentName(requestingAgent)}</span>}
              <nav aria-label={copy.approvalContextLabel} className="approval-context-links">
                <a href={`/agent-sessions/${approval.session_id}`}>{copy.sessionLabel?.(approval.session_id.slice(0, 8)) ?? `Session ${approval.session_id.slice(0, 8)}`}</a>
                {session?.work_item_id && <a href={`/?workItemId=${encodeURIComponent(session.work_item_id)}`}>{copy.workItemLabel?.(session.work_item_id.slice(0, 8)) ?? `Work item ${session.work_item_id.slice(0, 8)}`}</a>}
                <a href={`/agent-sessions/${approval.session_id}?tab=artifacts`}>{copy.approvalEvidenceLink}</a>
              </nav>
            </div>
            <div className="approval-cell-decision" role="cell">
              <span className="approval-cell-label">{copy.approvalColumnDecision}</span>
              <ApprovalDecisionControls approval={approval} copy={copy} onDecide={onDecideApproval} state={rowState} />
            </div>
          </article>
        })}
      </div>
      </div>
    </>}
  </div>
}

export type { ApprovalDecisionUiState } from './approval-decision-controls'
