'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { AppShell, AsyncStateSurface, Button, ErrorState, Tabs } from '@workmesh/ui'
import { CheckCircleIcon, EyeIcon, XCircleIcon } from '@phosphor-icons/react'
import {
  type Agent,
  type AgentSession,
  type AgentTeamAccess,
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
import { LocaleToggle, useLocale } from '../lib/i18n'
import { useAuthenticatedActor } from '../lib/use-authenticated-actor'
import { useMediaQuery } from '../lib/use-media-query'
import { workspaceNavigation, workspaceUtilityNavigation } from '../lib/workspace-navigation'
import { filterAgents, uniqueRequestedCapabilities, type AgentStateFilter } from './filters'

type Team = { id: string; name: string; key: string }
type Human = { id: string; display_name: string; email?: string }
type AgentsTab = 'agents' | 'sessions' | 'approvals'

export default function AgentsPage() {
  const { t, agentsCopy } = useLocale()
  const text = agentsCopy
  const { actor, loading, error: actorError, refresh: refreshActor } = useAuthenticatedActor()
  const isCompact = useMediaQuery('(max-width: 720px)')
  const [activeTab, setActiveTab] = useState<AgentsTab>('agents')
  const [filter, setFilter] = useState<AgentStateFilter>('all')
  const [nameFilter, setNameFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [capabilityFilter, setCapabilityFilter] = useState('')
  const [error, setError] = useState('')
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

  const realtimeResources = useMemo<RealtimeResource[]>(() => [
    ...(actor?.workspace_id
      ? [{ type: 'workspace' as const, id: actor.workspace_id }]
      : []),
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

  const grantCapabilities = async (agent: Agent, team: Team, approvedCapabilities: string[]) => {
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

  const shownAgents = useMemo(
    () => filterAgents(agents, { name: nameFilter, teamId: teamFilter, capability: capabilityFilter, state: filter }),
    [agents, nameFilter, teamFilter, capabilityFilter, filter],
  )
  const capabilityOptions = useMemo(() => uniqueRequestedCapabilities(agents), [agents])
  const canManageAccess = canManageAgentTeamAccess(actor?.workspace_role)
  const attentionSessions = sessions.filter(session => ['stale', 'failed', 'blocked', 'awaiting_approval', 'awaiting_input'].includes(session.state))
  const refresh = () => { void refreshActor(); void agentsPage.refresh(); void teamsPage.refresh(); void humansPage.refresh(); void sessionsPage.refresh(); void approvalsPage.refresh() }

  if (loading) return <main className="center foundation-center wm-theme"><AsyncStateSurface description={text.loadingDescription} state="loading" title={text.loadingTitle} /></main>
  if (!actor) return <main className="center foundation-center wm-theme"><ErrorState actionLabel={text.retry} description={actorError || text.loadError} onAction={() => void refreshActor()} title={text.attentionTitle} /></main>
  return <AppShell
    administrationNavigationLabel={t('administrationNavigation')}
    actorName={actor?.display_name}
    contextLabel={text.context}
    headerActions={<div className="shell-action-cluster"><LocaleToggle /><RealtimeStatus labels={{ connected: t('live'), connecting: t('connecting'), reconnecting: t('reconnecting'), offline: t('offline') }} /></div>}
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

      <Tabs
        ariaLabel={text.tabsAriaLabel}
        compact={isCompact}
        onValueChange={value => setActiveTab(value as AgentsTab)}
        tabs={[
          {
            id: 'agents',
            label: text.tabAgents,
            panel: <section className="surface-panel agent-registry" aria-label="Agent registry">
              <header className="surface-header"><div><p className="eyebrow">{text.registry}</p><h2>{text.title}</h2><p>{text.registryIntro}</p></div><div className="activity-filters">{(['all', 'active', 'inactive'] as AgentStateFilter[]).map(value => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{text[value]}</button>)}</div></header>
              <div className="agent-registry-filters" role="group" aria-label={text.filterAriaLabel}>
                <label><span>{text.filterName}</span><input aria-label={text.filterName} className="wm-input" placeholder={text.filterNamePlaceholder} type="search" value={nameFilter} onChange={event => setNameFilter(event.currentTarget.value)} /></label>
                <label><span>{text.filterTeam}</span><select aria-label={text.filterTeam} value={teamFilter} onChange={event => setTeamFilter(event.currentTarget.value)}><option value="">{text.allTeams}</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                <label><span>{text.filterCapability}</span><select aria-label={text.filterCapability} value={capabilityFilter} onChange={event => setCapabilityFilter(event.currentTarget.value)}><option value="">{text.allCapabilities}</option>{capabilityOptions.map(capability => <option key={capability} value={capability}>{capability}</option>)}</select></label>
                <label><span>{text.filterStatus}</span><select aria-label={text.filterStatus} value={filter} onChange={event => setFilter(event.currentTarget.value as AgentStateFilter)}><option value="all">{text.all}</option><option value="active">{text.active}</option><option value="inactive">{text.inactive}</option></select></label>
              </div>
              {shownAgents.length === 0 ? <p className="empty">{text.noAgents}</p> : <div className="registry-list">{shownAgents.map(agent => <article className="agent-summary-card" id={`agent-${agent.id}`} key={agent.id} data-testid={`agent-registry-${agent.id}`}>
                <header><div><h3>{agentName(agent)}</h3><small>{agent.slug} · {agentProvider(agent)} {agentVersion(agent)}</small></div><span className={agent.is_active ? 'registry-active' : 'registry-inactive'}>{agent.is_active ? text.registryStatusActive : text.registryStatusInactive}</span></header>
                <p>{agent.description || text.noRegistryDescription}</p>
                <dl className="agent-key-facts"><div><dt>{text.approvedLabel}</dt><dd>{text.capabilitiesLabel(agent.approved_capabilities.length || 0)}</dd></div><div><dt>{text.concurrency}</dt><dd>{agent.max_concurrency}</dd></div><div><dt>{text.heartbeat}</dt><dd>{agentHeartbeat(agent)}s</dd></div></dl>
                <details className="agent-access-details"><summary>{text.teamAccessAndCapabilities}</summary><p><strong>{text.requestedLabel}</strong> {agent.requested_capabilities.join(', ') || text.none}</p><p><strong>{text.definitionApprovedLabel}</strong> {agent.approved_capabilities.join(', ') || text.none}</p><section className="team-access-list" aria-label={`${agentName(agent)} team access`}>{teams.length === 0 ? <p className="empty">{text.noTeamsAvailable}</p> : teams.map(team => {
                  const access = agent.team_access?.find(candidate => candidate.team_id === team.id)
                  const status = access?.status ?? (access?.revoked_at ? 'revoked' : 'not granted')
                  const statusLabel = status === 'active' ? text.accessStatusActive : status === 'revoked' ? text.accessStatusRevoked : text.accessStatusNotGranted
                  const operation = `${agent.id}:${team.id}`
                  return <TeamAccessCard
                    agent={agent}
                    access={access ?? null}
                    busy={busyAccess === operation}
                    canManage={canManageAccess}
                    key={team.id}
                    onGrant={next => void grantCapabilities(agent, team, next)}
                    onRevoke={() => void revokeAccess(agent, team)}
                    team={team}
                  />
                })}</section></details>
              </article>)}</div>}
              <LoadMoreButton collection={agentsPage} label="agents" loadMoreLabel={text.loadMoreAgents} /><LoadMoreButton collection={teamsPage} label="teams" loadMoreLabel={text.loadMoreTeams} />
            </section>,
          },
          {
            id: 'sessions',
            label: text.tabSessions,
            panel: <div className="agent-side-stack">
              <section className="surface-panel" aria-label="Agent sessions"><header className="surface-header"><div><p className="eyebrow">{text.execution}</p><h2>{text.sessions}</h2></div></header>{sessions.length === 0 ? <p className="empty">{text.noSessions}</p> : <div className="session-card-list">{sessions.map(session => <SessionCard agentName={agentName(agents.find(agent => agent.id === session.agent_id))} copy={text} session={session} key={session.id} />)}</div>}<LoadMoreButton collection={sessionsPage} label="sessions" loadMoreLabel={text.loadMoreSessions} /></section>
              <section className="surface-panel diagnostics" aria-label="Agent diagnostics"><header className="surface-header"><div><p className="eyebrow">{text.durableState}</p><h2>{text.diagnostics}</h2></div></header><p>{text.diagnosticsIntro}</p><ul>{attentionSessions.map(session => <li key={session.id}><a href={`/agent-sessions/${session.id}`}>{text.sessionLabel(session.id.slice(0, 8))}</a><span>{session.state_reason || session.error_summary || agentStateLabel(session.state)}</span></li>)}{attentionSessions.length === 0 && <li><strong>{text.allClear}</strong><span>{text.allClearDetail}</span></li>}</ul></section>
            </div>,
          },
          {
            id: 'approvals',
            label: text.tabApprovals,
            panel: <div className="agent-side-stack">
              <section className="surface-panel approval-inbox" aria-label="Approval inbox"><header className="surface-header"><div><p className="eyebrow">{text.humanQueue}</p><h2>{text.approvals}</h2></div><a href="/?view=inbox">{text.openInbox}</a></header>{approvals.length === 0 ? <p className="empty">{text.noApprovals}</p> : approvals.map(approval => <article key={approval.id}><header><strong>{approval.action_name}</strong><span className={`risk-${approval.risk_level}`}>{text.riskLabel(approval.risk_level)}</span></header><p>{approval.rationale_summary}</p><a href={`/agent-sessions/${approval.session_id}`}>{text.reviewSession}</a></article>)}<LoadMoreButton collection={approvalsPage} label="approvals" loadMoreLabel={text.loadMoreApprovals} /></section>
            </div>,
          },
        ]}
        value={activeTab}
      />
    </section>
  </AppShell>
}

type TeamAccessCardProps = {
  agent: Agent
  team: { id: string; name: string; key: string }
  access: AgentTeamAccess | null
  canManage: boolean
  busy: boolean
  onGrant: (approvedCapabilities: string[]) => void
  onRevoke: () => void
}

function TeamAccessCard({ access, agent, busy, canManage, onGrant, onRevoke, team }: TeamAccessCardProps) {
  const { agentsCopy } = useLocale()
  const text = agentsCopy
  const [view, setView] = useState<'requested' | 'approved'>('approved')
  const requested = agent.requested_capabilities
  const initialApproved = access?.status === 'active' ? access.approved_capabilities : []
  const [approved, setApproved] = useState<string[]>(initialApproved)
  useEffect(() => { setApproved(initialApproved) }, [initialApproved.join('|')])
  const isActive = access?.status === 'active'
  const status = !access ? text.accessStatusNotGranted : access.status === 'active' ? text.accessStatusActive : text.accessStatusRevoked
  const toggle = (capability: string) => {
    setApproved(current => current.includes(capability) ? current.filter(value => value !== capability) : [...current, capability])
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onGrant(approved)
  }
  return (
    <article className="team-access-card" data-testid={`team-access-${agent.id}-${team.id}`}>
      <header>
        <div>
          <strong>{team.name} <small>({team.key})</small></strong>
          {access?.revoked_at && <small>{text.revokedAt(formatTime(access.revoked_at))}</small>}
        </div>
        <span className={isActive ? 'pill is-active' : 'pill is-inactive'}>{status}</span>
      </header>
      {canManage ? (
        <form className="team-access-form" key={`${access?.revision ?? 0}:${isActive}`} onSubmit={submit}>
          <div className="team-access-toggle" role="tablist" aria-label={text.teamAccessViewLabel}>
            <button
              aria-pressed={view === 'requested'}
              className={view === 'requested' ? 'is-selected' : ''}
              onClick={() => setView('requested')}
              type="button"
              role="tab"
            >
              <EyeIcon aria-hidden size={14} weight="bold" />
              {text.teamAccessViewRequested}
              <span className="team-access-toggle-count">{requested.length}</span>
            </button>
            <button
              aria-pressed={view === 'approved'}
              className={view === 'approved' ? 'is-selected' : ''}
              onClick={() => setView('approved')}
              type="button"
              role="tab"
            >
              <CheckCircleIcon aria-hidden size={14} weight="bold" />
              {text.teamAccessViewApproved}
              <span className="team-access-toggle-count">{approved.length}</span>
            </button>
          </div>
          {view === 'requested' ? (
            <div className="team-access-chips" role="tabpanel" aria-label={text.teamAccessViewRequested}>
              {requested.length === 0
                ? <p className="empty">{text.teamAccessEmptyRequested}</p>
                : requested.map(capability => (
                  <span className="chip chip-outline" key={capability}>
                    {text.teamAccessRequestedChipLabel(capability)}
                  </span>
                ))}
            </div>
          ) : (
            <div className="team-access-chips" role="tabpanel" aria-label={text.teamAccessViewApproved}>
              {requested.length === 0
                ? <p className="empty">{text.teamAccessEmptyRequested}</p>
                : (
                  <>
                    {requested.map(capability => {
                      const isSelected = approved.includes(capability)
                      return (
                        <button
                          aria-pressed={isSelected}
                          className={`chip ${isSelected ? 'chip-solid' : 'chip-outline'}`}
                          disabled={busy}
                          key={capability}
                          onClick={() => toggle(capability)}
                          type="button"
                        >
                          {isSelected
                            ? <CheckCircleIcon aria-hidden size={12} weight="bold" />
                            : null}
                          {text.teamAccessApprovedChipLabel(capability)}
                        </button>
                      )
                    })}
                    {approved.length === 0 && <p className="empty team-access-hint">{text.teamAccessNoSelection}</p>}
                  </>
                )}
            </div>
          )}
          <div className="team-access-actions">
            <small className="team-access-meta">{text.teamAccessSelectedCount(approved.length)} · {text.teamAccessToggleHint}</small>
            <div className="team-access-buttons">
              <Button
                disabled={busy || approved.length === 0}
                icon={<CheckCircleIcon aria-hidden size={16} weight="bold" />}
                type="submit"
                variant="primary"
              >
                {isActive ? text.updateGrant : text.grantAccess}
              </Button>
              {isActive && (
                <Button
                  className="danger"
                  disabled={busy}
                  icon={<XCircleIcon aria-hidden size={16} weight="bold" />}
                  onClick={onRevoke}
                  type="button"
                  variant="danger"
                >
                  {text.revoke}
                </Button>
              )}
            </div>
          </div>
        </form>
      ) : (
        <div className="team-access-chips" aria-label={text.teamAccessViewApproved}>
          {(isActive && approved.length > 0
            ? approved
            : requested
          ).map(capability => (
            <span className={isActive && approved.includes(capability) ? 'chip chip-solid' : 'chip chip-outline'} key={capability}>
              {isActive && approved.includes(capability)
                ? text.teamAccessApprovedChipLabel(capability)
                : text.teamAccessRequestedChipLabel(capability)}
            </span>
          ))}
          {!isActive && requested.length === 0 && <p className="empty">{text.teamAccessEmptyRequested}</p>}
        </div>
      )}
    </article>
  )
}

type SessionCardProps = {
  session: AgentSession
  agentName: string
  copy: ReturnType<typeof useLocale>['agentsCopy']
}

function SessionCard({ agentName: name, copy, session }: SessionCardProps) {
  return (
    <a className="session-card" data-testid={`session-card-${session.id}`} href={`/agent-sessions/${session.id}`}>
      <header>
        <span className={`pill ${agentStateClass(session.state)}`}>{agentStateLabel(session.state)}</span>
        <strong className="session-card-name">{name || copy.noWorkItem}</strong>
      </header>
      <dl>
        <div><dt>{copy.sessionLabel('')}</dt><dd><code>{session.id.slice(0, 8)}</code></dd></div>
        <div><dt>{copy.workItemLabel('')}</dt><dd>{session.work_item_id ? <code>{session.work_item_id.slice(0, 8)}</code> : <span className="muted">{copy.noWorkItem}</span>}</dd></div>
        <div><dt>{copy.heartbeatLabel('')}</dt><dd>{formatTime(session.last_heartbeat_at)}</dd></div>
      </dl>
    </a>
  )
}
