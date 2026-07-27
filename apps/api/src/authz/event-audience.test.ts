import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import { assertEventAudienceActive, eventAudienceQuery } from './event-audience.js'

const human = {
  id: 'human',
  workspaceId: 'workspace',
  displayName: 'Human',
  workspaceRole: 'member' as const,
  csrfToken: '',
  kind: 'human' as const,
}
const agent = {
  id: 'agent',
  workspaceId: 'workspace',
  displayName: 'Agent',
  workspaceRole: 'member' as const,
  csrfToken: '',
  kind: 'agent' as const,
  agentSessionId: 'session',
}

describe('EventAudiencePolicy SQL', () => {
  it('keeps Team membership filtering for humans', () => {
    const query = eventAudienceQuery(human, 12)
    expect(query.values).toEqual(['workspace', 12, 'human'])
    expect(query.sql).toContain('memberships')
  })

  it('rechecks an unrevoked human credential without weakening principal or membership checks', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 })
    await assertEventAudienceActive(
      { query } as unknown as Pool,
      { ...human, credentialHash: 'credential-hash' },
    )
    const sql = query.mock.calls[0]![0] as string
    expect(sql).toContain('credential.token_hash=$1')
    expect(sql).toContain('credential.expires_at>now()')
    expect(sql).toContain('credential.revoked_at IS NULL')
    expect(sql).toContain("principal.kind='human' AND principal.is_active")
    expect(sql).toContain('memberships member')
    expect(query.mock.calls[0]![1]).toEqual([
      'credential-hash',
      human.id,
      human.workspaceId,
    ])
  })

  it('never grants Agents blanket Workspace or same-Team visibility', () => {
    const query = eventAudienceQuery(agent, 12)
    expect(query.values).toEqual(['workspace', 12, 'agent', 'session'])
    expect(query.sql).toContain('authorized_sessions')
    expect(query.sql).toContain('e.audience_actor_id=$3')
    expect(query.sql).toContain('e.session_id IN (SELECT id FROM authorized_sessions)')
    expect(query.sql).toContain("e.aggregate_type='work_item'")
    expect(query.sql).not.toContain(
      '(e.audience_actor_id IS NULL OR e.audience_actor_id=$3)',
    )
  })
})
