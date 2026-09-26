import { describe, expect, it, vi } from 'vitest'
import {
  deriveTurnTelemetry,
  emitTurnTelemetry,
  evaluateWorkbenchSlo,
  percentile,
  summarizeWorkbenchSlo,
  workbenchSloThresholds,
  type WorkbenchTelemetryLogger,
  type WorkbenchTurnTelemetryInput,
} from './workbench-slo.js'

const turn = (overrides: Partial<WorkbenchTurnTelemetryInput> = {}): WorkbenchTurnTelemetryInput => ({
  turnId: 'turn-1',
  conversationId: 'conversation-1',
  status: 'settled',
  errorCode: null,
  stopReason: null,
  queuedAt: '2026-09-26T00:00:00.000Z',
  dispatchRequestedAt: '2026-09-26T00:00:00.500Z',
  startedAt: '2026-09-26T00:00:02.000Z',
  settledAt: '2026-09-26T00:00:10.000Z',
  ...overrides,
})

describe('workbench turn telemetry derivation', () => {
  it('derives queue wait, dispatch lag, run duration and total from durable timestamps', () => {
    const telemetry = deriveTurnTelemetry(turn(), { attemptId: 'a1', turnId: 'turn-1', attemptNo: 1, outcome: 'settled', usage: { totalTokens: 1234 } })
    expect(telemetry).toMatchObject({
      status: 'settled',
      terminal: true,
      outcome: 'settled',
      queueWaitMs: 2000,
      dispatchLagMs: 500,
      runDurationMs: 8000,
      totalDurationMs: 10000,
      totalTokens: 1234,
    })
  })

  it('reports null rather than zero when a timestamp is missing', () => {
    const telemetry = deriveTurnTelemetry(turn({ status: 'queued', dispatchRequestedAt: null, startedAt: null, settledAt: null }))
    expect(telemetry.queueWaitMs).toBeNull()
    expect(telemetry.runDurationMs).toBeNull()
    expect(telemetry.totalDurationMs).toBeNull()
    expect(telemetry.totalTokens).toBeNull()
    expect(telemetry.terminal).toBe(false)
    expect(telemetry.outcome).toBeNull()
  })

  it('never reports a negative latency when writer clocks disagree', () => {
    const telemetry = deriveTurnTelemetry(turn({ startedAt: '2026-09-26T00:00:05.000Z', settledAt: '2026-09-26T00:00:01.000Z' }))
    expect(telemetry.runDurationMs).toBe(0)
  })

  it('treats every terminal status as an outcome and non-terminal as none', () => {
    for (const status of ['settled', 'failed', 'canceled', 'stopped'] as const) {
      const telemetry = deriveTurnTelemetry(turn({ status }))
      expect(telemetry.terminal, status).toBe(true)
      expect(telemetry.outcome, status).toBe(status)
    }
    const running = deriveTurnTelemetry(turn({ status: 'running', settledAt: null }))
    expect(running.terminal).toBe(false)
    expect(running.outcome).toBeNull()
  })

  it('rejects a negative or non-finite token total instead of trusting the runner', () => {
    const negative = deriveTurnTelemetry(turn(), { attemptId: 'a1', turnId: 'turn-1', attemptNo: 1, outcome: 'settled', usage: { totalTokens: -5 } })
    expect(negative.totalTokens).toBeNull()
    const infinite = deriveTurnTelemetry(turn(), { attemptId: 'a1', turnId: 'turn-1', attemptNo: 1, outcome: 'settled', usage: { totalTokens: Number.POSITIVE_INFINITY } })
    expect(infinite.totalTokens).toBeNull()
  })

  it('returns an immutable record so callers cannot mutate derived signals', () => {
    const telemetry = deriveTurnTelemetry(turn())
    expect(Object.isFrozen(telemetry)).toBe(true)
  })
})

