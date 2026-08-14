import { describe, expect, it, vi } from 'vitest'
import {
  compareRealtimeCursors,
  createRealtimeSubscriptionRegistry,
  delayWithAbort,
  isDurableEventCursor,
  parseRealtimeEvent,
  realtimeCheckpointKey,
  realtimeEventMatchesResources,
  realtimeResourceKey,
  runRealtimeLoop,
} from './realtime.js'

const id = 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'
const event = {
  cursor: '9007199254740993',
  id,
  event_type: 'work_item.updated',
  aggregate_type: 'work_item',
  aggregate_id: id,
  scopes: [{ type: 'team', id }],
  invalidates: [{ type: 'work_item', id }],
}

describe('web realtime state', () => {
  const identity = {
    workspaceId: id,
    actorId: 'human-actor',
  }
  const storage = () => {
    const entries = new Map<string, string>()
    return {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value) },
      entries,
    }
  }

  it('keeps identity checkpoints isolated by workspace, actor, and session', () => {
    const human = realtimeCheckpointKey({
      workspaceId: id,
      actorId: 'human',
    })
    const agentOne = realtimeCheckpointKey({
      workspaceId: id,
      actorId: 'agent',
      sessionId: 'session-one',
    })
    const agentTwo = realtimeCheckpointKey({
      workspaceId: id,
      actorId: 'agent',
      sessionId: 'session-two',
    })

    expect(new Set([human, agentOne, agentTwo]).size).toBe(3)
  })

  it('parses and compares exact cursors above 2^53', () => {
    expect(parseRealtimeEvent(JSON.stringify(event))).toMatchObject(event)
    expect(compareRealtimeCursors(
      '9007199254740993',
      '9007199254740992',
    )).toBe(1)
    expect(isDurableEventCursor('9007199254740993')).toBe(true)
    expect(isDurableEventCursor('01')).toBe(false)
  })

  it('matches exact typed resources and rejects unknown vocabulary', () => {
    expect(realtimeResourceKey({ type: 'work_item', id }))
      .toBe(`work_item:${id}`)
    expect(parseRealtimeEvent(JSON.stringify({
      ...event,
      scopes: [{ type: 'tenant', id }],
    }))).toBeUndefined()
  })

  it('routes comment and authority invalidations to durable parents', () => {
    const comment = {
      ...event,
      event_type: 'comment.updated',
      aggregate_type: 'comment',
      aggregate_id: 'comment-id',
      scopes: [
        { type: 'team' as const, id: 'team-id' },
        { type: 'project' as const, id: 'project-id' },
        { type: 'work_item' as const, id: 'work-item-id' },
      ],
      invalidates: [
        { type: 'team' as const, id: 'team-id' },
        { type: 'project' as const, id: 'project-id' },
        { type: 'work_item' as const, id: 'work-item-id' },
      ],
    }
    expect(realtimeEventMatchesResources(
      comment,
      new Set(['work_item:work-item-id']),
    )).toBe(true)
    expect(realtimeEventMatchesResources(
      comment,
      new Set(['project:other-project']),
    )).toBe(false)
    expect(realtimeEventMatchesResources(
      {
        ...comment,
        event_type: 'agent.team_access.updated',
        aggregate_type: 'agent_team_access',
        scopes: [{ type: 'team', id: 'team-id' }],
        invalidates: [{ type: 'team', id: 'team-id' }],
      },
      new Set(['team:team-id']),
    )).toBe(true)
  })

  it('delivers workspace-only subscriptions and removes them on cleanup', async () => {
    const registry = createRealtimeSubscriptionRegistry()
    const listener = vi.fn()
    const unsubscribe = registry.subscribe(
      [{ type: 'workspace', id }],
      listener,
    )
    await registry.dispatch({
      reason: 'event',
      event: {
        ...event,
        event_type: 'agent.updated',
        aggregate_type: 'agent',
        scopes: [{ type: 'workspace', id }],
        invalidates: [{ type: 'workspace', id }],
      },
    })
    expect(listener).toHaveBeenCalledTimes(1)

    await registry.dispatch({
      reason: 'event',
      event: {
        ...event,
        scopes: [{ type: 'team', id: 'other-team' }],
        invalidates: [{ type: 'work_item', id: 'other-item' }],
      },
    })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    await registry.dispatch({
      reason: 'event',
      event: {
        ...event,
        scopes: [{ type: 'workspace', id }],
        invalidates: [{ type: 'workspace', id }],
      },
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('delays clean EOF and heartbeat reconnects with bounded exponential backoff', async () => {
    const abort = new AbortController()
    const delays: number[] = []
    const fetchStream = vi.fn(async () => new Response(': heartbeat\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }))
    await runRealtimeLoop({
      signal: abort.signal,
      identity: vi.fn(async () => identity),
      fetchStream,
      storage: storage(),
      dispatch: vi.fn(async () => undefined),
      random: () => 0.5,
      sleep: vi.fn(async milliseconds => {
        delays.push(milliseconds)
        if (delays.length === 2) abort.abort()
      }),
    })

    expect(fetchStream).toHaveBeenCalledTimes(2)
    expect(delays).toEqual([250, 500])
  })

  it('removes abort listeners after every completed reconnect delay', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, 'addEventListener')
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    try {
      for (let index = 0; index < 20; index += 1) {
        const completed = delayWithAbort(10, controller.signal)
        await vi.advanceTimersByTimeAsync(10)
        await completed
      }
      expect(add).toHaveBeenCalledTimes(20)
      expect(remove).toHaveBeenCalledTimes(20)
      expect(clear).toHaveBeenCalledTimes(20)

      controller.abort()
      await vi.advanceTimersByTimeAsync(100)
      expect(remove).toHaveBeenCalledTimes(20)
      expect(clear).toHaveBeenCalledTimes(20)
    } finally {
      vi.useRealTimers()
    }
  })

  it('removes the listener and clears the timer once on cancellation', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, 'addEventListener')
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    try {
      const canceled = delayWithAbort(1_000, controller.signal)
      controller.abort(new Error('reconnect canceled'))
      await expect(canceled).rejects.toThrow('reconnect canceled')
      expect(add).toHaveBeenCalledTimes(1)
      expect(remove).toHaveBeenCalledTimes(1)
      expect(clear).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1_000)
      expect(remove).toHaveBeenCalledTimes(1)
      expect(clear).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('honors capacity Retry-After and recovers without a permanent stop', async () => {
    const abort = new AbortController()
    const fetchStream = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          code: 'REALTIME_CAPACITY_EXCEEDED',
          correlationId: 'capacity',
        },
      }), {
        status: 503,
        headers: { 'retry-after': '1' },
      }))
      .mockResolvedValueOnce(new Response(
        `id: ${event.cursor}\ndata: ${JSON.stringify(event)}\n\n`,
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        },
      ))
    const delays: number[] = []
    const dispatch = vi.fn(async (invalidation: { reason: string }) => {
      if (invalidation.reason === 'event') abort.abort()
    })

    await runRealtimeLoop({
      signal: abort.signal,
      identity: vi.fn(async () => identity),
      fetchStream,
      storage: storage(),
      dispatch,
      random: () => 0.5,
      sleep: vi.fn(async milliseconds => { delays.push(milliseconds) }),
    })

    expect(delays).toEqual([1_000])
    expect(fetchStream).toHaveBeenCalledTimes(2)
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'event',
    }))
  })

  it('resyncs an expired cursor once and treats authorization denial as terminal', async () => {
    const checkpoint = storage()
    const fetchStream = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          code: 'CURSOR_EXPIRED',
          details: {
            resyncCursor: '12',
            resyncRequired: true,
          },
        },
      }), { status: 409 }))
      .mockResolvedValueOnce(new Response('{}', { status: 403 }))
    const delays: number[] = []
    const dispatch = vi.fn(async () => undefined)

    await runRealtimeLoop({
      signal: new AbortController().signal,
      identity: vi.fn(async () => identity),
      fetchStream,
      storage: checkpoint,
      dispatch,
      random: () => 0.5,
      sleep: vi.fn(async milliseconds => { delays.push(milliseconds) }),
    })

    expect(delays).toEqual([250])
    expect(dispatch).toHaveBeenCalledWith({ reason: 'resync' })
    expect(checkpoint.entries.get(realtimeCheckpointKey(identity))).toBe('12')
    expect(fetchStream.mock.calls[1]![0]).toBe('12')
  })
})
