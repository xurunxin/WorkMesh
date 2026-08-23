// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ListResponse } from './api'

const apiMock = vi.hoisted(() => ({ apiListRequest: vi.fn() }))

vi.mock('./api', async importOriginal => {
  const original = await importOriginal<typeof import('./api')>()
  return { ...original, apiListRequest: apiMock.apiListRequest }
})

import { usePagedApiList } from './pagination'

type Item = { id: string; name: string }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

const page = (id?: string): ListResponse<Item> => ({
  items: id ? [{ id, name: id }] : [],
  nextCursor: null,
})

describe('usePagedApiList initialized collection authority', () => {
  beforeEach(() => {
    apiMock.apiListRequest.mockReset()
  })

  it('starts uninitialized and becomes initialized only after a successful response', async () => {
    const pending = deferred<ListResponse<Item>>()
    apiMock.apiListRequest.mockReturnValueOnce(pending.promise)

    const { result } = renderHook(() => usePagedApiList<Item>('/api/v1/items'))

    expect(result.current).toMatchObject({ initialized: false, items: [], loading: true })
    await act(async () => pending.resolve(page('item-a')))
    await waitFor(() => expect(result.current).toMatchObject({ initialized: true, loading: false }))
    expect(result.current.items.map(item => item.id)).toEqual(['item-a'])
  })

  it('aborts the discarded StrictMode request and lets only the active request initialize the scope', async () => {
    const discardedRequest = deferred<ListResponse<Item>>()
    const activeRequest = deferred<ListResponse<Item>>()
    apiMock.apiListRequest
      .mockReturnValueOnce(discardedRequest.promise)
      .mockReturnValueOnce(activeRequest.promise)

    const { result } = renderHook(
      () => usePagedApiList<Item>('/api/v1/items'),
      { reactStrictMode: true },
    )

    await waitFor(() => expect(apiMock.apiListRequest).toHaveBeenCalledTimes(2))
    expect(apiMock.apiListRequest.mock.calls.map(call => call[0])).toEqual([
      '/api/v1/items?limit=100',
      '/api/v1/items?limit=100',
    ])
    const discardedOptions = apiMock.apiListRequest.mock.calls[0]?.[1] as { signal?: AbortSignal } | undefined
    const activeOptions = apiMock.apiListRequest.mock.calls[1]?.[1] as { signal?: AbortSignal } | undefined
    expect(discardedOptions?.signal?.aborted).toBe(true)
    expect(activeOptions?.signal?.aborted).toBe(false)
    expect(result.current).toMatchObject({ initialized: false, items: [], loading: true })

    await act(async () => discardedRequest.resolve(page('discarded')))
    expect(result.current).toMatchObject({ initialized: false, items: [], loading: true })

    await act(async () => activeRequest.resolve(page('active')))
    await waitFor(() => expect(result.current).toMatchObject({ initialized: true, loading: false }))
    expect(result.current.items.map(item => item.id)).toEqual(['active'])
  })

  it('marks a real successful empty response as initialized', async () => {
    apiMock.apiListRequest.mockResolvedValueOnce(page())
    const { result } = renderHook(() => usePagedApiList<Item>('/api/v1/items'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ error: null, initialized: true, items: [], nextCursor: null })
  })

  it('retains initialized rows during same-scope refresh success and failure', async () => {
    apiMock.apiListRequest.mockResolvedValueOnce(page('stable'))
    const { result } = renderHook(() => usePagedApiList<Item>('/api/v1/items'))
    await waitFor(() => expect(result.current.initialized).toBe(true))

    const successfulRefresh = deferred<ListResponse<Item>>()
    apiMock.apiListRequest.mockReturnValueOnce(successfulRefresh.promise)
    act(() => { void result.current.refresh() })
    expect(result.current).toMatchObject({ initialized: true, loading: true })
    expect(result.current.items.map(item => item.id)).toEqual(['stable'])
    await act(async () => successfulRefresh.resolve(page('fresh')))
    await waitFor(() => expect(result.current.items.map(item => item.id)).toEqual(['fresh']))

    const failedRefresh = deferred<ListResponse<Item>>()
    apiMock.apiListRequest.mockReturnValueOnce(failedRefresh.promise)
    act(() => { void result.current.refresh() })
    expect(result.current).toMatchObject({ initialized: true, loading: true })
    await act(async () => failedRefresh.reject(new Error('refresh failed')))
    await waitFor(() => expect(result.current.error?.message).toBe('refresh failed'))
    expect(result.current).toMatchObject({ initialized: true, loading: false })
    expect(result.current.items.map(item => item.id)).toEqual(['fresh'])
  })

  it('keeps a failed new scope uninitialized and never infers an empty success', async () => {
    apiMock.apiListRequest.mockResolvedValueOnce(page('old'))
    const { result, rerender } = renderHook(
      ({ path }: { path: string | null }) => usePagedApiList<Item>(path),
      { initialProps: { path: '/api/v1/items?scope=old' as string | null } },
    )
    await waitFor(() => expect(result.current.initialized).toBe(true))

    const failedScope = deferred<ListResponse<Item>>()
    apiMock.apiListRequest.mockReturnValueOnce(failedScope.promise)
    rerender({ path: '/api/v1/items?scope=new' })
    expect(result.current).toMatchObject({ initialized: false, items: [], loading: true })
    await act(async () => failedScope.reject(new Error('new scope failed')))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ initialized: false, items: [] })
    expect(result.current.error?.message).toBe('new scope failed')
  })

  it('treats an explicitly optional 404 as an initialized empty response', async () => {
    apiMock.apiListRequest.mockRejectedValueOnce(new ApiError(404, 'not found'))
    const { result } = renderHook(() => usePagedApiList<Item>('/api/v1/optional', { optional: true }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ error: null, initialized: true, items: [], nextCursor: null })
  })

  it('keeps a non-optional 404 uninitialized and exposes the request error', async () => {
    const notFound = new ApiError(404, 'not found')
    apiMock.apiListRequest.mockRejectedValueOnce(notFound)
    const { result } = renderHook(() => usePagedApiList<Item>('/api/v1/required'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toMatchObject({ initialized: false, items: [], nextCursor: null })
    expect(result.current.error).toBe(notFound)
  })

  it('retains initialized rows through load-more success and failure', async () => {
    apiMock.apiListRequest.mockResolvedValueOnce({
      items: [{ id: 'stable', name: 'stable' }],
      nextCursor: 'next-page',
    })
    const { result } = renderHook(() => usePagedApiList<Item>('/api/v1/items'))
    await waitFor(() => expect(result.current.initialized).toBe(true))

    const successfulLoad = deferred<ListResponse<Item>>()
    apiMock.apiListRequest.mockReturnValueOnce(successfulLoad.promise)
    act(() => { void result.current.loadMore() })
    expect(result.current).toMatchObject({ initialized: true, loadingMore: true })
    expect(result.current.items.map(item => item.id)).toEqual(['stable'])
    await act(async () => successfulLoad.resolve(page('next')))
    await waitFor(() => expect(result.current.loadingMore).toBe(false))
    expect(result.current).toMatchObject({ initialized: true })
    expect(result.current.items.map(item => item.id)).toEqual(['stable', 'next'])

    apiMock.apiListRequest.mockResolvedValueOnce({
      items: [{ id: 'stable', name: 'stable' }],
      nextCursor: 'next-page',
    })
    await act(async () => { await result.current.refresh() })
    const failedLoad = deferred<ListResponse<Item>>()
    apiMock.apiListRequest.mockReturnValueOnce(failedLoad.promise)
    act(() => { void result.current.loadMore() })
    expect(result.current).toMatchObject({ initialized: true, loadingMore: true })
    await act(async () => failedLoad.reject(new Error('load more failed')))
    await waitFor(() => expect(result.current.loadingMore).toBe(false))
    expect(result.current).toMatchObject({ initialized: true, loading: false, loadingMore: false })
    expect(result.current.items.map(item => item.id)).toEqual(['stable'])
    expect(result.current.nextCursor).toBe('next-page')
    expect(result.current.error?.message).toBe('load more failed')
  })

  it('single-flights each explicit cursor and makes no request after the terminal cursor', async () => {
    apiMock.apiListRequest.mockResolvedValueOnce({
      items: [{ id: 'page-1', name: 'page-1' }],
      nextCursor: 'p2',
    })
    const { result } = renderHook(() => usePagedApiList<Item>('/api/v1/items'))
    await waitFor(() => expect(result.current.initialized).toBe(true))

    const delayedPage = deferred<ListResponse<Item>>()
    apiMock.apiListRequest.mockReturnValueOnce(delayedPage.promise)
    act(() => {
      void result.current.loadMore()
      void result.current.loadMore()
      void result.current.loadMore()
    })

    expect(apiMock.apiListRequest).toHaveBeenCalledTimes(2)
    expect(apiMock.apiListRequest.mock.calls[1]?.[0]).toBe('/api/v1/items?limit=100&cursor=p2')
    expect(result.current).toMatchObject({ initialized: true, loadingMore: true, nextCursor: 'p2' })
    await act(async () => delayedPage.resolve({
      items: [{ id: 'page-2', name: 'page-2' }],
      nextCursor: 'p3',
    }))
    await waitFor(() => expect(result.current.loadingMore).toBe(false))
    expect(result.current.items.map(item => item.id)).toEqual(['page-1', 'page-2'])
    expect(result.current.nextCursor).toBe('p3')

    const terminalPage = deferred<ListResponse<Item>>()
    apiMock.apiListRequest.mockReturnValueOnce(terminalPage.promise)
    act(() => {
      void result.current.loadMore()
      void result.current.loadMore()
      void result.current.loadMore()
    })

    expect(apiMock.apiListRequest).toHaveBeenCalledTimes(3)
    expect(apiMock.apiListRequest.mock.calls[2]?.[0]).toBe('/api/v1/items?limit=100&cursor=p3')
    await act(async () => terminalPage.resolve({
      items: [{ id: 'page-3', name: 'page-3' }],
      nextCursor: null,
    }))
    await waitFor(() => expect(result.current.loadingMore).toBe(false))
    expect(result.current.items.map(item => item.id)).toEqual(['page-1', 'page-2', 'page-3'])
    expect(result.current.nextCursor).toBeNull()

    act(() => {
      void result.current.loadMore()
      void result.current.loadMore()
    })
    expect(apiMock.apiListRequest).toHaveBeenCalledTimes(3)
  })

  it('revokes an initialized scope during in-flight load-more, aborts it, and ignores its late response', async () => {
    apiMock.apiListRequest.mockResolvedValueOnce({
      items: [{ id: 'old', name: 'old' }],
      nextCursor: 'next-page',
    })
    const oldLoadMore = deferred<ListResponse<Item>>()
    const newScope = deferred<ListResponse<Item>>()
    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => usePagedApiList<Item>(path),
      { initialProps: { path: '/api/v1/items?scope=old' } },
    )
    await waitFor(() => expect(result.current.initialized).toBe(true))

    apiMock.apiListRequest
      .mockReturnValueOnce(oldLoadMore.promise)
      .mockReturnValueOnce(newScope.promise)
    act(() => { void result.current.loadMore() })
    expect(result.current).toMatchObject({ initialized: true, loading: false, loadingMore: true })
    expect(result.current.items.map(item => item.id)).toEqual(['old'])
    const oldLoadOptions = apiMock.apiListRequest.mock.calls[1]?.[1] as { signal?: AbortSignal } | undefined

    rerender({ path: '/api/v1/items?scope=new' })
    expect(result.current).toMatchObject({ initialized: false, items: [], loading: true, loadingMore: false })
    expect(oldLoadOptions?.signal?.aborted).toBe(true)
    await waitFor(() => expect(apiMock.apiListRequest).toHaveBeenCalledTimes(3))

    await act(async () => oldLoadMore.resolve(page('late-old-page')))
    expect(result.current).toMatchObject({ initialized: false, items: [], loading: true, loadingMore: false })

    await act(async () => newScope.resolve(page('new')))
    await waitFor(() => expect(result.current).toMatchObject({ initialized: true, loading: false }))
    expect(result.current.items.map(item => item.id)).toEqual(['new'])
  })

  it('revokes initialized old rows synchronously on a path/limit scope change and ignores an old refresh late response', async () => {
    apiMock.apiListRequest.mockResolvedValueOnce(page('old'))
    const oldRefresh = deferred<ListResponse<Item>>()
    const newScope = deferred<ListResponse<Item>>()
    const { result, rerender } = renderHook(
      ({ limit, path }: { limit: number; path: string | null }) => usePagedApiList<Item>(path, { limit }),
      { initialProps: { limit: 50, path: '/api/v1/items?scope=old' as string | null } },
    )
    await waitFor(() => expect(result.current.initialized).toBe(true))
    expect(result.current.items.map(item => item.id)).toEqual(['old'])

    apiMock.apiListRequest.mockReturnValueOnce(oldRefresh.promise).mockReturnValueOnce(newScope.promise)
    act(() => { void result.current.refresh() })
    expect(result.current).toMatchObject({ initialized: true, loading: true })

    rerender({ limit: 100, path: '/api/v1/items?scope=new' })
    expect(result.current).toMatchObject({ initialized: false, items: [], loading: true })
    await waitFor(() => expect(apiMock.apiListRequest).toHaveBeenCalledTimes(3))
    await act(async () => oldRefresh.resolve(page('late-old')))
    expect(result.current).toMatchObject({ initialized: false, items: [] })
    await act(async () => newScope.resolve(page('new')))
    await waitFor(() => expect(result.current.initialized).toBe(true))
    expect(result.current.items.map(item => item.id)).toEqual(['new'])
  })

  it('revokes initialized rows when only the limit changes', async () => {
    apiMock.apiListRequest.mockResolvedValueOnce(page('old'))
    const newLimit = deferred<ListResponse<Item>>()
    const { result, rerender } = renderHook(
      ({ limit }: { limit: number }) => usePagedApiList<Item>('/api/v1/items', { limit }),
      { initialProps: { limit: 50 } },
    )
    await waitFor(() => expect(result.current.initialized).toBe(true))

    apiMock.apiListRequest.mockReturnValueOnce(newLimit.promise)
    rerender({ limit: 100 })
    expect(result.current).toMatchObject({ initialized: false, items: [], loading: true })
    await act(async () => newLimit.resolve(page('new-limit')))
    await waitFor(() => expect(result.current.initialized).toBe(true))
    expect(result.current.items.map(item => item.id)).toEqual(['new-limit'])
  })

  it('revokes the same path when the non-secret authority scope changes and ignores the late old principal', async () => {
    apiMock.apiListRequest.mockResolvedValueOnce(page('principal-a'))
    const oldRefresh = deferred<ListResponse<Item>>()
    const principalB = deferred<ListResponse<Item>>()
    const { result, rerender } = renderHook(
      ({ scopeKey }: { scopeKey: string }) => usePagedApiList<Item>('/api/v1/items', { scopeKey }),
      { initialProps: { scopeKey: 'workspace:principal-a:admin' } },
    )
    await waitFor(() => expect(result.current.initialized).toBe(true))
    apiMock.apiListRequest.mockReturnValueOnce(oldRefresh.promise).mockReturnValueOnce(principalB.promise)
    act(() => { void result.current.refresh() })
    const principalAOptions = apiMock.apiListRequest.mock.calls[1]?.[1] as { signal?: AbortSignal } | undefined

    rerender({ scopeKey: 'workspace:principal-b:member' })
    expect(result.current).toMatchObject({ initialized: false, items: [], loading: true })
    expect(principalAOptions?.signal?.aborted).toBe(true)
    await waitFor(() => expect(apiMock.apiListRequest).toHaveBeenCalledTimes(3))
    await act(async () => oldRefresh.resolve(page('late-principal-a')))
    expect(result.current).toMatchObject({ initialized: false, items: [] })
    await act(async () => principalB.resolve(page('principal-b')))
    await waitFor(() => expect(result.current.initialized).toBe(true))
    expect(result.current.items.map(item => item.id)).toEqual(['principal-b'])
  })

  it('treats path=null as unavailable authority, not a resolved empty collection', async () => {
    apiMock.apiListRequest.mockResolvedValueOnce(page('authorized'))
    const { result, rerender } = renderHook(
      ({ path }: { path: string | null }) => usePagedApiList<Item>(path),
      { initialProps: { path: '/api/v1/items' as string | null } },
    )
    await waitFor(() => expect(result.current.initialized).toBe(true))

    rerender({ path: null })
    expect(result.current).toMatchObject({ error: null, initialized: false, items: [], loading: false, nextCursor: null })
    expect(apiMock.apiListRequest).toHaveBeenCalledTimes(1)
  })
})
