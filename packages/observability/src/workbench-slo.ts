// WM-WEBPI-20260924 W17 — measurable Turn/Attempt telemetry and SLO baselines.
//
// The durable columns already exist on workbench_turns / workbench_runner_attempts
// (queued_at, dispatch_requested_at, started_at, settled_at, usage, error_code,
// stop_reason). This module derives the observable signals W17 requires from those
// facts rather than duplicating them into a second ledger:
//
//   * queue wait    — queued_at  -> started_at  (admission latency)
//   * dispatch lag  — queued_at  -> dispatch_requested_at (outbox wake latency)
//   * run duration  — started_at -> settled_at  (execution latency)
//   * error rate    — terminal outcomes that are not 'settled'
//   * token budget  — per-turn usage totals
//   * lineage       — conversationId/turnId/attemptId/sessionId/correlationId
//
// Derivation is pure so both the API process and offline analysis can reuse it,
// and so the numbers are reproducible from durable rows alone.

export type WorkbenchTurnTerminalStatus = 'settled' | 'failed' | 'canceled' | 'stopped'
export type WorkbenchTurnStatus = 'queued' | 'dispatching' | 'running' | WorkbenchTurnTerminalStatus

export const workbenchTerminalTurnStatuses: readonly WorkbenchTurnTerminalStatus[] =
  ['settled', 'failed', 'canceled', 'stopped']

export type WorkbenchTurnTelemetryInput = Readonly<{
  turnId: string
  conversationId: string
  status: WorkbenchTurnStatus
  errorCode?: string | null
  stopReason?: string | null
  queuedAt: string | null
  dispatchRequestedAt?: string | null
  startedAt: string | null
  settledAt: string | null
}>

export type WorkbenchAttemptTelemetryInput = Readonly<{
  attemptId: string
  turnId: string
  attemptNo: number
  outcome: string
  usage?: Readonly<{ totalTokens?: number | null }> | null
}>

export type WorkbenchTurnTelemetry = Readonly<{
  turnId: string
  conversationId: string
  status: WorkbenchTurnStatus
  terminal: boolean
  outcome: 'settled' | 'failed' | 'canceled' | 'stopped' | null
  queueWaitMs: number | null
  dispatchLagMs: number | null
  runDurationMs: number | null
  totalDurationMs: number | null
  totalTokens: number | null
  errorCode: string | null
}>

const milliseconds = (from: string | null, to: string | null): number | null => {
  if (!from || !to) return null
  const start = Date.parse(from)
  const end = Date.parse(to)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  // Clock skew between writer processes must never surface as negative latency.
  return Math.max(0, end - start)
}

const isTerminal = (status: WorkbenchTurnStatus): status is WorkbenchTurnTerminalStatus =>
  (workbenchTerminalTurnStatuses as readonly string[]).includes(status)

/**
 * Derives bounded latency/token signals for one Turn. Missing timestamps yield
 * null rather than a fabricated zero so an incomplete Turn is never counted as
 * an instant one.
 */
export function deriveTurnTelemetry(
  turn: WorkbenchTurnTelemetryInput,
  attempt: WorkbenchAttemptTelemetryInput | null = null,
): WorkbenchTurnTelemetry {
  const terminal = isTerminal(turn.status)
  const totalTokens = attempt?.usage?.totalTokens
  return Object.freeze({
    turnId: turn.turnId,
    conversationId: turn.conversationId,
    status: turn.status,
    terminal,
    outcome: terminal ? turn.status : null,
    queueWaitMs: milliseconds(turn.queuedAt, turn.startedAt),
    dispatchLagMs: milliseconds(turn.queuedAt, turn.dispatchRequestedAt ?? null),
    runDurationMs: milliseconds(turn.startedAt, turn.settledAt),
    totalDurationMs: milliseconds(turn.queuedAt, turn.settledAt),
    totalTokens: typeof totalTokens === 'number' && Number.isFinite(totalTokens) && totalTokens >= 0
      ? totalTokens
      : null,
    errorCode: turn.errorCode ?? null,
  })
}

export type WorkbenchSloSummary = Readonly<{
  turns: number
  terminalTurns: number
  settled: number
  failed: number
  canceled: number
  stopped: number
  errorRate: number
  queueWaitMs: WorkbenchLatencyDistribution
  dispatchLagMs: WorkbenchLatencyDistribution
  runDurationMs: WorkbenchLatencyDistribution
  totalTokens: number
}>

export type WorkbenchLatencyDistribution = Readonly<{
  samples: number
  p50: number | null
  p95: number | null
  max: number | null
}>

