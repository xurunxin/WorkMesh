import type { ServerResponse } from 'node:http'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { DomainError } from '@workmesh/domain'
import type { ApiActor } from '../agent/types.js'
import type { EventReader } from './event-reader.js'
import type { RealtimeCoordinator } from './coordinator.js'
import { parseDurableCursor } from './cursor.js'

const header = (request: FastifyRequest, name: string): string | undefined =>
  request.headers[name] as string | undefined

export const parseEventBatchLimit = (
  value: string | undefined,
  fallback: number,
): number => {
  if (value === undefined) return fallback
  if (!/^[1-9][0-9]{0,2}$/.test(value))
    throw new DomainError(
      'VALIDATION_ERROR',
      'Event batch limit must be a canonical integer between 1 and 500',
    )
  const limit = Number(value)
  if (limit > 500)
    throw new DomainError(
      'VALIDATION_ERROR',
      'Event batch limit must be a canonical integer between 1 and 500',
    )
  return limit
}

const waitForDrain = async (
  response: ServerResponse,
  timeoutMs: number,
): Promise<boolean> =>
  new Promise(resolve => {
    let settled = false
    const finish = (value: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      response.off('drain', drained)
      response.off('close', closed)
      resolve(value)
    }
    const drained = (): void => finish(true)
    const closed = (): void => finish(false)
    const timer = setTimeout(() => finish(false), timeoutMs)
    response.once('drain', drained)
    response.once('close', closed)
  })

const write = async (
  reply: FastifyReply,
  chunk: string,
  timeoutMs: number,
): Promise<boolean> =>
  reply.raw.write(chunk)
    ? true
    : waitForDrain(reply.raw, timeoutMs)

const cursorExpiredControl = (error: DomainError): string =>
  `event: control\ndata: ${JSON.stringify({
    type: 'cursor.expired',
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  })}\n\n`

export type RealtimeCapacity = Readonly<{
  tryAcquire: () => (() => void) | undefined
}>

export function createRealtimeCapacity(maxClients: number): RealtimeCapacity {
  let activeClients = 0
  return {
    tryAcquire: () => {
      if (activeClients >= maxClients) return undefined
      activeClients += 1
      let released = false
      return () => {
        if (released) return
        released = true
        activeClients -= 1
      }
    },
  }
}

const capacityExceeded = (): DomainError =>
  new DomainError(
    'REALTIME_CAPACITY_EXCEEDED',
    'Realtime connection capacity is temporarily exhausted',
    { retryable: true, retryAfterSeconds: 1 },
  )

export const markRealtimeCapacityExceeded = (
  reply: Pick<FastifyReply, 'header' | 'code'>,
): void => {
  reply.header('retry-after', '1')
  reply.code(503)
}

export async function admitRealtimeClient(
  capacity: RealtimeCapacity,
  assertAvailable: () => Promise<unknown>,
  onAcquired?: (release: () => void) => void,
): Promise<() => void> {
  const release = capacity.tryAcquire()
  if (!release) throw capacityExceeded()
  try {
    onAcquired?.(release)
    await assertAvailable()
    return release
  } catch (error) {
    release()
    throw error
  }
}

