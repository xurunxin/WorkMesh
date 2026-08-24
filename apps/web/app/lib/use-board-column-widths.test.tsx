// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  boardColumnWidthsKey,
  readBoardColumnWidths,
  useBoardColumnWidths,
  writeBoardColumnWidths,
} from './use-board-column-widths'

// Testing Library's automatic cleanup only fires when the test environment
// is `jsdom` and the project has been initialized for it; in this monorepo
// the suite mixes node + jsdom files, so we unmount explicitly to keep each
// test's DOM isolated.
afterEach(() => { cleanup() })

describe('board column width persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  describe('helpers', () => {
    it('round-trips widths through localStorage keyed by team', () => {
      writeBoardColumnWidths('team-1', { colA: 280, colB: 360 })
      expect(window.localStorage.getItem(boardColumnWidthsKey('team-1'))).toBe(JSON.stringify({ colA: 280, colB: 360 }))
      expect(readBoardColumnWidths('team-1')).toEqual({ colA: 280, colB: 360 })
    })

    it('returns an empty record for a team with no saved widths', () => {
      expect(readBoardColumnWidths('team-empty')).toEqual({})
    })

    it('returns an empty record when the stored payload is not an object', () => {
      window.localStorage.setItem(boardColumnWidthsKey('team-bad'), JSON.stringify([1, 2, 3]))
      expect(readBoardColumnWidths('team-bad')).toEqual({})
    })

    it('returns an empty record when the stored payload is corrupt JSON', () => {
      window.localStorage.setItem(boardColumnWidthsKey('team-bad'), '{not-json')
      expect(readBoardColumnWidths('team-bad')).toEqual({})
    })

    it('drops non-finite or non-positive entries when reading', () => {
      window.localStorage.setItem(boardColumnWidthsKey('team-mixed'), JSON.stringify({ good: 320, nan: Number.NaN, negative: -10, zero: 0, string: 'no' }))
      expect(readBoardColumnWidths('team-mixed')).toEqual({ good: 320 })
    })

    it('no-ops when teamId is null', () => {
      writeBoardColumnWidths(null, { colA: 280 })
      expect(window.localStorage.getItem(boardColumnWidthsKey('null'))).toBeNull()
      expect(readBoardColumnWidths(null)).toEqual({})
    })
  })

  describe('useBoardColumnWidths', () => {
    it('starts with empty widths and loads existing widths from storage', () => {
      window.localStorage.setItem(boardColumnWidthsKey('team-1'), JSON.stringify({ colA: 300 }))
      const { result } = renderHook(() => useBoardColumnWidths('team-1'))
      expect(result.current.widths).toEqual({ colA: 300 })
    })

    it('persists setWidth calls to localStorage keyed by the active team', () => {
      const { result } = renderHook(() => useBoardColumnWidths('team-1'))
      act(() => result.current.setWidth('colA', 360))
      expect(result.current.widths).toEqual({ colA: 360 })
      expect(JSON.parse(window.localStorage.getItem(boardColumnWidthsKey('team-1')) ?? '{}')).toEqual({ colA: 360 })
    })

    it('merges new widths with existing entries instead of replacing the map', () => {
      window.localStorage.setItem(boardColumnWidthsKey('team-1'), JSON.stringify({ colA: 280 }))
      const { result } = renderHook(() => useBoardColumnWidths('team-1'))
      act(() => result.current.setWidth('colB', 420))
      expect(result.current.widths).toEqual({ colA: 280, colB: 420 })
      expect(JSON.parse(window.localStorage.getItem(boardColumnWidthsKey('team-1')) ?? '{}')).toEqual({ colA: 280, colB: 420 })
    })

    it('reloads widths when the teamId changes', () => {
      window.localStorage.setItem(boardColumnWidthsKey('team-1'), JSON.stringify({ colA: 280 }))
      window.localStorage.setItem(boardColumnWidthsKey('team-2'), JSON.stringify({ colB: 480 }))
      const { result, rerender } = renderHook(({ teamId }: { teamId: string | null }) => useBoardColumnWidths(teamId), {
        initialProps: { teamId: 'team-1' as string | null },
      })
      expect(result.current.widths).toEqual({ colA: 280 })
      rerender({ teamId: 'team-2' })
      expect(result.current.widths).toEqual({ colB: 480 })
    })

    it('resets to empty when the teamId becomes null', () => {
      window.localStorage.setItem(boardColumnWidthsKey('team-1'), JSON.stringify({ colA: 280 }))
      const { result, rerender } = renderHook(({ teamId }: { teamId: string | null }) => useBoardColumnWidths(teamId), {
        initialProps: { teamId: 'team-1' as string | null },
      })
      expect(result.current.widths).toEqual({ colA: 280 })
      rerender({ teamId: null })
      expect(result.current.widths).toEqual({})
    })

    it('does not write to localStorage when teamId is null', () => {
      const { result } = renderHook(() => useBoardColumnWidths(null))
      act(() => result.current.setWidth('colA', 360))
      expect(window.localStorage.getItem(boardColumnWidthsKey('null'))).toBeNull()
      expect(result.current.widths).toEqual({ colA: 360 })
    })
  })
})
