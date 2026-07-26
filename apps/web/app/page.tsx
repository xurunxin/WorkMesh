'use client'

import { type DragEvent, type FormEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiBase, apiRequest, clearCsrfToken, json, publicRequest, saveCsrfToken } from './lib/api'
import { AgentWorkPanel } from './agent-work-panel'
import { type AgentSession, optionalAgentRequest } from './lib/agents'
import { InboxPanel, WorkRoom } from './work-room'
import { ProjectDelivery } from './project-delivery'

type Actor = { id: string; displayName: string }
type AuthMe = { actor: Actor; csrfToken: string }
type InstallStatus = { installed: boolean }
type Team = { id: string; name: string; key: string; revision: number }
type StatusCategory = 'backlog' | 'planned' | 'started' | 'completed' | 'canceled'
type WorkflowState = { id: string; name: string; category: StatusCategory; color: string; revision: number }
type Human = { id: string; display_name: string; email: string }
type Project = { id: string; team_id: string; name: string; summary: string | null; description: string | null; status: string; lead_actor_id: string | null; target_date: string | null; revision: number }
type WorkItem = { id: string; title: string; description: string | null; number: number; revision: number; status_id: string; status_name: string; status_category: StatusCategory; team_id: string; team_key: string; priority: Priority; due_date: string | null; responsible_human_actor_id: string | null; labels: string[]; project_id: string | null }
type Comment = { id: string; body: string; revision: number; parent_comment_id: string | null; reply_to_comment_id: string | null; author_name: string; is_resolved: boolean; created_at: string; mentions: string[] }
type SavedView = { id: string; name: string; team_id?: string | null; filters: Filters; layout: Layout; builtIn?: boolean }
type Scope = 'my-work' | 'active' | 'backlog' | 'inbox' | 'projects'
type Layout = 'list' | 'board'
type Priority = 'none' | 'urgent' | 'high' | 'medium' | 'low'
type Filters = { search?: string; statusId?: string; priority?: Priority; ownerId?: string; projectId?: string; label?: string; statusCategory?: StatusCategory; mine?: boolean }

const dateValue = (value: string | null): string => value ? value.slice(0, 10) : ''
const requestError = (reason: unknown): string => reason instanceof Error ? reason.message : 'Something went wrong.'
const revisionHeader = (revision: number): HeadersInit => ({ ...json({}), 'If-Match': `"revision-${revision}"` })
const emptyFilters: Filters = {}

function toQuery(teamId: string | undefined, filters: Filters): string {
  const params = new URLSearchParams()
  if (teamId) params.set('teamId', teamId)
  if (filters.search) params.set('search', filters.search)
  if (filters.statusId) params.set('statusId', filters.statusId)
  if (filters.priority) params.set('priority', filters.priority)
  if (filters.ownerId) params.set('ownerId', filters.ownerId)
  if (filters.projectId) params.set('projectId', filters.projectId)
  if (filters.label) params.set('label', filters.label)
  if (filters.statusCategory) params.set('statusCategory', filters.statusCategory)
  if (filters.mine) params.set('mine', 'true')
  const value = params.toString()
  return value ? `?${value}` : ''
}

