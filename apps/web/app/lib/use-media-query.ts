'use client'
import { useEffect, useState } from 'react'

// `useMediaQuery` mirrors the project's other client-only hooks
// (`use-toast`, `use-board-column-widths`): start with a stable default
// for SSR + the first client render, then sync with the real media
// query in an effect. This avoids hydration mismatches when the
// narrow-viewport layout differs from the wide one.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    setMatches(media.matches)
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', listener)
      return () => media.removeEventListener('change', listener)
    }
    // Safari < 14 fallback.
    media.addListener(listener)
    return () => media.removeListener(listener)
  }, [query])
  return matches
}
