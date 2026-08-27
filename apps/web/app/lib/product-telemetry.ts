export const PRODUCT_METRIC_PREFIX = 'workmesh.product.'
export const PRODUCT_METRIC_MAX_ENTRIES = 200

export type ProductMetricName =
  | 'first_attention_detail'
  | 'attention_response'
  | 'consequence_preview'
  | 'run_detail_open'
  | 'evidence_navigation'
  | 'recovery_action'
  | 'navigation_restore'
  | 'realtime_degraded_duration'
  | 'projection_error'

export type ProductMetricSurface =
  | 'project'
  | 'work_item'
  | 'attention'
  | 'run'
  | 'inbox'
  | 'recovery'
  | 'evidence'
  | 'unknown'

export type ProductMetricActionClass =
  | 'open'
  | 'respond'
  | 'approve'
  | 'reject'
  | 'defer'
  | 'preview'
  | 'pause'
  | 'stop'
  | 'retry'
  | 'handoff'
  | 'steer'
  | 'back'
  | 'resync'
  | 'none'

export type ProductMetricOutcome = 'success' | 'failure' | 'cancel' | 'stale' | 'disabled'
export type ProductMetricErrorClass = 'none' | 'conflict' | 'forbidden' | 'not_found' | 'network' | 'server' | 'unknown'

type ProductMetricDimensions = Readonly<{
  surface: ProductMetricSurface
  actionClass?: ProductMetricActionClass
}>

type ProductMetricResult = Readonly<{
  outcome: ProductMetricOutcome
  errorClass?: ProductMetricErrorClass
}>

type ProductTelemetryEnvironment = Readonly<{
  now: () => number
  doNotTrack?: string | null
  disabled?: boolean
  entries: () => readonly { name: string }[]
  clear: (name: string) => void
  measure: (name: string, options: { start: number; duration: number; detail: unknown }) => void
}>

declare global {
  interface Window { __WORKMESH_DISABLE_PRODUCT_TELEMETRY__?: boolean }
}

const browserEnvironment = (): ProductTelemetryEnvironment | null => {
  if (typeof window === 'undefined' || typeof performance === 'undefined' || typeof performance.measure !== 'function') return null
  return {
    now: () => performance.now(),
    doNotTrack: navigator.doNotTrack,
    disabled: window.__WORKMESH_DISABLE_PRODUCT_TELEMETRY__ === true,
    entries: () => performance.getEntriesByType('measure'),
    clear: name => performance.clearMeasures(name),
    measure: (name, options) => performance.measure(name, options),
  }
}

export function recordProductMetric(
  name: ProductMetricName,
  durationMs: number,
  dimensions: ProductMetricDimensions,
  result: ProductMetricResult,
  environment: ProductTelemetryEnvironment | null = browserEnvironment(),
): boolean {
  if (!environment || environment.disabled || environment.doNotTrack === '1') return false
  const now = environment.now()
  const duration = Math.max(0, Math.min(300_000, now, Number.isFinite(durationMs) ? durationMs : 0))
  const productEntries = environment.entries().filter(entry => entry.name.startsWith(PRODUCT_METRIC_PREFIX))
  if (productEntries.length >= PRODUCT_METRIC_MAX_ENTRIES)
    for (const metricName of new Set(productEntries.map(entry => entry.name))) environment.clear(metricName)
  // Construct a new closed object rather than forwarding caller data. Extra
  // properties, paths, IDs, copy, payloads, and correlation IDs cannot enter it.
  const detail = {
    schemaVersion: 1,
    surface: dimensions.surface,
    actionClass: dimensions.actionClass ?? 'none',
    outcome: result.outcome,
    errorClass: result.errorClass ?? 'none',
  }
  environment.measure(`${PRODUCT_METRIC_PREFIX}${name}`, { start: now - duration, duration, detail })
  return true
}

export function startProductMetric(name: ProductMetricName, dimensions: ProductMetricDimensions) {
  const environment = browserEnvironment()
  const startedAt = environment?.now() ?? 0
  let finished = false
  return (result: ProductMetricResult): boolean => {
    if (finished) return false
    finished = true
    return recordProductMetric(name, (environment?.now() ?? startedAt) - startedAt, dimensions, result, environment)
  }
}

export function productMetricSurface(value: string): ProductMetricSurface {
  return value === 'project' || value === 'work_item' || value === 'attention' || value === 'run'
    || value === 'inbox' || value === 'recovery' || value === 'evidence' ? value : 'unknown'
}

export function productMetricError(reason: unknown): ProductMetricErrorClass {
  if (reason && typeof reason === 'object' && 'status' in reason) {
    const status = Number((reason as { status?: unknown }).status)
    if (status === 403) return 'forbidden'
    if (status === 404) return 'not_found'
    if (status === 409 || status === 412) return 'conflict'
    if (status >= 500) return 'server'
  }
  if (reason instanceof TypeError || (reason instanceof Error && /network|offline|fetch/i.test(reason.message))) return 'network'
  return 'unknown'
}
