'use client'

import type { Agent, AgentTeamAccess } from '../lib/agents'
import { type AgentDetailLocaleCopy, type AgentsCopy, useLocale } from '../lib/i18n'

type AgentDetailPanelCopy = AgentsCopy & AgentDetailLocaleCopy

export type AgentDetailPanelProps = {
  agent: Agent
  copy?: AgentDetailPanelCopy
  loadedTeamAccess?: AgentTeamAccess[]
}

function CapabilityList({ empty, values }: { empty: string; values: readonly string[] }) {
  if (values.length === 0) return <span className="muted">{empty}</span>
  return <span className="agent-detail-chip-list">{values.map(value => <span className="chip chip-outline" key={value}>{value}</span>)}</span>
}

export function AgentDetailPanel({ agent, copy, loadedTeamAccess }: AgentDetailPanelProps) {
  const { agentsCopy } = useLocale()
  const text = copy ?? agentsCopy
  const provider = agent.provider ?? agent.manifest?.provider ?? text.notReported
  const version = agent.version ?? agent.manifest?.version ?? text.notReported
  const heartbeat = agent.heartbeat_interval_seconds ?? agent.manifest?.heartbeatIntervalSeconds

  return <section className="agent-detail-panel" aria-label={text.agentDetailFacts}>
    <header className="agent-detail-panel-header">
      <div><p className="eyebrow">{text.agentDetailEyebrow}</p><h2>{text.agentDetailFacts}</h2></div>
      <span className={agent.is_active ? 'registry-active' : 'registry-inactive'}>{agent.is_active ? text.registryStatusActive : text.registryStatusInactive}</span>
    </header>
    <div className="agent-detail-description"><strong>{text.agentDescription}</strong><p>{agent.description || text.noRegistryDescription}</p></div>
    <dl className="agent-detail-facts">
      <div><dt>{text.agentSlug}</dt><dd><code>{agent.slug}</code></dd></div>
      <div><dt>{text.agentProvider}</dt><dd>{provider}</dd></div>
      <div><dt>{text.agentVersion}</dt><dd>{version}</dd></div>
      <div><dt>{text.agentStatus}</dt><dd>{agent.is_active ? text.registryStatusActive : text.registryStatusInactive}</dd></div>
      <div><dt>{text.concurrency}</dt><dd>{agent.max_concurrency}</dd></div>
      <div><dt>{text.heartbeat}</dt><dd>{heartbeat === undefined ? text.notReported : text.heartbeatSeconds(heartbeat)}</dd></div>
      <div className="agent-detail-fact-wide"><dt>{text.agentSupportedProtocols}</dt><dd><CapabilityList empty={text.none} values={agent.supported_protocols} /></dd></div>
      <div className="agent-detail-fact-wide"><dt>{text.agentRequestedCapabilities}</dt><dd><CapabilityList empty={text.none} values={agent.requested_capabilities} /></dd></div>
      <div className="agent-detail-fact-wide"><dt>{text.agentApprovedCapabilities}</dt><dd><CapabilityList empty={text.none} values={agent.approved_capabilities} /></dd></div>
    </dl>
    {loadedTeamAccess !== undefined && <section className="agent-team-access-projection" data-testid="agent-team-access-projection">
      <header><h3>{text.teamAccessProjection}</h3></header>
      {loadedTeamAccess.length === 0
        ? <p className="empty">{text.teamAccessLoadedEmpty}</p>
        : <div className="agent-team-access-facts">{loadedTeamAccess.map(access => <article key={`${access.team_id}:${access.revision}`}>
          <header><strong>{text.teamAccessTeam} <code>{access.team_id}</code></strong><span className={access.status === 'active' ? 'pill is-active' : 'pill is-inactive'}>{access.status === 'active' ? text.accessStatusActive : text.accessStatusRevoked}</span></header>
          <CapabilityList empty={text.none} values={access.approved_capabilities} />
        </article>)}</div>
      }
    </section>}
  </section>
}
