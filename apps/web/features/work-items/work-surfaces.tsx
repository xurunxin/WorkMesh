'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, WorkItemBoard, WorkItemFilters, WorkItemList, WorkSurfacePagination, WorkSurfaceState, type WorkItemCardData, type WorkItemCopy, type WorkItemFilterOption, type WorkItemMoveSource, type WorkItemStatusOption } from '@workmesh/ui'
import { KanbanIcon } from '@phosphor-icons/react/dist/csr/Kanban'
import { RowsIcon } from '@phosphor-icons/react/dist/csr/Rows'
import { ApiError } from '../../app/lib/api'
import { type RealtimeResource, useRealtimeSubscription } from '../../app/lib/realtime'
import { createSavedViewController } from './saved-views'
import { useWorkSurfaceQuery, workSurfaceQueryForScope } from './query'
import { createWorkItemMoveCommandAdapter, recoverMoveNetworkFailure } from './move-command'
import { createWorkSurfaceViewModel, workSurfaceErrorState } from './view-model'
import { type SavedViewPreference, type StatusCategory, type WorkItemDto, type WorkSurfaceLayout, type WorkSurfaceQuery, type WorkSurfaceScope } from './contracts'

export type WorkSurfaceStatus = { id: string; name: string; category?: StatusCategory }
export type WorkSurfaceHuman = { id: string; display_name?: string; displayName?: string }
export type WorkSurfaceProject = { id: string; name: string }
export type WorkSurfaceMilestone = { id: string; name: string }
export type WorkSurfaceView = SavedViewPreference & { builtIn?: boolean }

export type WorkSurfaceCopy = {
  board: string
  conflictDescription: string
  conflictTitle: string
  emptyDescription: string
  emptyTitle: string
  errorDescription: string
  errorTitle: string
  forbiddenDescription: string
  forbiddenTitle: string
  layoutLabel: string
  list: string
  loadingDescription: string
  loadingTitle: string
  loadingViews: string
  offlineDescription: string
  offlineTitle: string
  refreshingDescription: string
  refreshingTitle: string
  retry: string
  savedViewsDescription: string
  savedViewsTitle: string
}

const defaultCopy: WorkSurfaceCopy = {
  board: 'Board',
  conflictDescription: 'Your move conflicted with a newer server revision. Confirm a new move after reviewing the latest Issue.',
  conflictTitle: 'Issue changed',
  emptyDescription: 'The authorized query returned no Work Items.',
  emptyTitle: 'No Work Items',
  errorDescription: 'The Issue query could not be completed.',
  errorTitle: 'Issues could not refresh',
  forbiddenDescription: 'The server did not authorize this Issue query. No cached rows are shown.',
  forbiddenTitle: 'Issues are unavailable',
  layoutLabel: 'Issue layout',
  list: 'List',
  loadingDescription: 'Loading the authorized Issue projection.',
  loadingTitle: 'Loading Work Items',
  loadingViews: 'Loading saved views…',
  offlineDescription: 'The last authorized projection is unavailable offline. Mutations are disabled.',
  offlineTitle: 'WorkMesh is offline',
  refreshingDescription: 'Refreshing this query from the canonical server projection.',
  refreshingTitle: 'Refreshing Issues',
  retry: 'Retry',
  savedViewsDescription: 'Saved views are not available for this Human. Preferences were not retained or applied.',
  savedViewsTitle: 'Saved views are unavailable',
}

export type WorkSurfacesProps = {
  teamId?: string | null
  scope: WorkSurfaceScope
  selectedProjectId?: string | null
  actorId?: string | null
  statuses?: WorkSurfaceStatus[]
  humans?: WorkSurfaceHuman[]
  projects?: WorkSurfaceProject[]
  milestones?: WorkSurfaceMilestone[]
  initialLayout?: WorkSurfaceLayout
  initialFilters?: WorkSurfaceQuery
  realtimeResources?: RealtimeResource[]
  onOpenItem?: (id: string) => void | Promise<void>
  onOpenProject?: (id: string) => void | Promise<void>
  onQueryChange?: (query: WorkSurfaceQuery) => void
  onApplySavedView?: (view: SavedViewPreference) => void
  onLayoutChange?: (layout: WorkSurfaceLayout) => void
  onSelectionReset?: () => void
  onError?: (message: string) => void
  onItemsChange?: (items: WorkItemDto[]) => void
  onRefreshReady?: (refresh: () => Promise<void>) => void
  copy?: Partial<WorkItemCopy>
  surfaceCopy?: Partial<WorkSurfaceCopy>
}

