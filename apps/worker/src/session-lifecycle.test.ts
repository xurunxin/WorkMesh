import { describe, expect, it, vi } from 'vitest'
import {
  classifyHeartbeatLiveness,
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
