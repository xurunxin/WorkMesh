'use client'

import { type FormEvent, type ReactNode, useMemo, useState } from 'react'
import { Button } from '@workmesh/ui'
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'
import { FlagIcon } from '@phosphor-icons/react/dist/csr/Flag'
import { FloppyDiskIcon } from '@phosphor-icons/react/dist/csr/FloppyDisk'
import { HouseIcon } from '@phosphor-icons/react/dist/csr/House'
import { KanbanIcon } from '@phosphor-icons/react/dist/csr/Kanban'
import { ListBulletsIcon } from '@phosphor-icons/react/dist/csr/ListBullets'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { TrashSimpleIcon } from '@phosphor-icons/react/dist/csr/TrashSimple'
import { TrayIcon } from '@phosphor-icons/react/dist/csr/Tray'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { ApiError, apiRequest, json } from './lib/api'
import { useLocale } from './lib/i18n'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { useRealtimeSubscription } from './lib/realtime'
import {
  projectMilestoneIssuesHref,
  revisionConflictNotice,
  revisionScopedFormKey,
  summarizeProjectWork,
  type ProjectWorkspaceTab,
} from './lib/project-work'
import { ProjectDelivery } from './project-delivery'
import { ProjectControlCenter, projectControlCenterFeatureEnabled } from './project-control-center'
import { RichContent } from '../features/rich-content/markdown'
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
const projectControlCenterEnabled = projectControlCenterFeatureEnabled()

