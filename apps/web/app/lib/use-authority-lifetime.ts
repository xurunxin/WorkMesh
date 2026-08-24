'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * Invalidates async continuations synchronously when an authenticated
 * authority subtree unmounts. State setters are harmless after unmount, but
 * history, focus, refreshes and toast stores are process-wide side effects.
 */
export function useAuthorityLifetime(): () => boolean {
  const active = useRef(true)

  useLayoutEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  return useCallback(() => active.current, [])
}
