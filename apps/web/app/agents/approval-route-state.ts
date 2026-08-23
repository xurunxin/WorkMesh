'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AgentStateFilter } from './filters'

export type AgentsTab = 'agents' | 'sessions' | 'approvals'
export type ApprovalView = 'pending' | 'history'
export type ApprovalTerminalStatus = 'approved' | 'rejected' | 'expired' | 'consumed' | 'canceled'

export type AgentsRouteState = {
  tab: AgentsTab
  approvalView: ApprovalView
  approvalStatus: ApprovalTerminalStatus
  name: string
  teamId: string
  capability: string
  status: AgentStateFilter
  teamAccessAgentId: string
}

const agentTabs: readonly AgentsTab[] = ['agents', 'sessions', 'approvals']
const approvalViews: readonly ApprovalView[] = ['pending', 'history']
export const approvalTerminalStatuses: readonly ApprovalTerminalStatus[] = ['approved', 'rejected', 'expired', 'consumed', 'canceled']
const agentStatuses: readonly AgentStateFilter[] = ['all', 'active', 'inactive']

const includes = <T extends string>(values: readonly T[], value: string | null): value is T =>
  value !== null && values.some(candidate => candidate === value)

export function findLoadedAgent<T extends { id: string }>(agents: readonly T[], agentId: string | null): T | null {
  if (!agentId) return null
  return agents.find(agent => agent.id === agentId) ?? null
}

export function agentTeamAccessHref(agentId: string): string {
  return `/agents?${new URLSearchParams({ tab: 'agents', teamAccessAgent: agentId }).toString()}`
}

/**
 * Next 15 passes the encoded dynamic path segment to this Client page. Decode
 * exactly that transport layer once; a literal `%2F` in an Agent id therefore
 * arrives as `%252F` and remains `%2F` after normalization.
 */
export function decodeAgentRouteSegment(rawSegment: string): string | null {
  try {
    return decodeURIComponent(rawSegment)
  } catch {
    return null
  }
}

export function readAgentsRoute(search: string): AgentsRouteState {
  const params = new URLSearchParams(search)
  const tab = params.get('tab')
  const approvalView = params.get('approvalView')
  const approvalStatus = params.get('approvalStatus')
  const status = params.get('status')
  return {
    tab: includes(agentTabs, tab) ? tab : 'agents',
    approvalView: includes(approvalViews, approvalView) ? approvalView : 'pending',
    approvalStatus: includes(approvalTerminalStatuses, approvalStatus) ? approvalStatus : 'approved',
    name: params.get('name') ?? '',
    teamId: params.get('team') ?? '',
    capability: params.get('capability') ?? '',
    status: includes(agentStatuses, status) ? status : 'all',
    teamAccessAgentId: params.get('teamAccessAgent') ?? '',
  }
}

function setOptionalParam(url: URL, key: string, value: string): void {
  if (value) url.searchParams.set(key, value)
  else url.searchParams.delete(key)
}

export function writeAgentsRoute(current: URL, next: Partial<AgentsRouteState>): URL {
  const url = new URL(current)
  if (next.tab !== undefined) url.searchParams.set('tab', next.tab)
  if (next.approvalView !== undefined) url.searchParams.set('approvalView', next.approvalView)
  if (next.approvalStatus !== undefined) url.searchParams.set('approvalStatus', next.approvalStatus)
  if (next.name !== undefined) setOptionalParam(url, 'name', next.name)
  if (next.teamId !== undefined) setOptionalParam(url, 'team', next.teamId)
  if (next.capability !== undefined) setOptionalParam(url, 'capability', next.capability)
  if (next.status !== undefined) setOptionalParam(url, 'status', next.status === 'all' ? '' : next.status)
  if (next.teamAccessAgentId !== undefined) setOptionalParam(url, 'teamAccessAgent', next.teamAccessAgentId)
  return url
}

export function useAgentsRouteState(): {
  state: AgentsRouteState
  update: (next: Partial<AgentsRouteState>) => void
} {
  // Server prerender and the first browser render must start from the same
  // state. Reading location in the initializer would make a query-bearing
  // client render disagree with the server HTML during hydration.
  const [state, setState] = useState<AgentsRouteState>(() => readAgentsRoute(''))

  useEffect(() => {
    const restore = (): void => setState(readAgentsRoute(window.location.search))
    restore()
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  const update = useCallback((next: Partial<AgentsRouteState>): void => {
    const url = writeAgentsRoute(new URL(window.location.href), next)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    setState(readAgentsRoute(url.search))
  }, [])

  return { state, update }
}
