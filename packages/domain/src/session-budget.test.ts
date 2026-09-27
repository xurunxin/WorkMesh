import { describe, expect, it } from 'vitest'
import {
  deriveSessionBudgetUtilization,
  sessionBudgetWarningRatio,
  worstSessionBudgetUtilization,
} from './session-budget.js'

const at = (seconds: number): string => new Date(Date.UTC(2026, 8, 27, 12, 0, seconds)).toISOString()

describe('deriveSessionBudgetUtilization', () => {
  it('derives a runtime ratio from session start and observation time', () => {
    const [runtime] = deriveSessionBudgetUtilization({
      budget: { maxRuntimeSeconds: 200 },
      startedAt: at(0),
      observedAt: at(100),
    })
    expect(runtime).toEqual({
      limit: 'runtimeSeconds',
      cap: 200,
      used: 100,
      ratio: 0.5,
      measurable: true,
      warning: false,
      exhausted: false,
    })
  })

  it('warns exactly at the frozen threshold, not before it', () => {
    const justUnder = deriveSessionBudgetUtilization({
      budget: { maxRuntimeSeconds: 1_000 },
      startedAt: at(0),
      observedAt: at(849),
    })[0]!
    const atThreshold = deriveSessionBudgetUtilization({
      budget: { maxRuntimeSeconds: 1_000 },
      startedAt: at(0),
      observedAt: at(850),
    })[0]!
    expect(sessionBudgetWarningRatio).toBe(0.85)
    expect(justUnder.warning).toBe(false)
    expect(atThreshold.warning).toBe(true)
    expect(atThreshold.exhausted).toBe(false)
  })

  it('clamps an over-cap session to an exhausted ratio of 1', () => {
    const runtime = deriveSessionBudgetUtilization({
      budget: { maxRuntimeSeconds: 60 },
      startedAt: at(0),
      observedAt: at(300),
    })[0]!
    expect(runtime.used).toBe(300)
    expect(runtime.ratio).toBe(1)
    expect(runtime.exhausted).toBe(true)
  })

  it('never surfaces clock skew as negative consumption', () => {
    const runtime = deriveSessionBudgetUtilization({
      budget: { maxRuntimeSeconds: 60 },
      startedAt: at(120),
      observedAt: at(0),
    })[0]!
    expect(runtime.used).toBe(0)
    expect(runtime.ratio).toBe(0)
  })

  it('reports an unmeasurable runtime instead of a fabricated zero', () => {
    const runtime = deriveSessionBudgetUtilization({
      budget: { maxRuntimeSeconds: 600 },
      startedAt: null,
      observedAt: at(30),
    })[0]!
    expect(runtime.measurable).toBe(false)
    expect(runtime.ratio).toBeNull()
    expect(runtime.used).toBeNull()
    expect(runtime.warning).toBe(false)
    expect(runtime.exhausted).toBe(false)
  })

  it('measures token and cost limits only when usage is actually reported', () => {
    const [input, output, cost] = deriveSessionBudgetUtilization({
      budget: { maxInputTokens: 1_000, maxOutputTokens: 500, maxCostUsd: 2 },
      startedAt: at(0),
      observedAt: at(10),
      usage: { inputTokens: 900, outputTokens: null, costUsd: null },
    })
    expect(input).toMatchObject({ used: 900, ratio: 0.9, measurable: true, warning: true })
    // A null usage figure stays unknown: it is never read as zero consumption.
    expect(output).toMatchObject({ used: null, ratio: null, measurable: false })
    expect(cost).toMatchObject({ used: null, ratio: null, measurable: false })
  })

  it('returns no entries when the session declares no budget', () => {
    expect(deriveSessionBudgetUtilization({ budget: {}, startedAt: at(0), observedAt: at(5) })).toEqual([])
  })

  it('does not derive a ratio from a degenerate zero cap', () => {
    const [cost] = deriveSessionBudgetUtilization({
      budget: { maxCostUsd: 0 },
      startedAt: at(0),
      observedAt: at(5),
      usage: { costUsd: 4 },
    })
    expect(cost!.cap).toBe(0)
    expect(cost!.measurable).toBe(false)
    expect(cost!.ratio).toBeNull()
  })
})

describe('worstSessionBudgetUtilization', () => {
  it('picks the most urgent measurable entry and ignores unknown ones', () => {
    const entries = deriveSessionBudgetUtilization({
      budget: { maxRuntimeSeconds: 1_000, maxInputTokens: 1_000, maxOutputTokens: 1_000 },
      startedAt: at(0),
      observedAt: at(200),
      usage: { inputTokens: 950, outputTokens: null },
    })
    expect(worstSessionBudgetUtilization(entries)).toMatchObject({ limit: 'inputTokens', ratio: 0.95 })
  })

  it('returns null when nothing is measurable', () => {
    expect(worstSessionBudgetUtilization([])).toBeNull()
    expect(worstSessionBudgetUtilization(deriveSessionBudgetUtilization({
      budget: { maxRuntimeSeconds: 600 },
      startedAt: null,
      observedAt: at(10),
    }))).toBeNull()
  })
})
