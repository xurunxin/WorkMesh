'use client'

import { type FormEvent, type ReactNode, useMemo, useState } from 'react'
import { Button } from '@workmesh/ui'
import { ApiError, apiRequest, json } from './lib/api'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { useRealtimeSubscription } from './lib/realtime'
import {
  revisionConflictNotice,
  revisionScopedFormKey,
  summarizeProjectWork,
  type ProjectWorkspaceTab,
} from './lib/project-work'
import { ProjectDelivery } from './project-delivery'
import type { WorkItemDto } from '../features/work-items/contracts'

type Project = Readonly<{
  id: string
  name: string
  summary: string | null
  description: string | null
  status: string
  target_date: string | null
}>

type WorkItem = Readonly<{
  id: string
  title: string
  number: number
  team_key: string
  priority: string
  status_name: string
  status_category: string
  parent_id: string | null
  milestone_id: string | null
  responsible_human: { actor_id: string; display_name: string } | null
  active_executor: { agent_display_name: string; execution_state: string } | null
}>

type Milestone = Readonly<{
  id: string
  name: string
  description: string | null
  target_date: string | null
  revision: number
}>

const dateValue = (value: string | null): string => value ? value.slice(0, 10) : ''
const revisionHeaders = (revision: number): HeadersInit => ({
  ...json({}),
  'If-Match': `"revision-${revision}"`,
})

