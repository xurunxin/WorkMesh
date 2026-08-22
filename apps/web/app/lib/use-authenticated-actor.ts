'use client'
import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiRequest, clearCsrfToken, saveCsrfToken } from './api'
import type { AuthenticatedActor } from './actor'

type AuthMe = { actor: AuthenticatedActor; csrfToken: string }

export function useAuthenticatedActor(): { actor: AuthenticatedActor | null; loading: boolean; error: string; refresh: () => Promise<void> } {
  const [actor, setActor] = useState<AuthenticatedActor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true); setError('')
      const auth = await apiRequest<AuthMe>('/api/v1/auth/me')
      saveCsrfToken(auth.csrfToken)
      setActor(auth.actor)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        clearCsrfToken()
        window.location.assign('/login')
        return
      }
      setError(reason instanceof Error ? reason.message : 'Unable to load session.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  return { actor, loading, error, refresh: load }
}
