'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell, AsyncStateSurface, Button, ErrorState } from '@workmesh/ui'
import { ApiError, apiRequest, clearCsrfToken, saveCsrfToken } from '../lib/api'
import {
  type Agent,
  type AgentSession,
  type Approval,
  agentHeartbeat,
  agentName,
  agentProvider,
  agentStateClass,
  agentStateLabel,
  agentVersion,
  canManageAgentTeamAccess,
  formatTime,
  grantAgentTeamAccess,
  normalizeApproval,
  revokeAgentTeamAccess,
} from '../lib/agents'
import { LoadMoreButton, usePagedApiList } from '../lib/pagination'
import { type RealtimeResource, useRealtimeSubscription } from '../lib/realtime'
import { agentRegistryRefreshTargets } from '../lib/realtime-refresh'
import { AgentConnectionsPanel } from '../agent-connections-panel'
import { RealtimeStatus } from '../realtime-status'
import { GlobalCommandCenter } from '../../features/command-center'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { workspaceNavigation, workspaceUtilityNavigation } from '../lib/workspace-navigation'

type AuthMe = { actor: { id: string; display_name: string; workspace_id: string; workspace_role: 'admin' | 'member' }; csrfToken: string }
type Team = { id: string; name: string; key: string }
type Human = { id: string; display_name: string; email?: string }
type AgentFilter = 'all' | 'active' | 'inactive'

