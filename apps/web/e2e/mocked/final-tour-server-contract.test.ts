import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('../project-work-preview-server.mjs', import.meta.url)), 'utf8')

describe('final-tour deterministic preview contract', () => {
  it('registers an isolated scenario before the existing scenario handlers', () => {
    expect(source).toContain("'final-tour',")
    expect(source).toContain("if (activeScenario === 'final-tour') return handleFinalTourRoute(request, response, url)")
    expect(source.indexOf("activeScenario === 'final-tour'")).toBeLessThan(source.indexOf("activeScenario === 'large-list'"))
  })

  it('registers the stateful fake-Agent approval journey fixture', () => {
    expect(source).toContain("'approval-journey',")
    expect(source).toContain("if (activeScenario === 'approval-journey') return handleApprovalJourneyRoute(request, response, url)")
    expect(source).toContain("path === '/__test/agent/request-approval'")
    expect(source).toContain("path === '/__test/agent/state'")
    expect(source).toContain("path === '/api/v1/approvals'")
    expect(source).toContain("path === '/api/v1/human-attention'")
    expect(source).toContain("path === `/api/v1/agent-sessions/${approvalJourneySession.id}/activities`")

    const handlerStart = source.indexOf('const handleApprovalJourneyRoute')
    const handlerEnd = source.indexOf('const handleFinalTourRoute')
    expect(handlerStart).toBeGreaterThanOrEqual(0)
    expect(handlerEnd).toBeGreaterThan(handlerStart)
    const handler = source.slice(handlerStart, handlerEnd)
    // Scenario handlers must return a truthy dispatch result after sending;
    // otherwise the outer router falls through and attempts a second response.
    expect(handler).not.toContain('return send(')
    expect(handler).toContain('send(response, { error: { code: \'UNEXPECTED_APPROVAL_JOURNEY_REQUEST\'')
  })

  it('freezes the final visual-tour records and the paginated Team boundary', () => {
    for (const fixture of [
      "id: 'team-1'",
      "id: 'team-2'",
      "id: 'team-page-2'",
      "name: 'Final tour active'",
      "id: 'project-1'",
      "id: 'work-101'",
      "title: 'Final visual tour Issue'",
      "delegation_id: 'delegation-final-tour'",
      "active_assignment: finalTourAssignment",
      "approved_capabilities: ['work:read', 'work:write']",
      "id: 'work-102'",
      "id: 'agent/1'",
      "name: 'Codex'",
      "id: 'agent/2'",
      "name: 'Codex Review'",
      "id: 'session-1'",
      "approvalFixture('approval-pending', 'pending', 'Final tour approval'",
      "approvalFixture('approval-rejected', 'rejected', 'Rejected final tour approval'",
      "id: 'run-failed'",
      "last_error: 'Failed deterministic final-tour run'",
    ]) expect(source).toContain(fixture)

    expect(source).toContain("nextCursor: 'teams-p2'")
    expect(source).toContain("if (cursor === 'teams-p2')")
    expect(source).toContain('send(response, page([finalTourTeamPageTwo]))')
  })

  it('covers every product collection, detail, auxiliary, SSE, and Connect route used by the tour', () => {
    for (const route of [
      '/api/v1/install-status',
      '/api/v1/auth/me',
      '/api/v1/features',
      '/api/v1/info',
      '/.well-known/workmesh-agent',
      '/mcp',
      '/api/v1/events/stream',
      '/api/v1/teams',
      '/api/v1/actors/humans',
      '/api/v1/projects',
      '/api/v1/agents',
      '/api/v1/agent-sessions',
      '/api/v1/approvals',
      '/api/v1/work-items',
      '/api/v1/rooms',
      '/api/v1/cycles',
      '/api/v1/initiatives',
      '/api/v1/automation-rules',
      '/api/v1/loops',
      '/api/v1/automation-runs',
      '/api/v1/templates',
      '/api/v1/usage-summary',
      '/api/v1/views',
      '/api/v1/agent-connections',
      '/api/v1/artifacts',
      '/api/v1/handoffs',
      '/api/v1/leases',
      '/api/v1/inbox',
      '/api/v1/delegations',
      '/api/v1/messages',
      '/api/v1/agent-messages',
    ]) expect(source, `missing ${route}`).toContain(route)

    expect(source).toContain('(?:comments|relations)')
    expect(source).toContain('/timeline$')
    expect(source).toContain("code: 'UNEXPECTED_FINAL_TOUR_REQUEST'")
  })

  it('provides seven valid aggregate Usage cards and an unauthenticated MCP readiness response', () => {
    for (const currency of ['USD', 'JPY', 'KWD'])
      expect(source).toContain(`currency: '${currency}'`)
    expect(source).toContain("supportedClients: ['opencode', 'generic_mcp']")
    expect(source).toContain("preferredClientProfileVersion: '1.0'")
    expect(source).toContain("send(response, { error: { code: 'AUTHENTICATION_REQUIRED'")
    expect(source).toContain('}, 401)')
  })
})
