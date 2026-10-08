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
type PendingContext = { id: string; body: ContextInput; baseline: string[]; deadline: number }
const sameContext = (value: RepositoryContextConfiguration, pending: PendingContext) =>
  value.provider_action_id === pending.id && !pending.baseline.includes(value.id)
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
  const [connectionId, setConnectionId] = useState('')
  const [publicFields, setPublicFields] = useState({ accountId: '', displayName: '', installationId: '', appId: '', baseUrl: '', externalId: '', fullName: '', defaultBranch: 'main', cloneUrl: '' })
  const [secrets, setSecrets] = useState({ webhookSecret: '', privateKey: '', accessToken: '' })
  const [contextFields, setContextFields] = useState({ baseBranch: 'main', baseSha: '', branchPattern: 'workmesh/{workItemKey}-{slug}', allowedPaths: '.' })
  const [selectedPermissions, setSelectedPermissions] = useState<ContextInput['permissions']>(['read'])
  const [pending, setPending] = useState<PendingContext | null>(null)
  const [requestGeneration, setRequestGeneration] = useState(0)
  const [legacyConflict, setLegacyConflict] = useState(false)
  const contextAttempt = useRef<{ scope: string; body: string; baseline: string[] } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const target = workItemId ? { workItemId } : projectId ? { projectId } : null
  const targetKey = JSON.stringify(target)
  const scope = `${actorAuthorityScopeKey(actor)}:${teamId}:${targetKey}`
  const latest = useRef(scope); latest.current = scope
  const contextScope = `${scope}:${repositoryId}`
  const latestContext = useRef(contextScope); latestContext.current = contextScope
  const repository = repositories.find(item => item.id === repositoryId)
  const canWrite = Boolean(repository?.can_configure_context && !loading && !error && target)
  const clearSecrets = () => setSecrets({ webhookSecret: '', privateKey: '', accessToken: '' })
  const handleError = (reason: unknown) => {
    clearSecrets()
    if (reason instanceof ApiError && [401, 403, 404].includes(reason.status)) { setRepositories([]); setContexts([]); setRepositoryId(''); setCursor(null); setPending(null) }
    if (reason instanceof ApiError && reason.code === 'IDEMPOTENCY_KEY_REUSED') { setLegacyConflict(true); setError(text.reusedKey) }
    else setError(reason instanceof Error && reason.name === 'ZodError' ? text.validationFailed : text.commandFailed)
  }
  const load = useCallback(async (next: string | null = null) => {
    const version = ++generation.current
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ teamId, availableOnly: 'true', limit: '20' })
      if (next) params.set('cursor', next)
      const page = repositoryConfigurationPageSchema.parse(await apiRequest<unknown>(`/api/v1/repositories?${params}`, { signal: abort.signal, cache: 'no-store' }))
      if (!alive() || abort.signal.aborted || latest.current !== scope || version !== generation.current) return
      setRepositories(current => next ? [...new Map([...current, ...page.items].map(item => [item.id, item])).values()] : page.items)
      setCursor(page.nextCursor)
      setRepositoryId(current => (!next && !page.items.some(item => item.id === current)) ? page.items[0]?.id ?? '' : current || page.items[0]?.id || '')
    } catch (reason) {
      if (!alive() || abort.signal.aborted || latest.current !== scope || version !== generation.current) return
      setRepositories([]); setContexts([]); setCursor(null)
      if (next && reason instanceof ApiError && reason.code === 'PAGINATION_CURSOR_MISMATCH') { void load(); return }
      handleError(reason)
    } finally { if (alive() && latest.current === scope && version === generation.current) setLoading(false) }
  }, [scope, alive, teamId, text])
  const readContexts = useCallback(async (signal?: AbortSignal) => {
    if (!repositoryId) { setContexts([]); return [] }
    try {
      const values = repositoryContextConfigurationSchema.array().parse(await apiRequest<unknown>(`/api/v1/repositories/${repositoryId}/context`, { signal, cache: 'no-store' }))
      const matches = values.filter(value => workItemId ? value.work_item_id === workItemId : value.project_id === projectId)
      if (alive() && latestContext.current === contextScope && !signal?.aborted) setContexts(matches)
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
      if (!enabled) { setProvider('github'); clearSecrets() }
    } catch { if (alive() && latest.current === scope && !signal?.aborted) setGitea(false) }
  }, [scope, alive])
  useEffect(() => {
    void load()
    if (window.location.hash === '#project-repository-configuration') { sectionRef.current?.scrollIntoView(); sectionRef.current?.focus({ preventScroll: true }) }
    const features = new AbortController()
    void refreshFeatures(features.signal)
    return () => { controller.current?.abort(); features.abort(); ++generation.current }
  }, [load])
  useEffect(() => {
    setContexts([]); setPending(null); setNotice(''); clearSecrets()
    contextAttempt.current = null
    const abort = new AbortController()
    void readContexts(abort.signal).catch(reason => { if (alive() && !abort.signal.aborted) handleError(reason) })
    return () => abort.abort()
  }, [readContexts])
  useEffect(() => {
    if (!pending) return
    const abort = new AbortController()
    let reading = false
    const check = async () => {
      if (reading || abort.signal.aborted) return
      reading = true
      try {
        const values = await readContexts(abort.signal)
        if (!alive() || abort.signal.aborted) return
        if (values.some(value => sameContext(value, pending))) { setNotice(text.saved); setPending(null) }
        else if (Date.now() >= pending.deadline) { setNotice(text.notConfirmed); clearInterval(timer) }
      } catch (reason) { if (alive() && !abort.signal.aborted) { handleError(reason); clearInterval(timer) } }
      finally { reading = false }
    }
    const timer = setInterval(() => void check(), 2000)
    void check()
    return () => { clearInterval(timer); abort.abort() }
  }, [pending, readContexts, text, alive])
  useRealtimeSubscription(actor.workspace_id ? [{ type: 'workspace', id: actor.workspace_id }] : [], () => {
    void load(); void refreshFeatures(); void readContexts().catch(handleError)
  })
  useEffect(() => {
    const resume = () => { if (document.visibilityState !== 'hidden') { void load(); void refreshFeatures(); void readContexts().catch(handleError) } }
    window.addEventListener('focus', resume); window.addEventListener('pageshow', resume); document.addEventListener('visibilitychange', resume)
    return () => { window.removeEventListener('focus', resume); window.removeEventListener('pageshow', resume); document.removeEventListener('visibilitychange', resume) }
  }, [load, readContexts])
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
        if (!canWrite || !target) return
        const body = repositoryContextInputSchema.parse({ ...target, ...contextFields, allowedPaths: contextFields.allowedPaths.split('\n').map(value => value.trim()).filter(Boolean), permissions: selectedPermissions })
        const identity = JSON.stringify(body)
        const baseline = contexts.map(value => value.id)
        const currentContexts = await readContexts()
        if (!alive() || latestContext.current !== contextScope) return
        // An uncertain identical attempt can already have published; replay its original key.
        const retry = contextAttempt.current?.scope === contextScope && contextAttempt.current.body === identity
        if (!retry
          && JSON.stringify(currentContexts.map(value => value.id)) !== JSON.stringify(baseline)) {
          setNotice(text.contextChanged); return
        }
        const attemptBaseline = retry ? contextAttempt.current!.baseline : currentContexts.map(value => value.id)
        contextAttempt.current = { scope: contextScope, body: identity, baseline: attemptBaseline }
        const action = repositoryContextActionSchema.parse(await apiMutation<unknown>(`a2:context:${scope}:${repositoryId}`, `/api/v1/repositories/${repositoryId}/context`, { method: 'POST', headers: json({}), body: JSON.stringify(body) }))
        if (alive() && latestContext.current === contextScope) { setPending({ id: action.id, body, baseline: attemptBaseline, deadline: Date.now() + 60_000 }); setNotice(text.pending) }
      }
    } catch (reason) { if (alive() && latest.current === scope) handleError(reason) }
    finally { if (alive() && latest.current === scope) { clearSecrets(); busyRef.current = false; setBusy(false) } }
  }
  const publicInput = (field: keyof typeof publicFields) => <label>{text[field]}<input autoComplete="off" maxLength={500} onChange={event => setPublicFields(current => ({ ...current, [field]: event.target.value }))} value={publicFields[field]} /></label>
  const secretInput = (field: keyof typeof secrets) => <label>{text[field]}{field === 'privateKey'
    ? <textarea autoComplete="off" maxLength={100000} onChange={event => setSecrets(current => ({ ...current, [field]: event.target.value }))} value={secrets[field]} />
    : <input type="password" autoComplete="off" maxLength={field === 'webhookSecret' ? 4096 : 10000} onChange={event => setSecrets(current => ({ ...current, [field]: event.target.value }))} value={secrets[field]} />}</label>
  return <section ref={sectionRef} className={styles.section} id="project-repository-configuration" aria-labelledby="repository-configuration-title" tabIndex={-1}>
    <div className={styles.heading}><h2 id="repository-configuration-title">{text.configurationTitle}</h2><Button disabled={loading} onClick={() => { void load(); void readContexts().then(values => { if (pending && values.some(value => sameContext(value, pending))) { setPending(null); setNotice(text.saved) } }).catch(handleError) }} variant="secondary">{text.refresh}</Button></div>
    {!target && <p>{text.chooseTarget} <Button onClick={onCreateProject} variant="secondary">{text.createTargetProject}</Button></p>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {legacyConflict && <Button onClick={() => { setRequestGeneration(value => value + 1); setLegacyConflict(false); setError('') }} variant="secondary">{text.newRequest}</Button>}
    {loading ? <p role="status">{text.loading}</p> : <>
      {repositories.length === 0 ? <p>{text.noRepositories}</p> : <label>{text.repositoryLabel}<select aria-label={text.repositoryLabel} value={repositoryId} onChange={event => setRepositoryId(event.target.value)}>{repositories.map(value => <option key={value.id} value={value.id}>{value.full_name}</option>)}</select></label>}
      {cursor && <Button onClick={() => void load(cursor)} variant="secondary">{text.more}</Button>}
      {repository && target && <>
        <h3>{text.currentContext}</h3>{contexts[0] ? <p>{contexts[0].base_branch} · <code>{contexts[0].base_sha}</code></p> : <p>{text.noContext}</p>}
        {!repository.can_configure_context && <p>{text.readOnly}</p>}
        {canWrite && <form onSubmit={event => void submit(event, 'context')}><fieldset disabled={busy || Boolean(pending)} className={styles.fields}>
          {(['baseBranch', 'baseSha', 'branchPattern'] as const).map(field => <label key={field}>{text[field]}<input required maxLength={500} value={contextFields[field]} onChange={event => setContextFields(current => ({ ...current, [field]: event.target.value }))} /></label>)}
          <label>{text.allowedPaths}<textarea required value={contextFields.allowedPaths} onChange={event => setContextFields(current => ({ ...current, allowedPaths: event.target.value }))} /></label>
          <fieldset><legend>{text.permissions}</legend>{permissions.map(permission => <label className={styles.permission} key={permission}><input type="checkbox" checked={selectedPermissions.includes(permission)} onChange={event => setSelectedPermissions(current => event.target.checked ? [...current, permission] : current.filter(value => value !== permission))} />{text.permissionLabels[permission]}</label>)}</fieldset>
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
