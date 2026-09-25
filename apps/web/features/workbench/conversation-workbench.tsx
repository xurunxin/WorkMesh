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
}
type Message = { id: string; role: 'user' | 'assistant' | 'system'; sequence: number; content_markdown: string; created_at: string }
type Turn = { id: string; status: string; sequence: number; error_code: string | null }
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
  const [connectionId, setConnectionId] = useState('')
  const [modelId, setModelId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [title, setTitle] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [turns, setTurns] = useState<Turn[]>([])
  const [olderBefore, setOlderBefore] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selectedRef = useRef<string | null>(null)
  const olderLoaded = useRef(false)
  selectedRef.current = selectedId

  const refreshList = useCallback(async () => {
    const page = await apiRequest<ListResponse<Conversation>>(root)
    setConversations(page.items)
    setNextConversationCursor(page.nextCursor)
    setSelectedId(current => current ?? page.items[0]?.id ?? null)
  }, [])
  const refreshSelected = useCallback(async (conversationId: string) => {
    const path = `${root}/${encodeURIComponent(conversationId)}`
    const [detail, messagePage, turnPage] = await Promise.all([
      apiRequest<Conversation>(path), apiRequest<SequencePage<Message>>(`${path}/messages?limit=50`),
      apiRequest<SequencePage<Turn>>(`${path}/turns?limit=50`),
    ])
    if (selectedRef.current !== conversationId) return
    setSelected(detail)
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
    if (!selectedId) { setSelected(null); setMessages([]); setTurns([]); return }
    let active = true
    olderLoaded.current = false
    setSelected(null); setMessages([]); setTurns([])
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
      setTitle(''); await refreshList(); setSelectedId(created.id)
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected || !draft.trim() || busy) return
    setBusy(true); setError('')
    const identity: DraftIdentity = { workspaceId: actor.workspace_id ?? '', teamId: selected.team_id ?? '', actorId: actor.id,
      resourceType: 'workbench_conversation', resourceId: selected.id, field: 'message', baseRevision: 0 }
    try {
      await apiMutation(`workbench:send:${selected.id}`, `${root}/${selected.id}/turns`, { method: 'POST',
        headers: { ...json({}), 'If-Match': etag(selected.revision) }, body: JSON.stringify({ messageMarkdown: draft.trim() }) })
      clearDraft(localStorage, identity); setDraft(''); await refreshSelected(selected.id)
    } catch (reason) { setError(errorText(reason)); await refreshSelected(selected.id).catch(() => undefined) }
    finally { setBusy(false) }
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
  const draftIdentity: DraftIdentity | null = selected ? { workspaceId: actor.workspace_id ?? '', teamId: selected.team_id ?? '', actorId: actor.id,
    resourceType: 'workbench_conversation', resourceId: selected.id, field: 'message', baseRevision: 0 } : null
  return <div className={styles.layout} data-testid="conversation-workbench">
    <aside className={styles.sidebar} aria-label={zh ? '对话列表' : 'Conversations'}>
      <div className={styles.heading}><h1>{zh ? 'Agent 工作台' : 'Agent workbench'}</h1><a href="/settings/agent-workbench">{zh ? '模型服务设置' : 'Model settings'}</a></div>
      <form className={styles.create} onSubmit={event => void create(event)}>
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
      <div className={styles.list} role="list">
        {loading ? <p>{zh ? '正在加载…' : 'Loading…'}</p> : conversations.length === 0 ? <p>{zh ? '尚无对话' : 'No conversations yet'}</p> : conversations.map(item =>
          <button aria-current={selectedId === item.id ? 'page' : undefined} className={selectedId === item.id ? styles.active : ''}
            key={item.id} onClick={() => { setSelectedId(item.id); setDraft(''); setError('') }} type="button">
            <strong>{item.title}</strong><small>{item.status} · {new Date(item.updated_at).toLocaleString(locale)}</small>
          </button>)}
        {nextConversationCursor && <button onClick={() => void loadMoreConversations()} type="button">{zh ? '加载更多对话' : 'Load more conversations'}</button>}
      </div>
    </aside>
    <section className={styles.main} aria-label={zh ? '对话内容' : 'Conversation'}>
      {error && <div role="alert" className={styles.error}>{error} <button onClick={() => { setError(''); void refreshList(); if (selectedId) void refreshSelected(selectedId) }} type="button">{zh ? '重试' : 'Retry'}</button></div>}
      {!selected ? <p className={styles.empty}>{zh ? '选择或新建对话。' : 'Select or create a conversation.'}</p> : <>
        <header className={styles.conversationHeader}><div><h2>{selected.title}</h2><p>{zh ? '公开对话记录与执行状态' : 'Public conversation record and execution state'}</p></div>
          <Button disabled={busy || selected.status !== 'active' || turns.some(pending)} onClick={() => void archive()} variant="ghost">{zh ? '归档' : 'Archive'}</Button></header>
        <div className={styles.timeline} aria-live="polite">
          {olderBefore && <button onClick={() => void loadOlder()} type="button">{zh ? '加载更早消息' : 'Load earlier messages'}</button>}
          {messages.length === 0 ? <p className={styles.empty}>{zh ? '发送第一条消息以开始。' : 'Send the first message to begin.'}</p> : messages.map(message =>
            <article className={message.role === 'user' ? styles.userMessage : styles.agentMessage} key={message.id}>
              <div><strong>{message.role === 'user' ? (zh ? '你' : 'You') : message.role === 'assistant' ? 'Agent' : 'System'}</strong><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(locale)}</time></div>
              <RichContent density="compact" source={message.content_markdown} />
            </article>)}
          {latestTurn && <div className={styles.turnState} role="status">{zh ? '最近一次执行' : 'Latest turn'}: {latestTurn.status}{latestTurn.error_code ? ` · ${latestTurn.error_code}` : ''}
            {pending(latestTurn) && <Button disabled={busy} onClick={() => void stop(latestTurn)} variant="ghost">{zh ? '停止' : 'Stop'}</Button>}
          </div>}
        </div>
        {selected.status === 'active' && draftIdentity && <form className={styles.composer} onSubmit={event => void send(event)}>
          <RichTextEditor identity={draftIdentity} label={zh ? '消息（Markdown）' : 'Message (Markdown)'} mode="comment" name="messageMarkdown" onChange={setDraft} required value={draft} />
          <Button disabled={busy || !draft.trim() || !selected.agent_session_id} type="submit">{zh ? '发送' : 'Send'}</Button>
          {!selected.agent_session_id && <p>{zh ? '此对话尚未绑定执行会话。' : 'This conversation has no execution session.'}</p>}
        </form>}
      </>}
    </section>
    <aside className={styles.context} aria-label={zh ? '执行上下文' : 'Execution context'}>
      <h2>{zh ? '执行上下文' : 'Execution context'}</h2>
      {selected ? <><p>{zh ? '执行写操作由服务端授权。' : 'The server authorizes each write.'}</p>
        {selected.work_item_id && <a href={`/?workItemId=${encodeURIComponent(selected.work_item_id)}`}>Issue {selected.work_item_id.slice(0, 8)}</a>}
        {selected.project_id && <a href={`/?view=projects&projectId=${encodeURIComponent(selected.project_id)}`}>Project {selected.project_id.slice(0, 8)}</a>}
        {selected.agent_session_id && <a href={`/agent-sessions/${selected.agent_session_id}`}>{zh ? '查看 Agent 会话与证据' : 'View Agent session and evidence'}</a>}
        <small>{zh ? '对话版本' : 'Conversation revision'} {selected.revision}</small></> : <p>{zh ? '选择对话后显示上下文。' : 'Select a conversation to view context.'}</p>}
    </aside>
  </div>
}
