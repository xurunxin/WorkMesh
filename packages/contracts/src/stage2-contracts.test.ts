import { describe, expect, it } from 'vitest'
import {
  contextDeltaInputSchema,
  handoffInputSchema,
  handoffRejectInputSchema,
  roomMessageInputSchema,
  stage2RouteManifest,
} from './index.js'

describe('Stage 2 collaboration contracts', () => {
  it('publishes every collaboration route exactly once with mutation metadata', () => {
    const operations = stage2RouteManifest.map(route => `${route.method} ${route.path}`)
    expect(new Set(operations).size).toBe(operations.length)
    expect(operations).toEqual(expect.arrayContaining([
      'GET /api/v1/rooms/{id}/timeline',
      'POST /api/v1/agent-sessions/{id}/children',
      'POST /api/v1/agent-sessions/{id}/context-deltas',
      'POST /api/v1/agent-sessions/{id}/review-delegations',
      'POST /api/v1/handoffs/{id}/request',
      'POST /api/v1/handoffs/{id}/complete',
    ]))
    for (const route of stage2RouteManifest) {
      expect(route.authenticated).toBe(true)
      if (route.method !== 'GET') expect(route).toMatchObject({ mutation: true })
    }
  })

  it('rejects hidden messages and incomplete context sources', () => {
    expect(roomMessageInputSchema.safeParse({ intent: 'inform', body: 'hidden', payload: { visibility: 'hidden' } }).success).toBe(false)
    expect(contextDeltaInputSchema.safeParse({
      baseSnapshotId: '00000000-0000-4000-8000-000000000001',
      additions: [{ sourceType: 'artifact', hash: `sha256:${'0'.repeat(64)}` }],
      rationale: 'missing source',
    }).success).toBe(false)
    expect(contextDeltaInputSchema.safeParse({
      baseSnapshotId: '00000000-0000-4000-8000-000000000001',
      additions: [{ sourceType: 'artifact', uri: 'https://untrusted.example.test/artifact', hash: `sha256:${'0'.repeat(64)}` }],
      rationale: 'internal resources cannot use URI',
    }).success).toBe(false)
    expect(contextDeltaInputSchema.safeParse({
      baseSnapshotId: '00000000-0000-4000-8000-000000000001',
      additions: [{ sourceType: 'guidance', sourceId: '00000000-0000-4000-8000-000000000002', hash: `sha256:${'0'.repeat(64)}` }],
      rationale: 'guidance requires a server-authorized URI',
    }).success).toBe(false)
  })

  it('supports explicit draft and requested handoffs with exactly one target selector', () => {
    const base = {
      fromSessionId: '00000000-0000-4000-8000-000000000001',
      targetSkill: 'review',
      summary: 'Review this work',
      requestedAction: 'Produce a review result',
      status: 'draft' as const,
    }
    expect(handoffInputSchema.parse(base).status).toBe('draft')
    expect(handoffInputSchema.safeParse({ ...base, targetAgentId: '00000000-0000-4000-8000-000000000002' }).success).toBe(false)
    expect(handoffRejectInputSchema.safeParse({ machineReason: 'concurrency_limit' }).success).toBe(true)
    expect(handoffRejectInputSchema.safeParse({ machineReason: 'capacity_exhausted' }).success).toBe(false)
  })
})
