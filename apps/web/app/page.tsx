'use client'

import { type FormEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell, AsyncStateSurface, Button, Dialog, ErrorState, Toast, type NavigationItem } from '@workmesh/ui'
import { ApiError, apiMutation, apiRequest, clearCsrfToken, json, publicRequest, saveCsrfToken } from './lib/api'
import { AgentWorkPanel } from './agent-work-panel'
import { InboxPanel, WorkRoom } from './work-room'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { type RealtimeResource, useRealtimeSubscription } from './lib/realtime'
import { homeRefreshTargets } from './lib/realtime-refresh'
import { homeScopeHref, parseHomeScope, type HomeScope } from './lib/navigation'
import { actorDisplayName, type AuthenticatedActor } from './lib/actor'
import { ProjectWorkspace } from './project-workspace'
import { RealtimeStatus } from './realtime-status'
import {
  projectWorkspaceHref,
  readProjectWorkspaceRoute,
  revisionConflictNotice,
  type ProjectWorkspaceTab,
} from './lib/project-work'
import { GlobalCommandCenter } from '../features/command-center'
import { WorkSurfaces } from '../features/work-items/work-surfaces'
import type { SavedViewPreference, WorkItemDto, WorkSurfaceQuery } from '../features/work-items/contracts'
import { workSurfaceScopeForQuery } from '../features/work-items/query'
import { WorkItemDetail, WorkItemDetailUnavailable, detailError, toWorkItemDetailModel, updateWorkItemDetail, type StructuredDetailError, type WorkItemDetailDraft, type WorkItemDetailDto } from '../features/work-items/detail'

