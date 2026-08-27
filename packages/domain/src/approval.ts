import type {
  AgentSessionState,
  ApprovalStatus,
  ApprovalViewerActionability,
} from '@workmesh/contracts'

export const approvalDecisionSessionStates = [
  'queued',
  'acknowledged',
  'planning',
  'executing',
  'awaiting_input',
  'awaiting_approval',
  'blocked',
] as const satisfies readonly AgentSessionState[]

export type ApprovalViewerActionabilityInput = Readonly<{
  status: ApprovalStatus
  expiresAt: Date | string | number
  sessionState: AgentSessionState
  definitionActive: boolean
  teamGrantActive: boolean
  delegationActive: boolean
  resourceScopeActive: boolean
  viewerAlreadyDecided: boolean
}>

/**
 * Advisory Approval policy shared by Human read projections and the final
 * decision command. The command must still evaluate this from freshly locked
 * authority rows immediately before it records a decision.
 */
export const evaluateApprovalViewerActionability = (
  input: ApprovalViewerActionabilityInput,
  now = Date.now(),
): ApprovalViewerActionability => {
  const expiresAt = input.expiresAt instanceof Date
    ? input.expiresAt.getTime()
    : typeof input.expiresAt === 'number'
      ? input.expiresAt
      : new Date(input.expiresAt).getTime()

  if (input.status === 'expired' || expiresAt <= now)
    return { status: 'blocked', reason: 'expired' }
  if (input.status !== 'pending')
    return { status: 'blocked', reason: 'already_decided' }
  if (input.viewerAlreadyDecided)
    return { status: 'blocked', reason: 'viewer_already_decided' }
  if (!approvalDecisionSessionStates.includes(
    input.sessionState as typeof approvalDecisionSessionStates[number],
  )) return { status: 'blocked', reason: 'session_inactive' }
  if (
    !input.definitionActive
    || !input.teamGrantActive
    || !input.delegationActive
    || !input.resourceScopeActive
  ) return { status: 'blocked', reason: 'authority_revoked' }
  return { status: 'actionable', allowed_decisions: ['approved', 'rejected'] }
}
