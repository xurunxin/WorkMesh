'use client'

import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { notFound, useSearchParams } from 'next/navigation'
import { Button, ColorPicker, DangerZone, DescriptionList, Eyebrow, SettingsCard, SettingsForm, SettingsGrid, SettingsNotice, Tabs, WorkflowStateEditor, WorkflowStateIdentity, WorkflowStateList } from '@workmesh/ui'
import { AuthenticatedWorkspaceShell } from '../authenticated-workspace-shell'
import { ArrowLeft, FloppyDisk, Gear, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react'
import { ApiError, apiMutation, apiRequest, json } from '../lib/api'
import { isCollectionAuthorityRevoked } from '../lib/collection-authority'
import { LoadMoreButton, usePagedApiList } from '../lib/pagination'
import { SkeletonList } from '../lib/skeleton-list'
import { canManageWorkspace } from '../lib/settings-permissions'
import { actorAuthorityScopeKey, actorDisplayName, type AuthenticatedActor } from '../lib/actor'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { useAuthenticatedActor } from '../lib/use-authenticated-actor'
import { useAuthorityLifetime } from '../lib/use-authority-lifetime'
import { useMediaQuery } from '../lib/use-media-query'
import { useToast } from '../lib/use-toast'
import { useRealtimeSubscription, type RealtimeResource } from '../lib/realtime'
import { readSettingsRoute, type SettingsRoute, writeSettingsRoute } from './route-state'
import { resolveTeamSelection } from './team-resolution'
import { NotificationChannelSettings } from './notification-channel-settings'
import { DeleteTeamDialog, type DeleteTeamSnapshot } from './delete-team-dialog'
import {
  CUSTOM_WORKFLOW_COLOR,
  WORKFLOW_COLOR_PRESETS,
  type WorkflowColorPresetId,
  workflowColorValue,
} from './workflow-color-presets'

type Team = { id: string; name: string; key: string; revision: number }
type WorkflowState = { id: string; name: string; category: string; color: string; revision: number }
type WorkflowStateDraft = { id: string; name: string; color: string; revision: number; conflict: boolean }
type WorkflowColorMode = WorkflowColorPresetId | 'custom'

const requestError = (reason: unknown): string => reason instanceof Error ? reason.message : 'Something went wrong.'
const revisionHeader = (revision: number): HeadersInit => ({ ...json({}), 'If-Match': `"revision-${revision}"` })

function isActuallyVisible(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest('details:not([open])')) return false
  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  const rect = element.getBoundingClientRect()
  return element.getClientRects().length > 0 && rect.width > 0 && rect.height > 0
}

function focusVisibleTeamContext(): void {
  const selector = [...document.querySelectorAll<HTMLSelectElement>('.app-team-switcher select')]
    .find(element => !element.disabled && isActuallyVisible(element))
  if (selector) {
    selector.focus()
    return
  }
  document.getElementById('team-settings-heading')?.focus()
}

export default function SettingsPage() {
  const { settingsCopy: text, t } = useLocale()
  const searchParams = useSearchParams()
  if (searchParams?.has('tab')) notFound()
  const { actor, loading, error: actorError, refresh: refreshActor } = useAuthenticatedActor()
  const stateShell = (content: ReactNode) => <AuthenticatedWorkspaceShell
    contextLabel={text.title}
    documentTitle={text.title}
    headerActions={<LocaleToggle />}
    navigation={[{ href: '/?view=my-work', icon: <ArrowLeft aria-hidden size={18} />, label: text.back }]}
    skipLabel={t('skipToContent')}
    utilityNavigation={[{ active: true, href: '/settings', icon: <Gear aria-hidden size={18} />, label: text.settings }]}
  >{content}</AuthenticatedWorkspaceShell>
  if (loading && !actor) return stateShell(<div className="center foundation-center">{text.loading}</div>)
  if (!actor) return stateShell(<div className="center foundation-center"><p className="error">{actorError || text.loadFailed}</p><Button icon={<ArrowLeft aria-hidden size={16} />} onClick={() => void refreshActor()}>{text.retry}</Button></div>)
  return <SettingsPageScope
    actor={actor}
    actorError={actorError}
    key={actorAuthorityScopeKey(actor)}
    loading={loading}
    refreshActor={refreshActor}
  />
}

