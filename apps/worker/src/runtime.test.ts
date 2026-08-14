import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorkerHealthServer, WorkerRuntime } from './runtime.js'

const servers: ReturnType<typeof createWorkerHealthServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve())
  })))
})

describe('Worker runtime', () => {
  it('withdraws admission and drains an in-flight tick before closing', async () => {
    let releaseTick: (() => void) | undefined
    let markTickStarted: (() => void) | undefined
    const tickStarted = new Promise<void>(resolve => {
      markTickStarted = resolve
    })
    const closed = vi.fn(async () => {})
    const stopAdmission = vi.fn()
    const runtime = new WorkerRuntime({
      tick: async () => {
        markTickStarted?.()
        await new Promise<void>(resolve => { releaseTick = resolve })
      },
      probe: async () => {},
      stopAdmission,
      close: closed,
      intervalMs: 60_000,
    })
    await runtime.start()
    await tickStarted
    const stopping = runtime.stop(1_000)
    expect(stopAdmission).toHaveBeenCalledOnce()
    expect(closed).not.toHaveBeenCalled()
    releaseTick?.()
    await stopping
    expect(closed).toHaveBeenCalledOnce()
    expect(runtime.live).toBe(false)
  })

  it('serves liveness independently and checks dependencies for readiness', async () => {
    let dependenciesReady = true
    const runtime = new WorkerRuntime({
      tick: async () => {},
      probe: async () => {
        if (!dependenciesReady) throw new Error('dependency unavailable')
      },
      stopAdmission: () => {},
      close: async () => {},
      intervalMs: 60_000,
    })
    await runtime.start()
    const server = createWorkerHealthServer(runtime)
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP address')
    dependenciesReady = false
    expect((await fetch(`http://127.0.0.1:${address.port}/livez`)).status).toBe(200)
    expect((await fetch(`http://127.0.0.1:${address.port}/readyz`)).status).toBe(503)
  })
})
