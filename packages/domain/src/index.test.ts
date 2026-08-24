import { describe, expect, it } from 'vitest'
import {
  DomainError,
  agentExecutionCapacityStates,
  assertResponsibleHumanForStarted,
  countsTowardAgentExecutionCapacity,
  parseRevision,
} from './index.js'
describe('work item invariants', () => { it('requires a human only for started state', () => { expect(() => assertResponsibleHumanForStarted('started', null)).toThrow(DomainError); expect(() => assertResponsibleHumanForStarted('backlog', null)).not.toThrow() }); it('parses strong revision etags', () => expect(parseRevision('"revision-2"')).toBe(2)) })

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
