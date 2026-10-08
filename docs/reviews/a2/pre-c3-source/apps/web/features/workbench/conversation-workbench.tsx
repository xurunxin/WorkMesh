'use client'

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Button, ToolChip, ToolChipRow } from '@workmesh/ui'
import { apiMutation, apiRequest, json, type ListResponse } from '../../app/lib/api'
import type { AuthenticatedActor } from '../../app/lib/actor'
import { useLocale } from '../../app/lib/i18n'
import { useRealtimeSubscription } from '../../app/lib/realtime'
import { RichContent } from '../rich-content/markdown'
import { RichTextEditor, clearDraft, type DraftIdentity } from '../rich-content/editor'
import styles from './conversation-workbench.module.css'
import { readinessContext, readinessHref, saveReadinessReturn } from '../../app/lib/configuration-readiness-navigation'
import { ConfigurationReadiness, useConfigurationReadiness } from './configuration-readiness'

type Conversation = {
  id: string; title: string; status: 'active' | 'archived'; revision: number
  team_id: string | null; agent_session_id: string | null; default_llm_connection_id: string | null
  default_llm_model_id: string | null; work_item_id: string | null; project_id: string | null; updated_at: string
  context_pins: Array<{ kind: 'guidance' | 'document' | 'work_item'; refId: string; revision: number | null; resolved_revision?: number | null }>
}
type Message = { id: string; role: 'user' | 'assistant' | 'system'; sequence: number; content_markdown: string; created_at: string }
type ToolInvocation = {
  id: string
  tool_name: string
  call_count: number
  sanitized_input_summary: string
}
/**
 * The runner writes this ledger when a turn settles. An absent or empty list
 * means nothing was recorded - never "this turn called no tools", which would
 * be a claim the product cannot make about a turn that is still running.
 */
type Turn = {
  id: string; status: string; sequence: number; error_code: string | null; retry_of_turn_id: string | null
  tool_invocations?: ToolInvocation[]
}
type Session = { id: string; state: string; principal_human_actor_id: string; work_item_id: string | null; project_id: string | null }
type Connection = { id: string; name: string; status: string; secret_status: string }
type Model = { id: string; display_name: string; enabled: boolean }
type Detail = Connection & { models: Model[] }
type SequencePage<T> = { items: T[]; nextBefore: number | null }
const root = '/api/v1/workbench/conversations'
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : String(reason)
const etag = (value: number) => `"revision-${value}"`
const pending = (turn: Turn) => ['queued', 'dispatching', 'running'].includes(turn.status)

