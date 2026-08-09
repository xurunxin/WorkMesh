import type { Pool } from 'pg'
import type {
  RealtimeWakeHint,
  RealtimeWakeSource,
  WakeAvailability,
} from './wake-source.js'
import { compareDurableCursors, parseDurableCursor } from './cursor.js'

export type RealtimeMetricEvent =
  | 'wake_hint'
  | 'reconcile_changed'
  | 'reconcile_error'
  | 'wake_unavailable'
  | 'delivery_batch'
  | 'cursor_expired'
  | 'slow_client'

export type RealtimeMetricRecorder = Readonly<{
  record: (event: RealtimeMetricEvent) => void
}>

export type RealtimeCoordinator = Readonly<{
  subscribe: (workspaceId: string, listener: () => void) => () => void
  record: (event: RealtimeMetricEvent) => void
  close: () => Promise<void>
}>

const noMetrics: RealtimeMetricRecorder = { record: () => undefined }

export function createRealtimeCoordinator({
  db,
  wakeSource,
  metrics = noMetrics,
  onReconcileError,
  healthyReconcileMs = 15_000,
  fallbackReconcileMs = 1_000,
}: {
  db: Pool
  wakeSource: RealtimeWakeSource
  metrics?: RealtimeMetricRecorder
  onReconcileError?: (error: unknown) => void
  healthyReconcileMs?: number
  fallbackReconcileMs?: number
}): RealtimeCoordinator {
  const listeners = new Map<string, Set<() => void>>()
  const highwater = new Map<string, string>()
  const retentionFloors = new Map<string, string>()
  let availability: WakeAvailability = 'unavailable'
  let started = false
  let closed = false
  let reconciling = false

  const notify = (workspaceId: string): void => {
    for (const listener of listeners.get(workspaceId) ?? []) listener()
  }

  const hint = (value: RealtimeWakeHint): void => {
    if (!listeners.has(value.workspaceId)) return
    metrics.record('wake_hint')
    const previous = highwater.get(value.workspaceId)
    if (
      previous === undefined
      || compareDurableCursors(value.cursor, previous) > 0
    )
      highwater.set(value.workspaceId, value.cursor)
    notify(value.workspaceId)
  }

  const setAvailability = (next: WakeAvailability): void => {
    availability = next
    if (next === 'unavailable') metrics.record('wake_unavailable')
  }

  const reconcile = async (): Promise<void> => {
    if (closed || reconciling || listeners.size === 0) return
    reconciling = true
    try {
      const workspaceIds = [...listeners.keys()]
      const result = await db.query<{
        workspace_id: string
        cursor: string
        retention_floor: string
      }>(
        `SELECT requested.workspace_id,
                COALESCE(max(events.cursor),0)::text AS cursor,
                COALESCE(max(retention.pruned_through_cursor),0)::text
                  AS retention_floor
         FROM unnest($1::uuid[]) requested(workspace_id)
         LEFT JOIN domain_events events
           ON events.workspace_id=requested.workspace_id
         LEFT JOIN event_retention_state retention
           ON retention.workspace_id=requested.workspace_id
         GROUP BY requested.workspace_id`,
        [workspaceIds],
      )
      for (const row of result.rows) {
        const cursor = parseDurableCursor(row.cursor)
        const retentionFloor = parseDurableCursor(row.retention_floor)
        const previous = highwater.get(row.workspace_id)
        const previousFloor = retentionFloors.get(row.workspace_id)
        if (
          previous === undefined
          || compareDurableCursors(cursor, previous) > 0
          || previousFloor === undefined
          || compareDurableCursors(retentionFloor, previousFloor) > 0
        ) {
          highwater.set(row.workspace_id, cursor)
          retentionFloors.set(row.workspace_id, retentionFloor)
          metrics.record('reconcile_changed')
          notify(row.workspace_id)
        }
      }
    } catch (error) {
      metrics.record('reconcile_error')
      try {
        onReconcileError?.(error)
      } catch {
        // Observability must never turn a recoverable reconcile failure into
        // an unhandled rejection or suppress the next scheduled retry.
      }
    } finally {
      reconciling = false
    }
  }

  const healthyTimer = setInterval(() => {
    if (availability === 'healthy') void reconcile()
  }, healthyReconcileMs)
  healthyTimer.unref()
  const fallbackTimer = setInterval(() => {
    if (availability === 'unavailable') void reconcile()
  }, fallbackReconcileMs)
  fallbackTimer.unref()

  const ensureStarted = (): void => {
    if (started) return
    started = true
    wakeSource.start(hint, setAvailability)
  }

  const subscribe = (workspaceId: string, listener: () => void): (() => void) => {
    if (closed) throw new Error('REALTIME_COORDINATOR_CLOSED')
    ensureStarted()
    const workspaceListeners = listeners.get(workspaceId) ?? new Set()
    workspaceListeners.add(listener)
    listeners.set(workspaceId, workspaceListeners)
    void reconcile()
    return () => {
      workspaceListeners.delete(listener)
      if (workspaceListeners.size === 0) {
        listeners.delete(workspaceId)
        highwater.delete(workspaceId)
        retentionFloors.delete(workspaceId)
      }
    }
  }

  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    clearInterval(healthyTimer)
    clearInterval(fallbackTimer)
    listeners.clear()
    highwater.clear()
    retentionFloors.clear()
    await wakeSource.close()
  }

  return { subscribe, record: event => metrics.record(event), close }
}
