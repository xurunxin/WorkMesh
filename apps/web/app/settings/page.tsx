'use client'

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell, Button } from '@workmesh/ui'
import { ArrowLeft, FloppyDisk, Gear, Plus, Trash } from '@phosphor-icons/react'
import { ApiError, apiMutation, apiRequest, json } from '../lib/api'
import { isCollectionAuthorityRevoked } from '../lib/collection-authority'
import { LoadMoreButton, usePagedApiList } from '../lib/pagination'
import { SkeletonList } from '../lib/skeleton-list'
import { canManageWorkspace } from '../lib/settings-permissions'
import { actorAuthorityScopeKey, actorDisplayName, type AuthenticatedActor } from '../lib/actor'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { useAuthenticatedActor } from '../lib/use-authenticated-actor'
import { useAuthorityLifetime } from '../lib/use-authority-lifetime'
import { useToast } from '../lib/use-toast'
import { legacySettingsOperationsHref, readSettingsRoute, type SettingsRoute, writeSettingsRoute } from './route-state'
import { resolveTeamSelection } from './team-resolution'
import { DeleteTeamDialog, type DeleteTeamSnapshot } from './delete-team-dialog'
import {
  CUSTOM_WORKFLOW_COLOR,
  WORKFLOW_COLOR_PRESETS,
  type WorkflowColorPresetId,
  workflowColorValue,
} from './workflow-color-presets'

