import { describe, expect, it, vi } from 'vitest'
import { RetentionScheduler } from './retention-scheduler.js'

describe('RetentionScheduler', () => {
  it('runs independently without overlapping an in-flight tick', async () => {
    vi.useFakeTimers()
    let release: (() => void) | undefined
    const tick = vi.fn(async () => {
      await new Promise<void>(resolve => { release = resolve })
    })
    const scheduler = new RetentionScheduler({
      tick,
      close: async () => {},
      intervalMs: 100,
      ioTimeoutMs: 1_000,
      progressStaleMs: 2_000,
    })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(500)
    expect(tick).toHaveBeenCalledOnce()
    expect(scheduler.inFlight).toBe(true)
    release?.()
    await Promise.resolve()
    await Promise.resolve()
    await scheduler.stop()
    vi.useRealTimers()
  })

  it('fails readiness when I/O times out or progress becomes stale', async () => {
    vi.useFakeTimers()
    let now = 0
    let release: (() => void) | undefined
    const scheduler = new RetentionScheduler({
      tick: async () => {
        await new Promise<void>(resolve => { release = resolve })
      },
      close: async () => {},
      intervalMs: 100,
      ioTimeoutMs: 50,
      progressStaleMs: 100,
      now: () => now,
    })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(1)
    now = 51
    await vi.advanceTimersByTimeAsync(50)
    expect(() => scheduler.assertReady()).toThrow('RETENTION_IO_TIMEOUT')
    release?.()
    await Promise.resolve()
    await Promise.resolve()
    await scheduler.stop()

    const healthy = new RetentionScheduler({
      tick: async () => {},
      close: async () => {},
      intervalMs: 1_000,
      ioTimeoutMs: 50,
      progressStaleMs: 100,
      now: () => now,
    })
    healthy.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(() => healthy.assertReady()).not.toThrow()
    now += 101
    expect(() => healthy.assertReady()).toThrow('RETENTION_PROGRESS_STALE')
    await healthy.stop()
    vi.useRealTimers()
  })

  it('aggregates an in-flight failure with close failure', async () => {
    vi.useFakeTimers()
    let rejectTick: ((error: Error) => void) | undefined
    const scheduler = new RetentionScheduler({
      tick: async () => new Promise<void>((_resolve, reject) => {
        rejectTick = reject
      }),
      close: async () => {
        throw new Error('close failed')
      },
      intervalMs: 100,
      ioTimeoutMs: 1_000,
      progressStaleMs: 2_000,
    })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    const stopping = scheduler.stop()
    rejectTick?.(new Error('tick failed'))
    await expect(stopping).rejects.toMatchObject({
      name: 'AggregateError',
      errors: [expect.objectContaining({ message: 'close failed' })],
    })
    vi.useRealTimers()
  })
})