const emptyFilters: WorkSurfaceQuery = {}
const FILTERS_COMPACT_STORAGE_KEY = 'wm:filters:compact'
const readCompactPreference = (): boolean => {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(FILTERS_COMPACT_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}
const writeCompactPreference = (next: boolean): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FILTERS_COMPACT_STORAGE_KEY, next ? 'true' : 'false')
  } catch {
    /* localStorage may be unavailable (private mode, quota); ignore. */
  }
}
const workItemIdSelector = (id: string): string => `[data-work-item-id="${CSS.escape(id)}"] .wm-work-item-title`
const displayName = (human: WorkSurfaceHuman): string => human.display_name ?? human.displayName ?? human.id

function statusOptions(statuses: WorkSurfaceStatus[]): WorkItemStatusOption[] {
  return statuses.map(status => ({ id: status.id, name: status.name, category: status.category }))
}

function toFilterOptions(values: Array<{ id: string; name?: string; display_name?: string; displayName?: string }>): WorkItemFilterOption[] {
  return values.map(value => { const label = value.name ?? value.display_name ?? value.displayName ?? value.id; return { id: value.id, label, name: label } })
}

export function requestWorkSurfaceLayout(next: WorkSurfaceLayout, setLocalLayout: (layout: WorkSurfaceLayout) => void, notifyParent?: (layout: WorkSurfaceLayout) => void) {
  setLocalLayout(next)
  notifyParent?.(next)
}

export function useWorkSurfaceController({
  actorId,
  initialFilters = emptyFilters,
  initialLayout = 'list',
  realtimeResources = [],
  scope,
  selectedProjectId,
  teamId,
}: Pick<WorkSurfacesProps, 'actorId' | 'initialFilters' | 'initialLayout' | 'realtimeResources' | 'scope' | 'selectedProjectId' | 'teamId'>) {
  const [layout, setLayout] = useState<WorkSurfaceLayout>(initialLayout)
  const [filters, setFilters] = useState<WorkSurfaceQuery>(initialFilters)
  useEffect(() => { setFilters(initialFilters) }, [initialFilters])
  useEffect(() => { setLayout(initialLayout) }, [initialLayout])
  const query = useMemo(() => workSurfaceQueryForScope(scope, { ...filters, teamId: teamId ?? undefined }, selectedProjectId ?? undefined), [filters, scope, selectedProjectId, teamId])
  const collection = useWorkSurfaceQuery(query)
  const [pendingMoves, setPendingMoves] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState<unknown>()
  const [conflict, setConflict] = useState<{ id: string; intent: Parameters<ReturnType<typeof createWorkItemMoveCommandAdapter>['move']>[0]; currentRevision?: number }>()
  const lastRefresh = useRef(0)
  const collectionRefresh = collection.refresh
  const adapter = useMemo(() => createWorkItemMoveCommandAdapter({
    applyOptimistic: intent => setPendingMoves(current => ({ ...current, [intent.workItemId]: intent.targetStatusId })),
    rollback: intent => setPendingMoves(current => { const next = { ...current }; delete next[intent.workItemId]; return next }),
    onForbidden: intent => setActionError(new ApiError(403, 'You are not allowed to move this Work Item.')),
    onConflict: (intent, reason) => {
      setConflict({ id: intent.workItemId, intent })
      setActionError(reason)
      void collectionRefresh()
    },
    onOffline: (_intent, reason) => setActionError(reason),
    onSuccess: async result => {
      setPendingMoves(current => { const next = { ...current }; delete next[result.intent.workItemId]; return next })
      setActionError(undefined)
      await collectionRefresh()
      requestAnimationFrame(() => document.querySelector<HTMLElement>(workItemIdSelector(result.intent.workItemId))?.focus())
    },
  }), [collectionRefresh])
  const refresh = useCallback(async () => {
    lastRefresh.current += 1
    await recoverMoveNetworkFailure({
      clearActionError: () => setActionError(undefined),
      refreshCanonicalCollection: collectionRefresh,
    })
  }, [collectionRefresh])
  useRealtimeSubscription(realtimeResources, invalidation => {
    if (invalidation.reason === 'resync' || invalidation.event.invalidates.length > 0) void refresh()
  })
  const setQuery = useCallback((next: WorkSurfaceQuery) => { setActionError(undefined); setFilters(next) }, [])
  const setLayoutAndRestoreFocus = useCallback((next: WorkSurfaceLayout) => {
    const activeId = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('[data-work-item-id]')?.dataset.workItemId : undefined
    setLayout(next)
    if (activeId) requestAnimationFrame(() => document.querySelector<HTMLElement>(workItemIdSelector(activeId))?.focus())
  }, [])
  const move = useCallback((item: { id: string; revision?: number; responsibleHumanActorId?: string | null }, targetStatusId: string, source: WorkItemMoveSource) => {
    if (item.revision === undefined) return Promise.reject(new Error('A Work Item revision is required to move it.'))
    return adapter.move({ workItemId: item.id, targetStatusId, currentRevision: item.revision, responsibleHumanActorId: item.responsibleHumanActorId ?? null, source })
  }, [actorId, adapter])
  return { actorId, adapter, actionError, collection, conflict, filters, layout, lastRefresh, move, pendingMoves, query, refresh, scope, setFilters, setLayout: setLayoutAndRestoreFocus, setQuery, teamId }
}

