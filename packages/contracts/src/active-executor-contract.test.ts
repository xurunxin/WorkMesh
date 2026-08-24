import { describe, expect, it } from 'vitest'
import { workItemPatchSchema, workItemResponseSchema } from './index.js'

describe('active executor Work Item contract', () => {
  it('rejects direct writes to projection fields', () => {
    expect(() => workItemPatchSchema.parse({
      active_executor: { session_id: '11111111-1111-4111-8111-111111111111' },
    })).toThrow()
    expect(() => workItemPatchSchema.parse({ active_assignment: null })).toThrow()
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
      active_assignment: {
        delegation_id: '66666666-6666-4666-8666-666666666666',
        agent_id: '77777777-7777-4777-8777-777777777777',
        agent_actor_id: '88888888-8888-4888-8888-888888888888',
        agent_slug: 'codex',
        agent_display_name: 'Codex',
        session_id: '99999999-9999-4999-8999-999999999999',
        session_state: 'queued',
        assigned_at: '2026-08-03T10:00:00.000Z',
      },
      active_executor: null,
      shared_reviewers: [],
      labels: [],
      project_id: null,
      milestone_id: null,
      parent_id: null,
      revision: 1,
      deleted_at: null,
      created_at: '2026-08-03T10:00:00.000Z',
      updated_at: '2026-08-03T10:00:00.000Z',
      team_key: 'ENG',
      status_name: 'Started',
      status_category: 'started',
    })
    expect(parsed.responsible_human?.display_name).toBe('Owner')
    expect(parsed.active_assignment).toMatchObject({ agent_slug: 'codex', session_state: 'queued' })
    expect(parsed.active_executor).toBeNull()
  })
})
