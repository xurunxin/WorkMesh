'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { apiBase, apiRequest, json } from './lib/api'
import { type Agent, type AgentSession, activeAgentTeamAccess, agentName, agentProvider, agentStateClass, agentStateLabel, approvedAgentCapabilitiesForTeam, canPauseAgentSession, canRetryAgentSession, canStopAgentSession, delegateAndStart, formatTime, retryAgentSession } from './lib/agents'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'

type Props = { workItemId: string; workItemTeamId: string; workItemRevision: number; humanActorId: string; onSessionCreated?: (session: AgentSession) => void }

export function AgentBadge({ state }: { state: AgentSession['state'] }) {
  return <span className={agentStateClass(state)} aria-label={`Agent session ${agentStateLabel(state)}`}>{agentStateLabel(state)}</span>
}

export function AgentWorkPanel({ workItemId, workItemTeamId, workItemRevision, humanActorId, onSessionCreated }: Props) {
  const [error, setError] = useState('')
  const [showDelegate, setShowDelegate] = useState(false)
  const [busy, setBusy] = useState(false)
  const agentsPage = usePagedApiList<Agent>('/api/v1/agents', { optional: true })
  const sessionsPage = usePagedApiList<AgentSession>(
    `/api/v1/agent-sessions?workItemId=${encodeURIComponent(workItemId)}`,
    { optional: true },
  )
  const agents = agentsPage.items
  const sessions = sessionsPage.items
  const collectionError = agentsPage.error ?? sessionsPage.error
  useEffect(() => {
    let timer: number | undefined
    const cursor = window.localStorage.getItem('workmesh.events.cursor')
    const stream = new EventSource(`${apiBase}/api/v1/events/stream${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { withCredentials: true })
    stream.onmessage = event => {
      try { const payload = JSON.parse(event.data) as { cursor?: number }; const nextCursor = payload.cursor ?? Number(event.lastEventId); if (Number.isSafeInteger(nextCursor) && nextCursor >= 0) window.localStorage.setItem('workmesh.events.cursor', String(nextCursor)) } catch { /* Server refetch below remains authoritative. */ }
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void agentsPage.refresh()
        void sessionsPage.refresh()
      }, 150)
    }
    return () => { if (timer !== undefined) window.clearTimeout(timer); stream.close() }
  }, [agentsPage.refresh, sessionsPage.refresh])

  const signal = async (session: AgentSession, signalName: 'pause' | 'resume' | 'stop') => {
    try {
      setBusy(true); setError('')
      await apiRequest<AgentSession>(`/api/v1/agent-sessions/${session.id}/signals`, {
        method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${session.revision}"` }, body: JSON.stringify({ signal: signalName, reason: `Human requested ${signalName} from WorkMesh.` }),
      })
      await sessionsPage.refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update session.') } finally { setBusy(false) }
  }

  const delegate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const agent = agents.find(candidate => candidate.id === String(form.get('agentId')))
    if (!agent) return
    try {
      setBusy(true); setError('')
      const session = await delegateAndStart({ workItemId, workItemTeamId, workItemRevision, humanActorId, agent, prompt: String(form.get('prompt') ?? ''), budget: {} })
      await sessionsPage.refresh(); setShowDelegate(false); onSessionCreated?.(session)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to delegate work.') } finally { setBusy(false) }
  }

  const retry = async (session: AgentSession) => {
    try {
      setBusy(true); setError('')
      const nextSession = await retryAgentSession(session)
      await sessionsPage.refresh()
      onSessionCreated?.(nextSession)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to retry this session.') } finally { setBusy(false) }
  }

  const activeAgents = agents.filter(agent => agent.is_active)
  const delegatableAgents = activeAgents.filter(agent => approvedAgentCapabilitiesForTeam(agent, workItemTeamId).length > 0)
  const unavailableReason = (agent: Agent): string => activeAgentTeamAccess(agent, workItemTeamId)
    ? 'No shared definition and team capabilities'
    : 'No active grant for this team'
  const delegationUnavailableMessage = activeAgents.length === 0
    ? 'No active agents are registered.'
    : activeAgents.some(agent => activeAgentTeamAccess(agent, workItemTeamId))
      ? 'No active agent has capabilities approved by both its definition and this team.'
      : 'No active agent has an active grant for this work item team.'

  return <section className="agent-work-panel" aria-label="Live agent panel" data-testid="live-agent-panel">
    <header><div><h3>Live agents</h3><p>Sessions are refreshed from durable server state.</p></div><button type="button" onClick={() => setShowDelegate(current => !current)} disabled={delegatableAgents.length === 0}>Delegate</button></header>
    {delegatableAgents.length === 0 && <p className="empty" data-testid="delegate-unavailable-reason">{delegationUnavailableMessage}</p>}
    {(error || collectionError) && <p className="error" role="alert">{error || collectionError?.message}</p>}
    {showDelegate && <form className="delegate-form" onSubmit={event => void delegate(event)} data-testid="delegate-agent-form">
      <label>Agent<select name="agentId" required><option value="">Choose an agent approved for this team</option>{activeAgents.map(agent => { const capabilities = approvedAgentCapabilitiesForTeam(agent, workItemTeamId); return <option key={agent.id} value={agent.id} disabled={capabilities.length === 0}>{agentName(agent)} · {capabilities.length > 0 ? `${agentProvider(agent)} · ${capabilities.join(', ')}` : unavailableReason(agent)}</option> })}</select></label>
      <label>Initial prompt<textarea name="prompt" placeholder="What should this agent do?" required /></label>
      <button disabled={busy}>Start session</button>
    </form>}
    {sessions.length === 0 ? <p className="empty">No delegated agent session yet.</p> : <div className="session-mini-list">{sessions.map(session => <article key={session.id}><div><AgentBadge state={session.state} /><strong>{agentName(agents.find(agent => agent.id === session.agent_id) ?? { id: '', workspace_id: '', actor_id: '', slug: 'Agent', description: null, supported_protocols: [], skills: [], requested_capabilities: [], approved_capabilities: [], max_concurrency: 1, is_active: true, revision: 1 })}</strong></div><p>{session.state_reason || 'No blocking reason reported.'}</p><small>Heartbeat: {formatTime(session.last_heartbeat_at)}</small><div className="session-actions">{session.state === 'paused' && <button type="button" disabled={busy} onClick={() => void signal(session, 'resume')}>Resume</button>}{canPauseAgentSession(session.state) && <button type="button" disabled={busy} onClick={() => void signal(session, 'pause')}>Pause</button>}{canRetryAgentSession(session.state) && <button type="button" disabled={busy} onClick={() => void retry(session)}>Retry</button>}<button className="danger" type="button" disabled={busy || !canStopAgentSession(session.state)} onClick={() => void signal(session, 'stop')}>Stop</button><a href={`/agent-sessions/${session.id}`}>Details</a></div></article>)}</div>}
    <LoadMoreButton collection={agentsPage} label="available agents" />
    <LoadMoreButton collection={sessionsPage} label="work item sessions" />
  </section>
}
