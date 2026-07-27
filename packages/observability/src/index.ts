export interface Logger { info(fields: Record<string, unknown>, message: string): void; error(fields: Record<string, unknown>, message: string): void }
export const logger: Logger = { info: (fields, message) => console.info(JSON.stringify({ level: 'info', message, ...fields })), error: (fields, message) => console.error(JSON.stringify({ level: 'error', message, ...fields })) }
export type AuthRateLimitEndpoint = 'install' | 'login' | 'agent_token' | 'handoff_target'
export type AuthRateLimitOutcome = 'allowed' | 'limited' | 'unavailable' | 'credential_failure' | 'credential_success'
export const authRateLimitEndpoints = ['install', 'login', 'agent_token', 'handoff_target'] as const
export const authRateLimitOutcomes = ['allowed', 'limited', 'unavailable', 'credential_failure', 'credential_success'] as const
export type AuthRateLimitCount = Readonly<{ endpointClass: AuthRateLimitEndpoint; outcome: AuthRateLimitOutcome; count: number }>
export interface AuthRateLimitSummaryLogger { info(fields: Record<string, unknown>, message: string): void }

export class AuthRateLimitMetrics {
  readonly #counters = new Map<string, number>()
  #timer?: NodeJS.Timeout
  #logger?: AuthRateLimitSummaryLogger
  #intervalMs = 0

  record(endpoint: AuthRateLimitEndpoint, outcome: AuthRateLimitOutcome): void {
    if (!authRateLimitEndpoints.includes(endpoint) || !authRateLimitOutcomes.includes(outcome))
      throw new RangeError('Authentication rate-limit metric label is outside the fixed vocabulary')
    const key = `${endpoint}:${outcome}`
    this.#counters.set(key, (this.#counters.get(key) ?? 0) + 1)
  }

  snapshot(): readonly AuthRateLimitCount[] {
    return authRateLimitEndpoints.flatMap(endpointClass =>
      authRateLimitOutcomes.flatMap(outcome => {
        const count = this.#counters.get(`${endpointClass}:${outcome}`) ?? 0
        return count > 0 ? [{ endpointClass, outcome, count }] : []
      }))
  }

  reset(): void {
    this.#counters.clear()
  }

  flush(): boolean {
    const counts = this.snapshot()
    if (!counts.length || !this.#logger) return false
    try {
      this.#logger.info(
        { event: 'auth.rate_limit.summary', intervalMs: this.#intervalMs, counts },
        'Authentication rate-limit interval summary',
      )
    } finally {
      this.reset()
    }
    return true
  }

  startSummarySink(logger: AuthRateLimitSummaryLogger, intervalMs: number): void {
    this.stopSummarySink(false)
    this.#logger = logger
    this.#intervalMs = intervalMs
    this.#timer = setInterval(() => {
      try {
        this.flush()
      } catch {
        // Observability must not change request availability or process lifecycle.
      }
    }, intervalMs)
    this.#timer.unref()
  }

  stopSummarySink(flush = true): void {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = undefined
    if (flush) {
      try {
        this.flush()
      } catch {
        // A failing log sink is not an authorization or availability signal.
      }
    }
    this.#logger = undefined
    this.#intervalMs = 0
  }
}
