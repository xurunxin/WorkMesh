'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiRequest, clearCsrfToken, saveCsrfToken } from './api'
import type { AuthenticatedActor } from './actor'

type AuthMe = { actor: AuthenticatedActor; csrfToken: string }

export function useAuthenticatedActor(): { actor: AuthenticatedActor | null; loading: boolean; error: string; refresh: () => Promise<void> } {
  const [actor, setActor] = useState<AuthenticatedActor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const requestGeneration = ++generation.current
    controller.current?.abort()
    const nextController = new AbortController()
    controller.current = nextController
    try {
      setLoading(true); setError('')
      const auth = await apiRequest<AuthMe>('/api/v1/auth/me', { signal: nextController.signal })
      if (nextController.signal.aborted || requestGeneration !== generation.current) return
      saveCsrfToken(auth.csrfToken)
      setActor(auth.actor)
    } catch (reason) {
      if (nextController.signal.aborted || requestGeneration !== generation.current) return
      if (reason instanceof ApiError && reason.status === 401) {
        setActor(null)
        clearCsrfToken()
        window.location.assign('/login')
        return
      }
      setError(reason instanceof Error ? reason.message : 'Unable to load session.')
    } finally {
      if (requestGeneration === generation.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      generation.current += 1
      controller.current?.abort()
    }
  }, [load])
  return { actor, loading, error, refresh: load }
}
