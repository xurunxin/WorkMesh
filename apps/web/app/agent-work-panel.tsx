'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@workmesh/ui'
import { ApiError, apiRequest, json } from './lib/api'
import { agentDelegationScopeKey, type Agent, type AgentSession, type Approval, type PlanVersion, activeAgentTeamAccess, agentName, agentProvider, agentStateClass, agentStateLabel, approvedAgentCapabilitiesForTeam, canPauseAgentSession, canRetryAgentSession, canStopAgentSession, createAgentSession, formatTime, isCurrentAgentDelegationScope, normalizeApproval, normalizePlan, retryAgentSession } from './lib/agents'
import { LoadMoreButton, type PagedCollection, usePagedApiList } from './lib/pagination'
import { type RealtimeResource, useRealtimeSubscription } from './lib/realtime'
import { agentWorkRefreshTargets } from './lib/realtime-refresh'
import { useLocale } from './lib/i18n'

type DelegationControllerInput = { workItemId: string | null; workItemTeamId: string | null; workItemRevision: number; humanActorId: string; workItemTitle?: string; scopeKey?: string | null }
export type LatestAgentSession = { agent: Agent; session: AgentSession }
export type AgentDelegationController = {
  agentsPage: PagedCollection<Agent>
  eligibleAgents: Agent[]
  directAgent: Agent | undefined
  chooserRequest: number
  requestChooser: () => void
  create: (agent: Agent, prompt: string) => Promise<AgentSession>
  error: unknown
  busy: boolean
  latest: LatestAgentSession | null
  clearLatest: () => void
}

export function useAgentDelegationController(input: DelegationControllerInput): AgentDelegationController {
  const generationKey = agentDelegationScopeKey(input)
  const generationRef = useRef(generationKey)
  if (generationRef.current !== generationKey) generationRef.current = generationKey
  const agentsPage = usePagedApiList<Agent>(input.workItemId ? '/api/v1/agents' : null, { optional: true, scopeKey: input.scopeKey })
  const [chooserRequest, setChooserRequest] = useState(0)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [latest, setLatest] = useState<LatestAgentSession | null>(null)
  const eligibleAgents = useMemo(() => agentsPage.items.filter(agent => agent.is_active && input.workItemTeamId !== null && approvedAgentCapabilitiesForTeam(agent, input.workItemTeamId).length > 0), [agentsPage.items, input.workItemTeamId])
  const create = useCallback(async (agent: Agent, prompt: string) => {
    const requestGeneration = generationKey
    setBusy(true); setError(null)
    try {
      const session = await createAgentSession({ workItemId: input.workItemId ?? '', workItemTeamId: input.workItemTeamId ?? '', workItemRevision: input.workItemRevision, humanActorId: input.humanActorId, agent, prompt, budget: {} })
      if (isCurrentAgentDelegationScope(generationRef.current, requestGeneration)) setLatest({ agent, session })
      return session
    } catch (reason) {
      if (isCurrentAgentDelegationScope(generationRef.current, requestGeneration)) setError(reason)
      throw reason
    } finally {
      if (isCurrentAgentDelegationScope(generationRef.current, requestGeneration)) setBusy(false)
    }
  }, [generationKey, input.humanActorId, input.workItemId, input.workItemRevision, input.workItemTeamId])
  const clearLatest = useCallback(() => setLatest(null), [])
  useEffect(() => {
    setBusy(false)
    setError(null)
    setLatest(null)
    setChooserRequest(0)
  }, [generationKey])
  const agentsComplete = agentsPage.initialized && !agentsPage.loading && !agentsPage.loadingMore && agentsPage.nextCursor === null
  return { agentsPage, eligibleAgents, directAgent: input.humanActorId && agentsComplete && eligibleAgents.length === 1 ? eligibleAgents[0] : undefined, chooserRequest, requestChooser: () => setChooserRequest(value => value + 1), create, error, busy, latest, clearLatest }
}

type Props = { workspaceId: string; workItemId: string; workItemTeamId: string; workItemRevision: number; humanActorId: string; workItemTitle?: string; controller: AgentDelegationController; onReloadWorkItem?: () => void; onSessionCreated?: (session: AgentSession) => void }

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