export default function AgentsPage() {
  const { locale, t, agentsCopy } = useLocale()
  const text = agentsCopy
  const [actor, setActor] = useState<AuthMe['actor'] | null>(null)
  const [filter, setFilter] = useState<AgentFilter>('all')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyAccess, setBusyAccess] = useState('')
  const agentsPage = usePagedApiList<Agent>(actor ? '/api/v1/agents' : null)
  const teamsPage = usePagedApiList<Team>(actor ? '/api/v1/teams' : null)
  const humansPage = usePagedApiList<Human>(actor ? '/api/v1/actors/humans' : null)
  const sessionsPage = usePagedApiList<AgentSession>(actor ? '/api/v1/agent-sessions' : null, { optional: true })
  const approvalsPage = usePagedApiList<Approval, Approval>(actor ? '/api/v1/approvals?status=pending' : null, {
    optional: true,
    map: value => normalizeApproval(value as unknown as Record<string, unknown>),
  })
  const agents = agentsPage.items
  const teams = teamsPage.items
  const humans = humansPage.items
  const sessions = sessionsPage.items
  const approvals = approvalsPage.items
  const collectionError = [agentsPage.error, teamsPage.error, humansPage.error, sessionsPage.error, approvalsPage.error].find(Boolean)

  const load = useCallback(async () => {
    try {
      setError('')
      const auth = await apiRequest<AuthMe>('/api/v1/auth/me')
      saveCsrfToken(auth.csrfToken)
      setActor(auth.actor)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) { clearCsrfToken(); window.location.assign('/login'); return }
      setError(reason instanceof Error ? reason.message : text.loadError)
    } finally { setLoading(false) }
  }, [text.loadError])
  useEffect(() => { void load() }, [load])

  const realtimeResources = useMemo<RealtimeResource[]>(() => [
    ...(actor ? [{ type: 'workspace' as const, id: actor.workspace_id }] : []),
    ...teams.map(team => ({ type: 'team' as const, id: team.id })),
    ...sessions.map(session => ({ type: 'session' as const, id: session.id })),
  ], [actor?.workspace_id, sessions, teams])
  useRealtimeSubscription(realtimeResources, invalidation => {
    const targets = agentRegistryRefreshTargets(invalidation)
    if (invalidation.reason === 'resync') return Promise.all([
      agentsPage.refresh(), teamsPage.refresh(), humansPage.refresh(), sessionsPage.refresh(), approvalsPage.refresh(),
    ]).then(() => undefined)
    if (targets.has('agents')) void agentsPage.refresh()
    if (targets.has('teams')) void teamsPage.refresh()
    if (targets.has('sessions')) void sessionsPage.refresh()
    if (targets.has('approvals')) void approvalsPage.refresh()
  })

  const grantAccess = async (event: FormEvent<HTMLFormElement>, agent: Agent, team: Team) => {
    event.preventDefault()
    const approvedCapabilities = new FormData(event.currentTarget).getAll('capabilities').map(String)
    if (approvedCapabilities.length === 0) { setError(text.selectCapability); return }
    const operation = `${agent.id}:${team.id}`
    try { setBusyAccess(operation); setError(''); await grantAgentTeamAccess(agent.id, team.id, approvedCapabilities); await agentsPage.refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : text.updateAccessError) }
    finally { setBusyAccess('') }
  }

  const revokeAccess = async (agent: Agent, team: Team) => {
    const operation = `${agent.id}:${team.id}`
    try { setBusyAccess(operation); setError(''); await revokeAgentTeamAccess(agent.id, team.id); await agentsPage.refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : text.revokeAccessError) }
    finally { setBusyAccess('') }
  }

  const shownAgents = useMemo(() => agents.filter(agent => filter === 'all' || (filter === 'active' ? agent.is_active : !agent.is_active)), [agents, filter])
  const canManageAccess = canManageAgentTeamAccess(actor?.workspace_role)
  const attentionSessions = sessions.filter(session => ['stale', 'failed', 'blocked', 'awaiting_approval', 'awaiting_input'].includes(session.state))
  const refresh = () => { void load(); void agentsPage.refresh(); void teamsPage.refresh(); void humansPage.refresh(); void sessionsPage.refresh(); void approvalsPage.refresh() }

  if (loading) return <main className="center foundation-center wm-theme"><AsyncStateSurface description={text.loadingDescription} state="loading" title={text.loadingTitle} /></main>
  return <AppShell
    administrationNavigationLabel={t('administrationNavigation')}
    actorName={actor?.display_name}
    contextLabel={text.context}
    headerActions={<div className="shell-action-cluster"><LocaleToggle /><GlobalCommandCenter locale={locale} triggerLabel={t('search')} /><RealtimeStatus labels={{ connected: t('live'), connecting: t('connecting'), reconnecting: t('reconnecting'), offline: t('offline') }} /></div>}
    mainNavigationLabel={t('mainNavigation')}
    menuLabel={t('menu')}
    mobileNavigationLabel={t('mobileNavigation')}
    productName="WorkMesh"
    navigation={workspaceNavigation({ active: 'agents', t })}
    skipLabel={t('skipToContent')}
    utilityNavigation={workspaceUtilityNavigation({ t })}
    workspaceNavigationLabel={t('workspaceNavigation')}
  >
    <section className="agent-center">
      <header className="page-header"><div><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p>{text.intro}</p></div><Button onClick={refresh}>{text.refresh}</Button></header>
      {(error || collectionError) && <ErrorState actionLabel={text.retry} description={error || collectionError?.message || text.attentionDescription} onAction={refresh} title={text.attentionTitle} />}

      <section className="control-summary" aria-label="Agent control summary">
        <article><span>{text.activeAgents}</span><strong>{agents.filter(agent => agent.is_active).length}</strong><small>{text.registered(agents.length)}</small></article>
        <article><span>{text.liveSessions}</span><strong>{sessions.filter(session => !['completed', 'failed', 'canceled'].includes(session.state)).length}</strong><small>{text.visible(sessions.length)}</small></article>
        <article className={approvals.length ? 'needs-attention' : ''}><span>{text.pendingApprovals}</span><strong>{approvals.length}</strong><small>{approvals.length ? text.responseRequired : text.queueClear}</small></article>
        <article className={attentionSessions.length ? 'needs-attention' : ''}><span>{text.needsAttention}</span><strong>{attentionSessions.length}</strong><small>{text.blockedOrWaiting}</small></article>
      </section>

      <AgentConnectionsPanel admin={actor?.workspace_role === 'admin'} teams={teams} humans={humans.length ? humans : actor ? [{ id: actor.id, display_name: actor.display_name }] : []} currentHumanId={actor?.id ?? ''} onError={setError} />

      <section className="agent-center-grid">
        <section className="surface-panel agent-registry" aria-label="Agent registry">
          <header className="surface-header"><div><p className="eyebrow">{text.registry}</p><h2>{text.title}</h2><p>{text.registryIntro}</p></div><div className="activity-filters">{(['all', 'active', 'inactive'] as AgentFilter[]).map(value => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{text[value]}</button>)}</div></header>
          {shownAgents.length === 0 ? <p className="empty">{text.noAgents}</p> : <div className="registry-list">{shownAgents.map(agent => <article className="agent-summary-card" id={`agent-${agent.id}`} key={agent.id} data-testid={`agent-registry-${agent.id}`}>
            <header><div><h3>{agentName(agent)}</h3><small>{agent.slug} · {agentProvider(agent)} {agentVersion(agent)}</small></div><span className={agent.is_active ? 'registry-active' : 'registry-inactive'}>{agent.is_active ? text.registryStatusActive : text.registryStatusInactive}</span></header>
            <p>{agent.description || text.noRegistryDescription}</p>
            <dl className="agent-key-facts"><div><dt>{text.approvedLabel}</dt><dd>{text.capabilitiesLabel(agent.approved_capabilities.length || 0)}</dd></div><div><dt>{text.concurrency}</dt><dd>{agent.max_concurrency}</dd></div><div><dt>{text.heartbeat}</dt><dd>{agentHeartbeat(agent)}s</dd></div></dl>
            <details className="agent-access-details"><summary>{text.teamAccessAndCapabilities}</summary><p><strong>{text.requestedLabel}</strong> {agent.requested_capabilities.join(', ') || text.none}</p><p><strong>{text.definitionApprovedLabel}</strong> {agent.approved_capabilities.join(', ') || text.none}</p><section className="team-access-list" aria-label={`${agentName(agent)} team access`}>{teams.length === 0 ? <p className="empty">{text.noTeamsAvailable}</p> : teams.map(team => {
              const access = agent.team_access?.find(candidate => candidate.team_id === team.id)
              const status = access?.status ?? (access?.revoked_at ? 'revoked' : 'not granted')
              const statusLabel = status === 'active' ? text.accessStatusActive : status === 'revoked' ? text.accessStatusRevoked : text.accessStatusNotGranted
              const operation = `${agent.id}:${team.id}`
              return <article key={team.id} data-testid={`team-access-${agent.id}-${team.id}`}><header><strong>{team.name} ({team.key})</strong><span className={status === 'active' ? 'registry-active' : 'registry-inactive'}>{statusLabel}</span></header><p>{text.accessApprovedLabel} {access?.approved_capabilities.length ? access.approved_capabilities.join(', ') : text.none}</p>{access?.revoked_at && <small>{text.revokedAt(formatTime(access.revoked_at))}</small>}{canManageAccess && <form key={`${operation}:${access?.revision ?? 0}:${status}`} onSubmit={event => void grantAccess(event, agent, team)}><fieldset disabled={busyAccess === operation || agent.requested_capabilities.length === 0}><legend>{text.approvedCapabilitySubset}</legend>{agent.requested_capabilities.map(capability => <label key={capability}><input type="checkbox" name="capabilities" value={capability} defaultChecked={access?.status === 'active' && access.approved_capabilities.includes(capability)} /> {capability}</label>)}</fieldset><div className="session-actions"><button data-testid={`team-access-grant-${agent.id}-${team.id}`} disabled={busyAccess === operation || agent.requested_capabilities.length === 0}>{access?.status === 'active' ? text.updateGrant : text.grantAccess}</button>{access?.status === 'active' && <button data-testid={`team-access-revoke-${agent.id}-${team.id}`} className="danger" type="button" disabled={busyAccess === operation} onClick={() => void revokeAccess(agent, team)}>{text.revoke}</button>}</div></form>}</article>
            })}</section></details>
          </article>)}</div>}
          <LoadMoreButton collection={agentsPage} label="agents" loadMoreLabel={text.loadMoreAgents} /><LoadMoreButton collection={teamsPage} label="teams" loadMoreLabel={text.loadMoreTeams} />
        </section>

        <div className="agent-side-stack">
          <section className="surface-panel approval-inbox" aria-label="Approval inbox"><header className="surface-header"><div><p className="eyebrow">{text.humanQueue}</p><h2>{text.approvals}</h2></div><a href="/?view=inbox">{text.openInbox}</a></header>{approvals.length === 0 ? <p className="empty">{text.noApprovals}</p> : approvals.map(approval => <article key={approval.id}><header><strong>{approval.action_name}</strong><span className={`risk-${approval.risk_level}`}>{text.riskLabel(approval.risk_level)}</span></header><p>{approval.rationale_summary}</p><a href={`/agent-sessions/${approval.session_id}`}>{text.reviewSession}</a></article>)}<LoadMoreButton collection={approvalsPage} label="approvals" loadMoreLabel={text.loadMoreApprovals} /></section>

          <section className="surface-panel" aria-label="Agent sessions"><header className="surface-header"><div><p className="eyebrow">{text.execution}</p><h2>{text.sessions}</h2></div></header>{sessions.length === 0 ? <p className="empty">{text.noSessions}</p> : <div className="session-table">{sessions.map(session => <a key={session.id} href={`/agent-sessions/${session.id}`}><div><span className={agentStateClass(session.state)}>{agentStateLabel(session.state)}</span><strong>{agentName(agents.find(agent => agent.id === session.agent_id))}</strong></div><span>{text.sessionLabel(session.id.slice(0, 8))}</span><span>{session.work_item_id ? text.workItemLabel(session.work_item_id.slice(0, 8)) : text.noWorkItem}</span><span>{text.heartbeatLabel(formatTime(session.last_heartbeat_at))}</span></a>)}</div>}<LoadMoreButton collection={sessionsPage} label="sessions" loadMoreLabel={text.loadMoreSessions} /></section>

          <section className="surface-panel diagnostics" aria-label="Agent diagnostics"><header className="surface-header"><div><p className="eyebrow">{text.durableState}</p><h2>{text.diagnostics}</h2></div></header><p>{text.diagnosticsIntro}</p><ul>{attentionSessions.map(session => <li key={session.id}><a href={`/agent-sessions/${session.id}`}>{text.sessionLabel(session.id.slice(0, 8))}</a><span>{session.state_reason || session.error_summary || agentStateLabel(session.state)}</span></li>)}{attentionSessions.length === 0 && <li><strong>{text.allClear}</strong><span>{text.allClearDetail}</span></li>}</ul></section>
        </div>
      </section>
    </section>
  </AppShell>
}