type Team = { id: string; name: string; key: string; revision: number }
type WorkflowState = { id: string; name: string; category: string; color: string; revision: number }
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
  const { settingsCopy: text } = useLocale()
  const { actor, loading, error: actorError, refresh: refreshActor } = useAuthenticatedActor()
  if (loading && !actor) return <main className="center foundation-center">{text.loading}</main>
  if (!actor) return <main className="center foundation-center"><p className="error">{actorError || text.loadFailed}</p><Button icon={<ArrowLeft aria-hidden size={16} />} onClick={() => void refreshActor()}>{text.retry}</Button></main>
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
  const [route, setRoute] = useState<SettingsRoute>({ teamId: null })
  const [routeReady, setRouteReady] = useState(false)
  const [workflowColorMode, setWorkflowColorMode] = useState<WorkflowColorMode>('neutral')
  const [customWorkflowColor, setCustomWorkflowColor] = useState(CUSTOM_WORKFLOW_COLOR)
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
  const teamCollectionActive = Boolean(actor && routeReady)
  const teamsPage = usePagedApiList<Team>(teamCollectionActive ? '/api/v1/teams' : null, { scopeKey: authorityScopeKey })
  const teamsAuthorized = !isCollectionAuthorityRevoked(teamsPage.error)
  const teams = teamsAuthorized ? teamsPage.items : []
  const teamResolution = useMemo(() => routeReady
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
  const teamResolutionPending = teamResolution === null || teamResolution.status === 'pending'
  const teamAuthorityReadyForMutation = teamResolution?.status === 'resolved' || teamResolution?.status === 'empty'
  const teamsRefreshBusy = teamsPage.initialized && teamsAuthorized && (teamsPage.loading || teamsPage.loadingMore)
  const statesRefreshBusy = statesInitialized && (statesPage.loading || statesPage.loadingMore)
  const workspaceBusy = loading || teamsRefreshBusy || statesRefreshBusy

  useEffect(() => {
    if (workflowColorMode === 'custom') customColorInputRef.current?.focus()
  }, [workflowColorMode])

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
      const operationsHref = legacySettingsOperationsHref(new URL(window.location.href))
      if (operationsHref) {
        window.location.replace(operationsHref)
        return
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
      || teamResolution?.status !== 'pending'
      || teamsPage.loading
      || teamsPage.loadingMore
      || teamsPage.error
      || !teamsPage.nextCursor)
      return
    void teamsPage.loadMore()
  }, [
    routeReady,
    teamResolution?.status,
    teamsPage.error,
    teamsPage.loadMore,
    teamsPage.loading,
    teamsPage.loadingMore,
    teamsPage.nextCursor,
  ])

  useEffect(() => {
    if (!routeReady || !teamResolution) return

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
  }, [route.teamId, routeReady, teamResolution, teams])

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
      postDeleteFocusIntentRef.current = {
        deletedTeamId: snapshot.id,
        reconciledTeamId: currentRoute.teamId === snapshot.id ? undefined : currentRoute.teamId,
      }
      setPostDeleteFocusPending(true)
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

  const canManage = canManageWorkspace(actor.workspace_role)

  return <AppShell
    administrationNavigationLabel={text.administrationNavigation}
    actorName={actorDisplayName(actor)}
    contextLabel={text.workspace}
    headerActions={<div className="shell-action-cluster"><LocaleToggle /></div>}
    mainNavigationLabel={text.mainNavigation}
    menuLabel={text.menu}
    mobileNavigationLabel={text.mobileNavigation}
    navigation={[{ href: '/?view=my-work', icon: <ArrowLeft aria-hidden size={18} />, label: text.back }]}
    productName="WorkMesh"
    skipLabel={text.skip}
    teamSwitcher={routeReady ? <label aria-busy={teamsRefreshBusy || undefined} className="team-switcher">{text.team}{teamResolution?.status === 'resolved'
      ? <select aria-label={text.currentTeam} value={selectedTeam?.id ?? ''} onChange={event => selectTeam(event.currentTarget.value)}><option value="" disabled>{text.noTeam}</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name} ({team.key})</option>)}</select>
      : <select aria-label={text.currentTeam} disabled value=""><option value="">{teamResolution?.status === 'empty' ? text.noTeam : teamResolution?.status === 'blocked' || teamResolution?.status === 'unavailable' ? text.teamUnavailable : text.loading}</option></select>}</label> : undefined}
    utilityNavigation={[{ active: true, href: '/settings', icon: <Gear aria-hidden size={18} />, label: text.settings }]}
    workspaceNavigationLabel={text.workspaceNavigation}
  >
    <section aria-busy={workspaceBusy || undefined} className="content settings-page">
      <header><div><h1>{text.title}</h1><p>{text.subtitle}</p></div></header>
      {actorError && <p className="error" role="alert">{text.loadFailed}</p>}
      {!canManage && <p className="settings-notice">{text.reviewOnly}</p>}
      {(error || teamsPage.error || statesPage.error) && <>
        <p className="error" role="alert">{error || (teamResolution?.status === 'blocked' ? text.teamUnavailable : text.loadFailed)}</p>
        {(teamsPage.error || statesPage.error) && <Button data-post-delete-focus-recovery onClick={() => void Promise.all([teamsPage.refresh(), statesPage.refresh()])}>{text.retry}</Button>}
      </>}
      <div className="settings-grid">
                {teamResolutionPending ? <div className="settings-loading-skeleton"><SkeletonList columns={2} items={3} label={text.loading} /></div> : <>
                <section aria-busy={teamsPage.loading || teamsPage.loadingMore || undefined} className="settings-card" aria-labelledby="team-settings-heading">
                  <header><div><p className="eyebrow">{text.workspaceStructure}</p><h2 id="team-settings-heading" tabIndex={-1}>{text.teams}</h2></div></header>
                  {canManage && teamAuthorityReadyForMutation && <form className="settings-form" onSubmit={createTeam}>
                    <label>{text.teamName}<input name="name" required /></label>
                    <label>{text.teamKey}<input name="key" pattern="[A-Z][A-Z0-9]{1,9}" placeholder="ENG" required /></label>
                    <Button icon={<Plus aria-hidden size={16} />} type="submit" variant="primary">{text.createTeam}</Button>
                  </form>}
                  {teamsPage.initialized && teamsAuthorized && <LoadMoreButton collection={teamsPage} label="teams" loadingLabel={text.loadingMore} loadMoreLabel={text.loadMoreTeams} />}
                </section>
                <section aria-busy={teamsPage.loading || teamsPage.loadingMore || undefined} className="settings-card" aria-labelledby="current-team-heading">
                  <header><div><p className="eyebrow">{text.selectedTeam}</p><h2 id="current-team-heading">{text.teamDetails}</h2></div></header>
                  {selectedTeam ? <>
                    {canManage ? <form className="settings-form" key={`${selectedTeam.id}:${selectedTeam.revision}`} onSubmit={updateTeam}>
                      <label>{text.teamName}<input name="name" defaultValue={selectedTeam.name} required /></label>
                      <label>{text.teamKey}<input name="key" defaultValue={selectedTeam.key} pattern="[A-Z][A-Z0-9]{1,9}" required /></label>
                      <Button icon={<FloppyDisk aria-hidden size={16} />} type="submit">{text.saveChanges}</Button>
                    </form> : <dl className="settings-summary"><div><dt>{text.teamName}</dt><dd>{selectedTeam.name}</dd></div><div><dt>{text.teamKey}</dt><dd>{selectedTeam.key}</dd></div></dl>}
                    {canManage && <div className="danger-zone"><div><strong>{text.deleteTeam}</strong><p>{text.deleteHelp}</p></div><Button data-post-delete-focus-origin icon={<Trash aria-hidden size={16} />} onClick={openDeleteTeam} type="button" variant="danger">{text.deleteTeam}</Button></div>}
                  </> : <p className="empty">{unresolvedTeamCopy}</p>}
                </section>
                <section aria-busy={statesInitialized && (statesPage.loading || statesPage.loadingMore) || undefined} className="settings-card settings-card-wide" aria-labelledby="workflow-settings-heading">
                  <header><div><p className="eyebrow">{text.teamWorkflow}</p><h2 id="workflow-settings-heading">{text.workflowStates}</h2></div></header>
                  {selectedTeam ? !statesInitialized
                    ? (statesPage.error ? null : <div className="settings-states-loading"><SkeletonList columns={5} items={5} label={text.loading} /></div>)
                    : <>
                    <div className="workflow-state-list">{states.map(state => <article key={state.id}><span className="workflow-color" style={{ backgroundColor: state.color }} aria-hidden="true" /><div><strong>{state.name}</strong><small>{text.categories[state.category as keyof typeof text.categories] ?? state.category}</small></div></article>)}{states.length === 0 && <p className="empty">{text.noStates}</p>}</div>
                    {canManage && <form className="settings-form workflow-state-create-form" onSubmit={createState}>
                      <label>{text.statusName}<input name="name" required /></label>
                      <label>{text.category}<select name="category" defaultValue="planned">{Object.entries(text.categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      <fieldset className="workflow-color-fieldset">
                        <legend>{text.workflowColorLegend}</legend>
                        <div className="workflow-color-presets">
                          {WORKFLOW_COLOR_PRESETS.map(preset => <label className="workflow-color-option" key={preset.id}>
                            <input
                              checked={workflowColorMode === preset.id}
                              name="workflowColor"
                              onChange={() => setWorkflowColorMode(preset.id)}
                              type="radio"
                              value={preset.id}
                            />
                            <span aria-hidden="true" className="workflow-color-swatch" style={{ backgroundColor: preset.value }} />
                            <span>{text.workflowColorPresets[preset.id]}</span>
                          </label>)}
                          <label className="workflow-color-option">
                            <input
                              checked={workflowColorMode === 'custom'}
                              name="workflowColor"
                              onChange={() => setWorkflowColorMode('custom')}
                              type="radio"
                              value="custom"
                            />
                            <span aria-hidden="true" className="workflow-color-swatch" style={{ backgroundColor: customWorkflowColor }} />
                            <span>{text.customColor}</span>
                          </label>
                        </div>
                        {workflowColorMode === 'custom' && <div className="workflow-color-custom-editor">
                          <label>{text.customColorInput}<input
                            aria-label={text.customColorInput}
                            onChange={event => setCustomWorkflowColor(event.currentTarget.value)}
                            ref={customColorInputRef}
                            type="color"
                            value={customWorkflowColor}
                          /></label>
                          <output aria-label={text.colorValue}>{customWorkflowColor}</output>
                        </div>}
                      </fieldset>
                      <Button icon={<Plus aria-hidden size={16} />} type="submit" variant="primary">{text.createStatus}</Button>
                    </form>}
                    <LoadMoreButton collection={statesPage} label="workflow states" loadingLabel={text.loadingMore} loadMoreLabel={text.loadMoreStates} />
                  </> : <p className="empty">{unresolvedTeamCopy}</p>}
                </section>
                </>}
      </div>
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
  </AppShell>
}