type Actor = AuthenticatedActor
type AuthMe = { actor: Actor; csrfToken: string }
type InstallStatus = { installed: boolean }
type FeatureRegistry = { features: Array<{ key: string; tier: 'beta' | 'experimental'; enabled: boolean }> }
type ReleaseInfo = { serverVersion: string; buildSha: string; schemaBaseline: number }
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
  const [actor, setActor] = useState<Actor | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null)
  const [requestedItem, setRequestedItem] = useState<{ id: string; mode: 'sheet' | 'full_page' } | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [scope, setScope] = useState<Scope>('my-work')
  const [layout, setLayout] = useState<Layout>('list')
  const [projectTab, setProjectTab] = useState<ProjectWorkspaceTab>('overview')
  const [fullItemView, setFullItemView] = useState(false)
  const [conflictNotice, setConflictNotice] = useState<ReturnType<typeof revisionConflictNotice>>(null)
  const [detailErrorState, setDetailErrorState] = useState<StructuredDetailError | null>(null)
  const [detailConflict, setDetailConflict] = useState<StructuredDetailError | null>(null)
  const [detailResetKey, setDetailResetKey] = useState(0)
  const [filters, setFilters] = useState<Filters>({ mine: true })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [operationsEnabled, setOperationsEnabled] = useState(false)
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [createWorkItemOpen, setCreateWorkItemOpen] = useState(false)
  const [workSurfaceItems, setWorkSurfaceItems] = useState<WorkItemDto[]>([])
  const surfaceRefreshRef = useRef<(() => Promise<void>) | null>(null)

  const teamsPage = usePagedApiList<Team>(actor ? '/api/v1/teams' : null)
  const teams = teamsPage.items
  const selectedTeam = teams.find(team => team.id === teamId) ?? null
  const statesPage = usePagedApiList<WorkflowState>(
    actor && selectedTeam ? `/api/v1/teams/${selectedTeam.id}/states` : null,
  )
  const humansPage = usePagedApiList<Human>(
    actor ? `/api/v1/actors/humans${selectedTeam ? `?teamId=${encodeURIComponent(selectedTeam.id)}` : ''}` : null,
  )
  const projectsPage = usePagedApiList<Project>(actor ? '/api/v1/projects' : null)
  const states = statesPage.items
  const humans = humansPage.items
  const projects = projectsPage.items
  const teamProjects = useMemo(() => projects.filter(project => project.team_id === selectedTeam?.id), [projects, selectedTeam?.id])
  const commentsPage = usePagedApiList<Comment>(
    actor && selectedItem ? `/api/v1/work-items/${selectedItem.id}/comments` : null,
  )
  const items = workSurfaceItems
  const comments = commentsPage.items
  const milestonesPage = usePagedApiList<Milestone>(selectedItem?.project_id ? `/api/v1/projects/${encodeURIComponent(selectedItem.project_id)}/milestones` : null)
  const refreshWorkSurface = useCallback(async () => { await surfaceRefreshRef.current?.() }, [])
  const collectionError = [
    teamsPage.error, statesPage.error, humansPage.error, projectsPage.error,
    commentsPage.error,
  ].find(Boolean)

  const load = useCallback(async () => {
    try {
      setError('')
      const installation = await publicRequest<InstallStatus>('/api/v1/install-status')
      if (!installation.installed) {
        window.location.replace('/install')
        return
      }
      const auth = await apiRequest<AuthMe>('/api/v1/auth/me')
      saveCsrfToken(auth.csrfToken)
      setActor(auth.actor)
      const [featureRegistry, info] = await Promise.all([
        apiRequest<FeatureRegistry>('/api/v1/features'),
        publicRequest<ReleaseInfo>('/api/v1/info'),
      ])
      setOperationsEnabled(featureRegistry.features.some(feature =>
        feature.key === 'WORKMESH_BETA_OPERATIONS_UI' && feature.enabled))
      setReleaseInfo(info)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        clearCsrfToken()
        window.location.replace('/login')
        return
      }
      setError(requestError(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (teamsPage.loading) return
    setTeamId(current => teams.some(team => team.id === current) ? current : teams[0]?.id ?? null)
  }, [teams, teamsPage.loading])
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
    if (nextScope === 'my-work') setFilters({ mine: true })
    else if (nextScope === 'active') { setFilters({ statusCategory: 'started' }); setLayout('board') }
    else if (nextScope === 'backlog') setFilters({ statusCategory: 'backlog' })
    else setFilters(emptyFilters)
  }
  const navigateScope = (event: MouseEvent<HTMLAnchorElement>, nextScope: Scope) => {
    event.preventDefault()
    window.history.pushState({}, '', homeScopeHref(nextScope))
    chooseScope(nextScope)
  }
  const openItem = async (id: string, full = false, updateHistory = true) => {
    setRequestedItem({ id, mode: full ? 'full_page' : 'sheet' })
    setFullItemView(full)
    if (selectedItem?.id !== id) setSelectedItem(null)
    try {
      setError('')
      setDetailErrorState(null)
      const item = await apiRequest<WorkItem>(`/api/v1/work-items/${id}`)
      setSelectedItem(item)
      if (full && updateHistory) window.history.pushState({}, '', projectWorkspaceHref({
        projectId: item.project_id ?? selectedProject?.id,
        tab: projectTab,
        workItemId: item.id,
      }))
    } catch (reason) { setDetailErrorState(detailError(reason)) }
  }
  const openProject = async (id: string, tab: ProjectWorkspaceTab = 'overview', updateHistory = true) => {
    try {
      setError('')
      setScope('projects')
      setSelectedItem(null)
      setFullItemView(false)
      const project = await apiRequest<Project>(`/api/v1/projects/${id}`)
      setSelectedProject(project)
      setProjectTab(tab)
      setFilters(current => ({ ...current, projectId: project.id }))
      if (updateHistory) window.history.pushState({}, '', projectWorkspaceHref({ projectId: project.id, tab }))
    } catch (reason) { setError(requestError(reason)) }
  }
  const selectProjectTab = (tab: ProjectWorkspaceTab) => {
    setProjectTab(tab)
    if (tab === 'board') setLayout('board')
    else if (tab === 'list' || tab === 'backlog') setLayout('list')
    if (selectedProject) window.history.pushState({}, '', projectWorkspaceHref({ projectId: selectedProject.id, tab }))
  }
  const applySavedView = (view: SavedViewPreference) => {
    const fallbackScope = scope === 'projects' ? 'project-work-items' : scope === 'my-work' || scope === 'active' || scope === 'backlog' ? scope : 'my-work'
    const nextScope = workSurfaceScopeForQuery(view.filters, fallbackScope)
    setFilters(view.filters)
    setLayout(view.layout)
    setSelectedItem(null)
    if (nextScope === 'project-work-items') {
      const project = teamProjects.find(candidate => candidate.id === view.filters.projectId) ?? null
      setScope('projects')
      setSelectedProject(project)
      window.history.pushState({}, '', projectWorkspaceHref({ projectId: project?.id, tab: projectTab }))
    } else {
      setScope(nextScope)
      setSelectedProject(null)
      window.history.pushState({}, '', homeScopeHref(nextScope))
    }
  }
  const surfaceFilters = useMemo<Filters>(() => {
    if (scope !== 'projects') return filters
    if (projectTab === 'backlog') return { ...filters, statusCategory: 'backlog' }
    const { statusCategory: _statusCategory, ...projectFilters } = filters
    return projectFilters
  }, [filters, projectTab, scope])
  const surfaceLayout: Layout = scope === 'projects' && projectTab === 'board' ? 'board' : scope === 'projects' ? 'list' : layout
  const surfaceScope = scope === 'projects' ? 'project-work-items' : scope === 'my-work' || scope === 'active' || scope === 'backlog' ? scope : 'my-work'
  const workSurfaces = actor && selectedTeam ? <WorkSurfaces
    actorId={actor.id}
    humans={humans}
    initialFilters={surfaceFilters}
    initialLayout={surfaceLayout}
    onApplySavedView={applySavedView}
    onError={message => setError(message)}
    onItemsChange={setWorkSurfaceItems}
    onLayoutChange={next => {
      setLayout(next)
      if (scope === 'projects') selectProjectTab(next)
    }}
    onOpenItem={id => openItem(id)}
    onRefreshReady={refresh => { surfaceRefreshRef.current = refresh }}
    onSelectionReset={() => { setSelectedProject(null); setSelectedItem(null) }}
    projects={teamProjects}
    realtimeResources={realtimeResources}
    scope={surfaceScope}
    selectedProjectId={selectedProject?.id}
    statuses={states}
    teamId={selectedTeam.id}
  /> : null
  const closeItem = () => {
    setSelectedItem(null)
    setRequestedItem(null)
    setDetailErrorState(null)
    setDetailConflict(null)
    if (fullItemView) {
      setFullItemView(false)
      window.history.replaceState({}, '', projectWorkspaceHref({ projectId: selectedProject?.id, tab: projectTab }))
    }
  }
  useEffect(() => {
    if (!actor) return
    const restoreRoute = () => {
      const nextScope = parseHomeScope(window.location.search)
      const route = readProjectWorkspaceRoute(window.location.search)
      const params = new URLSearchParams(window.location.search)
      const intent = params.get('intent')
      chooseScope(nextScope)
      if (intent === 'create-work-item') setCreateWorkItemOpen(true)
      if (intent === 'create-project') setCreateProjectOpen(true)
      if (intent) {
        params.delete('intent')
        window.history.replaceState({}, '', `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`)
      }
      if (nextScope !== 'projects') {
        if (route.workItemId) void openItem(route.workItemId, true, false)
        return
      }
      setProjectTab(route.tab)
      if (route.projectId) {
        void openProject(route.projectId, route.tab, false).then(() => {
          if (route.workItemId) void openItem(route.workItemId, true, false)
        })
      } else if (route.workItemId) void openItem(route.workItemId, true, false)
    }
    restoreRoute()
    window.addEventListener('popstate', restoreRoute)
    return () => window.removeEventListener('popstate', restoreRoute)
  }, [actor])
  const createWorkItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTeam || !actor) return
    const formElement = event.currentTarget; const form = new FormData(formElement); const state = states.find(candidate => candidate.id === form.get('statusId'))
    try {
      await apiRequest('/api/v1/work-items', { method: 'POST', headers: json({}), body: JSON.stringify({ teamId: selectedTeam.id, title: String(form.get('title') ?? ''), description: String(form.get('description') ?? '') || undefined, statusId: form.get('statusId'), priority: form.get('priority'), dueDate: String(form.get('dueDate') ?? '') || undefined, responsibleHumanActorId: String(form.get('ownerId') ?? '') || (state?.category === 'started' ? actor.id : undefined), projectId: String(form.get('projectId') ?? '') || undefined, labels: String(form.get('labels') ?? '').split(',').map(label => label.trim()).filter(Boolean) }) })
      formElement.reset(); setCreateWorkItemOpen(false); await refreshWorkSurface()
    } catch (reason) { setError(requestError(reason)) }
  }
  const saveItem = async (draft: WorkItemDetailDraft) => {
    if (!selectedItem || !actor) return
    try {
      setDetailConflict(null)
      setDetailErrorState(null)
      await updateWorkItemDetail({ workItemId: selectedItem.id, revision: selectedItem.revision, draft })
      await refreshWorkSurface(); await openItem(selectedItem.id, fullItemView, false)
    } catch (reason) {
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
      formElement.reset(); setCreateProjectOpen(false); await projectsPage.refresh(); await openProject(project.id)
    } catch (reason) { setError(requestError(reason)) }
  }
  const createComment = async (event: FormEvent<HTMLFormElement>, parentCommentId?: string) => {
    event.preventDefault()
    if (!selectedItem) return
    const formElement = event.currentTarget; const form = new FormData(formElement)
    try {
      await apiRequest(`/api/v1/work-items/${selectedItem.id}/comments`, { method: 'POST', headers: json({}), body: JSON.stringify({ body: String(form.get('body') ?? ''), parentCommentId, mentions: form.getAll('mentions').map(String) }) })
      formElement.reset(); await commentsPage.refresh()
    } catch (reason) { setError(requestError(reason)) }
  }
  const updateComment = async (comment: Comment, patch: Record<string, string | boolean>) => {
    if (!selectedItem) return
    try { await apiRequest(`/api/v1/comments/${comment.id}`, { method: 'PATCH', headers: revisionHeader(comment.revision), body: JSON.stringify(patch) }); await commentsPage.refresh() } catch (reason) { setError(requestError(reason)) }
  }
  const signOut = async () => { try { await apiMutation('logout', '/api/v1/auth/logout', { method: 'POST', headers: json({}) }) } catch { /* Cookie may already be expired. */ }; clearCsrfToken(); window.location.assign('/login') }

  if (loading) return <main className="center foundation-center wm-theme" data-testid="loading"><AsyncStateSurface description="Loading your authorized workspace projection." state="loading" title="Loading WorkMesh" /></main>
  if (!actor) return <main className="center foundation-center wm-theme" data-testid="load-error"><ErrorState actionLabel="Retry" description={error || 'Unable to load your authorized WorkMesh projection.'} onAction={() => void load()} title="WorkMesh is unavailable" /></main>
  const pageTitle = scope === 'inbox' ? 'Inbox' : scope === 'guidance' ? 'Guidance' : scope === 'projects' ? 'Projects' : scope === 'my-work' ? 'My Work' : scope === 'active' ? 'Active work' : 'Backlog'
  const scopeLinks: Array<[Scope, string]> = [
    ['inbox', 'Inbox'],
    ['my-work', 'My Work'],
    ['active', 'Active'],
    ['backlog', 'Backlog'],
    ['projects', 'Projects'],
    ['guidance', 'Guidance'],
  ]
  const scopeNavigation: NavigationItem[] = scopeLinks.map(([value, label]) => ({
    active: scope === value,
    href: homeScopeHref(value),
    label,
    onClick: event => navigateScope(event, value),
    testId: `view-${value}`,
  }))
  scopeNavigation.push({ href: '/agents', label: 'Agents', testId: 'view-agents' })
  const utilityNavigation: NavigationItem[] = [
    ...(operationsEnabled ? [{ href: '/operations', label: 'Planning & Operations', testId: 'view-operations' }] : []),
    { href: '/settings', label: 'Settings' },
  ]
  return <AppShell
    actorName={actorDisplayName(actor)}
    contextLabel={pageTitle}
    headerActions={<div className="shell-action-cluster"><GlobalCommandCenter /><RealtimeStatus /></div>}
    footer={<><Button data-testid="logout" onClick={() => void signOut()} variant="ghost">Sign out</Button>{releaseInfo && <small className="release-info" data-testid="release-info">v{releaseInfo.serverVersion} · build {releaseInfo.buildSha} · schema {releaseInfo.schemaBaseline}</small>}</>}
    navigation={scopeNavigation}
    productName="WorkMesh"
    teamSwitcher={<><label className="team-switcher">Team<select aria-label="Current team" value={selectedTeam?.id ?? ''} onChange={event => chooseTeam(event.currentTarget.value)}><option value="" disabled>No team</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name} ({team.key})</option>)}</select></label><LoadMoreButton collection={teamsPage} label="teams" /></>}
    utilityNavigation={utilityNavigation}
  >
    <section className="content">
      <header>
        <div><h1>{pageTitle}</h1>{selectedProject && <p>{selectedProject.summary || 'Project overview'}</p>}</div>
        <div className="page-actions">
          {scope === 'projects' && <Button onClick={() => setCreateProjectOpen(true)} variant="secondary">New project</Button>}
          {scope !== 'inbox' && scope !== 'guidance' && <Button onClick={() => setCreateWorkItemOpen(true)} variant="primary">New work item</Button>}
        </div>
      </header>
      {collectionError && <ErrorState description={collectionError.message} title="This work view could not refresh" />}
      <Toast message={error} onDismiss={() => setError('')} open={Boolean(error)} title="Action could not be completed" tone="danger" />
      {conflictNotice && !selectedItem && <aside className="conflict-notice" role="alert" data-testid="work-item-conflict"><div><strong>{conflictNotice.title}</strong><p>{conflictNotice.action}</p></div><Button onClick={() => { setConflictNotice(null); void refreshWorkSurface() }} variant="secondary">Reload latest work</Button></aside>}
      {scope === 'inbox' ? <InboxPanel /> : scope === 'guidance' ? <GuidancePanel workspaceId={actor.workspace_id ?? ''} team={selectedTeam} projects={teamProjects} /> : <>{selectedTeam ? <>
        <div className="collection-continuation"><LoadMoreButton collection={statesPage} label="workflow states" /><LoadMoreButton collection={humansPage} label="people" /><LoadMoreButton collection={projectsPage} label="projects" /></div>
        {scope === 'projects' && <section className="project-strip" aria-label="Projects">{teamProjects.map(project => <Button key={project.id} data-testid={`project-${project.id}`} className={selectedProject?.id === project.id ? 'selected' : ''} onClick={() => void openProject(project.id)} variant="ghost">{project.name}</Button>)}{teamProjects.length === 0 && <span className="empty">No projects yet.</span>}</section>}
        {scope !== 'projects' && workSurfaces}
        {scope === 'projects' && selectedProject && <ProjectWorkspace project={selectedProject} items={items} tab={projectTab} workSurface={workSurfaces} onTabChange={selectProjectTab} />}
      </> : <section className="empty">Create a team from Settings to start tracking work.</section>}</>}
    </section>
    <Dialog onClose={() => setCreateProjectOpen(false)} open={createProjectOpen} title="Create project">
      <form className="project-form modal-form" onSubmit={createProject} data-testid="create-project">
        <label>Project name<input name="name" required /></label>
        <label>Summary<input name="summary" /></label>
        <label>Target date<input name="targetDate" type="date" /></label>
        <label>Lead<select name="leadActorId"><option value="">No lead</option>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select></label>
        <label className="form-span">Description<textarea name="description" /></label>
        <div className="form-actions"><Button onClick={() => setCreateProjectOpen(false)} type="button">Cancel</Button><Button type="submit" variant="primary">Create project</Button></div>
      </form>
    </Dialog>
    <Dialog onClose={() => setCreateWorkItemOpen(false)} open={createWorkItemOpen} title="Create work item">
      <form className="work-form modal-form" onSubmit={createWorkItem} data-testid="create-work-item">
        <label className="form-span">Title<input name="title" required /></label>
        <label className="form-span">Description<textarea name="description" /></label>
        <label>Status<select name="statusId" required>{states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
        <label>Priority<select name="priority"><option value="none">No priority</option><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        <label>Due date<input name="dueDate" type="date" /></label>
        <label>Responsible human<select name="ownerId"><option value="">Unassigned</option>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select></label>
        <label>Project<select name="projectId"><option value="">No project</option>{teamProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label>Labels<input name="labels" placeholder="Comma separated" /></label>
        <div className="form-actions"><Button onClick={() => setCreateWorkItemOpen(false)} type="button">Cancel</Button><Button disabled={!states[0]} data-testid="create-work-item-submit" type="submit" variant="primary">Create work item</Button></div>
      </form>
    </Dialog>
    {selectedItem && <WorkItemDetail
      conflict={detailConflict}
      error={detailErrorState}
      mode={fullItemView ? 'full_page' : 'sheet'}
      model={toWorkItemDetailModel(selectedItem)}
      resetKey={detailResetKey}
      draftIdentity={{ workspaceId: actor.workspace_id ?? '', teamId: selectedItem.team_id, actorId: actor.id, resourceType: 'work_item', resourceId: selectedItem.id }}
      onClose={closeItem}
      onOpenFull={() => void openItem(selectedItem.id, true)}
      onReloadLatest={() => { setDetailConflict(null); setDetailErrorState(null); setDetailResetKey(value => value + 1); void refreshWorkSurface(); void openItem(selectedItem.id, fullItemView, false) }}
      onSave={saveItem}
      options={{
        statuses: states.map(state => ({ id: state.id, label: state.name })),
        humans: humans.map(human => ({ id: human.id, label: human.display_name })),
        projects: teamProjects.map(project => ({ id: project.id, label: project.name })),
        milestones: milestonesPage.items.map(milestone => ({ id: milestone.id, label: milestone.name })),
        parents: items.filter(candidate => candidate.id !== selectedItem.id).map(candidate => ({ id: candidate.id, label: `${candidate.team_key}-${candidate.number} · ${candidate.title}` })),
      }}
      supplemental={<>
        <WorkItemRelationships item={selectedItem} projectItems={items} />
        <WorkRoom workItemId={selectedItem.id} draftIdentity={{ workspaceId: actor.workspace_id ?? '', teamId: selectedItem.team_id, actorId: actor.id, resourceType: 'work_item', resourceId: selectedItem.id }} legacyComments={comments} legacyHumans={humans} onLegacyComment={createComment} onLegacyUpdate={updateComment} onLegacyRefresh={commentsPage.refresh} />
        <LoadMoreButton collection={commentsPage} label="comments" />
        <AgentWorkPanel workspaceId={actor.workspace_id ?? ''} workItemId={selectedItem.id} workItemTeamId={selectedItem.team_id} workItemRevision={selectedItem.revision} humanActorId={actor.id} />
      </>}
    />}
    {!selectedItem && requestedItem && detailErrorState && <WorkItemDetailUnavailable
      error={detailErrorState}
      mode={requestedItem.mode}
      onClose={closeItem}
      onRetry={() => void openItem(requestedItem.id, requestedItem.mode === 'full_page', false)}
      requestedKey={requestedItem.id}
    />}
  </AppShell>
}

type GuidanceScope = 'workspace' | 'team' | 'project'
type GuidanceRevision = { id: string; revisionNumber: number; contentHash: string; changeSummary: string; authorActorId: string; authorDisplayName: string; publishedAt: string }
type GuidanceCurrent = { scope: GuidanceScope; scopeId: string; documentId: string | null; status: 'unpublished' | 'active' | 'archived'; revision: number; currentRevision: GuidanceRevision | null; markdown: string; updatedAt: string }
type GuidanceHistory = { scope: GuidanceScope; scopeId: string; documentId: string | null; revision: number; status: GuidanceCurrent['status']; currentRevisionId: string | null; revisions: GuidanceRevision[]; audit: Array<{ id: string; action: 'published' | 'archived' | 'rolled_back'; fromRevisionId: string | null; toRevisionId: string | null; actorId: string; actorDisplayName: string; reason: string; createdAt: string }> }
type GuidanceDiff = { from: GuidanceRevision; to: GuidanceRevision; changes: Array<{ kind: 'context' | 'removed' | 'added'; oldLine: number | null; newLine: number | null; text: string }> }

function GuidancePanel({ workspaceId, team, projects }: { workspaceId: string; team: Team | null; projects: Project[] }) {
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
      setCurrent(nextCurrent); setHistory(nextHistory); setMarkdown(nextCurrent.markdown); setDiff(null)
      const newest = nextHistory.revisions[0]?.id ?? ''
      const previous = nextHistory.revisions[1]?.id ?? newest
      setFromRevisionId(previous); setToRevisionId(newest)
    } catch (reasonValue) { setError(requestError(reasonValue)) } finally { setLoading(false) }
  }, [root])
  useEffect(() => { void loadGuidance() }, [loadGuidance])

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!root || !current) return
    setError('')
    try {
      await apiMutation(`guidance:${scope}:${id}:publish`, root, { method: 'PUT', headers: revisionHeader(current.revision), body: JSON.stringify({ markdown, changeSummary }) })
      setChangeSummary(''); await loadGuidance()
    } catch (reasonValue) { setError(requestError(reasonValue)) }
  }
  const archive = async () => {
    if (!root || !current || !reason) return
    setError('')
    try {
      await apiMutation(`guidance:${scope}:${id}:archive`, `${root}/archive`, { method: 'POST', headers: revisionHeader(current.revision), body: JSON.stringify({ reason }) })
      setReason(''); await loadGuidance()
    } catch (reasonValue) { setError(requestError(reasonValue)) }
  }
  const rollback = async (revisionId: string) => {
    if (!root || !current || !reason) return
    setError('')
    try {
      await apiMutation(`guidance:${scope}:${id}:rollback:${revisionId}`, `${root}/rollback`, { method: 'POST', headers: revisionHeader(current.revision), body: JSON.stringify({ revisionId, reason }) })
      setReason(''); await loadGuidance()
    } catch (reasonValue) { setError(requestError(reasonValue)) }
  }
  const compare = async () => {
    if (!root || !fromRevisionId || !toRevisionId) return
    setError('')
    try {
      const query = new URLSearchParams({ fromRevisionId, toRevisionId })
      setDiff(await apiRequest<GuidanceDiff>(`${root}/diff?${query}`))
    } catch (reasonValue) { setError(requestError(reasonValue)) }
  }

  return <section className="guidance-panel" data-testid="guidance-panel">
    <p className="guidance-intro">Versioned instructions for agents. Published revisions are immutable and Session context pins the exact revision and SHA-256 hash it used.</p>
    <div className="guidance-toolbar">
      <label>Scope<select aria-label="Guidance scope" value={scope} onChange={event => setScope(event.currentTarget.value as GuidanceScope)}><option value="workspace">Workspace</option><option value="team">Team</option><option value="project">Project</option></select></label>
      {scope === 'team' && <label>Team<input value={team?.name ?? 'No team selected'} readOnly /></label>}
      {scope === 'project' && <label>Project<select aria-label="Guidance project" value={projectId} onChange={event => setProjectId(event.currentTarget.value)}><option value="" disabled>No project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
      <div className={`guidance-status status-${current?.status ?? 'unpublished'}`}><strong>{current?.status ?? 'unavailable'}</strong><span>document revision {current?.revision ?? 0}</span></div>
    </div>
    {!root && <p className="empty">Select or create the required scope before editing Guidance.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {loading && <p>Loading Guidance…</p>}
    {root && current && <>
      <form className="guidance-editor" onSubmit={event => void publish(event)}>
        <label>Markdown<textarea data-testid="guidance-markdown" value={markdown} onChange={event => setMarkdown(event.currentTarget.value)} rows={16} maxLength={100000} /></label>
        <label>Change summary<input data-testid="guidance-change-summary" value={changeSummary} onChange={event => setChangeSummary(event.currentTarget.value)} maxLength={500} required /></label>
        <button data-testid="publish-guidance">Publish immutable revision</button>
      </form>
      {current.currentRevision && <dl className="guidance-current"><div><dt>Current revision</dt><dd>#{current.currentRevision.revisionNumber}</dd></div><div><dt>Author</dt><dd>{current.currentRevision.authorDisplayName}</dd></div><div><dt>Published</dt><dd>{new Date(current.currentRevision.publishedAt).toLocaleString()}</dd></div><div><dt>SHA-256</dt><dd>{current.currentRevision.contentHash}</dd></div></dl>}
      <section className="guidance-actions"><label>Audit reason<input value={reason} onChange={event => setReason(event.currentTarget.value)} placeholder="Required for archive or rollback" maxLength={2000} /></label><button className="danger" disabled={!reason || current.status !== 'active'} onClick={() => void archive()}>Archive current Guidance</button></section>
      <section className="guidance-history"><h3>Revision history</h3>{history?.revisions.length ? <ul>{history.revisions.map(revision => <li key={revision.id} className={history.currentRevisionId === revision.id ? 'selected' : ''}><div><strong>#{revision.revisionNumber} · {revision.changeSummary}</strong><small>{revision.authorDisplayName} · {new Date(revision.publishedAt).toLocaleString()}</small><code>{revision.contentHash}</code></div><button disabled={!reason || history.currentRevisionId === revision.id} onClick={() => void rollback(revision.id)}>Roll back pointer</button></li>)}</ul> : <p className="empty">No published revisions.</p>}</section>
      {(history?.revisions.length ?? 0) >= 2 && <section className="guidance-compare"><h3>Compare revisions</h3><div><select aria-label="From Guidance revision" value={fromRevisionId} onChange={event => setFromRevisionId(event.currentTarget.value)}>{history?.revisions.map(revision => <option key={revision.id} value={revision.id}>#{revision.revisionNumber}</option>)}</select><select aria-label="To Guidance revision" value={toRevisionId} onChange={event => setToRevisionId(event.currentTarget.value)}>{history?.revisions.map(revision => <option key={revision.id} value={revision.id}>#{revision.revisionNumber}</option>)}</select><button onClick={() => void compare()}>Show diff</button></div>{diff && <pre data-testid="guidance-diff">{diff.changes.map((change, index) => <span key={`${change.kind}:${index}`} className={`diff-${change.kind}`}>{change.kind === 'added' ? '+' : change.kind === 'removed' ? '-' : ' '} {change.text}{'\n'}</span>)}</pre>}</section>}
      <section className="guidance-audit"><h3>Pointer audit</h3>{history?.audit.length ? <ol>{history.audit.map(fact => <li key={fact.id}><strong>{fact.action.replace('_', ' ')}</strong> by {fact.actorDisplayName} · {fact.reason} <time>{new Date(fact.createdAt).toLocaleString()}</time></li>)}</ol> : <p>No pointer changes yet.</p>}</section>
      {scope === 'project' && projects.find(project => project.id === projectId)?.description && <div className="guidance-description-note"><strong>Project description (not Guidance)</strong><p>{projects.find(project => project.id === projectId)?.description}</p></div>}
    </>}
  </section>
}

function MentionPicker({ humans }: { humans: Human[] }) { return <label className="mentions">Mention people<select name="mentions" multiple aria-label="Mention people">{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select></label> }
type Milestone = { id: string; name: string; description: string | null; target_date: string | null; revision: number }
type WorkItemRelation = { id: string; source_work_item_id: string; target_work_item_id: string; kind: 'blocks' | 'related'; revision: number }

function WorkItemRelationships({ item, projectItems }: { item: WorkItem; projectItems: WorkItemDto[] }) {
  const relations = usePagedApiList<WorkItemRelation>(`/api/v1/work-items/${encodeURIComponent(item.id)}/relations`)
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
      formElement.reset(); await relations.refresh()
    } catch (reason) { setError(requestError(reason)) }
  }
  const remove = async (relation: WorkItemRelation) => {
    setError('')
    try {
      await apiRequest(`/api/v1/work-items/${encodeURIComponent(item.id)}/relations/${encodeURIComponent(relation.id)}`, { method: 'DELETE', headers: revisionHeader(relation.revision) })
      await relations.refresh()
    } catch (reason) {
      const notice = reason instanceof ApiError ? revisionConflictNotice(reason) : null
      if (notice) setConflict(notice); else setError(requestError(reason))
    }
  }
  return <section className="relationship-panel" aria-labelledby="relationships-heading">
    <header><div><span className="eyebrow">Dependencies</span><h3 id="relationships-heading">Blockers and related work</h3></div></header>
    {(error || relations.error) && <p className="error" role="alert">{error || relations.error?.message}</p>}
    {conflict && <aside className="conflict-notice" role="alert"><div><strong>{conflict.title}</strong><p>{conflict.action}</p></div><button onClick={() => { setConflict(null); void relations.refresh() }}>Reload relations</button></aside>}
    <div className="relation-list">{relations.items.map(relation => {
      const otherId = relation.source_work_item_id === item.id ? relation.target_work_item_id : relation.source_work_item_id
      const direction = relation.kind === 'related' ? 'Related to' : relation.source_work_item_id === item.id ? 'Blocks' : 'Blocked by'
      return <article key={relation.id}><span className={`relation-kind relation-${relation.kind}`}>{direction}</span><strong>{workLabel(otherId)}</strong><button onClick={() => void remove(relation)} type="button">Remove</button></article>
    })}{!relations.loading && relations.items.length === 0 && <p className="empty">No blockers or related Work Items.</p>}</div>
    <form className="relation-create" onSubmit={event => void add(event)}><label>Relationship<select name="kind"><option value="blocks">Blocks</option><option value="related">Related</option></select></label><label>Work Item<select name="targetWorkItemId" required defaultValue=""><option value="" disabled>Select Work Item</option>{projectItems.filter(candidate => candidate.id !== item.id).map(candidate => <option key={candidate.id} value={candidate.id}>{workLabel(candidate.id)}</option>)}</select></label><button disabled={projectItems.length < 2}>Add relationship</button></form>
    <LoadMoreButton collection={relations} label="relations" />
  </section>
}
