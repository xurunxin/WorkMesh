'use client'

import type { ReactNode } from 'react'
import type { WorkItemDto } from '../features/work-items/contracts'
import { ProjectControlCenter } from './project-control-center'
import type { ProjectWorkspaceTab } from './lib/project-work'

type Project = Readonly<{
  id: string
  name: string
  summary: string | null
  description: string | null
  status: string
  target_date: string | null
}>

export function ProjectWorkspace({ actor, project, items, tab, workSurface, actions, onTabChange }: {
  actor?: Readonly<{ id: string; workspace_id?: string; workspace_role: 'admin' | 'member' }>
  project: Project
  items: WorkItemDto[]
  tab: ProjectWorkspaceTab
  workSurface: ReactNode
  actions?: ReactNode
  onTabChange: (tab: ProjectWorkspaceTab) => void
}) {
  const workView = tab === 'board' || tab === 'backlog' ? tab : 'list'
  return <section className="project-workspace" data-testid="project-workspace">
    <ProjectControlCenter
      actions={actions}
      actor={actor}
      backlogCount={items.filter(item => item.status_category === 'backlog' || item.statusCategory === 'backlog').length}
      onWorkViewChange={onTabChange}
      project={project}
      workSurface={workSurface}
      workView={workView}
    />
  </section>
}