export default function HomePage() {
  const [actor, setActor] = useState<Actor | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState<string | null>(null)
  const [states, setStates] = useState<WorkflowState[]>([])
  const [humans, setHumans] = useState<Human[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [items, setItems] = useState<WorkItem[]>([])
  const [views, setViews] = useState<SavedView[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [scope, setScope] = useState<Scope>('my-work')
  const [layout, setLayout] = useState<Layout>('list')
  const [filters, setFilters] = useState<Filters>({ mine: true })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const selectedTeam = teams.find(team => team.id === teamId) ?? null
  const teamProjects = useMemo(() => projects.filter(project => project.team_id === selectedTeam?.id), [projects, selectedTeam?.id])
  const query = useMemo(() => toQuery(selectedTeam?.id, filters), [filters, selectedTeam?.id])

  const loadComments = useCallback(async (workItemId: string) => {
    setComments(await apiRequest<Comment[]>(`/api/v1/work-items/${workItemId}/comments`))
  }, [])

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
      const nextTeams = await apiRequest<Team[]>('/api/v1/teams')
      setTeams(nextTeams)
      const nextTeamId = nextTeams.some(team => team.id === teamId) ? teamId : nextTeams[0]?.id ?? null
      if (nextTeamId !== teamId) setTeamId(nextTeamId)
      const currentQuery = toQuery(nextTeamId ?? undefined, filters)
      const [nextHumans, nextProjects, nextItems, nextViews, nextStates] = await Promise.all([
        apiRequest<Human[]>(`/api/v1/actors/humans${nextTeamId ? `?teamId=${encodeURIComponent(nextTeamId)}` : ''}`),
        apiRequest<Project[]>('/api/v1/projects'),
        apiRequest<WorkItem[]>(`/api/v1/work-items${currentQuery}`),
        apiRequest<SavedView[]>(`/api/v1/views${nextTeamId ? `?teamId=${encodeURIComponent(nextTeamId)}` : ''}`),
        nextTeamId ? apiRequest<WorkflowState[]>(`/api/v1/teams/${nextTeamId}/states`) : Promise.resolve([]),
      ])
      setHumans(nextHumans)
      setProjects(nextProjects)
      setItems(nextItems)
      setViews(nextViews)
      setStates(nextStates)
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
  }, [filters, teamId])

  useEffect(() => { void load() }, [load])
  const loadRef = useRef(load)
  const selectedItemRef = useRef(selectedItem)
  useEffect(() => { loadRef.current = load }, [load])
  useEffect(() => { selectedItemRef.current = selectedItem }, [selectedItem])

  useEffect(() => {
    if (!actor) return
    let refreshTimer: number | undefined
    const storedCursor = window.localStorage.getItem('workmesh.events.cursor')
    const cursor = storedCursor ? `?cursor=${encodeURIComponent(storedCursor)}` : ''
    const stream = new EventSource(`${apiBase}/api/v1/events/stream${cursor}`, { withCredentials: true })
    stream.onmessage = event => {
      try {
        const payload = JSON.parse(event.data) as { cursor?: number }
        const nextCursor = payload.cursor ?? Number(event.lastEventId)
        if (Number.isSafeInteger(nextCursor) && nextCursor >= 0) window.localStorage.setItem('workmesh.events.cursor', String(nextCursor))
      } catch { /* The subsequent durable refetch still establishes the current state. */ }
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        void loadRef.current()
        const openItem = selectedItemRef.current
        if (openItem) {
          void apiRequest<WorkItem>(`/api/v1/work-items/${openItem.id}`).then(setSelectedItem)
          void loadComments(openItem.id)
        }
      }, 150)
    }
    return () => { if (refreshTimer !== undefined) window.clearTimeout(refreshTimer); stream.close() }
  }, [actor?.id, loadComments])

  const chooseTeam = (nextTeamId: string) => {
    setTeamId(nextTeamId)
    setFilters(emptyFilters)
    setSelectedItem(null)
    setSelectedProject(null)
    setComments([])
  }
  const chooseScope = (nextScope: Scope) => {
    setScope(nextScope)
    setSelectedProject(null)
    setSelectedItem(null)
    setComments([])
    if (nextScope === 'my-work') setFilters({ mine: true })
    else if (nextScope === 'active') { setFilters({ statusCategory: 'started' }); setLayout('board') }
    else if (nextScope === 'backlog') setFilters({ statusCategory: 'backlog' })
    else setFilters(emptyFilters)
  }
  const openItem = async (id: string) => {
    try { setError(''); const item = await apiRequest<WorkItem>(`/api/v1/work-items/${id}`); setSelectedItem(item); await loadComments(id) } catch (reason) { setError(requestError(reason)) }
  }
  const openProject = async (id: string) => {
    try {
      setError('')
      setScope('projects')
      setSelectedItem(null)
      setComments([])
      const project = await apiRequest<Project>(`/api/v1/projects/${id}`)
      setSelectedProject(project)
      setFilters(current => ({ ...current, projectId: project.id }))
    } catch (reason) { setError(requestError(reason)) }
  }
  const createTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      const team = await apiRequest<Team>('/api/v1/teams', { method: 'POST', headers: json({}), body: JSON.stringify({ name: String(form.get('name') ?? ''), key: String(form.get('key') ?? '').toUpperCase() }) })
      formElement.reset(); setTeamId(team.id); setFilters(emptyFilters); await load()
    } catch (reason) { setError(requestError(reason)) }
  }
  const updateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTeam) return
    const form = new FormData(event.currentTarget)
    try {
      await apiRequest(`/api/v1/teams/${selectedTeam.id}`, { method: 'PATCH', headers: revisionHeader(selectedTeam.revision), body: JSON.stringify({ name: String(form.get('name') ?? ''), key: String(form.get('key') ?? '').toUpperCase() }) })
      await load()
    } catch (reason) { setError(requestError(reason)) }
  }
  const deleteTeam = async () => {
    if (!selectedTeam || !window.confirm(`Delete team ${selectedTeam.name}? Its work remains unavailable after this action.`)) return
    try {
      const removedId = selectedTeam.id
      await apiRequest(`/api/v1/teams/${removedId}`, { method: 'DELETE', headers: { 'If-Match': `"revision-${selectedTeam.revision}"` } })
      const next = teams.find(team => team.id !== removedId) ?? null
      setTeamId(next?.id ?? null); setFilters(emptyFilters); setSelectedItem(null); setSelectedProject(null); await load()
    } catch (reason) { setError(requestError(reason)) }
  }
  const createState = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTeam) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      await apiRequest(`/api/v1/teams/${selectedTeam.id}/states`, { method: 'POST', headers: json({}), body: JSON.stringify({ name: String(form.get('name') ?? ''), category: form.get('category'), color: form.get('color') || undefined, position: states.length }) })
      formElement.reset(); await load()
    } catch (reason) { setError(requestError(reason)) }
  }
  const createWorkItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTeam || !actor) return
    const formElement = event.currentTarget; const form = new FormData(formElement); const state = states.find(candidate => candidate.id === form.get('statusId'))
    try {
      await apiRequest('/api/v1/work-items', { method: 'POST', headers: json({}), body: JSON.stringify({ teamId: selectedTeam.id, title: String(form.get('title') ?? ''), description: String(form.get('description') ?? '') || undefined, statusId: form.get('statusId'), priority: form.get('priority'), dueDate: String(form.get('dueDate') ?? '') || undefined, responsibleHumanActorId: String(form.get('ownerId') ?? '') || (state?.category === 'started' ? actor.id : undefined), projectId: String(form.get('projectId') ?? '') || undefined, labels: String(form.get('labels') ?? '').split(',').map(label => label.trim()).filter(Boolean) }) })
      formElement.reset(); await load()
    } catch (reason) { setError(requestError(reason)) }
  }
  const moveItem = async (item: WorkItem, state: WorkflowState) => {
    if (!actor) return
    try {
      await apiRequest(`/api/v1/work-items/${item.id}`, { method: 'PATCH', headers: revisionHeader(item.revision), body: JSON.stringify({ statusId: state.id, responsibleHumanActorId: state.category === 'started' ? item.responsible_human_actor_id ?? actor.id : item.responsible_human_actor_id }) })
      await load(); if (selectedItem?.id === item.id) await openItem(item.id)
    } catch (reason) { setError(requestError(reason)) }
  }
  const saveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedItem || !actor) return
    const form = new FormData(event.currentTarget); const state = states.find(candidate => candidate.id === form.get('statusId'))
    try {
      await apiRequest(`/api/v1/work-items/${selectedItem.id}`, { method: 'PATCH', headers: revisionHeader(selectedItem.revision), body: JSON.stringify({ title: String(form.get('title') ?? ''), description: String(form.get('description') ?? '') || null, statusId: form.get('statusId'), priority: form.get('priority'), dueDate: String(form.get('dueDate') ?? '') || null, responsibleHumanActorId: String(form.get('ownerId') ?? '') || (state?.category === 'started' ? actor.id : null), projectId: String(form.get('projectId') ?? '') || null, labels: String(form.get('labels') ?? '').split(',').map(label => label.trim()).filter(Boolean) }) })
      await load(); await openItem(selectedItem.id)
    } catch (reason) { setError(requestError(reason)) }
  }
  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTeam) return
    const formElement = event.currentTarget; const form = new FormData(formElement)
    try {
      const project = await apiRequest<{ id: string }>('/api/v1/projects', { method: 'POST', headers: json({}), body: JSON.stringify({ teamId: selectedTeam.id, name: String(form.get('name') ?? ''), summary: String(form.get('summary') ?? '') || undefined, description: String(form.get('description') ?? '') || undefined, leadActorId: String(form.get('leadActorId') ?? '') || null, targetDate: String(form.get('targetDate') ?? '') || null }) })
      formElement.reset(); await load(); await openProject(project.id)
    } catch (reason) { setError(requestError(reason)) }
  }
  const createComment = async (event: FormEvent<HTMLFormElement>, parentCommentId?: string) => {
    event.preventDefault()
    if (!selectedItem) return
    const formElement = event.currentTarget; const form = new FormData(formElement)
    try {
      await apiRequest(`/api/v1/work-items/${selectedItem.id}/comments`, { method: 'POST', headers: json({}), body: JSON.stringify({ body: String(form.get('body') ?? ''), parentCommentId, mentions: form.getAll('mentions').map(String) }) })
      formElement.reset(); await loadComments(selectedItem.id)
    } catch (reason) { setError(requestError(reason)) }
  }
  const updateComment = async (comment: Comment, patch: Record<string, string | boolean>) => {
    if (!selectedItem) return
    try { await apiRequest(`/api/v1/comments/${comment.id}`, { method: 'PATCH', headers: revisionHeader(comment.revision), body: JSON.stringify(patch) }); await loadComments(selectedItem.id) } catch (reason) { setError(requestError(reason)) }
  }
  const createSavedView = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget; const form = new FormData(formElement)
    try {
      await apiRequest('/api/v1/views', { method: 'POST', headers: json({}), body: JSON.stringify({ name: String(form.get('name') ?? ''), teamId: selectedTeam?.id, filters, layout }) })
      formElement.reset(); await load()
    } catch (reason) { setError(requestError(reason)) }
  }
  const applyView = (viewId: string) => {
    const view = views.find(candidate => candidate.id === viewId)
    if (!view) return
    if (view.team_id) setTeamId(view.team_id)
    setFilters(view.filters ?? emptyFilters); setLayout(view.layout); setSelectedProject(null); setSelectedItem(null); setComments([])
  }
  const signOut = async () => { try { await apiRequest('/api/v1/auth/logout', { method: 'POST', headers: json({}) }) } catch { /* Cookie may already be expired. */ }; clearCsrfToken(); window.location.assign('/login') }

  if (loading) return <main className="center" data-testid="loading">Loading WorkMesh...</main>
  if (!actor) return <main className="center" data-testid="load-error"><p className="error">{error || 'Unable to load WorkMesh.'}</p><button onClick={() => void load()}>Retry</button></main>
  const pageTitle = scope === 'inbox' ? 'Inbox' : selectedProject ? selectedProject.name : scope === 'projects' ? 'Projects' : scope === 'my-work' ? 'My Work' : scope === 'active' ? 'Active work' : 'Backlog'
  return <main className="shell">
    <a className="operations-shortcut" data-testid="view-operations" href="/operations">Planning &amp; Operations</a>
    <aside aria-label="Main navigation"><h1>WorkMesh</h1><small>{actor.displayName}</small><label className="team-switcher">Team<select aria-label="Current team" value={selectedTeam?.id ?? ''} onChange={event => chooseTeam(event.currentTarget.value)}><option value="" disabled>No team</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name} ({team.key})</option>)}</select></label><nav><button data-testid="view-inbox" className={scope === 'inbox' ? 'selected' : ''} onClick={() => chooseScope('inbox')}>Inbox <span className="placeholder">Soon</span></button><button data-testid="view-my-work" className={scope === 'my-work' ? 'selected' : ''} onClick={() => chooseScope('my-work')}>My Work</button><button data-testid="view-active" className={scope === 'active' ? 'selected' : ''} onClick={() => chooseScope('active')}>Active</button><button data-testid="view-backlog" className={scope === 'backlog' ? 'selected' : ''} onClick={() => chooseScope('backlog')}>Backlog</button><button data-testid="view-projects" className={scope === 'projects' ? 'selected' : ''} onClick={() => chooseScope('projects')}>Projects</button><a data-testid="view-agents" href="/agents">Agents</a></nav><details className="team-admin"><summary>Team settings</summary><form onSubmit={createTeam}><input name="name" placeholder="New team name" required /><input name="key" placeholder="Key (e.g. ENG)" pattern="[A-Z][A-Z0-9]{1,9}" required /><button>Create team</button></form>{selectedTeam && <><form onSubmit={updateTeam}><input name="name" defaultValue={selectedTeam.name} required /><input name="key" defaultValue={selectedTeam.key} pattern="[A-Z][A-Z0-9]{1,9}" required /><button>Save team</button></form><button className="danger" onClick={() => void deleteTeam()}>Delete team</button><form onSubmit={createState}><input name="name" placeholder="New workflow status" required /><select name="category" defaultValue="planned"><option value="backlog">Backlog</option><option value="planned">Planned</option><option value="started">Started</option><option value="completed">Completed</option><option value="canceled">Canceled</option></select><input name="color" type="color" defaultValue="#64748b" /><button>Create status</button></form></>}</details><footer><button data-testid="logout" onClick={() => void signOut()}>Sign out</button></footer></aside>
    <section className="content"><header><div><h2>{pageTitle}</h2>{selectedProject && <p>{selectedProject.summary || 'Project overview'}</p>}</div><div className="layout-toggle" aria-label="Layout"><button className={layout === 'list' ? 'selected' : ''} data-testid="layout-list" onClick={() => setLayout('list')}>List</button><button className={layout === 'board' ? 'selected' : ''} data-testid="layout-board" onClick={() => setLayout('board')}>Board</button></div></header>{error && <p className="error" role="alert">{error}</p>}
      {scope === 'inbox' ? <InboxPanel /> : <>{selectedTeam ? <><FilterBar filters={filters} states={states} humans={humans} projects={teamProjects} views={views.filter(view => !view.team_id || view.team_id === selectedTeam.id)} onChange={setFilters} onClear={() => { setFilters(emptyFilters); setSelectedProject(null) }} onApplyView={applyView} onCreateView={createSavedView} />
        {scope === 'projects' && <><section className="project-strip" aria-label="Projects">{teamProjects.map(project => <button key={project.id} data-testid={`project-${project.id}`} className={selectedProject?.id === project.id ? 'selected' : ''} onClick={() => void openProject(project.id)}>{project.name}</button>)}{teamProjects.length === 0 && <span className="empty">No projects yet.</span>}</section>{selectedProject && <><section className="project-overview" data-testid="project-overview"><strong>{selectedProject.status}</strong>{selectedProject.target_date && <span>Target: {dateValue(selectedProject.target_date)}</span>}{selectedProject.description && <p>{selectedProject.description}</p>}</section><ProjectDelivery projectId={selectedProject.id} /></>}<form className="project-form" onSubmit={createProject} data-testid="create-project"><input name="name" placeholder="Project name" required /><input name="summary" placeholder="Summary" /><input name="targetDate" type="date" /><select name="leadActorId"><option value="">No lead</option>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select><textarea name="description" placeholder="Project description" /><button>Create project</button></form></>}
        <form className="work-form" onSubmit={createWorkItem} data-testid="create-work-item"><input name="title" placeholder="Title" required /><textarea name="description" placeholder="Description" /><select name="statusId" required>{states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}</select><select name="priority"><option value="none">No priority</option><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><input name="dueDate" type="date" aria-label="Due date" /><select name="ownerId"><option value="">Unassigned</option>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select><select name="projectId"><option value="">No project</option>{teamProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select><input name="labels" placeholder="labels, comma separated" /><button disabled={!states[0]} data-testid="create-work-item-submit">Create work item</button></form>{layout === 'list' ? <WorkList items={items} onOpen={openItem} /> : <WorkBoard states={states} items={items} onOpen={openItem} onMove={moveItem} />}</> : <section className="empty">Create a team to start tracking work.</section>}</>}</section>
    {selectedItem && <WorkItemDrawer key={`${selectedItem.id}:${selectedItem.revision}`} item={selectedItem} humanActorId={actor.id} states={states} humans={humans} projects={teamProjects} comments={comments} onClose={() => { setSelectedItem(null); setComments([]) }} onSave={saveItem} onComment={createComment} onUpdateComment={updateComment} />}
  </main>
}

