export type RetentionSchedulerDependencies = Readonly<{
  tick: () => Promise<void>
  close: () => Promise<void>
  intervalMs: number
  ioTimeoutMs: number
  progressStaleMs: number
  now?: () => number
  onError?: (error: unknown) => void
}>

export class RetentionScheduler {
  readonly #dependencies: RetentionSchedulerDependencies
  readonly #now: () => number
  #accepting = false
  #timer: NodeJS.Timeout | undefined
  #timeout: NodeJS.Timeout | undefined
  #inFlight: Promise<void> | undefined
  #startedAt: number | undefined
  #lastCompletedAt: number | undefined
  #lastError: unknown

  constructor(dependencies: RetentionSchedulerDependencies) {
    this.#dependencies = dependencies
    this.#now = dependencies.now ?? Date.now
  }

  get inFlight(): boolean {
    return this.#inFlight !== undefined
  }

  start(): void {
    if (this.#accepting) return
    this.#accepting = true
    this.#schedule(0)
  }

  stopAdmission(): void {
    this.#accepting = false
    if (this.#timer) clearTimeout(this.#timer)
  }

  assertReady(): void {
    const now = this.#now()
    if (!this.#accepting) throw new Error('RETENTION_SCHEDULER_STOPPED')
    if (
      this.#startedAt !== undefined
      && this.#lastCompletedAt === undefined
      && now - this.#startedAt > this.#dependencies.ioTimeoutMs
    ) {
      throw new Error('RETENTION_IO_TIMEOUT')
    }
    if (
      this.#lastCompletedAt !== undefined
      && now - this.#lastCompletedAt > this.#dependencies.progressStaleMs
    ) {
      throw new Error('RETENTION_PROGRESS_STALE')
    }
    if (this.#lastError !== undefined) throw this.#lastError
    if (this.#lastCompletedAt === undefined)
      throw new Error('RETENTION_PROGRESS_NOT_OBSERVED')
  }

  async stop(): Promise<void> {
    this.stopAdmission()
    if (this.#timeout) clearTimeout(this.#timeout)
    const errors: unknown[] = []
    if (this.#inFlight) {
      try {
        await this.#inFlight
      } catch (error) {
        errors.push(error)
      }
    }
    try {
      await this.#dependencies.close()
    } catch (error) {
      errors.push(error)
    }
    if (errors.length > 0)
      throw new AggregateError(errors, 'RETENTION_SCHEDULER_CLOSE_FAILED')
  }

  #schedule(delayMs = this.#dependencies.intervalMs): void {
    if (!this.#accepting || this.#inFlight) return
    this.#timer = setTimeout(() => this.#run(), delayMs)
  }

  #run(): void {
    if (!this.#accepting || this.#inFlight) return
    this.#startedAt = this.#now()
    let timedOut = false
    this.#timeout = setTimeout(() => {
      timedOut = true
      this.#lastError = new Error('RETENTION_IO_TIMEOUT')
      this.#dependencies.onError?.(this.#lastError)
    }, this.#dependencies.ioTimeoutMs)
    this.#inFlight = this.#dependencies.tick()
      .then(() => {
        if (timedOut) return
        this.#lastCompletedAt = this.#now()
        this.#lastError = undefined
      })
      .catch(error => {
        this.#lastError = error
        this.#dependencies.onError?.(error)
      })
      .finally(() => {
        if (this.#timeout) clearTimeout(this.#timeout)
        this.#timeout = undefined
        this.#inFlight = undefined
        this.#schedule()
      })
  }
}