export function AgentWorkPanel({ workspaceId, workItemId, workItemTeamId, workItemRevision, humanActorId, workItemTitle, controller, onReloadWorkItem, onSessionCreated }: Props) {
  const { agentWorkCopy: text } = useLocale()
  const [error, setError] = useState<unknown>(null)
  const [showDelegate, setShowDelegate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState('')
  const [prompt, setPrompt] = useState('')
  const sessionsPage = usePagedApiList<AgentSession>(
    `/api/v1/agent-sessions?workItemId=${encodeURIComponent(workItemId)}`,
    { optional: true },
  )
  const agentsPage = controller.agentsPage
  const agents = agentsPage.items
  const sessions = sessionsPage.items
  const collectionError = agentsPage.error ?? sessionsPage.error
  useEffect(() => { if (controller.chooserRequest > 0) setShowDelegate(true) }, [controller.chooserRequest])
  useEffect(() => {
    const latest = controller.latest
    if (!latest) return
    void sessionsPage.refresh()
    setShowDelegate(false)
    setPrompt('')
    setSuccess(text.delegateSuccess(agentName(latest.agent), latest.session.state))
    onSessionCreated?.(latest.session)
    controller.clearLatest()
  }, [controller.clearLatest, controller.latest, onSessionCreated, sessionsPage.refresh, text.delegateSuccess])
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
      setBusy(true); setError(null)
      await apiRequest<AgentSession>(`/api/v1/agent-sessions/${session.id}/signals`, {
        method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${session.revision}"` }, body: JSON.stringify({ signal: signalName, reason: `Human requested ${signalName} from WorkMesh.` }),
      })
      await sessionsPage.refresh()
    } catch (reason) { setError(reason) } finally { setBusy(false) }
  }

  const delegateWith = async (agent: Agent | undefined, initialPrompt: string) => {
    if (!agent) return
    try {
      setBusy(true); setError(null); setSuccess('')
      await controller.create(agent, initialPrompt)
    } catch (reason) { setError(reason) } finally { setBusy(false) }
  }

  const delegate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await delegateWith(agents.find(candidate => candidate.id === String(form.get('agentId'))), String(form.get('prompt') ?? '').trim())
  }

  const retry = async (session: AgentSession) => {
    try {
      setBusy(true); setError(null)
      const nextSession = await retryAgentSession(session)
      await sessionsPage.refresh()
      onSessionCreated?.(nextSession)
    } catch (reason) { setError(reason) } finally { setBusy(false) }
  }

  const activeAgents = agents.filter(agent => agent.is_active)
  const delegatableAgents = controller.eligibleAgents
  const unavailableReason = (agent: Agent): string => activeAgentTeamAccess(agent, workItemTeamId)
    ? text.noSharedDefinition
    : text.noActiveGrant
  const delegationUnavailableMessage = activeAgents.length === 0
    ? text.noActiveAgents
    : activeAgents.some(agent => activeAgentTeamAccess(agent, workItemTeamId))
      ? text.noSharedDefinition
    : text.noActiveGrant

  const directAgent = controller.directAgent
  const primaryDisabled = busy || controller.busy || !humanActorId || (!directAgent && delegatableAgents.length === 0 && agentsPage.initialized && agentsPage.nextCursor === null)
  const surfacedError = error ?? controller.error
  const errorApi = surfacedError instanceof ApiError ? surfacedError : collectionError instanceof ApiError ? collectionError : null
  const errorMessage = surfacedError instanceof Error ? surfacedError.message : collectionError?.message ?? text.delegateError
  const recoveryNeedsAgents = errorApi?.code ? ['AGENT_DELEGATE_NOT_GRANTED', 'AGENT_TEAM_GRANT_REQUIRED', 'AGENT_CAPABILITY_NOT_APPROVED', 'AGENT_TEAM_ACCESS_NOT_FOUND', 'APPROVED_CAPABILITY_NOT_REQUESTED', 'AGENT_CONCURRENCY_LIMIT', 'AGENT_NOT_ACTIVE', 'AGENT_NOT_AVAILABLE', 'DELEGATION_NOT_ACTIVE'].includes(errorApi.code) : false
  const recoveryNeedsReload = errorApi?.code ? ['RESPONSIBLE_HUMAN_REQUIRED', 'AGENT_DELEGATION_FORBIDDEN', 'REVISION_CONFLICT', 'STALE_REVISION'].includes(errorApi.code) : false
  return <section className="agent-work-panel" aria-label={text.liveAgents} data-testid="live-agent-panel">
    <header><div><h3>{text.liveAgents}</h3><p>{text.liveAgentsHint}</p></div><div className="agent-work-panel-actions"><Button disabled={primaryDisabled} onClick={() => directAgent ? void delegateWith(directAgent, text.oneClickPrompt(workItemTitle ?? '')) : setShowDelegate(true)} type="button" variant="primary">{directAgent ? text.oneClickDelegate : text.chooseAgent}</Button><Button aria-controls="agent-delegation-form" aria-expanded={showDelegate} disabled={busy || controller.busy || delegatableAgents.length === 0} onClick={() => setShowDelegate(current => !current)} type="button" variant="secondary">{text.advancedOptions}</Button></div></header>
    {delegatableAgents.length === 0 && <p className="empty" data-testid="delegate-unavailable-reason">{text.delegateUnavailableReason(delegationUnavailableMessage)}</p>}
    {!humanActorId && <p className="empty" data-testid="delegate-no-responsible">{text.noResponsible}</p>}
    {success && <p className="success" role="status" data-testid="delegate-success">{success}</p>}
    {(surfacedError || collectionError) && <div className="error-state"><p className="error" role="alert">{errorMessage}{errorApi?.code && ` [${text.errorCode(errorApi.code)}]`}{errorApi?.safeNextAction && ` ${errorApi.safeNextAction}`}</p>{(errorApi || collectionError) && <Button disabled={busy} onClick={() => { void agentsPage.refresh(); void sessionsPage.refresh(); onReloadWorkItem?.() }} type="button" variant="secondary">{recoveryNeedsReload ? text.reloadIssue : text.refresh}</Button>}{recoveryNeedsAgents && <a href="/agents">{text.openAgents}</a>}</div>}
    {showDelegate && <form className="delegate-form" id="agent-delegation-form" onSubmit={event => void delegate(event)} data-testid="delegate-agent-form">
      <label>{text.delegateFormAgent}<select defaultValue="" name="agentId" required><option value="">{text.delegateFormAgentPlaceholder}</option>{activeAgents.map(agent => { const capabilities = approvedAgentCapabilitiesForTeam(agent, workItemTeamId); return <option key={agent.id} value={agent.id} disabled={capabilities.length === 0}>{agentName(agent)} · {capabilities.length > 0 ? text.capabilitiesLine(agentProvider(agent), capabilities.join(', ')) : text.unavail(unavailableReason(agent))}</option> })}</select></label>
      <label>{text.delegateFormInitialPrompt}<textarea name="prompt" onChange={event => setPrompt(event.currentTarget.value)} placeholder={text.delegateFormInitialPromptPlaceholder} required value={prompt} /></label>
      <Button disabled={busy || !humanActorId} type="submit" variant="primary">{text.delegateFormStart}</Button>
    </form>}
    {sessions.length === 0 ? <p className="empty">{text.noSessions}</p> : <div className="session-mini-list">{sessions.map(session => <article key={session.id}><div><AgentBadge state={session.state} /><strong>{agentName(agents.find(agent => agent.id === session.agent_id) ?? { id: '', workspace_id: '', actor_id: '', slug: 'Agent', description: null, supported_protocols: [], skills: [], requested_capabilities: [], approved_capabilities: [], max_concurrency: 1, is_active: true, revision: 1 })}</strong></div><p>{session.state_reason || text.blockingReasonMissing}</p><small>{text.heartbeat(formatTime(session.last_heartbeat_at))}</small><AgentExecutionProjection session={session} /><div className="session-actions">{session.state === 'paused' && <Button disabled={busy} onClick={() => void signal(session, 'resume')} type="button" variant="secondary">{text.resume}</Button>}{canPauseAgentSession(session.state) && <Button disabled={busy} onClick={() => void signal(session, 'pause')} type="button" variant="secondary">{text.pause}</Button>}{canRetryAgentSession(session.state) && <Button disabled={busy} onClick={() => void retry(session)} type="button" variant="secondary">{text.retry}</Button>}<Button disabled={busy || !canStopAgentSession(session.state)} onClick={() => void signal(session, 'stop')} type="button" variant="danger">{text.stop}</Button><a href={`/agent-sessions/${session.id}`}>{text.details}</a></div></article>)}</div>}
    <LoadMoreButton collection={agentsPage} label={text.availableAgentsLabel} />
    <LoadMoreButton collection={sessionsPage} label={text.workItemSessionsLabel} />
  </section>
}
