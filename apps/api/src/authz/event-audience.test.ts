import { describe, expect, it } from 'vitest'
import { eventAudienceQuery } from './event-audience.js'

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
