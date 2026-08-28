'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, WorkItemAdaptiveCollection, WorkItemFilters, WorkSurfacePagination, WorkSurfaceState, type WorkItemCardData, type WorkItemCopy, type WorkItemFilterOption, type WorkItemMoveSource, type WorkItemStatusOption } from '@workmesh/ui'
import { KanbanIcon } from '@phosphor-icons/react/dist/csr/Kanban'
import { RowsIcon } from '@phosphor-icons/react/dist/csr/Rows'
import { ApiError } from '../../app/lib/api'
import { SkeletonList } from '../../app/lib/skeleton-list'
import { type RealtimeResource, useRealtimeSubscription } from '../../app/lib/realtime'
import { useAuthorityLifetime } from '../../app/lib/use-authority-lifetime'
import { createSavedViewController } from './saved-views'
import { useWorkSurfaceQuery, workSurfaceQueryForScope } from './query'
import { createWorkItemMoveCommandAdapter, recoverMoveNetworkFailure } from './move-command'
import { createWorkSurfaceViewModel, workSurfaceErrorState } from './view-model'
import { type SavedViewPreference, type StatusCategory, type WorkItemDto, type WorkSurfaceDensity, type WorkSurfaceLayout, type WorkSurfaceQuery, type WorkSurfaceScope, WORK_SURFACE_DENSITIES } from './contracts'

export type WorkSurfaceStatus = { id: string; name: string; category?: StatusCategory }
export type WorkSurfaceHuman = { id: string; display_name?: string; displayName?: string }
export type WorkSurfaceProject = { id: string; name: string }
export type WorkSurfaceMilestone = { id: string; name: string }
export type WorkSurfaceView = SavedViewPreference & { builtIn?: boolean }

export type WorkSurfaceCopy = {
  ariaLabel: string
  board: string
  conflictDescription: string
  conflictTitle: string
  densityCompact: string
  densityComfortable: string
  densityLabel: string
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
  ariaLabel: 'Work surfaces',
  board: 'Board',
  conflictDescription: 'Your move conflicted with a newer server revision. Confirm a new move after reviewing the latest Issue.',
  conflictTitle: 'Issue changed',
  densityCompact: 'Compact',
  densityComfortable: 'Comfortable',
  densityLabel: 'Issue density',
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
  authorityKey: string | null
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
  onRefreshReady?: (refresh: (() => Promise<void>) | null) => void
  copy?: Partial<WorkItemCopy>
  surfaceCopy?: Partial<WorkSurfaceCopy>
  columnWidths?: Record<string, number>
  onColumnWidthChange?: (columnId: string, width: number) => void
  primaryAction?: ReactNode
}

const emptyFilters: WorkSurfaceQuery = {}
const FILTERS_COMPACT_STORAGE_KEY = 'wm:filters:compact'
const DENSITY_STORAGE_KEY = 'wm:board:density'
export const readCompactPreference = (): boolean => {
  if (typeof window === 'undefined') return true
  try {
    const stored = window.localStorage.getItem(FILTERS_COMPACT_STORAGE_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}
const readDensityPreference = (): WorkSurfaceDensity => {
  if (typeof window === 'undefined') return 'comfortable'
  try {
    const value = window.localStorage.getItem(DENSITY_STORAGE_KEY)
    return value && (WORK_SURFACE_DENSITIES as readonly string[]).includes(value)
      ? (value as WorkSurfaceDensity)
      : 'comfortable'
  } catch {
    return 'comfortable'
  }
}
const writeDensityPreference = (next: WorkSurfaceDensity): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, next)
  } catch {
    /* localStorage may be unavailable (private mode, quota); ignore. */
  }
}
const workItemIdSelector = (id: string): string => `[data-work-item-id="${CSS.escape(id)}"] .wm-work-item-title`
const displayName = (human: WorkSurfaceHuman): string => human.display_name ?? human.displayName ?? human.id

function statusOptions(statuses: WorkSurfaceStatus[]): WorkItemStatusOption[] {
  return statuses.map(status => ({ id: status.id, name: status.name, category: status.category }))
}

