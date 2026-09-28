'use client'

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@workmesh/ui'
import { apiMutation, apiRequest, json, type ListResponse } from '../../app/lib/api'
import type { AuthenticatedActor } from '../../app/lib/actor'
import { useLocale } from '../../app/lib/i18n'
import { useRealtimeSubscription } from '../../app/lib/realtime'
import { RichContent } from '../rich-content/markdown'
import { RichTextEditor, clearDraft, type DraftIdentity } from '../rich-content/editor'
import styles from './conversation-workbench.module.css'

type Conversation = {
  id: string; title: string; status: 'active' | 'archived'; revision: number
  team_id: string | null; agent_session_id: string | null; default_llm_connection_id: string | null
  default_llm_model_id: string | null; work_item_id: string | null; project_id: string | null; updated_at: string
  context_pins: Array<{ kind: 'guidance' | 'document' | 'work_item'; refId: string; revision: number | null; resolved_revision?: number | null }>
}
type Message = { id: string; role: 'user' | 'assistant' | 'system'; sequence: number; content_markdown: string; created_at: string }
type Turn = { id: string; status: string; sequence: number; error_code: string | null; retry_of_turn_id: string | null }
type Session = { id: string; state: string; principal_human_actor_id: string; work_item_id: string | null; project_id: string | null }
type Connection = { id: string; name: string; status: string; secret_status: string }
type Model = { id: string; display_name: string; enabled: boolean }
type Detail = Connection & { models: Model[] }
type SequencePage<T> = { items: T[]; nextBefore: number | null }
const root = '/api/v1/workbench/conversations'
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : String(reason)
const etag = (value: number) => `"revision-${value}"`
const pending = (turn: Turn) => ['queued', 'dispatching', 'running'].includes(turn.status)

