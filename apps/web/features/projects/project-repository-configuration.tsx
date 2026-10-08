'use client'

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  providerConnectionInputSchema, providerConnectionConfigurationSchema, repositoryInputSchema,
  repositoryConfigurationPageSchema, repositoryContextInputSchema, repositoryContextActionSchema,
  repositoryContextConfigurationSchema, type RepositoryConfiguration, type RepositoryContextConfiguration, type RepositoryContextInput,
} from '@workmesh/contracts'
import { Button } from '@workmesh/ui'
import { ApiError, apiMutation, apiRequest, json } from '../../app/lib/api'
import { actorAuthorityScopeKey, type AuthenticatedActor } from '../../app/lib/actor'
import { useAuthorityLifetime } from '../../app/lib/use-authority-lifetime'
import { useLocale } from '../../app/lib/i18n'
import { useRealtimeSubscription } from '../../app/lib/realtime'
import styles from './project-repository-configuration.module.css'

type ContextInput = RepositoryContextInput
type PendingContext = { id: string; repositoryId: string; body: ContextInput; deadline: number }
const sameContext = (value: RepositoryContextConfiguration, pending: PendingContext) =>
  value.provider_action_id === pending.id && value.repository_id === pending.repositoryId
  && value.project_id === (pending.body.projectId ?? null)
  && value.work_item_id === (pending.body.workItemId ?? null)
  && value.session_id === (pending.body.sessionId ?? null)
  && value.base_sha === pending.body.baseSha && value.base_branch === pending.body.baseBranch
  && value.branch_pattern === pending.body.branchPattern
  && JSON.stringify(value.allowed_paths) === JSON.stringify(pending.body.allowedPaths)
  && JSON.stringify(value.permissions) === JSON.stringify(pending.body.permissions)
const permissions: ContextInput['permissions'] = ['read', 'write_branch', 'open_pr', 'review', 'merge', 'ci']

