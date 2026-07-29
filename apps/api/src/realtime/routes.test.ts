import { EventEmitter } from 'node:events'
import http, { createServer } from 'node:http'
import type { ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { DomainError } from '@workmesh/domain'
import {
  admitRealtimeClient,
  createRealtimeCapacity,
  finishRealtimeStream,
  markRealtimeCapacityExceeded,
  parseEventBatchLimit,
  writeRealtimeChunk,
  writeRealtimeStreamHeaders,
} from './routes.js'

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('realtime event list limit', () => {
  it('accepts only canonical integers from 1 through 500', () => {
    expect(parseEventBatchLimit(undefined, 100)).toBe(100)
    expect(parseEventBatchLimit('1', 100)).toBe(1)
    expect(parseEventBatchLimit('500', 100)).toBe(500)
    for (const value of ['0', '01', '1junk', '1.5', '-1', '501', ' 1'])
      expect(() => parseEventBatchLimit(value, 100)).toThrowError(
        expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      )
  })
})

describe('realtime stream response', () => {
  it('flushes successful admission headers before an idle heartbeat', async () => {
    const server = createServer((_request, response) => {
      writeRealtimeStreamHeaders(response, 'http://web.test')
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('TEST_SERVER_ADDRESS_MISSING')
      const response = await new Promise<http.IncomingMessage>(
        (resolve, reject) => {
          const request = http.get(
            `http://127.0.0.1:${address.port}/api/v1/events/stream`,
          )
          const timer = setTimeout(() => {
            request.destroy()
            reject(new Error('SSE_HEADERS_NOT_FLUSHED'))
          }, 1_000)
          request.once('response', incoming => {
            clearTimeout(timer)
            resolve(incoming)
          })
          request.once('error', reject)
        },
      )
      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toBe('text/event-stream')
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://web.test',
      )
      response.destroy()
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  const responseStub = (writeResult: boolean): ServerResponse =>
    Object.assign(new EventEmitter(), {
      write: vi.fn(() => writeResult),
      end: vi.fn(),
      destroy: vi.fn(),
      destroyed: false,
      writableEnded: false,
    }) as unknown as ServerResponse

  it('destroys the connection after a backpressure drain timeout', async () => {
    const response = responseStub(false)
    const sent = await writeRealtimeChunk(response, 'event data', 1)

    expect(sent).toBe(false)
    finishRealtimeStream(response, sent ? 'graceful' : 'backpressure')
    expect(response.destroy).toHaveBeenCalledOnce()
    expect(response.end).not.toHaveBeenCalled()
  })

  it('ends ordinarily without destroying when the write is accepted', async () => {
    const response = responseStub(true)
    const sent = await writeRealtimeChunk(response, 'event data', 1)

    expect(sent).toBe(true)
    finishRealtimeStream(response, sent ? 'graceful' : 'backpressure')
    expect(response.end).toHaveBeenCalledOnce()
    expect(response.destroy).not.toHaveBeenCalled()
  })
})

describe('realtime stream capacity admission', () => {
  it('reserves before a gated availability check and reuses a failed slot', async () => {
    const capacity = createRealtimeCapacity(1)
    const firstAssertEntered = deferred()
    const releaseFirstAssert = deferred()
    const first = admitRealtimeClient(capacity, async () => {
      firstAssertEntered.resolve()
      await releaseFirstAssert.promise
      throw new DomainError('CURSOR_EXPIRED', 'Test cursor expired')
    })

    await firstAssertEntered.promise
    await expect(
      admitRealtimeClient(capacity, async () => undefined),
    ).rejects.toMatchObject({
      code: 'REALTIME_CAPACITY_EXCEEDED',
      details: { retryable: true, retryAfterSeconds: 1 },
    })

    releaseFirstAssert.resolve()
    await expect(first).rejects.toMatchObject({ code: 'CURSOR_EXPIRED' })
    const releaseAfterFailure = await admitRealtimeClient(
      capacity,
      async () => undefined,
    )
    releaseAfterFailure()
    releaseAfterFailure()
    const releaseAfterDuplicateCleanup = await admitRealtimeClient(
      capacity,
      async () => undefined,
    )
    releaseAfterDuplicateCleanup()
  })

  it('admits a replacement when the client closes during availability', async () => {
    const capacity = createRealtimeCapacity(1)
    const availabilityEntered = deferred()
    const completeAvailability = deferred()
    let releaseOnClose: (() => void) | undefined
    const first = admitRealtimeClient(
      capacity,
      async () => {
        availabilityEntered.resolve()
        await completeAvailability.promise
      },
      release => {
        releaseOnClose = release
      },
    )
    await availabilityEntered.promise
    await expect(
      admitRealtimeClient(capacity, async () => undefined),
    ).rejects.toMatchObject({ code: 'REALTIME_CAPACITY_EXCEEDED' })

    releaseOnClose!()
    releaseOnClose!()
    const releaseReplacement = await admitRealtimeClient(
      capacity,
      async () => undefined,
    )
    releaseReplacement()
    completeAvailability.resolve()
    const firstRelease = await first
    firstRelease()
  })

  it('marks the structured capacity error as 503 with Retry-After', async () => {
    const header = vi.fn()
    const code = vi.fn()
    markRealtimeCapacityExceeded({ header, code })
    expect(header).toHaveBeenCalledWith('retry-after', '1')
    expect(code).toHaveBeenCalledWith(503)

    await expect(
      admitRealtimeClient(
        { tryAcquire: () => undefined },
        async () => undefined,
      ),
    ).rejects.toMatchObject({
      code: 'REALTIME_CAPACITY_EXCEEDED',
      details: { retryable: true, retryAfterSeconds: 1 },
    })
  })
})