export function ProjectWorkspace({
  actor,
  project,
  items,
  tab,
  workSurface,
  onTabChange,
}: {
  actor?: Readonly<{ id: string; workspace_id?: string; workspace_role: 'admin' | 'member' }>
  project: Project
  items: WorkItemDto[]
  tab: ProjectWorkspaceTab
  workSurface: ReactNode
  onTabChange: (tab: ProjectWorkspaceTab) => void
}) {
  const { locale } = useLocale()
  const text = locale === 'zh-CN' ? {
    unknownStatus: '未知状态', overview: '概览', list: '列表', board: '看板', backlog: '待办', viewIssues: '查看 Issues', viewMilestoneIssues: (name: string) => `查看 ${name} Issues`, updateError: '无法更新项目计划。', deleteMilestone: (name: string) => `删除里程碑“${name}”？`, noBrief: '尚未发布项目简介。', complete: '已完成', progress: (completed: number, total: number) => `${completed} / ${total} 已完成`, projectSummary: '项目工作汇总', inProgress: '进行中', needsHuman: '需要负责人', activeAgents: '运行中的智能体', notSet: '未设置', targetDate: '目标日期', views: '项目视图', reloadMilestones: '重新加载里程碑', plan: '计划', roadmap: '里程碑路线图', cancel: '取消', addMilestone: '添加里程碑', name: '名称', description: '描述', createMilestone: '创建里程碑', target: '目标日期', save: '保存', delete: '删除', noMilestones: '尚无里程碑', noMilestonesHelp: '先定义成果与目标日期，再将 Issues 分配到该里程碑。', milestones: '里程碑', status: (status: string) => ({ in_progress: '进行中', planned: '已计划', completed: '已完成', canceled: '已取消' }[status] ?? status.replaceAll('_', ' ')),
  } : {
    unknownStatus: 'Unknown status', overview: 'Overview', list: 'List', board: 'Board', backlog: 'Backlog', viewIssues: 'View Issues', viewMilestoneIssues: (name: string) => `View ${name} Issues`, updateError: 'Unable to update the project plan.', deleteMilestone: (name: string) => `Delete milestone “${name}”?`, noBrief: 'No project brief has been published yet.', complete: 'complete', progress: (completed: number, total: number) => `${completed} of ${total} complete`, projectSummary: 'Project work summary', inProgress: 'In progress', needsHuman: 'Needs a responsible Human', activeAgents: 'Active Agent executors', notSet: 'Not set', targetDate: 'Target date', views: 'Project views', reloadMilestones: 'Reload milestones', plan: 'Plan', roadmap: 'Milestone roadmap', cancel: 'Cancel', addMilestone: 'Add milestone', name: 'Name', description: 'Description', createMilestone: 'Create milestone', target: 'Target', save: 'Save', delete: 'Delete', noMilestones: 'No milestones yet', noMilestonesHelp: 'Start with an outcome and target date; Work Items can then be assigned to it.', milestones: 'milestones', status: (status: string) => status.replaceAll('_', ' '),
  }
  const milestones = usePagedApiList<Milestone>(
    tab === 'list' || (tab === 'overview' && !projectControlCenterEnabled)
      ? `/api/v1/projects/${encodeURIComponent(project.id)}/milestones`
      : null,
  )
  const fallbackOverviewItems = usePagedApiList<WorkItemDto>(
    tab === 'overview' && !projectControlCenterEnabled
      ? `/api/v1/work-items?projectId=${encodeURIComponent(project.id)}&limit=200`
      : null,
  )
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<ReturnType<typeof revisionConflictNotice>>(null)
  useRealtimeSubscription([{ type: 'project', id: project.id }], invalidation => {
    if (invalidation.reason === 'resync' || [
      ...invalidation.event.scopes,
      ...invalidation.event.invalidates,
    ].some(resource => resource.type === 'project' && resource.id === project.id)) {
      void milestones.refresh()
      void fallbackOverviewItems.refresh()
    }
  })
  const projectItems = tab === 'overview' && !projectControlCenterEnabled ? fallbackOverviewItems.items : items
  const normalizedItems = useMemo<WorkItem[]>(() => projectItems.map(item => ({
    id: item.id,
    title: item.title,
    number: item.number ?? 0,
    team_key: item.team_key ?? '',
    priority: item.priority ?? 'none',
    status_name: item.status_name ?? item.statusName ?? text.unknownStatus,
    status_category: item.status_category ?? item.statusCategory ?? 'unknown',
    parent_id: item.parent_id ?? null,
    milestone_id: item.milestone_id ?? null,
    responsible_human: item.responsible_human?.display_name ? { actor_id: item.responsible_human.actor_id ?? '', display_name: item.responsible_human.display_name } : null,
    active_executor: (item.active_executor ?? item.active_assignment)?.agent_display_name
      ? {
          agent_display_name: (item.active_executor ?? item.active_assignment)?.agent_display_name ?? '',
          execution_state: item.active_executor?.execution_state ?? item.active_assignment?.session_state ?? 'assigned',
        }
      : null,
  })), [projectItems, text.unknownStatus])
  const summary = useMemo(() => summarizeProjectWork(normalizedItems), [normalizedItems])
  const tabs: Array<[ProjectWorkspaceTab, string, ReactNode]> = [
    ['overview', text.overview, <HouseIcon aria-hidden="true" size={16} weight="bold" />],
    ['list', text.list, <ListBulletsIcon aria-hidden="true" size={16} weight="bold" />],
    ['board', text.board, <KanbanIcon aria-hidden="true" size={16} weight="bold" />],
    ['backlog', text.backlog, <TrayIcon aria-hidden="true" size={16} weight="bold" />],
  ]

  const handleError = (reason: unknown) => {
    const notice = reason instanceof ApiError ? revisionConflictNotice(reason) : null
    if (notice) setConflict(notice)
    else setError(reason instanceof Error ? reason.message : text.updateError)
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
    if (!window.confirm(text.deleteMilestone(milestone.name))) return
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
    {(!projectControlCenterEnabled || tab !== 'overview') && <div className="project-plan-header">
      <div className="project-plan-copy">
        <span className="project-status">{text.status(project.status)}</span>
        <h2>{project.name}</h2>
        {project.description ? <RichContent density="document" source={project.description} /> : <p>{project.summary || text.noBrief}</p>}
      </div>
      <div className="project-progress" aria-label={`${summary.progressPercent}% ${text.complete}`}>
        <strong>{summary.progressPercent}%</strong>
        <span>{text.progress(summary.completed, summary.total)}</span>
        <progress max={100} value={summary.progressPercent} />
      </div>
    </div>}

    {(!projectControlCenterEnabled || tab !== 'overview') && <div className="project-metrics" aria-label={text.projectSummary}>
      <article><strong>{summary.inProgress}</strong><span>{text.inProgress}</span></article>
      <article><strong>{summary.withoutResponsibleHuman}</strong><span>{text.needsHuman}</span></article>
      <article><strong>{summary.activeAgents}</strong><span>{text.activeAgents}</span></article>
      <article><strong>{project.target_date ? dateValue(project.target_date) : text.notSet}</strong><span>{text.targetDate}</span></article>
    </div>}

    {(!projectControlCenterEnabled || tab !== 'overview') && <nav className="project-tabs" aria-label={text.views}>
      {tabs.map(([value, label, icon]) => <Button
        aria-current={tab === value ? 'page' : undefined}
        className={tab === value ? 'selected' : ''}
        data-testid={`project-tab-${value}`}
        icon={icon}
        key={value}
        onClick={() => onTabChange(value)}
        type="button"
        variant="ghost"
      >{label}{value === 'backlog' && <span>{items.filter(item => item.status_category === 'backlog').length}</span>}</Button>)}
    </nav>}

    {(error || milestones.error || fallbackOverviewItems.error) && <p className="error" role="alert">{error || milestones.error?.message || fallbackOverviewItems.error?.message}</p>}
    {conflict && <aside className="conflict-notice" role="alert" data-testid="milestone-conflict">
      <div><strong>{conflict.title}</strong><p>{conflict.action}</p></div>
      <Button icon={<ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="bold" />} onClick={() => { setConflict(null); void milestones.refresh() }} variant="secondary">{text.reloadMilestones}</Button>
    </aside>}

    {tab === 'overview' && projectControlCenterEnabled && <ProjectControlCenter actor={actor} project={project} onOpenWork={() => onTabChange('list')} />}

    {tab !== 'overview' && workSurface}

    {((tab === 'overview' && !projectControlCenterEnabled) || tab === 'list') && <div className="project-overview-grid project-plan-management">
      <section className="roadmap-panel" aria-labelledby="roadmap-heading">
        <header><div><span className="eyebrow">{text.plan}</span><h3 id="roadmap-heading">{text.roadmap}</h3></div><Button icon={creating ? <XIcon aria-hidden="true" size={16} /> : <PlusIcon aria-hidden="true" size={16} weight="bold" />} onClick={() => setCreating(value => !value)} variant="secondary">{creating ? text.cancel : text.addMilestone}</Button></header>
        {creating && <form className="milestone-create" onSubmit={event => void createMilestone(event)}>
          <label>{text.name}<input name="name" required maxLength={180} /></label>
          <label>{text.targetDate}<input name="targetDate" type="date" /></label>
          <label className="form-span">{text.description}<textarea name="description" maxLength={10000} /></label>
          <Button icon={<FlagIcon aria-hidden="true" size={16} weight="bold" />} type="submit" variant="primary">{text.createMilestone}</Button>
        </form>}
        <div className="milestone-timeline">
          {milestones.items.map((milestone, index) => {
            const milestoneItems = normalizedItems.filter(item => item.milestone_id === milestone.id)
            const complete = milestoneItems.filter(item => item.status_category === 'completed').length
            return <article className="milestone-card" key={revisionScopedFormKey(milestone)}>
              <span className="milestone-index">{String(index + 1).padStart(2, '0')}</span>
              <form onSubmit={event => void updateMilestone(milestone, event)}>
                <label>{text.name}<input name="name" defaultValue={milestone.name} required /></label>
                <label>{text.target}<input name="targetDate" type="date" defaultValue={dateValue(milestone.target_date)} /></label>
                <label className="form-span">{text.description}<input name="description" defaultValue={milestone.description ?? ''} /></label>
                <div className="milestone-actions"><span>{complete}/{milestoneItems.length} {text.complete}</span><a aria-label={text.viewMilestoneIssues(milestone.name)} className="wm-button wm-button-ghost" href={projectMilestoneIssuesHref(project.id, milestone.id)}>{text.viewIssues}</a><Button icon={<FloppyDiskIcon aria-hidden="true" size={16} />} type="submit" variant="ghost">{text.save}</Button><Button icon={<TrashSimpleIcon aria-hidden="true" size={16} />} onClick={() => void deleteMilestone(milestone)} type="button" variant="ghost">{text.delete}</Button></div>
              </form>
            </article>
          })}
          {!milestones.loading && milestones.items.length === 0 && <div className="empty-plan"><strong>{text.noMilestones}</strong><span>{text.noMilestonesHelp}</span></div>}
        </div>
        <LoadMoreButton collection={milestones} label={text.milestones} />
      </section>
      <ProjectDelivery projectId={project.id} />
    </div>}

  </section>
}
