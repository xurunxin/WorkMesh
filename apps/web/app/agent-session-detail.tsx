'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiRequest, json } from './lib/api'
import { type AgentActivity, type AgentSession, type Approval, type Artifact, type PlanVersion, agentStateClass, agentStateLabel, canPauseAgentSession, canRetryAgentSession, canStopAgentSession, formatTime, normalizeActivity, normalizeApproval, normalizeArtifact, normalizePlan, retryAgentSession } from './lib/agents'
import { AgentBadge } from './agent-work-panel'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { useRealtimeSubscription } from './lib/realtime'

type DetailTab = 'conversation' | 'plan' | 'activity' | 'artifacts'
type Props = { sessionId: string; compact?: boolean; tab?: DetailTab }
type ActivityFilter = 'all' | 'actions' | 'questions' | 'evidence' | 'errors'
type HumanActor = { id: string; display_name: string }

const matchesActivity = (activity: AgentActivity, filter: ActivityFilter): boolean => {
  if (activity.kind === 'heartbeat') return false
  if (filter === 'all') return true
  if (filter === 'actions') return ['action_started', 'action_completed', 'status', 'plan_changed', 'plan_published'].includes(activity.kind)
  if (filter === 'questions') return ['question', 'decision_request', 'message'].includes(activity.kind)
  if (filter === 'evidence') return ['evidence', 'artifact_published', 'completion'].includes(activity.kind)
  return ['error', 'warning'].includes(activity.kind)
}