function sameStatusOptions(left: WorkItemStatusOption[], right: WorkItemStatusOption[]): boolean {
  return left.length === right.length && left.every((status, index) => {
    const candidate = right[index]
    return candidate?.id === status.id && candidate.name === status.name && candidate.category === status.category
  })
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
  authorityKey,
  initialFilters = emptyFilters,
  initialLayout = 'list',
  realtimeResources = [],
  scope,
  selectedProjectId,
  teamId,
}: Pick<WorkSurfacesProps, 'actorId' | 'authorityKey' | 'initialFilters' | 'initialLayout' | 'realtimeResources' | 'scope' | 'selectedProjectId' | 'teamId'>) {
  const isAuthorityCurrent = useAuthorityLifetime()
  const [layout, setLayout] = useState<WorkSurfaceLayout>(initialLayout)
  const [filters, setFilters] = useState<WorkSurfaceQuery>(initialFilters)
  useEffect(() => { setFilters(initialFilters) }, [initialFilters])
  useEffect(() => { setLayout(initialLayout) }, [initialLayout])
  const query = useMemo(() => workSurfaceQueryForScope(scope, { ...filters, teamId: teamId ?? undefined }, selectedProjectId ?? undefined), [filters, scope, selectedProjectId, teamId])
  const collection = useWorkSurfaceQuery(query, authorityKey ?? actorId ?? null)
  const [pendingMoves, setPendingMoves] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState<unknown>()
  const [conflict, setConflict] = useState<{ id: string; intent: Parameters<ReturnType<typeof createWorkItemMoveCommandAdapter>['move']>[0]; currentRevision?: number }>()
  const lastRefresh = useRef(0)
  const collectionRefresh = collection.refresh
  const adapter = useMemo(() => createWorkItemMoveCommandAdapter({
    applyOptimistic: intent => {
      if (isAuthorityCurrent()) setPendingMoves(current => ({ ...current, [intent.workItemId]: intent.targetStatusId }))
    },
    rollback: intent => {
      if (!isAuthorityCurrent()) return
      setPendingMoves(current => { const next = { ...current }; delete next[intent.workItemId]; return next })
    },
    onForbidden: () => {
      if (isAuthorityCurrent()) setActionError(new ApiError(403, 'You are not allowed to move this Work Item.'))
    },
    onConflict: (intent, reason) => {
      if (!isAuthorityCurrent()) return
      setConflict({ id: intent.workItemId, intent })
      setActionError(reason)
      void collectionRefresh()
    },
    onOffline: (_intent, reason) => {
      if (isAuthorityCurrent()) setActionError(reason)
    },
    onSuccess: async result => {
      if (!isAuthorityCurrent()) return
      setPendingMoves(current => { const next = { ...current }; delete next[result.intent.workItemId]; return next })
      setActionError(undefined)
      await collectionRefresh()
      if (!isAuthorityCurrent()) return
      requestAnimationFrame(() => {
        if (isAuthorityCurrent()) document.querySelector<HTMLElement>(workItemIdSelector(result.intent.workItemId))?.focus()
      })
    },
  }), [collectionRefresh, isAuthorityCurrent])
  const refresh = useCallback(async () => {
    if (!isAuthorityCurrent()) return
    lastRefresh.current += 1
    await recoverMoveNetworkFailure({
      clearActionError: () => { if (isAuthorityCurrent()) setActionError(undefined) },
      refreshCanonicalCollection: collectionRefresh,
    })
  }, [collectionRefresh, isAuthorityCurrent])
  useRealtimeSubscription(realtimeResources, invalidation => {
    if (invalidation.reason === 'resync' || invalidation.event.invalidates.length > 0) void refresh()
  })
  const setQuery = useCallback((next: WorkSurfaceQuery) => { setActionError(undefined); setFilters(next) }, [])
  const setLayoutAndRestoreFocus = useCallback((next: WorkSurfaceLayout) => {
    const activeId = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('[data-work-item-id]')?.dataset.workItemId : undefined
    setLayout(next)
    if (activeId) requestAnimationFrame(() => {
      if (isAuthorityCurrent()) document.querySelector<HTMLElement>(workItemIdSelector(activeId))?.focus()
    })
  }, [isAuthorityCurrent])
  const move = useCallback((item: { id: string; revision?: number; responsibleHumanActorId?: string | null }, targetStatusId: string, source: WorkItemMoveSource) => {
    if (item.revision === undefined) return Promise.reject(new Error('A Work Item revision is required to move it.'))
    return adapter.move({ workItemId: item.id, targetStatusId, currentRevision: item.revision, responsibleHumanActorId: item.responsibleHumanActorId ?? null, source })
  }, [actorId, adapter])
  return { actorId, adapter, actionError, collection, conflict, filters, layout, lastRefresh, move, pendingMoves, query, refresh, scope, setFilters, setLayout: setLayoutAndRestoreFocus, setQuery, teamId }
}

