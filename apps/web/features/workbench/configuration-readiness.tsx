'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { configurationReadinessResponseSchema, type ConfigurationReadinessQuery, type ConfigurationReadinessResponse } from '@workmesh/contracts'
import { Button } from '@workmesh/ui'
import { apiRequest } from '../../app/lib/api'
import { actorAuthorityScopeKey, type AuthenticatedActor } from '../../app/lib/actor'
import { useAuthorityLifetime } from '../../app/lib/use-authority-lifetime'
import { useRealtimeSubscription } from '../../app/lib/realtime'
import { useLocale } from '../../app/lib/i18n'
import { readinessHref, restoreReadinessFocus, saveReadinessReturn, type ReadinessKind } from '../../app/lib/configuration-readiness-navigation'
import styles from './configuration-readiness.module.css'

const dependencyOrder: ReadinessKind[] = ['repository', 'model', 'agent']
export function unmetReadiness(value: ConfigurationReadinessResponse | null): ReadinessKind[] {
  return dependencyOrder.filter(kind => {
    const check = value?.checks[kind]
    return check?.applicability === 'applicable' && check.state === 'blocked' && check.reasonCode === 'unmet'
  })
}
export function useConfigurationReadiness(actor: AuthenticatedActor, context: ConfigurationReadinessQuery | null) {
  const key = `${actorAuthorityScopeKey(actor)}:${JSON.stringify(context)}`
  const current = useRef(key); current.current = key
  const request = useRef<AbortController | null>(null)
  const epoch = useRef(0)
  const restoreRequested = useRef(true)
  const alive = useAuthorityLifetime()
  const [snapshot, setSnapshot] = useState<{ key: string; value: ConfigurationReadinessResponse | null; error: boolean; loading: boolean }>({ key, value: null, error: false, loading: false })
  const refresh = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController(); request.current = controller
    const version = ++epoch.current
    setSnapshot({ key, value: null, error: false, loading: Boolean(context) })
    if (!context) return
    try {
      const params = new URLSearchParams(context)
      const value = configurationReadinessResponseSchema.parse(await apiRequest<unknown>(`/api/v1/workbench/configuration-readiness?${params}`, { signal: controller.signal, cache: 'no-store' }))
      if (alive() && !controller.signal.aborted && current.current === key && epoch.current === version) {
        setSnapshot({ key, value, error: false, loading: false })
        // Wait for the committed DOM, then restore only this history entry's target.
        if (restoreRequested.current) {
          requestAnimationFrame(() => {
            if (alive() && current.current === key && epoch.current === version) {
              restoreReadinessFocus(); restoreRequested.current = false
            }
          })
        }
      }
    } catch {
      if (alive() && !controller.signal.aborted && current.current === key && epoch.current === version)
        setSnapshot({ key, value: null, error: true, loading: false })
    }
  }, [key, alive])
  useEffect(() => {
    void refresh()
    const resume = () => { if (document.visibilityState !== 'hidden') void refresh() }
    const navigate = () => { restoreRequested.current = true; resume() }
    window.addEventListener('focus', resume); window.addEventListener('pageshow', navigate); window.addEventListener('popstate', navigate)
    document.addEventListener('visibilitychange', resume)
    return () => {
      request.current?.abort(); ++epoch.current
      window.removeEventListener('focus', resume); window.removeEventListener('pageshow', navigate); window.removeEventListener('popstate', navigate)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [refresh])
  useRealtimeSubscription(actor.workspace_id ? [{ type: 'workspace', id: actor.workspace_id }] : [], () => { void refresh() })
  const visible = snapshot.key === key ? snapshot : { value: null, error: false, loading: Boolean(context) }
  return { ...visible, refresh, unmet: unmetReadiness(visible.value) }
}
export function ConfigurationReadiness({ state, context, conversationId }: {
  state: ReturnType<typeof useConfigurationReadiness>; context: ConfigurationReadinessQuery | null; conversationId: string | null
}) {
  const { readinessCopy: text } = useLocale()
  return <div className={styles.surface} data-testid="configuration-readiness">
    {!context ? <p>{text.contextRequired}</p>
      : state.loading ? <p role="status">{text.loading}</p>
        : state.error ? <div role="alert"><p>{text.loadFailed}</p><Button onClick={() => void state.refresh()} variant="secondary">{text.refresh}</Button></div>
          : state.value && <>
            {state.unmet.length > 0 && <section aria-labelledby="readiness-title" className={styles.banner} data-testid="readiness-banner">
              <div className={styles.heading}><h2 id="readiness-title" tabIndex={-1}>{text.remaining(state.unmet.length)}</h2><Button onClick={() => void state.refresh()} variant="ghost">{text.refresh}</Button></div>
              <ol>{state.unmet.map(kind => <li key={kind}><span>{text[kind]}</span><a id={`readiness-${kind}`} href={readinessHref(kind, context)} onClick={() => saveReadinessReturn(kind, conversationId)}>{text.configure}</a></li>)}</ol>
            </section>}
            {state.unmet.length === 0 && <h2 className={styles.srOnly} id="readiness-title" tabIndex={-1}>{text.configured}</h2>}
            <p className={styles.unknown}>{text.runnerUnknown}</p>
          </>}
  </div>
}
