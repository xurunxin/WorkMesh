import { describe, expect, it, vi } from 'vitest'
import { attachWorkItemExecutors } from './work-item-executors.js'

const item = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  responsible_human_actor_id: '33333333-3333-4333-8333-333333333333',
}

describe('Work Item executor response projection', () => {
  it('keeps Human responsibility separate from a primary and shared reviewers', async () => {
    const now = new Date('2026-08-03T10:00:00.000Z')
    const query = vi.fn().mockResolvedValue({ rows: [
      {
        work_item_id: item.id,
        responsible_human_actor_id: item.responsible_human_actor_id,
        responsible_human_display_name: 'Release owner',
        projection_role: 'primary',
        agent_id: '44444444-4444-4444-8444-444444444444',
        agent_actor_id: '55555555-5555-4555-8555-555555555555',
        agent_slug: 'executor',
        agent_display_name: 'Executor',
        session_id: '66666666-6666-4666-8666-666666666666',
        lease_id: '77777777-7777-4777-8777-777777777777',
        lease_kind: 'exclusive',
        resource_type: 'work_item',
        resource_id: item.id,
        execution_state: 'executing',
        heartbeat_health: 'healthy',
        last_heartbeat_at: now,
        lease_heartbeat_at: now,
        lease_expires_at: new Date('2026-08-03T10:05:00.000Z'),
      },
      {
        work_item_id: item.id,
        responsible_human_actor_id: item.responsible_human_actor_id,
        responsible_human_display_name: 'Release owner',
        projection_role: 'reviewer',
        agent_id: '88888888-8888-4888-8888-888888888888',
        agent_actor_id: '99999999-9999-4999-8999-999999999999',
        agent_slug: 'reviewer',
        agent_display_name: 'Reviewer',
        session_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        lease_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        lease_kind: 'review_shared',
        resource_type: 'plan_step',
        resource_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        execution_state: 'awaiting_input',
        heartbeat_health: 'degraded',
        last_heartbeat_at: null,
        lease_heartbeat_at: now,
        lease_expires_at: new Date('2026-08-03T10:03:00.000Z'),
      },
    ] })

    const [projected] = await attachWorkItemExecutors({ query } as never,[item])
    expect(projected?.responsible_human).toEqual({ actor_id: item.responsible_human_actor_id, display_name: 'Release owner' })
    expect(projected?.active_executor).toMatchObject({ agent_slug: 'executor', session_id: '66666666-6666-4666-8666-666666666666', lease_kind: 'exclusive' })
    expect(projected?.shared_reviewers).toEqual([expect.objectContaining({ agent_slug: 'reviewer', lease_kind: 'review_shared' })])
    expect(String(query.mock.calls[0]?.[0])).toContain('projection.lease_expires_at>now()')
  })

  it('does not query for an empty page', async () => {
    const query = vi.fn()
    await expect(attachWorkItemExecutors({ query } as never,[])).resolves.toEqual([])
    expect(query).not.toHaveBeenCalled()
  })
})