describe('workbench percentile helper', () => {
  it('uses nearest-rank percentiles and returns null for an empty set', () => {
    expect(percentile([], 0.95)).toBeNull()
    expect(percentile([10], 0.5)).toBe(10)
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20)
    expect(percentile([10, 20, 30, 40], 0.95)).toBe(40)
    // Unsorted input must still rank correctly.
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(20)
  })
})

describe('workbench SLO summary and thresholds', () => {
  const samples = [
    deriveTurnTelemetry(turn({ turnId: 't1' })),
    deriveTurnTelemetry(turn({ turnId: 't2', status: 'failed', errorCode: 'UPSTREAM_ERROR' })),
    deriveTurnTelemetry(turn({ turnId: 't3', status: 'stopped', stopReason: 'user_stop' })),
    deriveTurnTelemetry(turn({ turnId: 't4', status: 'settled' })),
  ]

  it('counts outcomes and derives an error rate over terminal turns only', () => {
    const summary = summarizeWorkbenchSlo(samples)
    expect(summary).toMatchObject({ turns: 4, terminalTurns: 4, settled: 2, failed: 1, canceled: 0, stopped: 1 })
    expect(summary.errorRate).toBeCloseTo(0.5, 5)
  })

  it('does not divide by zero when nothing is terminal yet', () => {
    const summary = summarizeWorkbenchSlo([deriveTurnTelemetry(turn({ status: 'running', settledAt: null }))])
    expect(summary.terminalTurns).toBe(0)
    expect(summary.errorRate).toBe(0)
  })

  it('flags only the thresholds actually breached', () => {
    const summary = summarizeWorkbenchSlo(samples)
    // Fixture latency is 2s queue / 8s run and a 50% error rate, so only error rate breaches.
    const violations = evaluateWorkbenchSlo(summary)
    expect(violations.map(violation => violation.metric)).toEqual(['error_rate'])
    expect(Object.isFrozen(violations)).toBe(true)
  })

  it('reports no violations for a healthy baseline', () => {
    const healthy = summarizeWorkbenchSlo([deriveTurnTelemetry(turn()), deriveTurnTelemetry(turn({ turnId: 't2' }))])
    expect(evaluateWorkbenchSlo(healthy)).toEqual([])
    expect(Object.isFrozen(workbenchSloThresholds)).toBe(true)
  })
})

describe('workbench telemetry emission', () => {
  it('emits lineage and latency without any prompt, tool argument, or secret field', () => {
    const info = vi.fn()
    const sink: WorkbenchTelemetryLogger = { info }
    emitTurnTelemetry(sink, {
      telemetry: deriveTurnTelemetry(turn(), { attemptId: 'a1', turnId: 'turn-1', attemptNo: 2, outcome: 'settled', usage: { totalTokens: 42 } }),
      attemptNo: 2,
      sessionId: 'session-1',
      correlationId: 'correlation-1',
    })
    expect(info).toHaveBeenCalledTimes(1)
    const [fields, message] = info.mock.calls[0]!
    expect(message).toBe('Workbench turn telemetry')
    expect(fields).toMatchObject({
      event: 'workbench.turn.telemetry',
      turnId: 'turn-1',
      conversationId: 'conversation-1',
      attemptNo: 2,
      sessionId: 'session-1',
      correlationId: 'correlation-1',
      outcome: 'settled',
      totalTokens: 42,
    })
    const keys = Object.keys(fields as Record<string, unknown>)
    expect(keys).not.toContain('content')
    expect(keys).not.toContain('prompt')
    expect(keys).not.toContain('arguments')
    expect(keys).not.toContain('secret')
  })

  it('emits a null correlation id rather than omitting a lineage field', () => {
    const info = vi.fn()
    emitTurnTelemetry({ info }, { telemetry: deriveTurnTelemetry(turn()), attemptNo: 1, sessionId: null })
    const [fields] = info.mock.calls[0]!
    expect(fields).toMatchObject({ sessionId: null, correlationId: null })
  })
})
