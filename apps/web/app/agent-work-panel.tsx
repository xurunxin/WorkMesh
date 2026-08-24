'use client'

import { type FormEvent, useMemo, useState } from 'react'
import { Button } from '@workmesh/ui'
import { apiRequest, json } from './lib/api'
import { type Agent, type AgentSession, type Approval, type PlanVersion, activeAgentTeamAccess, agentName, agentProvider, agentStateClass, agentStateLabel, approvedAgentCapabilitiesForTeam, canPauseAgentSession, canRetryAgentSession, canStopAgentSession, createAgentSession, formatTime, normalizeApproval, normalizePlan, preferredAgentForTeam, retryAgentSession } from './lib/agents'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { type RealtimeResource, useRealtimeSubscription } from './lib/realtime'
import { agentWorkRefreshTargets } from './lib/realtime-refresh'
import { useLocale } from './lib/i18n'

type Props = { workspaceId: string; workItemId: string; workItemTeamId: string; workItemRevision: number; humanActorId: string; workItemTitle?: string; onSessionCreated?: (session: AgentSession) => void }

export function AgentBadge({ state }: { state: AgentSession['state'] }) {
  const { agentWorkCopy: text } = useLocale()
  return <span aria-label={text.badgeAria(agentStateLabel(state))} className={agentStateClass(state)}>{agentStateLabel(state)}</span>
}

function AgentExecutionProjection({ session }: { session: AgentSession }) {
  const { agentWorkCopy: text } = useLocale()
  const plansPage = usePagedApiList<PlanVersion, PlanVersion>(
    `/api/v1/agent-sessions/${session.id}/plans`,
    { optional: true, map: value => normalizePlan(value as unknown as Record<string, unknown>) },
  )
  const approvalsPage = usePagedApiList<Approval, Approval>(
    `/api/v1/approvals?sessionId=${encodeURIComponent(session.id)}`,
    { optional: true, map: value => normalizeApproval(value as unknown as Record<string, unknown>) },
  )
  const plan = plansPage.items.find(candidate => candidate.id === session.current_plan_version_id) ?? plansPage.items.at(-1)
  const currentStep = plan?.steps.find(step => step.status === 'in_progress')
  const pendingApprovals = approvalsPage.items.filter(approval => approval.status === 'pending')
  return <dl className="agent-execution-facts" data-testid={`agent-execution-projection-${session.id}`}>
    <div><dt>{text.projectionCurrentStep}</dt><dd>{currentStep?.title ?? text.notReported}</dd></div>
    <div><dt>{text.projectionPendingApprovals}</dt><dd>{pendingApprovals.length}</dd></div>
    {(plansPage.error || approvalsPage.error) && <div><dt>{text.projectionStatus}</dt><dd>{text.projectionFailedStatus}。{text.projectionFailedHint}</dd></div>}
  </dl>
}