function FilterBar({ filters, states, humans, projects, views, onChange, onClear, onApplyView, onCreateView }: { filters: Filters; states: WorkflowState[]; humans: Human[]; projects: Project[]; views: SavedView[]; onChange: (filters: Filters) => void; onClear: () => void; onApplyView: (id: string) => void; onCreateView: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <section className="filters" aria-label="Work item filters"><input aria-label="Search work" value={filters.search ?? ''} onChange={event => onChange({ ...filters, search: event.currentTarget.value || undefined })} placeholder="Search title or identifier" /><select aria-label="Filter status" value={filters.statusId ?? ''} onChange={event => onChange({ ...filters, statusId: event.currentTarget.value || undefined })}><option value="">All statuses</option>{states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}</select><select aria-label="Filter priority" value={filters.priority ?? ''} onChange={event => onChange({ ...filters, priority: event.currentTarget.value as Priority || undefined })}><option value="">All priorities</option>{['none', 'urgent', 'high', 'medium', 'low'].map(priority => <option key={priority} value={priority}>{priority}</option>)}</select><select aria-label="Filter owner" value={filters.ownerId ?? ''} onChange={event => onChange({ ...filters, ownerId: event.currentTarget.value || undefined, mine: undefined })}><option value="">All owners</option>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select><select aria-label="Filter project" value={filters.projectId ?? ''} onChange={event => onChange({ ...filters, projectId: event.currentTarget.value || undefined })}><option value="">All projects</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select><input aria-label="Filter label" value={filters.label ?? ''} onChange={event => onChange({ ...filters, label: event.currentTarget.value || undefined })} placeholder="Label" /><button onClick={onClear}>Clear filters</button><select aria-label="Saved views" defaultValue="" onChange={event => { if (event.currentTarget.value) onApplyView(event.currentTarget.value); event.currentTarget.value = '' }}><option value="">Open saved view</option>{views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select><form onSubmit={event => void onCreateView(event)} className="save-view"><input name="name" placeholder="Save current view" required /><button>Save view</button></form></section>
}

function WorkList({ items, onOpen }: { items: WorkItem[]; onOpen: (id: string) => Promise<void> }) { if (items.length === 0) return <section className="empty" data-testid="work-items-empty">No work items match this view.</section>; return <section className="list" data-testid="work-list">{items.map(item => <button key={item.id} data-testid={`work-${item.id}`} onClick={() => void onOpen(item.id)}><span>{item.team_key}-{item.number}</span><strong>{item.title}</strong><em>{item.status_name}</em></button>)}</section> }

function WorkBoard({ states, items, onOpen, onMove }: { states: WorkflowState[]; items: WorkItem[]; onOpen: (id: string) => Promise<void>; onMove: (item: WorkItem, state: WorkflowState) => Promise<void> }) {
  const draggedItemId = useRef<string | null>(null); const [pointerItemId, setPointerItemId] = useState<string | null>(null)
  const beginDrag = (itemId: string, event: DragEvent<HTMLElement>) => { draggedItemId.current = itemId; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', itemId) }
  const drop = (state: WorkflowState, event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const itemId = event.dataTransfer.getData('text/plain') || draggedItemId.current; draggedItemId.current = null; setPointerItemId(null); const item = items.find(candidate => candidate.id === itemId); if (item && item.status_id !== state.id) void onMove(item, state) }
  const endDrag = (item: WorkItem, event: DragEvent<HTMLElement>) => { const activeItemId = draggedItemId.current; draggedItemId.current = null; setPointerItemId(null); if (activeItemId !== item.id) return; const column = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-workflow-state-id]'); const state = states.find(candidate => candidate.id === column?.dataset.workflowStateId); if (state && item.status_id !== state.id) void onMove(item, state) }
  const pointerDown = (itemId: string, _event: PointerEvent<HTMLElement>) => { draggedItemId.current = itemId; setPointerItemId(itemId) }
  const pointerUp = (state: WorkflowState) => { const activeItemId = pointerItemId ?? draggedItemId.current; const item = items.find(candidate => candidate.id === activeItemId); draggedItemId.current = null; setPointerItemId(null); if (item && item.status_id !== state.id) void onMove(item, state) }
  return <section className="board" data-testid="board">{states.map(state => <div key={state.id} data-testid={`column-${state.id}`} data-workflow-state-id={state.id} onDragOver={event => event.preventDefault()} onDrop={event => drop(state, event)} onPointerUp={() => pointerUp(state)}><h3>{state.name}</h3>{items.filter(item => item.status_id === state.id).map(item => <article key={item.id} data-testid={`work-${item.id}`} draggable onDragStart={event => beginDrag(item.id, event)} onDragEnd={event => endDrag(item, event)} onPointerDown={event => pointerDown(item.id, event)} onClick={() => { if (!pointerItemId) void onOpen(item.id) }}><span>{item.team_key}-{item.number}</span><strong>{item.title}</strong><small>{item.priority}</small><select aria-label={`Move ${item.title}`} value={item.status_id} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onChange={event => { const target = states.find(candidate => candidate.id === event.currentTarget.value); if (target) void onMove(item, target) }}>{states.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}</select></article>)}<p className="drop-hint">Drop work here</p></div>)}</section>
}

function MentionPicker({ humans }: { humans: Human[] }) { return <label className="mentions">Mention people<select name="mentions" multiple aria-label="Mention people">{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select></label> }
function WorkItemDrawer({ item, humanActorId, states, humans, projects, comments, onClose, onSave, onComment, onUpdateComment }: { item: WorkItem; humanActorId: string; states: WorkflowState[]; humans: Human[]; projects: Project[]; comments: Comment[]; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>; onComment: (event: FormEvent<HTMLFormElement>, parentCommentId?: string) => Promise<void>; onUpdateComment: (comment: Comment, patch: Record<string, string | boolean>) => Promise<void> }) {
  const [sessions, setSessions] = useState<AgentSession[]>([])
  useEffect(() => { void optionalAgentRequest<AgentSession[]>(`/api/v1/agent-sessions?workItemId=${encodeURIComponent(item.id)}`).then(value => setSessions(value ?? [])).catch(() => setSessions([])) }, [item.id])
  return <aside className="drawer" aria-label="Work item details" data-testid="work-item-drawer"><header><h2>{item.team_key}-{item.number}</h2><button onClick={onClose}>Close</button></header><form onSubmit={event => void onSave(event)}><label>Title<input name="title" defaultValue={item.title} required /></label><label>Description<textarea name="description" defaultValue={item.description ?? ''} /></label><div className="drawer-grid"><label>Status<select name="statusId" defaultValue={item.status_id}>{states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label><label>Priority<select name="priority" defaultValue={item.priority}>{['none', 'urgent', 'high', 'medium', 'low'].map(priority => <option key={priority} value={priority}>{priority}</option>)}</select></label><label>Due date<input name="dueDate" type="date" defaultValue={dateValue(item.due_date)} /></label><label>Owner<select name="ownerId" defaultValue={item.responsible_human_actor_id ?? ''}><option value="">Unassigned</option>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select></label><label>Project<select name="projectId" defaultValue={item.project_id ?? ''}><option value="">No project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Labels<input name="labels" defaultValue={item.labels.join(', ')} /></label></div><button data-testid="save-work-item">Save changes</button></form>
    <WorkRoom workItemId={item.id} legacyComments={comments} legacyHumans={humans} onLegacyComment={onComment} onLegacyUpdate={onUpdateComment} />
    <AgentWorkPanel workItemId={item.id} workItemTeamId={item.team_id} workItemRevision={item.revision} humanActorId={humanActorId} onSessionCreated={session => setSessions(current => [session, ...current])} /></aside>
}
