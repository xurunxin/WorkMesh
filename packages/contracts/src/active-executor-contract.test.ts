import { describe, expect, it } from 'vitest'
import { workItemPatchSchema, workItemResponseSchema } from './index.js'

describe('active executor Work Item contract', () => {
  it('rejects direct writes to projection fields', () => {
    expect(() => workItemPatchSchema.parse({
      active_executor: { session_id: '11111111-1111-4111-8111-111111111111' },
    })).toThrow()
    expect(() => workItemPatchSchema.parse({ shared_reviewers: [] })).toThrow()
  })

  it('requires Human responsibility and Agent execution as separate response concepts', () => {
    const parsed = workItemResponseSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      workspace_id: '22222222-2222-4222-8222-222222222222',
      team_id: '33333333-3333-4333-8333-333333333333',
      number: 1,
      title: 'Release',
      description: null,
      status_id: '44444444-4444-4444-8444-444444444444',
      priority: 'high',
      due_date: null,
      responsible_human_actor_id: '55555555-5555-4555-8555-555555555555',
      responsible_human: { actor_id: '55555555-5555-4555-8555-555555555555', display_name: 'Owner' },
      active_executor: null,
      shared_reviewers: [],
      labels: [],
      project_id: null,
      milestone_id: null,
      revision: 1,
      deleted_at: null,
      created_at: '2026-08-03T10:00:00.000Z',
      updated_at: '2026-08-03T10:00:00.000Z',
      team_key: 'ENG',
      status_name: 'Started',
      status_category: 'started',
    })
    expect(parsed.responsible_human?.display_name).toBe('Owner')
    expect(parsed.active_executor).toBeNull()
  })
})
