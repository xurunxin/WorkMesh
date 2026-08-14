'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { apiBase } from './api'

export type RealtimeResourceType =
  | 'workspace'
  | 'team'
  | 'project'
  | 'work_item'
  | 'session'
  | 'room'
  | 'artifact'
  | 'delivery'
export type RealtimeResource = Readonly<{
  type: RealtimeResourceType
  id: string
}>
export type RealtimeEvent = Readonly<{
  cursor: string
  id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string
  scopes: readonly RealtimeResource[]
  invalidates: readonly RealtimeResource[]
  [key: string]: unknown
}>
export type RealtimeInvalidation =
  | Readonly<{ reason: 'event'; event: RealtimeEvent }>
  | Readonly<{ reason: 'resync' }>
export type RealtimeConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'

type Subscriber = Readonly<{
  resources: ReadonlySet<string>
  listener: (
    invalidation: RealtimeInvalidation,
  ) => Promise<void> | void
}>
export type RealtimeSubscriptionRegistry = Readonly<{
  subscribe: RealtimeContextValue['subscribe']
  dispatch: (invalidation: RealtimeInvalidation) => Promise<void>
}>
type RealtimeContextValue = Readonly<{
  connectionState: RealtimeConnectionState
  subscribe: (
    resources: readonly RealtimeResource[],
    listener: (
      invalidation: RealtimeInvalidation,
    ) => Promise<void> | void,
  ) => () => void
}>

const RealtimeContext = createContext<RealtimeContextValue | undefined>(
  undefined,
)
const cursorPattern = /^(?:0|[1-9][0-9]{0,18})$/
const realtimeResourceTypes = new Set<RealtimeResourceType>([
  'workspace',
  'team',
  'project',
  'work_item',
  'session',
  'room',
  'artifact',
  'delivery',
])
const isRealtimeResource = (value: unknown): value is RealtimeResource => {
  if (!value || typeof value !== 'object') return false
  const resource = value as Partial<RealtimeResource>
  return (
    typeof resource.type === 'string'
    && realtimeResourceTypes.has(resource.type as RealtimeResourceType)
    && typeof resource.id === 'string'
  )
}
export const realtimeResourceKey = (resource: RealtimeResource): string =>
  `${resource.type}:${resource.id}`
export const realtimeEventMatchesResources = (
  event: RealtimeEvent,
  resources: ReadonlySet<string>,
): boolean =>
  [...event.scopes, ...event.invalidates].some(resource =>
    resources.has(realtimeResourceKey(resource)))

export const createRealtimeSubscriptionRegistry =
  (): RealtimeSubscriptionRegistry => {
    const subscribers = new Set<Subscriber>()
    return {
      subscribe: (resources, listener) => {
        const subscriber: Subscriber = {
          resources: new Set(resources.map(realtimeResourceKey)),
          listener,
        }
        subscribers.add(subscriber)
        return () => subscribers.delete(subscriber)
      },
      dispatch: async invalidation => {
        const deliveries: Array<Promise<void>> = []
        for (const subscriber of subscribers) {
          if (
            invalidation.reason === 'resync'
            || realtimeEventMatchesResources(
              invalidation.event,
              subscriber.resources,
            )
          )
            deliveries.push(Promise.resolve(subscriber.listener(invalidation)))
        }
        await Promise.all(deliveries)
      },
    }
  }
export const isDurableEventCursor = (value: unknown): value is string =>
  typeof value === 'string'
  && cursorPattern.test(value)
  && BigInt(value) <= 9_223_372_036_854_775_807n
export const compareRealtimeCursors = (
  left: string,
  right: string,
): number => {
  const leftValue = BigInt(left)
  const rightValue = BigInt(right)
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
}

export type RealtimeIdentity = Readonly<{
  actorId: string
  workspaceId: string
  sessionId?: string
}>

export const realtimeCheckpointKey = (identity: RealtimeIdentity): string =>
  [
    'workmesh.realtime.v2',
    identity.workspaceId,
    identity.actorId,
    identity.sessionId ?? 'human',
  ].join(':')

