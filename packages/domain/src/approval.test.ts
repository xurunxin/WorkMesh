import { describe, expect, it } from 'vitest'
import { evaluateApprovalViewerActionability } from './approval.js'

const actionable = {
  status: 'pending' as const,
  expiresAt: '2026-09-01T00:00:00.000Z',
  sessionState: 'executing' as const,
  definitionActive: true,
  teamGrantActive: true,
  delegationActive: true,
  resourceScopeActive: true,
  viewerAlreadyDecided: false,
}
const now = Date.parse('2026-08-28T00:00:00.000Z')

describe('Approval viewer actionability', () => {
  it.each(['queued', 'acknowledged', 'planning', 'executing', 'awaiting_input', 'awaiting_approval', 'blocked'] as const)(
    'returns the two authoritative decisions for the %s decision-capable Session state',
    sessionState => {
      expect(evaluateApprovalViewerActionability({ ...actionable, sessionState }, now)).toEqual({
        status: 'actionable',
        allowed_decisions: ['approved', 'rejected'],
      })
    },
  )

  it.each(['paused', 'stopping', 'stale', 'completed', 'failed', 'canceled'] as const)(
    'blocks the inactive %s Session',
    sessionState => {
      expect(evaluateApprovalViewerActionability({ ...actionable, sessionState }, now))
        .toEqual({ status: 'blocked', reason: 'session_inactive' })
    },
  )

  it.each([
    ['definition', { definitionActive: false }],
    ['Team grant', { teamGrantActive: false }],
    ['Delegation', { delegationActive: false }],
    ['resource scope', { resourceScopeActive: false }],
  ] as const)('blocks a revoked %s authority input', (_label, override) => {
    expect(evaluateApprovalViewerActionability({ ...actionable, ...override }, now))
      .toEqual({ status: 'blocked', reason: 'authority_revoked' })
  })

  it('distinguishes expiry, a prior viewer decision, and a terminal decision', () => {
    expect(evaluateApprovalViewerActionability({
      ...actionable,
      expiresAt: now,
    }, now)).toEqual({ status: 'blocked', reason: 'expired' })
    expect(evaluateApprovalViewerActionability({
      ...actionable,
      viewerAlreadyDecided: true,
    }, now)).toEqual({ status: 'blocked', reason: 'viewer_already_decided' })
    expect(evaluateApprovalViewerActionability({
      ...actionable,
      status: 'approved',
    }, now)).toEqual({ status: 'blocked', reason: 'already_decided' })
  })

  it('reports an expired Approval before concurrent authority changes', () => {
    expect(evaluateApprovalViewerActionability({
      ...actionable,
      expiresAt: now - 1,
      sessionState: 'canceled',
      delegationActive: false,
    }, now)).toEqual({ status: 'blocked', reason: 'expired' })
  })
})
