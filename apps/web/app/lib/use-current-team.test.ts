// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCurrentTeam } from './use-current-team'

vi.mock('./pagination', () => ({
  usePagedApiList: vi.fn(),
}))
vi.mock('./api', () => ({ apiRequest: vi.fn(), saveCsrfToken: vi.fn() }))

import { usePagedApiList } from './pagination'

const makeActor = (id = 'a1') => ({ id, display_name: 'A', workspace_id: 'w1' } as never)
const makeTeam = (id: string) => ({ id, name: `Team ${id}`, key: id.toUpperCase() })

describe('useCurrentTeam', () => {
  it('picks first team when actor present and teamId is unset', async () => {
    ;(usePagedApiList as ReturnType<typeof vi.fn>).mockReturnValue({ items: [makeTeam('t1'), makeTeam('t2')], loading: false, error: null, refresh: vi.fn(), loadMore: vi.fn(), nextCursor: null, loadingMore: false })
    const { result } = renderHook(() => useCurrentTeam(makeActor()))
    await act(() => Promise.resolve())
    expect(result.current.teamId).toBe('t1')
    expect(result.current.teams).toHaveLength(2)
  })
  it('returns null when actor is null', () => {
    ;(usePagedApiList as ReturnType<typeof vi.fn>).mockReturnValue({ items: [], loading: false, error: null, refresh: vi.fn(), loadMore: vi.fn(), nextCursor: null, loadingMore: false })
    const { result } = renderHook(() => useCurrentTeam(null))
    expect(result.current.teamId).toBeNull()
  })
})