export function registerRealtimeRoutes(
  app: FastifyInstance,
  {
    reader,
    coordinator,
    webOrigin,
    batchLimit = 100,
    heartbeatMs = 15_000,
    backpressureTimeoutMs = 5_000,
    maxClients = 1_000,
    onStreamError,
  }: {
    reader: EventReader
    coordinator: RealtimeCoordinator
    webOrigin: string
    batchLimit?: number
    heartbeatMs?: number
    backpressureTimeoutMs?: number
    maxClients?: number
    onStreamError?: (
      request: FastifyRequest,
      error: unknown,
    ) => Promise<void> | void
  },
): void {
  const capacity = createRealtimeCapacity(maxClients)

  app.get('/api/v1/events', async request => {
    const query = request.query as { cursor?: string; limit?: string }
    const cursor = parseDurableCursor(query.cursor ?? '0')
    const limit = parseEventBatchLimit(query.limit, batchLimit)
    return reader.list(request.actor! as unknown as ApiActor, cursor, limit)
  })

  app.get('/api/v1/events/stream', async (request, reply) => {
    let closed = false
    let cleanedUp = false
    let pendingWake = true
    let wake: (() => void) | undefined
    let unsubscribe: () => void = () => undefined
    let releaseCapacity: () => void = () => undefined
    let closeListenerRegistered = false
    const notify = (): void => {
      pendingWake = true
      wake?.()
    }

    function cleanup(): void {
      if (cleanedUp) return
      cleanedUp = true
      if (closeListenerRegistered) {
        request.raw.off('close', stop)
        closeListenerRegistered = false
      }
      try {
        unsubscribe()
      } finally {
        releaseCapacity()
      }
    }

    function stop(): void {
      closed = true
      wake?.()
      cleanup()
    }

    try {
      const query = request.query as { cursor?: string }
      let cursor = parseDurableCursor(
        header(request, 'last-event-id') ?? query.cursor ?? '0',
      )
      const actor = request.actor! as unknown as ApiActor

      // This check intentionally precedes response headers so an already
      // expired reconnect receives the ordinary structured HTTP 409 response.
      try {
        releaseCapacity = await admitRealtimeClient(
          capacity,
          () => reader.assertAvailable(actor.workspaceId, cursor),
          release => {
            releaseCapacity = release
            request.raw.once('close', stop)
            closeListenerRegistered = true
          },
        )
      } catch (error) {
        if (
          error instanceof DomainError
          && error.code === 'REALTIME_CAPACITY_EXCEEDED'
        )
          markRealtimeCapacityExceeded(reply)
        throw error
      }
      if (closed) return reply

      unsubscribe = coordinator.subscribe(actor.workspaceId, notify)
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'access-control-allow-origin': webOrigin,
        'access-control-allow-credentials': 'true',
      })

      const waitForWake = async (): Promise<'wake' | 'heartbeat' | 'closed'> => {
        if (closed) return 'closed'
        if (pendingWake) {
          pendingWake = false
          return 'wake'
        }
        return new Promise(resolve => {
          const timer = setTimeout(() => {
            wake = undefined
            resolve('heartbeat')
          }, heartbeatMs)
          wake = () => {
            clearTimeout(timer)
            wake = undefined
            resolve(closed ? 'closed' : 'wake')
          }
        })
      }

      void (async () => {
        try {
          while (!closed) {
            const signal = await waitForWake()
            if (signal === 'closed') break
            if (signal === 'heartbeat') {
              if (!await write(reply, ': heartbeat\n\n', backpressureTimeoutMs)) {
                coordinator.record('slow_client')
                break
              }
              continue
            }

            while (!closed) {
              let events
              try {
                events = await reader.list(actor, cursor, batchLimit)
              } catch (error) {
                if (
                  error instanceof DomainError
                  && error.code === 'CURSOR_EXPIRED'
                ) {
                  coordinator.record('cursor_expired')
                  await write(
                    reply,
                    cursorExpiredControl(error),
                    backpressureTimeoutMs,
                  )
                  closed = true
                  break
                }
                throw error
              }
              if (!events.length) break
              coordinator.record('delivery_batch')
              for (const event of events) {
                if (closed) break
                const sent = await write(
                  reply,
                  `id: ${event.cursor}\ndata: ${JSON.stringify(event)}\n\n`,
                  backpressureTimeoutMs,
                )
                if (!sent) {
                  coordinator.record('slow_client')
                  closed = true
                  break
                }
                cursor = event.cursor
              }
              if (events.length < batchLimit) break
            }
          }
        } catch (error) {
          await onStreamError?.(request, error)
        } finally {
          closed = true
          cleanup()
          if (!reply.raw.writableEnded) reply.raw.end()
        }
      })()
      return reply
    } catch (error) {
      cleanup()
      throw error
    }
  })
}