export function AgentWorkPanel({ workspaceId, workItemId, workItemTeamId, workItemRevision, humanActorId, workItemTitle, onSessionCreated }: Props) {
  const { agentWorkCopy: text } = useLocale()
  const [error, setError] = useState('')
  const [showDelegate, setShowDelegate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState('')
  const [prompt, setPrompt] = useState('')
  const agentsPage = usePagedApiList<Agent>('/api/v1/agents', { optional: true })
  const sessionsPage = usePagedApiList<AgentSession>(
    `/api/v1/agent-sessions?workItemId=${encodeURIComponent(workItemId)}`,
    { optional: true },
  )
  const agents = agentsPage.items
  const sessions = sessionsPage.items
  const collectionError = agentsPage.error ?? sessionsPage.error
  const realtimeResources = useMemo<RealtimeResource[]>(() => [
    { type: 'workspace', id: workspaceId },
    { type: 'team', id: workItemTeamId },
    { type: 'work_item', id: workItemId },
    ...sessions.map(session => ({
      type: 'session' as const,
      id: session.id,
    })),
  ], [sessions, workItemId, workItemTeamId, workspaceId])
  useRealtimeSubscription(realtimeResources, invalidation => {
    const targets = agentWorkRefreshTargets(invalidation, {
      teamId: workItemTeamId,
      workItemId,
      sessionIds: new Set(sessions.map(session => session.id)),
    })
    if (invalidation.reason === 'resync')
      return Promise.all([
        agentsPage.refresh(),
        sessionsPage.refresh(),
      ]).then(() => undefined)
    if (targets.has('agents')) void agentsPage.refresh()
    if (targets.has('sessions')) void sessionsPage.refresh()
  })

  const signal = async (session: AgentSession, signalName: 'pause' | 'resume' | 'stop') => {
    try {
      setBusy(true); setError('')
      await apiRequest<AgentSession>(`/api/v1/agent-sessions/${session.id}/signals`, {
        method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${session.revision}"` }, body: JSON.stringify({ signal: signalName, reason: `Human requested ${signalName} from WorkMesh.` }),
      })
      await sessionsPage.refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : text.updateError) } finally { setBusy(false) }
  }

  const delegateWith = async (agent: Agent | undefined, initialPrompt: string) => {
    if (!agent) return
    try {
      setBusy(true); setError(''); setSuccess('')
      const session = await createAgentSession({ workItemId, workItemTeamId, workItemRevision, humanActorId, agent, prompt: initialPrompt, budget: {} })
      await sessionsPage.refresh(); setShowDelegate(false); setPrompt(''); setSuccess(text.delegateSuccess(agentName(agent), session.state)); onSessionCreated?.(session)
    } catch (reason) { setError(reason instanceof Error ? reason.message : text.delegateError) } finally { setBusy(false) }
  }

  const delegate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await delegateWith(agents.find(candidate => candidate.id === String(form.get('agentId'))), String(form.get('prompt') ?? '').trim())
  }

  const retry = async (session: AgentSession) => {
    try {
      setBusy(true); setError('')
      const nextSession = await retryAgentSession(session)
      await sessionsPage.refresh()
      onSessionCreated?.(nextSession)
    } catch (reason) { setError(reason instanceof Error ? reason.message : text.retryError) } finally { setBusy(false) }
  }

  const activeAgents = agents.filter(agent => agent.is_active)
  const delegatableAgents = activeAgents.filter(agent => approvedAgentCapabilitiesForTeam(agent, workItemTeamId).length > 0)
  const preferredAgent = preferredAgentForTeam(agents, workItemTeamId)
  const unavailableReason = (agent: Agent): string => activeAgentTeamAccess(agent, workItemTeamId)
    ? text.noSharedDefinition
    : text.noActiveGrant
  const delegationUnavailableMessage = activeAgents.length === 0
    ? text.noActiveAgents
    : activeAgents.some(agent => activeAgentTeamAccess(agent, workItemTeamId))
      ? text.noSharedDefinition
    : text.noActiveGrant

  return <section className="agent-work-panel" aria-label={text.liveAgents} data-testid="live-agent-panel">
    <header><div><h3>{text.liveAgents}</h3><p>{text.liveAgentsHint}</p></div><div className="agent-work-panel-actions"><Button disabled={busy || !humanActorId || delegatableAgents.length === 0} onClick={() => void delegateWith(preferredAgent, text.oneClickPrompt(workItemTitle ?? ''))} type="button" variant="primary">{text.oneClickDelegate}</Button><Button disabled={busy || delegatableAgents.length === 0} onClick={() => setShowDelegate(current => !current)} type="button" variant="secondary">{text.advancedOptions}</Button></div></header>
    {delegatableAgents.length === 0 && <p className="empty" data-testid="delegate-unavailable-reason">{text.delegateUnavailableReason(delegationUnavailableMessage)}</p>}
    {!humanActorId && <p className="empty" data-testid="delegate-no-responsible">{text.noResponsible}</p>}
    {success && <p className="success" role="status" data-testid="delegate-success">{success}</p>}
    {(error || collectionError) && <div className="error-state"><p className="error" role="alert">{error || collectionError?.message}</p>{collectionError && <Button disabled={busy} onClick={() => { void agentsPage.refresh(); void sessionsPage.refresh() }} type="button" variant="secondary">{text.refresh}</Button>}</div>}
    {showDelegate && <form className="delegate-form" onSubmit={event => void delegate(event)} data-testid="delegate-agent-form">
      <label>{text.delegateFormAgent}<select defaultValue={preferredAgent?.id ?? ''} name="agentId" required><option value="">{text.delegateFormAgentPlaceholder}</option>{activeAgents.map(agent => { const capabilities = approvedAgentCapabilitiesForTeam(agent, workItemTeamId); return <option key={agent.id} value={agent.id} disabled={capabilities.length === 0}>{agentName(agent)} · {capabilities.length > 0 ? text.capabilitiesLine(agentProvider(agent), capabilities.join(', ')) : text.unavail(unavailableReason(agent))}</option> })}</select></label>
      <label>{text.delegateFormInitialPrompt}<textarea name="prompt" onChange={event => setPrompt(event.currentTarget.value)} placeholder={text.delegateFormInitialPromptPlaceholder} required value={prompt} /></label>
      <Button disabled={busy || !humanActorId} type="submit" variant="primary">{text.delegateFormStart}</Button>
    </form>}
    {sessions.length === 0 ? <p className="empty">{text.noSessions}</p> : <div className="session-mini-list">{sessions.map(session => <article key={session.id}><div><AgentBadge state={session.state} /><strong>{agentName(agents.find(agent => agent.id === session.agent_id) ?? { id: '', workspace_id: '', actor_id: '', slug: 'Agent', description: null, supported_protocols: [], skills: [], requested_capabilities: [], approved_capabilities: [], max_concurrency: 1, is_active: true, revision: 1 })}</strong></div><p>{session.state_reason || text.blockingReasonMissing}</p><small>{text.heartbeat(formatTime(session.last_heartbeat_at))}</small><AgentExecutionProjection session={session} /><div className="session-actions">{session.state === 'paused' && <Button disabled={busy} onClick={() => void signal(session, 'resume')} type="button" variant="secondary">{text.resume}</Button>}{canPauseAgentSession(session.state) && <Button disabled={busy} onClick={() => void signal(session, 'pause')} type="button" variant="secondary">{text.pause}</Button>}{canRetryAgentSession(session.state) && <Button disabled={busy} onClick={() => void retry(session)} type="button" variant="secondary">{text.retry}</Button>}<Button disabled={busy || !canStopAgentSession(session.state)} onClick={() => void signal(session, 'stop')} type="button" variant="danger">{text.stop}</Button><a href={`/agent-sessions/${session.id}`}>{text.details}</a></div></article>)}</div>}
    <LoadMoreButton collection={agentsPage} label={text.availableAgentsLabel} />
    <LoadMoreButton collection={sessionsPage} label={text.workItemSessionsLabel} />
  </section>
}
