'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WorkItemBoard, WorkItemFilters, WorkItemList, WorkSurfacePagination, WorkSurfaceState, type WorkItemCardData, type WorkItemFilterOption, type WorkItemMoveSource, type WorkItemStatusOption } from '@workmesh/ui'
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
export type WorkSurfaceView = SavedViewPreference & { builtIn?: boolean }

export type WorkSurfacesProps = {
  teamId?: string | null
  scope: WorkSurfaceScope
  selectedProjectId?: string | null
  actorId?: string | null
  statuses?: WorkSurfaceStatus[]
  humans?: WorkSurfaceHuman[]
  projects?: WorkSurfaceProject[]
  initialLayout?: WorkSurfaceLayout
  initialFilters?: WorkSurfaceQuery
  realtimeResources?: RealtimeResource[]
  onOpenItem?: (id: string) => void | Promise<void>
  onApplySavedView?: (view: SavedViewPreference) => void
  onLayoutChange?: (layout: WorkSurfaceLayout) => void
  onSelectionReset?: () => void
  onError?: (message: string) => void
  onItemsChange?: (items: WorkItemDto[]) => void
  onRefreshReady?: (refresh: () => Promise<void>) => void
}

const emptyFilters: WorkSurfaceQuery = {}
const workItemIdSelector = (id: string): string => `[data-work-item-id="${CSS.escape(id)}"]`
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

