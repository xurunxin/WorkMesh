'use client'

import { type FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button } from '@workmesh/ui'
import { ApiError, apiRequest, json } from './lib/api'
import { agentDelegationScopeKey, type Agent, type AgentSession, type Approval, type PlanVersion, activeAgentTeamAccess, agentName, agentProvider, agentStateClass, agentStateLabel, approvedAgentCapabilitiesForTeam, canPauseAgentSession, canRetryAgentSession, canStopAgentSession, createAgentSession, formatTime, isCurrentAgentDelegationScope, normalizeApproval, normalizePlan, retryAgentSession } from './lib/agents'
import { LoadMoreButton, type PagedCollection, usePagedApiList } from './lib/pagination'
import { type RealtimeResource, useRealtimeSubscription } from './lib/realtime'
import { agentWorkRefreshTargets } from './lib/realtime-refresh'
import { useLocale } from './lib/i18n'

type DelegationControllerInput = { workItemId: string | null; workItemTeamId: string | null; workItemRevision: number; humanActorId: string; workItemTitle?: string; scopeKey?: string | null }
export type LatestAgentSession = { agent: Agent; session: AgentSession }
export type AgentDelegationAvailabilityReason = 'missing_responsible_human' | 'loading_agents' | 'agents_unavailable' | 'no_eligible_agent' | 'delegating' | null
export type AgentDelegationController = {
  scopeKey: string
  agentsPage: PagedCollection<Agent>
  eligibleAgents: Agent[]
  directAgent: Agent | undefined
  canDirect: boolean
  canChoose: boolean
  disabled: boolean
  reason: AgentDelegationAvailabilityReason
  chooserRequest: number
  requestChooser: () => void
  create: (agent: Agent, prompt: string) => Promise<AgentSession>
  error: unknown
  busy: boolean
  latest: LatestAgentSession | null
  clearLatest: () => void
  clearError: () => void
}

type DelegationControllerState = {
  scopeKey: string
  chooserRequest: number
  error: unknown
  busy: boolean
  latest: LatestAgentSession | null
}

const emptyDelegationControllerState = (scopeKey: string): DelegationControllerState => ({ scopeKey, chooserRequest: 0, error: null, busy: false, latest: null })

export function useAgentDelegationController(input: DelegationControllerInput): AgentDelegationController {
  const generationKey = agentDelegationScopeKey(input)
  const generationRef = useRef(generationKey)
  if (generationRef.current !== generationKey) generationRef.current = generationKey
  const agentsPage = usePagedApiList<Agent>(input.workItemId ? '/api/v1/agents' : null, { optional: true, scopeKey: input.scopeKey })
  const [state, setState] = useState<DelegationControllerState>(() => emptyDelegationControllerState(generationKey))
  // React preserves hook state for a rerender. Mask the old scope during the
  // render that observes a new Issue so a pending request cannot flash in the
  // next Issue before the reset effect runs.
  const scopedState = state.scopeKey === generationKey ? state : emptyDelegationControllerState(generationKey)
  const eligibleAgents = useMemo(() => agentsPage.items.filter(agent => agent.is_active && input.workItemTeamId !== null && approvedAgentCapabilitiesForTeam(agent, input.workItemTeamId).length > 0), [agentsPage.items, input.workItemTeamId])
  const agentsComplete = agentsPage.initialized && !agentsPage.loading && !agentsPage.loadingMore && agentsPage.nextCursor === null
  const canDirect = Boolean(input.humanActorId && agentsComplete && eligibleAgents.length === 1)
  const canChoose = Boolean(input.humanActorId && agentsComplete && eligibleAgents.length > 0)
  const reason: AgentDelegationAvailabilityReason = scopedState.busy
    ? 'delegating'
    : !input.humanActorId
      ? 'missing_responsible_human'
      : agentsPage.error
        ? 'agents_unavailable'
        : !agentsComplete
          ? 'loading_agents'
          : eligibleAgents.length === 0
            ? 'no_eligible_agent'
            : null
  const disabled = scopedState.busy || (!canDirect && !canChoose)
  const create = useCallback(async (agent: Agent, prompt: string) => {
    const requestGeneration = generationKey
    setState(current => current.scopeKey === requestGeneration ? { ...current, busy: true, error: null } : current)
    try {
      const session = await createAgentSession({ workItemId: input.workItemId ?? '', workItemTeamId: input.workItemTeamId ?? '', workItemRevision: input.workItemRevision, humanActorId: input.humanActorId, agent, prompt, budget: {} })
      if (isCurrentAgentDelegationScope(generationRef.current, requestGeneration)) setState(current => current.scopeKey === requestGeneration ? { ...current, latest: { agent, session } } : current)
      return session
    } catch (reason) {
      if (isCurrentAgentDelegationScope(generationRef.current, requestGeneration)) setState(current => current.scopeKey === requestGeneration ? { ...current, error: reason } : current)
      throw reason
    } finally {
      if (isCurrentAgentDelegationScope(generationRef.current, requestGeneration)) setState(current => current.scopeKey === requestGeneration ? { ...current, busy: false } : current)
    }
  }, [generationKey, input.humanActorId, input.workItemId, input.workItemRevision, input.workItemTeamId])
  const clearLatest = useCallback(() => setState(current => current.scopeKey === generationKey ? { ...current, latest: null } : current), [generationKey])
  const clearError = useCallback(() => setState(current => current.scopeKey === generationKey ? { ...current, error: null } : current), [generationKey])
  const requestChooser = useCallback(() => setState(current => current.scopeKey === generationKey
    ? { ...current, chooserRequest: current.chooserRequest + 1 }
    : { ...emptyDelegationControllerState(generationKey), chooserRequest: 1 }), [generationKey])
  useEffect(() => {
    setState(emptyDelegationControllerState(generationKey))
  }, [generationKey])
  return {
    scopeKey: generationKey,
    agentsPage,
    eligibleAgents,
    directAgent: canDirect ? eligibleAgents[0] : undefined,
    canDirect,
    canChoose,
    disabled,
    reason,
    chooserRequest: scopedState.chooserRequest,
    requestChooser,
    create,
    error: scopedState.error,
    busy: scopedState.busy,
    latest: scopedState.latest,
    clearLatest,
    clearError,
  }
}

