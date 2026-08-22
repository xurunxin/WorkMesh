// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { filterAgents, uniqueRequestedCapabilities } from './filters'
import type { Agent, AgentTeamAccess } from '../lib/agents'

const baseAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'agent-1',
  workspace_id: 'ws-1',
  actor_id: 'actor-1',
  name: 'Coder',
  display_name: 'Coder',
  slug: 'coder',
  description: null,
  provider: 'openai',
  version: '1.0.0',
  supported_protocols: ['a2a'],
  skills: [],
  requested_capabilities: ['work:read', 'work:write'],
  approved_capabilities: ['work:read'],
  max_concurrency: 4,
  heartbeat_interval_seconds: 30,
  is_active: true,
  revision: 1,
  team_access: [],
  ...overrides,
})

const teamAccess = (teamId: string, status: AgentTeamAccess['status'] = 'active'): AgentTeamAccess => ({
  agent_id: 'agent-1',
  team_id: teamId,
  approved_capabilities: ['work:read'],
  status,
  approved_by_actor_id: 'actor-1',
  revision: 1,
  created_at: '2026-08-22T00:00:00Z',
  updated_at: '2026-08-22T00:00:00Z',
  revoked_at: null,
})

describe('filterAgents', () => {
  it('returns all agents when every option is empty or "all"', () => {
    const agents = [baseAgent(), baseAgent({ id: 'agent-2', slug: 'reviewer' })]
    expect(filterAgents(agents, { name: '', teamId: '', capability: '', state: 'all' })).toEqual(agents)
  })

  it('filters agents by team via team_access', () => {
    const inTeam = baseAgent({ id: 'in-team', team_access: [teamAccess('team-a')] })
    const notInTeam = baseAgent({ id: 'not-in-team', team_access: [] })
    const filtered = filterAgents([inTeam, notInTeam], { name: '', teamId: 'team-a', capability: '', state: 'all' })
    expect(filtered).toEqual([inTeam])
  })

  it('filters agents by team even when the team access is revoked', () => {
    const revoked = baseAgent({ id: 'revoked', team_access: [teamAccess('team-b', 'revoked')] })
    const filtered = filterAgents([revoked], { name: '', teamId: 'team-b', capability: '', state: 'all' })
    expect(filtered).toEqual([revoked])
  })

  it('filters agents by requested capability', () => {
    const writer = baseAgent({ id: 'writer', requested_capabilities: ['work:write'] })
    const reader = baseAgent({ id: 'reader', requested_capabilities: ['work:read'] })
    const filtered = filterAgents([writer, reader], { name: '', teamId: '', capability: 'work:write', state: 'all' })
    expect(filtered).toEqual([writer])
  })

  it('filters agents by state (active / inactive)', () => {
    const active = baseAgent({ id: 'active', is_active: true })
    const inactive = baseAgent({ id: 'inactive', is_active: false })
    expect(filterAgents([active, inactive], { name: '', teamId: '', capability: '', state: 'active' })).toEqual([active])
    expect(filterAgents([active, inactive], { name: '', teamId: '', capability: '', state: 'inactive' })).toEqual([inactive])
  })

  it('filters agents by name (case-insensitive substring against name, display_name, slug)', () => {
    const coder = baseAgent({ id: 'coder', name: 'Coder', display_name: 'Coder Bot', slug: 'coder' })
    const reviewer = baseAgent({ id: 'reviewer', name: 'Reviewer', display_name: 'Reviewer', slug: 'reviewer' })
    expect(filterAgents([coder, reviewer], { name: 'coder', teamId: '', capability: '', state: 'all' })).toEqual([coder])
    expect(filterAgents([coder, reviewer], { name: 'CODE', teamId: '', capability: '', state: 'all' })).toEqual([coder])
    expect(filterAgents([coder, reviewer], { name: 'reviewer', teamId: '', capability: '', state: 'all' })).toEqual([reviewer])
    expect(filterAgents([coder, reviewer], { name: 'unknown', teamId: '', capability: '', state: 'all' })).toEqual([])
  })

  it('combines all four filters with AND semantics', () => {
    const match = baseAgent({
      id: 'match',
      name: 'Coder',
      display_name: 'Coder',
      slug: 'coder',
      is_active: true,
      requested_capabilities: ['work:write'],
      team_access: [teamAccess('team-a')],
    })
    const wrongTeam = baseAgent({ id: 'wrong-team', team_access: [teamAccess('team-b')] })
    const wrongCapability = baseAgent({ id: 'wrong-cap', requested_capabilities: ['work:read'] })
    const wrongState = baseAgent({ id: 'wrong-state', is_active: false })
    const filtered = filterAgents(
      [match, wrongTeam, wrongCapability, wrongState],
      { name: 'coder', teamId: 'team-a', capability: 'work:write', state: 'active' },
    )
    expect(filtered).toEqual([match])
  })
})

describe('uniqueRequestedCapabilities', () => {
  it('returns the sorted, deduplicated requested capabilities across all agents', () => {
    const agents = [
      baseAgent({ id: 'a', requested_capabilities: ['work:write', 'plan:write'] }),
      baseAgent({ id: 'b', requested_capabilities: ['work:write', 'work:read'] }),
      baseAgent({ id: 'c', requested_capabilities: [] }),
    ]
    expect(uniqueRequestedCapabilities(agents)).toEqual(['plan:write', 'work:read', 'work:write'])
  })

  it('returns an empty list when no agent declares capabilities', () => {
    expect(uniqueRequestedCapabilities([baseAgent({ requested_capabilities: [] })])).toEqual([])
  })
})