export function ConversationWorkbench({ actor, readinessSearch = '', readinessTeamId = null }: { actor: AuthenticatedActor; readinessSearch?: string; readinessTeamId?: string | null }) {
  const { locale, agentWorkCopy: text, readinessCopy } = useLocale()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [nextConversationCursor, setNextConversationCursor] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [modelOptions, setModelOptions] = useState<Model[]>([])
  const [turnModels, setTurnModels] = useState<Model[]>([])
  const [connectionId, setConnectionId] = useState('')
  const [modelId, setModelId] = useState('')
  const [turnConnectionId, setTurnConnectionId] = useState('')
  const [turnModelId, setTurnModelId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [title, setTitle] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [boundSession, setBoundSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [turns, setTurns] = useState<Turn[]>([])
  const [olderBefore, setOlderBefore] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [steerDraft, setSteerDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selectedRef = useRef<string | null>(null)
  const sendingRef = useRef(false)
  const refreshVersion = useRef(0)
  const olderLoaded = useRef(false)
  // The per-turn picker defaults come from async loads that finish after the user can already
  // interact. Remember an explicit pick per conversation so a late default can never overwrite it.
  const turnPickRef = useRef<{ conversationId: string; connectionId: string; modelId: string | null } | null>(null)
  const pendingStarter = useRef<string | null>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const context = !readinessTeamId || (selectedId && !selected) ? null : readinessContext(readinessSearch, readinessTeamId, selected)
  const readiness = useConfigurationReadiness(actor, context)
  const primaryGap = readiness.unmet[0]
  const focusComposer = () => requestAnimationFrame(() => composerRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus())
  const chooseStarter = (value: string) => {
    if (selected) { setDraft(current => current ? `${current}\n${value}` : value); focusComposer() }
    else { pendingStarter.current = value; setShowCreate(true); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#workbench-create-form input')?.focus()) }
  }
  useEffect(() => { pendingStarter.current = null }, [readinessSearch, readinessTeamId])
  useEffect(() => {
    if (!selected || !pendingStarter.current) return
    const value = pendingStarter.current; pendingStarter.current = null
    setDraft(current => current ? `${current}\n${value}` : value); focusComposer()
  }, [selected?.id])
  useEffect(() => {
    const restore = () => {
      const saved = window.history.state?.a2Return?.conversationId as string | null | undefined
      if (saved) setSelectedId(saved)
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  selectedRef.current = selectedId
  const initialConversation = useCallback((items: Conversation[]) => {
    const params = new URLSearchParams(readinessSearch)
    return items.find(item => (!params.has('teamId') || item.team_id === params.get('teamId'))
      && (!params.has('projectId') || item.project_id === params.get('projectId'))
      && (!params.has('workItemId') || item.work_item_id === params.get('workItemId')))?.id ?? null
  }, [readinessSearch])

  const refreshList = useCallback(async () => {
    const page = await apiRequest<ListResponse<Conversation>>(root)
    setConversations(page.items)
    setNextConversationCursor(page.nextCursor)
    setSelectedId(current => current ?? initialConversation(page.items))
  }, [initialConversation])
  const refreshSelected = useCallback(async (conversationId: string) => {
    const version = ++refreshVersion.current
    const path = `${root}/${encodeURIComponent(conversationId)}`
    const [detail, messagePage, turnPage] = await Promise.all([
      apiRequest<Conversation>(path), apiRequest<SequencePage<Message>>(`${path}/messages?limit=50`),
      apiRequest<SequencePage<Turn>>(`${path}/turns?limit=50`),
    ])
    if (selectedRef.current !== conversationId || version !== refreshVersion.current) return
    const session = detail.agent_session_id
      ? await apiRequest<Session>(`/api/v1/agent-sessions/${encodeURIComponent(detail.agent_session_id)}`)
        .catch(reason => {
          if (selectedRef.current === conversationId && version === refreshVersion.current) setError(errorText(reason))
          return null
        })
      : null
    if (selectedRef.current !== conversationId || version !== refreshVersion.current) return
    setSelected(detail)
    setBoundSession(session)
    setMessages(current => olderLoaded.current
      ? [...new Map([...current, ...messagePage.items].map(message => [message.id, message])).values()].sort((a, b) => a.sequence - b.sequence)
      : messagePage.items.slice().sort((a, b) => a.sequence - b.sequence))
    setTurns(turnPage.items.slice().sort((a, b) => a.sequence - b.sequence))
    if (!olderLoaded.current) setOlderBefore(messagePage.nextBefore)
    setConversations(current => current.map(item => item.id === detail.id ? detail : item))
  }, [])
  useRealtimeSubscription(actor.workspace_id ? [{ type: 'workspace', id: actor.workspace_id }] : [], invalidation => {
    if (invalidation.reason === 'event' && !invalidation.event.event_type.startsWith('workbench.')) return
    void refreshList().catch(reason => setError(errorText(reason)))
    if (selectedRef.current) void refreshSelected(selectedRef.current).catch(reason => setError(errorText(reason)))
  })
  useEffect(() => {
    let active = true
    void Promise.all([
      apiRequest<ListResponse<Conversation>>(root),
      apiRequest<ListResponse<Session>>('/api/v1/agent-sessions?limit=100'),
      apiRequest<ListResponse<Connection>>('/api/v1/workbench/llm-connections'),
    ]).then(([conversationPage, sessionPage, connectionPage]) => {
      if (!active) return
      setConversations(conversationPage.items)
      setNextConversationCursor(conversationPage.nextCursor)
      const restored = window.history.state?.a2Return?.conversationId as string | undefined
      setSelectedId(restored && conversationPage.items.some(item => item.id === restored) ? restored : initialConversation(conversationPage.items))
      const usableSessions = sessionPage.items.filter(item =>
        item.principal_human_actor_id === actor.id && (item.work_item_id || item.project_id)
        && ['queued', 'acknowledged', 'executing'].includes(item.state))
      setSessions(usableSessions)
      setSessionId(usableSessions[0]?.id ?? '')
      const usableConnections = connectionPage.items.filter(item => item.status === 'active' && item.secret_status === 'configured')
      setConnections(usableConnections)
      setConnectionId(usableConnections[0]?.id ?? '')
    }).catch(reason => { if (active) setError(errorText(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [actor.id])
  useEffect(() => {
    if (!connectionId) { setModelOptions([]); setModelId(''); return }
    let active = true
    void apiRequest<Detail>(`/api/v1/workbench/llm-connections/${encodeURIComponent(connectionId)}`)
      .then(detail => { if (active) { const options = detail.models.filter(item => item.enabled); setModelOptions(options); setModelId(options[0]?.id ?? '') } })
      .catch(reason => { if (active) setError(errorText(reason)) })
    return () => { active = false }
  }, [connectionId])
  useEffect(() => {
    if (!selected) { setTurnConnectionId(''); setTurnModelId(''); setTurnModels([]); return }
    // A late default must never replace a choice the user already made for this conversation.
    const pick = turnPickRef.current
    const pickedConnection = pick && pick.conversationId === selected.id && pick.connectionId
      ? connections.find(item => item.id === pick.connectionId) : undefined
    const preferred = connections.find(item => item.id === selected.default_llm_connection_id)
    setTurnConnectionId(pickedConnection?.id ?? preferred?.id ?? connections[0]?.id ?? '')
  }, [selected?.id, selected?.default_llm_connection_id, connections])
  useEffect(() => {
    if (!turnConnectionId) { setTurnModels([]); setTurnModelId(''); return }
    let active = true
    setTurnModels([]); setTurnModelId('')
    void apiRequest<Detail>(`/api/v1/workbench/llm-connections/${encodeURIComponent(turnConnectionId)}`)
      .then(detail => {
        if (!active) return
        const options = detail.models.filter(item => item.enabled)
        setTurnModels(options)
        const pick = turnPickRef.current
        const pickedModel = pick && pick.conversationId === selected?.id && pick.connectionId === turnConnectionId ? pick.modelId : null
        setTurnModelId(options.find(item => item.id === (pickedModel ?? selected?.default_llm_model_id))?.id ?? options[0]?.id ?? '')
      })
      .catch(reason => { if (active) setError(errorText(reason)) })
    return () => { active = false }
  }, [turnConnectionId, selected?.default_llm_model_id])
  useEffect(() => {
    if (!selectedId) { setSelected(null); setBoundSession(null); setMessages([]); setTurns([]); return }
    let active = true
    olderLoaded.current = false
    setSelected(null); setBoundSession(null); setMessages([]); setTurns([])
    const load = async () => {
      if (!active || document.visibilityState === 'hidden') return
      try { await refreshSelected(selectedId) } catch (reason) { if (active) setError(errorText(reason)) }
    }
    void load()
    const timer = setInterval(() => { void load() }, 3000)
    return () => { active = false; clearInterval(timer) }
  }, [selectedId, refreshSelected])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const session = sessions.find(item => item.id === sessionId)
    if (!session || !connectionId || !modelId || !title.trim()) return
    setBusy(true); setError('')
    try {
      const created = await apiMutation<Conversation>('workbench:create', root, { method: 'POST', headers: json({}),
        body: JSON.stringify({ title: title.trim(), agentSessionId: session.id,
          ...(session.work_item_id ? { workItemId: session.work_item_id } : { projectId: session.project_id }),
          llmConnectionId: connectionId, llmModelId: modelId, contextPins: [] }) })
      setTitle(''); setShowCreate(false); await refreshList(); setSelectedId(created.id)
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected || !draft.trim() || busy || sendingRef.current || !turnConnectionId || !turnModelId) return
    sendingRef.current = true
    setBusy(true); setError('')
    const identity: DraftIdentity = { workspaceId: actor.workspace_id ?? '', teamId: selected.team_id ?? '', actorId: actor.id,
      resourceType: 'workbench_conversation', resourceId: selected.id, field: 'message', baseRevision: 0 }
    try {
      await apiMutation(`workbench:send:${selected.id}`, `${root}/${selected.id}/turns`, { method: 'POST',
        headers: { ...json({}), 'If-Match': etag(selected.revision) },
        body: JSON.stringify({ messageMarkdown: draft.trim(), llmConnectionId: turnConnectionId, llmModelId: turnModelId }) })
      clearDraft(localStorage, identity)
      if (selectedRef.current === selected.id) setDraft('')
      if (selectedRef.current === selected.id) await refreshSelected(selected.id)
    } catch (reason) {
      if (selectedRef.current === selected.id) {
        setError(errorText(reason))
        await refreshSelected(selected.id).catch(() => undefined)
      }
    }
    finally { sendingRef.current = false; setBusy(false) }
  }
  const stop = async (turn: Turn) => {
    if (!selected || busy) return
    setBusy(true); setError('')
    try {
      await apiMutation(`workbench:stop:${turn.id}`, `${root}/${selected.id}/turns/${turn.id}/stop`, { method: 'POST',
        headers: { ...json({}), 'If-Match': etag(selected.revision) },
        body: JSON.stringify({ reason: text.stopReason, stopMode: 'immediate' }) })
      await refreshSelected(selected.id)
    } catch (reason) { setError(errorText(reason)); await refreshSelected(selected.id).catch(() => undefined) }
    finally { setBusy(false) }
  }
  // Steering adds context to a running turn without cancelling its attempt.
  const steer = async (turn: Turn) => {
    if (!selected || busy || !steerDraft.trim()) return
    setBusy(true); setError('')
    try {
      await apiMutation(`workbench:steer:${turn.id}`, `${root}/${selected.id}/turns/${turn.id}/steer`,
        { method: 'POST', headers: { ...json({}), 'If-Match': etag(selected.revision) },
          body: JSON.stringify({ messageMarkdown: steerDraft.trim() }) })
      setSteerDraft('')
      await refreshSelected(selected.id)
    } catch (reason) { setError(errorText(reason)); await refreshSelected(selected.id).catch(() => undefined) }
    finally { setBusy(false) }
  }
  // Follow-up (and retry) create a NEW turn: the terminal fact stays immutable.
  const followUp = async (turn: Turn, retry: boolean) => {
    if (!selected || busy) return
    const message = retry ? text.retryPreviousRequest : draft.trim()
    if (!message) return
    setBusy(true); setError('')
    const identity: DraftIdentity = { workspaceId: actor.workspace_id ?? '', teamId: selected.team_id ?? '', actorId: actor.id,
      resourceType: 'workbench_conversation', resourceId: selected.id, field: 'message', baseRevision: 0 }
    try {
      await apiMutation(`workbench:followup:${turn.id}`, `${root}/${selected.id}/turns/${turn.id}/followup`,
        { method: 'POST', headers: { ...json({}), 'If-Match': etag(selected.revision) },
          body: JSON.stringify({ messageMarkdown: message, llmConnectionId: turnConnectionId || selected.default_llm_connection_id,
            llmModelId: turnModelId || selected.default_llm_model_id, ...(retry ? { retryOfTurnId: turn.id } : {}) }) })
      clearDraft(localStorage, identity)
      if (selectedRef.current === selected.id) setDraft('')
      if (selectedRef.current === selected.id) await refreshSelected(selected.id)
    } catch (reason) { setError(errorText(reason)); await refreshSelected(selected.id).catch(() => undefined) }
    finally { setBusy(false) }
  }
  const archive = async () => {
    if (!selected || busy) return
    setBusy(true); setError('')
    try {
      await apiMutation(`workbench:archive:${selected.id}`, `${root}/${selected.id}/archive`, { method: 'POST',
        headers: { ...json({}), 'If-Match': etag(selected.revision) }, body: '{}' })
      await refreshSelected(selected.id); await refreshList()
    } catch (reason) { setError(errorText(reason)); await refreshSelected(selected.id).catch(() => undefined) }
    finally { setBusy(false) }
  }
  const loadOlder = async () => {
    if (!selected || !olderBefore) return
    try {
      const page = await apiRequest<SequencePage<Message>>(`${root}/${selected.id}/messages?limit=50&before=${olderBefore}`)
      olderLoaded.current = true
      setMessages(current => [...page.items, ...current].sort((a, b) => a.sequence - b.sequence))
      setOlderBefore(page.nextBefore)
    } catch (reason) { setError(errorText(reason)) }
  }
  const loadMoreConversations = async () => {
    if (!nextConversationCursor) return
    try {
      const page = await apiRequest<ListResponse<Conversation>>(`${root}?cursor=${encodeURIComponent(nextConversationCursor)}`)
      setConversations(current => [...new Map([...current, ...page.items].map(item => [item.id, item])).values()])
      setNextConversationCursor(page.nextCursor)
    } catch (reason) { setError(errorText(reason)) }
  }
  const latestTurn = turns.at(-1)
  const sessionCanRun = boundSession && ['queued', 'acknowledged', 'executing'].includes(boundSession.state)
  const draftIdentity: DraftIdentity | null = selected ? { workspaceId: actor.workspace_id ?? '', teamId: selected.team_id ?? '', actorId: actor.id,
    resourceType: 'workbench_conversation', resourceId: selected.id, field: 'message', baseRevision: 0 } : null
  const emptyState = <div className={styles.empty}>
    <p>{selected ? text.sendFirstMessage : text.selectOrCreateConversation}</p>
    {context && primaryGap && <a className={styles.configureAction} data-testid="readiness-primary-action" href={readinessHref(primaryGap, context)} onClick={() => saveReadinessReturn(primaryGap, selectedId)}>{readinessCopy[primaryGap]}</a>}
    <div aria-label={readinessCopy.startersLabel} className={styles.starters}>
      {readinessCopy.starters.map(value => <Button key={value} onClick={() => chooseStarter(value)} type="button" variant="secondary">{value}</Button>)}
    </div>
  </div>
  return <div className={styles.layout} data-testid="conversation-workbench">
    <aside className={styles.sidebar} aria-label={text.conversationListLabel}>
      {/* The workbench is the default landing, so it owes the Human a way back
          to the classic screen without going through the sidebar. */}
      <a className={styles.backToIssues} data-testid="workbench-back-to-issues" href="/?view=my-work">
        {text.backToClassicScreen}
      </a>
      <div className={styles.heading}><h1>{text.workbenchTitle}</h1><a href="/settings/agent-workbench">{text.modelSettingsLink}</a></div>
      <Button aria-controls="workbench-create-form" aria-expanded={showCreate} className={styles.newConversation}
        onClick={() => { pendingStarter.current = null; setShowCreate(current => !current) }} type="button" variant="primary">{text.createConversation}</Button>
      <form className={styles.create} data-open={showCreate} id="workbench-create-form" onSubmit={event => void create(event)}>
        <label>{text.newConversationTitle}<input maxLength={180} onChange={event => setTitle(event.target.value)} required value={title} /></label>
        <label>{text.executionSessionLabel}<select onChange={event => setSessionId(event.target.value)} required value={sessionId}>
          {sessions.length === 0 && <option value="">{text.noAvailableSession}</option>}
          {sessions.map(item => <option key={item.id} value={item.id}>{item.work_item_id ? text.sessionOptionIssue(item.work_item_id.slice(0, 8)) : text.sessionOptionProject(item.project_id?.slice(0, 8))} · {item.id.slice(0, 8)} · {item.state}</option>)}
        </select></label>
        <label>{text.modelServiceLabel}<select onChange={event => setConnectionId(event.target.value)} required value={connectionId}>
          {connections.length === 0 && <option value="">{text.configureServiceOption}</option>}
          {connections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>{text.modelLabel}<select onChange={event => setModelId(event.target.value)} required value={modelId}>
          {modelOptions.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}
        </select></label>
        <Button disabled={busy || !sessionId || !connectionId || !modelId || !title.trim()} type="submit">{text.createConversation}</Button>
        {readiness.unmet.includes('agent') && <a href="/agents">{text.openAgentsForDelegation}</a>}
      </form>
      <p className={styles.sectionLabel}>{text.conversationsSection}</p>
      <div className={styles.list} role="list">
        {loading ? <p>{text.loadingConversations}</p> : conversations.length === 0 ? <p>{text.noConversations}</p> : conversations.map(item =>
          <button aria-current={selectedId === item.id ? 'page' : undefined}
            className={`${styles.listItem} ${selectedId === item.id ? styles.listItemActive : ''}`}
            key={item.id} onClick={() => { setSelectedId(item.id); setShowCreate(false); setDraft(''); setError('') }} type="button">
            <span aria-hidden="true" className={`${styles.statusDot} ${item.status === 'active' ? styles.statusDotActive : styles.statusDotArchived}`} />
            <span className={styles.listTitle}>{item.title}</span>
            <span className={styles.listMeta}>{item.status} · {new Date(item.updated_at).toLocaleString(locale)}</span>
          </button>)}
        {nextConversationCursor && <button onClick={() => void loadMoreConversations()} type="button">{text.loadMoreConversations}</button>}
      </div>
      <p className={styles.sectionLabel}>{text.executorsSection}</p>
      <div className={styles.rail}>
        {connections.map(item => <div className={styles.railRow} key={item.id}>
          <span aria-hidden="true" className={`${styles.railDot} ${item.status === 'active' ? styles.railDotReady : item.status === 'error' ? styles.railDotBad : styles.railDotIdle}`} />
          <span className={styles.railName}>{item.name}</span>
          <span className={styles.railValue}>{item.status}</span>
        </div>)}
        {readiness.unmet.includes('model') && <p className={styles.hint}>{text.noModelServiceConfigured}</p>}
        <div className={styles.railRow}>
          <span aria-hidden="true" className={`${styles.railDot} ${selected?.agent_session_id ? styles.railDotReady : styles.railDotIdle}`} />
          <span className={styles.railName}>{text.delegatedSessionLabel}</span>
          <span className={styles.railValue}>{boundSession?.state ?? '—'}</span>
        </div>
      </div>
    </aside>
    <section className={styles.main} aria-label={text.conversationRegionLabel}>
      <ConfigurationReadiness context={context} conversationId={selectedId} state={readiness} />
      {error && <div role="alert" className={styles.error}>{error} <button onClick={() => { setError(''); void refreshList(); if (selectedId) void refreshSelected(selectedId) }} type="button">{text.retry}</button></div>}
      {!selected ? emptyState : <>
        <header className={styles.conversationHeader}><div><h2>{selected.title}</h2><p>{text.publicRecordNote}</p></div>
          <div className={styles.conversationFacts}>
            {boundSession && <span className={styles.chip}>{text.sessionChipLabel} {boundSession.id.slice(0, 8)} · {boundSession.state}</span>}
            <Button disabled={busy || selected.status !== 'active' || turns.some(pending)} onClick={() => void archive()} variant="ghost">{text.archive}</Button>
          </div></header>
        <div className={styles.timeline} aria-live="polite">
          {olderBefore && <button onClick={() => void loadOlder()} type="button">{text.loadEarlierMessages}</button>}
          {messages.length === 0 ? emptyState : messages.map(message =>
            <article className={message.role === 'user' ? styles.userMessage : styles.agentMessage} key={message.id}>
              <div className={styles.messageHead}>
                <span aria-hidden="true" className={`${styles.actorBadge} ${message.role === 'user' ? styles.actorBadgeHuman : message.role === 'system' ? styles.actorBadgeSystem : ''}`}>
                  {message.role === 'user' ? text.humanBadge : message.role === 'assistant' ? text.agentBadge : text.systemBadge}
                </span>
                <span className={styles.actorName}>{message.role === 'user' ? text.humanActorName : message.role === 'assistant' ? text.agentActorName : text.systemActorName}</span>
                <time className={styles.listMeta} dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(locale)}</time>
              </div>
              <div className={styles.messageBody}><RichContent density="compact" source={message.content_markdown} /></div>
            </article>)}
          {latestTurn && <div className={styles.turnState} role="status">
            <span className={`${styles.chip} ${latestTurn.status === 'settled' ? styles.chipSettled : latestTurn.status === 'failed' || latestTurn.status === 'stopped' ? styles.chipFailed : styles.chipPending}`}>
              {text.turnChipLabel} #{latestTurn.sequence} · {latestTurn.status}
            </span>
            {latestTurn.error_code && <span className={`${styles.chip} ${styles.chipFailed}`}>{latestTurn.error_code}</span>}
            {latestTurn.retry_of_turn_id && <span className={styles.chip}>{text.retryOf} {latestTurn.retry_of_turn_id.slice(0, 8)}</span>}
            {latestTurn.tool_invocations && latestTurn.tool_invocations.length > 0 && <ToolChipRow>
              {latestTurn.tool_invocations.map(invocation => <ToolChip
                data={{ callCount: invocation.call_count, inputSummary: invocation.sanitized_input_summary, toolName: invocation.tool_name }}
                key={invocation.id}
                outcome={latestTurn.status === 'settled' ? 'done' : ['failed', 'canceled', 'stopped'].includes(latestTurn.status) ? 'failed' : 'unknown'}
                timesLabel=" ×"
              />)}
            </ToolChipRow>}
            {pending(latestTurn) && <Button disabled={busy} onClick={() => void stop(latestTurn)} variant="ghost">{text.stop}</Button>}
            {pending(latestTurn) && latestTurn.status === 'running' &&
              <form className={styles.steerForm} onSubmit={event => { event.preventDefault(); void steer(latestTurn) }}>
                <input aria-label={text.steerInputLabel}
                  maxLength={50_000} onChange={event => setSteerDraft(event.target.value)} placeholder={text.steerInputPlaceholder}
                  value={steerDraft} />
                <Button disabled={busy || !steerDraft.trim()} type="submit" variant="ghost">{text.steerSubmit}</Button>
              </form>}
            {!pending(latestTurn) && ['failed', 'stopped'].includes(latestTurn.status) &&
              <Button disabled={busy} onClick={() => void followUp(latestTurn, true)} variant="ghost">{text.retry}</Button>}
            {!pending(latestTurn) && <Button disabled={busy || !draft.trim()} onClick={() => void followUp(latestTurn, false)} variant="ghost">{text.followUp}</Button>}
          </div>}
          {latestTurn && ['RUNNER_AUTHORITY_LOST', 'RUNNER_TIMEOUT'].includes(latestTurn.error_code ?? '') &&
            <p className={styles.error} role="alert">{text.runnerInterrupted}</p>}
        </div>
        {selected.status === 'active' && draftIdentity && <form className={styles.composer} onSubmit={event => void send(event)}>
          <div className={styles.composerPills}>
            {selected.work_item_id
              ? <a className={`${styles.contextPill} ${styles.contextPillBound}`} href={`/?view=my-work&workItem=${encodeURIComponent(selected.work_item_id)}`}>⨯ @{text.workItemPill} {selected.work_item_id.slice(0, 8)}</a>
              : <span className={styles.contextPill}>＋ @{text.workItemPill}</span>}
            {selected.project_id
              ? <a className={`${styles.contextPill} ${styles.contextPillBound}`} href={`/?view=projects&project=${encodeURIComponent(selected.project_id)}`}>⨯ @{text.projectPill} {selected.project_id.slice(0, 8)}</a>
              : <span className={styles.contextPill}>＋ @{text.projectPill}</span>}
            <span className={styles.contextPill}>{selected.context_pins.length > 0 ? `⨯ @${text.filesPill} ${selected.context_pins.length}` : `＋ @${text.filesPill}`}</span>
            <span className={styles.contextPill}>＋ @{text.terminalPill}</span>
          </div>
          <div ref={composerRef}><RichTextEditor identity={draftIdentity} label={text.messageFieldLabel} mode="comment" name="messageMarkdown" onChange={setDraft} required value={draft} /></div>
          <div className={styles.composerFooter}>
            <div className={styles.turnModelSelection}>
              <label>{text.turnServiceLabel}<select aria-label={text.turnServiceLabel} disabled={busy} onChange={event => { turnPickRef.current = { conversationId: selected.id, connectionId: event.target.value, modelId: null }; setTurnConnectionId(event.target.value) }} value={turnConnectionId}>
                {connections.length === 0 && <option value="">{text.configureServiceOption}</option>}
                {connections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select></label>
              <label>{text.turnModelLabel}<select aria-label={text.turnModelLabel} disabled={busy || !turnConnectionId} onChange={event => { turnPickRef.current = { conversationId: selected.id, connectionId: turnConnectionId, modelId: event.target.value }; setTurnModelId(event.target.value) }} value={turnModelId}>
                {turnModels.length === 0 && <option value="">{text.noAvailableModel}</option>}
                {turnModels.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}
              </select></label>
            </div>
            <div className={styles.composerActions}>
              <span className={styles.composerFacts}>{text.composerKeyboardHint}</span>
              <Button disabled={busy || !draft.trim() || !sessionCanRun || !turnConnectionId || !turnModelId} type="submit">{text.send}</Button>
            </div>
          </div>
          {!selected.agent_session_id && <p className={`${styles.hint} ${styles.hintBlocked}`}>{text.noBoundSession}</p>}
          {selected.agent_session_id && boundSession && !sessionCanRun && <p className={`${styles.hint} ${styles.hintBlocked}`} role="status">{text.boundSessionEnded}</p>}
          {sessionCanRun && <p className={`${styles.hint} ${styles.hintReady}`}>● {text.sessionCanRun}{boundSession ? ` · ${boundSession.state}` : ''}</p>}
          {readiness.unmet.includes('model') && <a href="/settings/agent-workbench">{text.configureModelServiceLink}</a>}
        </form>}
      </>}
    </section>
    <aside className={styles.context} aria-label={text.contextRegionLabel}>
      <h2>{text.contextRegionLabel}</h2>
      {selected ? <><p>{text.serverAuthorizesWrites}</p>
        <ul className={styles.contextPins} data-testid="workbench-context-pins">
          {selected.project_id && <li><a href={`/?view=projects&project=${encodeURIComponent(selected.project_id)}`}>{text.contextProject(selected.project_id.slice(0, 8))}</a></li>}
          {selected.work_item_id && <li><a href={`/?view=issues&workItem=${encodeURIComponent(selected.work_item_id)}`}>{text.contextIssue(selected.work_item_id.slice(0, 8))}</a></li>}
          {selected.context_pins.map((pin, index) => <li key={`${pin.kind}-${pin.refId}-${index}`}>
            {pin.kind === 'work_item' ? text.pinKindIssue : pin.kind === 'document' ? text.pinKindDocument : text.pinKindGuidance} {pin.refId.slice(0, 8)}
            {pin.revision !== null ? text.pinRevisionLabel(pin.revision) : (pin.resolved_revision !== null && pin.resolved_revision !== undefined ? text.pinRevisionLabel(pin.resolved_revision) : text.pinLiveHeadLabel)}
          </li>)}
        </ul>
        {selected.agent_session_id && <a href={`/agent-sessions/${selected.agent_session_id}`}>{text.viewAgentSessionLink}</a>}
        {selected.agent_session_id && <span role="status">{text.sessionStateLabel}: {boundSession?.state ?? text.sessionStateLoading}</span>}
        <small>{text.conversationRevisionLabel} {selected.revision}</small></> : <p>{text.selectConversationForContext}</p>}
    </aside>
  </div>
}
