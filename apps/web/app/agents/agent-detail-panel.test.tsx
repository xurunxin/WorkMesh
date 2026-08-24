// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LocaleProvider } from '../lib/i18n'
import type { Agent, AgentTeamAccess } from '../lib/agents'
import { AgentDetailPanel } from './agent-detail-panel'

afterEach(() => { cleanup() })

const baseAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'agent-1', workspace_id: 'workspace-1', actor_id: 'actor-1', name: 'Coder Bot', slug: 'coder',
  description: 'Plans and implements scoped changes.', provider: 'openai', version: '1.2.3',
  supported_protocols: ['mcp', 'a2a'], skills: [], requested_capabilities: ['work:read', 'work:write'],
  approved_capabilities: ['work:read'], max_concurrency: 2, heartbeat_interval_seconds: 30,
  is_active: true, revision: 1, ...overrides,
})

const access = (overrides: Partial<AgentTeamAccess> = {}): AgentTeamAccess => ({
  agent_id: 'agent-1', team_id: 'team-1', approved_capabilities: ['work:read'], status: 'active',
  approved_by_actor_id: 'human-1', revision: 1, created_at: '2026-08-22T00:00:00Z',
  updated_at: '2026-08-22T00:00:00Z', revoked_at: null, ...overrides,
})

describe('AgentDetailPanel', () => {
  it('renders only true definition facts and does not invent omitted Team Access', () => {
    render(<LocaleProvider><AgentDetailPanel agent={baseAgent()} /></LocaleProvider>)
    expect(screen.getByText('coder')).toBeInTheDocument()
    expect(screen.getByText('openai')).toBeInTheDocument()
    expect(screen.getByText('1.2.3')).toBeInTheDocument()
    expect(screen.getByText('work:write')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-team-access-projection')).toBeNull()
  })

  it('shows an explicit empty state only when the loaded projection is present and empty', () => {
    render(<LocaleProvider><AgentDetailPanel agent={baseAgent()} loadedTeamAccess={[]} /></LocaleProvider>)
    const projection = screen.getByTestId('agent-team-access-projection')
    expect(projection).toBeInTheDocument()
    expect(projection.querySelector('.empty')).not.toBeNull()
  })

  it('renders loaded Team Access facts read-only', () => {
    render(<LocaleProvider><AgentDetailPanel agent={baseAgent()} loadedTeamAccess={[access()]} /></LocaleProvider>)
    const projection = screen.getByTestId('agent-team-access-projection')
    expect(projection).toHaveTextContent('team-1')
    expect(projection).toHaveTextContent('work:read')
    expect(projection.querySelector('form')).toBeNull()
  })
})
