import { describe, expect, it } from 'vitest'
import {
  approvalResponseSchema,
  approvalViewerActionabilitySchema,
  humanApprovalResponseSchema,
} from './index.js'

const id = 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'
const timestamp = '2026-08-28T00:00:00.000Z'
const approval = {
  id,
  workspace_id: id,
  session_id: id,
  requested_by_actor_id: id,
  approval_type: 'protected_action',
  action_name: 'provider.pull_request.merge',
  action_payload_sanitized: { repository: 'acme/workmesh' },
  action_payload_hash: `sha256:${'a'.repeat(64)}`,
  risk_level: 'high' as const,
  rationale_summary: 'Merge the accepted change.',
  required_approvals: 1,
  status: 'pending' as const,
  expires_at: timestamp,
  consumed_at: null,
  revision: 1,
  created_at: timestamp,
  updated_at: timestamp,
  decisions: [],
  quorum: { required: 1, approved: 0, rejected: 0, reached: false },
}

describe('Approval response contracts', () => {
  it('uses the established snake_case transport shape', () => {
    expect(approvalResponseSchema.parse(approval)).toMatchObject({
      session_id: id,
      action_name: 'provider.pull_request.merge',
      required_approvals: 1,
    })
    expect(() => approvalResponseSchema.parse({
      ...approval,
      sessionId: id,
    })).toThrow()
  })

  it('requires viewer actionability for a Human projection', () => {
    expect(() => humanApprovalResponseSchema.parse(approval)).toThrow()
    expect(humanApprovalResponseSchema.parse({
      ...approval,
      viewer_actionability: {
        status: 'actionable',
        allowed_decisions: ['approved', 'rejected'],
      },
    }).viewer_actionability.status).toBe('actionable')
  })

  it('keeps viewer actionability optional for an Agent context read', () => {
    expect(approvalResponseSchema.parse(approval).viewer_actionability).toBeUndefined()
  })

  it('accepts only the bounded blocked reasons', () => {
    expect(approvalViewerActionabilitySchema.parse({
      status: 'blocked',
      reason: 'authority_revoked',
    })).toEqual({ status: 'blocked', reason: 'authority_revoked' })
    expect(() => approvalViewerActionabilitySchema.parse({
      status: 'blocked',
      reason: 'viewer_not_human',
    })).toThrow()
  })
})