export function AgentSessionDetail({ sessionId, compact = false, tab }: Props) {
  const router = useRouter()
  const [session, setSession] = useState<AgentSession | null>(null)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [showHeartbeats, setShowHeartbeats] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [comparePlanId, setComparePlanId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const activitiesPage = usePagedApiList<AgentActivity, AgentActivity>(
    `/api/v1/agent-sessions/${sessionId}/activities`,
    { optional: true, map: value => normalizeActivity(value as unknown as Record<string, unknown>) },
  )
  const plansPage = usePagedApiList<PlanVersion, PlanVersion>(
    `/api/v1/agent-sessions/${sessionId}/plans`,
    { optional: true, map: value => normalizePlan(value as unknown as Record<string, unknown>) },
  )
  const artifactsPage = usePagedApiList<Artifact, Artifact>(
    `/api/v1/artifacts?sessionId=${encodeURIComponent(sessionId)}`,
    { optional: true, map: value => normalizeArtifact(value as unknown as Record<string, unknown>) },
  )
  const approvalsPage = usePagedApiList<Approval, Approval>(
    `/api/v1/approvals?sessionId=${encodeURIComponent(sessionId)}`,
    { optional: true, map: value => normalizeApproval(value as unknown as Record<string, unknown>) },
  )
  const humansPage = usePagedApiList<HumanActor>('/api/v1/actors/humans', { optional: true })
  const activities = activitiesPage.items
  const plans = plansPage.items
  const artifacts = artifactsPage.items
  const approvals = approvalsPage.items
  const humans = humansPage.items
  const collectionError = [
    activitiesPage.error, plansPage.error, artifactsPage.error, approvalsPage.error, humansPage.error,
  ].find(Boolean)

  const load = useCallback(async () => {
    try {
      setError('')
      setSession(await apiRequest<AgentSession>(`/api/v1/agent-sessions/${sessionId}`))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load this session.') }
  }, [sessionId])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    setSelectedPlanId(current => current || session?.current_plan_version_id || plans.at(-1)?.id || '')
  }, [plans, session?.current_plan_version_id])
  useRealtimeSubscription(
    useMemo(() => [{ type: 'session' as const, id: sessionId }], [sessionId]),
    invalidation => {
      if (invalidation.reason === 'resync')
        return Promise.all([
          load(), activitiesPage.refresh(), plansPage.refresh(),
          artifactsPage.refresh(), approvalsPage.refresh(), humansPage.refresh(),
        ]).then(() => undefined)
      void load()
      void activitiesPage.refresh(); void plansPage.refresh()
      void artifactsPage.refresh(); void approvalsPage.refresh(); void humansPage.refresh()
    },
  )

  const signal = async (signalName: 'pause' | 'resume' | 'stop') => {
    if (!session) return
    try { setBusy(true); const updated = await apiRequest<AgentSession>(`/api/v1/agent-sessions/${session.id}/signals`, { method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${session.revision}"` }, body: JSON.stringify({ signal: signalName, reason: `Human requested ${signalName} from session details.` }) }); setSession(updated) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update this session.') } finally { setBusy(false) }
  }
  const prompt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!session) return
    const form = new FormData(event.currentTarget)
    try { setBusy(true); await apiRequest(`/api/v1/agent-sessions/${session.id}/prompt`, { method: 'POST', headers: json({}), body: JSON.stringify({ bodyMarkdown: String(form.get('prompt') ?? '') }) }); event.currentTarget.reset(); await load(); await activitiesPage.refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to send prompt.') } finally { setBusy(false) }
  }
  const decide = async (approval: Approval, decision: 'approved' | 'rejected') => {
    try { setBusy(true); await apiRequest(`/api/v1/approvals/${approval.id}/decide`, { method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${approval.revision}"` }, body: JSON.stringify({ decision, reason: `Human ${decision} from the approval inbox.` }) }); await load(); await approvalsPage.refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to decide approval.') } finally { setBusy(false) }
  }
  const retry = async () => {
    if (!session) return
    try {
      setBusy(true); setError('')
      const nextSession = await retryAgentSession(session)
      router.push(`/agent-sessions/${nextSession.id}`)
      router.refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to retry this session.') } finally { setBusy(false) }
  }

  const selectedPlan = plans.find(plan => plan.id === selectedPlanId) ?? plans[0]
  const comparisonPlan = plans.find(plan => plan.id === comparePlanId) ?? (selectedPlan?.parent_version_id ? plans.find(plan => plan.id === selectedPlan.parent_version_id) : undefined)
  const stepChanges = selectedPlan && comparisonPlan ? Array.from(new Set([...selectedPlan.steps.map(step => step.id), ...comparisonPlan.steps.map(step => step.id)])).map(id => ({ current: selectedPlan.steps.find(step => step.id === id), previous: comparisonPlan.steps.find(step => step.id === id) })).filter(change => !change.current || !change.previous || change.current.title !== change.previous.title || change.current.status !== change.previous.status) : []
  const visibleActivities = useMemo(() => activities.filter(activity => (showHeartbeats || activity.kind !== 'heartbeat') && matchesActivity(activity, filter)), [activities, filter, showHeartbeats])

  if (!session && !error) return <p className="empty">Loading agent session…</p>
  return <section className={compact ? 'agent-session-detail compact' : 'agent-session-detail'} data-testid="agent-session-detail">
    {session && <header><div><h2>{compact ? 'Agent execution' : `Session ${session.id.slice(0, 8)}`}</h2><AgentBadge state={session.state} /></div><div className="session-actions">{session.state === 'paused' && <button disabled={busy} onClick={() => void signal('resume')}>Resume</button>}{canPauseAgentSession(session.state) && <button disabled={busy} onClick={() => void signal('pause')}>Pause</button>}{canRetryAgentSession(session.state) && <button disabled={busy} onClick={() => void retry()}>Retry</button>}<button className="danger" disabled={busy || !canStopAgentSession(session.state)} onClick={() => void signal('stop')}>Stop</button></div></header>}
    {(error || collectionError) && <p className="error" role="alert">{error || collectionError?.message}</p>}
    {session && <><dl className="session-facts"><div><dt>State</dt><dd>{agentStateLabel(session.state)}</dd></div><div><dt>Principal Human</dt><dd>{humans.find(human => human.id === session.principal_human_actor_id)?.display_name ?? (session.principal_human_actor_id ? session.principal_human_actor_id.slice(0, 8) : 'Not reported')}</dd></div><div><dt>Session</dt><dd>{session.id.slice(0, 8)}</dd></div><div><dt>Current step</dt><dd>{selectedPlan?.steps.find(step => step.status === 'in_progress')?.title ?? 'Not reported'}</dd></div><div><dt>Heartbeat</dt><dd>{formatTime(session.last_heartbeat_at)}</dd></div><div><dt>Budget</dt><dd>{session.budget.maxRuntimeSeconds ? `${session.budget.maxRuntimeSeconds}s max runtime` : 'Default policy'}</dd></div></dl>
      {(!tab || tab === 'conversation') && <><form className="prompt-form" onSubmit={event => void prompt(event)}><label>Prompt the agent<textarea name="prompt" placeholder="Give the agent additional context or direction" required /></label><button disabled={busy || ['stopping', 'completed', 'failed', 'canceled'].includes(session.state)}>Send prompt</button></form>
      <section className="approval-inbox" aria-label="Approval inbox"><h3>Approval inbox</h3>{approvals.filter(approval => approval.status === 'pending').length === 0 ? <p className="empty">No pending approvals.</p> : approvals.filter(approval => approval.status === 'pending').map(approval => <article key={approval.id}><strong>{approval.action_name}</strong><span className={`risk-${approval.risk_level}`}>{approval.risk_level} risk</span><p>{approval.rationale_summary}</p><small>Expires {formatTime(approval.expires_at)}</small><div><button disabled={busy} onClick={() => void decide(approval, 'approved')}>Approve</button><button className="danger" disabled={busy} onClick={() => void decide(approval, 'rejected')}>Reject</button></div></article>)}<LoadMoreButton collection={approvalsPage} label="session approvals" /></section></>}
      {(!tab || tab === 'plan') && <section className="plan-panel" aria-label="Plan versions"><header><h3>Plan versions</h3><label>Current<select aria-label="Plan version" value={selectedPlan?.id ?? ''} onChange={event => setSelectedPlanId(event.currentTarget.value)}>{plans.map(plan => <option key={plan.id} value={plan.id}>v{plan.revision} · {plan.change_summary}</option>)}</select></label></header>{selectedPlan ? <><ol>{selectedPlan.steps.slice().sort((a, b) => a.ordinal - b.ordinal).map(step => <li key={step.id}><strong>{step.title}</strong><span className={`plan-step step-${step.status}`}>{step.status.replaceAll('_', ' ')}</span>{step.acceptanceCriteria.length > 0 && <small>Acceptance: {step.acceptanceCriteria.join('; ')}</small>}</li>)}</ol>{plans.length > 1 && <section className="plan-compare" aria-label="Plan version comparison"><label>Compare with<select aria-label="Compare plan version" value={comparisonPlan?.id ?? ''} onChange={event => setComparePlanId(event.currentTarget.value)}>{plans.filter(plan => plan.id !== selectedPlan.id).map(plan => <option key={plan.id} value={plan.id}>v{plan.revision} · {plan.change_summary}</option>)}</select></label>{comparisonPlan && <ul>{stepChanges.length === 0 ? <li>No step changes between v{comparisonPlan.revision} and v{selectedPlan.revision}.</li> : stepChanges.map(change => <li key={change.current?.id ?? change.previous?.id}>{!change.previous ? <><strong>Added:</strong> {change.current?.title}</> : !change.current ? <><strong>Removed:</strong> {change.previous.title}</> : <><strong>Changed:</strong> {change.previous.title}{change.previous.title !== change.current.title && ` → ${change.current.title}`}{change.previous.status !== change.current.status && ` · ${change.previous.status} → ${change.current.status}`}</>}</li>)}</ul>}</section>}</> : <p className="empty">No plan has been published.</p>}<LoadMoreButton collection={plansPage} label="plan versions" /></section>}
      {(!tab || tab === 'activity') && <section className="activity-panel" aria-label="Agent activity"><header><h3>Activity</h3><label className="heartbeat-toggle"><input type="checkbox" checked={showHeartbeats} onChange={event => setShowHeartbeats(event.currentTarget.checked)} /> Show heartbeats</label></header><div className="activity-filters" role="group" aria-label="Activity filters">{(['all', 'actions', 'questions', 'evidence', 'errors'] as ActivityFilter[]).map(value => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{value}</button>)}</div>{visibleActivities.length === 0 ? <p className="empty">No matching activity. Heartbeats are hidden by default.</p> : <ol className="activity-timeline">{visibleActivities.map(activity => <li key={activity.id}><div><strong>{activity.kind.replaceAll('_', ' ')}</strong><time>{formatTime(activity.created_at)}</time></div><p>{activity.summary}</p>{activity.toolInvocation && <small>Tool: {activity.toolInvocation.toolName} · {activity.toolInvocation.status}</small>}</li>)}</ol>}<LoadMoreButton collection={activitiesPage} label="activities" /></section>}
      {(!tab || tab === 'artifacts') && <section className="artifact-panel" aria-label="Artifacts"><h3>Artifacts & evidence</h3>{artifacts.length === 0 ? <p className="empty">No artifacts published yet.</p> : <ul>{artifacts.map(artifact => <li key={artifact.id}><strong>{artifact.type}</strong> {artifact.uri ? <a href={artifact.uri} target="_blank" rel="noreferrer">{artifact.title}</a> : artifact.title}<small>{formatTime(artifact.created_at)}</small></li>)}</ul>}<LoadMoreButton collection={artifactsPage} label="artifacts" /></section>}
    </>}
  </section>
}
