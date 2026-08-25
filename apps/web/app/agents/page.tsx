'use client'

import { memo, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell, AsyncStateSurface, Button, ErrorState, Tabs } from '@workmesh/ui'
import type { HumanAttentionItem } from '@workmesh/contracts'
import {
  type Agent,
  type AgentSession,
  type Approval,
  type ApprovalDecision,
  agentName,
  agentStateClass,
  agentStateLabel,
  canManageAgentTeamAccess,
  decideApproval,
  formatTime,
  grantAgentTeamAccess,
  normalizeApproval,
  revokeAgentTeamAccess,
} from '../lib/agents'
import { LoadMoreButton, usePagedApiList } from '../lib/pagination'
import { SkeletonList } from '../lib/skeleton-list'
import { listIntent, nextFocusedId } from '../lib/list-interactions'
import { type RealtimeResource, useRealtimeSubscription } from '../lib/realtime'
import { agentRegistryRefreshTargets } from '../lib/realtime-refresh'
import { AgentConnectionsPanel } from '../agent-connections-panel'
import { RealtimeStatus } from '../realtime-status'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { actorAuthorityScopeKey, type AuthenticatedActor } from '../lib/actor'
import { useAuthenticatedActor } from '../lib/use-authenticated-actor'
import { useAuthorityLifetime } from '../lib/use-authority-lifetime'
import { isCollectionAuthorityRevoked } from '../lib/collection-authority'
import { useMediaQuery } from '../lib/use-media-query'
import { useToast } from '../lib/use-toast'
import { workspaceNavigation, workspaceUtilityNavigation } from '../lib/workspace-navigation'
import { filterAgents, uniqueRequestedCapabilities, type AgentStateFilter } from './filters'
import { ApprovalHistoryTable } from './approval-history-table'
import { consumeAgentDetailReturnFocus, rememberAgentDetailReturnFocus } from './agent-detail-return'
import { AgentPeek } from './agent-peek'
import { AgentRegistryCard } from './agent-registry-card'
import {
  approvalTerminalStatuses,
  type AgentsTab,
  type ApprovalTerminalStatus,
  findLoadedAgent,
  useAgentsRouteState,
} from './approval-route-state'
import { ApprovalsTable } from './approvals-table'
import { TeamAccessDrawer } from './team-access-drawer'

type Team = { id: string; name: string; key: string }
type Human = { id: string; display_name: string; email?: string }
const attentionHref = (item: HumanAttentionItem): string => {
  if (item.sessionId) return `/agent-sessions/${item.sessionId}`
  if (item.workItemId) return `/?workItemId=${encodeURIComponent(item.workItemId)}`
  if (item.projectId) return `/?view=projects&projectId=${encodeURIComponent(item.projectId)}`
  return '/'
}

export default function AgentsPage() {
  const { agentsCopy: text } = useLocale()
  const { actor, loading, error: actorError, refresh: refreshActor } = useAuthenticatedActor()
  if (loading && !actor) return <main className="center foundation-center wm-theme"><AsyncStateSurface description={text.loadingDescription} state="loading" title={text.loadingTitle} /></main>
  if (!actor) return <main className="center foundation-center wm-theme"><ErrorState actionLabel={text.retry} description={actorError || text.loadError} onAction={() => void refreshActor()} title={text.attentionTitle} /></main>
  return <AgentsPageScope
    actor={actor}
    actorError={actorError}
    key={actorAuthorityScopeKey(actor)}
    loading={loading}
    refreshActor={refreshActor}
  />
}

