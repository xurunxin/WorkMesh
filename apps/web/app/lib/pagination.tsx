'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiListRequest, appendUniquePage, pagedPath, type ListResponse } from './api'

type Options<T, R extends { id: string }> = {
  optional?: boolean
  limit?: number
  map?: (item: T) => R
}

type CollectionScope = {
  path: string | null
  limit: number
}

type ScopedPage<R> = ListResponse<R> & CollectionScope

export type PagedCollection<R extends { id: string }> = {
  items: R[]
  nextCursor: string | null
  loading: boolean
  loadingMore: boolean
  error: Error | null
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
}

const asError = (reason: unknown): Error =>
  reason instanceof Error ? reason : new Error('Unable to load this collection.')

export function usePagedApiList<T extends { id: string }, R extends { id: string } = T>(
  path: string | null,
  options: Options<T, R> = {},
): PagedCollection<R> {
  const optional = options.optional ?? false
  const limit = options.limit ?? 100
  const [page, setPage] = useState<ScopedPage<R>>({
    path,
    limit,
    items: [],
    nextCursor: null,
  })
  const [loading, setLoading] = useState(Boolean(path))
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const loadMoreInFlight = useRef(false)
  const refreshInFlight = useRef<number | null>(null)
  const activeScope = useRef<CollectionScope>({ path, limit })
  const mapRef = useRef(options.map)
  mapRef.current = options.map

  const request = useCallback(async (
    cursor: string | null,
    requestGeneration: number,
  ): Promise<ListResponse<R> | null> => {
    if (!path) return { items: [], nextCursor: null }
    const nextController = new AbortController()
    controller.current?.abort()
    controller.current = nextController
    try {
      const response = await apiListRequest<T>(
        pagedPath(path, cursor, limit),
        { signal: nextController.signal },
      )
      if (requestGeneration !== generation.current) return null
      const map = mapRef.current
      return {
        items: map ? response.items.map(map) : response.items as unknown as R[],
        nextCursor: response.nextCursor,
      }
    } catch (reason) {
      if (nextController.signal.aborted || requestGeneration !== generation.current) return null
      if (optional && reason instanceof ApiError && reason.status === 404)
        return { items: [], nextCursor: null }
      throw reason
    }
  }, [limit, optional, path])

  const refresh = useCallback(async () => {
    const scopeChanged = activeScope.current.path !== path || activeScope.current.limit !== limit
    activeScope.current = { path, limit }
    const requestGeneration = ++generation.current
    refreshInFlight.current = requestGeneration
    loadMoreInFlight.current = false
    setLoading(Boolean(path))
    setLoadingMore(false)
    setError(null)
    // Background refreshes keep the current tree mounted; a new query scope must not show stale rows.
    if (scopeChanged || !path) setPage({ path, limit, items: [], nextCursor: null })
    if (!path) {
      controller.current?.abort()
      controller.current = null
      if (refreshInFlight.current === requestGeneration) refreshInFlight.current = null
      return
    }
    try {
      const response = await request(null, requestGeneration)
      if (response && requestGeneration === generation.current)
        setPage({ ...response, path, limit })
    } catch (reason) {
      if (requestGeneration === generation.current) setError(asError(reason))
    } finally {
      if (requestGeneration === generation.current) setLoading(false)
      if (refreshInFlight.current === requestGeneration) refreshInFlight.current = null
    }
  }, [path, request])

  const pageMatchesScope = page.path === path && page.limit === limit

  const loadMore = useCallback(async () => {
    const cursor = pageMatchesScope ? page.nextCursor : null
    if (!path
      || !cursor
      || !pageMatchesScope
      || refreshInFlight.current !== null
      || loadMoreInFlight.current)
      return
    const requestGeneration = generation.current
    loadMoreInFlight.current = true
    setLoadingMore(true)
    setError(null)
    try {
      const response = await request(cursor, requestGeneration)
      if (response && requestGeneration === generation.current)
        setPage(current => current.path === path && current.limit === limit
          ? {
              path,
              limit,
              items: appendUniquePage(current.items, response.items),
              nextCursor: response.nextCursor,
            }
          : current)
    } catch (reason) {
      if (requestGeneration === generation.current) setError(asError(reason))
    } finally {
      if (requestGeneration === generation.current) {
        loadMoreInFlight.current = false
        setLoadingMore(false)
      }
    }
  }, [limit, page.nextCursor, pageMatchesScope, path, request])

  useEffect(() => {
    void refresh()
    return () => {
      generation.current += 1
      controller.current?.abort()
      loadMoreInFlight.current = false
      refreshInFlight.current = null
    }
  }, [refresh])

  return {
    items: pageMatchesScope ? page.items : [],
    nextCursor: pageMatchesScope ? page.nextCursor : null,
    loading: pageMatchesScope ? loading : Boolean(path),
    loadingMore: pageMatchesScope ? loadingMore : false,
    error: pageMatchesScope ? error : null,
    refresh,
    loadMore,
  }
}

export function LoadMoreButton({
  collection,
  label,
}: {
  collection: Pick<PagedCollection<{ id: string }>, 'nextCursor' | 'loading' | 'loadingMore' | 'loadMore'>
  label: string
}) {
  if (!collection.nextCursor) return null
  return (
    <button
      type="button"
      className="load-more"
      data-testid={`load-more-${label.toLowerCase().replaceAll(' ', '-')}`}
      disabled={collection.loading || collection.loadingMore}
      onClick={() => void collection.loadMore()}
    >
      {collection.loadingMore ? 'Loading…' : `Load more ${label}`}
    </button>
  )
}