export function ProjectRepositoryConfiguration({ actor, teamId, projectId, workItemId, onCreateProject }: {
  actor: AuthenticatedActor; teamId: string; projectId: string | null; workItemId?: string | null; onCreateProject: () => void
}) {
  const { readinessCopy: text } = useLocale()
  const alive = useAuthorityLifetime()
  const [repositories, setRepositories] = useState<RepositoryConfiguration[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [repositoryId, setRepositoryId] = useState('')
  const [contexts, setContexts] = useState<RepositoryContextConfiguration[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const sectionRef = useRef<HTMLElement>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [gitea, setGitea] = useState(false)
  const [provider, setProvider] = useState<'github' | 'gitea'>('github')
  const latestProvider = useRef(provider); latestProvider.current = provider
  const [connectionId, setConnectionId] = useState('')
  const [publicFields, setPublicFields] = useState({ accountId: '', displayName: '', installationId: '', appId: '', baseUrl: '', externalId: '', fullName: '', defaultBranch: 'main', cloneUrl: '' })
  const [secrets, setSecrets] = useState({ webhookSecret: '', privateKey: '', accessToken: '' })
  const [contextFields, setContextFields] = useState({ baseBranch: 'main', baseSha: '', branchPattern: 'workmesh/{workItemKey}-{slug}', allowedPaths: '.' })
  const [selectedPermissions, setSelectedPermissions] = useState<ContextInput['permissions']>(['read'])
  const [pending, setPending] = useState<PendingContext | null>(null)
  const pendingRef = useRef<PendingContext | null>(null)
  const [waiting, setWaiting] = useState(false)
  const editedPending = useRef(false)
  const shaInput = useRef<HTMLInputElement>(null)
  const latestText = useRef(text); latestText.current = text
  const [requestGeneration, setRequestGeneration] = useState(0)
  const [legacyConflict, setLegacyConflict] = useState(false)
  const contextAttempt = useRef<{ scope: string; body: string } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const target = workItemId ? { workItemId } : projectId ? { projectId } : null
  const targetKey = JSON.stringify(target)
  const scope = `${actorAuthorityScopeKey(actor)}:${teamId}:${targetKey}`
  const latest = useRef(scope); latest.current = scope
  const selectedRepository = useRef(repositoryId); selectedRepository.current = repositoryId
  const loadedPages = useRef({ scope, count: 1, initialized: false })
  const contextScope = `${scope}:${repositoryId}`
  const latestContext = useRef(contextScope); latestContext.current = contextScope
  const repository = repositories.find(item => item.id === repositoryId)
  const canWrite = Boolean(repository?.can_configure_context && !loading && !error && target)
  const clearSecrets = () => setSecrets({ webhookSecret: '', privateKey: '', accessToken: '' })
  const replacePending = (value: PendingContext | null) => { pendingRef.current = value; setPending(value) }
  const handleError = (reason: unknown) => {
    clearSecrets()
    setWaiting(false)
    if (reason instanceof ApiError && [401, 403, 404].includes(reason.status)) { setRepositories([]); setContexts([]); setRepositoryId(''); setCursor(null); replacePending(null) }
    if (reason instanceof ApiError && reason.code === 'IDEMPOTENCY_KEY_REUSED') { setLegacyConflict(true); setError(text.reusedKey) }
    else setError(reason instanceof Error && reason.name === 'ZodError' ? text.validationFailed : text.commandFailed)
  }
  const load = useCallback(async (next: string | null = null, retryCursor = true) => {
    const version = ++generation.current
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    setLoading(true); setError('')
    try {
      const retainedScope = loadedPages.current.scope === scope
      const selected = retainedScope ? selectedRepository.current : ''
      const expanded = retainedScope ? loadedPages.current.count : 1
      const initialized = retainedScope && loadedPages.current.initialized
      const items: RepositoryConfiguration[] = []
      let after = next
      let pages = 0
      do {
        const params = new URLSearchParams({ teamId, availableOnly: 'true', limit: '20' })
        if (after) params.set('cursor', after)
        const page = repositoryConfigurationPageSchema.parse(await apiRequest<unknown>(`/api/v1/repositories?${params}`, { signal: abort.signal, cache: 'no-store' }))
        if (!alive() || abort.signal.aborted || latest.current !== scope || version !== generation.current) return
        items.push(...page.items); after = page.nextCursor; ++pages
        // Refresh expanded pages, then follow shifted pages until the selection
        // is verified or the authorized list is exhausted. Never select a substitute.
      } while (!next && after && (pages < expanded || Boolean(selected && !items.some(item => item.id === selected))))
      if (!alive() || abort.signal.aborted || latest.current !== scope || version !== generation.current) return
      loadedPages.current = { scope, count: next ? expanded + 1 : pages, initialized: true }
      setRepositories(current => [...new Map([...(next ? current : []), ...items].map(item => [item.id, item])).values()])
      setCursor(after)
      if (!next) setRepositoryId(selected ? (items.some(item => item.id === selected) ? selected : '') : initialized ? '' : items[0]?.id ?? '')
    } catch (reason) {
      if (!alive() || abort.signal.aborted || latest.current !== scope || version !== generation.current) return
      if (retryCursor && reason instanceof ApiError && reason.code === 'PAGINATION_CURSOR_MISMATCH') { void load(null, false); return }
      handleError(reason)
    } finally { if (alive() && latest.current === scope && version === generation.current) setLoading(false) }
  }, [scope, alive, teamId, text])
  const readContexts = useCallback(async (signal?: AbortSignal) => {
    if (!repositoryId) { setContexts([]); return [] }
    try {
      const values = repositoryContextConfigurationSchema.array().parse(await apiRequest<unknown>(`/api/v1/repositories/${repositoryId}/context`, { signal, cache: 'no-store' }))
      const matches = values.filter(value => value.repository_id === repositoryId && (workItemId ? value.work_item_id === workItemId : value.project_id === projectId))
      if (alive() && latestContext.current === contextScope && !signal?.aborted) {
        setContexts(matches)
        const original = pendingRef.current
        if (original && matches.some(value => sameContext(value, original))) {
          setNotice(editedPending.current ? latestText.current.previousContextSaved : latestText.current.saved)
          replacePending(null); setWaiting(false); contextAttempt.current = null
        }
      }
      else return []
      return matches
    } catch (reason) {
      if (!alive() || latestContext.current !== contextScope || signal?.aborted) return []
      throw reason
    }
  }, [repositoryId, targetKey, scope, alive])
  const refreshFeatures = useCallback(async (signal?: AbortSignal) => {
    try {
      const value = await apiRequest<{ features: Array<{ key: string; enabled: boolean }> }>('/api/v1/features', { signal, cache: 'no-store' })
      if (!alive() || latest.current !== scope || signal?.aborted) return
      const enabled = value.features.some(feature => feature.key === 'WORKMESH_BETA_GITEA' && feature.enabled)
      setGitea(enabled)
      if (!enabled && latestProvider.current === 'gitea') { setProvider('github'); clearSecrets() }
    } catch {
      if (alive() && latest.current === scope && !signal?.aborted) {
        setGitea(false)
        if (latestProvider.current === 'gitea') { setProvider('github'); clearSecrets() }
      }
    }
  }, [scope, alive])
  useEffect(() => {
    void load()
    const features = new AbortController()
    void refreshFeatures(features.signal)
    return () => { controller.current?.abort(); features.abort(); ++generation.current }
  }, [load])
  useEffect(() => {
    const section = sectionRef.current
    if (!section || window.location.hash !== '#project-repository-configuration') return
    let active = true
    let focused = false
    const restore = () => {
      if (!active || (focused && document.activeElement !== section)) return
      section.scrollIntoView({ block: 'start', behavior: 'instant' })
      section.focus({ preventScroll: true }); focused = true
    }
    // Async project data and router scroll restoration can move a focused anchor.
    // Keep it reachable until the user takes over; never fight their scrolling.
    const stop = () => { active = false }
    const frame = requestAnimationFrame(restore)
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(restore)
    resized?.observe(section)
    if (section.previousElementSibling) resized?.observe(section.previousElementSibling)
    const mutated = new MutationObserver(restore)
    if (section.parentElement) mutated.observe(section.parentElement, { childList: true, subtree: true })
    for (const event of ['keydown', 'pointerdown', 'wheel', 'touchstart']) window.addEventListener(event, stop, { passive: true })
    return () => {
      active = false; cancelAnimationFrame(frame); resized?.disconnect(); mutated.disconnect()
      for (const event of ['keydown', 'pointerdown', 'wheel', 'touchstart']) window.removeEventListener(event, stop)
    }
  }, [scope])
  useEffect(() => {
    setContexts([]); replacePending(null); setWaiting(false); setNotice(''); clearSecrets()
    editedPending.current = false
    contextAttempt.current = null
    const abort = new AbortController()
    void readContexts(abort.signal).catch(reason => { if (alive() && !abort.signal.aborted) handleError(reason) })
    return () => abort.abort()
  }, [readContexts])
  useEffect(() => {
    if (!pending || !waiting) return
    const abort = new AbortController()
    let reading = false
    const check = async () => {
      if (abort.signal.aborted || !alive()) return
      // The deadline must release the form even when the previous read hangs.
      if (pendingRef.current?.id === pending.id && Date.now() >= pending.deadline) { setNotice(text.notConfirmed); setWaiting(false); return }
      if (reading) return
      reading = true
      try {
        await readContexts(abort.signal)
        if (!alive() || abort.signal.aborted) return
        if (pendingRef.current?.id === pending.id && Date.now() >= pending.deadline) { setNotice(text.notConfirmed); setWaiting(false) }
      } catch (reason) { if (alive() && !abort.signal.aborted) { setNotice(text.notConfirmed); handleError(reason) } }
      finally { reading = false }
    }
    const timer = setInterval(() => void check(), 2000)
    void check()
    return () => { clearInterval(timer); abort.abort() }
  }, [pending, waiting, readContexts, text, alive])
  useRealtimeSubscription(actor.workspace_id ? [{ type: 'workspace', id: actor.workspace_id }] : [], () => {
    void load(); void refreshFeatures(); void readContexts().catch(handleError)
  })
  useEffect(() => {
    const resume = () => { if (document.visibilityState !== 'hidden') { void load(); void refreshFeatures(); void readContexts().catch(handleError) } }
    window.addEventListener('focus', resume); window.addEventListener('pageshow', resume); document.addEventListener('visibilitychange', resume)
    return () => { window.removeEventListener('focus', resume); window.removeEventListener('pageshow', resume); document.removeEventListener('visibilitychange', resume) }
  }, [load, readContexts])
  const retryConfirmation = () => {
    const original = pendingRef.current
    if (!original) return
    replacePending({ ...original, deadline: Date.now() + 60_000 })
    setWaiting(true); setNotice(text.pending); void load()
  }
  const submit = async (event: FormEvent, kind: 'connection' | 'repository' | 'context') => {
    event.preventDefault()
    if (busyRef.current || loading || legacyConflict) return
    busyRef.current = true; setBusy(true); setError(''); setNotice('')
    try {
      if (kind === 'connection') {
        const body = providerConnectionInputSchema.parse({ provider, externalAccountId: publicFields.accountId, displayName: publicFields.displayName,
          webhookSecret: secrets.webhookSecret, ...(provider === 'github' ? { installationId: publicFields.installationId, appId: publicFields.appId, privateKey: secrets.privateKey } : { baseUrl: publicFields.baseUrl, accessToken: secrets.accessToken }) })
        const response = providerConnectionConfigurationSchema.parse(await apiMutation<unknown>(`a2:connection:${scope}:${requestGeneration}`, '/api/v1/provider-connections', { method: 'POST', headers: json({}), body: JSON.stringify(body) }))
        if (alive() && latest.current === scope) { setConnectionId(response.id); setNotice(text.secretsRequiredAgain) }
      } else if (kind === 'repository') {
        const body = repositoryInputSchema.parse({ connectionId, teamId, externalId: publicFields.externalId, fullName: publicFields.fullName, defaultBranch: publicFields.defaultBranch, ...(publicFields.cloneUrl ? { cloneUrl: publicFields.cloneUrl } : {}) })
        await apiMutation(`a2:repository:${scope}`, '/api/v1/repositories', { method: 'POST', headers: json({}), body: JSON.stringify(body) })
        if (alive() && latest.current === scope) await load()
      } else {
        if (!canWrite || !target || waiting) return
        const body = repositoryContextInputSchema.parse({ ...target, ...contextFields, allowedPaths: contextFields.allowedPaths.split('\n').map(value => value.trim()).filter(Boolean), permissions: selectedPermissions })
        const identity = JSON.stringify(body)
        const original = pendingRef.current
        if (original && JSON.stringify(original.body) === identity) { retryConfirmation(); return }
        const baseline = contexts.map(value => value.id)
        const currentContexts = await readContexts()
        if (!alive() || latestContext.current !== contextScope) return
        // An uncertain identical attempt can already have published; replay its original key.
        const retry = contextAttempt.current?.scope === contextScope && contextAttempt.current.body === identity
        if (!retry
          && JSON.stringify(currentContexts.map(value => value.id)) !== JSON.stringify(baseline)) {
          setNotice(text.contextChanged); return
        }
        contextAttempt.current = { scope: contextScope, body: identity }
        const action = repositoryContextActionSchema.parse(await apiMutation<unknown>(`a2:context:${scope}:${repositoryId}`, `/api/v1/repositories/${repositoryId}/context`, { method: 'POST', headers: json({}), body: JSON.stringify(body) }))
        if (alive() && latestContext.current === contextScope) {
          editedPending.current = false
          replacePending({ id: action.id, repositoryId, body, deadline: Date.now() + 60_000 }); setWaiting(true); setNotice(text.pending)
        }
      }
    } catch (reason) { if (alive() && latest.current === scope) handleError(reason) }
    finally { if (alive() && latest.current === scope) { clearSecrets(); busyRef.current = false; setBusy(false) } }
  }
  const publicInput = (field: keyof typeof publicFields) => <label>{text[field]}<input autoComplete="off" maxLength={500} onChange={event => setPublicFields(current => ({ ...current, [field]: event.target.value }))} value={publicFields[field]} /></label>
  const secretInput = (field: keyof typeof secrets) => <label>{text[field]}{field === 'privateKey'
    ? <textarea autoComplete="off" maxLength={100000} onChange={event => setSecrets(current => ({ ...current, [field]: event.target.value }))} value={secrets[field]} />
    : <input type="password" autoComplete="off" maxLength={field === 'webhookSecret' ? 4096 : 10000} onChange={event => setSecrets(current => ({ ...current, [field]: event.target.value }))} value={secrets[field]} />}</label>
  return <section ref={sectionRef} className={styles.section} id="project-repository-configuration" aria-labelledby="repository-configuration-title" tabIndex={-1}>
    <div className={styles.heading}><h2 id="repository-configuration-title">{text.configurationTitle}</h2><Button disabled={loading} onClick={() => { void load(); void readContexts().catch(handleError) }} variant="secondary">{text.refresh}</Button></div>
    {!target && <p>{text.chooseTarget} <Button onClick={onCreateProject} variant="secondary">{text.createTargetProject}</Button></p>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pending && !waiting && <div>
      <Button disabled={busy || loading} onClick={retryConfirmation} variant="secondary">{text.retryContext}</Button>
      <Button disabled={busy || loading || !canWrite} onClick={() => { editedPending.current = true; shaInput.current?.focus() }} variant="secondary">{text.editContext}</Button>
    </div>}
    {legacyConflict && <Button onClick={() => { setRequestGeneration(value => value + 1); setLegacyConflict(false); setError('') }} variant="secondary">{text.newRequest}</Button>}
    {loading ? <p role="status">{text.loading}</p> : <>
      {repositories.length === 0 ? <p>{text.noRepositories}</p> : <label>{text.repositoryLabel}<select aria-label={text.repositoryLabel} value={repositoryId} disabled={busy} onChange={event => setRepositoryId(event.target.value)}>{!repositoryId && <option value="">{text.selectRepository}</option>}{repositories.map(value => <option key={value.id} value={value.id}>{value.full_name}</option>)}</select></label>}
      {cursor && <Button onClick={() => void load(cursor)} variant="secondary">{text.more}</Button>}
      {repository && target && <>
        <h3>{text.currentContext}</h3>{contexts[0] ? <p>{contexts[0].base_branch} · <code>{contexts[0].base_sha}</code></p> : <p>{text.noContext}</p>}
        {!repository.can_configure_context && <p>{text.readOnly}</p>}
        {canWrite && <form onSubmit={event => void submit(event, 'context')}><fieldset disabled={busy || waiting} className={styles.fields}>
          {(['baseBranch', 'baseSha', 'branchPattern'] as const).map(field => <label key={field}>{text[field]}<input ref={field === 'baseSha' ? shaInput : undefined} required maxLength={500} value={contextFields[field]} onChange={event => { if (pendingRef.current) editedPending.current = true; setContextFields(current => ({ ...current, [field]: event.target.value })) }} /></label>)}
          <label>{text.allowedPaths}<textarea required value={contextFields.allowedPaths} onChange={event => { if (pendingRef.current) editedPending.current = true; setContextFields(current => ({ ...current, allowedPaths: event.target.value })) }} /></label>
          <fieldset><legend>{text.permissions}</legend>{permissions.map(permission => <label className={styles.permission} key={permission}><input type="checkbox" checked={selectedPermissions.includes(permission)} onChange={event => { if (pendingRef.current) editedPending.current = true; setSelectedPermissions(current => event.target.checked ? [...current, permission] : current.filter(value => value !== permission)) }} />{text.permissionLabels[permission]}</label>)}</fieldset>
          <Button type="submit">{text.submitContext}</Button>
        </fieldset></form>}
      </>}
    </>}
    {actor.workspace_role === 'admin' && <>
      <details><summary>{text.connectTitle}</summary><form onSubmit={event => void submit(event, 'repository')}><fieldset disabled={busy || loading || Boolean(error) || legacyConflict} className={styles.fields}>
        <label>{text.connectionId}<input required value={connectionId} onChange={event => setConnectionId(event.target.value)} /></label>
        {publicInput('externalId')}{publicInput('fullName')}{publicInput('defaultBranch')}{publicInput('cloneUrl')}<Button type="submit">{text.connectTitle}</Button>
      </fieldset></form></details>
      <details><summary>{text.providerTitle}</summary><form onSubmit={event => void submit(event, 'connection')}><fieldset disabled={busy || loading || Boolean(error) || legacyConflict} className={styles.fields}>
        <label>{text.provider}<select value={provider} onChange={event => { clearSecrets(); setProvider(event.target.value as 'github' | 'gitea') }}><option value="github">{text.providerNames.github}</option>{gitea && <option value="gitea">{text.providerNames.gitea}</option>}</select></label>
        {publicInput('accountId')}{publicInput('displayName')}{secretInput('webhookSecret')}
        {provider === 'github' ? <>{publicInput('installationId')}{publicInput('appId')}{secretInput('privateKey')}</> : <>{publicInput('baseUrl')}{secretInput('accessToken')}</>}
        <Button type="submit">{text.providerTitle}</Button>
      </fieldset></form></details>
    </>}
  </section>
}