function AgentsPageScope({
  actor,
  actorError,
  loading,
  refreshActor,
}: {
  actor: AuthenticatedActor
  actorError: string
  loading: boolean
  refreshActor: () => Promise<void>
}) {
  const { t, agentsCopy, toastCopy } = useLocale()
  const { push: pushToast } = useToast()
  const isAuthorityCurrent = useAuthorityLifetime()
  const text = agentsCopy
  const authorityScopeKey = actorAuthorityScopeKey(actor)
  const isCompact = useMediaQuery('(max-width: 720px)')
  const { state: routeState, update: updateRoute } = useAgentsRouteState()
  const {
    tab: activeTab,
    approvalView,
    approvalStatus,
    status: filter,
    name: nameFilter,
    teamId: teamFilter,
    capability: capabilityFilter,
    teamAccessAgentId,
  } = routeState
  const [error, setError] = useState('')
  const [busyAccess, setBusyAccess] = useState('')
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)
  const [peekAgentId, setPeekAgentId] = useState<string | null>(null)
  const agentLinkRefs = useRef(new Map<string, HTMLAnchorElement>())
  const agentsPage = usePagedApiList<Agent>('/api/v1/agents', { scopeKey: authorityScopeKey })
  const teamsPage = usePagedApiList<Team>('/api/v1/teams', { scopeKey: authorityScopeKey })
  const humansPage = usePagedApiList<Human>('/api/v1/actors/humans', { scopeKey: authorityScopeKey })
  const sessionsPage = usePagedApiList<AgentSession>('/api/v1/agent-sessions', { optional: true, scopeKey: authorityScopeKey })
  const attentionPage = usePagedApiList<HumanAttentionItem>('/api/v1/human-attention?status=open', { optional: true, scopeKey: authorityScopeKey })
  const pendingApprovalsPage = usePagedApiList<Approval, Approval>('/api/v1/approvals?status=pending', {
    optional: true,
    map: value => normalizeApproval(value as unknown as Record<string, unknown>),
    scopeKey: authorityScopeKey,
  })
  const historyApprovalsPage = usePagedApiList<Approval, Approval>(approvalView === 'history'
    ? `/api/v1/approvals?status=${approvalStatus}`
    : null, {
    optional: true,
    map: value => normalizeApproval(value as unknown as Record<string, unknown>),
    scopeKey: authorityScopeKey,
  })
  const agentsAuthorized = !isCollectionAuthorityRevoked(agentsPage.error)
  const teamsAuthorized = !isCollectionAuthorityRevoked(teamsPage.error)
  const humansAuthorized = !isCollectionAuthorityRevoked(humansPage.error)
  const sessionsAuthorized = !isCollectionAuthorityRevoked(sessionsPage.error)
  const attentionAuthorized = !isCollectionAuthorityRevoked(attentionPage.error)
  const pendingApprovalsAuthorized = !isCollectionAuthorityRevoked(pendingApprovalsPage.error)
  const historyApprovalsAuthorized = !isCollectionAuthorityRevoked(historyApprovalsPage.error)
  const agents = agentsAuthorized ? agentsPage.items : []
  const teams = teamsAuthorized ? teamsPage.items : []
  const humans = humansAuthorized ? humansPage.items : []
  const sessions = sessionsAuthorized ? sessionsPage.items : []
  const attentionItems = attentionAuthorized ? attentionPage.items : []
  const approvals = useMemo(
    () => pendingApprovalsAuthorized ? pendingApprovalsPage.items.filter(approval => approval.status === 'pending') : [],
    [pendingApprovalsAuthorized, pendingApprovalsPage.items],
  )
  const historyApprovals = historyApprovalsAuthorized ? historyApprovalsPage.items : []
  const collectionError = [agentsPage.error, teamsPage.error, humansPage.error, sessionsPage.error, attentionPage.error, pendingApprovalsPage.error, historyApprovalsPage.error].find(Boolean)
  const summaryError = agentsPage.error ?? sessionsPage.error ?? attentionPage.error ?? pendingApprovalsPage.error
  const summaryInitialized = agentsPage.initialized && agentsAuthorized
    && sessionsPage.initialized && sessionsAuthorized
    && attentionPage.initialized && attentionAuthorized
    && pendingApprovalsPage.initialized && pendingApprovalsAuthorized
  const registryInitialized = agentsPage.initialized && agentsAuthorized
  const sessionsInitialized = sessionsPage.initialized && sessionsAuthorized
  const connectionContextInitialized = teamsPage.initialized && teamsAuthorized
    && humansPage.initialized && humansAuthorized

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
      agentsPage.refresh(), teamsPage.refresh(), humansPage.refresh(), sessionsPage.refresh(), attentionPage.refresh(), pendingApprovalsPage.refresh(), historyApprovalsPage.refresh(),
    ]).then(() => undefined)
    if (targets.has('agents')) void agentsPage.refresh()
    if (targets.has('teams')) void teamsPage.refresh()
    if (targets.has('sessions')) void sessionsPage.refresh()
    if (targets.has('attention')) void attentionPage.refresh()
    if (targets.has('approvals')) {
      void pendingApprovalsPage.refresh()
      void historyApprovalsPage.refresh()
    }
  })

  const grantCapabilities = async (agent: Agent, teamId: string, approvedCapabilities: string[]) => {
    if (approvedCapabilities.length === 0) { setError(text.selectCapability); return }
    const operation = `${agent.id}:${teamId}`
    try {
      setBusyAccess(operation)
      setError('')
      await grantAgentTeamAccess(agent.id, teamId, approvedCapabilities)
      if (!isAuthorityCurrent()) return
      await agentsPage.refresh()
      if (!isAuthorityCurrent()) return
    } catch (reason) {
      if (isAuthorityCurrent()) setError(reason instanceof Error ? reason.message : text.updateAccessError)
    } finally {
      if (isAuthorityCurrent()) setBusyAccess('')
    }
  }

  const revokeAccess = async (agent: Agent, teamId: string) => {
    const operation = `${agent.id}:${teamId}`
    try {
      setBusyAccess(operation)
      setError('')
      await revokeAgentTeamAccess(agent.id, teamId)
      if (!isAuthorityCurrent()) return
      await agentsPage.refresh()
      if (!isAuthorityCurrent()) return
    } catch (reason) {
      if (isAuthorityCurrent()) setError(reason instanceof Error ? reason.message : text.revokeAccessError)
    } finally {
      if (isAuthorityCurrent()) setBusyAccess('')
    }
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
  // they have left the visible list after `pendingApprovalsPage.refresh()`.
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
      if (!isAuthorityCurrent()) return
      const failedIds = new Set<string>()
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failedIds.add(targets[index]!.id)
        }
      })
      try {
        await pendingApprovalsPage.refresh()
      } catch {
        if (!isAuthorityCurrent()) return
        setError(text.loadError)
      }
      if (!isAuthorityCurrent()) return
      if (failedIds.size > 0) {
        setSelectedApprovalIds(failedIds)
        const succeeded = targets.length - failedIds.size
        setError(succeeded > 0
          ? `${toastCopy.approvalsPartialTitle}. ${toastCopy.approvalsPartialDescription(succeeded, failedIds.size)}`
          : `${toastCopy.approvalsFailedTitle}. ${toastCopy.approvalsFailedDescription}`)
      } else {
        setSelectedApprovalIds(new Set())
        pushToast({
          dedupeKey: 'agents:bulk-approval',
          description: toastCopy.approvalsDecisionDescription,
          title: decision === 'approved'
            ? toastCopy.approvalsApprovedTitle(targets.length)
            : toastCopy.approvalsRejectedTitle(targets.length),
          tone: 'success',
        })
      }
    } finally {
      if (isAuthorityCurrent()) setBulkApprovalBusy(false)
    }
  }

  const shownAgents = useMemo(
    () => filterAgents(agents, { name: nameFilter, teamId: teamFilter, capability: capabilityFilter, state: filter }),
    [agents, nameFilter, teamFilter, capabilityFilter, filter],
  )
  const capabilityOptions = useMemo(() => uniqueRequestedCapabilities(agents), [agents])
  const canManageAccess = canManageAgentTeamAccess(actor?.workspace_role)
  const refresh = () => {
    void refreshActor()
    void agentsPage.refresh()
    void teamsPage.refresh()
    void humansPage.refresh()
    void sessionsPage.refresh()
    void attentionPage.refresh()
    void pendingApprovalsPage.refresh()
    void historyApprovalsPage.refresh()
  }

  const approvalStatusLabel = (status: ApprovalTerminalStatus): string => ({
    approved: text.approvalStatusApproved,
    rejected: text.approvalStatusRejected,
    expired: text.approvalStatusExpired,
    consumed: text.approvalStatusConsumed,
    canceled: text.approvalStatusCanceled,
  })[status]

  // Peek is local presentation state. Team Access is URL-owned and resolves
  // only against the authoritative aggregate returned by the Agents list;
  // the single-Agent endpoint deliberately never supplies this projection.
  const peekAgent = useMemo(() => findLoadedAgent(shownAgents, peekAgentId), [peekAgentId, shownAgents])
  const teamAccessAgent = useMemo(
    () => activeTab === 'agents' ? findLoadedAgent(agents, teamAccessAgentId) : null,
    [activeTab, agents, teamAccessAgentId],
  )
  const shownAgentIds = useMemo(() => shownAgents.map(agent => agent.id), [shownAgents])
  const rovingAgentId = focusedAgentId && shownAgentIds.includes(focusedAgentId)
    ? focusedAgentId
    : shownAgentIds[0] ?? null
  const registerAgentLink = useCallback((agentId: string, node: HTMLAnchorElement | null): void => {
    if (node) agentLinkRefs.current.set(agentId, node)
    else agentLinkRefs.current.delete(agentId)
  }, [])
  const selectFocusedAgent = useCallback((agentId: string): void => {
    setFocusedAgentId(agentId)
  }, [])
  const openAgentPeek = useCallback((agentId: string): void => {
    setPeekAgentId(agentId)
  }, [])
  const focusAgentLink = useCallback((agentId: string): void => {
    setFocusedAgentId(agentId)
    requestAnimationFrame(() => {
      if (!isAuthorityCurrent()) return
      const link = agentLinkRefs.current.get(agentId)
      if (!link?.isConnected || link.closest('[hidden], [inert], [aria-hidden="true"]')) return
      link.focus()
    })
  }, [isAuthorityCurrent])
  const rememberDetailReturnTarget = useCallback((agentId: string): void => {
    const listUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const nextState = rememberAgentDetailReturnFocus(window.history.state, listUrl, agentId)
    window.history.replaceState(nextState, '')
  }, [])
  useEffect(() => {
    if (!registryInitialized) return
    const listUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const restored = consumeAgentDetailReturnFocus(window.history.state, listUrl, shownAgentIds)
    if (!restored.hadMarker) return
    window.history.replaceState(restored.nextState, '')
    if (activeTab !== 'agents' || !restored.agentId) return
    focusAgentLink(restored.agentId)
  }, [activeTab, focusAgentLink, registryInitialized, shownAgentIds])
  useEffect(() => {
    if (!registryInitialized || activeTab !== 'agents') return
    const focusedAgentIsHidden = focusedAgentId !== null && !shownAgentIds.includes(focusedAgentId)
    const peekAgentIsHidden = peekAgentId !== null && !shownAgentIds.includes(peekAgentId)
    if (peekAgentIsHidden) setPeekAgentId(null)
    if (!focusedAgentIsHidden) return

    const firstVisibleAgentId = shownAgentIds[0] ?? null
    setFocusedAgentId(firstVisibleAgentId)
    if (!firstVisibleAgentId) return

    // Filtering removes the focused card before this effect runs, leaving
    // focus on body. A surviving control means the operator moved focus on
    // purpose, so update the roving target without taking DOM focus back.
    const activeElement = document.activeElement
    const hasSurvivingFocus = activeElement instanceof HTMLElement
      && activeElement !== document.body
      && activeElement.isConnected
      && !activeElement.closest('[hidden], [inert], [aria-hidden="true"]')
    if (!hasSurvivingFocus) focusAgentLink(firstVisibleAgentId)
  }, [activeTab, focusAgentLink, focusedAgentId, peekAgentId, registryInitialized, shownAgentIds])
  const handleRegistryKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const intent = listIntent(event.nativeEvent)
    if (!intent || intent === 'peek') return
    if (intent === 'escape') {
      if (selectedLiveCount === 0) return
      event.preventDefault()
      clearApprovalSelection()
      return
    }
    const target = event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>('[data-agent-roving-link="true"]')
      : null
    const currentId = target?.dataset.agentId ?? rovingAgentId
    const nextId = nextFocusedId(shownAgentIds, currentId, intent === 'previous' ? -1 : 1)
    if (!nextId) return
    event.preventDefault()
    focusAgentLink(nextId)
  }, [clearApprovalSelection, focusAgentLink, rovingAgentId, selectedLiveCount, shownAgentIds])
  const openTeamAccess = useCallback((agentId: string): void => {
    updateRoute({ tab: 'agents', teamAccessAgentId: agentId })
  }, [updateRoute])
  const closeTeamAccess = useCallback((): void => {
    updateRoute({ teamAccessAgentId: '' })
  }, [updateRoute])

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
    <section aria-busy={loading || undefined} className="agent-center">
      <header className="page-header"><div><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p>{text.intro}</p></div><Button onClick={refresh}>{text.refresh}</Button></header>
      {(error || actorError || collectionError) && <ErrorState actionLabel={text.retry} description={error || actorError || collectionError?.message || text.attentionDescription} onAction={refresh} title={text.attentionTitle} />}

      {summaryInitialized ? <section
        aria-busy={agentsPage.loading || sessionsPage.loading || attentionPage.loading || pendingApprovalsPage.loading || undefined}
        className="control-summary"
        aria-label={text.controlSummaryAriaLabel}
      >
        <article><span>{text.activeAgents}</span><strong>{agents.filter(agent => agent.is_active).length}</strong><small>{text.registered(agents.length)}</small></article>
        <article><span>{text.liveSessions}</span><strong>{sessions.filter(session => !['completed', 'failed', 'canceled'].includes(session.state)).length}</strong><small>{text.visible(sessions.length)}</small></article>
        <article className={approvals.length ? 'needs-attention' : ''}><span>{text.pendingApprovals}</span><strong>{approvals.length}</strong><small>{approvals.length ? text.responseRequired : text.queueClear}</small></article>
        <article className={attentionItems.length ? 'needs-attention' : ''}><span>{text.needsAttention}</span><strong>{attentionItems.length}</strong><small>{text.blockedOrWaiting}</small></article>
      </section> : summaryError ? null : <div className="agent-summary-loading"><SkeletonList columns={4} items={4} label={text.loadingTitle} /></div>}

      <AgentConnectionsPanel
        admin={actor?.workspace_role === 'admin'}
        authorityKey={authorityScopeKey}
        contextError={teamsPage.error ?? humansPage.error}
        contextInitialized={connectionContextInitialized}
        contextLoading={teamsPage.loading || humansPage.loading}
        teams={teams}
        humans={humans.length ? humans : actor ? [{ id: actor.id, display_name: actor.display_name }] : []}
        currentHumanId={actor?.id ?? ''}
        onError={setError}
        onRefreshContext={() => Promise.all([teamsPage.refresh(), humansPage.refresh()]).then(() => undefined)}
      />

      <Tabs
        ariaLabel={text.tabsAriaLabel}
        compact={isCompact}
        onValueChange={value => updateRoute({ tab: value as AgentsTab })}
        tabs={[
          {
            id: 'agents',
            label: text.tabAgents,
            panel: <section aria-busy={registryInitialized && ((agentsPage.loading || agentsPage.loadingMore) || (teamsPage.initialized && teamsAuthorized && (teamsPage.loading || teamsPage.loadingMore))) || undefined} className="surface-panel agent-registry" aria-label={text.registry}>
              <header className="surface-header"><div><p className="eyebrow">{text.registry}</p><h2>{text.title}</h2><p>{text.registryIntro}</p></div><div className="activity-filters">{(['all', 'active', 'inactive'] as AgentStateFilter[]).map(value => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => updateRoute({ status: value })}>{text[value]}</button>)}</div></header>
              <div className="agent-registry-filters" role="group" aria-label={text.filterAriaLabel}>
                <label><span>{text.filterName}</span><input aria-label={text.filterName} className="wm-input" data-hotkey-filter="true" placeholder={text.filterNamePlaceholder} type="search" value={nameFilter} onChange={event => updateRoute({ name: event.currentTarget.value })} /></label>
                <label><span>{text.filterTeam}</span><select aria-label={text.filterTeam} value={teamFilter} onChange={event => updateRoute({ teamId: event.currentTarget.value })}><option value="">{text.allTeams}</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                <label><span>{text.filterCapability}</span><select aria-label={text.filterCapability} value={capabilityFilter} onChange={event => updateRoute({ capability: event.currentTarget.value })}><option value="">{text.allCapabilities}</option>{capabilityOptions.map(capability => <option key={capability} value={capability}>{capability}</option>)}</select></label>
                <label><span>{text.filterStatus}</span><select aria-label={text.filterStatus} value={filter} onChange={event => updateRoute({ status: event.currentTarget.value as AgentStateFilter })}><option value="all">{text.all}</option><option value="active">{text.active}</option><option value="inactive">{text.inactive}</option></select></label>
              </div>
              {!registryInitialized
                ? (agentsPage.error ? null : <SkeletonList columns={1} items={4} label={text.loadingTitle} />)
                : shownAgents.length === 0 ? <p className="empty">{text.noAgents}</p> : <AgentRegistryList
                  agents={shownAgents}
                  focusedAgentId={rovingAgentId}
                  linkRef={registerAgentLink}
                  onFocus={selectFocusedAgent}
                  onKeyDown={handleRegistryKeyDown}
                  onManageTeamAccess={openTeamAccess}
                  onNavigateToDetails={rememberDetailReturnTarget}
                  onPeek={openAgentPeek}
                />}
              {registryInitialized && <LoadMoreButton collection={agentsPage} label="agents" loadMoreLabel={text.loadMoreAgents} />}{teamsPage.initialized && teamsAuthorized && <LoadMoreButton collection={teamsPage} label="teams" loadMoreLabel={text.loadMoreTeams} />}
            </section>,
          },
          {
            id: 'sessions',
            label: text.tabSessions,
            panel: <div className="agent-side-stack">
              <section aria-busy={sessionsInitialized && (sessionsPage.loading || sessionsPage.loadingMore) || undefined} className="surface-panel" aria-label={text.sessions}><header className="surface-header"><div><p className="eyebrow">{text.execution}</p><h2>{text.sessions}</h2></div></header>{!sessionsInitialized ? (sessionsPage.error ? null : <div className="agent-sessions-loading"><SkeletonList columns={4} items={4} label={text.loadingTitle} /></div>) : sessions.length === 0 ? <p className="empty">{text.noSessions}</p> : <div className="session-card-list">{sessions.map(session => <SessionCard agentName={agentName(agents.find(agent => agent.id === session.agent_id))} copy={text} session={session} key={session.id} />)}</div>}{sessionsInitialized && <LoadMoreButton collection={sessionsPage} label="sessions" loadMoreLabel={text.loadMoreSessions} />}</section>
              <section aria-busy={attentionPage.initialized && (attentionPage.loading || attentionPage.loadingMore) || undefined} className="surface-panel diagnostics" aria-label={text.diagnostics}><header className="surface-header"><div><p className="eyebrow">{text.durableState}</p><h2>{text.diagnostics}</h2></div></header>{attentionPage.initialized && attentionAuthorized ? <><p>{text.diagnosticsIntro}</p><ul>{attentionItems.map(item => <li key={item.id}><a href={attentionHref(item)}>{item.title}</a><span>{item.summary}</span></li>)}{attentionItems.length === 0 && <li><strong>{text.allClear}</strong><span>{text.allClearDetail}</span></li>}</ul></> : attentionPage.error ? null : <SkeletonList columns={1} items={3} label={text.loadingTitle} />}</section>
            </div>,
          },
          {
            id: 'approvals',
            label: text.tabApprovals,
            panel: <div className="agent-side-stack">
              <section className="surface-panel approval-inbox" aria-label={text.approvals}><header className="surface-header"><div><p className="eyebrow">{text.humanQueue}</p><h2>{text.approvals}</h2></div><a href="/?view=inbox">{text.openInbox}</a></header>
                <Tabs
                  ariaLabel={text.approvalViewsAriaLabel}
                  compact={isCompact}
                  onValueChange={value => updateRoute(value === 'history'
                    ? { approvalView: 'history', approvalStatus }
                    : { approvalView: 'pending' })}
                  tabs={[
                    {
                      id: 'pending',
                      label: text.approvalViewPending,
                      panel: <div aria-busy={pendingApprovalsPage.initialized && pendingApprovalsAuthorized && (pendingApprovalsPage.loading || pendingApprovalsPage.loadingMore) || undefined} className="approval-projection">
                        {!pendingApprovalsPage.initialized || !pendingApprovalsAuthorized
                          ? (pendingApprovalsPage.error ? null : <SkeletonList columns={1} items={4} label={text.approvalHistoryLoading} />)
                          : <ApprovalsTable
                          approvals={approvals}
                          bulkBusy={bulkApprovalBusy}
                          copy={text}
                          onClear={clearApprovalSelection}
                          onDecide={decision => void decideApprovals(decision)}
                          onToggle={toggleApproval}
                          onToggleAll={toggleAllApprovals}
                          selectedIds={selectedApprovalIds}
                        />}
                        {pendingApprovalsPage.initialized && pendingApprovalsAuthorized && <LoadMoreButton collection={pendingApprovalsPage} label="approvals" loadMoreLabel={text.loadMoreApprovals} />}
                      </div>,
                    },
                    {
                      id: 'history',
                      label: text.approvalViewHistory,
                      panel: <div className="approval-projection approval-history">
                        <label className="approval-history-status">
                          <span>{text.approvalHistoryStatus}</span>
                          <select aria-label={text.approvalHistoryStatus} value={approvalStatus} onChange={event => updateRoute({ approvalStatus: event.currentTarget.value as ApprovalTerminalStatus })}>
                            {approvalTerminalStatuses.map(status => <option key={status} value={status}>{approvalStatusLabel(status)}</option>)}
                          </select>
                        </label>
                        <ApprovalHistoryTable
                          approvalStatus={approvalStatus}
                          approvals={historyApprovals}
                          copy={{
                            ariaLabel: text.approvalHistoryTableAriaLabel,
                            empty: text.noApprovalHistory,
                            loading: text.approvalHistoryLoading,
                            status: text.approvalColumnStatus,
                            action: text.approvalColumnAction,
                            risk: text.approvalColumnRisk,
                            rationale: text.approvalColumnRationale,
                            requestedAt: text.approvalColumnRequested,
                            expiresAt: text.approvalColumnExpires,
                            session: text.approvalColumnSession,
                            reviewSession: text.reviewSession,
                            riskLabel: text.riskLabel,
                            statusLabel: approvalStatusLabel,
                          }}
                          loading={historyApprovalsPage.loading}
                          initialized={historyApprovalsPage.initialized && historyApprovalsAuthorized}
                          error={historyApprovalsPage.error}
                        />
                        {historyApprovalsPage.initialized && historyApprovalsAuthorized && <LoadMoreButton collection={historyApprovalsPage} label="approval-history" loadMoreLabel={text.loadMoreApprovalHistory} />}
                      </div>,
                    },
                  ]}
                  value={approvalView}
                />
              </section>
            </div>,
          },
        ]}
        value={activeTab}
      />
    </section>
    <AgentPeek agent={peekAgent} onClose={() => setPeekAgentId(null)} open={peekAgent !== null} />
    <TeamAccessDrawer
      agent={teamAccessAgent}
      busyAccess={busyAccess}
      canManage={canManageAccess && teamsPage.initialized && teamsAuthorized}
      onClose={closeTeamAccess}
      onGrant={(teamId, capabilities) => { if (teamAccessAgent) void grantCapabilities(teamAccessAgent, teamId, capabilities) }}
      onRevoke={teamId => { if (teamAccessAgent) void revokeAccess(teamAccessAgent, teamId) }}
      open={teamAccessAgent !== null && teamsPage.initialized && teamsAuthorized}
      teams={teams}
    />
  </AppShell>
}

type AgentRegistryListProps = {
  agents: Agent[]
  focusedAgentId: string | null
  linkRef: (agentId: string, node: HTMLAnchorElement | null) => void
  onFocus: (agentId: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  onManageTeamAccess: (agentId: string) => void
  onNavigateToDetails: (agentId: string) => void
  onPeek: (agentId: string) => void
}

const AgentRegistryList = memo(function AgentRegistryList({
  agents,
  focusedAgentId,
  linkRef,
  onFocus,
  onKeyDown,
  onManageTeamAccess,
  onNavigateToDetails,
  onPeek,
}: AgentRegistryListProps) {
  return <div className="registry-list" onKeyDown={onKeyDown}>{agents.map(agent => <AgentRegistryCard
    agent={agent}
    focused={focusedAgentId === agent.id}
    key={agent.id}
    linkRef={linkRef}
    onFocus={onFocus}
    onManageTeamAccess={onManageTeamAccess}
    onNavigateToDetails={onNavigateToDetails}
    onPeek={onPeek}
  />)}</div>
})

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
