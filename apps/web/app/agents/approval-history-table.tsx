'use client'

import type { Approval } from '../lib/agents'
import { formatTime } from '../lib/agents'
import type { ApprovalTerminalStatus } from './approval-route-state'
import { SkeletonList } from '../lib/skeleton-list'

export type ApprovalHistoryCopy = {
  ariaLabel: string
  empty: string
  loading: string
  status: string
  action: string
  risk: string
  rationale: string
  requestedAt: string
  expiresAt: string
  session: string
  reviewSession: string
  riskLabel: (risk: string) => string
  statusLabel: (status: ApprovalTerminalStatus) => string
}

export function ApprovalHistoryTable({
  approvals,
  approvalStatus,
  copy,
  error,
  initialized,
  loading = false,
}: {
  approvals: readonly Approval[]
  approvalStatus: ApprovalTerminalStatus
  copy: ApprovalHistoryCopy
  error?: Error | null
  initialized?: boolean
  loading?: boolean
}) {
  // The API query is already status-scoped. This second boundary prevents a
  // stale proxy/cache or permissive mock from turning History into a mixed,
  // client-composed ledger.
  const rows = approvals.filter(approval => approval.status === approvalStatus)
  const resolved = initialized ?? !loading
  if (!resolved && error) return null
  if (!resolved) return <SkeletonList columns={1} items={4} label={copy.loading} />
  if (rows.length === 0) return <p className="empty">{copy.empty}</p>

  return <div aria-busy={loading || undefined} aria-label={copy.ariaLabel} className="approval-history-table-wrap" role="region" tabIndex={0}>
    <table aria-label={copy.ariaLabel} className="approval-table approval-history-table">
      <thead>
        <tr>
          <th scope="col">{copy.status}</th>
          <th scope="col">{copy.action}</th>
          <th scope="col">{copy.risk}</th>
          <th scope="col">{copy.rationale}</th>
          <th scope="col">{copy.requestedAt}</th>
          <th scope="col">{copy.expiresAt}</th>
          <th scope="col">{copy.session}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(approval => {
          const humanDecisions = approval.decisions?.filter(decision => decision.source === 'human') ?? []
          return <tr data-testid={`approval-history-row-${approval.id}`} key={approval.id}>
          <td><span className={`approval-status approval-status-${approvalStatus}`}>{copy.statusLabel(approvalStatus)}</span></td>
          <td className="approval-cell-action"><strong>{approval.action_name}</strong><small>{approval.approval_type}</small></td>
          <td className="approval-cell-risk"><span className={`risk-pill risk-${approval.risk_level}`}>{copy.riskLabel(approval.risk_level)}</span></td>
          <td className="approval-cell-rationale">
            <span>{approval.rationale_summary}</span>
            {humanDecisions.length > 0 && <div className="approval-history-decisions" data-testid={`approval-history-decisions-${approval.id}`}>
              {humanDecisions.map((decision, index) => <p className="approval-history-decision" data-testid={`approval-history-decision-${approval.id}-${index}`} key={`${decision.actor_id}-${decision.decided_at}`}>
                <strong>{decision.decision}</strong>
                <span className="approval-decision-reason" data-testid={`approval-history-decision-reason-${approval.id}-${index}`}>{decision.reason}</span>
              </p>)}
            </div>}
          </td>
          <td className="approval-cell-created">{formatTime(approval.created_at)}</td>
          <td className="approval-cell-expires">{formatTime(approval.expires_at)}</td>
          <td className="approval-cell-session"><a href={`/agent-sessions/${approval.session_id}`}>{copy.reviewSession}</a></td>
        </tr>
        })}
      </tbody>
    </table>
  </div>
}
