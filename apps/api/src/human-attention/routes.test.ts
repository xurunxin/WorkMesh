import { describe, expect, it } from 'vitest'
import type { ApiActor } from '../agent/types.js'
import { humanAttentionAuthorizationPredicate } from './routes.js'

const id = (suffix: number) =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`

describe('Human Attention final live authorization', () => {
  it('keeps Human Inbox rows bound to the exact recipient actor', () => {
    const values: unknown[] = [id(1)]
    const predicate = humanAttentionAuthorizationPredicate({
      id: id(2),
      kind: 'human',
      workspaceId: id(1),
      displayName: 'Human',
      workspaceRole: 'member',
      csrfToken: 'csrf-token',
      humanSessionId: id(3),
      credentialHash: 'human-credential-hash',
    } satisfies ApiActor, values)

    expect(predicate).toContain("attention.source_type<>'inbox_item'")
    expect(predicate).toContain('attention.recipient_actor_id=')
    expect(values.at(-1)).toBe(id(2))
  })

  it('allows Coordination Team scope without widening exact-session Inbox delivery', () => {
    const values: unknown[] = [id(1)]
    const predicate = humanAttentionAuthorizationPredicate({
      id: id(2),
      kind: 'agent',
      workspaceId: id(1),
      displayName: 'Agent',
      workspaceRole: 'member',
      csrfToken: '',
      agentSessionId: id(3),
      credentialHash: 'agent-credential-hash',
      authentication: 'coordination_connection',
    } satisfies ApiActor, values)

    expect(predicate).toContain("reader.session_kind='coordination'")
    expect(predicate).toContain('attention.team_id=reader.team_id')
    expect(predicate).toContain('attention.recipient_actor_id=')
    expect(predicate).toContain('attention.session_id=reader.id')
  })
})
