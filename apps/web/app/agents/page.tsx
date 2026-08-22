'use client'

import { type ChangeEvent, type KeyboardEvent, useCallback, useMemo, useState } from 'react'
import { AppShell, AsyncStateSurface, Button, ErrorState, Tabs } from '@workmesh/ui'
import { ArrowRightIcon } from '@phosphor-icons/react'
import {
  type Agent,
  type AgentSession,
  type Approval,
  type ApprovalDecision,
  agentHeartbeat,
  agentName,
  agentProvider,
  agentStateClass,
  agentStateLabel,
  agentVersion,
  canManageAgentTeamAccess,
  decideApproval,
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
import { ApprovalsTable } from './approvals-table'
import { TeamAccessDrawer } from './team-access-drawer'

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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
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

  const grantCapabilities = async (agent: Agent, teamId: string, approvedCapabilities: string[]) => {
    if (approvedCapabilities.length === 0) { setError(text.selectCapability); return }
    const operation = `${agent.id}:${teamId}`
    try { setBusyAccess(operation); setError(''); await grantAgentTeamAccess(agent.id, teamId, approvedCapabilities); await agentsPage.refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : text.updateAccessError) }
    finally { setBusyAccess('') }
  }

  const revokeAccess = async (agent: Agent, teamId: string) => {
    const operation = `${agent.id}:${teamId}`
    try { setBusyAccess(operation); setError(''); await revokeAgentTeamAccess(agent.id, teamId); await agentsPage.refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : text.revokeAccessError) }
    finally { setBusyAccess('') }
  }

  // Bulk approval selection state. The set is keyed by approval id so the
  // table can render a checkbox per row and the action bar can read the
  // current selection in O(1) without re-scanning the approvals array on
  // every render. The "live" helpers below project the selection against
  // the visible list so stale ids (decided elsewhere, expired, paginated
  // out) cannot drive a bulk action — the action bar only counts rows
  // the user can still see, and `decideApprovals` only operates on those.
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<Set<string>>(() => new Set())
  const [bulkApprovalBusy, setBulkApprovalBusy] = useState(false)
  const visibleApprovalIds = useMemo(() => approvals.map(approval => approval.id), [approvals])
  const selectedLiveApprovalIds = useMemo(
    () => visibleApprovalIds.filter(id => selectedApprovalIds.has(id)),
    [visibleApprovalIds, selectedApprovalIds],
  )
  const selectedLiveCount = selectedLiveApprovalIds.length
  const toggleApproval = useCallback((id: string) => {
    setSelectedApprovalIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const toggleAllApprovals = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.checked) {
      setSelectedApprovalIds(new Set(visibleApprovalIds))
    } else {
      // The page's selection is scoped to the currently visible rows;
      // "uncheck all" clears them outright rather than retaining ids from
      // a previous page that the user can no longer see.
      setSelectedApprovalIds(new Set())
    }
  }, [visibleApprovalIds])
  const clearApprovalSelection = useCallback(() => {
    setSelectedApprovalIds(new Set())
  }, [])
  // Decide a list of approvals in parallel. Failed ids are kept in the
  // selection so the user can retry; succeeded ids are dropped because
  // they have left the visible list after `approvalsPage.refresh()`.
  const decideApprovals = async (decision: ApprovalDecision) => {
    if (selectedLiveCount === 0 || bulkApprovalBusy) return
    const targets = selectedLiveApprovalIds
      .map(id => approvals.find(approval => approval.id === id))
      .filter((approval): approval is Approval => approval !== undefined)
    if (targets.length === 0) return
    setBulkApprovalBusy(true)
    setError('')
    try {
      const results = await Promise.allSettled(targets.map(approval => decideApproval(approval, decision)))
      const failedIds = new Set<string>()
      const failureMessages: string[] = []
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failedIds.add(targets[index]!.id)
          const reason = result.reason
          failureMessages.push(reason instanceof Error ? reason.message : String(reason))
        }
      })
      await approvalsPage.refresh()
      if (failedIds.size > 0) {
        setSelectedApprovalIds(failedIds)
        setError(failureMessages[0] ?? (decision === 'approved' ? text.bulkApproveError : text.bulkRejectError))
      } else {
        setSelectedApprovalIds(new Set())
      }
    } finally {
      setBulkApprovalBusy(false)
    }
  }

  const shownAgents = useMemo(
    () => filterAgents(agents, { name: nameFilter, teamId: teamFilter, capability: capabilityFilter, state: filter }),
    [agents, nameFilter, teamFilter, capabilityFilter, filter],
  )
  const capabilityOptions = useMemo(() => uniqueRequestedCapabilities(agents), [agents])
  const canManageAccess = canManageAgentTeamAccess(actor?.workspace_role)
  const attentionSessions = sessions.filter(session => ['stale', 'failed', 'blocked', 'awaiting_approval', 'awaiting_input'].includes(session.state))
  const refresh = () => { void refreshActor(); void agentsPage.refresh(); void teamsPage.refresh(); void humansPage.refresh(); void sessionsPage.refresh(); void approvalsPage.refresh() }

  // Resolve the currently selected agent from the loaded list. The drawer
  // stays mounted but renders nothing when this resolves to `null` (no
  // selection, or the agent was filtered out from under the open drawer).
  const selectedAgent = useMemo(() => shownAgents.find(agent => agent.id === selectedAgentId) ?? null, [shownAgents, selectedAgentId])
  const openDrawer = (agentId: string) => setSelectedAgentId(agentId)
  const closeDrawer = () => setSelectedAgentId(null)
  const activateAgent = (agentId: string) => (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openDrawer(agentId)
    }
  }

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
              {shownAgents.length === 0 ? <p className="empty">{text.noAgents}</p> : <div className="registry-list">{shownAgents.map(agent => <article
                aria-label={`${agentName(agent)} — ${text.openTeamAccess}`}
                className="agent-summary-card agent-summary-card-clickable"
                data-testid={`agent-registry-${agent.id}`}
                id={`agent-${agent.id}`}
                key={agent.id}
                onClick={() => openDrawer(agent.id)}
                onKeyDown={activateAgent(agent.id)}
                role="button"
                tabIndex={0}
              >
                <header><div><h3>{agentName(agent)}</h3><small>{agent.slug} · {agentProvider(agent)} {agentVersion(agent)}</small></div><span className={agent.is_active ? 'registry-active' : 'registry-inactive'}>{agent.is_active ? text.registryStatusActive : text.registryStatusInactive}</span></header>
                <p>{agent.description || text.noRegistryDescription}</p>
                <dl className="agent-key-facts"><div><dt>{text.approvedLabel}</dt><dd>{text.capabilitiesLabel(agent.approved_capabilities.length || 0)}</dd></div><div><dt>{text.concurrency}</dt><dd>{agent.max_concurrency}</dd></div><div><dt>{text.heartbeat}</dt><dd>{agentHeartbeat(agent)}s</dd></div></dl>
                <div className="agent-summary-card-affordance">
                  <span>{text.openTeamAccess}</span>
                  <ArrowRightIcon aria-hidden size={14} weight="bold" />
                </div>
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
              <section className="surface-panel approval-inbox" aria-label="Approval inbox"><header className="surface-header"><div><p className="eyebrow">{text.humanQueue}</p><h2>{text.approvals}</h2></div><a href="/?view=inbox">{text.openInbox}</a></header>
                <ApprovalsTable
                  approvals={approvals}
                  bulkBusy={bulkApprovalBusy}
                  copy={text}
                  onClear={clearApprovalSelection}
                  onDecide={decision => void decideApprovals(decision)}
                  onToggle={toggleApproval}
                  onToggleAll={toggleAllApprovals}
                  selectedIds={selectedApprovalIds}
                />
                <LoadMoreButton collection={approvalsPage} label="approvals" loadMoreLabel={text.loadMoreApprovals} />
              </section>
            </div>,
          },
        ]}
        value={activeTab}
      />
    </section>
    <TeamAccessDrawer
      agent={selectedAgent}
      busyAccess={busyAccess}
      canManage={canManageAccess}
      onClose={closeDrawer}
      onGrant={(teamId, capabilities) => { if (selectedAgent) void grantCapabilities(selectedAgent, teamId, capabilities) }}
      onRevoke={teamId => { if (selectedAgent) void revokeAccess(selectedAgent, teamId) }}
      open={selectedAgent !== null}
      teams={teams}
    />
  </AppShell>
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
