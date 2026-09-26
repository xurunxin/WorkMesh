'use client'

// The Projects workbench: the rail of a team's projects plus the detail pane that
// hosts ProjectControlCenter and the Work Surfaces. Extracted from page.tsx (W04) so
// the home page is a router over scopes rather than the owner of the Projects
// workflow's markup. All state and mutations stay in page.tsx — this component
// receives the already-built actions node and work surface, and never talks to the
// API itself.

import { Button } from '@workmesh/ui'
import { FolderSimpleIcon } from '@phosphor-icons/react/dist/csr/FolderSimple'
import { FolderPlusIcon } from '@phosphor-icons/react/dist/csr/FolderPlus'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import type { ReactNode } from 'react'
import type { AuthenticatedActor } from './lib/actor'
import type { WorkItemDto } from '../features/work-items/contracts'
import { ProjectEditor, type EditableProject } from '../features/projects/project-editor'
import type { Locale } from './lib/i18n'
import { ProjectWorkspace } from './project-workspace'
import type { ProjectWorkspaceTab } from './lib/project-work'

type Project = EditableProject

export function ProjectsWorkbench({ actions, actor, items, labels, locale, onCreateProject,
  onOpenProject, onSelectTab, projectTab, projects, selectedProject, workSurface }: {
  actions: ReactNode
  actor: AuthenticatedActor
  items: WorkItemDto[]
  labels: {
    editProject: string
    milestones: string
    documents: string
    newIssue: string
    newProject: string
    noProjects: string
    projects: string
    projectOverview: string
    targetDate: string
    workspace: string
  }
  locale: Locale
  onCreateProject: () => void
  onOpenProject: (id: string) => void
  onSelectTab: (tab: ProjectWorkspaceTab) => void
  projectTab: ProjectWorkspaceTab
  projects: Project[]
  selectedProject: Project | null
  workSurface: ReactNode
}) {
  return <div className="project-workbench">
    <aside className="project-rail" aria-label={labels.projects}>
      <header><div><span className="eyebrow">{labels.workspace}</span><h1>{labels.projects}</h1></div>
        <Button aria-label={labels.newProject} icon={<FolderPlusIcon aria-hidden="true" size={16} weight="bold" />}
          onClick={onCreateProject} variant="ghost" /></header>
      <div className="project-rail-list">
        {projects.map(project => <button aria-current={selectedProject?.id === project.id ? 'page' : undefined}
          className={selectedProject?.id === project.id ? 'selected' : ''} data-testid={`project-${project.id}`}
          key={project.id} onClick={() => onOpenProject(project.id)} type="button">
          <span className="project-rail-status"><i aria-hidden="true" />{project.status.replaceAll('_', ' ')}</span>
          <strong>{project.name}</strong>
          <small>{project.summary || labels.projectOverview}</small>
          <time dateTime={project.target_date ?? undefined}>{labels.targetDate} · {project.target_date?.slice(0, 10) || '—'}</time>
        </button>)}
        {projects.length === 0 && <div className="project-rail-empty"><FolderSimpleIcon aria-hidden="true" size={28} /><strong>{labels.noProjects}</strong></div>}
      </div>
    </aside>
    <section className="project-detail-pane">
      {selectedProject ? <ProjectWorkspace actions={actions} actor={actor}
        onTabChange={onSelectTab} project={selectedProject} items={items} tab={projectTab}
        workSurface={workSurface} />
        : projects.length > 0 ? <p className="empty">{labels.projectOverview}</p> : null}
    </section>
  </div>
}
