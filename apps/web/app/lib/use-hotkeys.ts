'use client'

import { useEffect } from 'react'
import { isPlainKeyboardIntent } from './list-interactions'

export const HOTKEY_CHORD_TIMEOUT_MS = 1_000

export type PageHotkeyDestination = 'i' | 'a' | 's'

export type UseHotkeysOptions = Readonly<{
  getFilterTarget: () => HTMLInputElement | null
  getLayerOpen: () => boolean
  navigate: (destination: PageHotkeyDestination) => void
}>

export function isAvailableHotkeyFilter(target: HTMLInputElement | null): target is HTMLInputElement {
  if (!target?.isConnected || target.disabled || target.dataset.hotkeyFilter !== 'true') return false
  if (target.closest('[hidden], [inert], [aria-hidden="true"]')) return false
  const style = window.getComputedStyle(target)
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
  if (typeof target.checkVisibility === 'function') {
    try {
      if (!target.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
    } catch {
      // Older DOM implementations expose the method without accepting options.
      if (!target.checkVisibility()) return false
    }
  }
  return true
}

export function useHotkeys({ getFilterTarget, getLayerOpen, navigate }: UseHotkeysOptions): void {
  useEffect(() => {
    let pending = false
    let timeout: number | null = null
    const clearPending = (): void => {
      pending = false
      if (timeout !== null) {
        window.clearTimeout(timeout)
        timeout = null
      }
    }
    const startPending = (): void => {
      clearPending()
      pending = true
      timeout = window.setTimeout(clearPending, HOTKEY_CHORD_TIMEOUT_MS)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isPlainKeyboardIntent(event)) {
        clearPending()
        return
      }
      if (getLayerOpen()) {
        clearPending()
        return
      }
      const key = event.key.toLowerCase()
      if (pending) {
        clearPending()
        if (key === 'i' || key === 'a' || key === 's') {
          event.preventDefault()
          navigate(key)
        }
        return
      }
      if (key === 'g') {
        startPending()
        return
      }
      if (key !== 'f') return
      const filter = getFilterTarget()
      if (!isAvailableHotkeyFilter(filter)) return
      event.preventDefault()
      filter.focus()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      clearPending()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [getFilterTarget, getLayerOpen, navigate])
}
