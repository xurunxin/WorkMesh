import { describe, expect, it } from 'vitest'
import {
  aggregateUsage,
  assertLoopAdmission,
  automationRetry,
  dryRunAutomation,
  explainProjectForecast,
  generateCycleWindows,
  rollupInitiative,
  selectCarryOverWorkItems,
  shouldDeliverNotification,
} from './stage4.js'

describe('Stage 4 planning and operations domain', () => {
  it('generates bounded cycles and carries only unfinished work', () => {
    const cycles = generateCycleWindows({
      firstStartsAt: new Date('2026-07-27T12:00:00Z'),
      durationWeeks: 2,
      count: 3,
      namePrefix: 'Sprint',
    })
    expect(cycles.map(cycle => [cycle.name, cycle.startsAt.toISOString(), cycle.endsAt.toISOString()])).toEqual([
      ['Sprint 1', '2026-07-27T00:00:00.000Z', '2026-08-10T00:00:00.000Z'],
      ['Sprint 2', '2026-08-10T00:00:00.000Z', '2026-08-24T00:00:00.000Z'],
      ['Sprint 3', '2026-08-24T00:00:00.000Z', '2026-09-07T00:00:00.000Z'],
    ])
    expect(selectCarryOverWorkItems([
      { id: 'a', completed: false },
      { id: 'b', completed: true },
      { id: 'c', completed: false },
    ], ['b', 'c'])).toEqual([{ id: 'c', completed: false }])
  })

  it('rolls project state into an initiative without mixing currencies or converting unknown cost to zero', () => {
    expect(rollupInitiative([
      {
        id: 'one',
        status: 'completed',
        health: 'on_track',
        completedItems: 4,
        totalItems: 4,
        costBuckets: [
          { currency: 'USD', knownCostMinor: '1200', hasUnknownCost: false },
          { currency: 'EUR', knownCostMinor: '250', hasUnknownCost: false },
        ],
      },
      {
        id: 'two',
        status: 'active',
        health: 'at_risk',
        completedItems: 1,
        totalItems: 4,
        costBuckets: [
          { currency: 'USD', knownCostMinor: '300', hasUnknownCost: true },
        ],
      },
    ])).toEqual({
      projectCount: 2,
      completedProjectCount: 1,
      completedItems: 5,
      totalItems: 8,
      progressPercent: 62.5,
      health: 'at_risk',
      currencyBuckets: [
        { currency: 'EUR', knownCostMinor: '250', hasUnknownCost: false },
        { currency: 'USD', knownCostMinor: '1500', hasUnknownCost: true },
      ],
      hasUnknownCost: true,
    })
  })

  it('dry-runs a matching rule without creating an effect', () => {
    const trace = dryRunAutomation(
      { field: 'work.priority', op: 'eq', value: 'urgent' },
      [{ type: 'delegate_agent', parameters: { agentId: 'agent' } }],
      { work: { priority: 'urgent' } },
    )
    expect(trace).toMatchObject({ matched: true, dryRun: true, effectsCreated: 0 })
    expect(trace.actions[0]?.effect).toBe('planned')
  })

  it('bounds retry and reaches terminal DLQ', () => {
    expect(automationRetry(1, 3)).toEqual({ terminal: false, status: 'pending', delaySeconds: 5 })
    expect(automationRetry(3, 3)).toEqual({ terminal: true, status: 'dead', delaySeconds: 0 })
  })

  it('rejects loop overlap and hard-budget admission', () => {
    expect(() => assertLoopAdmission({
      noOverlap: true, activeRunCount: 1, requestedCostMinor: '1', consumedCostMinor: '0',
    })).toThrow('Loop already has an active run')
    expect(() => assertLoopAdmission({
      noOverlap: false, activeRunCount: 0, requestedCostMinor: '101', consumedCostMinor: '900', hardCostMinor: '1000',
    })).toThrow('hard budget')
    expect(() => assertLoopAdmission({
      noOverlap: false,
      activeRunCount: 0,
      requestedCostMinor: '0',
      consumedCostMinor: '0',
      requestedTokens: 101,
      consumedTokens: 900,
      hardTokens: 1000,
    })).toThrow('hard token budget')
  })

  it('keeps unknown usage explicit', () => {
    expect(aggregateUsage([
      { inputTokens: 10, outputTokens: 5, costMinor: '8', costSource: 'provider_reported' },
      { runtimeMs: 200, toolCalls: 1, costSource: 'unknown' },
    ])).toMatchObject({ knownCostMinor: '8', unknownCostRecords: 1 })
  })

  it('preserves minor-unit precision beyond the JavaScript safe-integer range', () => {
    expect(rollupInitiative([
      {
        id: 'large-one',
        status: 'active',
        health: 'on_track',
        completedItems: 0,
        totalItems: 1,
        costBuckets: [{ currency: 'USD', knownCostMinor: '9007199254740993', hasUnknownCost: false }],
      },
      {
        id: 'large-two',
        status: 'active',
        health: 'on_track',
        completedItems: 0,
        totalItems: 1,
        costBuckets: [{ currency: 'USD', knownCostMinor: '2', hasUnknownCost: false }],
      },
    ]).currencyBuckets).toEqual([
      { currency: 'USD', knownCostMinor: '9007199254740995', hasUnknownCost: false },
    ])
    expect(aggregateUsage([
      { costMinor: '9007199254740993', costSource: 'provider_reported' },
      { costMinor: '2', costSource: 'manual' },
    ]).knownCostMinor).toBe('9007199254740995')
    expect(() => assertLoopAdmission({
      noOverlap: false,
      activeRunCount: 0,
      requestedCostMinor: '2',
      consumedCostMinor: '9007199254740993',
      hardCostMinor: '9007199254740994',
    })).toThrow('hard budget')
  })

  it('explains project health from source links and uncertainty', () => {
    const forecast = explainProjectForecast({
      now: new Date('2026-07-26T00:00:00Z'),
      targetAt: new Date('2026-07-25T00:00:00Z'),
      progressPercent: 75,
      sources: [{
        id: 'source-1',
        kind: 'work_item',
        observedAt: new Date('2026-07-26T00:00:00Z'),
        weight: 0.8,
        signal: -1,
        explanation: 'Two blocking work items remain.',
      }],
    })
    expect(forecast.health).toBe('off_track')
    expect(forecast.explanation).toContain('Two blocking work items remain.')
    expect(forecast.sources).toHaveLength(1)
    expect(forecast.uncertainty).not.toBe('')
  })

  it('orders notification delivery by product priority', () => {
    expect(shouldDeliverNotification({
      priority: 'approval', minimumPriority: 'agent_failure', kind: 'approval.requested', mutedKinds: [],
    })).toBe(true)
    expect(shouldDeliverNotification({
      priority: 'update', minimumPriority: 'mention', kind: 'project.updated', mutedKinds: [],
    })).toBe(false)
    expect(shouldDeliverNotification({
      priority: 'input', minimumPriority: 'update', kind: 'session.input', mutedKinds: ['session.input'],
    })).toBe(false)
  })
})