function SettingsPageScope({
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
  const { settingsCopy: text, toastCopy } = useLocale()
  const { push: pushToast } = useToast()
  const isAuthorityCurrent = useAuthorityLifetime()
  const authorityScopeKey = actorAuthorityScopeKey(actor)
  const [error, setError] = useState('')
  const [route, setRoute] = useState<SettingsRoute>({ tab: 'workspace', teamId: null })
  const [routeReady, setRouteReady] = useState(false)
  const [workflowColorMode, setWorkflowColorMode] = useState<WorkflowColorMode>('neutral')
  const [customWorkflowColor, setCustomWorkflowColor] = useState(CUSTOM_WORKFLOW_COLOR)
  const [stateDraft, setStateDraft] = useState<WorkflowStateDraft | null>(null)
  const [deleteSnapshot, setDeleteSnapshot] = useState<DeleteTeamSnapshot | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [committedDeletion, setCommittedDeletion] = useState(0)
  const [postDeleteFocusPending, setPostDeleteFocusPending] = useState(false)
  const [postDeleteRefreshSettled, setPostDeleteRefreshSettled] = useState(false)
  const customColorInputRef = useRef<HTMLInputElement>(null)
  const deleteInFlightRef = useRef(false)
  const reconciledDeletionRef = useRef(0)
  const postDeleteFocusIntentRef = useRef<{
    deletedTeamId: string
    reconciledTeamId: string | null | undefined
  } | null>(null)
  const compactTabs = useMediaQuery('(max-width: 720px)')
  const teamCollectionActive = Boolean(actor && routeReady && route.tab === 'workspace')
  const teamsPage = usePagedApiList<Team>(teamCollectionActive ? '/api/v1/teams' : null, { scopeKey: authorityScopeKey })
  const teamsAuthorized = !isCollectionAuthorityRevoked(teamsPage.error)
  const teams = teamsAuthorized ? teamsPage.items : []
  const teamResolution = useMemo(() => routeReady && route.tab === 'workspace'
    ? resolveTeamSelection({
        initialized: teamsPage.initialized,
        items: teams,
        requestedTeamId: route.teamId,
        loading: teamsPage.loading,
        loadingMore: teamsPage.loadingMore,
        error: teamsPage.error,
        nextCursor: teamsPage.nextCursor,
      })
    : null, [
      route.teamId,
      route.tab,
      routeReady,
      teams,
      teamsPage.error,
      teamsPage.initialized,
      teamsPage.loading,
      teamsPage.loadingMore,
      teamsPage.nextCursor,
    ])
  const selectedTeam = teamResolution?.status === 'resolved' ? teamResolution.selectedTeam : null
  const unresolvedTeamCopy = teamResolution?.status === 'empty'
    ? text.createFirst
    : teamResolution?.status === 'pending' || teamResolution === null
      ? text.loading
      : text.teamUnavailable
  const statesPage = usePagedApiList<WorkflowState>(
    actor && teamResolution?.status === 'resolved' ? teamResolution.workflowStatesPath : null,
    { scopeKey: authorityScopeKey },
  )
  const statesAuthorized = !isCollectionAuthorityRevoked(statesPage.error)
  const statesInitialized = statesPage.initialized && statesAuthorized
  const states = statesAuthorized ? statesPage.items : []
  const realtimeResources = useMemo<RealtimeResource[]>(
    () => selectedTeam ? [{ type: 'team', id: selectedTeam.id }] : [],
    [selectedTeam?.id],
  )
  useRealtimeSubscription(realtimeResources, () => { void statesPage.refresh() })
  const teamResolutionPending = teamResolution === null || teamResolution.status === 'pending'
  const teamAuthorityReadyForMutation = teamResolution?.status === 'resolved' || teamResolution?.status === 'empty'
  const teamsRefreshBusy = teamsPage.initialized && teamsAuthorized && (teamsPage.loading || teamsPage.loadingMore)
  const statesRefreshBusy = statesInitialized && (statesPage.loading || statesPage.loadingMore)
  const workspaceBusy = loading || teamsRefreshBusy || statesRefreshBusy

  useEffect(() => {
    if (workflowColorMode === 'custom') customColorInputRef.current?.focus()
  }, [workflowColorMode])

  useEffect(() => { setStateDraft(null) }, [route.teamId])
  useEffect(() => {
    if (!stateDraft) return
    const latest = states.find(state => state.id === stateDraft.id)
    if (latest && latest.revision !== stateDraft.revision)
      setStateDraft(current => current?.id === latest.id
        ? { ...current, revision: latest.revision }
        : current)
  }, [stateDraft?.id, stateDraft?.revision, states])

  useEffect(() => {
    if (committedDeletion === 0 || reconciledDeletionRef.current === committedDeletion) return
    reconciledDeletionRef.current = committedDeletion
    void (async () => {
      try { await teamsPage.refresh() } catch { /* Task 5.2 owns refresh recovery after the committed delete. */ }
      if (!isAuthorityCurrent() || reconciledDeletionRef.current !== committedDeletion) return
      setPostDeleteRefreshSettled(true)
    })()
  }, [committedDeletion, isAuthorityCurrent, teamsPage.refresh])

  useEffect(() => {
    if (!postDeleteFocusPending) return
    const abandonOnUserFocus = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)
        || target.closest('[data-post-delete-focus-origin]')
        || target.closest('[data-post-delete-focus-recovery]'))
        return
      postDeleteFocusIntentRef.current = null
      setPostDeleteFocusPending(false)
      setPostDeleteRefreshSettled(false)
    }
    document.addEventListener('focusin', abandonOnUserFocus, true)
    return () => document.removeEventListener('focusin', abandonOnUserFocus, true)
  }, [postDeleteFocusPending])

  useEffect(() => {
    if (!postDeleteFocusPending
      || !postDeleteRefreshSettled
      || !routeReady
      || route.tab !== 'workspace'
      || teamResolution === null
      || teamsPage.loading
      || teamsPage.loadingMore
      || teamsPage.error
      || teamResolution.status === 'pending'
      || teamResolution.status === 'unavailable')
      return
    const intent = postDeleteFocusIntentRef.current
    if (!intent
      || (route.teamId !== intent.deletedTeamId && route.teamId !== intent.reconciledTeamId)) {
      postDeleteFocusIntentRef.current = null
      setPostDeleteFocusPending(false)
      setPostDeleteRefreshSettled(false)
      return
    }
    postDeleteFocusIntentRef.current = null
    setPostDeleteFocusPending(false)
    setPostDeleteRefreshSettled(false)
    focusVisibleTeamContext()
  }, [
    postDeleteFocusPending,
    postDeleteRefreshSettled,
    route.tab,
    route.teamId,
    routeReady,
    teamResolution,
    teamsPage.error,
    teamsPage.loading,
    teamsPage.loadingMore,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const synchronize = (abandonPostDeleteFocus = false) => {
      if (abandonPostDeleteFocus) {
        postDeleteFocusIntentRef.current = null
        setPostDeleteFocusPending(false)
        setPostDeleteRefreshSettled(false)
      }
      setRoute(readSettingsRoute(window.location.search))
      setRouteReady(true)
    }
    synchronize()
    const handlePopState = () => synchronize(true)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!routeReady
      || route.tab !== 'workspace'
      || teamResolution?.status !== 'pending'
      || teamsPage.loading
      || teamsPage.loadingMore
      || teamsPage.error
      || !teamsPage.nextCursor)
      return
    void teamsPage.loadMore()
  }, [
    route.tab,
    routeReady,
    teamResolution?.status,
    teamsPage.error,
    teamsPage.loadMore,
    teamsPage.loading,
    teamsPage.loadingMore,
    teamsPage.nextCursor,
  ])

  useEffect(() => {
    if (!routeReady || route.tab !== 'workspace' || !teamResolution) return

    let correctedTeamId: string | null | undefined
    if (teamResolution.status === 'resolved' && route.teamId === null)
      correctedTeamId = teamResolution.selectedTeam.id
    else if (teamResolution.status === 'unavailable')
      correctedTeamId = teams[0]?.id ?? null
    else if (teamResolution.status === 'empty' && route.teamId !== null)
      correctedTeamId = null

    if (correctedTeamId === undefined || correctedTeamId === route.teamId) return
    const focusIntent = postDeleteFocusIntentRef.current
    if (focusIntent?.deletedTeamId === route.teamId)
      focusIntent.reconciledTeamId = correctedTeamId
    const url = writeSettingsRoute(new URL(window.location.href), { teamId: correctedTeamId })
    window.history.replaceState(window.history.state, '', url)
    setRoute(readSettingsRoute(url.search))
  }, [route.tab, route.teamId, routeReady, teamResolution, teams])

  const selectTeam = (teamId: string) => {
    if (typeof window === 'undefined') return
    const current = readSettingsRoute(window.location.search)
    if (current.teamId === teamId) return
    postDeleteFocusIntentRef.current = null
    setPostDeleteFocusPending(false)
    setPostDeleteRefreshSettled(false)
    const url = writeSettingsRoute(new URL(window.location.href), { teamId })
    window.history.pushState(window.history.state, '', url)
    setRoute(readSettingsRoute(url.search))
  }

  const createTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      setError('')
      const team = await apiRequest<Team>('/api/v1/teams', {
        method: 'POST',
        headers: json({}),
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          key: String(form.get('key') ?? '').toUpperCase(),
        }),
      })
      if (!isAuthorityCurrent()) return
      await teamsPage.refresh()
      if (!isAuthorityCurrent()) return
      formElement.reset()
      pushToast({
        dedupeKey: 'settings:create-team',
        description: toastCopy.teamCreatedDescription(team.name),
        title: toastCopy.teamCreatedTitle,
        tone: 'success',
      })
      selectTeam(team.id)
    } catch (reason) {
      if (isAuthorityCurrent()) setError(requestError(reason))
    }
  }

  const updateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTeam) return
    const form = new FormData(event.currentTarget)
    try {
      setError('')
      await apiRequest(`/api/v1/teams/${selectedTeam.id}`, {
        method: 'PATCH',
        headers: revisionHeader(selectedTeam.revision),
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          key: String(form.get('key') ?? '').toUpperCase(),
        }),
      })
      if (!isAuthorityCurrent()) return
      await teamsPage.refresh()
      if (!isAuthorityCurrent()) return
    } catch (reason) {
      if (isAuthorityCurrent()) setError(requestError(reason))
    }
  }

  const openDeleteTeam = () => {
    if (!selectedTeam || deleteInFlightRef.current) return
    setDeleteError('')
    setDeleteSnapshot(Object.freeze({ ...selectedTeam }))
  }

  const cancelDeleteTeam = () => {
    if (deleteInFlightRef.current) return
    setDeleteError('')
    setDeleteSnapshot(null)
  }

  const deleteFailureCopy = (reason: unknown): string => {
    if (reason instanceof ApiError && reason.code === 'REVISION_CONFLICT') return text.deleteRevisionConflict
    if (reason instanceof ApiError && reason.code === 'LAST_ACTIVE_TEAM_CONFLICT') return text.deleteLastActiveTeamConflict
    return text.deleteFailed
  }

  const confirmDeleteTeam = async (snapshot: DeleteTeamSnapshot) => {
    if (deleteInFlightRef.current) return
    deleteInFlightRef.current = true
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await apiMutation<void>(
        `delete-team:${snapshot.id}:revision-${snapshot.revision}`,
        `/api/v1/teams/${encodeURIComponent(snapshot.id)}`,
        {
        method: 'DELETE',
          headers: { 'If-Match': `"revision-${snapshot.revision}"` },
        },
      )
      if (!isAuthorityCurrent()) return
      deleteInFlightRef.current = false
      setDeleteBusy(false)
      setDeleteError('')
      setDeleteSnapshot(null)
      const currentRoute = readSettingsRoute(window.location.search)
      const shouldRestoreWorkspaceFocus = currentRoute.tab === 'workspace'
      postDeleteFocusIntentRef.current = shouldRestoreWorkspaceFocus
        ? {
            deletedTeamId: snapshot.id,
            reconciledTeamId: currentRoute.teamId === snapshot.id ? undefined : currentRoute.teamId,
          }
        : null
      setPostDeleteFocusPending(shouldRestoreWorkspaceFocus)
      setPostDeleteRefreshSettled(false)
      setCommittedDeletion(sequence => sequence + 1)
      pushToast({
        dedupeKey: `settings:delete-team:${snapshot.id}`,
        description: toastCopy.teamDeletedDescription(snapshot.name),
        title: toastCopy.teamDeletedTitle,
        tone: 'success',
      })
    } catch (reason) {
      if (!isAuthorityCurrent()) return
      deleteInFlightRef.current = false
      setDeleteBusy(false)
      setDeleteError(deleteFailureCopy(reason))
    }
  }

  const createState = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (teamResolution?.status !== 'resolved') return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const name = String(form.get('name') ?? '')
    const color = workflowColorMode === 'custom'
      ? customWorkflowColor
      : workflowColorValue(workflowColorMode)
    if (color === null) return
    try {
      setError('')
      await apiRequest(teamResolution.workflowStatesPath, {
        method: 'POST',
        headers: json({}),
        body: JSON.stringify({
          name,
          category: form.get('category'),
          color,
        }),
      })
      if (!isAuthorityCurrent()) return
      formElement.reset()
      setWorkflowColorMode('neutral')
      setCustomWorkflowColor(CUSTOM_WORKFLOW_COLOR)
      pushToast({
        dedupeKey: `settings:create-workflow-state:${teamResolution.selectedTeam.id}`,
        description: toastCopy.workflowStateCreatedDescription(name),
        title: toastCopy.workflowStateCreatedTitle,
        tone: 'success',
      })
      try {
        await statesPage.refresh()
      } catch (reason) {
        if (isAuthorityCurrent()) setError(requestError(reason))
      }
    } catch (reason) {
      if (isAuthorityCurrent()) setError(requestError(reason))
    }
  }

  const saveState = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTeam || !stateDraft) return
    try {
      setError('')
      await apiRequest(`/api/v1/teams/${selectedTeam.id}/states/${stateDraft.id}`, {
        method: 'PATCH',
        headers: revisionHeader(stateDraft.revision),
        body: JSON.stringify({ name: stateDraft.name.trim(), color: stateDraft.color }),
      })
      if (!isAuthorityCurrent()) return
      setStateDraft(null)
      await statesPage.refresh()
    } catch (reason) {
      if (!isAuthorityCurrent()) return
      if (reason instanceof ApiError && reason.status === 409) {
        setStateDraft(current => current ? { ...current, conflict: true } : current)
        try { await statesPage.refresh() } catch { /* The preserved draft remains available for a manual retry. */ }
        return
      }
      setError(requestError(reason))
    }
  }

  const canManage = canManageWorkspace(actor.workspace_role)

  return <AuthenticatedWorkspaceShell
    administrationNavigationLabel={text.administrationNavigation}
    actorName={actorDisplayName(actor)}
    contextLabel={text.workspace}
    documentTitle={text.title}
    headerActions={<div className="shell-action-cluster"><LocaleToggle /></div>}
    mainNavigationLabel={text.mainNavigation}
    menuLabel={text.menu}
    mobileNavigationLabel={text.mobileNavigation}
    navigation={[{ href: '/?view=my-work', icon: <ArrowLeft aria-hidden size={18} />, label: text.back }]}
    skipLabel={text.skip}
    teamSwitcher={routeReady && route.tab === 'workspace' ? <label aria-busy={teamsRefreshBusy || undefined} className="team-switcher">{text.team}{teamResolution?.status === 'resolved'
      ? <select aria-label={text.currentTeam} value={selectedTeam?.id ?? ''} onChange={event => selectTeam(event.currentTarget.value)}><option value="" disabled>{text.noTeam}</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name} ({team.key})</option>)}</select>
      : <select aria-label={text.currentTeam} disabled value=""><option value="">{teamResolution?.status === 'empty' ? text.noTeam : teamResolution?.status === 'blocked' || teamResolution?.status === 'unavailable' ? text.teamUnavailable : text.loading}</option></select>}</label> : undefined}
    utilityNavigation={[{ active: true, href: '/settings', icon: <Gear aria-hidden size={18} />, label: text.settings }]}
    workspaceNavigationLabel={text.workspaceNavigation}
  >
    <section aria-busy={workspaceBusy || undefined} className="content settings-page">
      <header><div><h1>{text.title}</h1><p>{text.subtitle}</p></div></header>
      {actorError && <p className="error" role="alert">{text.loadFailed}</p>}
      <Tabs
        ariaLabel={text.settingsTabsLabel}
        compact={compactTabs}
        onValueChange={() => undefined}
        tabs={[
          {
            id: 'workspace',
            label: text.tabWorkspace,
            panel: <>
              {!canManage && <p className="settings-notice">{text.reviewOnly}</p>}
              {(error || teamsPage.error || statesPage.error) && <>
                <p className="error" role="alert">{error || (teamResolution?.status === 'blocked' ? text.teamUnavailable : text.loadFailed)}</p>
                {(teamsPage.error || statesPage.error) && <Button data-post-delete-focus-recovery onClick={() => void Promise.all([teamsPage.refresh(), statesPage.refresh()])}>{text.retry}</Button>}
              </>}
              <SettingsGrid>
                {teamResolutionPending ? <div className="wm-settings-loading"><SkeletonList columns={2} items={3} label={text.loading} /></div> : <>
                <SettingsCard aria-busy={teamsPage.loading || teamsPage.loadingMore || undefined} aria-labelledby="team-settings-heading" kicker={text.workspaceStructure} title={<span id="team-settings-heading" tabIndex={-1}>{text.teams}</span>}>
                  {canManage && teamAuthorityReadyForMutation && <SettingsForm onSubmit={createTeam}>
                    <label>{text.teamName}<input name="name" required /></label>
                    <label>{text.teamKey}<input name="key" pattern="[A-Z][A-Z0-9]{1,9}" placeholder="ENG" required /></label>
                    <Button icon={<Plus aria-hidden size={16} />} type="submit" variant="primary">{text.createTeam}</Button>
                  </SettingsForm>}
                  {teamsPage.initialized && teamsAuthorized && <LoadMoreButton collection={teamsPage} label="teams" loadingLabel={text.loadingMore} loadMoreLabel={text.loadMoreTeams} />}
                </SettingsCard>
                <SettingsCard aria-busy={teamsPage.loading || teamsPage.loadingMore || undefined} aria-labelledby="current-team-heading" kicker={text.selectedTeam} title={<span id="current-team-heading">{text.teamDetails}</span>}>
                  {selectedTeam ? <>
                    {canManage ? <SettingsForm key={`${selectedTeam.id}:${selectedTeam.revision}`} onSubmit={updateTeam}>
                      <label>{text.teamName}<input name="name" defaultValue={selectedTeam.name} required /></label>
                      <label>{text.teamKey}<input name="key" defaultValue={selectedTeam.key} pattern="[A-Z][A-Z0-9]{1,9}" required /></label>
                      <Button icon={<FloppyDisk aria-hidden size={16} />} type="submit">{text.saveChanges}</Button>
                    </SettingsForm> : <DescriptionList className="wm-settings-summary" items={[{ id: 'team-name', term: text.teamName, description: selectedTeam.name }, { id: 'team-key', term: text.teamKey, description: selectedTeam.key }]} layout="stacked" />}
                    {canManage && <DangerZone actions={<Button data-post-delete-focus-origin icon={<Trash aria-hidden size={16} />} onClick={openDeleteTeam} type="button" variant="danger">{text.deleteTeam}</Button>} title={text.deleteTeam}>{text.deleteHelp}</DangerZone>}
                  </> : <p className="empty">{unresolvedTeamCopy}</p>}
                </SettingsCard>
                <SettingsCard aria-busy={statesInitialized && (statesPage.loading || statesPage.loadingMore) || undefined} aria-labelledby="workflow-settings-heading" kicker={text.teamWorkflow} title={<span id="workflow-settings-heading">{text.workflowStates}</span>} wide>
                  {selectedTeam ? !statesInitialized
                    ? (statesPage.error ? null : <div className="wm-settings-loading"><SkeletonList columns={5} items={5} label={text.loading} /></div>)
                    : <>
                    <WorkflowStateList
                      editingId={stateDraft?.id ?? null}
                      empty={<p className="empty">{text.noStates}</p>}
                      renderEditor={state => <WorkflowStateEditor
                        actions={<><Button icon={<FloppyDisk aria-hidden size={15} />} type="submit" variant="primary">{text.saveState}</Button><Button icon={<X aria-hidden size={15} />} onClick={() => setStateDraft(null)} type="button" variant="ghost">{text.cancel}</Button></>}
                        conflict={stateDraft?.conflict ? <p className="wm-workflow-state-conflict" role="alert">{text.stateConflict}</p> : null}
                        onSubmit={saveState}
                      >
                        <label>{text.statusName}<input autoFocus maxLength={80} onChange={event => { const name = event.currentTarget.value; setStateDraft(current => current ? { ...current, name, conflict: false } : current) }} required value={stateDraft?.name ?? state.name} /></label>
                        <label>{text.color}<span className="wm-color-inline"><input aria-label={text.color} onChange={event => { const color = event.currentTarget.value; setStateDraft(current => current ? { ...current, color, conflict: false } : current) }} type="color" value={stateDraft?.color ?? state.color} /><code>{(stateDraft?.color ?? state.color).toUpperCase()}</code></span></label>
                      </WorkflowStateEditor>}
                      renderRow={state => <>
                        <WorkflowStateIdentity categoryLabel={text.categories[state.category as keyof typeof text.categories] ?? state.category} state={state} />
                        {canManage && <Button aria-label={text.editState(state.name)} className="wm-workflow-state-edit" icon={<PencilSimple aria-hidden size={15} />} onClick={() => setStateDraft({ id: state.id, name: state.name, color: state.color, revision: state.revision, conflict: false })} type="button" variant="ghost">{text.edit}</Button>}
                      </>}
                      states={states}
                    />
                    {canManage && <SettingsForm className="wm-workflow-state-create-form" onSubmit={createState}>
                      <label>{text.statusName}<input name="name" required /></label>
                      <label>{text.category}<select name="category" defaultValue="planned">{Object.entries(text.categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      <ColorPicker
                        colorValueLabel={text.colorValue}
                        customColor={customWorkflowColor}
                        customColorRef={customColorInputRef}
                        customInputLabel={text.customColorInput}
                        customLabel={text.customColor}
                        legend={text.workflowColorLegend}
                        name="workflowColor"
                        onCustomColorChange={setCustomWorkflowColor}
                        onModeChange={mode => setWorkflowColorMode(mode as WorkflowColorMode)}
                        presets={WORKFLOW_COLOR_PRESETS.map(preset => ({ ...preset, label: text.workflowColorPresets[preset.id] }))}
                        value={workflowColorMode}
                      />
                      <Button icon={<Plus aria-hidden size={16} />} type="submit" variant="primary">{text.createStatus}</Button>
                    </SettingsForm>}
                    <LoadMoreButton collection={statesPage} label="workflow states" loadingLabel={text.loadingMore} loadMoreLabel={text.loadMoreStates} />
                  </> : <p className="empty">{unresolvedTeamCopy}</p>}
                </SettingsCard>
                </>}
              </SettingsGrid>
              <NotificationChannelSettings scopeKey={authorityScopeKey} />
              <SettingsCard aria-labelledby="agent-workbench-service-heading" className="workbench-llm-settings" kicker="Agent workbench" title={<span id="agent-workbench-service-heading">{text.workbenchServiceTitle}</span>} wide>
                <p>{text.workbenchServiceDescription}</p>
                <a className="wm-button" href="/settings/agent-workbench">{text.workbenchServiceOpen}</a>
              </SettingsCard>
            </>,
          },
        ]}
        value={route.tab}
      />
      <DeleteTeamDialog
        busy={deleteBusy}
        copy={{
          cancel: text.deleteCancel,
          close: text.deleteClose,
          confirm: text.deleteTeam,
          confirmAccessible: text.deleteConfirmAccessible,
          constraint: text.deleteConstraint,
          deleting: text.deletingTeam,
          description: text.deleteDescription,
          keyLabel: text.teamKey,
          nameLabel: text.teamName,
          title: text.deleteDialogTitle,
        }}
        error={deleteError}
        onCancel={cancelDeleteTeam}
        onConfirm={snapshot => void confirmDeleteTeam(snapshot)}
        open={deleteSnapshot !== null}
        team={deleteSnapshot}
      />
    </section>
  </AuthenticatedWorkspaceShell>
}
