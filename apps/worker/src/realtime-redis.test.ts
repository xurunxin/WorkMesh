import { describe, expect, it, vi } from 'vitest'
import {
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
  it('writes only the bounded cursor and Workspace hint fields', async () => {
    let isOpen = false
    const xAdd = vi.fn(async (
      _key: string,
      _id: string,
      _message: Record<string, string>,
      _options: RedisStreamTrimOptions,
    ) => '1-0')
    const fake = {
      get isOpen() { return isOpen },
      connect: vi.fn(async () => { isOpen = true }),
      xAdd,
      quit: vi.fn(async () => { isOpen = false; return 'OK' }),
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