export function WorkSurfaces(props: WorkSurfacesProps) {
  const text = { ...defaultCopy, ...props.surfaceCopy }
  if (props.authorityKey === null)
    return <section className="work-surfaces" data-testid="work-surfaces"><SkeletonList columns={1} items={6} label={text.loadingTitle} /></section>
  return <WorkSurfacesScope key={props.authorityKey} {...props} />
}

function WorkSurfacesScope({ actorId = null, authorityKey, columnWidths, copy, humans = [], initialFilters, initialLayout = 'list', milestones = [], onApplySavedView, onColumnWidthChange, onError, onItemsChange, onLayoutChange, onOpenItem, onOpenProject, onQueryChange, onRefreshReady, onSelectionReset, primaryAction, projects = [], realtimeResources = [], scope, selectedProjectId = null, statuses = [], surfaceCopy, teamId = null }: WorkSurfacesProps) {
  const isAuthorityCurrent = useAuthorityLifetime()
  const text = { ...defaultCopy, ...surfaceCopy }
  const controller = useWorkSurfaceController({ actorId, authorityKey, initialFilters, initialLayout, realtimeResources, scope, selectedProjectId, teamId })
  const { collection, filters, layout, pendingMoves, query } = controller
  const controllerMove = controller.move
  const cardActionsRef = useRef({ actorId, controllerMove, isAuthorityCurrent, onError, onOpenItem, onOpenProject, statuses })
  cardActionsRef.current = { actorId, controllerMove, isAuthorityCurrent, onError, onOpenItem, onOpenProject, statuses }
  const setControllerLayout = controller.setLayout
  const requestLayout = useCallback((next: WorkSurfaceLayout) => {
    requestWorkSurfaceLayout(next, setControllerLayout, onLayoutChange)
  }, [onLayoutChange, setControllerLayout])
  const [views, setViews] = useState<WorkSurfaceView[]>([])
  const [viewsError, setViewsError] = useState<unknown>()
  const [viewsLoading, setViewsLoading] = useState(false)
  // The filter row's compact preference is presentation-only. Its disclosure
  // stays local to WorkItemFilters so expanding facets never remounts the
  // toolbar or removes the control needed to collapse them again.
  const [filtersCompact] = useState<boolean>(() => readCompactPreference())
  // Card density follows the same pattern: persisted locally so the
  // preference survives reloads but never becomes part of the shareable
  // query / URL state. The lazy initializer mirrors the saved choice into
  // the first render to avoid a visible density flicker.
  const [density, setDensityState] = useState<WorkSurfaceDensity>(() => readDensityPreference())
  const updateDensity = useCallback((next: WorkSurfaceDensity) => {
    setDensityState(next)
    writeDensityPreference(next)
  }, [])
  const toggleDensity = useCallback(() => {
    updateDensity(density === 'compact' ? 'comfortable' : 'compact')
  }, [density, updateDensity])
  const savedViews = useMemo(() => createSavedViewController(), [])
  useEffect(() => {
    let cancelled = false
    setViewsLoading(true); setViewsError(undefined)
    void savedViews.list(teamId ?? undefined).then(next => { if (!cancelled) setViews(next) }).catch(reason => { if (!cancelled) setViewsError(reason) }).finally(() => { if (!cancelled) setViewsLoading(false) })
    return () => { cancelled = true }
  }, [savedViews, teamId])
  // Layout is presentation-only. Normalize a collection snapshot once per
  // data/query change so List/Board switches reuse the same card projection.
  const viewModelBase = useMemo(() => createWorkSurfaceViewModel({
    collection: {
      initialized: collection.initialized,
      items: collection.items,
      loading: collection.loading,
      nextCursor: collection.nextCursor,
    },
    error: collection.error ?? controller.actionError,
    layout: 'list',
    query,
    scope,
    stale: Boolean(collection.loading && collection.items.length > 0),
  }), [collection.error, collection.initialized, collection.items, collection.loading, collection.nextCursor, controller.actionError, query, scope])
  const vm = useMemo(
    () => layout === viewModelBase.layout ? viewModelBase : { ...viewModelBase, layout },
    [layout, viewModelBase],
  )
  useEffect(() => {
    if (isAuthorityCurrent()) onItemsChange?.(collection.items)
  }, [collection.items, isAuthorityCurrent, onItemsChange])
  useEffect(() => {
    if (!isAuthorityCurrent()) return
    onRefreshReady?.(controller.refresh)
    return () => onRefreshReady?.(null)
  }, [controller.refresh, isAuthorityCurrent, onRefreshReady])
  const projectedColumns = statusOptions(statuses)
  const columnsRef = useRef(projectedColumns)
  if (!sameStatusOptions(columnsRef.current, projectedColumns)) columnsRef.current = projectedColumns
  const columns = columnsRef.current
  const move = useCallback((item: WorkItemCardData, targetStatusId: string, source: WorkItemMoveSource) => {
    const actions = cardActionsRef.current
    const targetStatus = actions.statuses.find(status => status.id === targetStatusId)
    const responsibleHumanActorId = item.responsibleHumanActorId ?? (targetStatus?.category === 'started' ? actions.actorId : null)
    void actions.controllerMove({ ...item, responsibleHumanActorId }, targetStatusId, source)
      .catch(reason => {
        const latest = cardActionsRef.current
        if (latest.isAuthorityCurrent()) latest.onError?.(reason instanceof Error ? reason.message : 'The Work Item could not be moved.')
      })
  }, [])
  const open = useCallback((item: WorkItemCardData) => { void cardActionsRef.current.onOpenItem?.(item.id) }, [])
  const openProject = useCallback((id: string) => { void cardActionsRef.current.onOpenProject?.(id) }, [])
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
    if (isAuthorityCurrent()) setViews(current => [...current, view])
  }, [isAuthorityCurrent, layout, query, savedViews, teamId])
  const changeQuery = useCallback((next: WorkSurfaceQuery) => {
    controller.setQuery(next)
    onQueryChange?.(next)
  }, [controller, onQueryChange])
  const uiItems = useMemo(
    () => vm.items.map(item => ({ ...item, statusId: pendingMoves[item.id] ?? item.statusId, statusCategory: item.statusCategory === 'unknown' ? undefined : item.statusCategory, priority: item.priority === 'unknown' ? undefined : item.priority })),
    [pendingMoves, vm.items],
  )
  const filterErrorState = viewsError instanceof ApiError && viewsError.status === 403
  const state = workSurfaceErrorState(collection.error ?? controller.actionError)
  if (state === 'forbidden') return <section className="work-surfaces" data-testid="work-surfaces"><WorkSurfaceState actionLabel={text.retry} description={text.forbiddenDescription} onAction={() => void controller.refresh()} state="forbidden" title={text.forbiddenTitle} /></section>
  const retainedFailureState = vm.state === 'error' || vm.state === 'offline' || vm.state === 'conflict'
  const showResolvedContent = (vm.state === 'ready'
    || vm.state === 'reconnecting'
    || vm.state === 'refreshing'
    || (retainedFailureState && collection.initialized && vm.items.length > 0))
  const skeletonColumns = layout === 'board' ? Math.max(1, statuses.length) : 1
  return <section
    aria-busy={collection.initialized && (collection.loading || collection.loadingMore) || undefined}
    aria-label={text.ariaLabel}
    className="work-surfaces"
    data-testid="work-surfaces"
  >
    <div className="work-surface-toolbar">
      <WorkItemFilters compact={filtersCompact} copy={copy} humans={toFilterOptions(humans)} milestones={toFilterOptions(milestones)} onApplySavedView={applyView} onChange={value => changeQuery({ ...value, priority: value.priority as WorkSurfaceQuery['priority'], statusCategory: value.statusCategory as WorkSurfaceQuery['statusCategory'] })} onClear={() => changeQuery({})} onCreateSavedView={createView} projects={toFilterOptions(projects)} savedViews={views.filter((view): view is WorkSurfaceView & { id: string } => Boolean(view.id)).map(view => ({ id: view.id, name: view.name }))} statuses={toFilterOptions(statuses)} value={filters} />
      {primaryAction && <div className="work-surface-primary-action">{primaryAction}</div>}
      <div aria-label={text.layoutLabel} className="work-surface-layout-toggle"><Button aria-pressed={layout === 'list'} className={layout === 'list' ? 'selected' : undefined} icon={<RowsIcon aria-hidden="true" size={16} weight="bold" />} onClick={() => requestLayout('list')} type="button" variant="ghost">{text.list}</Button><Button aria-pressed={layout === 'board'} className={layout === 'board' ? 'selected' : undefined} icon={<KanbanIcon aria-hidden="true" size={16} weight="bold" />} onClick={() => requestLayout('board')} type="button" variant="ghost">{text.board}</Button><Button aria-label={text.densityLabel} aria-pressed={density === 'compact'} className={density === 'compact' ? 'selected' : undefined} data-testid="work-surface-density-toggle" onClick={toggleDensity} type="button" variant="ghost">{density === 'compact' ? text.densityComfortable : text.densityCompact}</Button></div>
    </div>
    {filterErrorState && <WorkSurfaceState description={text.savedViewsDescription} state="forbidden" title={text.savedViewsTitle} />}
    {viewsLoading && views.length === 0 && <p className="wm-work-surface-loading-note">{text.loadingViews}</p>}
    {vm.state === 'loading' && (layout === 'board'
      ? <div className="work-surface-board-loading"><SkeletonList columns={skeletonColumns} items={skeletonColumns} label={text.loadingTitle} /></div>
      : <SkeletonList columns={skeletonColumns} items={6} label={text.loadingTitle} />)}
    {vm.state === 'refreshing' && <WorkSurfaceState description={text.refreshingDescription} state="refreshing" title={text.refreshingTitle} />}
    {vm.state === 'empty' && <WorkSurfaceState description={text.emptyDescription} state="empty" title={text.emptyTitle} />}
    {vm.state === 'offline' && <WorkSurfaceState actionLabel={text.retry} description={text.offlineDescription} onAction={() => void controller.refresh()} state="offline" title={text.offlineTitle} />}
    {vm.state === 'error' && <WorkSurfaceState actionLabel={text.retry} description={vm.errorMessage ?? text.errorDescription} onAction={() => void controller.refresh()} state="error" title={text.errorTitle} />}
    {vm.state === 'conflict' && <WorkSurfaceState actionLabel={text.retry} description={text.conflictDescription} onAction={() => { controller.setQuery({ ...query }); void controller.refresh() }} state="conflict" title={text.conflictTitle} />}
    {showResolvedContent && <div
      className={[
        'work-surface-content',
        layout === 'list' ? 'work-surface-content--list' : 'work-surface-content--board',
        vm.stale ? 'work-surface-stale' : undefined,
      ].filter(Boolean).join(' ')}
      data-stale={vm.stale || undefined}
    ><WorkItemAdaptiveCollection columnWidths={columnWidths} columns={columns} copy={copy} density={density} items={uiItems} layout={layout} onColumnWidthChange={onColumnWidthChange} onMove={move} onOpen={open} onOpenProject={openProject} /><WorkSurfacePagination copy={copy} loading={collection.loading || collection.loadingMore} nextCursor={collection.nextCursor} onLoadMore={collection.loadMore} /></div>}
  </section>
}

export default WorkSurfaces
