import { describe, expect, it } from 'vitest'
import type { RealtimeInvalidation, RealtimeResource } from './lib/realtime.js'
import {
  agentRegistryRefreshTargets,
  agentWorkRefreshTargets,
  homeRefreshTargets,
} from './lib/realtime-refresh.js'

const workspaceId = '00000000-0000-4000-8000-000000000001'
const teamId = '00000000-0000-4000-8000-000000000002'
const workItemId = '00000000-0000-4000-8000-000000000003'
const sessionId = '00000000-0000-4000-8000-000000000004'

const realtimeEvent = ({
  aggregateType,
  scopes,
  invalidates,
}: {
  aggregateType: string
  scopes: RealtimeResource[]
  invalidates: RealtimeResource[]
}): RealtimeInvalidation => ({
  reason: 'event',
  event: {
    cursor: '1',
    id: '00000000-0000-4000-8000-000000000005',
    event_type: `${aggregateType}.updated`,
    aggregate_type: aggregateType,
    aggregate_id: '00000000-0000-4000-8000-000000000006',
    scopes,
    invalidates,
  },
})

const workspaceOnly = (aggregateType: string): RealtimeInvalidation =>
  realtimeEvent({
    aggregateType,
    scopes: [{ type: 'workspace', id: workspaceId }],
    invalidates: [{ type: 'workspace', id: workspaceId }],
  })

const homeResources = {
  teamId,
  workItemId,
}
const agentWorkResources = {
  teamId,
  workItemId,
  sessionIds: new Set([sessionId]),
}

describe('workspace realtime refresh policies', () => {
  it('refreshes only the component that owns a workspace-only aggregate', () => {
    expect([...agentRegistryRefreshTargets(workspaceOnly('agent'))])
      .toEqual(['agents'])
    expect([...agentWorkRefreshTargets(
      workspaceOnly('agent'),
      agentWorkResources,
    )]).toEqual(['agents'])
    expect([...homeRefreshTargets(workspaceOnly('agent'), homeResources)])
      .toEqual([])

    expect([...homeRefreshTargets(workspaceOnly('actor'), homeResources)])
      .toEqual(['humans'])
    expect([...homeRefreshTargets(workspaceOnly('saved_view'), homeResources)])
      .toEqual(['views'])
  })

  it('does not refresh unrelated workspace aggregates or resource events', () => {
    const provider = workspaceOnly('provider')
    expect([...agentRegistryRefreshTargets(provider)]).toEqual([])
    expect([...agentWorkRefreshTargets(provider, agentWorkResources)])
      .toEqual([])
    expect([...homeRefreshTargets(provider, homeResources)]).toEqual([])

    const unrelatedWorkItem = realtimeEvent({
      aggregateType: 'work_item',
      scopes: [
        { type: 'workspace', id: workspaceId },
        { type: 'team', id: '00000000-0000-4000-8000-000000000007' },
      ],
      invalidates: [{
        type: 'work_item',
        id: '00000000-0000-4000-8000-000000000008',
      }],
    })
    expect([...agentRegistryRefreshTargets(unrelatedWorkItem)]).toEqual([])
    expect([...agentWorkRefreshTargets(
      unrelatedWorkItem,
      agentWorkResources,
    )]).toEqual([])
    expect([...homeRefreshTargets(unrelatedWorkItem, homeResources)])
      .toEqual([])
  })

  it('keeps exact team, work-item, and session refresh behavior', () => {
    const selectedWorkItem = realtimeEvent({
      aggregateType: 'work_item',
      scopes: [
        { type: 'workspace', id: workspaceId },
        { type: 'team', id: teamId },
      ],
      invalidates: [{ type: 'work_item', id: workItemId }],
    })
    expect([...homeRefreshTargets(selectedWorkItem, homeResources)])
      .toEqual(['items'])
    expect([...agentWorkRefreshTargets(
      selectedWorkItem,
      agentWorkResources,
    )]).toEqual(['sessions'])

    const selectedSession = realtimeEvent({
      aggregateType: 'agent_session',
      scopes: [{ type: 'workspace', id: workspaceId }],
      invalidates: [{ type: 'session', id: sessionId }],
    })
    expect([...agentWorkRefreshTargets(
      selectedSession,
      agentWorkResources,
    )]).toEqual(['sessions'])
    expect([...agentRegistryRefreshTargets(selectedSession)])
      .toEqual(['sessions', 'approvals'])
  })
})