export function parseRealtimeEvent(data: string): RealtimeEvent | undefined {
  try {
    const event = JSON.parse(data) as Partial<RealtimeEvent>
    if (
      !isDurableEventCursor(event.cursor)
      || typeof event.id !== 'string'
      || typeof event.event_type !== 'string'
      || typeof event.aggregate_type !== 'string'
      || typeof event.aggregate_id !== 'string'
      || !Array.isArray(event.scopes)
      || !Array.isArray(event.invalidates)
      || !event.scopes.every(isRealtimeResource)
      || !event.invalidates.every(isRealtimeResource)
    )
      return undefined
    return event as RealtimeEvent
  } catch {
    return undefined
  }
}

async function *sseFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event?: string; id?: string; data?: string }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done }).replaceAll('\r\n', '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const frame: { event?: string; id?: string; data?: string } = {}
        const data: string[] = []
        for (const line of block.split('\n')) {
          if (!line || line.startsWith(':')) continue
          const separator = line.indexOf(':')
          const field = separator < 0 ? line : line.slice(0, separator)
          const raw = separator < 0 ? '' : line.slice(separator + 1)
          const text = raw.startsWith(' ') ? raw.slice(1) : raw
          if (field === 'event') frame.event = text
          else if (field === 'id') frame.id = text
          else if (field === 'data') data.push(text)
        }
        if (data.length) frame.data = data.join('\n')
        yield frame
        boundary = buffer.indexOf('\n\n')
      }
      if (done) return
    }
  } finally {
    reader.releaseLock()
  }
}

const retryAfterMilliseconds = (value: string | null): number | undefined => {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined
  const milliseconds = Number(value.trim()) * 1_000
  return Number.isSafeInteger(milliseconds) && milliseconds <= 30_000
    ? milliseconds
    : undefined
}

export const delayWithAbort = (
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (complete: () => void): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      complete()
    }
    const onAbort = (): void => finish(() => reject(signal.reason))
    signal.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => finish(resolve), milliseconds)
  })

export type RealtimeLoopOptions = Readonly<{
  signal: AbortSignal
  identity: () => Promise<RealtimeIdentity | undefined>
  fetchStream: (
    cursor: string,
    signal: AbortSignal,
  ) => Promise<Response>
  storage: Pick<Storage, 'getItem' | 'setItem'>
  dispatch: (invalidation: RealtimeInvalidation) => Promise<void>
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>
  random?: () => number
  isOnline?: () => boolean
  onStateChange?: (state: RealtimeConnectionState) => void
}>

/**
 * Maintains one replay-safe stream lifecycle. Clean EOF, post-header failures,
 * capacity responses, and other transient status codes all pass through the
 * same bounded, jittered and abort-aware reconnect delay.
 */
