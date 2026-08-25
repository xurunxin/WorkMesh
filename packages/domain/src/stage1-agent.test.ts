import { describe, expect, it } from 'vitest'
import {
  DomainError,
  assertAgentMutationAllowed,
  assertAgentSessionControlAllowed,
  assertAgentSessionRetryAllowed,
  assertAgentSessionTransition,
  evaluateAgentSessionControl,
  assertApprovalUsable,
  assertCompletionEvidence,
  assertPlanPublicationApproval,
  approvalStatusAfterDecision,
  validatePlanSteps,
} from './index.js'

const id = 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'
const baseGate = () => ({
  actorId: id,
  actorKind: 'agent' as const,
  session: { id, actorId: id, delegationId: id, state: 'executing' as const, revision: 3 },
  targetSessionId: id,
  delegation: { id, active: true },
  capability: 'plan:write' as const,
  grantedCapabilities: ['plan:write'] as const,
  resourceInScope: true,
  idempotencyKey: 'session:plan:4',
  operation: 'plan' as const,
})

describe('Stage 1 agent domain invariants', () => {
  it('implements the protocol transition table', () => {
    expect(() => assertAgentSessionTransition('executing', 'completed')).not.toThrow()
    expect(() => assertAgentSessionTransition('paused', 'completed')).toThrow(DomainError)
  })

  it('rejects plan dependency cycles and removal of started stable steps', () => {
    expect(() => validatePlanSteps([
      { id, ordinal: 0, status: 'pending', dependsOn: ['b7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'] },
      { id: 'b7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438', ordinal: 1, status: 'pending', dependsOn: [id] },
    ])).toThrow(DomainError)
    expect(() => validatePlanSteps([], [{ id, ordinal: 0, status: 'in_progress', dependsOn: [] }])).toThrow(DomainError)
  })

  it('requires completion evidence or a no-artifact explanation', () => {
    expect(() => assertCompletionEvidence({ artifactIds: [], checks: [] })).toThrow(DomainError)
    expect(() => assertCompletionEvidence({ artifactIds: [], checks: [], noArtifactReason: 'No artifact is appropriate.' })).not.toThrow()
  })

  it('enforces stop server-side, allowing one cleanup acknowledgement only', () => {
    expect(() => assertAgentMutationAllowed({ ...baseGate(), session: { ...baseGate().session, state: 'stopping' }, operation: 'plan' })).toThrow(DomainError)
    expect(() => assertAgentMutationAllowed({ ...baseGate(), session: { ...baseGate().session, state: 'stopping' }, operation: 'stop_ack' })).not.toThrow()
    expect(() => assertAgentMutationAllowed({ ...baseGate(), session: { ...baseGate().session, state: 'stopping', stopCleanupAcknowledged: true }, operation: 'stop_ack' })).toThrow(DomainError)
  })

  it('checks approval status, expiry, and exact payload hash before use', () => {
    expect(() => assertApprovalUsable({ status: 'approved', expiresAt: '2026-07-24T00:00:00.000Z', actionPayloadHash: 'sha256:abc' }, 'sha256:abc', new Date('2026-07-23T00:00:00.000Z'))).not.toThrow()
    expect(() => assertApprovalUsable({ status: 'approved', expiresAt: '2026-07-24T00:00:00.000Z', actionPayloadHash: 'sha256:abc' }, 'sha256:def', new Date('2026-07-23T00:00:00.000Z'))).toThrow(DomainError)
  })

  it('retries by creating a linked session without reopening terminal history', () => {
    expect(() => assertAgentSessionRetryAllowed('failed')).not.toThrow()
    expect(() => assertAgentSessionRetryAllowed('executing')).toThrow(DomainError)
  })

  it('shares one state policy across control previews and final commands', () => {
    expect(evaluateAgentSessionControl('executing', 'pause')).toMatchObject({ allowed: true, targetState: 'paused' })
    expect(evaluateAgentSessionControl('paused', 'resume')).toMatchObject({ allowed: true, targetState: 'executing' })
    expect(evaluateAgentSessionControl('executing', 'retry')).toMatchObject({ allowed: false, targetState: null })
    expect(evaluateAgentSessionControl('failed', 'retry')).toMatchObject({ allowed: true, targetState: null })
    expect(evaluateAgentSessionControl('completed', 'steer')).toMatchObject({ allowed: false, targetState: null })
    expect(() => assertAgentSessionControlAllowed('executing', 'retry')).toThrowError(
      expect.objectContaining({ code: 'AGENT_SESSION_RETRY_NOT_ALLOWED' }),
    )
    expect(() => assertAgentSessionControlAllowed('completed', 'stop')).toThrowError(
      expect.objectContaining({ code: 'INVALID_SESSION_TRANSITION' }),
    )
  })

  it('requires a matching usable approval for plan publication while awaiting approval', () => {
    const approval = { id, sessionId: id, status: 'approved' as const, expiresAt: '2026-07-24T00:00:00.000Z', actionPayloadHash: 'sha256:abc' }
    expect(() => assertPlanPublicationApproval({ id, state: 'awaiting_approval' }, id, 'sha256:abc', approval, new Date('2026-07-23T00:00:00.000Z'))).not.toThrow()
    expect(() => assertPlanPublicationApproval({ id, state: 'awaiting_approval' }, undefined, undefined, undefined)).toThrow(DomainError)
    expect(approvalStatusAfterDecision(2, 1, 0)).toBe('pending')
    expect(approvalStatusAfterDecision(2, 2, 0)).toBe('approved')
  })
})
