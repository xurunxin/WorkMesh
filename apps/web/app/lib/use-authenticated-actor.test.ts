// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

describe('useAuthenticatedActor', () => {
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
})