export function ProjectWorkspace({
  project,
  items,
  tab,
  workSurface,
  onTabChange,
}: {
  project: Project
  items: WorkItemDto[]
  tab: ProjectWorkspaceTab
  workSurface: ReactNode
  onTabChange: (tab: ProjectWorkspaceTab) => void
}) {
  const milestones = usePagedApiList<Milestone>(
    `/api/v1/projects/${encodeURIComponent(project.id)}/milestones`,
  )
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<ReturnType<typeof revisionConflictNotice>>(null)
  useRealtimeSubscription([{ type: 'project', id: project.id }], invalidation => {
    if (invalidation.reason === 'resync' || [
      ...invalidation.event.scopes,
      ...invalidation.event.invalidates,
    ].some(resource => resource.type === 'project' && resource.id === project.id))
      return milestones.refresh()
  })
  const normalizedItems = useMemo<WorkItem[]>(() => items.map(item => ({
    id: item.id,
    title: item.title,
    number: item.number ?? 0,
    team_key: item.team_key ?? '',
    priority: item.priority ?? 'none',
    status_name: item.status_name ?? item.statusName ?? 'Unknown status',
    status_category: item.status_category ?? item.statusCategory ?? 'unknown',
    parent_id: item.parent_id ?? null,
    milestone_id: item.milestone_id ?? null,
    responsible_human: item.responsible_human?.display_name ? { actor_id: item.responsible_human.actor_id ?? '', display_name: item.responsible_human.display_name } : null,
    active_executor: item.active_executor?.agent_display_name ? { agent_display_name: item.active_executor.agent_display_name, execution_state: item.active_executor.execution_state ?? 'unknown' } : null,
  })), [items])
  const summary = useMemo(() => summarizeProjectWork(normalizedItems), [normalizedItems])
  const tabs: Array<[ProjectWorkspaceTab, string]> = [
    ['overview', 'Overview'],
    ['list', 'List'],
    ['board', 'Board'],
    ['backlog', 'Backlog'],
  ]

  const handleError = (reason: unknown) => {
    const notice = reason instanceof ApiError ? revisionConflictNotice(reason) : null
    if (notice) setConflict(notice)
    else setError(reason instanceof Error ? reason.message : 'Unable to update the project plan.')
  }
  const createMilestone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setError('')
    try {
      await apiRequest(`/api/v1/projects/${encodeURIComponent(project.id)}/milestones`, {
        method: 'POST',
        headers: json({}),
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          description: String(form.get('description') ?? '') || undefined,
          targetDate: String(form.get('targetDate') ?? '') || undefined,
        }),
      })
      formElement.reset()
      setCreating(false)
      await milestones.refresh()
    } catch (reason) { handleError(reason) }
  }
  const updateMilestone = async (milestone: Milestone, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')
    try {
      await apiRequest(`/api/v1/milestones/${encodeURIComponent(milestone.id)}`, {
        method: 'PATCH',
        headers: revisionHeaders(milestone.revision),
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          description: String(form.get('description') ?? '') || null,
          targetDate: String(form.get('targetDate') ?? '') || null,
        }),
      })
      await milestones.refresh()
    } catch (reason) { handleError(reason) }
  }
  const deleteMilestone = async (milestone: Milestone) => {
    if (!window.confirm(`Delete milestone “${milestone.name}”?`)) return
    setError('')
    try {
      await apiRequest(`/api/v1/milestones/${encodeURIComponent(milestone.id)}`, {
        method: 'DELETE',
        headers: revisionHeaders(milestone.revision),
      })
      await milestones.refresh()
    } catch (reason) { handleError(reason) }
  }

  return <section className={`project-workspace project-tab-${tab}`} data-testid="project-workspace">
    <div className="project-plan-header">
      <div className="project-plan-copy">
        <span className="project-status">{project.status.replaceAll('_', ' ')}</span>
        <h2>{project.name}</h2>
        <p>{project.description || project.summary || 'No project brief has been published yet.'}</p>
      </div>
      <div className="project-progress" aria-label={`${summary.progressPercent}% complete`}>
        <strong>{summary.progressPercent}%</strong>
        <span>{summary.completed} of {summary.total} complete</span>
        <progress max={100} value={summary.progressPercent} />
      </div>
    </div>

    <div className="project-metrics" aria-label="Project work summary">
      <article><strong>{summary.inProgress}</strong><span>In progress</span></article>
      <article><strong>{summary.withoutResponsibleHuman}</strong><span>Needs a responsible Human</span></article>
      <article><strong>{summary.activeAgents}</strong><span>Active Agent executors</span></article>
      <article><strong>{project.target_date ? dateValue(project.target_date) : 'Not set'}</strong><span>Target date</span></article>
    </div>

    <nav className="project-tabs" aria-label="Project views">
      {tabs.map(([value, label]) => <button
        aria-current={tab === value ? 'page' : undefined}
        className={tab === value ? 'selected' : ''}
        data-testid={`project-tab-${value}`}
        key={value}
        onClick={() => onTabChange(value)}
        type="button"
      >{label}{value === 'backlog' && <span>{items.filter(item => item.status_category === 'backlog').length}</span>}</button>)}
    </nav>

    {(error || milestones.error) && <p className="error" role="alert">{error || milestones.error?.message}</p>}
    {conflict && <aside className="conflict-notice" role="alert" data-testid="milestone-conflict">
      <div><strong>{conflict.title}</strong><p>{conflict.action}</p></div>
      <Button onClick={() => { setConflict(null); void milestones.refresh() }} variant="secondary">Reload milestones</Button>
    </aside>}

    {tab === 'overview' && <div className="project-overview-grid">
      <section className="roadmap-panel" aria-labelledby="roadmap-heading">
        <header><div><span className="eyebrow">Plan</span><h3 id="roadmap-heading">Milestone roadmap</h3></div><Button onClick={() => setCreating(value => !value)} variant="secondary">{creating ? 'Cancel' : 'Add milestone'}</Button></header>
        {creating && <form className="milestone-create" onSubmit={event => void createMilestone(event)}>
          <label>Name<input name="name" required maxLength={180} /></label>
          <label>Target date<input name="targetDate" type="date" /></label>
          <label className="form-span">Description<textarea name="description" maxLength={10000} /></label>
          <Button type="submit" variant="primary">Create milestone</Button>
        </form>}
        <div className="milestone-timeline">
          {milestones.items.map((milestone, index) => {
            const milestoneItems = normalizedItems.filter(item => item.milestone_id === milestone.id)
            const complete = milestoneItems.filter(item => item.status_category === 'completed').length
            return <article className="milestone-card" key={revisionScopedFormKey(milestone)}>
              <span className="milestone-index">{String(index + 1).padStart(2, '0')}</span>
              <form onSubmit={event => void updateMilestone(milestone, event)}>
                <label>Name<input name="name" defaultValue={milestone.name} required /></label>
                <label>Target<input name="targetDate" type="date" defaultValue={dateValue(milestone.target_date)} /></label>
                <label className="form-span">Description<input name="description" defaultValue={milestone.description ?? ''} /></label>
                <div className="milestone-actions"><span>{complete}/{milestoneItems.length} complete</span><Button type="submit" variant="ghost">Save</Button><Button onClick={() => void deleteMilestone(milestone)} type="button" variant="ghost">Delete</Button></div>
              </form>
            </article>
          })}
          {!milestones.loading && milestones.items.length === 0 && <div className="empty-plan"><strong>No milestones yet</strong><span>Start with an outcome and target date; Work Items can then be assigned to it.</span></div>}
        </div>
        <LoadMoreButton collection={milestones} label="milestones" />
      </section>
      <ProjectDelivery projectId={project.id} />
    </div>}

    {workSurface}
  </section>
}
