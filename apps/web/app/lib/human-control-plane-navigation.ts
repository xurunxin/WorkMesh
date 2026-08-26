export type ProjectControlSurface = 'overview' | 'work' | 'attention' | 'runs' | 'graph' | 'activity' | 'settings'
export type ProjectWorkView = 'list' | 'board' | 'backlog'

export type ProjectControlRoute = Readonly<{
  drawerId?: string
  projectId?: string
  selectedId?: string
  surface: ProjectControlSurface
  workView: ProjectWorkView
}>

const surfaces = new Set<ProjectControlSurface>(['overview', 'work', 'attention', 'runs', 'graph', 'activity', 'settings'])
const workViews = new Set<ProjectWorkView>(['list', 'board', 'backlog'])

export function readProjectControlRoute(search: string): ProjectControlRoute {
  const params = new URLSearchParams(search)
  const rawSurface = params.get('surface')
  const rawTab = params.get('tab')
  const workView = rawTab && workViews.has(rawTab as ProjectWorkView) ? rawTab as ProjectWorkView : 'list'
  const surface = rawSurface && surfaces.has(rawSurface as ProjectControlSurface)
    ? rawSurface as ProjectControlSurface
    : rawTab && workViews.has(rawTab as ProjectWorkView) ? 'work' : 'overview'
  return {
    drawerId: params.get('drawer') || undefined,
    projectId: params.get('project') || undefined,
    selectedId: params.get('selected') || undefined,
    surface,
    workView,
  }
}

export function projectControlHref(input: Readonly<{
  currentSearch?: string
  drawerId?: string | null
  projectId: string
  selectedId?: string | null
  surface: ProjectControlSurface
  workView?: ProjectWorkView
}>): string {
  const params = new URLSearchParams(input.currentSearch ?? '')
  params.set('view', 'projects')
  params.set('project', input.projectId)
  if (input.surface === 'overview') params.delete('surface')
  else params.set('surface', input.surface)
  if (input.surface === 'work') params.set('tab', input.workView ?? 'list')
  else params.delete('tab')
  if (input.selectedId) params.set('selected', input.selectedId)
  else params.delete('selected')
  if (input.drawerId) params.set('drawer', input.drawerId)
  else params.delete('drawer')
  return `/?${params.toString()}`
}

export type ProjectNavigationCopy = Record<ProjectControlSurface, string> & { beta: string }

export function projectControlNavigation(input: Readonly<{
  active: ProjectControlSurface
  copy: ProjectNavigationCopy
  currentSearch?: string
  projectId: string
}>) {
  const order: ProjectControlSurface[] = ['overview', 'work', 'attention', 'runs', 'graph', 'activity', 'settings']
  return order.map(surface => ({
    active: surface === input.active,
    badge: surface === 'graph' ? input.copy.beta : undefined,
    href: projectControlHref({ currentSearch: input.currentSearch, projectId: input.projectId, surface }),
    id: surface,
    label: input.copy[surface],
  }))
}
