'use client'

import type { Agent, AgentTeamAccess } from '../lib/agents'

export type AgentStateFilter = 'all' | 'active' | 'inactive'

export type AgentFilterOptions = {
  /** Substring match against the agent's display name, slug, or `name` field. */
  name: string
  /** Team id to require in the agent's `team_access` list; empty string = no filter. */
  teamId: string
  /** Capability to require in the agent's `requested_capabilities`; empty string = no filter. */
  capability: string
  /** Active/inactive state filter; `all` is a no-op. */
  state: AgentStateFilter
}

const allAgentTeamAccess = (agent: Agent): AgentTeamAccess[] => agent.team_access ?? []

/**
 * Pure in-memory filter for the Agents registry list.
 *
 * The four filter facets — name (substring), teamAccess (by team id),
 * state (active/inactive), and requestedCapabilities (by capability) —
 * are all AND-combined. An empty / `all` value for any facet means
 * "do not filter on this dimension".
 */
export function filterAgents(agents: Agent[], options: AgentFilterOptions): Agent[] {
  const nameNeedle = options.name.trim().toLowerCase()
  return agents.filter(agent => {
    if (options.state === 'active' && !agent.is_active) return false
    if (options.state === 'inactive' && agent.is_active) return false
    if (options.teamId && !allAgentTeamAccess(agent).some(access => access.team_id === options.teamId)) return false
    if (options.capability && !agent.requested_capabilities.includes(options.capability)) return false
    if (nameNeedle) {
      const displayName = (agent.display_name ?? '').toLowerCase()
      const agentName = (agent.name ?? '').toLowerCase()
      const slug = agent.slug.toLowerCase()
      if (!displayName.includes(nameNeedle) && !agentName.includes(nameNeedle) && !slug.includes(nameNeedle)) return false
    }
    return true
  })
}

/** Collect the unique requested capabilities across the loaded agents, sorted. */
export function uniqueRequestedCapabilities(agents: Agent[]): string[] {
  const seen = new Set<string>()
  for (const agent of agents) for (const capability of agent.requested_capabilities) seen.add(capability)
  return [...seen].sort()
}