type Props = { workspaceId: string; workItemId: string; workItemTeamId: string; workItemRevision: number; humanActorId: string; workItemTitle?: string; controller: AgentDelegationController; onReloadWorkItem?: () => void; onSessionCreated?: (session: AgentSession) => void }

const capacityStates = new Set(['queued', 'acknowledged', 'planning', 'executing', 'awaiting_input', 'awaiting_approval', 'blocked', 'paused', 'stopping', 'stale'])
const safeCount = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000 ? value : undefined
const safeDiagnosticId = (value: unknown): string | undefined => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : undefined

function capacityErrorDetails(error: ApiError, format: (active: string, max: string, states: string) => string): string | null {
  if (error.code !== 'AGENT_CONCURRENCY_LIMIT' || !error.details || typeof error.details !== 'object') return null
  const details = error.details as Record<string, unknown>
  const active = safeCount(details.activeExecutionSessionCount)
  const max = safeCount(details.maxConcurrency)
  if (active === undefined || max === undefined) return null
  const states = details.activeExecutionSessionsByState && typeof details.activeExecutionSessionsByState === 'object'
    ? Object.entries(details.activeExecutionSessionsByState as Record<string, unknown>)
      .filter(([state, count]) => capacityStates.has(state) && safeCount(count) !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([state, count]) => `${state} ${safeCount(count)}`)
      .join(', ')
    : ''
  return format(String(active), String(max), states)
}

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
  const availabilityReasonId = useId()
  const panelScopeRef = useRef(controller.scopeKey)
  const panelScopeCurrent = panelScopeRef.current === controller.scopeKey
  if (!panelScopeCurrent) panelScopeRef.current = controller.scopeKey
  const [error, setError] = useState<unknown>(null)
  const [showDelegate, setShowDelegate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState('')
  const [prompt, setPrompt] = useState('')
  const sessionsPage = usePagedApiList<AgentSession>(
    `/api/v1/agent-sessions?workItemId=${encodeURIComponent(workItemId)}`,
    { optional: true, scopeKey: controller.scopeKey },
  )
  const displayedError = panelScopeCurrent ? error : null
  const displayedShowDelegate = panelScopeCurrent ? showDelegate : false
  const displayedBusy = panelScopeCurrent ? busy : false
  const displayedSuccess = panelScopeCurrent ? success : ''
  const displayedPrompt = panelScopeCurrent ? prompt : ''
  const agentsPage = controller.agentsPage
  const agents = agentsPage.items
  const sessions = sessionsPage.items
  const collectionError = agentsPage.error ?? sessionsPage.error
  const agentSelectRef = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    setBusy(false)
    setError(null)
    setSuccess('')
    setPrompt('')
    setShowDelegate(false)
  }, [controller.scopeKey])
  useEffect(() => { if (controller.chooserRequest > 0) setShowDelegate(true) }, [controller.chooserRequest])
  useEffect(() => {
    if (displayedShowDelegate) agentSelectRef.current?.focus()
  }, [displayedShowDelegate])
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
      setBusy(true); setError(null); controller.clearError()
      await apiRequest<AgentSession>(`/api/v1/agent-sessions/${session.id}/signals`, {
        method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${session.revision}"` }, body: JSON.stringify({ signal: signalName, reason: `Human requested ${signalName} from WorkMesh.` }),
      })
      await sessionsPage.refresh()
    } catch (reason) { setError(reason) } finally { setBusy(false) }
  }

  const delegateWith = async (agent: Agent | undefined, initialPrompt: string) => {
    if (!agent || !controller.canChoose) return
    try {
      setBusy(true); setError(null); setSuccess(''); controller.clearError()
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
      setBusy(true); setError(null); controller.clearError()
      const nextSession = await retryAgentSession(session)
      await sessionsPage.refresh()
      onSessionCreated?.(nextSession)
    } catch (reason) { setError(reason) } finally { setBusy(false) }
  }

  const activeAgents = agents.filter(agent => agent.is_active)
  const unavailableReason = (agent: Agent): string => activeAgentTeamAccess(agent, workItemTeamId)
    ? text.noSharedDefinition
    : text.noActiveGrant
  const delegationUnavailableMessage = activeAgents.length === 0
    ? text.noActiveAgents
    : activeAgents.some(agent => activeAgentTeamAccess(agent, workItemTeamId))
      ? text.noSharedDefinition
    : text.noActiveGrant

  const directAgent = controller.directAgent
  const primaryDisabled = displayedBusy || controller.disabled
  const surfacedError = displayedError ?? controller.error
  const errorApi = surfacedError instanceof ApiError ? surfacedError : collectionError instanceof ApiError ? collectionError : null
  const errorMessage = surfacedError instanceof Error ? surfacedError.message : collectionError?.message ?? text.delegateError
  const recoveryNeedsAgents = errorApi?.code ? ['AGENT_DELEGATE_NOT_GRANTED', 'AGENT_TEAM_GRANT_REQUIRED', 'AGENT_CAPABILITY_NOT_APPROVED', 'AGENT_TEAM_ACCESS_NOT_FOUND', 'APPROVED_CAPABILITY_NOT_REQUESTED', 'AGENT_CONCURRENCY_LIMIT', 'AGENT_NOT_ACTIVE', 'AGENT_NOT_AVAILABLE', 'DELEGATION_NOT_ACTIVE', 'CAPABILITY_DENIED'].includes(errorApi.code) : false
  const recoveryNeedsReload = errorApi?.code ? ['RESPONSIBLE_HUMAN_REQUIRED', 'AGENT_DELEGATION_FORBIDDEN', 'REVISION_CONFLICT', 'STALE_REVISION'].includes(errorApi.code) : false
  const capacityDetails = errorApi ? capacityErrorDetails(errorApi, text.capacitySummary) : null
  const diagnosticId = errorApi ? safeDiagnosticId(errorApi.correlationId) : undefined
  const availabilityMessage = controller.reason === 'missing_responsible_human'
    ? text.noResponsible
    : controller.reason === 'loading_agents'
      ? `${text.liveAgents}…`
      : controller.reason === 'agents_unavailable'
        ? text.refresh
        : delegationUnavailableMessage
  const refreshPanel = () => {
    setError(null)
    controller.clearError()
    void agentsPage.refresh()
    void sessionsPage.refresh()
    onReloadWorkItem?.()
  }
  return <section className="agent-work-panel" aria-label={text.liveAgents} data-testid="live-agent-panel">
    <header><div><h3>{text.liveAgents}</h3><p>{text.liveAgentsHint}</p></div><div className="agent-work-panel-actions"><Button aria-describedby={controller.disabled && availabilityMessage ? availabilityReasonId : undefined} disabled={primaryDisabled} onClick={() => directAgent ? void delegateWith(directAgent, text.oneClickPrompt(workItemTitle ?? '')) : controller.canChoose ? setShowDelegate(true) : undefined} title={controller.disabled && availabilityMessage ? availabilityMessage : undefined} type="button" variant="primary">{directAgent ? text.oneClickDelegate : text.chooseAgent}</Button><Button aria-controls="agent-delegation-form" aria-expanded={displayedShowDelegate} disabled={displayedBusy || controller.busy || !controller.canChoose} onClick={() => setShowDelegate(current => !current)} type="button" variant="secondary">{text.advancedOptions}</Button></div></header>
    {controller.disabled && availabilityMessage && <span className="wm-visually-hidden" id={availabilityReasonId}>{availabilityMessage}</span>}
    {controller.reason !== 'loading_agents' && controller.reason !== 'missing_responsible_human' && !controller.canChoose && <p className="empty" data-testid="delegate-unavailable-reason">{text.delegateUnavailableReason(availabilityMessage)}</p>}
    {!humanActorId && <p className="empty" data-testid="delegate-no-responsible">{text.noResponsible}</p>}
    {displayedSuccess && <p className="success" role="status" data-testid="delegate-success">{displayedSuccess}</p>}
    {(surfacedError || collectionError) && <div className="error-state"><p className="error" role="alert">{errorMessage}{errorApi?.code && ` [${text.errorCode(errorApi.code)}]`}{capacityDetails && ` ${capacityDetails}`}{diagnosticId && ` ${text.diagnosticId(diagnosticId)}`}{errorApi?.safeNextAction && ` ${errorApi.safeNextAction}`}</p>{(errorApi || collectionError) && <Button disabled={displayedBusy} onClick={refreshPanel} type="button" variant="secondary">{recoveryNeedsReload ? text.reloadIssue : text.refresh}</Button>}{recoveryNeedsAgents && <a href="/agents">{text.openAgents}</a>}</div>}
    <form className="delegate-form" hidden={!displayedShowDelegate} id="agent-delegation-form" onSubmit={event => void delegate(event)} data-testid="delegate-agent-form">
      <label>{text.delegateFormAgent}<select defaultValue="" name="agentId" ref={agentSelectRef} required><option value="">{text.delegateFormAgentPlaceholder}</option>{activeAgents.map(agent => { const capabilities = approvedAgentCapabilitiesForTeam(agent, workItemTeamId); return <option key={agent.id} value={agent.id} disabled={capabilities.length === 0}>{agentName(agent)} · {capabilities.length > 0 ? text.capabilitiesLine(agentProvider(agent), capabilities.join(', ')) : text.unavail(unavailableReason(agent))}</option> })}</select></label>
      <label>{text.delegateFormInitialPrompt}<textarea name="prompt" onChange={event => setPrompt(event.currentTarget.value)} placeholder={text.delegateFormInitialPromptPlaceholder} required value={displayedPrompt} /></label>
      <Button disabled={displayedBusy || !humanActorId || !controller.canChoose} type="submit" variant="primary">{text.delegateFormStart}</Button>
    </form>
    {sessions.length === 0 ? <p className="empty">{text.noSessions}</p> : <div className="session-mini-list">{sessions.map(session => <article key={session.id}><div><AgentBadge state={session.state} /><strong>{agentName(agents.find(agent => agent.id === session.agent_id) ?? { id: '', workspace_id: '', actor_id: '', slug: 'Agent', description: null, supported_protocols: [], skills: [], requested_capabilities: [], approved_capabilities: [], max_concurrency: 1, is_active: true, revision: 1 })}</strong></div><p>{session.state_reason || text.blockingReasonMissing}</p><small>{text.heartbeat(formatTime(session.last_heartbeat_at))}</small><AgentExecutionProjection session={session} /><div className="session-actions">{session.state === 'paused' && <Button disabled={displayedBusy} onClick={() => void signal(session, 'resume')} type="button" variant="secondary">{text.resume}</Button>}{canPauseAgentSession(session.state) && <Button disabled={displayedBusy} onClick={() => void signal(session, 'pause')} type="button" variant="secondary">{text.pause}</Button>}{canRetryAgentSession(session.state) && <Button disabled={displayedBusy} onClick={() => void retry(session)} type="button" variant="secondary">{text.retry}</Button>}<Button disabled={displayedBusy || !canStopAgentSession(session.state)} onClick={() => void signal(session, 'stop')} type="button" variant="danger">{text.stop}</Button><a href={`/agent-sessions/${session.id}`}>{text.details}</a></div></article>)}</div>}
    <LoadMoreButton collection={agentsPage} label={text.availableAgentsLabel} />
    <LoadMoreButton collection={sessionsPage} label={text.workItemSessionsLabel} />
  </section>
}
