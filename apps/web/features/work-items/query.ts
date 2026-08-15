'use client'

import { useMemo } from 'react'
import { usePagedApiList } from '../../app/lib/pagination'
import type { PagedCollection } from '../../app/lib/pagination'
import { type WorkItemDto, type WorkSurfacePage, type WorkSurfaceQuery, type WorkSurfaceScope } from './contracts'

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
  setIfPresent(params, 'label', query.label)
  setIfPresent(params, 'statusCategory', query.statusCategory)
  if (query.mine) params.set('mine', 'true')
  const value = params.toString()
  return value ? `?${value}` : ''
}

export function workSurfaceQueryForScope(scope: WorkSurfaceScope, query: WorkSurfaceQuery, selectedProjectId?: string): WorkSurfaceQuery {
  const next: WorkSurfaceQuery = { ...query }
  if (scope === 'my-work') { next.mine = true; delete next.responsibleHumanActorId; delete next.ownerId; delete next.projectId; delete next.statusCategory }
  else if (scope === 'active') { next.statusCategory = 'started'; delete next.mine; delete next.projectId }
  else if (scope === 'backlog') { next.statusCategory = 'backlog'; delete next.mine; delete next.projectId }
  else if (scope === 'project-work-items') { next.projectId = selectedProjectId; delete next.mine }
  return next
}

/** Resolve the navigation scope encoded by a persisted query without treating the view as authority. */
export function workSurfaceScopeForQuery(query: WorkSurfaceQuery, fallback: WorkSurfaceScope): WorkSurfaceScope {
  if (query.projectId) return 'project-work-items'
  if (query.mine) return 'my-work'
  if (query.statusCategory === 'started') return 'active'
  if (query.statusCategory === 'backlog') return 'backlog'
  return fallback
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
