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
  credentialHash: 'human-credential',
}
const agent = {
  id: 'agent',
  workspaceId: 'workspace',
  displayName: 'Agent',
  workspaceRole: 'member' as const,
  csrfToken: '',
  kind: 'agent' as const,
  agentSessionId: 'session',
  credentialHash: 'agent-credential',
}

describe('EventAudiencePolicy SQL', () => {
  it('uses exact normalized Team resources and verified initiative ownership for humans', () => {
    const query = eventAudienceQuery(human, '12')
    expect(query.values).toEqual([
      'workspace',
      '12',
      'human',
      'human-credential',
    ])
    expect(query.sql).toContain('memberships member')
    expect(query.sql).toContain('domain_event_resources team_resource')
    expect(query.sql).toContain("team_resource.resource_type='team'")
    expect(query.sql).toContain('team_resource.resource_id=member.team_id')
    expect(query.sql).toContain('initiative.owner_actor_id=$3')
    expect(query.sql).toContain('e.audience_actor_id=$3')
    expect(query.sql).toContain(
      "e.aggregate_type IN ('session','saved_view','notification')",
    )
    expect(query.sql).toContain(
      "e.event_type='notification.preferences_updated'",
    )
    expect(query.sql).toContain("private_view.scope<>'private'")
    expect(query.sql).not.toContain('e.team_id IS NULL OR EXISTS')
  })

  it('keeps workspace admins exempt from Team membership without exposing direct events to other actors', () => {
    const query = eventAudienceQuery(
      { ...human, workspaceRole: 'admin' },
      '12',
    )
    expect(query.sql).toContain(
      '(e.audience_actor_id IS NULL OR e.audience_actor_id=$3)',
    )
    expect(query.sql).not.toContain('domain_event_resources team_resource')
    expect(query.sql).not.toContain('initiative.owner_actor_id=$3')
    expect(query.sql).toContain(
      "e.aggregate_type IN ('session','saved_view','notification')",
    )
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
    const query = eventAudienceQuery(agent, '12')
    expect(query.values).toEqual([
      'workspace',
      '12',
      'agent',
      'session',
      'agent-credential',
    ])
    expect(query.sql).toContain('authorized_sessions')
    expect(query.sql).toContain('e.audience_actor_id=$3')
    expect(query.sql).toContain('e.session_id IN (SELECT id FROM authorized_sessions)')
    expect(query.sql).toContain("resource.resource_type='work_item'")
    expect(query.sql).toContain('LEFT JOIN work_items root_scope_item')
    expect(query.sql).toContain('root_scope_item.deleted_at IS NULL')
    expect(query.sql).toContain('LEFT JOIN work_items child_scope_item')
    expect(query.sql).toContain('child_scope_item.deleted_at IS NULL')
    expect(query.sql).toContain('WHEN root.work_item_id IS NOT NULL')
    expect(query.sql).toContain('THEN root_scope_item.project_id')
    expect(query.sql).toContain('root_scope_item.id IS NOT NULL')
    expect(query.sql).toContain('child_scope_item.id IS NOT NULL')
    expect(query.sql).not.toContain(
      '(e.audience_actor_id IS NULL OR e.audience_actor_id=$3)',
    )
  })
})
