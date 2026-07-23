import { describe, expect, it } from 'vitest'
import { classifyHeartbeatLiveness } from './session-lifecycle.js'

describe('heartbeat liveness', () => {
  const now = new Date('2026-07-23T00:00:00.000Z')

  it('classifies healthy, degraded, and stale without generating activities', () => {
    const input = { heartbeatIntervalSeconds: 30, staleAfterSeconds: 120, now }
    expect(classifyHeartbeatLiveness({ ...input, lastHeartbeatAt: '2026-07-22T23:59:10.000Z' })).toBe('healthy')
    expect(classifyHeartbeatLiveness({ ...input, lastHeartbeatAt: '2026-07-22T23:58:30.000Z' })).toBe('degraded')
    expect(classifyHeartbeatLiveness({ ...input, lastHeartbeatAt: '2026-07-22T23:58:00.000Z' })).toBe('stale')
  })
})
