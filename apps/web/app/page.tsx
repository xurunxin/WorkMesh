'use client'

import { type FormEvent, type MouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AsyncStateSurface, Button, Dialog, ErrorState } from '@workmesh/ui'
import { FolderSimpleIcon } from '@phosphor-icons/react/dist/csr/FolderSimple'
import { ArchiveIcon } from '@phosphor-icons/react/dist/csr/Archive'
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'
import { ArrowsLeftRightIcon } from '@phosphor-icons/react/dist/csr/ArrowsLeftRight'
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye'
import { FolderPlusIcon } from '@phosphor-icons/react/dist/csr/FolderPlus'
import { NotePencilIcon } from '@phosphor-icons/react/dist/csr/NotePencil'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/csr/UploadSimple'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { ApiError, apiMutation, apiRequest, json, publicRequest } from './lib/api'
import { AuthenticatedWorkspaceShell } from './authenticated-workspace-shell'
import { AgentWorkPanel, useAgentDelegationController } from './agent-work-panel'
import { WorkRoom } from './work-room'
import { ActionableCollaborationQueues } from './collaboration-queues'
import { RecoveryCenter } from './recovery-center'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { SkeletonList } from './lib/skeleton-list'
import { type RealtimeResource, useRealtimeSubscription } from './lib/realtime'
import { homeRefreshTargets } from './lib/realtime-refresh'
import { homeScopeHref, parseHomeScope, type HomeScope } from './lib/navigation'
import { LocaleToggle, useLocale, type GuidanceCopy } from './lib/i18n'
import { actorAuthorityScopeKey, actorDisplayName, type AuthenticatedActor } from './lib/actor'
import { isCollectionAuthorityRevoked } from './lib/collection-authority'
import { useAuthenticatedActor } from './lib/use-authenticated-actor'
import { useAuthorityLifetime } from './lib/use-authority-lifetime'
import { useBoardColumnWidths } from './lib/use-board-column-widths'
import { useCurrentTeam } from './lib/use-current-team'
import { useToast } from './lib/use-toast'
import { workspaceNavigation, workspaceUtilityNavigation } from './lib/workspace-navigation'
import { LatestRequestGate } from './lib/latest-request'
import { ProjectWorkspace } from './project-workspace'
import { RealtimeStatus } from './realtime-status'
import {
  projectWorkspaceHref,
  readProjectWorkspaceRoute,
  revisionConflictNotice,
  type ProjectWorkspaceTab,
} from './lib/project-work'
import { WorkSurfaces } from '../features/work-items/work-surfaces'
import type { SavedViewPreference, WorkItemDto, WorkSurfaceQuery } from '../features/work-items/contracts'
import { parseWorkSurfaceLayout, parseWorkSurfaceQuery, serializeWorkSurfaceQuery, workSurfaceHref, workSurfaceScopeForQuery } from '../features/work-items/query'
import { WorkItemDetail, WorkItemDetailUnavailable, detailError, toWorkItemDetailModel, updateWorkItemDetail, type StructuredDetailError, type WorkItemDetailDraft, type WorkItemDetailDto } from '../features/work-items/detail'
import { RichContent } from '../features/rich-content/markdown'
import { RichTextEditor } from '../features/rich-content/editor'

type Actor = AuthenticatedActor
type InstallStatus = { installed: boolean }
type FeatureRegistry = { features: Array<{ key: string; tier: 'beta' | 'experimental'; enabled: boolean }> }
type Team = { id: string; name: string; key: string; revision: number }
type StatusCategory = 'backlog' | 'planned' | 'started' | 'completed' | 'canceled'
type WorkflowState = { id: string; name: string; category: StatusCategory; color: string; revision: number }
type Human = { id: string; display_name: string; email: string }
type Project = { id: string; team_id: string; name: string; summary: string | null; description: string | null; status: string; lead_actor_id: string | null; target_date: string | null; revision: number }
type WorkItem = WorkItemDetailDto
type Comment = { id: string; body: string; revision: number; parent_comment_id: string | null; reply_to_comment_id: string | null; author_name: string; author_kind: 'human'; is_resolved: boolean; created_at: string; mentions: string[] }
type Scope = HomeScope
type Layout = 'list' | 'board'
type Priority = 'none' | 'urgent' | 'high' | 'medium' | 'low'
type Filters = WorkSurfaceQuery

const requestError = (reason: unknown): string => reason instanceof Error ? reason.message : 'Something went wrong.'
const revisionHeader = (revision: number): HeadersInit => ({ ...json({}), 'If-Match': `"revision-${revision}"` })
const emptyFilters: Filters = {}

export default function HomePage() {
  const { surfaceCopy, t } = useLocale()
  const routeSearchParams = useSearchParams()
  const routeScope = parseHomeScope(routeSearchParams?.toString() ?? '')
  const routeTitle = routeScope === 'inbox' ? t('inbox') : routeScope === 'recovery' ? t('recovery') : routeScope === 'guidance' ? t('guidance') : routeScope === 'projects' ? t('projects') : t('issues')
  const { actor, loading: actorLoading, error: actorError, refresh: refreshActor } = useAuthenticatedActor()
  const stateShell = (content: ReactNode) => <AuthenticatedWorkspaceShell
    contextLabel={routeTitle}
    documentTitle={routeTitle}
    headerActions={<LocaleToggle />}
    navigation={workspaceNavigation({ active: routeScope, t })}
    skipLabel={t('skipToContent')}
    utilityNavigation={workspaceUtilityNavigation({ t })}
  >{content}</AuthenticatedWorkspaceShell>
  if (actorLoading && !actor) return stateShell(<div className="center foundation-center wm-theme" data-testid="loading"><AsyncStateSurface description={surfaceCopy.loadingDescription ?? t('loading')} state="loading" title={surfaceCopy.loadingTitle ?? t('loading')} /></div>)
  if (!actor) return stateShell(<div className="center foundation-center wm-theme" data-testid="load-error"><ErrorState actionLabel={surfaceCopy.retry ?? t('retry')} description={actorError || surfaceCopy.errorDescription || t('workViewCouldNotRefresh')} onAction={() => void refreshActor()} title={surfaceCopy.errorTitle ?? t('workViewCouldNotRefresh')} /></div>)
  return <HomePageScope
    actor={actor}
    actorError={actorError}
    actorLoading={actorLoading}
    key={actorAuthorityScopeKey(actor)}
    refreshActor={refreshActor}
  />
}

