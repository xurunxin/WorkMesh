import { ApiError } from '../../app/lib/api'
import { PRIORITIES, STATUS_CATEGORIES, type WorkItemDto, type WorkSurfaceItem, type WorkSurfaceLayout, type WorkSurfaceQuery, type WorkSurfaceScope, type WorkSurfaceState, type WorkSurfaceViewModel } from './contracts'

const enumValue = <T extends readonly string[]>(value: unknown, values: T): T[number] | 'unknown' => typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T[number] : 'unknown'
const text = (value: unknown): string => typeof value === 'string' ? value : ''
const count = (value: unknown): number => typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0

export function toWorkSurfaceItem(item: WorkItemDto): WorkSurfaceItem {
  const teamKey = text(item.team_key)
  const number = typeof item.number === 'number' ? String(item.number) : ''
  const identifier = text(item.identifier) || (teamKey && number ? `${teamKey}-${number}` : item.id)
  const human = item.responsible_human?.display_name
  const executor = item.active_executor ?? (item.active_assignment
    ? {
        agent_display_name: item.active_assignment.agent_display_name,
        execution_state: item.active_assignment.session_state ?? 'assigned',
      }
    : null)
  return {
    id: item.id,
    identifier,
    title: text(item.title) || identifier,
    description: text(item.description) || null,
    statusId: text(item.status_id) || text(item.statusId),
    statusName: text(item.status_name) || text(item.statusName) || 'Unknown status',
    statusCategory: enumValue(item.status_category ?? item.statusCategory, STATUS_CATEGORIES),
    priority: enumValue(item.priority, PRIORITIES),
    responsibleHuman: human ? text(human) : null,
    responsibleHumanActorId: typeof item.responsible_human_actor_id === 'string' ? item.responsible_human_actor_id : null,
    projectId: text(item.project_id) || null,
    projectName: text(item.project_name) || null,
    labels: Array.isArray(item.labels) ? item.labels.filter((label): label is string => typeof label === 'string') : [],
    revision: typeof item.revision === 'number' ? item.revision : 0,
    activeAgent: executor?.agent_display_name ?? null,
    activeAgentState: executor?.execution_state ?? null,
    blockedByCount: count(item.surface_summary?.blocked_by_count),
    blockingCount: count(item.surface_summary?.blocking_count),
    subIssueCount: count(item.surface_summary?.sub_issue_count),
    completedSubIssueCount: count(item.surface_summary?.completed_sub_issue_count),
  }
}

export function toWorkSurfaceItems(items: WorkItemDto[]): WorkSurfaceItem[] { return items.map(toWorkSurfaceItem) }

export function workSurfaceErrorState(reason: unknown): WorkSurfaceState {
  if (reason instanceof ApiError) {
    if (reason.status === 403 || reason.status === 401) return 'forbidden'
    if (reason.status === 409) return 'conflict'
  }
  if (reason instanceof TypeError || (reason instanceof Error && /network|offline|fetch/i.test(reason.message))) return 'offline'
  return 'error'
}

export function workSurfaceStateForCollection({
  error,
  hasItems,
  initialized,
  loading,
  refreshing = false,
  stale = false,
}: {
  error?: unknown
  hasItems: boolean
  initialized: boolean
  loading: boolean
  refreshing?: boolean
  stale?: boolean
}): WorkSurfaceState {
  if (error) return workSurfaceErrorState(error)
  if (!initialized) return 'loading'
  if (refreshing || loading) return 'refreshing'
  if (stale) return 'reconnecting'
  return hasItems ? 'ready' : 'empty'
}

export function createWorkSurfaceViewModel({
  collection,
  error,
  layout,
  query,
  scope,
  state,
  stale = false,
}: {
  collection: {
    initialized: boolean
    items: WorkItemDto[]
    loading: boolean
    nextCursor: string | null
  }
  error?: unknown
  layout: WorkSurfaceLayout
  query: WorkSurfaceQuery
  scope: WorkSurfaceScope
  state?: WorkSurfaceState
  stale?: boolean
}): WorkSurfaceViewModel {
  const items = toWorkSurfaceItems(collection.items)
  return {
    scope,
    layout,
    query,
    items,
    nextCursor: collection.nextCursor,
    state: state ?? workSurfaceStateForCollection({
      error,
      hasItems: items.length > 0,
      initialized: collection.initialized,
      loading: collection.loading,
      stale,
    }),
    stale,
    ...(error instanceof Error ? { errorMessage: error.message } : {}),
  }
}
