'use client'
import { useCallback, useEffect, useState } from 'react'

const STORAGE_PREFIX = 'wm:board:widths:'

export const boardColumnWidthsKey = (teamId: string): string => `${STORAGE_PREFIX}${teamId}`

export function readBoardColumnWidths(teamId: string | null): Record<string, number> {
  if (!teamId || typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(boardColumnWidthsKey(teamId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const widths: Record<string, number> = {}
    for (const [columnId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        widths[columnId] = value
      }
    }
    return widths
  } catch {
    // Corrupt or unavailable localStorage; surface as an empty record rather
    // than crashing the board.
    return {}
  }
}

export function writeBoardColumnWidths(teamId: string | null, widths: Record<string, number>): void {
  if (!teamId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(boardColumnWidthsKey(teamId), JSON.stringify(widths))
  } catch {
    // localStorage may be unavailable (private mode, quota); the in-memory
    // state still reflects the change for the current session.
  }
}

export function useBoardColumnWidths(teamId: string | null): { widths: Record<string, number>; setWidth: (columnId: string, width: number) => void } {
  const [widths, setWidths] = useState<Record<string, number>>({})
  useEffect(() => {
    setWidths(readBoardColumnWidths(teamId))
  }, [teamId])
  const setWidth = useCallback((columnId: string, width: number) => {
    setWidths(current => {
      const next = { ...current, [columnId]: width }
      writeBoardColumnWidths(teamId, next)
      return next
    })
  }, [teamId])
  return { widths, setWidth }
}
