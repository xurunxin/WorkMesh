import type { HumanAttentionItem } from '@workmesh/contracts'
import type { Approval, ApprovalBlockedReason } from '../lib/agents'

const approvalBlockedReasons: readonly ApprovalBlockedReason[] = [
  'viewer_already_decided',
  'expired',
  'session_inactive',
  'authority_revoked',
  'already_decided',
]

const approvalBlockedReason = (item: HumanAttentionItem): ApprovalBlockedReason => {
  const reason = item.reasonCodes
    .map(code => code.startsWith('approval.') ? code.slice('approval.'.length) : '')
    .find(candidate => approvalBlockedReasons.includes(candidate as ApprovalBlockedReason))
  return reason as ApprovalBlockedReason | undefined ?? (
    item.status === 'expired' ? 'expired' : item.status === 'decided' ? 'already_decided' : 'authority_revoked'
  )
}

/** Adapt the Human Attention projection to the shared Approval decision surface. */
export const approvalFromAttentionItem = (item: HumanAttentionItem): Approval | null => {
  if (item.kind !== 'approval' || item.source.type !== 'approval') return null
  const actionable = item.status === 'open'
    && item.audience.canRespond
    && item.options.some(option => option.command === 'decideApproval')
  return {
    id: item.source.id,
    session_id: item.sessionId ?? '',
    approval_type: 'human_attention',
    action_name: item.title,
    risk_level: item.severity,
    rationale_summary: item.summary,
    status: item.status === 'open' ? 'pending' : item.source.status,
    revision: item.sourceRevision,
    expires_at: item.expiresAt ?? '9999-12-31T23:59:59.999Z',
    created_at: item.createdAt,
    viewer_actionability: actionable
      ? { status: 'actionable', allowed_decisions: ['approved', 'rejected'] }
      : { status: 'blocked', reason: approvalBlockedReason(item) },
  }
}
