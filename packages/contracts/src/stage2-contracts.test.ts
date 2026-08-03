import { describe, expect, it } from 'vitest'
import {
  contextDeltaInputSchema,
  handoffInputSchema,
  handoffRejectInputSchema,
  inboxItemDetailResponseSchema,
  inboxListItemResponseSchema,
  inboxReplyResponseSchema,
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
      'GET /api/v1/inbox/{id}',
      'POST /api/v1/inbox/{id}/claim',
      'POST /api/v1/inbox/{id}/acknowledge',
      'POST /api/v1/inbox/{id}/reply',
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

  it('publishes concrete Inbox list, receipt, detail, and reply DTOs', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    const otherId = '00000000-0000-4000-8000-000000000002'
    const timestamp = '2026-08-03T00:00:00.000Z'
    const listItem = {
      id,
      kind: 'ask' as const,
      source_type: 'room_message',
      source_id: otherId,
      status: 'open' as const,
      requires_response: true,
      recipient_session_id: id,
      claimed_by_session_id: null,
      claimed_at: null,
      revision: 1,
      created_at: timestamp,
      updated_at: timestamp,
      payload: { intent: 'ask' },
      detail_available: true,
    }
    expect(inboxListItemResponseSchema.parse(listItem)).toEqual(listItem)
    expect(inboxListItemResponseSchema.safeParse({ ...listItem, source_message_body: 'must not leak' }).success).toBe(false)

    const detail = {
      ...listItem,
      workspace_id: id,
      recipient_actor_id: otherId,
      recipient_human_actor_id: null,
      team_id: id,
      session_id: null,
      source_room_message_id: otherId,
      resolved_at: null,
      resolved_by_actor_id: null,
      channel_id: id,
      source_message_body: 'Can you review this?',
      source_message_intent: 'ask' as const,
      source_author_actor_id: id,
      source_author_session_id: null,
      source_thread_id: null,
      source_subject_kind: 'work_item' as const,
      source_subject_id: id,
      receipts: [{ id, actor_id: otherId, session_id: id, kind: 'acknowledged' as const, reply_message_id: null, created_at: timestamp }],
      detailAvailable: true as const,
    }
    const { detail_available: _summaryOnly, ...detailResponse } = detail
    expect(_summaryOnly).toBe(true)
    expect(inboxItemDetailResponseSchema.parse(detailResponse)).toEqual(detailResponse)
    expect(inboxReplyResponseSchema.parse({ ...detailResponse, replyMessageId: otherId }).replyMessageId).toBe(otherId)
  })
})
