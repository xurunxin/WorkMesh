import { describe, expect, it } from 'vitest'
import {
  DomainError,
  agentExecutionCapacityStates,
  assertWorkItemSelfClaimable,
  assertResponsibleHumanForStarted,
  countsTowardAgentExecutionCapacity,
  parseRevision,
} from './index.js'
describe('work item invariants', () => { it('requires a human only for started state', () => { expect(() => assertResponsibleHumanForStarted('started', null)).toThrow(DomainError); expect(() => assertResponsibleHumanForStarted('backlog', null)).not.toThrow() }); it('parses strong revision etags', () => expect(parseRevision('"revision-2"')).toBe(2)) })

describe('Work Item self-claim', () => {
  const claimable = {
    statusCategory: 'planned' as const,
    responsibleHumanActorId: 'human-1',
    principalHumanActorId: 'human-1',
    hasActiveExecutorDelegation: false,
  }

  it('accepts a non-terminal unassigned item for the exact principal', () => {
    expect(() => assertWorkItemSelfClaimable(claimable)).not.toThrow()
  })

  it('rejects terminal, principal-mismatched, and assigned items', () => {
    expect(() => assertWorkItemSelfClaimable({ ...claimable, statusCategory: 'completed' })).toThrow('terminal')
    expect(() => assertWorkItemSelfClaimable({ ...claimable, principalHumanActorId: 'human-2' })).toThrow('responsible Human')
    expect(() => assertWorkItemSelfClaimable({ ...claimable, hasActiveExecutorDelegation: true })).toThrow('active executor')
  })
})

describe('Agent execution capacity', () => {
  it('counts every non-terminal execution state', () => {
    expect(agentExecutionCapacityStates).toEqual([
      'queued',
      'acknowledged',
      'planning',
      'executing',
      'awaiting_input',
      'awaiting_approval',
      'blocked',
      'paused',
      'stopping',
      'stale',
    ])
    for (const state of agentExecutionCapacityStates)
      expect(countsTowardAgentExecutionCapacity('execution', state)).toBe(true)
  })

  it('excludes Coordination and terminal execution Sessions', () => {
    for (const state of agentExecutionCapacityStates)
      expect(countsTowardAgentExecutionCapacity('coordination', state)).toBe(false)
    for (const state of ['completed', 'failed', 'canceled'] as const)
      expect(countsTowardAgentExecutionCapacity('execution', state)).toBe(false)
  })
})