export function WorkSurfaces({ actorId = null, humans = [], initialFilters, initialLayout = 'list', onApplySavedView, onError, onItemsChange, onLayoutChange, onOpenItem, onRefreshReady, onSelectionReset, projects = [], realtimeResources = [], scope, selectedProjectId = null, statuses = [], teamId = null }: WorkSurfacesProps) {
  const controller = useWorkSurfaceController({ actorId, initialFilters, initialLayout, realtimeResources, scope, selectedProjectId, teamId })
  const { collection, filters, layout, pendingMoves, query } = controller
  const setControllerLayout = controller.setLayout
  const requestLayout = useCallback((next: WorkSurfaceLayout) => {
    requestWorkSurfaceLayout(next, setControllerLayout, onLayoutChange)
  }, [onLayoutChange, setControllerLayout])
  const [views, setViews] = useState<WorkSurfaceView[]>([])
  const [viewsError, setViewsError] = useState<unknown>()
  const [viewsLoading, setViewsLoading] = useState(false)
  const savedViews = useMemo(() => createSavedViewController(), [])
  useEffect(() => {
    let cancelled = false
    setViewsLoading(true); setViewsError(undefined)
    void savedViews.list(teamId ?? undefined).then(next => { if (!cancelled) setViews(next) }).catch(reason => { if (!cancelled) setViewsError(reason) }).finally(() => { if (!cancelled) setViewsLoading(false) })
    return () => { cancelled = true }
  }, [savedViews, teamId])
  const vm = useMemo(() => {
    const mapped = collection.items.map(item => ({ ...item, statusId: item.status_id ?? item.statusId ?? '', statusName: item.status_name ?? item.statusName ?? '', statusCategory: item.status_category ?? item.statusCategory, priority: item.priority, responsibleHuman: item.responsible_human?.display_name ?? null, project: item.project_id ?? null, activeAgent: item.active_executor?.agent_display_name ?? null, identifier: item.identifier ?? `${item.team_key ?? ''}-${item.number ?? item.id}` }))
    const projected = mapped.map(item => ({ ...item, statusId: pendingMoves[item.id] ?? item.statusId }))
    return createWorkSurfaceViewModel({ collection: { items: projected, nextCursor: collection.nextCursor }, error: collection.error ?? controller.actionError, layout, query, scope, stale: Boolean(collection.loading && projected.length > 0) })
  }, [collection.error, collection.items, collection.loading, collection.nextCursor, controller.actionError, layout, pendingMoves, query, scope])
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
  const uiItems = vm.items.map(item => ({ ...item, statusId: pendingMoves[item.id] ?? item.statusId, statusCategory: item.statusCategory === 'unknown' ? undefined : item.statusCategory, priority: item.priority === 'unknown' ? undefined : item.priority, responsibleHuman: item.responsibleHuman, activeAgent: item.activeAgent }))
  const filterErrorState = viewsError instanceof ApiError && viewsError.status === 403
  const state = workSurfaceErrorState(collection.error ?? controller.actionError)
  if (state === 'forbidden') return <section className="work-surfaces" data-testid="work-surfaces"><WorkSurfaceState actionLabel="Retry" description="The server did not authorize this Work Item query. No cached rows are shown." onAction={() => void controller.refresh()} state="forbidden" title="Work Items are unavailable" /></section>
  return <section aria-label="Work surfaces" className="work-surfaces" data-testid="work-surfaces">
    <WorkItemFilters humans={toFilterOptions(humans)} onApplySavedView={applyView} onChange={value => controller.setQuery({ ...value, priority: value.priority as WorkSurfaceQuery['priority'], statusCategory: value.statusCategory as WorkSurfaceQuery['statusCategory'] })} onClear={() => controller.setQuery({ teamId: teamId ?? undefined })} onCreateSavedView={createView} projects={toFilterOptions(projects)} savedViews={views.filter((view): view is WorkSurfaceView & { id: string } => Boolean(view.id)).map(view => ({ id: view.id, name: view.name }))} statuses={toFilterOptions(statuses)} value={filters} />
    {filterErrorState && <WorkSurfaceState description="Saved views are not available for this Human. Preferences were not retained or applied." state="forbidden" title="Saved views are unavailable" />}
    {viewsLoading && views.length === 0 && <p className="wm-work-surface-loading-note">Loading saved views…</p>}
    <div aria-label="Work surface layout" className="work-surface-layout-toggle"><button aria-pressed={layout === 'list'} className={layout === 'list' ? 'selected' : undefined} onClick={() => requestLayout('list')} type="button">List</button><button aria-pressed={layout === 'board'} className={layout === 'board' ? 'selected' : undefined} onClick={() => requestLayout('board')} type="button">Board</button></div>
    {vm.state === 'loading' && <WorkSurfaceState description="Loading the authorized Work Item projection." state="loading" title="Loading Work Items" />}
    {vm.state === 'refreshing' && <WorkSurfaceState description="Refreshing this query from the canonical server projection." state="refreshing" title="Refreshing Work Items" />}
    {vm.state === 'empty' && <WorkSurfaceState description="The authorized query returned no Work Items." state="empty" title="No Work Items" />}
    {vm.state === 'offline' && <WorkSurfaceState actionLabel="Retry" description="The last authorized projection is unavailable offline. Mutations are disabled." onAction={() => void controller.refresh()} state="offline" title="WorkMesh is offline" />}
    {vm.state === 'error' && <WorkSurfaceState actionLabel="Retry" description={vm.errorMessage ?? 'The Work Item query could not be completed.'} onAction={() => void controller.refresh()} state="error" title="Work Items could not refresh" />}
    {vm.state === 'conflict' && <WorkSurfaceState actionLabel="Reload latest" description="Your move conflicted with a newer server revision. Confirm a new move after reviewing the latest Work Item." onAction={() => { controller.setQuery({ ...query }); void controller.refresh() }} state="conflict" title="Work Item changed" />}
    {(vm.state === 'ready' || vm.state === 'reconnecting' || vm.state === 'refreshing') && <div className={vm.stale ? 'work-surface-stale' : undefined} data-stale={vm.stale || undefined}>{layout === 'list' ? <WorkItemList items={uiItems} onMove={move} onOpen={open} statusOptions={columns} /> : <WorkItemBoard columns={columns} items={uiItems} onMove={move} onOpen={open} />}<WorkSurfacePagination loading={collection.loadingMore} nextCursor={collection.nextCursor} onLoadMore={collection.loadMore} /></div>}
  </section>
}

export default WorkSurfaces