export function WorkSurfaces({ actorId = null, copy, humans = [], initialFilters, initialLayout = 'list', milestones = [], onApplySavedView, onError, onItemsChange, onLayoutChange, onOpenItem, onOpenProject, onQueryChange, onRefreshReady, onSelectionReset, projects = [], realtimeResources = [], scope, selectedProjectId = null, statuses = [], surfaceCopy, teamId = null }: WorkSurfacesProps) {
  const text = { ...defaultCopy, ...surfaceCopy }
  const controller = useWorkSurfaceController({ actorId, initialFilters, initialLayout, realtimeResources, scope, selectedProjectId, teamId })
  const { collection, filters, layout, pendingMoves, query } = controller
  const setControllerLayout = controller.setLayout
  const requestLayout = useCallback((next: WorkSurfaceLayout) => {
    requestWorkSurfaceLayout(next, setControllerLayout, onLayoutChange)
  }, [onLayoutChange, setControllerLayout])
  const [views, setViews] = useState<WorkSurfaceView[]>([])
  const [viewsError, setViewsError] = useState<unknown>()
  const [viewsLoading, setViewsLoading] = useState(false)
  // The filter row's compact preference is a UI choice, not a query input —
  // it lives in localStorage so the user's choice survives page reloads and
  // does not leak into URL/query state. The lazy initializer runs once on
  // mount so the first render already reflects the saved preference without
  // a follow-up effect that would flash the wrong layout.
  const [filtersCompact, setFiltersCompact] = useState<boolean>(() => readCompactPreference())
  const updateFiltersCompact = useCallback((next: boolean) => {
    setFiltersCompact(next)
    writeCompactPreference(next)
  }, [])
  const savedViews = useMemo(() => createSavedViewController(), [])
  useEffect(() => {
    let cancelled = false
    setViewsLoading(true); setViewsError(undefined)
    void savedViews.list(teamId ?? undefined).then(next => { if (!cancelled) setViews(next) }).catch(reason => { if (!cancelled) setViewsError(reason) }).finally(() => { if (!cancelled) setViewsLoading(false) })
    return () => { cancelled = true }
  }, [savedViews, teamId])
  const vm = useMemo(() => createWorkSurfaceViewModel({
    collection,
    error: collection.error ?? controller.actionError,
    layout,
    query,
    scope,
    stale: Boolean(collection.loading && collection.items.length > 0),
  }), [collection, collection.error, controller.actionError, layout, query, scope])
  useEffect(() => { onItemsChange?.(collection.items) }, [collection.items, onItemsChange])
  useEffect(() => { onRefreshReady?.(controller.refresh) }, [controller.refresh, onRefreshReady])
  const columns = useMemo(() => statusOptions(statuses), [statuses])
  const move = useCallback((item: WorkItemCardData, targetStatusId: string, source: WorkItemMoveSource) => {
    const targetStatus = statuses.find(status => status.id === targetStatusId)
    const responsibleHumanActorId = item.responsibleHumanActorId ?? (targetStatus?.category === 'started' ? actorId : null)
    void controller.move({ ...item, responsibleHumanActorId }, targetStatusId, source)
      .catch(reason => { onError?.(reason instanceof Error ? reason.message : 'The Work Item could not be moved.') })
  }, [actorId, controller, onError, statuses])
  const open = useCallback((item: WorkItemCardData) => { void onOpenItem?.(item.id) }, [onOpenItem])
  const applyView = useCallback((id: string) => {
    const view = views.find(candidate => candidate.id === id)
    if (!view) return
    onSelectionReset?.()
    if (onApplySavedView) onApplySavedView(view)
    else {
      controller.setQuery({ ...view.filters, teamId: view.teamId ?? teamId ?? undefined })
      controller.setLayout(view.layout)
    }
  }, [onApplySavedView, onSelectionReset, teamId, controller, views])
  const createView = useCallback(async (name: string) => {
    const view = await savedViews.create({ name, teamId, filters: query, layout })
    setViews(current => [...current, view])
  }, [layout, query, savedViews, teamId])
  const changeQuery = useCallback((next: WorkSurfaceQuery) => {
    controller.setQuery(next)
    onQueryChange?.(next)
  }, [controller, onQueryChange])
  const uiItems = vm.items.map(item => ({ ...item, statusId: pendingMoves[item.id] ?? item.statusId, statusCategory: item.statusCategory === 'unknown' ? undefined : item.statusCategory, priority: item.priority === 'unknown' ? undefined : item.priority }))
  const filterErrorState = viewsError instanceof ApiError && viewsError.status === 403
  const state = workSurfaceErrorState(collection.error ?? controller.actionError)
  if (state === 'forbidden') return <section className="work-surfaces" data-testid="work-surfaces"><WorkSurfaceState actionLabel={text.retry} description={text.forbiddenDescription} onAction={() => void controller.refresh()} state="forbidden" title={text.forbiddenTitle} /></section>
  return <section aria-label="Work surfaces" className="work-surfaces" data-testid="work-surfaces">
    <WorkItemFilters compact={filtersCompact} copy={copy} humans={toFilterOptions(humans)} milestones={toFilterOptions(milestones)} onApplySavedView={applyView} onChange={value => changeQuery({ ...value, priority: value.priority as WorkSurfaceQuery['priority'], statusCategory: value.statusCategory as WorkSurfaceQuery['statusCategory'] })} onClear={() => changeQuery({})} onCompactChange={updateFiltersCompact} onCreateSavedView={createView} projects={toFilterOptions(projects)} savedViews={views.filter((view): view is WorkSurfaceView & { id: string } => Boolean(view.id)).map(view => ({ id: view.id, name: view.name }))} statuses={toFilterOptions(statuses)} value={filters} />
    {filterErrorState && <WorkSurfaceState description={text.savedViewsDescription} state="forbidden" title={text.savedViewsTitle} />}
    {viewsLoading && views.length === 0 && <p className="wm-work-surface-loading-note">{text.loadingViews}</p>}
    <div aria-label={text.layoutLabel} className="work-surface-layout-toggle"><Button aria-pressed={layout === 'list'} className={layout === 'list' ? 'selected' : undefined} icon={<RowsIcon aria-hidden="true" size={16} weight="bold" />} onClick={() => requestLayout('list')} type="button" variant="ghost">{text.list}</Button><Button aria-pressed={layout === 'board'} className={layout === 'board' ? 'selected' : undefined} icon={<KanbanIcon aria-hidden="true" size={16} weight="bold" />} onClick={() => requestLayout('board')} type="button" variant="ghost">{text.board}</Button></div>
    {vm.state === 'loading' && <WorkSurfaceState description={text.loadingDescription} state="loading" title={text.loadingTitle} />}
    {vm.state === 'refreshing' && <WorkSurfaceState description={text.refreshingDescription} state="refreshing" title={text.refreshingTitle} />}
    {vm.state === 'empty' && <WorkSurfaceState description={text.emptyDescription} state="empty" title={text.emptyTitle} />}
    {vm.state === 'offline' && <WorkSurfaceState actionLabel={text.retry} description={text.offlineDescription} onAction={() => void controller.refresh()} state="offline" title={text.offlineTitle} />}
    {vm.state === 'error' && <WorkSurfaceState actionLabel={text.retry} description={vm.errorMessage ?? text.errorDescription} onAction={() => void controller.refresh()} state="error" title={text.errorTitle} />}
    {vm.state === 'conflict' && <WorkSurfaceState actionLabel={text.retry} description={text.conflictDescription} onAction={() => { controller.setQuery({ ...query }); void controller.refresh() }} state="conflict" title={text.conflictTitle} />}
    {(vm.state === 'ready' || vm.state === 'reconnecting' || vm.state === 'refreshing') && <div className={vm.stale ? 'work-surface-stale' : undefined} data-stale={vm.stale || undefined}>{layout === 'list' ? <WorkItemList copy={copy} items={uiItems} onMove={move} onOpen={open} onOpenProject={id => void onOpenProject?.(id)} statusOptions={columns} /> : <WorkItemBoard columns={columns} copy={copy} items={uiItems} onMove={move} onOpen={open} onOpenProject={id => void onOpenProject?.(id)} />}<WorkSurfacePagination copy={copy} loading={collection.loading || collection.loadingMore} nextCursor={collection.nextCursor} onLoadMore={collection.loadMore} /></div>}
  </section>
}

export default WorkSurfaces
