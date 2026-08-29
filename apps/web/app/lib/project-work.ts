export type ProjectWorkspaceTab = 'overview' | 'list' | 'board' | 'backlog'

export type ProjectWorkspaceRoute = Readonly<{
  projectId?: string
  tab: ProjectWorkspaceTab
  workItemId?: string
}>

const workspaceTabs = new Set<ProjectWorkspaceTab>(['overview', 'list', 'board', 'backlog'])

export function projectWorkspaceHref(input: Readonly<{
  filterSearch?: string
  projectId?: string
  tab?: ProjectWorkspaceTab
  workItemId?: string
}>): string {
  const params = new URLSearchParams(input.filterSearch ?? '')
  params.set('view', 'projects')
  // The Project route is authoritative for this scope; do not emit the
  // Work Surface's generic projectId alias alongside it.
  params.delete('projectId')
  if (input.projectId) params.set('project', input.projectId)
  if (input.tab && input.tab !== 'overview') params.set('tab', input.tab)
  if (input.workItemId) params.set('workItem', input.workItemId)
  return `/?${params.toString()}`
}

export function readProjectWorkspaceRoute(search: string): ProjectWorkspaceRoute {
  const params = new URLSearchParams(search)
  const rawTab = params.get('tab')
  return {
    projectId: params.get('project') || undefined,
    tab: rawTab && workspaceTabs.has(rawTab as ProjectWorkspaceTab) ? rawTab as ProjectWorkspaceTab : 'overview',
    workItemId: params.get('workItem') || undefined,
  }
}

export function revisionConflictNotice(error: Readonly<{ status: number; code?: string }>) {
  if (error.status !== 409 || error.code !== 'REVISION_CONFLICT') return null
  return {
    title: 'This work changed while you were editing',
    action: 'Reload the latest version and review your changes before saving again.',
  }
}
