// WM-WEBPI-20260924 W19 — Session budget utilization derivation.
//
// A Session budget is a set of *caps* stored on the session row
// (maxRuntimeSeconds / maxInputTokens / maxOutputTokens / maxCostUsd). The
// design system's signature "Session telemetry bar" has to turn that budget red
// once execution approaches the cap, so the Web needs a *ratio*, not a cap.
//
// This module owns the ratio because it is domain meaning, not presentation:
// the projection derives it once and the UI only renders it. Two invariants:
//
//   * An unmeasurable limit reports measurable:false with a null ratio. A
//     missing usage figure is never rendered as zero, and an unknown price is
//     never turned into a precise-looking cost.
//   * Clock skew between writers can never surface as negative consumption, and
//     a ratio past the cap is clamped so an over-budget session reads as
//     exhausted rather than as an unbounded percentage.

export type SessionBudgetLimit = 'runtimeSeconds' | 'inputTokens' | 'outputTokens' | 'costUsd'

export type SessionBudgetUtilization = Readonly<{
  limit: SessionBudgetLimit
  cap: number
  used: number | null
  ratio: number | null
  measurable: boolean
  warning: boolean
  exhausted: boolean
}>

/** Frozen so the bar's red state is a testable threshold, not a styling guess. */
export const sessionBudgetWarningRatio = 0.85

export type SessionBudgetUsage = Readonly<{
  inputTokens?: number | null
  outputTokens?: number | null
  costUsd?: number | null
}>

type CapSource = Readonly<{ limit: SessionBudgetLimit; key: string; usageKey: keyof SessionBudgetUsage | null }>

const capSources: readonly CapSource[] = [
  { limit: 'runtimeSeconds', key: 'maxRuntimeSeconds', usageKey: null },
  { limit: 'inputTokens', key: 'maxInputTokens', usageKey: 'inputTokens' },
  { limit: 'outputTokens', key: 'maxOutputTokens', usageKey: 'outputTokens' },
  { limit: 'costUsd', key: 'maxCostUsd', usageKey: 'costUsd' },
]

const finiteNonNegative = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

const elapsedSeconds = (startedAt: string | null, observedAt: string): number | null => {
  if (!startedAt) return null
  const start = Date.parse(startedAt)
  const observed = Date.parse(observedAt)
  if (!Number.isFinite(start) || !Number.isFinite(observed)) return null
  // A writer whose clock runs behind must not produce negative consumption.
  return Math.max(0, (observed - start) / 1_000)
}

const measure = (limit: SessionBudgetLimit, cap: number, used: number | null): SessionBudgetUtilization => {
  const measurable = used !== null && cap > 0
  const ratio = measurable ? Math.min(1, (used as number) / cap) : null
  return Object.freeze({
    limit,
    cap,
    used,
    ratio,
    measurable,
    warning: ratio !== null && ratio >= sessionBudgetWarningRatio,
    exhausted: ratio !== null && ratio >= 1,
  })
}

/**
 * Derives one entry per configured cap. A budget with no caps yields no
 * entries, so a Session that declares no budget renders no bar rather than an
 * empty or invented one.
 */
export function deriveSessionBudgetUtilization(input: Readonly<{
  budget: Readonly<Record<string, number>>
  startedAt: string | null
  observedAt: string
  usage?: SessionBudgetUsage | null
}>): readonly SessionBudgetUtilization[] {
  return Object.freeze(
    capSources.flatMap((source) => {
      const cap = finiteNonNegative(input.budget[source.key])
      if (cap === null) return []
      const used = source.usageKey === null
        ? elapsedSeconds(input.startedAt, input.observedAt)
        : finiteNonNegative(input.usage?.[source.usageKey])
      return [measure(source.limit, cap, used)]
    }),
  )
}

/** The single most urgent measurable entry, so a bar needs one state decision. */
export function worstSessionBudgetUtilization(
  utilization: readonly SessionBudgetUtilization[],
): SessionBudgetUtilization | null {
  let worst: SessionBudgetUtilization | null = null
  for (const entry of utilization) {
    if (entry.ratio === null) continue
    if (worst === null || worst.ratio === null || entry.ratio > worst.ratio) worst = entry
  }
  return worst
}
