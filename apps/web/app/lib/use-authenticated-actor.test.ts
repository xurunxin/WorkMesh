// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { useAuthenticatedActor } from './use-authenticated-actor'

vi.mock('./api', () => ({
  ApiError: class ApiError extends Error { constructor(public status: number, m: string) { super(m) } },
  apiRequest: vi.fn(),
  saveCsrfToken: vi.fn(),
  clearCsrfToken: vi.fn(),
}))

import { apiRequest, clearCsrfToken } from './api'

const mockLocation = (): void => {
  ;(globalThis as unknown as { location: { assign: ReturnType<typeof vi.fn> } }).location = { assign: vi.fn() }
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, reject, resolve }
}

describe('useAuthenticatedActor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns actor on success', async () => {
    mockLocation()
    ;(apiRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ actor: { id: 'a1', display_name: 'A', workspace_id: 'w1' }, csrfToken: 't1' })
    const { result } = renderHook(() => useAuthenticatedActor())
    await act(() => Promise.resolve())
    expect(result.current.actor?.id).toBe('a1')
    expect(result.current.loading).toBe(false)
  })
  it('redirects to /login on 401', async () => {
    mockLocation()
    ;(apiRequest as ReturnType<typeof vi.fn>).mockRejectedValue(new ApiError(401, 'unauth'))
    renderHook(() => useAuthenticatedActor())
    await act(() => Promise.resolve())
    expect(clearCsrfToken).toHaveBeenCalled()
    expect((globalThis as unknown as { location: { assign: ReturnType<typeof vi.fn> } }).location.assign).toHaveBeenCalledWith('/login')
  })

  it('revokes the active actor before redirecting after a refresh 401', async () => {
    mockLocation()
    ;(apiRequest as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ actor: { id: 'a1', display_name: 'A', workspace_id: 'w1', workspace_role: 'admin' }, csrfToken: 't1' })
      .mockRejectedValueOnce(new ApiError(401, 'expired'))
    const { result } = renderHook(() => useAuthenticatedActor())
    await act(() => Promise.resolve())
    expect(result.current.actor?.id).toBe('a1')

    await act(async () => { await result.current.refresh() })

    expect(result.current.actor).toBeNull()
    expect(clearCsrfToken).toHaveBeenCalledTimes(1)
    expect((globalThis as unknown as { location: { assign: ReturnType<typeof vi.fn> } }).location.assign).toHaveBeenCalledTimes(1)
    expect((globalThis as unknown as { location: { assign: ReturnType<typeof vi.fn> } }).location.assign).toHaveBeenCalledWith('/login')
  })

  it('aborts and ignores a late actor response after a newer refresh wins', async () => {
    mockLocation()
    const stale = deferred<{ actor: { id: string; display_name: string; workspace_id: string; workspace_role: 'admin' }; csrfToken: string }>()
    ;(apiRequest as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ actor: { id: 'initial', display_name: 'Initial', workspace_id: 'w1', workspace_role: 'admin' }, csrfToken: 'initial-token' })
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce({ actor: { id: 'current', display_name: 'Current', workspace_id: 'w2', workspace_role: 'admin' }, csrfToken: 'current-token' })
    const { result } = renderHook(() => useAuthenticatedActor())
    await act(() => Promise.resolve())

    let staleRefresh!: Promise<void>
    act(() => { staleRefresh = result.current.refresh() })
    const staleSignal = (apiRequest as ReturnType<typeof vi.fn>).mock.calls[1]?.[1]?.signal as AbortSignal
    await act(async () => { await result.current.refresh() })
    expect(staleSignal.aborted).toBe(true)

    await act(async () => { stale.resolve({ actor: { id: 'stale', display_name: 'Stale', workspace_id: 'w1', workspace_role: 'admin' }, csrfToken: 'stale-token' }); await staleRefresh })
    expect(result.current.actor?.id).toBe('current')
  })

  it('does not redirect when a stale 401 settles after a newer actor succeeds', async () => {
    mockLocation()
    const stale = deferred<never>()
    ;(apiRequest as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ actor: { id: 'initial', display_name: 'Initial', workspace_id: 'w1', workspace_role: 'member' }, csrfToken: 'initial-token' })
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce({ actor: { id: 'current', display_name: 'Current', workspace_id: 'w2', workspace_role: 'member' }, csrfToken: 'current-token' })
    const { result } = renderHook(() => useAuthenticatedActor())
    await act(() => Promise.resolve())

    let staleRefresh!: Promise<void>
    act(() => { staleRefresh = result.current.refresh() })
    await act(async () => { await result.current.refresh() })
    await act(async () => { stale.reject(new ApiError(401, 'stale')); await staleRefresh })

    expect(result.current.actor?.id).toBe('current')
    expect(clearCsrfToken).not.toHaveBeenCalled()
    expect((globalThis as unknown as { location: { assign: ReturnType<typeof vi.fn> } }).location.assign).not.toHaveBeenCalled()
  })
})