export async function runRealtimeLoop(
  options: RealtimeLoopOptions,
): Promise<void> {
  const seen = new Set<string>()
  const seenOrder: string[] = []
  const sleep = options.sleep ?? delayWithAbort
  const random = options.random ?? Math.random
  const isOnline = options.isOnline ?? (() => true)
  const reportState = options.onStateChange ?? (() => undefined)
  let retryAttempt = 0

  const pause = async (minimumMs = 0): Promise<void> => {
    reportState(isOnline() ? 'reconnecting' : 'offline')
    retryAttempt += 1
    const exponential = Math.min(10_000, 250 * 2 ** (retryAttempt - 1))
    const jittered = Math.round(exponential * (0.75 + random() * 0.5))
    await sleep(Math.min(30_000, Math.max(minimumMs, jittered)), options.signal)
  }

  while (!options.signal.aborted) {
    try {
      reportState(retryAttempt === 0 ? 'connecting' : 'reconnecting')
      const currentIdentity = await options.identity()
      if (!currentIdentity || options.signal.aborted) return
      const key = realtimeCheckpointKey(currentIdentity)
      const stored = options.storage.getItem(key)
      let cursor = isDurableEventCursor(stored) ? stored : '0'
      const response = await options.fetchStream(cursor, options.signal)
      if (response.status === 401 || response.status === 403) return
      if (response.status === 409) {
        const body = await response.json() as {
          error?: {
            code?: string
            details?: { resyncCursor?: unknown }
          }
        }
        const resyncCursor = body.error?.details?.resyncCursor
        if (
          body.error?.code === 'CURSOR_EXPIRED'
          && isDurableEventCursor(resyncCursor)
        ) {
          await options.dispatch({ reason: 'resync' })
          options.storage.setItem(key, resyncCursor)
          await pause()
          continue
        }
        return
      }
      if (!response.ok || !response.body) {
        if (response.status !== 429 && response.status < 500) return
        await pause(retryAfterMilliseconds(response.headers.get('retry-after')))
        continue
      }

      reportState('connected')
      let resyncRequested = false
      for await (const frame of sseFrames(response.body)) {
        if (options.signal.aborted) return
        // Heartbeats and comments intentionally contain no data.
        if (!frame.data) continue
        if (frame.event === 'control') {
          const control = JSON.parse(frame.data) as {
            type?: string
            error?: { details?: { resyncCursor?: unknown } }
          }
          const resyncCursor = control.error?.details?.resyncCursor
          if (
            control.type === 'cursor.expired'
            && isDurableEventCursor(resyncCursor)
          ) {
            await options.dispatch({ reason: 'resync' })
            options.storage.setItem(key, resyncCursor)
            resyncRequested = true
          }
          break
        }
        const event = parseRealtimeEvent(frame.data)
        if (!event || (frame.id && frame.id !== event.cursor)) continue
        if (seen.has(event.id)) {
          if (compareRealtimeCursors(event.cursor, cursor) > 0) {
            cursor = event.cursor
            options.storage.setItem(key, cursor)
          }
          continue
        }
        seen.add(event.id)
        seenOrder.push(event.id)
        if (seenOrder.length > 2_048)
          seen.delete(seenOrder.shift()!)
        if (compareRealtimeCursors(event.cursor, cursor) <= 0) continue
        cursor = event.cursor
        options.storage.setItem(key, cursor)
        retryAttempt = 0
        await options.dispatch({ reason: 'event', event })
      }
      if (options.signal.aborted) return
      // Both a control-frame resync and a clean EOF reconnect after a delay.
      await pause()
      if (resyncRequested) continue
    } catch {
      if (options.signal.aborted) return
      await pause()
    }
  }
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const registry = useRef<RealtimeSubscriptionRegistry | null>(null)
  registry.current ??= createRealtimeSubscriptionRegistry()
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>('connecting')

  const subscribe = useCallback((
    resources: readonly RealtimeResource[],
    listener: (invalidation: RealtimeInvalidation) => void,
  ): (() => void) => registry.current!.subscribe(resources, listener), [])

  useEffect(() => {
    const dispatch = async (
      invalidation: RealtimeInvalidation,
    ): Promise<void> => registry.current!.dispatch(invalidation)

    const abort = new AbortController()
    const identity = async (): Promise<RealtimeIdentity | undefined> => {
      const response = await fetch(`${apiBase}/api/v1/auth/me`, {
        headers: { accept: 'application/json' },
        credentials: 'include',
        signal: abort.signal,
      })
      if (response.status === 401) return undefined
      if (!response.ok) throw new Error(`Realtime identity failed (${response.status})`)
      const body = await response.json() as {
        actor?: {
          id?: string
          workspace_id?: string
          agent_session_id?: string
        }
      }
      if (!body.actor?.id || !body.actor.workspace_id) return undefined
      return {
        actorId: body.actor.id,
        workspaceId: body.actor.workspace_id,
        sessionId: body.actor.agent_session_id,
      }
    }

    void runRealtimeLoop({
      signal: abort.signal,
      identity,
      fetchStream: (cursor, signal) => fetch(
        `${apiBase}/api/v1/events/stream?cursor=${encodeURIComponent(cursor)}`,
        {
          headers: {
            accept: 'text/event-stream',
            'last-event-id': cursor,
          },
          credentials: 'include',
          signal,
        },
      ),
      storage: localStorage,
      dispatch,
      isOnline: () => navigator.onLine,
      onStateChange: setConnectionState,
    })
    return () => abort.abort()
  }, [])

  const value = useMemo(
    () => ({ connectionState, subscribe }),
    [connectionState, subscribe],
  )
  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtimeConnectionState(): RealtimeConnectionState {
  return useContext(RealtimeContext)?.connectionState ?? 'offline'
}

export function useRealtimeSubscription(
  resources: readonly RealtimeResource[],
  listener: (
    invalidation: RealtimeInvalidation,
  ) => Promise<void> | void,
): void {
  const realtime = useContext(RealtimeContext)
  const listenerRef = useRef(listener)
  listenerRef.current = listener
  const serialized = resources
    .map(realtimeResourceKey)
    .sort()
    .join('|')
  useEffect(() => {
    if (!realtime || resources.length === 0) return
    return realtime.subscribe(
      resources,
      invalidation => listenerRef.current(invalidation),
    )
  }, [realtime, serialized])
}
