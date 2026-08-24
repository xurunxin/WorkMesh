import { describe, expect, it, vi } from 'vitest'
import {
  classifyHeartbeatLiveness,
  createSessionLifecycleWorker,
  rebuildWorkItemExecutorProjections,
} from './session-lifecycle.js'

describe('heartbeat liveness', () => {
  const now = new Date('2026-07-23T00:00:00.000Z')

  it('classifies healthy, degraded, and stale without generating activities', () => {
    const input = { heartbeatIntervalSeconds: 30, staleAfterSeconds: 120, now }
    expect(classifyHeartbeatLiveness({ ...input, lastHeartbeatAt: '2026-07-22T23:59:10.000Z' })).toBe('healthy')
    expect(classifyHeartbeatLiveness({ ...input, lastHeartbeatAt: '2026-07-22T23:58:30.000Z' })).toBe('degraded')
    expect(classifyHeartbeatLiveness({ ...input, lastHeartbeatAt: '2026-07-22T23:58:00.000Z' })).toBe('stale')
  })

  it('uses acknowledged_at until the first heartbeat, with a legacy created_at fallback', () => {
    const input = { heartbeatIntervalSeconds: 30, staleAfterSeconds: 120, now }

    expect(classifyHeartbeatLiveness({
      ...input,
      acknowledgedAt: '2026-07-22T23:59:10.000Z',
      lastHeartbeatAt: null,
    })).toBe('healthy')
    expect(classifyHeartbeatLiveness({
      ...input,
      acknowledgedAt: null,
      createdAt: '2026-07-22T23:59:10.000Z',
      lastHeartbeatAt: null,
    })).toBe('healthy')
  })

  it('uses the first heartbeat as the authoritative baseline', () => {
    const input = { heartbeatIntervalSeconds: 30, staleAfterSeconds: 120, now }

    expect(classifyHeartbeatLiveness({
      ...input,
      acknowledgedAt: '2026-07-22T23:57:00.000Z',
      lastHeartbeatAt: '2026-07-22T23:59:10.000Z',
    })).toBe('healthy')
  })

  it('keeps the boundary just before stale active and stales at the threshold', () => {
    const input = { heartbeatIntervalSeconds: 30, staleAfterSeconds: 120, now }

    expect(classifyHeartbeatLiveness({
      ...input,
      lastHeartbeatAt: '2026-07-22T23:58:00.001Z',
    })).toBe('degraded')
    expect(classifyHeartbeatLiveness({
      ...input,
      lastHeartbeatAt: '2026-07-22T23:58:00.000Z',
    })).toBe('stale')
    expect(classifyHeartbeatLiveness({
      ...input,
      lastHeartbeatAt: '2026-07-22T23:57:59.999Z',
    })).toBe('stale')
  })

  it('is stable across duplicate liveness ticks when the baseline does not change', () => {
    const input = {
      heartbeatIntervalSeconds: 30,
      staleAfterSeconds: 120,
      now,
      acknowledgedAt: '2026-07-22T23:59:59.000Z',
      lastHeartbeatAt: null,
    }

    expect(classifyHeartbeatLiveness(input)).toBe('healthy')
    expect(classifyHeartbeatLiveness(input)).toBe('healthy')
  })

  it('does not stale an immediately acknowledged session and keeps the row lock', async () => {
    const acknowledgedAt = new Date()
    const query = vi.fn(async (statement: string) => {
      if (statement === 'BEGIN' || statement === 'COMMIT') return { rows: [], rowCount: 0 }
      if (statement.includes('FROM agent_sessions s')) {
        return {
          rows: [{
            id: '00000000-0000-4000-8000-000000000001',
            workspaceId: '00000000-0000-4000-8000-000000000002',
            teamId: '00000000-0000-4000-8000-000000000003',
            responsibleHumanActorId: '00000000-0000-4000-8000-000000000004',
            state: 'acknowledged',
            revision: 1,
            sequence: '0',
            heartbeatHealth: 'healthy',
            acknowledgedAt,
            createdAt: acknowledgedAt,
            lastHeartbeatAt: null,
            heartbeatIntervalSeconds: 30,
          }],
          rowCount: 1,
        }
      }
      throw new Error(`Unexpected query: ${statement}`)
    })
    const db = {
      connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
    }
    const worker = createSessionLifecycleWorker({
      db: db as never,
      heartbeatStaleAfterSeconds: 120,
    })

    expect(await worker.reconcileHeartbeatLiveness()).toBe(0)
    expect(query.mock.calls.some(([statement]) => statement.includes('FOR UPDATE OF s SKIP LOCKED'))).toBe(true)
    expect(query.mock.calls.some(([statement]) => statement.includes("SET state='stale'"))).toBe(false)
  })

  it('runs the scoped authoritative executor projection rebuild', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ rebuilt: 1 }] })
    const rebuilt = await rebuildWorkItemExecutorProjections(
      { query } as never,
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    )

    expect(rebuilt).toBe(1)
    expect(query).toHaveBeenCalledWith(
      'SELECT rebuild_work_item_executor_projections($1::uuid,$2::uuid) AS rebuilt',
      [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ],
    )
  })
})
