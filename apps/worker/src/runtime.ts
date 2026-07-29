import { createServer, type Server } from 'node:http'

export type WorkerRuntimeDependencies = {
  tick: () => Promise<void>
  probe: () => Promise<void>
  stopAdmission: () => void
  close: () => Promise<void>
  onError?: (error: unknown) => void
  intervalMs?: number
}

export class WorkerRuntime {
  readonly #dependencies: WorkerRuntimeDependencies
  #accepting = false
  #live = true
  #timer: NodeJS.Timeout | undefined
  #inFlight: Promise<void> | undefined

  constructor(dependencies: WorkerRuntimeDependencies) {
    this.#dependencies = dependencies
  }

  get live(): boolean {
    return this.#live
  }

  async ready(): Promise<boolean> {
    if (!this.#accepting) return false
    try {
      await this.#dependencies.probe()
      return true
    } catch {
      return false
    }
  }

  async start(): Promise<void> {
    await this.#dependencies.probe()
    this.#accepting = true
    this.#schedule(0)
  }

  async stop(timeoutMs: number): Promise<void> {
    if (!this.#accepting && !this.#live) return
    this.#accepting = false
    this.#dependencies.stopAdmission()
    if (this.#timer) clearTimeout(this.#timer)
    const drain = (this.#inFlight ?? Promise.resolve())
      .then(() => this.#dependencies.close())
    let timeout: NodeJS.Timeout | undefined
    try {
      await Promise.race([
        drain,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('WORKER_SHUTDOWN_TIMEOUT')),
            timeoutMs,
          )
        }),
      ])
      this.#live = false
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  #schedule(delayMs = this.#dependencies.intervalMs ?? 1_000): void {
    if (!this.#accepting) return
    this.#timer = setTimeout(() => {
      this.#inFlight = this.#dependencies.tick()
        .catch(error => this.#dependencies.onError?.(error))
        .finally(() => {
          this.#inFlight = undefined
          this.#schedule()
        })
    }, delayMs)
  }
}

export function createWorkerHealthServer(runtime: WorkerRuntime): Server {
  return createServer(async (request, response) => {
    if (request.url === '/livez') {
      response.writeHead(runtime.live ? 200 : 503, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ status: runtime.live ? 'ok' : 'not_live' }))
      return
    }
    if (request.url === '/readyz') {
      const ready = await runtime.ready()
      response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ status: ready ? 'ok' : 'not_ready' }))
      return
    }
    response.writeHead(404).end()
  })
}
