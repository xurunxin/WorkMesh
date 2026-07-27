import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import {
  createRealtimeCoordinator,
} from './coordinator.js'
import type {
  RealtimeWakeHint,
  RealtimeWakeSource,
  WakeAvailability,
} from './wake-source.js'

const workspaceId = 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'

class FakeWakeSource implements RealtimeWakeSource {
  hint?: (hint: RealtimeWakeHint) => void
  availability?: (value: WakeAvailability) => void
  start(
    onHint: (hint: RealtimeWakeHint) => void,
    onAvailability: (value: WakeAvailability) => void,
  ): void {
    this.hint = onHint
    this.availability = onAvailability
    onAvailability('unavailable')
  }
  async close(): Promise<void> {}
}

describe('realtime coordinator', () => {
  it('recovers from PostgreSQL at startup and after instance restart', async () => {
    let cursor = '9007199254740993'
    const query = vi.fn(async () => ({
      rows: [{
        workspace_id: workspaceId,
        cursor,
        retention_floor: '0',
      }],
    }))
    const create = () => createRealtimeCoordinator({
      db: { query } as unknown as Pool,
      wakeSource: new FakeWakeSource(),
      healthyReconcileMs: 60_000,
      fallbackReconcileMs: 60_000,
    })

    const first = create()
    const firstListener = vi.fn()
    first.subscribe(workspaceId, firstListener)
    await vi.waitFor(() => expect(firstListener).toHaveBeenCalled())
    await first.close()

    cursor = '9007199254740994'
    const restarted = create()
    const restartedListener = vi.fn()
    restarted.subscribe(workspaceId, restartedListener)
    await vi.waitFor(() => expect(restartedListener).toHaveBeenCalled())
    expect(query).toHaveBeenCalledTimes(2)
    await restarted.close()
  })

  it('uses one shared fallback reconciliation when Redis is unavailable', async () => {
    let cursor = '0'
    const query = vi.fn(async () => ({
      rows: [{
        workspace_id: workspaceId,
        cursor,
        retention_floor: '0',
      }],
    }))
    const wake = new FakeWakeSource()
    const coordinator = createRealtimeCoordinator({
      db: { query } as unknown as Pool,
      wakeSource: wake,
      healthyReconcileMs: 60_000,
      fallbackReconcileMs: 10,
    })
    const first = vi.fn()
    const second = vi.fn()
    coordinator.subscribe(workspaceId, first)
    coordinator.subscribe(workspaceId, second)
    await vi.waitFor(() => expect(query).toHaveBeenCalled())
    first.mockClear()
    second.mockClear()
    query.mockClear()

    cursor = '1'
    await vi.waitFor(() => expect(first).toHaveBeenCalled(), {
      timeout: 500,
    })
    expect(second).toHaveBeenCalled()
    expect(query.mock.calls.length).toBeLessThan(10)
    await coordinator.close()
  })

  it('treats duplicate Redis hints as lossy notifications, not replay', async () => {
    const query = vi.fn(async () => ({
      rows: [{
        workspace_id: workspaceId,
        cursor: '0',
        retention_floor: '0',
      }],
    }))
    const wake = new FakeWakeSource()
    const coordinator = createRealtimeCoordinator({
      db: { query } as unknown as Pool,
      wakeSource: wake,
      healthyReconcileMs: 60_000,
      fallbackReconcileMs: 60_000,
    })
    const listener = vi.fn()
    coordinator.subscribe(workspaceId, listener)
    await vi.waitFor(() => expect(listener).toHaveBeenCalled())
    listener.mockClear()

    wake.hint?.({ workspaceId, cursor: '2' })
    wake.hint?.({ workspaceId, cursor: '2' })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(query).toHaveBeenCalledTimes(1)
    await coordinator.close()
  })

  it('contains a rejected reconcile and succeeds on a later retry', async () => {
    const failure = new Error('temporary postgres outage')
    const query = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue({
        rows: [{
          workspace_id: workspaceId,
          cursor: '1',
          retention_floor: '0',
        }],
      })
    const metrics = { record: vi.fn() }
    const onReconcileError = vi.fn()
    const coordinator = createRealtimeCoordinator({
      db: { query } as unknown as Pool,
      wakeSource: new FakeWakeSource(),
      metrics,
      onReconcileError,
      healthyReconcileMs: 60_000,
      fallbackReconcileMs: 10,
    })
    const listener = vi.fn()
    coordinator.subscribe(workspaceId, listener)

    await vi.waitFor(() => expect(onReconcileError).toHaveBeenCalledWith(failure))
    await vi.waitFor(() => expect(listener).toHaveBeenCalled(), {
      timeout: 500,
    })
    expect(query.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(metrics.record).toHaveBeenCalledWith('reconcile_error')
    expect(metrics.record).toHaveBeenCalledWith('reconcile_changed')
    await coordinator.close()
  })
})
