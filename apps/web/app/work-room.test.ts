import { describe, expect, it } from 'vitest'
import type { AgentSession } from './lib/agents'
import { summarizeWorkRoom } from './work-room'

const session = {
  id: 'session-1', agent_id: 'Codex', agent_actor_id: 'agent-1', principal_human_actor_id: 'human-1',
  delegation_id: 'delegation-1', work_item_id: 'work-1', state: 'executing', state_reason: null,
  revision: 1, current_plan_version_id: null, budget: {}, last_heartbeat_at: null,
  stop_requested_at: null, error_code: null, error_summary: null,
  created_at: '2026-08-10T00:00:00.000Z', updated_at: '2026-08-10T00:00:00.000Z',
} satisfies AgentSession

describe('Work Room attribution summary', () => {
  it('keeps Agent, principal Human, sessions, pending responses, evidence, decisions, and handoffs visible', () => {
    const summary = summarizeWorkRoom(
      [session],
      [
        { id: 'ask-1', intent: 'ask', status: 'open' },
        { id: 'artifact-1', kind: 'artifact_published' },
        { id: 'decision-1', kind: 'decision' },
      ],
      [{ id: 'handoff-1', status: 'requested' }],
      [{ id: 'human-1', display_name: 'Rex' }],
    )

    expect(summary).toEqual({
      agentActors: ['Codex'], principalHumans: ['Rex'], sessions: 1,
      pendingResponses: 2, evidence: 1, decisions: 1, handoffs: 1,
    })
  })
})