/** Nearest-rank percentile over the ascending sample set; null for no samples. */
export function percentile(samples: readonly number[], rank: number): number | null {
  if (samples.length === 0) return null
  const ordered = [...samples].sort((left, right) => left - right)
  const bounded = Math.min(1, Math.max(0, rank))
  const index = Math.min(ordered.length - 1, Math.ceil(bounded * ordered.length) - 1)
  return ordered[index] ?? null
}

const distribution = (samples: readonly number[]): WorkbenchLatencyDistribution => Object.freeze({
  samples: samples.length,
  p50: percentile(samples, 0.5),
  p95: percentile(samples, 0.95),
  max: samples.length ? Math.max(...samples) : null,
})

const collect = (values: readonly (number | null)[]): number[] =>
  values.filter((value): value is number => value !== null)

/** Aggregates per-Turn telemetry into the reproducible baseline W17 freezes. */
export function summarizeWorkbenchSlo(samples: readonly WorkbenchTurnTelemetry[]): WorkbenchSloSummary {
  const terminal = samples.filter(sample => sample.terminal)
  const count = (status: WorkbenchTurnTerminalStatus): number =>
    terminal.filter(sample => sample.status === status).length
  const settled = count('settled')
  return Object.freeze({
    turns: samples.length,
    terminalTurns: terminal.length,
    settled,
    failed: count('failed'),
    canceled: count('canceled'),
    stopped: count('stopped'),
    // Only terminal Turns carry an outcome, so the denominator is terminal Turns.
    errorRate: terminal.length === 0 ? 0 : (terminal.length - settled) / terminal.length,
    queueWaitMs: distribution(collect(samples.map(sample => sample.queueWaitMs))),
    dispatchLagMs: distribution(collect(samples.map(sample => sample.dispatchLagMs))),
    runDurationMs: distribution(collect(samples.map(sample => sample.runDurationMs))),
    totalTokens: samples.reduce((sum, sample) => sum + (sample.totalTokens ?? 0), 0),
  })
}

/** Frozen, testable SLO thresholds. Exceeding one is a measured regression, not a guess. */
export const workbenchSloThresholds = Object.freeze({
  queueWaitP95Ms: 5_000,
  dispatchLagP95Ms: 2_000,
  runDurationP95Ms: 120_000,
  errorRate: 0.05,
})

export type WorkbenchSloViolation = Readonly<{ metric: string; actual: number; limit: number }>

/** Returns only the breached thresholds so a caller can log/alert without branching. */
export function evaluateWorkbenchSlo(
  summary: WorkbenchSloSummary,
  thresholds: typeof workbenchSloThresholds = workbenchSloThresholds,
): readonly WorkbenchSloViolation[] {
  const violations: WorkbenchSloViolation[] = []
  const check = (metric: string, actual: number | null, limit: number): void => {
    if (actual !== null && actual > limit) violations.push({ metric, actual, limit })
  }
  check('queue_wait_p95_ms', summary.queueWaitMs.p95, thresholds.queueWaitP95Ms)
  check('dispatch_lag_p95_ms', summary.dispatchLagMs.p95, thresholds.dispatchLagP95Ms)
  check('run_duration_p95_ms', summary.runDurationMs.p95, thresholds.runDurationP95Ms)
  // A zero-terminal set reports errorRate 0 by construction, so only flag a real rate.
  if (summary.terminalTurns > 0) check('error_rate', summary.errorRate, thresholds.errorRate)
  return Object.freeze(violations)
}

export type WorkbenchTelemetryLogger = {
  info(fields: Record<string, unknown>, message: string): void
}

/**
 * Emits one structured telemetry record per settled Attempt. Carries correlation
 * lineage only — never model content, prompts, tool arguments, or secrets.
 */
export function emitTurnTelemetry(
  logger: WorkbenchTelemetryLogger,
  input: Readonly<{
    telemetry: WorkbenchTurnTelemetry
    attemptNo: number
    sessionId: string | null
    correlationId?: string | null
  }>,
): void {
  const { telemetry, attemptNo, sessionId, correlationId } = input
  logger.info({
    event: 'workbench.turn.telemetry',
    turnId: telemetry.turnId,
    conversationId: telemetry.conversationId,
    attemptNo,
    sessionId,
    correlationId: correlationId ?? null,
    status: telemetry.status,
    outcome: telemetry.outcome,
    queueWaitMs: telemetry.queueWaitMs,
    dispatchLagMs: telemetry.dispatchLagMs,
    runDurationMs: telemetry.runDurationMs,
    totalDurationMs: telemetry.totalDurationMs,
    totalTokens: telemetry.totalTokens,
    errorCode: telemetry.errorCode,
  }, 'Workbench turn telemetry')
}
