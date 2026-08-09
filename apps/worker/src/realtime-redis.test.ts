import { describe, expect, it, vi } from 'vitest'
import {
  createRedisConnectionObserver,
  redisReconnectDelay,
  RedisStreamSink,
  type ClaimedEvent,
  type RedisStreamClient,
  type RedisStreamTrimOptions,
} from './index.js'

const event = (cursor = '42'): ClaimedEvent => ({
  id: '11111111-1111-4111-8111-111111111111',
  eventId: '22222222-2222-4222-8222-222222222222',
  cursor,
  workspaceId: '33333333-3333-4333-8333-333333333333',
  topic: 'notification.created',
  scope: 'private-aggregate',
  payload: { secret: 'must-not-enter-redis' },
  attemptCount: 1,
})

describe('Redis realtime wake hints', () => {
  it('rate-limits sanitized errors by transition and resets on ready', () => {
    let now = 1_000
    const log = vi.fn()
    const observer = createRedisConnectionObserver({
      log,
      now: () => now,
    })
    const error = Object.assign(
      new Error('redis://user:secret@redis.internal:6379'),
      { code: 'ECONNREFUSED' },
    )

    expect(() => observer.error(error)).not.toThrow()
    observer.error(error)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]![0]).toEqual({
      event: 'redis_hint_connection_error',
      errorName: 'Error',
      errorCode: 'ECONNREFUSED',
      occurrence: 'transition',
      suppressed: 0,
    })
    expect(JSON.stringify(log.mock.calls[0]![0])).not.toContain('secret')

    observer.error(Object.assign(new Error('different failure'), { code: 'ETIMEDOUT' }))
    expect(log).toHaveBeenCalledTimes(1)

    now += 10_000
    observer.error(error)
    expect(log.mock.calls[1]![0]).toMatchObject({
      occurrence: 'rate_limited_repeat',
      suppressed: 2,
    })

    observer.ready()
    observer.error(error)
    expect(log.mock.calls[2]![0]).toMatchObject({
      occurrence: 'transition',
      suppressed: 0,
    })
  })

  it('never throws from the Redis error listener when logging fails', () => {
    const observer = createRedisConnectionObserver({
      log: () => {
        throw new Error('logger unavailable')
      },
    })
    expect(() => observer.error(new Error('socket unavailable'))).not.toThrow()
  })

  it('uses a continuous capped reconnect strategy', () => {
    expect(redisReconnectDelay(0)).toBe(50)
    expect(redisReconnectDelay(5)).toBe(1_600)
    expect(redisReconnectDelay(6)).toBe(2_000)
    expect(redisReconnectDelay(100)).toBe(2_000)
  })

  it('awaits and reuses the initial connection before probing Redis', async () => {
    let isOpen = false
    let isReady = false
    let finishConnect: (() => void) | undefined
    const ping = vi.fn(async () => 'PONG')
    const connect = vi.fn(() => {
      isOpen = true
      return new Promise<void>((resolve) => {
        finishConnect = () => {
          isReady = true
          resolve()
        }
      })
    })
    const fake = {
      get isOpen() { return isOpen },
      get isReady() { return isReady },
      on: vi.fn(),
      connect,
      xAdd: vi.fn(async () => '1-0'),
      ping,
      quit: vi.fn(async () => 'OK'),
    } as unknown as RedisStreamClient
    const sink = new RedisStreamSink({
      redisUrl: 'redis://unused.test:6379',
      maxLen: 5_000,
      client: fake,
    })

    const firstProbe = sink.probe()
    const secondProbe = sink.probe()
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce())

    expect(ping).not.toHaveBeenCalled()
    finishConnect?.()
    await Promise.all([firstProbe, secondProbe])

    expect(connect).toHaveBeenCalledOnce()
    expect(ping).toHaveBeenCalledTimes(2)
  })

  it('reports a stable failed-connect error and permits a later probe retry', async () => {
    const connect = vi.fn(async () => {
      throw new Error('redis://user:secret@redis.internal:6379')
    })
    const ping = vi.fn(async () => 'PONG')
    const fake = {
      isOpen: false,
      isReady: false,
      on: vi.fn(),
      connect,
      xAdd: vi.fn(async () => '1-0'),
      ping,
      quit: vi.fn(async () => 'OK'),
    } as unknown as RedisStreamClient
    const sink = new RedisStreamSink({
      redisUrl: 'redis://unused.test:6379',
      maxLen: 5_000,
      client: fake,
    })

    await expect(sink.probe()).rejects.toThrow(
      'REDIS_STREAM_CONNECT_FAILED',
    )
    await expect(sink.probe()).rejects.toThrow(
      'REDIS_STREAM_CONNECT_FAILED',
    )

    expect(connect).toHaveBeenCalledTimes(2)
    expect(ping).not.toHaveBeenCalled()
  })

  it('times out probes without duplicating a hanging connect and retries after it settles', async () => {
    let isReady = false
    let connectAttempt = 0
    let finishFirstConnect: (() => void) | undefined
    const connect = vi.fn(() => {
      connectAttempt += 1
      if (connectAttempt === 1) {
        return new Promise<void>((resolve) => {
          finishFirstConnect = resolve
        })
      }
      isReady = true
      return Promise.resolve()
    })
    const ping = vi.fn(async () => 'PONG')
    const fake = {
      isOpen: false,
      get isReady() { return isReady },
      on: vi.fn(),
      connect,
      xAdd: vi.fn(async () => '1-0'),
      ping,
      quit: vi.fn(async () => 'OK'),
    } as unknown as RedisStreamClient
    const sink = new RedisStreamSink({
      redisUrl: 'redis://unused.test:6379',
      maxLen: 5_000,
      connectTimeoutMs: 10,
      client: fake,
    })

    await expect(sink.probe()).rejects.toThrow(
      'REDIS_STREAM_CONNECT_TIMEOUT',
    )
    await expect(sink.deliver(event())).rejects.toThrow(
      'REDIS_STREAM_NOT_READY',
    )
    await expect(sink.probe()).rejects.toThrow(
      'REDIS_STREAM_CONNECT_TIMEOUT',
    )

    expect(connect).toHaveBeenCalledOnce()
    expect(ping).not.toHaveBeenCalled()

    finishFirstConnect?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await sink.probe()

    expect(connect).toHaveBeenCalledTimes(2)
    expect(ping).toHaveBeenCalledOnce()
  })

  it('fast-fails while an open Redis client is not ready', async () => {
    const connect = vi.fn(() => new Promise<void>(() => undefined))
    const xAdd = vi.fn(async () => '1-0')
    const ping = vi.fn(async () => 'PONG')
    const fake = {
      isOpen: true,
      isReady: false,
      on: vi.fn(),
      connect,
      xAdd,
      ping,
      quit: vi.fn(async () => 'OK'),
    } as unknown as RedisStreamClient
    const sink = new RedisStreamSink({
      redisUrl: 'redis://unused.test:6379',
      maxLen: 5_000,
      client: fake,
    })

    expect(fake.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(fake.on).toHaveBeenCalledWith('ready', expect.any(Function))
    await expect(sink.deliver(event())).rejects.toThrow(
      'REDIS_STREAM_NOT_READY',
    )
    await expect(sink.probe()).rejects.toThrow(
      'REDIS_STREAM_NOT_READY',
    )
    expect(connect).not.toHaveBeenCalled()
    expect(xAdd).not.toHaveBeenCalled()
    expect(ping).not.toHaveBeenCalled()
  })

  it('clears a failed connect attempt so a later delivery retries', async () => {
    const connect = vi.fn(async () => {
      throw new Error('connect failed')
    })
    const fake = {
      isOpen: false,
      isReady: false,
      on: vi.fn(),
      connect,
      xAdd: vi.fn(async () => '1-0'),
      quit: vi.fn(async () => 'OK'),
    } as unknown as RedisStreamClient
    const sink = new RedisStreamSink({
      redisUrl: 'redis://unused.test:6379',
      maxLen: 5_000,
      client: fake,
    })

    await expect(sink.deliver(event())).rejects.toThrow(
      'REDIS_STREAM_NOT_READY',
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(sink.deliver(event())).rejects.toThrow(
      'REDIS_STREAM_NOT_READY',
    )
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('publishes on the next delivery after a background connect recovers', async () => {
    let isOpen = false
    let isReady = false
    const listeners = new Map<string, (value?: unknown) => void>()
    const xAdd = vi.fn(async () => '1-0')
    const fake = {
      get isOpen() {
        return isOpen
      },
      get isReady() {
        return isReady
      },
      on: vi.fn((name: string, listener: (value?: unknown) => void) => {
        listeners.set(name, listener)
      }),
      connect: vi.fn(async () => {
        isOpen = true
        isReady = true
        listeners.get('ready')?.()
      }),
      xAdd,
      quit: vi.fn(async () => {
        isOpen = false
        isReady = false
        return 'OK'
      }),
    } as unknown as RedisStreamClient
    const sink = new RedisStreamSink({
      redisUrl: 'redis://unused.test:6379',
      maxLen: 5_000,
      client: fake,
    })

    await expect(sink.deliver(event())).rejects.toThrow(
      'REDIS_STREAM_NOT_READY',
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    await sink.deliver(event())

    expect(fake.connect).toHaveBeenCalledOnce()
    expect(xAdd).toHaveBeenCalledOnce()
  })

  it('writes only the bounded cursor and Workspace hint fields', async () => {
    let isOpen = false
    let isReady = true
    const xAdd = vi.fn(async (
      _key: string,
      _id: string,
      _message: Record<string, string>,
      _options: RedisStreamTrimOptions,
    ) => '1-0')
    const fake = {
      get isOpen() { return isOpen },
      get isReady() { return isReady },
      on: vi.fn(),
      connect: vi.fn(async () => { isOpen = true; isReady = true }),
      xAdd,
      quit: vi.fn(async () => { isOpen = false; isReady = false; return 'OK' }),
    } as unknown as RedisStreamClient
    const sink = new RedisStreamSink({
      redisUrl: 'redis://unused.test:6379',
      maxLen: 5_000,
      client: fake,
    })

    await sink.deliver(event())

    expect(xAdd).toHaveBeenCalledWith(
      'workmesh:domain-events',
      '*',
      {
        cursor: '42',
        workspaceId: '33333333-3333-4333-8333-333333333333',
      },
      {
        TRIM: {
          strategy: 'MAXLEN',
          strategyModifier: '~',
          threshold: 5_000,
        },
      },
    )
    expect(Object.keys(xAdd.mock.calls[0]![2])).toEqual([
      'cursor',
      'workspaceId',
    ])
  })
})
