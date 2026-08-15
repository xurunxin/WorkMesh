export const WORK_SURFACE_SCOPES = ['my-work', 'active', 'backlog', 'project-work-items'] as const
export type WorkSurfaceScope = typeof WORK_SURFACE_SCOPES[number]
export const WORK_SURFACE_LAYOUTS = ['list', 'board'] as const
export type WorkSurfaceLayout = typeof WORK_SURFACE_LAYOUTS[number]
export const STATUS_CATEGORIES = ['backlog', 'planned', 'started', 'completed', 'canceled'] as const
export type StatusCategory = typeof STATUS_CATEGORIES[number]
export const PRIORITIES = ['none', 'urgent', 'high', 'medium', 'low'] as const
export type Priority = typeof PRIORITIES[number]

export type WorkSurfaceQuery = {
  teamId?: string
  search?: string
  statusId?: string
  priority?: Priority
  responsibleHumanActorId?: string
  /** Legacy transport alias accepted at the boundary, never serialized when canonical is present. */
  ownerId?: string
  projectId?: string
  milestoneId?: string
  label?: string
  statusCategory?: StatusCategory
  mine?: boolean
}

export type WorkSurfacePage<T = WorkItemDto> = {
  items: T[]
  nextCursor: string | null
}

export type WorkItemDto = {
  id: string
  title: string
  description?: string | null
  number?: number
  identifier?: string
  revision: number
  status_id?: string
  statusId?: string
  status_name?: string
  statusName?: string
  status_category?: string
  statusCategory?: string
  team_id?: string
  team_key?: string
  priority?: string
  responsible_human_actor_id?: string | null
  responsible_human?: { actor_id?: string; display_name?: string } | null
  project_id?: string | null
  project_name?: string | null
  milestone_id?: string | null
  parent_id?: string | null
  labels?: string[]
  active_executor?: { agent_display_name?: string; execution_state?: string } | null
  surface_summary?: {
    blocked_by_count?: number
    blocking_count?: number
    sub_issue_count?: number
    completed_sub_issue_count?: number
  }
}

export type WorkSurfaceItem = {
  id: string
  identifier: string
  title: string
  statusId: string
  statusName: string
  statusCategory: StatusCategory | 'unknown'
  priority: Priority | 'unknown'
  responsibleHuman: string | null
  responsibleHumanActorId: string | null
  projectId: string | null
  projectName: string | null
  labels: string[]
  revision: number
  activeAgent: string | null
  activeAgentState: string | null
  blockedByCount: number
  blockingCount: number
  subIssueCount: number
  completedSubIssueCount: number
}

export type WorkSurfaceState = 'initial' | 'loading' | 'ready' | 'empty' | 'refreshing' | 'forbidden' | 'conflict' | 'offline' | 'reconnecting' | 'error'
export type WorkSurfaceViewModel = {
  scope: WorkSurfaceScope
  layout: WorkSurfaceLayout
  query: WorkSurfaceQuery
  items: WorkSurfaceItem[]
  nextCursor: string | null
  state: WorkSurfaceState
  stale: boolean
  errorMessage?: string
  conflict?: { itemId: string; intent: WorkItemMoveIntent; currentRevision?: number }
}

export type WorkItemMoveIntent = {
  workItemId: string
  targetStatusId: string
  currentRevision: number
  responsibleHumanActorId: string | null
  source: 'pointer' | 'keyboard' | 'explicit-status-selector'
}

export type MoveCommandRequest = WorkItemMoveIntent & { stableOperationId: string }
export type MoveCommandResult = { item?: WorkItemDto; intent: MoveCommandRequest }
export type WorkItemMoveCommandAdapter = {
  move: (intent: WorkItemMoveIntent) => Promise<MoveCommandResult>
  replay: (intent: WorkItemMoveIntent) => Promise<MoveCommandResult>
  cancel: (workItemId: string) => void
}

export type SavedViewPreference = {
  id?: string
  name: string
  teamId?: string | null
  filters: WorkSurfaceQuery
  layout: WorkSurfaceLayout
}

export type SavedViewController = {
  list: (teamId?: string) => Promise<SavedViewPreference[]>
  create: (preference: SavedViewPreference) => Promise<SavedViewPreference>
  sanitize: (preference: unknown) => SavedViewPreference | null
}

export type WorkSurfaceController = {
  query: WorkSurfaceQuery
  scope: WorkSurfaceScope
  layout: WorkSurfaceLayout
  page: WorkSurfacePage<WorkSurfaceItem>
  state: WorkSurfaceState
  stale: boolean
  setQuery: (query: WorkSurfaceQuery) => void
  setLayout: (layout: WorkSurfaceLayout) => void
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  move: WorkItemMoveCommandAdapter
}
