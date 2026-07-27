import { describe, expect, it, vi } from 'vitest'
import { DomainError } from '@workmesh/domain'
import {
  admitRealtimeClient,
  createRealtimeCapacity,
  markRealtimeCapacityExceeded,
  parseEventBatchLimit,
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
