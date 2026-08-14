import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import {
  createEventReader,
  eventAudienceVisibility,
} from './event-reader.js'

const workspaceId = 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'

describe('event retention floor', () => {
  it('describes multi-Team and other normalized scopes as resource visibility', () => {
    expect(eventAudienceVisibility({
      audience_actor_id: null,
      team_id: null,
      scopes: [
        { type: 'workspace', id: workspaceId },
        { type: 'team', id: '11111111-1111-4111-8111-111111111111' },
        { type: 'team', id: '22222222-2222-4222-8222-222222222222' },
      ],
    })).toBe('resource')
    expect(eventAudienceVisibility({
      audience_actor_id: null,
      team_id: null,
      scopes: [{ type: 'workspace', id: workspaceId }],
    })).toBe('workspace')
  })

  it('returns typed expiry details without truncating a bigint floor', async () => {
    const query = vi.fn(async () => ({
      rows: [{ pruned_through_cursor: '9007199254740993' }],
    }))
    const reader = createEventReader({ query } as unknown as Pool)

    await expect(reader.assertAvailable(workspaceId, '9007199254740992'))
      .rejects.toMatchObject({
        code: 'CURSOR_EXPIRED',
        details: {
          minimumCursor: '9007199254740993',
          resyncCursor: '9007199254740993',
          resyncRequired: true,
        },
      })
    await expect(reader.assertAvailable(workspaceId, '9007199254740993'))
      .resolves.toBe('9007199254740993')
  })

  it('uses a read-only common path and initializes a missing row safely', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ pruned_through_cursor: '0' }],
      })
      .mockResolvedValueOnce({
        rows: [{ pruned_through_cursor: '0' }],
      })
    const reader = createEventReader({ query } as unknown as Pool)

    await expect(reader.retentionFloor(workspaceId)).resolves.toBe('0')
    await expect(reader.retentionFloor(workspaceId)).resolves.toBe('0')

    expect(query).toHaveBeenCalledTimes(4)
    expect(query.mock.calls[0]![0]).toContain('SELECT')
    expect(query.mock.calls[0]![0]).not.toContain('INSERT')
    expect(query.mock.calls[1]![0]).toContain('ON CONFLICT')
    expect(query.mock.calls[3]![0]).toContain('SELECT')
    expect(query.mock.calls[3]![0]).not.toContain('INSERT')
  })
})
