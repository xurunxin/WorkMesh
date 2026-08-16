export type ProjectWorkspaceTab = 'overview' | 'list' | 'board' | 'backlog'

export type ProjectWorkspaceRoute = Readonly<{
  projectId?: string
  tab: ProjectWorkspaceTab
  workItemId?: string
}>

type HierarchyItem = Readonly<{ id: string; parent_id: string | null }>

type ProjectWorkSummaryItem = Readonly<{
  status_category: string
  responsible_human: unknown | null
  active_executor: unknown | null
}>

const workspaceTabs = new Set<ProjectWorkspaceTab>([
  'overview',
  'list',
  'board',
  'backlog',
])

export function projectWorkspaceHref(input: Readonly<{
  projectId?: string
  tab?: ProjectWorkspaceTab
  workItemId?: string
}>): string {
  const params = new URLSearchParams({ view: 'projects' })
  if (input.projectId) params.set('project', input.projectId)
  if (input.tab && input.tab !== 'overview') params.set('tab', input.tab)
  if (input.workItemId) params.set('workItem', input.workItemId)
  return `/?${params.toString()}`
}

export function projectMilestoneIssuesHref(projectId: string, milestoneId: string): string {
  const params = new URLSearchParams({
    view: 'my-work',
    layout: 'list',
    projectId,
    milestoneId,
  })
  return `/?${params.toString()}`
}

export function readProjectWorkspaceRoute(search: string): ProjectWorkspaceRoute {
  const params = new URLSearchParams(search)
  const rawTab = params.get('tab')
  return {
    projectId: params.get('project') || undefined,
    tab: rawTab && workspaceTabs.has(rawTab as ProjectWorkspaceTab)
      ? rawTab as ProjectWorkspaceTab
      : 'overview',
    workItemId: params.get('workItem') || undefined,
  }
}

export function buildWorkHierarchy<T extends HierarchyItem>(items: readonly T[]):
Array<{ item: T; depth: number; childCount: number }> {
  const byId = new Map(items.map(item => [item.id, item]))
  const children = new Map<string, T[]>()
  for (const item of items) {
    if (!item.parent_id || !byId.has(item.parent_id)) continue
    const current = children.get(item.parent_id) ?? []
    current.push(item)
    children.set(item.parent_id, current)
  }
  const result: Array<{ item: T; depth: number; childCount: number }> = []
  const visited = new Set<string>()
  const visit = (item: T, depth: number) => {
    if (visited.has(item.id)) return
    visited.add(item.id)
    const nested = children.get(item.id) ?? []
    result.push({ item, depth, childCount: nested.length })
    for (const child of nested) visit(child, depth + 1)
  }
  for (const item of items)
    if (!item.parent_id || !byId.has(item.parent_id)) visit(item, 0)
  // A malformed or legacy cycle remains visible instead of disappearing.
  for (const item of items) visit(item, 0)
  return result
}

export function summarizeProjectWork(items: readonly ProjectWorkSummaryItem[]) {
  const completed = items.filter(item => item.status_category === 'completed').length
  return {
    total: items.length,
    completed,
    inProgress: items.filter(item => item.status_category === 'started').length,
    withoutResponsibleHuman: items.filter(item => !item.responsible_human).length,
    activeAgents: items.filter(item => Boolean(item.active_executor)).length,
    progressPercent: items.length ? Math.round((completed / items.length) * 100) : 0,
  }
}

export function revisionConflictNotice(error: Readonly<{ status: number; code?: string }>) {
  if (error.status !== 409 || error.code !== 'REVISION_CONFLICT') return null
  return {
    title: 'This work changed while you were editing',
    action: 'Reload the latest version and review your changes before saving again.',
  }
}

export function revisionScopedFormKey(resource: Readonly<{ id: string; revision: number }>): string {
  return `${resource.id}:${resource.revision}`
}

export function optionIdentityKey(
  options: readonly Readonly<{ id: string; revision?: number }>[],
): string {
  return options.map(option => `${option.id}:${option.revision ?? ''}`).join('|')
}
