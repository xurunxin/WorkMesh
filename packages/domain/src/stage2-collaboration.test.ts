import { describe, expect, it } from 'vitest'
import { DomainError, assertChildSessionLimit, assertDecisionRelationAcyclic, assertLeaseAcquirable, assertRequiredChildrenCompleted, inheritChildBudget, reserveChildBudget, selectRoutingCandidate, validatePlanSteps } from './index.js'

describe('Stage 2 collaboration domain invariants', () => {
  it('rejects a child budget that silently exceeds the parent', () => {
    expect(inheritChildBudget({ maxRuntimeSeconds: 120, maxCostUsd: 5 }, { maxRuntimeSeconds: 60 })).toEqual({ maxRuntimeSeconds: 60, maxCostUsd: 5 })
    expect(() => inheritChildBudget({ maxRuntimeSeconds: 120 }, { maxRuntimeSeconds: 121 })).toThrow(DomainError)
    expect(reserveChildBudget({ maxCostUsd: 10 }, [{ maxCostUsd: 6 }], { maxCostUsd: 4 })).toEqual({ maxCostUsd: 4 })
    expect(() => reserveChildBudget({ maxCostUsd: 10 }, [{ maxCostUsd: 6 }], { maxCostUsd: 5 })).toThrow(/reservation/i)
  })

  it('keeps a stable parent plan DAG and chooses routing deterministically', () => {
    const a = 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'; const b = 'b7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'
    expect(() => validatePlanSteps([{ id: a, ordinal: 0, status: 'pending', dependsOn: [] }, { id: b, ordinal: 1, status: 'pending', dependsOn: [a] }])).not.toThrow()
    const selected = selectRoutingCandidate([
      { id: b, slug: 'zeta', skills: ['review'], activeSessions: 0, capabilities: ['work:read'] },
      { id: a, slug: 'alpha', skills: ['review'], activeSessions: 0, capabilities: ['work:read'] },
    ], { skill: 'review', requiredCapabilities: ['work:read'] })
    expect(selected?.id).toBe(a)
  })

  it('reports DAG and decision-cycle paths, child blockers, and lease conflicts', () => {
    const a = 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'; const b = 'b7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'
    try { validatePlanSteps([{ id: a, ordinal: 0, status: 'pending', dependsOn: [b] }, { id: b, ordinal: 1, status: 'pending', dependsOn: [a] }]) } catch (error) { expect((error as DomainError).details).toMatchObject({ stepId: a }) }
    expect(() => assertDecisionRelationAcyclic([{ decisionId: a, relatedDecisionId: b }, { decisionId: b, relatedDecisionId: a }])).toThrow(/acyclic/i)
    expect(() => assertChildSessionLimit(1, 1)).toThrow(/limit/i)
    expect(() => assertRequiredChildrenCompleted([{ id: b, requiredForParent: true, state: 'failed' }])).toThrow(/Required child/i)
    expect(() => assertLeaseAcquirable([{ id: a, kind: 'review_shared', sessionId: b, expiresAt: new Date(Date.now() + 10_000) }], 'exclusive')).toThrow(/already leased/i)
    expect(() => assertLeaseAcquirable([{ id: a, kind: 'review_shared', sessionId: b, expiresAt: new Date(Date.now() + 10_000) }], 'review_shared')).not.toThrow()
  })
})
