// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCurrentTeam } from './use-current-team'
import { ApiError } from './api'

vi.mock('./pagination', () => ({
  usePagedApiList: vi.fn(),
}))
vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>()
  return { ...actual, apiRequest: vi.fn(), saveCsrfToken: vi.fn() }
})

import { usePagedApiList } from './pagination'

const makeActor = (id = 'a1') => ({ id, display_name: 'A', workspace_id: 'w1' } as never)
const makeTeam = (id: string) => ({ id, name: `Team ${id}`, key: id.toUpperCase() })
type TestPage = {
  error: Error | null
  initialized: boolean
  items: ReturnType<typeof makeTeam>[]
  loadMore: ReturnType<typeof vi.fn>
  loading: boolean
  loadingMore: boolean
  nextCursor: string | null
  refresh: ReturnType<typeof vi.fn>
}
const page = (overrides: Partial<TestPage> = {}): TestPage => ({
  error: null,
  initialized: true,
  items: [makeTeam('t1'), makeTeam('t2')],
  loadMore: vi.fn(),
  loading: false,
  loadingMore: false,
  nextCursor: null,
  refresh: vi.fn(),
  ...overrides,
})

describe('useCurrentTeam', () => {
  beforeEach(() => {
    ;(usePagedApiList as ReturnType<typeof vi.fn>).mockReset()
  })

  it('picks first team when actor present and teamId is unset', async () => {
    ;(usePagedApiList as ReturnType<typeof vi.fn>).mockReturnValue(page())
    const { result } = renderHook(() => useCurrentTeam(makeActor()))
    await act(() => Promise.resolve())
    expect(result.current.teamId).toBe('t1')
    expect(result.current.teams).toHaveLength(2)
    expect(result.current.initialized).toBe(true)
  })
  it('returns null when actor is null', () => {
    ;(usePagedApiList as ReturnType<typeof vi.fn>).mockReturnValue(page({ initialized: false, items: [] }))
    const { result } = renderHook(() => useCurrentTeam(null))
    expect(result.current.teamId).toBeNull()
    expect(result.current.initialized).toBe(false)
  })

  it('does not treat rows as authoritative or select a team before initialization', async () => {
    ;(usePagedApiList as ReturnType<typeof vi.fn>).mockReturnValue(page({ initialized: false, loading: true }))
    const { result } = renderHook(() => useCurrentTeam(makeActor()))
    await act(() => Promise.resolve())

    expect(result.current).toMatchObject({ initialized: false, loading: true, teamId: null })
  })

  it('retains the selected team and initialized authority during a same-scope refresh', async () => {
    const collection = page()
    ;(usePagedApiList as ReturnType<typeof vi.fn>).mockImplementation(() => collection)
    const { result, rerender } = renderHook(() => useCurrentTeam(makeActor()))
    await act(() => Promise.resolve())
    act(() => result.current.setTeamId('t2'))

    collection.loading = true
    rerender()
    await act(() => Promise.resolve())
    expect(result.current).toMatchObject({ initialized: true, loading: true, teamId: 't2' })
  })

  it('exposes an initial failure without claiming an initialized empty Team authority', () => {
    const failure = new Error('team request failed')
    ;(usePagedApiList as ReturnType<typeof vi.fn>).mockReturnValue(page({
      error: failure,
      initialized: false,
      items: [],
    }))
    const { result } = renderHook(() => useCurrentTeam(makeActor()))

    expect(result.current).toMatchObject({ error: failure, initialized: false, teamId: null, teams: [] })
  })

  it('retains a resolved Team for a network refresh failure but revokes it for 403', async () => {
    const collection = page({ error: new TypeError('network failed') })
    ;(usePagedApiList as ReturnType<typeof vi.fn>).mockImplementation(() => collection)
    const { result, rerender } = renderHook(() => useCurrentTeam(makeActor()))
    await act(() => Promise.resolve())
    expect(result.current).toMatchObject({ initialized: true, teamId: 't1' })

    collection.error = new ApiError(403, 'forbidden')
    rerender()
    expect(result.current).toMatchObject({ initialized: false, teamId: null, teams: [] })
  })
})