function HomePageScope({
  actor,
  actorError,
  actorLoading,
  refreshActor,
}: {
  actor: Actor
  actorError: string
  actorLoading: boolean
  refreshActor: () => Promise<void>
}) {
  const { agentWorkCopy, detailCopy, guidanceCopy, issueCopy, locale, relationsCopy, surfaceCopy, t, toastCopy } = useLocale()
  const { push: pushToast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSearch = searchParams?.toString() ?? ''
  const authorityScopeKey = actorAuthorityScopeKey(actor)
  const isAuthorityCurrent = useAuthorityLifetime()
  const {
    error: currentTeamError,
    initialized: currentTeamInitialized,
    loading: currentTeamLoading,
    teamId,
    teams,
    setTeamId,
  } = useCurrentTeam(actor)
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null)
  const [requestedItem, setRequestedItem] = useState<{ id: string; mode: 'sheet' | 'full_page' } | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [scope, setScope] = useState<Scope>('my-work')
  const layoutRef = useRef<Layout>('list')
  const [projectTab, setProjectTab] = useState<ProjectWorkspaceTab>('overview')
  const [fullItemView, setFullItemView] = useState(false)
  const [conflictNotice, setConflictNotice] = useState<ReturnType<typeof revisionConflictNotice>>(null)
  const [detailErrorState, setDetailErrorState] = useState<StructuredDetailError | null>(null)
  const [detailConflict, setDetailConflict] = useState<StructuredDetailError | null>(null)
  const [detailResetKey, setDetailResetKey] = useState(0)
  const [filters, setFilters] = useState<Filters>({})
  const [error, setError] = useState('')
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createWorkItemOpen, setCreateWorkItemOpen] = useState(false)
  const [createWorkItemError, setCreateWorkItemError] = useState('')
  const [workSurfaceItems, setWorkSurfaceItems] = useState<WorkItemDto[]>([])
  const surfaceRefreshRef = useRef<(() => Promise<void>) | null>(null)
  const projectRequestGateRef = useRef(new LatestRequestGate<string>())
  const requestedProjectIdRef = useRef<string | null>(null)
  const restoredSearchRef = useRef<string | null>(null)

  // Local `teamsPage` is kept for the team LoadMoreButton and realtime refresh; the
  // hook's `teams` drives the rendered team list so this subscription only carries
  // pagination state (error, refresh, cursor, loadMore).
  const teamsPage = usePagedApiList<Team>('/api/v1/teams', { scopeKey: authorityScopeKey })
  // Derive `selectedTeam` from the local `teamsPage` so the full Team shape
  // (including `revision`) is preserved for downstream consumers like GuidancePanel.
  const teamAuthorityRevoked = isCollectionAuthorityRevoked(currentTeamError) || isCollectionAuthorityRevoked(teamsPage.error)
  const teamAuthoritiesInitialized = currentTeamInitialized && teamsPage.initialized && !teamAuthorityRevoked
  const teamAuthorityError = currentTeamError ?? teamsPage.error
  const teamAuthorityRefreshBusy = teamAuthoritiesInitialized
    && (currentTeamLoading || teamsPage.loading || teamsPage.loadingMore)
  const selectedTeam = teamAuthoritiesInitialized
    ? teamsPage.items.find(team => team.id === teamId) ?? null
    : null
  const agentController = useAgentDelegationController({
    humanActorId: selectedItem?.responsible_human_actor_id ?? '',
    scopeKey: authorityScopeKey,
    workItemId: selectedItem?.id ?? null,
    workItemRevision: selectedItem?.revision ?? 0,
    workItemTeamId: selectedItem?.team_id ?? selectedTeam?.id ?? null,
    workItemTitle: selectedItem?.title,
  })
  const agentAction = useMemo(() => {
    if (!selectedItem) return undefined
    const directAgent = agentController.directAgent
    const activeAssignmentName = selectedItem.active_assignment?.agent_display_name ?? null
    const reason = agentController.reason === 'missing_responsible_human'
      ? agentWorkCopy.noResponsible
      : agentController.reason === 'loading_agents'
        ? `${agentWorkCopy.liveAgents}…`
        : agentController.reason === 'agents_unavailable'
          ? agentWorkCopy.refresh
          : agentController.reason === 'no_eligible_agent'
            ? agentWorkCopy.delegateUnavailableReason(agentWorkCopy.noActiveGrant)
            : agentController.reason === 'delegating'
              ? `${agentWorkCopy.liveAgents}…`
              : undefined
    return {
      label: agentController.canDirect && directAgent ? agentWorkCopy.oneClickDelegate : agentWorkCopy.chooseAgent,
      disabled: agentController.disabled,
      reason,
      hint: reason ?? (activeAssignmentName
        ? agentWorkCopy.replacementHint(activeAssignmentName)
        : agentWorkCopy.forcedAssignmentPolicy),
      onClick: () => {
        if (agentController.canDirect && directAgent) {
          void agentController.create(directAgent, agentWorkCopy.oneClickPrompt(selectedItem.title)).catch(() => undefined)
        } else if (agentController.canChoose) agentController.requestChooser()
      },
    }
  }, [agentController, agentWorkCopy, selectedItem])
  // Board column widths are a per-team UI preference; they live in localStorage
  // (via the hook) so the user's drag-to-resize survives reloads but never leaks
  // into URL state or the canonical query string.
  const { setWidth: setBoardColumnWidth, widths: boardColumnWidths } = useBoardColumnWidths(selectedTeam?.id ?? null)
  const statesPage = usePagedApiList<WorkflowState>(
    selectedTeam ? `/api/v1/teams/${selectedTeam.id}/states` : null,
    { scopeKey: authorityScopeKey },
  )
  const humansPage = usePagedApiList<Human>(
    `/api/v1/actors/humans${selectedTeam ? `?teamId=${encodeURIComponent(selectedTeam.id)}` : ''}`,
    { scopeKey: authorityScopeKey },
  )
  const projectsPage = usePagedApiList<Project>('/api/v1/projects', { scopeKey: authorityScopeKey })
  const states = statesPage.items
  const humans = humansPage.items
  const projects = projectsPage.items
  const teamProjects = useMemo(() => projects.filter(project => project.team_id === selectedTeam?.id), [projects, selectedTeam?.id])
  const commentsPage = usePagedApiList<Comment>(
    selectedItem ? `/api/v1/work-items/${selectedItem.id}/comments` : null,
    { scopeKey: authorityScopeKey },
  )
  const items = workSurfaceItems
  const comments = commentsPage.items
  const detailMilestonesPage = usePagedApiList<Milestone>(selectedItem?.project_id ? `/api/v1/projects/${encodeURIComponent(selectedItem.project_id)}/milestones` : null, { scopeKey: authorityScopeKey })
  const issueMilestoneProjectId = scope === 'projects' ? selectedProject?.id : filters.projectId
  const issueMilestonesPage = usePagedApiList<Milestone>(issueMilestoneProjectId ? `/api/v1/projects/${encodeURIComponent(issueMilestoneProjectId)}/milestones` : null, { scopeKey: authorityScopeKey })
  const refreshWorkSurface = useCallback(async () => { await surfaceRefreshRef.current?.() }, [])
  const collectionError = [
    currentTeamError, teamsPage.error, statesPage.error, humansPage.error, projectsPage.error,
    commentsPage.error,
  ].find(Boolean)

  // Bootstraps the install check; the auth chain is owned by
  // `useAuthenticatedActor` and runs in parallel.
  const bootstrap = useCallback(async () => {
    try {
      setError('')
      const installation = await publicRequest<InstallStatus>('/api/v1/install-status')
      if (!isAuthorityCurrent()) return
      if (!installation.installed) {
        window.location.replace('/install')
        return
      }
      await apiRequest<FeatureRegistry>('/api/v1/features').catch(() => null)
      if (!isAuthorityCurrent()) return
    } catch (reason) {
      if (!isAuthorityCurrent()) return
      if (reason instanceof ApiError && reason.status === 401) return
      setError(requestError(reason))
    }
  }, [isAuthorityCurrent])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])
  const realtimeResources = useMemo<RealtimeResource[]>(() => [
    ...(actor?.workspace_id
      ? [{ type: 'workspace' as const, id: actor.workspace_id }]
      : []),
    ...(teamId ? [{ type: 'team' as const, id: teamId }] : []),
    ...(selectedProject
      ? [{ type: 'project' as const, id: selectedProject.id }]
      : []),
    ...(selectedItem
      ? [{ type: 'work_item' as const, id: selectedItem.id }]
      : []),
  ], [actor?.workspace_id, selectedItem?.id, selectedProject?.id, teamId])
  useRealtimeSubscription(realtimeResources, invalidation => {
    const targets = homeRefreshTargets(invalidation, {
      teamId: teamId ?? undefined,
      projectId: selectedProject?.id,
      workItemId: selectedItem?.id,
    })
    if (invalidation.reason === 'resync') {
      const snapshots: Array<Promise<unknown>> = [
        teamsPage.refresh(), statesPage.refresh(), humansPage.refresh(),
        projectsPage.refresh(), refreshWorkSurface(),
      ]
      if (selectedItem) {
        snapshots.push(apiRequest<WorkItem>(
          `/api/v1/work-items/${selectedItem.id}`,
        ).then(setSelectedItem))
        snapshots.push(commentsPage.refresh())
      }
      return Promise.all(snapshots).then(() => undefined)
    }
    if (targets.has('teams')) void teamsPage.refresh()
    if (targets.has('states')) void statesPage.refresh()
    if (targets.has('states') && selectedItem)
      void apiRequest<WorkItem>(`/api/v1/work-items/${selectedItem.id}`).then(setSelectedItem)
    if (targets.has('humans')) void humansPage.refresh()
    if (targets.has('projects')) void projectsPage.refresh()
    if (targets.has('items')) void refreshWorkSurface()
    if (targets.has('items')) {
      if (
        selectedItem
        && invalidation.event.invalidates.some(resource =>
          resource.type === 'work_item' && resource.id === selectedItem.id)
      ) {
        void apiRequest<WorkItem>(
          `/api/v1/work-items/${selectedItem.id}`,
        ).then(setSelectedItem)
      }
    }
  })

  const chooseTeam = (nextTeamId: string) => {
    setTeamId(nextTeamId)
    setFilters(emptyFilters)
    setSelectedItem(null)
    setSelectedProject(null)
    setProjectTab('overview')
    setFullItemView(false)
  }
  const chooseScope = (nextScope: Scope) => {
    setScope(nextScope)
    setSelectedProject(null)
    setSelectedItem(null)
    setProjectTab('overview')
    setFullItemView(false)
    if (nextScope === 'my-work') setFilters({})
    else if (nextScope === 'active') { layoutRef.current = 'board'; setFilters({ statusCategory: 'started' }) }
    else if (nextScope === 'backlog') setFilters({ statusCategory: 'backlog' })
    else setFilters(emptyFilters)
  }
  const navigateScope = (event: MouseEvent<HTMLAnchorElement>, nextScope: Scope) => {
    event.preventDefault()
    router.push(homeScopeHref(nextScope), { scroll: false })
    chooseScope(nextScope)
  }
  const openItem = async (id: string, full = false, updateHistory = true) => {
    if (!isAuthorityCurrent()) return
    setRequestedItem({ id, mode: full ? 'full_page' : 'sheet' })
    setFullItemView(full)
    if (selectedItem?.id !== id) setSelectedItem(null)
    try {
      setError('')
      setDetailErrorState(null)
      const item = await apiRequest<WorkItem>(`/api/v1/work-items/${id}`)
      if (!isAuthorityCurrent()) return
      setSelectedItem(item)
      if (full && updateHistory) router.push(projectWorkspaceHref({
        projectId: item.project_id ?? selectedProject?.id,
        tab: projectTab,
        workItemId: item.id,
      }), { scroll: false })
    } catch (reason) { if (isAuthorityCurrent()) setDetailErrorState(detailError(reason)) }
  }
  const openProject = async (id: string, tab: ProjectWorkspaceTab = 'overview', updateHistory = true) => {
    if (!isAuthorityCurrent()) return
    const request = projectRequestGateRef.current.begin(id)
    requestedProjectIdRef.current = id
    try {
      setError('')
      setScope('projects')
      setSelectedItem(null)
      setFullItemView(false)
      setProjectTab(tab)
      if (updateHistory) router.push(projectWorkspaceHref({ projectId: id, tab }), { scroll: false })
      const project = await apiRequest<Project>(`/api/v1/projects/${id}`, { signal: request.signal })
      if (!isAuthorityCurrent() || !request.isCurrent() || requestedProjectIdRef.current !== id) return
      setSelectedProject(project)
      setProjectTab(tab)
      setFilters(current => ({ ...current, projectId: project.id, milestoneId: undefined }))
    } catch (reason) {
      if (!request.isCurrent()) return
      if (isAuthorityCurrent()) { setSelectedProject(null); setError(requestError(reason)) }
    }
  }
  useEffect(() => () => projectRequestGateRef.current.cancel(), [])
  const selectProjectTab = useCallback((tab: ProjectWorkspaceTab) => {
    setProjectTab(tab)
    if (tab === 'board') layoutRef.current = 'board'
    else if (tab === 'list' || tab === 'backlog') layoutRef.current = 'list'
    if (selectedProject) router.push(projectWorkspaceHref({ filterSearch: serializeWorkSurfaceQuery(filters), projectId: selectedProject.id, tab }), { scroll: false })
  }, [filters, router, selectedProject])
  const applySavedView = (view: SavedViewPreference) => {
    const fallbackScope = scope === 'projects' ? 'project-work-items' : scope === 'my-work' || scope === 'active' || scope === 'backlog' ? scope : 'my-work'
    const nextScope = workSurfaceScopeForQuery(view.filters, fallbackScope)
    layoutRef.current = view.layout
    setFilters(view.filters)
    setSelectedItem(null)
    if (nextScope === 'project-work-items') {
      const project = teamProjects.find(candidate => candidate.id === view.filters.projectId) ?? null
      const tab: ProjectWorkspaceTab = view.layout === 'board' ? 'board' : 'list'
      setScope('projects')
      setSelectedProject(project)
      setProjectTab(tab)
      router.push(projectWorkspaceHref({ filterSearch: serializeWorkSurfaceQuery(view.filters), projectId: project?.id, tab }), { scroll: false })
    } else {
      setScope(nextScope)
      setSelectedProject(null)
      router.push(workSurfaceHref('my-work', view.filters, view.layout), { scroll: false })
    }
  }
  const surfaceFilters = useMemo<Filters>(() => {
    if (scope !== 'projects') return filters
    if (projectTab === 'backlog') return { ...filters, statusCategory: 'backlog' }
    if (filters.statusCategory === undefined) return filters
    const { statusCategory: _statusCategory, ...projectFilters } = filters
    return projectFilters
  }, [filters, projectTab, scope])
  const surfaceLayout: Layout = scope === 'projects' && projectTab === 'board' ? 'board' : scope === 'projects' ? 'list' : layoutRef.current
  const surfaceScope = scope === 'projects' ? 'project-work-items' : scope === 'my-work' || scope === 'active' || scope === 'backlog' ? scope : 'my-work'
  const workSurfaces = actor && selectedTeam ? <WorkSurfaces
    actorId={actor.id}
    authorityKey={authorityScopeKey}
    columnWidths={boardColumnWidths}
    humans={humans}
    initialFilters={surfaceFilters}
    initialLayout={surfaceLayout}
    copy={issueCopy}
    milestones={issueMilestonesPage.items}
    onApplySavedView={applySavedView}
    onColumnWidthChange={setBoardColumnWidth}
    onError={message => setError(message)}
    onItemsChange={setWorkSurfaceItems}
    onLayoutChange={next => {
      layoutRef.current = next
      if (scope === 'projects') selectProjectTab(next)
      else router.push(workSurfaceHref('my-work', filters, next), { scroll: false })
    }}
    onOpenItem={id => openItem(id)}
    onOpenProject={id => openProject(id)}
    onQueryChange={next => {
      setFilters(next)
      if (scope === 'projects' && selectedProject) router.replace(projectWorkspaceHref({ filterSearch: serializeWorkSurfaceQuery(next), projectId: selectedProject.id, tab: projectTab }), { scroll: false })
      else if (scope !== 'projects') router.push(workSurfaceHref('my-work', next, layoutRef.current), { scroll: false })
    }}
    onRefreshReady={refresh => { surfaceRefreshRef.current = refresh }}
    onSelectionReset={() => { setSelectedProject(null); setSelectedItem(null) }}
    projects={teamProjects}
    realtimeResources={realtimeResources}
    scope={surfaceScope}
    selectedProjectId={selectedProject?.id}
    statuses={states}
    surfaceCopy={surfaceCopy}
    teamId={selectedTeam.id}
  /> : null
  useEffect(() => {
    if (scope !== 'projects' || selectedProject || teamProjects.length === 0) return
    if (new URLSearchParams(currentSearch).get('project')) return
    const first = teamProjects[0]!
    setSelectedProject(first)
    requestedProjectIdRef.current = first.id
    setProjectTab('overview')
    setFilters(current => ({ ...current, projectId: first.id, milestoneId: undefined }))
    router.replace(projectWorkspaceHref({ projectId: first.id, tab: 'overview' }), { scroll: false })
  }, [currentSearch, router, scope, selectedProject, teamProjects])
  const closeItem = () => {
    setSelectedItem(null)
    setRequestedItem(null)
    setDetailErrorState(null)
    setDetailConflict(null)
    if (fullItemView) {
      setFullItemView(false)
      router.replace(projectWorkspaceHref({ projectId: selectedProject?.id, tab: projectTab }), { scroll: false })
    }
  }
  const openCreateWorkItem = () => {
    setCreateWorkItemError('')
    setCreateWorkItemOpen(true)
  }
  const closeCreateWorkItem = () => {
    setCreateWorkItemError('')
    setCreateWorkItemOpen(false)
  }
  useEffect(() => {
    if (!actor) return
    const restoreRoute = () => {
      const search = currentSearch ? `?${currentSearch}` : ''
      const routeChanged = restoredSearchRef.current !== currentSearch
      restoredSearchRef.current = currentSearch
      const requestedScope = parseHomeScope(search)
      const nextScope: Scope = requestedScope === 'active' || requestedScope === 'backlog' ? 'my-work' : requestedScope
      const route = readProjectWorkspaceRoute(search)
      const params = new URLSearchParams(search)
      const intent = params.get('intent')
      const sectionItemId = params.get('workItemSectionItem')
      const routeFilters = parseWorkSurfaceQuery(search)
      if (requestedScope === 'active') routeFilters.statusCategory = 'started'
      if (requestedScope === 'backlog') routeFilters.statusCategory = 'backlog'
      if (requestedScope === 'active' || requestedScope === 'backlog') {
        params.set('view', 'my-work')
        params.set('statusCategory', routeFilters.statusCategory ?? (requestedScope === 'active' ? 'started' : 'backlog'))
        router.replace(`/?${params.toString()}`, { scroll: false })
      }
      setScope(nextScope)
      layoutRef.current = parseWorkSurfaceLayout(search)
      setFilters(routeFilters)
      // Data refreshes can re-render the route projector without changing the
      // URL. Keep an open sheet stable across those refreshes; clear it only
      // when the user actually navigates to a different route.
      if (routeChanged && sectionItemId !== selectedItem?.id) setSelectedItem(null)
      if (nextScope !== 'projects') {
        projectRequestGateRef.current.cancel()
        setSelectedProject(null)
        requestedProjectIdRef.current = null
      }
      setFullItemView(false)
      if (intent === 'create-work-item') openCreateWorkItem()
      if (intent === 'create-project') setCreateProjectOpen(true)
      if (intent) {
        params.delete('intent')
        router.replace(`/${params.size ? `?${params.toString()}` : ''}`, { scroll: false })
      }
      if (nextScope !== 'projects') {
        if (route.workItemId) void openItem(route.workItemId, true, false)
        return
      }
      setProjectTab(route.tab)
      // A Project request can be invalidated while the authenticated/Team
      // authority is still settling. Re-run the URL-owned selection on the
      // next authority projection; LatestRequestGate cancels any superseded
      // request and prevents an older response from committing.
      if (route.projectId && route.projectId !== selectedProject?.id) {
        void openProject(route.projectId, route.tab, false).then(() => {
          if (!isAuthorityCurrent()) return
          if (route.workItemId) void openItem(route.workItemId, true, false)
        })
      } else if (route.workItemId) void openItem(route.workItemId, true, false)
    }
    restoreRoute()
  }, [authorityScopeKey, currentSearch, isAuthorityCurrent, router, selectedProject?.id])
  const createWorkItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTeam || !actor) return
    const formElement = event.currentTarget; const form = new FormData(formElement); const state = states.find(candidate => candidate.id === form.get('statusId'))
    const title = String(form.get('title') ?? '')
    setCreateWorkItemError('')
    try {
      await apiRequest('/api/v1/work-items', { method: 'POST', headers: json({}), body: JSON.stringify({ teamId: selectedTeam.id, title, description: String(form.get('description') ?? '') || undefined, statusId: form.get('statusId'), priority: form.get('priority'), dueDate: String(form.get('dueDate') ?? '') || undefined, responsibleHumanActorId: String(form.get('ownerId') ?? '') || (state?.category === 'started' ? actor.id : undefined), projectId: String(form.get('projectId') ?? '') || undefined, labels: String(form.get('labels') ?? '').split(',').map(label => label.trim()).filter(Boolean) }) })
      if (!isAuthorityCurrent()) return
    } catch (reason) {
      if (!isAuthorityCurrent()) return
      if (reason instanceof ApiError && [400, 409, 412, 422].includes(reason.status)) {
        setCreateWorkItemError(requestError(reason))
      } else {
        setCreateWorkItemError(`${toastCopy.issueCreateFailedTitle}. ${toastCopy.issueCreateFailedDescription}`)
      }
      return
    }
    formElement.reset(); closeCreateWorkItem()
    pushToast({
      dedupeKey: 'home:create-work-item',
      description: toastCopy.issueCreatedDescription(title),
      title: toastCopy.issueCreatedTitle,
      tone: 'success',
    })
    try { await refreshWorkSurface() } catch (reason) { if (isAuthorityCurrent()) setError(requestError(reason)) }
  }
  const saveItem = async (draft: WorkItemDetailDraft) => {
    if (!selectedItem || !actor) return
    try {
      setDetailConflict(null)
      setDetailErrorState(null)
      await updateWorkItemDetail({ workItemId: selectedItem.id, revision: selectedItem.revision, draft })
      if (!isAuthorityCurrent()) return
      await refreshWorkSurface()
      if (!isAuthorityCurrent()) return
      await openItem(selectedItem.id, fullItemView, false)
    } catch (reason) {
      if (!isAuthorityCurrent()) return
      const structured = detailError(reason)
      if (structured.httpStatus === 409) setDetailConflict(structured)
      else setDetailErrorState(structured)
    }
  }
  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTeam) return
    const formElement = event.currentTarget; const form = new FormData(formElement)
    try {
      const project = await apiRequest<{ id: string }>('/api/v1/projects', { method: 'POST', headers: json({}), body: JSON.stringify({ teamId: selectedTeam.id, name: String(form.get('name') ?? ''), summary: String(form.get('summary') ?? '') || undefined, description: String(form.get('description') ?? '') || undefined, leadActorId: String(form.get('leadActorId') ?? '') || null, targetDate: String(form.get('targetDate') ?? '') || null }) })
      if (!isAuthorityCurrent()) return
      formElement.reset(); setCreateProjectOpen(false); await projectsPage.refresh()
      if (!isAuthorityCurrent()) return
      await openProject(project.id)
    } catch (reason) { if (isAuthorityCurrent()) setError(requestError(reason)) }
  }
  const createComment = async (event: FormEvent<HTMLFormElement>, parentCommentId?: string) => {
    event.preventDefault()
    if (!selectedItem) return
    const formElement = event.currentTarget; const form = new FormData(formElement)
    try {
      await apiRequest(`/api/v1/work-items/${selectedItem.id}/comments`, { method: 'POST', headers: json({}), body: JSON.stringify({ body: String(form.get('body') ?? ''), parentCommentId, mentions: form.getAll('mentions').map(String) }) })
      if (!isAuthorityCurrent()) return
      formElement.reset(); await commentsPage.refresh()
    } catch (reason) { if (isAuthorityCurrent()) setError(requestError(reason)) }
  }
  const updateComment = async (comment: Comment, patch: Record<string, string | boolean>) => {
    if (!selectedItem) return
    try {
      await apiRequest(`/api/v1/comments/${comment.id}`, { method: 'PATCH', headers: revisionHeader(comment.revision), body: JSON.stringify(patch) })
      if (!isAuthorityCurrent()) return
      await commentsPage.refresh()
    } catch (reason) { if (isAuthorityCurrent()) setError(requestError(reason)) }
  }
  const pageTitle = scope === 'inbox' ? t('inbox') : scope === 'recovery' ? t('recovery') : scope === 'guidance' ? t('guidance') : scope === 'projects' ? t('projects') : t('issues')
  const fullPageDetailActive = fullItemView && (selectedItem !== null || (requestedItem?.mode === 'full_page' && detailErrorState !== null))
  const scopeNavigation = workspaceNavigation({ active: scope, onHomeNavigate: (event, value) => navigateScope(event, value), t })
  const utilityNavigation = workspaceUtilityNavigation({ t })
  return <AuthenticatedWorkspaceShell
    administrationNavigationLabel={t('administrationNavigation')}
    actorName={actorDisplayName(actor)}
    contextLabel={pageTitle}
    documentTitle={scope === 'projects' && selectedProject ? selectedProject.name : pageTitle}
    headerActions={<div className="shell-action-cluster"><LocaleToggle /><RealtimeStatus labels={{ connected: t('live'), connecting: t('connecting'), reconnecting: t('reconnecting'), offline: t('offline') }} /></div>}
    mainNavigationLabel={t('mainNavigation')}
    menuLabel={t('menu')}
    mobileNavigationLabel={t('mobileNavigation')}
    navigation={scopeNavigation}
    skipLabel={t('skipToContent')}
    teamSwitcher={<><label aria-busy={teamAuthorityRefreshBusy || undefined} className="team-switcher">{t('team')}{teamAuthoritiesInitialized
      ? <select aria-label={t('currentTeam')} value={selectedTeam?.id ?? ''} onChange={event => chooseTeam(event.currentTarget.value)}><option value="" disabled>{t('noTeam')}</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name} ({team.key})</option>)}</select>
      : <select aria-label={t('currentTeam')} disabled value=""><option value="">{teamAuthorityError ? t('team') : `${t('loading')} ${t('team')}`}</option></select>}</label>{teamAuthoritiesInitialized && <LoadMoreButton collection={teamsPage} label={t('team')} loadingLabel={`${t('loading')}…`} loadMoreLabel={`${t('loadMore')} ${t('team')}`} />}</>}
    utilityNavigation={utilityNavigation}
    workspaceNavigationLabel={t('workspaceNavigation')}
  >
    <section
      aria-busy={actorLoading || teamAuthorityRefreshBusy || undefined}
      aria-hidden={fullPageDetailActive || undefined}
      className={`content${scope === 'projects' ? ' projects-page' : ''}`}
      inert={fullPageDetailActive ? true : undefined}
    >
      {scope !== 'projects' && <header hidden={fullPageDetailActive}>
        <div><h1>{pageTitle}</h1>{selectedProject && <p>{selectedProject.summary || t('projectOverview')}</p>}</div>
        <div className="page-actions">
          {scope !== 'inbox' && scope !== 'recovery' && scope !== 'guidance' && <Button icon={<PlusIcon aria-hidden="true" size={17} weight="bold" />} onClick={openCreateWorkItem} variant="primary">{t('newIssue')}</Button>}
        </div>
      </header>}
      {collectionError && <ErrorState description={collectionError.message} title={t('workViewCouldNotRefresh')} />}
      {actorError && <ErrorState actionLabel={t('retry')} description={actorError} onAction={() => void refreshActor()} title={t('workViewCouldNotRefresh')} />}
      {error && <ErrorState description={error} title={t('actionCouldNotComplete')} />}
      {conflictNotice && !selectedItem && <aside className="conflict-notice" role="alert" data-testid="work-item-conflict"><div><strong>{conflictNotice.title}</strong><p>{conflictNotice.action}</p></div><Button icon={<ArrowCounterClockwiseIcon aria-hidden="true" size={17} weight="bold" />} onClick={() => { setConflictNotice(null); void refreshWorkSurface() }} variant="secondary">{t('reloadLatestWork')}</Button></aside>}
      {scope === 'inbox' ? <ActionableCollaborationQueues actor={actor} /> : scope === 'recovery' ? <RecoveryCenter actor={actor} /> : scope === 'guidance' ? <GuidancePanel actorId={actor.id} copy={guidanceCopy} workspaceId={actor.workspace_id ?? ''} team={selectedTeam} projects={teamProjects} /> : <>{selectedTeam ? <>
        <div className="collection-continuation"><LoadMoreButton collection={statesPage} label={t('status')} /><LoadMoreButton collection={humansPage} label={t('responsibleHuman')} /><LoadMoreButton collection={projectsPage} label={t('projects')} /></div>
        {scope !== 'projects' && workSurfaces}
        {scope === 'projects' && <div className="project-workbench">
          <aside className="project-rail" aria-label={t('projects')}>
            <header><div><span className="eyebrow">Workspace</span><h1>{t('projects')}</h1></div><Button aria-label={t('newProject')} icon={<FolderPlusIcon aria-hidden="true" size={16} weight="bold" />} onClick={() => setCreateProjectOpen(true)} variant="ghost" /></header>
            <div className="project-rail-list">
              {teamProjects.map(project => <button aria-current={selectedProject?.id === project.id ? 'page' : undefined} className={selectedProject?.id === project.id ? 'selected' : ''} data-testid={`project-${project.id}`} key={project.id} onClick={() => void openProject(project.id)} type="button">
                <span className="project-rail-status"><i aria-hidden="true" />{project.status.replaceAll('_', ' ')}</span>
                <strong>{project.name}</strong>
                <small>{project.summary || t('projectOverview')}</small>
                <time dateTime={project.target_date ?? undefined}>{t('targetDate')} · {project.target_date?.slice(0, 10) || '—'}</time>
              </button>)}
              {teamProjects.length === 0 && <div className="project-rail-empty"><FolderSimpleIcon aria-hidden="true" size={28} /><strong>{t('noProjects')}</strong></div>}
            </div>
          </aside>
          <section className="project-detail-pane">
            {selectedProject ? <ProjectWorkspace actions={<Button icon={<PlusIcon aria-hidden="true" size={16} weight="bold" />} onClick={openCreateWorkItem} variant="primary">{t('newIssue')}</Button>} actor={actor} project={selectedProject} items={items} tab={projectTab} workSurface={workSurfaces} onTabChange={selectProjectTab} /> : teamProjects.length > 0 ? <p className="empty">{t('projectOverview')}</p> : null}
          </section>
        </div>}
      </> : teamAuthoritiesInitialized
        ? <section className="empty">{t('noTeam')} · {t('settings')}</section>
        : teamAuthorityError
          ? null
          : <SkeletonList columns={1} items={4} label={`${t('loading')} ${t('team')}`} />}</>}
    </section>
    <Dialog closeLabel={t('close')} onClose={() => setCreateProjectOpen(false)} open={createProjectOpen} title={t('createProject')}>
      <form className="project-form modal-form" onSubmit={createProject} data-testid="create-project">
        <label>{t('projectName')}<input name="name" required /></label>
        <label>{t('summary')}<input name="summary" /></label>
        <label>{t('targetDate')}<input name="targetDate" type="date" /></label>
        <label>{t('lead')}<select name="leadActorId"><option value="">{t('noLead')}</option>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select></label>
        <label className="form-span">{t('description')}<textarea name="description" /></label>
        <div className="form-actions"><Button icon={<XIcon aria-hidden="true" size={16} />} onClick={() => setCreateProjectOpen(false)} type="button">{t('cancel')}</Button><Button icon={<FolderPlusIcon aria-hidden="true" size={17} weight="bold" />} type="submit" variant="primary">{t('createProject')}</Button></div>
      </form>
    </Dialog>
    <Dialog closeLabel={t('close')} onClose={closeCreateWorkItem} open={createWorkItemOpen} title={t('createIssue')}>
      <form className="work-form modal-form" onSubmit={createWorkItem} data-testid="create-work-item">
        {createWorkItemError && <p className="error" role="alert">{createWorkItemError}</p>}
        <label className="form-span">{t('title')}<input name="title" required /></label>
        <label className="form-span">{t('description')}<textarea name="description" /></label>
        <label>{t('status')}<select name="statusId" required>{states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
        <label>{t('priority')}<select name="priority"><option value="none">{t('noPriority')}</option><option value="urgent">{t('urgent')}</option><option value="high">{t('high')}</option><option value="medium">{t('medium')}</option><option value="low">{t('low')}</option></select></label>
        <label>{t('dueDate')}<input name="dueDate" type="date" /></label>
        <label>{t('responsibleHuman')}<select name="ownerId"><option value="">{t('unassigned')}</option>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select></label>
        <label>{t('projects')}<select name="projectId"><option value="">{t('noProject')}</option>{teamProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label>{t('labels')}<input name="labels" /></label>
        <div className="form-actions"><Button icon={<XIcon aria-hidden="true" size={16} />} onClick={closeCreateWorkItem} type="button">{t('cancel')}</Button><Button disabled={!states[0]} data-testid="create-work-item-submit" icon={<PlusIcon aria-hidden="true" size={17} weight="bold" />} type="submit" variant="primary">{t('createIssue')}</Button></div>
      </form>
    </Dialog>
    {selectedItem && <WorkItemDetail
      conflict={detailConflict}
      error={detailErrorState}
      mode={fullItemView ? 'full_page' : 'sheet'}
      locale={locale}
      model={toWorkItemDetailModel(selectedItem)}
      resetKey={detailResetKey}
      draftIdentity={{ workspaceId: actor.workspace_id ?? '', teamId: selectedItem.team_id, actorId: actor.id, resourceType: 'work_item', resourceId: selectedItem.id }}
      agentAction={agentAction}
      agentPanel={<AgentWorkPanel activeAssignmentName={selectedItem.active_assignment?.agent_display_name ?? null} controller={agentController} onReloadWorkItem={() => { void refreshWorkSurface(); void openItem(selectedItem.id, fullItemView, false) }} workspaceId={actor.workspace_id ?? ''} workItemId={selectedItem.id} workItemTeamId={selectedItem.team_id} workItemRevision={selectedItem.revision} humanActorId={selectedItem.responsible_human_actor_id ?? ''} workItemTitle={selectedItem.title} />}
      copy={detailCopy}
      onClose={closeItem}
      onOpenFull={() => void openItem(selectedItem.id, true)}
      onReloadLatest={() => { setDetailConflict(null); setDetailErrorState(null); setDetailResetKey(value => value + 1); void refreshWorkSurface(); void openItem(selectedItem.id, fullItemView, false) }}
      onSave={saveItem}
      relationships={<WorkItemRelationships authorityKey={authorityScopeKey} item={selectedItem} projectItems={items} />}
      options={{
        statuses: states.map(state => ({ id: state.id, label: state.name })),
        humans: humans.map(human => ({ id: human.id, label: human.display_name })),
        projects: teamProjects.map(project => ({ id: project.id, label: project.name })),
        milestones: detailMilestonesPage.items.map(milestone => ({ id: milestone.id, label: milestone.name })),
        parents: items.filter(candidate => candidate.id !== selectedItem.id).map(candidate => ({ id: candidate.id, label: `${candidate.team_key}-${candidate.number} · ${candidate.title}` })),
      }}
      supplemental={<>
        <WorkRoom workItemId={selectedItem.id} draftIdentity={{ workspaceId: actor.workspace_id ?? '', teamId: selectedItem.team_id, actorId: actor.id, resourceType: 'work_item', resourceId: selectedItem.id }} legacyComments={comments} legacyHumans={humans} onLegacyComment={createComment} onLegacyUpdate={updateComment} onLegacyRefresh={commentsPage.refresh} />
        <LoadMoreButton collection={commentsPage} label="comments" />
      </>}
    />}
    {!selectedItem && requestedItem && detailErrorState && <WorkItemDetailUnavailable
      error={detailErrorState}
      mode={requestedItem.mode}
      onClose={closeItem}
      onRetry={() => void openItem(requestedItem.id, requestedItem.mode === 'full_page', false)}
      requestedKey={requestedItem.id}
      copy={detailCopy}
    />}
  </AuthenticatedWorkspaceShell>
}

type GuidanceScope = 'workspace' | 'team' | 'project'
type GuidanceRevision = { id: string; revisionNumber: number; contentHash: string; changeSummary: string; authorActorId: string; authorDisplayName: string; publishedAt: string }
type GuidanceCurrent = { scope: GuidanceScope; scopeId: string; documentId: string | null; status: 'unpublished' | 'active' | 'archived'; revision: number; currentRevision: GuidanceRevision | null; markdown: string; updatedAt: string }
type GuidanceHistory = { scope: GuidanceScope; scopeId: string; documentId: string | null; revision: number; status: GuidanceCurrent['status']; currentRevisionId: string | null; revisions: GuidanceRevision[]; audit: Array<{ id: string; action: 'published' | 'archived' | 'rolled_back'; fromRevisionId: string | null; toRevisionId: string | null; actorId: string; actorDisplayName: string; reason: string; createdAt: string }> }
type GuidanceDiff = { from: GuidanceRevision; to: GuidanceRevision; changes: Array<{ kind: 'context' | 'removed' | 'added'; oldLine: number | null; newLine: number | null; text: string }> }

function GuidancePanel({ copy, workspaceId, team, projects, actorId }: { copy: GuidanceCopy; workspaceId: string; team: Team | null; projects: Project[]; actorId: string }) {
  const isAuthorityCurrent = useAuthorityLifetime()
  const [scope, setScope] = useState<GuidanceScope>('workspace')
  const [projectId, setProjectId] = useState('')
  const [current, setCurrent] = useState<GuidanceCurrent | null>(null)
  const [history, setHistory] = useState<GuidanceHistory | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [changeSummary, setChangeSummary] = useState('')
  const [reason, setReason] = useState('')
  const [fromRevisionId, setFromRevisionId] = useState('')
  const [toRevisionId, setToRevisionId] = useState('')
  const [diff, setDiff] = useState<GuidanceDiff | null>(null)
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setProjectId(value => projects.some(project => project.id === value) ? value : projects[0]?.id ?? '')
  }, [projects])
  const id = scope === 'workspace' ? workspaceId : scope === 'team' ? team?.id ?? '' : projectId
  const plural = `${scope}s`
  const root = id ? `/api/v1/${plural}/${id}/guidance` : ''
  const loadGuidance = useCallback(async () => {
    if (!root) {
      setCurrent(null); setHistory(null); setMarkdown(''); setDiff(null)
      return
    }
    setLoading(true); setError('')
    try {
      const [nextCurrent, nextHistory] = await Promise.all([
        apiRequest<GuidanceCurrent>(root),
        apiRequest<GuidanceHistory>(`${root}/history`),
      ])
      if (!isAuthorityCurrent()) return
      setCurrent(nextCurrent); setHistory(nextHistory); setMarkdown(nextCurrent.markdown); setDiff(null)
      const newest = nextHistory.revisions[0]?.id ?? ''
      const previous = nextHistory.revisions[1]?.id ?? newest
      setFromRevisionId(previous); setToRevisionId(newest)
    } catch (reasonValue) {
      if (isAuthorityCurrent()) setError(requestError(reasonValue))
    } finally {
      if (isAuthorityCurrent()) setLoading(false)
    }
  }, [isAuthorityCurrent, root])
  useEffect(() => { void loadGuidance() }, [loadGuidance])

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!root || !current) return
    setError('')
    try {
      await apiMutation(`guidance:${scope}:${id}:publish`, root, { method: 'PUT', headers: revisionHeader(current.revision), body: JSON.stringify({ markdown, changeSummary }) })
      if (!isAuthorityCurrent()) return
      setChangeSummary(''); await loadGuidance()
    } catch (reasonValue) { if (isAuthorityCurrent()) setError(requestError(reasonValue)) }
  }
  const archive = async () => {
    if (!root || !current || !reason) return
    setError('')
    try {
      await apiMutation(`guidance:${scope}:${id}:archive`, `${root}/archive`, { method: 'POST', headers: revisionHeader(current.revision), body: JSON.stringify({ reason }) })
      if (!isAuthorityCurrent()) return
      setReason(''); await loadGuidance()
    } catch (reasonValue) { if (isAuthorityCurrent()) setError(requestError(reasonValue)) }
  }
  const rollback = async (revisionId: string) => {
    if (!root || !current || !reason) return
    setError('')
    try {
      await apiMutation(`guidance:${scope}:${id}:rollback:${revisionId}`, `${root}/rollback`, { method: 'POST', headers: revisionHeader(current.revision), body: JSON.stringify({ revisionId, reason }) })
      if (!isAuthorityCurrent()) return
      setReason(''); await loadGuidance()
    } catch (reasonValue) { if (isAuthorityCurrent()) setError(requestError(reasonValue)) }
  }
  const compare = async () => {
    if (!root || !fromRevisionId || !toRevisionId) return
    setError('')
    try {
      const query = new URLSearchParams({ fromRevisionId, toRevisionId })
      const nextDiff = await apiRequest<GuidanceDiff>(`${root}/diff?${query}`)
      if (isAuthorityCurrent()) setDiff(nextDiff)
    } catch (reasonValue) { if (isAuthorityCurrent()) setError(requestError(reasonValue)) }
  }

  return <section className="guidance-panel" data-testid="guidance-panel">
    <p className="guidance-intro">{copy.intro}</p>
    <div className="guidance-toolbar">
      <div className="guidance-toolbar-fields">
        <label>{copy.scope}<select aria-label={copy.scopeLabel} value={scope} onChange={event => setScope(event.currentTarget.value as GuidanceScope)}><option value="workspace">{copy.workspace}</option><option value="team">{copy.team}</option><option value="project">{copy.project}</option></select></label>
        {scope === 'team' && <label>{copy.team}<input value={team?.name ?? copy.noTeamSelected} readOnly /></label>}
        {scope === 'project' && <label>{copy.project}<select aria-label={copy.projectLabel} value={projectId} onChange={event => setProjectId(event.currentTarget.value)}><option value="" disabled>{copy.noProject}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
      </div>
      <div className={`guidance-status status-${current?.status ?? 'unpublished'}`}>
        <span className="guidance-status-label">{copy.status(current?.status ?? 'unavailable')}</span>
        <span className="guidance-status-revision">{copy.documentRevision(current?.revision ?? 0)}</span>
      </div>
    </div>
    {!root && <p className="empty">{copy.selectScope}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {loading && <p>{copy.loading}</p>}
    {root && current && <>
      <form className="guidance-editor" onSubmit={event => void publish(event)}>
        <div className="guidance-view-toggle" role="tablist" aria-label={copy.markdown}>
          <Button aria-pressed={viewMode === 'editor'} icon={<NotePencilIcon aria-hidden="true" size={15} weight="bold" />} onClick={() => setViewMode('editor')} role="tab" type="button" variant={viewMode === 'editor' ? 'primary' : 'ghost'}>{copy.edit}</Button>
          <Button aria-pressed={viewMode === 'preview'} icon={<EyeIcon aria-hidden="true" size={15} weight="bold" />} onClick={() => setViewMode('preview')} role="tab" type="button" variant={viewMode === 'preview' ? 'primary' : 'ghost'}>{copy.preview}</Button>
          {viewMode === 'editor' ? null : <span className="guidance-view-toggle-meta">{copy.characterCount(markdown.length)}</span>}
        </div>
        {viewMode === 'editor'
          ? <RichTextEditor
              identity={{ workspaceId, teamId: team?.id ?? '', actorId, resourceType: 'guidance', resourceId: current.documentId ?? scope, field: 'markdown', baseRevision: current.revision }}
              label={copy.markdown}
              name="markdown"
              value={markdown}
              onChange={setMarkdown}
              required
              testId="guidance-markdown"
            />
          : <section className="guidance-rendered" aria-label={copy.renderedPreviewLabel}>
              {markdown.trim()
                ? <RichContent density="document" source={markdown} />
                : <p className="guidance-preview-empty">{copy.previewEmpty}</p>}
            </section>}
        <label>{copy.changeSummary}<input data-testid="guidance-change-summary" value={changeSummary} onChange={event => setChangeSummary(event.currentTarget.value)} maxLength={500} required /></label>
        <Button data-testid="publish-guidance" icon={<UploadSimpleIcon aria-hidden="true" size={17} weight="bold" />} type="submit" variant="primary">{copy.publishRevision}</Button>
      </form>
      {current.currentRevision && <dl className="guidance-current"><div><dt>{copy.currentRevision}</dt><dd>#{current.currentRevision.revisionNumber}</dd></div><div><dt>{copy.author}</dt><dd>{current.currentRevision.authorDisplayName}</dd></div><div><dt>{copy.published}</dt><dd>{copy.formatDate(current.currentRevision.publishedAt)}</dd></div><div><dt>SHA-256</dt><dd>{current.currentRevision.contentHash}</dd></div></dl>}
      <section className="guidance-actions"><label>{copy.auditReason}<input value={reason} onChange={event => setReason(event.currentTarget.value)} placeholder={copy.auditPlaceholder} maxLength={2000} /></label><Button className="danger" disabled={!reason || current.status !== 'active'} icon={<ArchiveIcon aria-hidden="true" size={17} weight="bold" />} onClick={() => void archive()} variant="danger">{copy.archiveCurrent}</Button></section>
      <section className="guidance-history"><h3>{copy.revisionHistory}</h3>{history?.revisions.length ? <ul>{history.revisions.map(revision => <li key={revision.id} className={history.currentRevisionId === revision.id ? 'selected' : ''}><div><strong>#{revision.revisionNumber} · {revision.changeSummary}</strong><small>{revision.authorDisplayName} · {copy.formatDate(revision.publishedAt)}</small><code>{revision.contentHash}</code></div><Button disabled={!reason || history.currentRevisionId === revision.id} icon={<ArrowCounterClockwiseIcon aria-hidden="true" size={16} />} onClick={() => void rollback(revision.id)}>{copy.rollbackPointer}</Button></li>)}</ul> : <p className="empty">{copy.noRevisions}</p>}</section>
      {(history?.revisions.length ?? 0) >= 2 && <section className="guidance-compare"><h3>{copy.compareRevisions}</h3><div><select aria-label={copy.fromRevision} value={fromRevisionId} onChange={event => setFromRevisionId(event.currentTarget.value)}>{history?.revisions.map(revision => <option key={revision.id} value={revision.id}>#{revision.revisionNumber}</option>)}</select><select aria-label={copy.toRevision} value={toRevisionId} onChange={event => setToRevisionId(event.currentTarget.value)}>{history?.revisions.map(revision => <option key={revision.id} value={revision.id}>#{revision.revisionNumber}</option>)}</select><Button icon={<ArrowsLeftRightIcon aria-hidden="true" size={16} weight="bold" />} onClick={() => void compare()}>{copy.showDiff}</Button></div>{diff && <pre data-testid="guidance-diff">{diff.changes.map((change, index) => <span key={`${change.kind}:${index}`} className={`diff-${change.kind}`}>{change.kind === 'added' ? '+' : change.kind === 'removed' ? '-' : ' '} {change.text}{'\n'}</span>)}</pre>}</section>}
      <section className="guidance-audit"><h3>{copy.pointerAudit}</h3>{history?.audit.length ? <ol>{history.audit.map(fact => <li key={fact.id}><strong>{copy.action(fact.action)}</strong> {copy.by} {fact.actorDisplayName} · {fact.reason} <time>{copy.formatDate(fact.createdAt)}</time></li>)}</ol> : <p>{copy.noPointerChanges}</p>}</section>
      {scope === 'project' && projects.find(project => project.id === projectId)?.description && <div className="guidance-description-note"><strong>{copy.projectDescription}</strong><p>{projects.find(project => project.id === projectId)?.description}</p></div>}
    </>}
  </section>
}

function MentionPicker({ humans }: { humans: Human[] }) {
  const { relationsCopy: text } = useLocale()
  return <label className="mentions">{text.fieldWorkItem}<select name="mentions" multiple aria-label={text.fieldWorkItem}>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select></label>
}
type Milestone = { id: string; name: string; description: string | null; target_date: string | null; revision: number }
type WorkItemRelation = { id: string; source_work_item_id: string; target_work_item_id: string; kind: 'blocks' | 'related'; revision: number }

function WorkItemRelationships({ authorityKey, item, projectItems }: { authorityKey: string | null; item: WorkItem; projectItems: WorkItemDto[] }) {
  const { relationsCopy: text } = useLocale()
  const isAuthorityCurrent = useAuthorityLifetime()
  const relations = usePagedApiList<WorkItemRelation>(`/api/v1/work-items/${encodeURIComponent(item.id)}/relations`, { scopeKey: authorityKey })
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<ReturnType<typeof revisionConflictNotice>>(null)
  useRealtimeSubscription([{ type: 'work_item', id: item.id }], invalidation => {
    if (invalidation.reason === 'resync' || [
      ...invalidation.event.scopes,
      ...invalidation.event.invalidates,
    ].some(resource => resource.type === 'work_item' && resource.id === item.id))
      return relations.refresh()
  })
  const workLabel = (id: string) => {
    const target = projectItems.find(candidate => candidate.id === id)
    return target ? `${target.team_key}-${target.number} · ${target.title}` : id
  }
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setError('')
    try {
      await apiRequest(`/api/v1/work-items/${encodeURIComponent(item.id)}/relations`, { method: 'POST', headers: json({}), body: JSON.stringify({ targetWorkItemId: form.get('targetWorkItemId'), kind: form.get('kind') }) })
      if (!isAuthorityCurrent()) return
      formElement.reset(); await relations.refresh()
    } catch (reason) { if (isAuthorityCurrent()) setError(requestError(reason)) }
  }
  const remove = async (relation: WorkItemRelation) => {
    setError('')
    try {
      await apiRequest(`/api/v1/work-items/${encodeURIComponent(item.id)}/relations/${encodeURIComponent(relation.id)}`, { method: 'DELETE', headers: revisionHeader(relation.revision) })
      if (!isAuthorityCurrent()) return
      await relations.refresh()
    } catch (reason) {
      if (!isAuthorityCurrent()) return
      const notice = reason instanceof ApiError ? revisionConflictNotice(reason) : null
      if (notice) setConflict(notice); else setError(requestError(reason))
    }
  }
  return <section className="relationship-panel" aria-labelledby="relationships-heading">
    <header><div><span className="eyebrow">{text.eyebrow}</span><h3 id="relationships-heading">{text.title}</h3></div></header>
    {(error || relations.error) && <p className="error" role="alert">{error || relations.error?.message}</p>}
    {conflict && <aside className="conflict-notice" role="alert"><div><strong>{text.conflictTitle}</strong><p>{text.conflictAction}</p></div><button onClick={() => { setConflict(null); void relations.refresh() }} type="button">{text.reload}</button></aside>}
    <div className="relation-list">{relations.items.map(relation => {
      const otherId = relation.source_work_item_id === item.id ? relation.target_work_item_id : relation.source_work_item_id
      const direction = relation.kind === 'related' ? text.related : relation.source_work_item_id === item.id ? text.blocks : text.blockedBy
      return <article key={relation.id}><span className={`relation-kind relation-${relation.kind}`}>{direction}</span><strong>{workLabel(otherId)}</strong><button onClick={() => void remove(relation)} type="button">{text.remove}</button></article>
    })}{!relations.loading && relations.items.length === 0 && <p className="empty">{text.empty}</p>}</div>
    <form className="relation-create" onSubmit={event => void add(event)}><label>{text.fieldKind}<select name="kind"><option value="blocks">{text.kindBlocks}</option><option value="related">{text.kindRelated}</option></select></label><label>{text.fieldWorkItem}<select name="targetWorkItemId" required defaultValue=""><option value="" disabled>{text.fieldWorkItemPlaceholder}</option>{projectItems.filter(candidate => candidate.id !== item.id).map(candidate => <option key={candidate.id} value={candidate.id}>{workLabel(candidate.id)}</option>)}</select></label><button disabled={projectItems.length < 2} type="submit">{text.add}</button></form>
    <LoadMoreButton collection={relations} label={text.loadMore} />
  </section>
}
