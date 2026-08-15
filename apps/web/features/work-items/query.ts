'use client'

import { useMemo } from 'react'
import { usePagedApiList } from '../../app/lib/pagination'
import type { PagedCollection } from '../../app/lib/pagination'
import { PRIORITIES, STATUS_CATEGORIES, type WorkItemDto, type WorkSurfaceLayout, type WorkSurfacePage, type WorkSurfaceQuery, type WorkSurfaceScope } from './contracts'

const setIfPresent = (params: URLSearchParams, key: string, value: string | boolean | undefined): void => {
  if (value === undefined || value === '') return
  params.set(key, typeof value === 'boolean' ? String(value) : value)
}

/** Serialize only canonical Work Item filters. Cursor/limit are owned by usePagedApiList. */
export function serializeWorkSurfaceQuery(query: WorkSurfaceQuery): string {
  const params = new URLSearchParams()
  setIfPresent(params, 'teamId', query.teamId)
  setIfPresent(params, 'search', query.search)
  setIfPresent(params, 'statusId', query.statusId)
  setIfPresent(params, 'priority', query.priority)
  setIfPresent(params, 'responsibleHumanActorId', query.responsibleHumanActorId ?? query.ownerId)
  setIfPresent(params, 'projectId', query.projectId)
  setIfPresent(params, 'milestoneId', query.milestoneId)
  setIfPresent(params, 'label', query.label)
  setIfPresent(params, 'statusCategory', query.statusCategory)
  if (query.mine) params.set('mine', 'true')
  const value = params.toString()
  return value ? `?${value}` : ''
}

export function workSurfaceQueryForScope(scope: WorkSurfaceScope, query: WorkSurfaceQuery, selectedProjectId?: string): WorkSurfaceQuery {
  const next: WorkSurfaceQuery = { ...query }
  if (scope === 'active') { next.statusCategory = 'started'; delete next.mine; delete next.projectId; delete next.milestoneId }
  else if (scope === 'backlog') { next.statusCategory = 'backlog'; delete next.mine; delete next.projectId; delete next.milestoneId }
  else if (scope === 'project-work-items') { next.projectId = selectedProjectId; delete next.mine }
  return next
}

/** Resolve the navigation scope encoded by a persisted query without treating the view as authority. */
export function workSurfaceScopeForQuery(query: WorkSurfaceQuery, fallback: WorkSurfaceScope): WorkSurfaceScope {
  if (query.projectId) return 'project-work-items'
  return fallback === 'project-work-items' || fallback === 'active' || fallback === 'backlog' ? 'my-work' : fallback
}

const optionalText = (value: string | null): string | undefined => value?.trim() || undefined

/** Parse only public, filter-only URL state. Cursor and authority never enter browser history. */
export function parseWorkSurfaceQuery(search: string): WorkSurfaceQuery {
  const params = new URLSearchParams(search)
  const priority = optionalText(params.get('priority'))
  const statusCategory = optionalText(params.get('statusCategory'))
  return {
    teamId: optionalText(params.get('teamId')),
    search: optionalText(params.get('search')),
    statusId: optionalText(params.get('statusId')),
    priority: priority && (PRIORITIES as readonly string[]).includes(priority) ? priority as WorkSurfaceQuery['priority'] : undefined,
    responsibleHumanActorId: optionalText(params.get('responsibleHumanActorId') ?? params.get('ownerId')),
    projectId: optionalText(params.get('projectId')),
    milestoneId: optionalText(params.get('milestoneId')),
    label: optionalText(params.get('label')),
    statusCategory: statusCategory && (STATUS_CATEGORIES as readonly string[]).includes(statusCategory) ? statusCategory as WorkSurfaceQuery['statusCategory'] : undefined,
    mine: params.get('mine') === 'true' || undefined,
  }
}

export function parseWorkSurfaceLayout(search: string): WorkSurfaceLayout {
  return new URLSearchParams(search).get('layout') === 'board' ? 'board' : 'list'
}

export function workSurfaceHref(scope: WorkSurfaceScope, query: WorkSurfaceQuery, layout: WorkSurfaceLayout): string {
  const params = new URLSearchParams()
  params.set('view', scope)
  for (const [key, value] of new URLSearchParams(serializeWorkSurfaceQuery(query).slice(1))) params.set(key, value)
  params.set('layout', layout)
  return `/?${params.toString()}`
}

export function workSurfacePath(query: WorkSurfaceQuery): string {
  return `/api/v1/work-items${serializeWorkSurfaceQuery(query)}`
}

export function normalizeWorkSurfacePage<T = WorkItemDto>(input: unknown): WorkSurfacePage<T> {
  if (Array.isArray(input)) return { items: input as T[], nextCursor: null }
  if (!input || typeof input !== 'object') throw new Error('Work Item response was not a collection.')
  const response = input as { items?: unknown; nextCursor?: unknown }
  if (!Array.isArray(response.items)) throw new Error('Work Item response did not contain items.')
  if (response.nextCursor !== null && response.nextCursor !== undefined && typeof response.nextCursor !== 'string') throw new Error('Work Item cursor was invalid.')
  return { items: response.items as T[], nextCursor: response.nextCursor ?? null }
}

export function appendWorkSurfacePage<T extends { id: string }>(current: WorkSurfacePage<T>, incoming: WorkSurfacePage<T>): WorkSurfacePage<T> {
  const byId = new Map(current.items.map(item => [item.id, item]))
  for (const item of incoming.items) byId.set(item.id, item)
  return { items: [...byId.values()], nextCursor: incoming.nextCursor }
}

export type WorkSurfaceQueryCollection = PagedCollection<WorkItemDto>

/** The only React query boundary for a Work Surface. List and Board consume this collection. */
export function useWorkSurfaceQuery(query: WorkSurfaceQuery): WorkSurfaceQueryCollection {
  const path = useMemo(() => workSurfacePath(query), [query])
  return usePagedApiList<WorkItemDto>(path)
}
