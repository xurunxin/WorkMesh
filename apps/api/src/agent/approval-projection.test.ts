import { describe, expect, it, vi } from 'vitest'
import { humanApprovalResponseSchema } from '@workmesh/contracts'
import { projectApprovalResponses } from './approval-projection.js'

const id = 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'
const now = Date.parse('2026-08-28T00:00:00.000Z')
const row = {
  id,
  workspace_id: id,
  session_id: id,
  requested_by_actor_id: id,
  approval_type: 'protected_action',
  action_name: 'provider.pull_request.merge',
  action_payload_sanitized: { repository: 'acme/workmesh' },
  action_payload_hash: `sha256:${'a'.repeat(64)}`,
  risk_level: 'high',
  rationale_summary: 'Merge the accepted change.',
  required_approvals: 2,
  status: 'pending',
  expires_at: new Date('2026-09-01T00:00:00.000Z'),
  consumed_at: null,
  revision: 1,
  created_at: new Date('2026-08-28T00:00:00.000Z'),
  updated_at: new Date('2026-08-28T00:00:00.000Z'),
}
const facts = (overrides: Record<string, unknown> = {}) => ({
  approval_id: id,
  session_state: 'executing',
  definition_active: true,
  team_grant_active: true,
  delegation_active: true,
  resource_scope_active: true,
  viewer_already_decided: false,
  decisions: [],
  approved_count: 0,
  rejected_count: 0,
  policy_approved: false,
  ...overrides,
})
const viewer = (kind: 'human' | 'agent') => ({
  id,
  workspaceId: id,
  displayName: 'Viewer',
  workspaceRole: 'member' as const,
  csrfToken: 'csrf',
  kind,
})

describe('Approval API projection', () => {
  it('returns a contract-valid actionable Human read with quorum facts', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [facts()] }) }
    const approvals = await projectApprovalResponses(db as never, [row], viewer('human'), now)
    expect(approvals).toHaveLength(1)
    const approval = approvals[0]!

    expect(humanApprovalResponseSchema.parse(approval)).toMatchObject({
      quorum: { required: 2, approved: 0, rejected: 0, reached: false },
      viewer_actionability: {
        status: 'actionable',
        allowed_decisions: ['approved', 'rejected'],
      },
    })
  })

  it('projects an already recorded Human vote without hiding quorum progress', async () => {
    const decision = {
      actor_id: id,
      decision: 'approved',
      reason: 'Looks safe',
      source: 'human',
      policy_workspace_id: null,
      policy_revision: null,
      decided_at: '2026-08-28T00:05:00.000Z',
    }
    const db = { query: vi.fn().mockResolvedValue({ rows: [facts({
      viewer_already_decided: true,
      decisions: [decision],
      approved_count: 1,
    })] }) }
    const [approval] = await projectApprovalResponses(db as never, [row], viewer('human'), now)

    expect(approval).toMatchObject({
      decisions: [decision],
      quorum: { required: 2, approved: 1, reached: false },
      viewer_actionability: { status: 'blocked', reason: 'viewer_already_decided' },
    })
  })

  it('omits Human actionability from an Agent context read', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [facts()] }) }
    const approvals = await projectApprovalResponses(db as never, [row], viewer('agent'), now)
    expect(approvals).toHaveLength(1)
    const approval = approvals[0]!

    expect(approval.viewer_actionability).toBeUndefined()
  })

  it('honors workspace-policy approval quorum', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [facts({
      approved_count: 1,
      policy_approved: true,
    })] }) }
    const approvals = await projectApprovalResponses(db as never, [{
      ...row,
      status: 'approved',
      revision: 2,
    }], viewer('human'), now)
    expect(approvals).toHaveLength(1)
    const approval = approvals[0]!

    expect(approval.quorum).toEqual({ required: 2, approved: 1, rejected: 0, reached: true })
    expect(approval.viewer_actionability).toEqual({ status: 'blocked', reason: 'already_decided' })
  })
})
