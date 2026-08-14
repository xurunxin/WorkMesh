import { describe, expect, it } from 'vitest'
import { collaborationState, notificationHealth, sortNotifications } from './view-model'
import type { NotificationFact } from './contracts'

const item = (patch: Partial<NotificationFact> = {}): NotificationFact => ({
  id: '00000000-0000-4000-8000-000000000001', priority: 'update', kind: 'work.updated',
  title: 'Update', body: '', source_type: 'work_item', source_id: '00000000-0000-4000-8000-000000000002',
  read_at: null, created_at: '2026-08-13T00:00:00Z', deliveries: [], ...patch,
})

describe('collaboration projection', () => {
  it('keeps failure distinct from preference save success', () => {
    expect(notificationHealth(item({ deliveries: [{
      channel: 'webhook', status: 'failed', attempt_count: 2,
      available_at: '2026-08-13T00:00:00Z', claimed_at: null, effect_completed_at: null,
      delivered_at: null, created_at: '2026-08-13T00:00:00Z', last_error_present: true,
    }] }))).toBe('failed')
  })

  it('prioritizes approvals and exposes all named surface states', () => {
    expect(sortNotifications([item(), item({ id: '00000000-0000-4000-8000-000000000003', priority: 'approval' })])[0]?.priority).toBe('approval')
    expect(collaborationState({ loading: true, count: 0 })).toBe('loading')
    expect(collaborationState({ loading: false, error: { status: 403 }, count: 0 })).toBe('forbidden')
    expect(collaborationState({ loading: false, error: { status: 409 }, count: 0 })).toBe('conflict')
    expect(collaborationState({ loading: false, error: { code: 'APPROVAL_EXPIRED' }, count: 0 })).toBe('expired')
    expect(collaborationState({ loading: false, error: { status: 403, code: 'APPROVAL_EXPIRED' }, count: 0 })).toBe('expired')
    expect(collaborationState({ loading: false, error: {}, count: 0 })).toBe('error')
    expect(collaborationState({ loading: false, reconnecting: true, count: 1 })).toBe('reconnecting')
    expect(collaborationState({ loading: false, error: { code: 'SSE_RECONNECTING' }, count: 1 })).toBe('reconnecting')
    expect(collaborationState({ loading: false, count: 0 })).toBe('empty')
  })
})