export function ConversationWorkbench({ actor }: { actor: AuthenticatedActor }) {
  const { locale } = useLocale()
  const zh = locale === 'zh-CN'
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
  selectedRef.current = selectedId

  const refreshList = useCallback(async () => {
    const page = await apiRequest<ListResponse<Conversation>>(root)
    setConversations(page.items)
    setNextConversationCursor(page.nextCursor)
    setSelectedId(current => current ?? page.items[0]?.id ?? null)
  }, [])
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
      setSelectedId(conversationPage.items[0]?.id ?? null)
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
        body: JSON.stringify({ reason: zh ? '用户从工作台停止' : 'Stopped from workbench', stopMode: 'immediate' }) })
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
    const message = retry ? (zh ? '重试上一次请求。' : 'Retry the previous request.') : draft.trim()
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
  return <div className={styles.layout} data-testid="conversation-workbench">
    <aside className={styles.sidebar} aria-label={zh ? '对话列表' : 'Conversations'}>
      <div className={styles.heading}><h1>{zh ? 'Agent 工作台' : 'Agent workbench'}</h1><a href="/settings/agent-workbench">{zh ? '模型服务设置' : 'Model settings'}</a></div>
      <Button aria-controls="workbench-create-form" aria-expanded={showCreate} className={styles.newConversation}
        onClick={() => setShowCreate(current => !current)} type="button" variant="primary">{zh ? '新建对话' : 'Create conversation'}</Button>
      <form className={styles.create} data-open={showCreate} id="workbench-create-form" onSubmit={event => void create(event)}>
        <label>{zh ? '新对话标题' : 'New conversation title'}<input maxLength={180} onChange={event => setTitle(event.target.value)} required value={title} /></label>
        <label>{zh ? '执行会话' : 'Execution session'}<select onChange={event => setSessionId(event.target.value)} required value={sessionId}>
          {sessions.length === 0 && <option value="">{zh ? '暂无可用执行会话' : 'No available session'}</option>}
          {sessions.map(item => <option key={item.id} value={item.id}>{item.work_item_id ? `Issue ${item.work_item_id.slice(0, 8)}` : `Project ${item.project_id?.slice(0, 8)}`} · {item.id.slice(0, 8)} · {item.state}</option>)}
        </select></label>
        <label>{zh ? '模型服务' : 'Model service'}<select onChange={event => setConnectionId(event.target.value)} required value={connectionId}>
          {connections.length === 0 && <option value="">{zh ? '请先配置服务' : 'Configure a service'}</option>}
          {connections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>{zh ? '模型' : 'Model'}<select onChange={event => setModelId(event.target.value)} required value={modelId}>
          {modelOptions.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}
        </select></label>
        <Button disabled={busy || !sessionId || !connectionId || !modelId || !title.trim()} type="submit">{zh ? '新建对话' : 'Create conversation'}</Button>
        {sessions.length === 0 && <a href="/agents">{zh ? '前往智能体创建委派会话' : 'Open Agents to start a delegated session'}</a>}
      </form>
      <p className={styles.sectionLabel}>{zh ? '会话' : 'Conversations'}</p>
      <div className={styles.list} role="list">
        {loading ? <p>{zh ? '正在加载…' : 'Loading…'}</p> : conversations.length === 0 ? <p>{zh ? '尚无对话' : 'No conversations yet'}</p> : conversations.map(item =>
          <button aria-current={selectedId === item.id ? 'page' : undefined}
            className={`${styles.listItem} ${selectedId === item.id ? styles.listItemActive : ''}`}
            key={item.id} onClick={() => { setSelectedId(item.id); setShowCreate(false); setDraft(''); setError('') }} type="button">
            <span aria-hidden="true" className={`${styles.statusDot} ${item.status === 'active' ? styles.statusDotActive : styles.statusDotArchived}`} />
            <span className={styles.listTitle}>{item.title}</span>
            <span className={styles.listMeta}>{item.status} · {new Date(item.updated_at).toLocaleString(locale)}</span>
          </button>)}
        {nextConversationCursor && <button onClick={() => void loadMoreConversations()} type="button">{zh ? '加载更多对话' : 'Load more conversations'}</button>}
      </div>
      <p className={styles.sectionLabel}>{zh ? '执行器' : 'Executors'}</p>
      <div className={styles.rail}>
        {connections.map(item => <div className={styles.railRow} key={item.id}>
          <span aria-hidden="true" className={`${styles.railDot} ${item.status === 'active' ? styles.railDotReady : item.status === 'error' ? styles.railDotBad : styles.railDotIdle}`} />
          <span className={styles.railName}>{item.name}</span>
          <span className={styles.railValue}>{item.status}</span>
        </div>)}
        {connections.length === 0 && <p className={styles.hint}>{zh ? '尚未配置模型服务' : 'No model service configured'}</p>}
        <div className={styles.railRow}>
          <span aria-hidden="true" className={`${styles.railDot} ${selected?.agent_session_id ? styles.railDotReady : styles.railDotIdle}`} />
          <span className={styles.railName}>{zh ? '委派执行会话' : 'Delegated session'}</span>
          <span className={styles.railValue}>{boundSession?.state ?? '—'}</span>
        </div>
      </div>
    </aside>
    <section className={styles.main} aria-label={zh ? '对话内容' : 'Conversation'}>
      {error && <div role="alert" className={styles.error}>{error} <button onClick={() => { setError(''); void refreshList(); if (selectedId) void refreshSelected(selectedId) }} type="button">{zh ? '重试' : 'Retry'}</button></div>}
      {!selected ? <p className={styles.empty}>{zh ? '选择或新建对话。' : 'Select or create a conversation.'}</p> : <>
        <header className={styles.conversationHeader}><div><h2>{selected.title}</h2><p>{zh ? '公开对话记录与执行状态' : 'Public conversation record and execution state'}</p></div>
          <div className={styles.conversationFacts}>
            {boundSession && <span className={styles.chip}>{zh ? '会话' : 'session'} {boundSession.id.slice(0, 8)} · {boundSession.state}</span>}
            <Button disabled={busy || selected.status !== 'active' || turns.some(pending)} onClick={() => void archive()} variant="ghost">{zh ? '归档' : 'Archive'}</Button>
          </div></header>
        <div className={styles.timeline} aria-live="polite">
          {olderBefore && <button onClick={() => void loadOlder()} type="button">{zh ? '加载更早消息' : 'Load earlier messages'}</button>}
          {messages.length === 0 ? <p className={styles.empty}>{zh ? '发送第一条消息以开始。' : 'Send the first message to begin.'}</p> : messages.map(message =>
            <article className={message.role === 'user' ? styles.userMessage : styles.agentMessage} key={message.id}>
              <div className={styles.messageHead}>
                <span aria-hidden="true" className={`${styles.actorBadge} ${message.role === 'user' ? styles.actorBadgeHuman : message.role === 'system' ? styles.actorBadgeSystem : ''}`}>
                  {message.role === 'user' ? (zh ? '人' : 'H') : message.role === 'assistant' ? 'A' : 'S'}
                </span>
                <span className={styles.actorName}>{message.role === 'user' ? (zh ? '你' : 'You') : message.role === 'assistant' ? 'Agent' : 'System'}</span>
                <time className={styles.listMeta} dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(locale)}</time>
              </div>
              <div className={styles.messageBody}><RichContent density="compact" source={message.content_markdown} /></div>
            </article>)}
          {latestTurn && <div className={styles.turnState} role="status">
            <span className={`${styles.chip} ${latestTurn.status === 'settled' ? styles.chipSettled : latestTurn.status === 'failed' || latestTurn.status === 'stopped' ? styles.chipFailed : styles.chipPending}`}>
              {zh ? '回合' : 'turn'} #{latestTurn.sequence} · {latestTurn.status}
            </span>
            {latestTurn.error_code && <span className={`${styles.chip} ${styles.chipFailed}`}>{latestTurn.error_code}</span>}
            {latestTurn.retry_of_turn_id && <span className={styles.chip}>{zh ? '重试自' : 'retry of'} {latestTurn.retry_of_turn_id.slice(0, 8)}</span>}
            {pending(latestTurn) && <Button disabled={busy} onClick={() => void stop(latestTurn)} variant="ghost">{zh ? '停止' : 'Stop'}</Button>}
            {pending(latestTurn) && latestTurn.status === 'running' &&
              <form className={styles.steerForm} onSubmit={event => { event.preventDefault(); void steer(latestTurn) }}>
                <input aria-label={zh ? '转向指令（追加到执行中的回合）' : 'Steering instruction (appended to the running turn)'}
                  maxLength={50_000} onChange={event => setSteerDraft(event.target.value)} placeholder={zh ? '追加指示…' : 'Add steering…'}
                  value={steerDraft} />
                <Button disabled={busy || !steerDraft.trim()} type="submit" variant="ghost">{zh ? '追加指示' : 'Steer'}</Button>
              </form>}
            {!pending(latestTurn) && ['failed', 'stopped'].includes(latestTurn.status) &&
              <Button disabled={busy} onClick={() => void followUp(latestTurn, true)} variant="ghost">{zh ? '重试' : 'Retry'}</Button>}
            {!pending(latestTurn) && <Button disabled={busy || !draft.trim()} onClick={() => void followUp(latestTurn, false)} variant="ghost">{zh ? '追问' : 'Follow up'}</Button>}
          </div>}
          {latestTurn && ['RUNNER_AUTHORITY_LOST', 'RUNNER_TIMEOUT'].includes(latestTurn.error_code ?? '') &&
            <p className={styles.error} role="alert">{zh
              ? '执行进程中断，外部操作结果尚未对账。请先核对 Issue、文档和制品，再发送新消息。'
              : 'The runner stopped before settlement. External effects are unverified. Check the Issue, documents, and artifacts before sending another message.'}</p>}
        </div>
        {selected.status === 'active' && draftIdentity && <form className={styles.composer} onSubmit={event => void send(event)}>
          <div className={styles.composerPills}>
            {selected.work_item_id
              ? <a className={`${styles.contextPill} ${styles.contextPillBound}`} href={`/?view=my-work&workItem=${encodeURIComponent(selected.work_item_id)}`}>⨯ @{zh ? '工作项' : 'work item'} {selected.work_item_id.slice(0, 8)}</a>
              : <span className={styles.contextPill}>＋ @{zh ? '工作项' : 'work item'}</span>}
            {selected.project_id
              ? <a className={`${styles.contextPill} ${styles.contextPillBound}`} href={`/?view=projects&project=${encodeURIComponent(selected.project_id)}`}>⨯ @{zh ? '项目' : 'project'} {selected.project_id.slice(0, 8)}</a>
              : <span className={styles.contextPill}>＋ @{zh ? '项目' : 'project'}</span>}
            <span className={styles.contextPill}>{selected.context_pins.length > 0 ? `⨯ @${zh ? '文件' : 'files'} ${selected.context_pins.length}` : `＋ @${zh ? '文件' : 'files'}`}</span>
            <span className={styles.contextPill}>＋ @{zh ? '终端' : 'terminal'}</span>
          </div>
          <RichTextEditor identity={draftIdentity} label={zh ? '消息（Markdown）' : 'Message (Markdown)'} mode="comment" name="messageMarkdown" onChange={setDraft} required value={draft} />
          <div className={styles.composerFooter}>
            <div className={styles.turnModelSelection}>
              <label>{zh ? '本次模型服务' : 'Service for this turn'}<select aria-label={zh ? '本次模型服务' : 'Service for this turn'} disabled={busy} onChange={event => { turnPickRef.current = { conversationId: selected.id, connectionId: event.target.value, modelId: null }; setTurnConnectionId(event.target.value) }} value={turnConnectionId}>
                {connections.length === 0 && <option value="">{zh ? '请先配置服务' : 'Configure a service'}</option>}
                {connections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select></label>
              <label>{zh ? '本次模型' : 'Model for this turn'}<select aria-label={zh ? '本次模型' : 'Model for this turn'} disabled={busy || !turnConnectionId} onChange={event => { turnPickRef.current = { conversationId: selected.id, connectionId: turnConnectionId, modelId: event.target.value }; setTurnModelId(event.target.value) }} value={turnModelId}>
                {turnModels.length === 0 && <option value="">{zh ? '无可用模型' : 'No available model'}</option>}
                {turnModels.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}
              </select></label>
            </div>
            <div className={styles.composerActions}>
              <span className={styles.composerFacts}>{zh ? 'Enter 发送 · Shift+Enter 换行' : 'Enter to send · Shift+Enter for a new line'}</span>
              <Button disabled={busy || !draft.trim() || !sessionCanRun || !turnConnectionId || !turnModelId} type="submit">{zh ? '发送' : 'Send'}</Button>
            </div>
          </div>
          {!selected.agent_session_id && <p className={`${styles.hint} ${styles.hintBlocked}`}>{zh ? '此对话尚未绑定执行会话。' : 'This conversation has no execution session.'}</p>}
          {selected.agent_session_id && boundSession && !sessionCanRun && <p className={`${styles.hint} ${styles.hintBlocked}`} role="status">{zh ? '绑定的执行会话已结束，请创建新的委派会话。' : 'The bound execution session has ended. Start a new delegated session.'}</p>}
          {sessionCanRun && <p className={`${styles.hint} ${styles.hintReady}`}>● {zh ? '执行会话可运行' : 'Execution session can run'}{boundSession ? ` · ${boundSession.state}` : ''}</p>}
          {connections.length === 0 && <a href="/settings/agent-workbench">{zh ? '配置模型服务' : 'Configure a model service'}</a>}
        </form>}
      </>}
    </section>
    <aside className={styles.context} aria-label={zh ? '执行上下文' : 'Execution context'}>
      <h2>{zh ? '执行上下文' : 'Execution context'}</h2>
      {selected ? <><p>{zh ? '执行写操作由服务端授权。' : 'The server authorizes each write.'}</p>
        <ul className={styles.contextPins} data-testid="workbench-context-pins">
          {selected.project_id && <li><a href={`/?view=projects&project=${encodeURIComponent(selected.project_id)}`}>Project {selected.project_id.slice(0, 8)}</a></li>}
          {selected.work_item_id && <li><a href={`/?view=issues&workItem=${encodeURIComponent(selected.work_item_id)}`}>Issue {selected.work_item_id.slice(0, 8)}</a></li>}
          {selected.context_pins.map((pin, index) => <li key={`${pin.kind}-${pin.refId}-${index}`}>
            {pin.kind === 'work_item' ? 'Issue' : pin.kind === 'document' ? 'Document' : 'Guidance'} {pin.refId.slice(0, 8)}
            {pin.revision !== null ? ` · r${pin.revision}` : (pin.resolved_revision !== null && pin.resolved_revision !== undefined ? ` · r${pin.resolved_revision}` : ` · ${zh ? '跟随最新' : 'live head'}`)}
          </li>)}
        </ul>
        {selected.agent_session_id && <a href={`/agent-sessions/${selected.agent_session_id}`}>{zh ? '查看 Agent 会话与证据' : 'View Agent session and evidence'}</a>}
        {selected.agent_session_id && <span role="status">{zh ? '执行会话状态' : 'Execution session state'}: {boundSession?.state ?? (zh ? '正在读取' : 'Loading')}</span>}
        <small>{zh ? '对话版本' : 'Conversation revision'} {selected.revision}</small></> : <p>{zh ? '选择对话后显示上下文。' : 'Select a conversation to view context.'}</p>}
    </aside>
  </div>
}
