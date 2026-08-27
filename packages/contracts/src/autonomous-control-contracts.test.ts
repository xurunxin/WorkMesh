import { describe, expect, it } from 'vitest'
import {
  agentEnrollmentPolicyCreateInputSchema,
  agentEnrollmentRedeemInputSchema,
  approvalAutonomyPolicyInputSchema,
  approvalDecisionSchema,
  browserPushSubscriptionInputSchema,
  routePolicyManifest,
} from './index.js'

const id = '00000000-0000-4000-8000-000000000001'

describe('autonomous control plane contracts', () => {
  it('separates human and workspace-policy approval decisions', () => {
    expect(approvalDecisionSchema.parse({
      actor_id: id,
      decision: 'approved',
      reason: 'Workspace policy approved the bounded request.',
      source: 'workspace_policy',
      policy_workspace_id: id,
      policy_revision: 3,
      decided_at: '2026-08-27T00:00:00.000Z',
    }).source).toBe('workspace_policy')
    expect(approvalAutonomyPolicyInputSchema.parse({ mode: 'yolo' }))
      .toEqual({ mode: 'yolo', excludedProjectIds: [] })
  })

  it('requires complete device-specific Web Push subscriptions', () => {
    expect(browserPushSubscriptionInputSchema.safeParse({
      endpoint: 'https://push.example.test/subscription/1',
      deviceId: 'device-1',
      keys: { p256dh: 'p256dh', auth: 'auth' },
    }).success).toBe(true)
    expect(browserPushSubscriptionInputSchema.safeParse({
      endpoint: 'https://push.example.test/subscription/1',
      deviceId: 'device-1',
      keys: { p256dh: 'p256dh' },
    }).success).toBe(false)
  })

  it('bounds enrollment policy capabilities and public redemption', () => {
    expect(agentEnrollmentPolicyCreateInputSchema.safeParse({
      name: 'Codex enrollment',
      teamId: id,
      allowedClientTypes: ['codex'],
      capabilityCeiling: ['work:read', 'work:write'],
      expiresAt: '2026-08-28T00:00:00.000Z',
      maxUses: 2,
    }).success).toBe(true)
    expect(agentEnrollmentRedeemInputSchema.safeParse({
      enrollmentToken: `wme_${'a'.repeat(43)}`,
      name: 'Codex',
      slug: 'codex',
      client: { type: 'codex', version: '1' },
      manifest: { provider: 'codex' },
      requestedCapabilities: ['admin:*', 'admin:*'],
    }).success).toBe(false)
    expect(routePolicyManifest.find(route => route.operationId === 'redeemAgentEnrollment'))
      .toMatchObject({ authentication: 'public', secretReplay: 'encrypted_auth', credentialRateLimit: 'shared_redis' })
    expect(routePolicyManifest.find(route => route.operationId === 'updateApprovalAutonomyPolicy'))
      .toMatchObject({ authentication: 'human_session', revision: 'if_match', human: { workspaceRoles: ['admin'] } })
  })
})
