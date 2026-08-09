import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuthRateLimitMetrics,
  authRateLimitEndpoints,
  authRateLimitOutcomes,
} from './index.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('authentication rate-limit metric summaries', () => {
  it('flushes and resets a fixed-cardinality structured summary on the timer', () => {
    vi.useFakeTimers()
    const records: Array<{ fields: Record<string, unknown>; message: string }> = []
    const metrics = new AuthRateLimitMetrics()
    metrics.startSummarySink(
      { info: (fields, message) => records.push({ fields, message }) },
      1_000,
    )
    metrics.record('login', 'allowed')
    metrics.record('login', 'allowed')
    metrics.record('agent_token', 'limited')

    expect(metrics.snapshot()).toEqual([
      { endpointClass: 'login', outcome: 'allowed', count: 2 },
      { endpointClass: 'agent_token', outcome: 'limited', count: 1 },
    ])
    vi.advanceTimersByTime(1_000)

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      fields: {
        event: 'auth.rate_limit.summary',
        intervalMs: 1_000,
        counts: [
          { endpointClass: 'login', outcome: 'allowed', count: 2 },
          { endpointClass: 'agent_token', outcome: 'limited', count: 1 },
        ],
      },
    })
    expect(metrics.snapshot()).toEqual([])
    metrics.stopSummarySink()
    vi.advanceTimersByTime(2_000)
    expect(records).toHaveLength(1)
  })

  it('bounds labels to the four endpoint classes and five outcomes', () => {
    expect(authRateLimitEndpoints).toHaveLength(4)
    expect(authRateLimitOutcomes).toHaveLength(5)
    const metrics = new AuthRateLimitMetrics()
    expect(() =>
      metrics.record('raw-user@example.test' as never, 'allowed'),
    ).toThrow(RangeError)
    expect(() =>
      metrics.record('login', 'raw-ip-address' as never),
    ).toThrow(RangeError)
    expect(metrics.snapshot()).toEqual([])
  })

  it('flushes residual counts exactly once when stopped', () => {
    const records: Array<Record<string, unknown>> = []
    const metrics = new AuthRateLimitMetrics()
    metrics.startSummarySink(
      { info: fields => records.push(fields) },
      60_000,
    )
    metrics.record('install', 'unavailable')
    metrics.stopSummarySink()
    metrics.stopSummarySink()
    expect(records).toHaveLength(1)
    expect(metrics.snapshot()).toEqual([])
  })
})
