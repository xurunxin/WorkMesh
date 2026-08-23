// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { agentTeamAccessHref, decodeAgentRouteSegment, findLoadedAgent, readAgentsRoute, useAgentsRouteState, writeAgentsRoute } from './approval-route-state'

describe('approval route state', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/agents')
  })

  it('reads the outer tab, approval projection, terminal status, and Agent filters', () => {
    expect(readAgentsRoute('?tab=approvals&approvalView=history&approvalStatus=rejected&name=review&team=team-1&capability=work%3Aread&status=inactive')).toEqual({
      tab: 'approvals',
      approvalView: 'history',
      approvalStatus: 'rejected',
      name: 'review',
      teamId: 'team-1',
      capability: 'work:read',
      status: 'inactive',
      teamAccessAgentId: '',
    })
  })

  it('uses safe defaults for absent and unsupported values', () => {
    expect(readAgentsRoute('?tab=unknown&approvalView=all&approvalStatus=pending&status=retired')).toEqual({
      tab: 'agents',
      approvalView: 'pending',
      approvalStatus: 'approved',
      name: '',
      teamId: '',
      capability: '',
      status: 'all',
      teamAccessAgentId: '',
    })
  })

  it('writes only requested fields while preserving unrelated parameters', () => {
    const next = writeAgentsRoute(
      new URL('https://wm.test/agents?tab=approvals&source=command-center'),
      { approvalView: 'history', approvalStatus: 'approved' },
    )
    expect(next.search).toBe('?tab=approvals&source=command-center&approvalView=history&approvalStatus=approved')
  })

  it('removes empty filter parameters without disturbing the rest of the URL', () => {
    const next = writeAgentsRoute(
      new URL('https://wm.test/agents?name=codex&team=team-1&capability=work%3Aread&status=active&from=inbox'),
      { name: '', teamId: '', capability: '', status: 'all' },
    )
    expect(next.searchParams.get('from')).toBe('inbox')
    expect(next.searchParams.has('name')).toBe(false)
    expect(next.searchParams.has('team')).toBe(false)
    expect(next.searchParams.has('capability')).toBe(false)
    expect(next.searchParams.has('status')).toBe(false)
  })

  it('round-trips the URL-owned Team Access Agent with one layer of encoding', () => {
    expect(readAgentsRoute('?tab=agents&teamAccessAgent=agent%2F1').teamAccessAgentId).toBe('agent/1')
    const next = writeAgentsRoute(new URL('https://wm.test/agents?tab=agents'), { teamAccessAgentId: 'agent/1' })
    expect(next.pathname + next.search).toBe('/agents?tab=agents&teamAccessAgent=agent%2F1')
    expect(writeAgentsRoute(next, { teamAccessAgentId: '' }).search).toBe('?tab=agents')
    expect(agentTeamAccessHref('agent/1')).toBe('/agents?tab=agents&teamAccessAgent=agent%2F1')
  })

  it('resolves Team Access only after the matching aggregate row has loaded', () => {
    const loaded = { id: 'agent-1', team_access: [{ team_id: 'team-1' }] }
    expect(findLoadedAgent([], 'agent-1')).toBeNull()
    expect(findLoadedAgent([loaded], 'missing')).toBeNull()
    expect(findLoadedAgent([loaded], 'agent-1')).toBe(loaded)
  })

  it('decodes one raw Next route segment without decoding a literal percent sequence twice', () => {
    expect(decodeAgentRouteSegment('agent%2F1')).toBe('agent/1')
    expect(decodeAgentRouteSegment('agent%252F1')).toBe('agent%2F1')
    expect(decodeAgentRouteSegment('agent%2')).toBeNull()
  })

  it('updates the URL and restores state across popstate navigation', () => {
    const { result } = renderHook(() => useAgentsRouteState())

    act(() => {
      result.current.update({
        tab: 'approvals',
        approvalView: 'history',
        approvalStatus: 'expired',
      })
    })
    expect(window.location.search).toBe('?tab=approvals&approvalView=history&approvalStatus=expired')
    expect(result.current.state.approvalStatus).toBe('expired')

    act(() => {
      window.history.pushState(null, '', '/agents?tab=agents&name=codex&from=back')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current.state).toMatchObject({ tab: 'agents', name: 'codex' })
    expect(window.location.search).toContain('from=back')
  })

  it('restores a query-bearing URL from the mount effect', () => {
    window.history.replaceState(null, '', '/agents?tab=approvals&approvalView=history&approvalStatus=consumed&name=runner')

    const { result } = renderHook(() => useAgentsRouteState())

    expect(result.current.state).toMatchObject({
      tab: 'approvals',
      approvalView: 'history',
      approvalStatus: 'consumed',
      name: 'runner',
      teamAccessAgentId: '',
    })
  })
})
