'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@workmesh/ui'
import { apiRequest, json } from './lib/api'
import { type AgentActivity, type AgentSession, type Approval, type Artifact, type PlanVersion, agentStateClass, agentStateLabel, canPauseAgentSession, canRetryAgentSession, canStopAgentSession, formatTime, normalizeActivity, normalizeApproval, normalizeArtifact, normalizePlan } from './lib/agents'
import { AgentBadge } from './agent-work-panel'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { useRealtimeSubscription } from './lib/realtime'
import { useLocale } from './lib/i18n'
import { AgentRunTimeline } from './agent-run-timeline'
import { AgentControlDialog, type AgentControlAction } from './agent-control-dialog'

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
  const { sessionDetailCopy: text } = useLocale()
  const [session, setSession] = useState<AgentSession | null>(null)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [showHeartbeats, setShowHeartbeats] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [comparePlanId, setComparePlanId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [controlAction, setControlAction] = useState<AgentControlAction | null>(null)
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : text.loadError) }
  }, [sessionId, text.loadError])
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

  const decide = async (approval: Approval, decision: 'approved' | 'rejected') => {
    try { setBusy(true); await apiRequest(`/api/v1/approvals/${approval.id}/decide`, { method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${approval.revision}"` }, body: JSON.stringify({ decision, reason: `Human ${decision} from the approval inbox.` }) }); await load(); await approvalsPage.refresh() } catch (reason) { setError(reason instanceof Error ? reason.message : text.decideError) } finally { setBusy(false) }
  }
  const selectedPlan = plans.find(plan => plan.id === selectedPlanId) ?? plans[0]
  const comparisonPlan = plans.find(plan => plan.id === comparePlanId) ?? (selectedPlan?.parent_version_id ? plans.find(plan => plan.id === selectedPlan.parent_version_id) : undefined)
  const stepChanges = selectedPlan && comparisonPlan ? Array.from(new Set([...selectedPlan.steps.map(step => step.id), ...comparisonPlan.steps.map(step => step.id)])).map(id => ({ current: selectedPlan.steps.find(step => step.id === id), previous: comparisonPlan.steps.find(step => step.id === id) })).filter(change => !change.current || !change.previous || change.current.title !== change.previous.title || change.current.status !== change.previous.status) : []
  const visibleActivities = useMemo(() => activities.filter(activity => (showHeartbeats || activity.kind !== 'heartbeat') && matchesActivity(activity, filter)), [activities, filter, showHeartbeats])
  const pendingApprovals = approvals.filter(approval => approval.status === 'pending')

  if (!session && !error) return <p className="empty">{text.loading}</p>
  return <section className={compact ? 'agent-session-detail compact' : 'agent-session-detail'} data-testid="agent-session-detail">
    {session && <header><div><h2>{compact ? text.compactTitle : text.headerTitle(session.id.slice(0, 8))}</h2><AgentBadge state={session.state} /></div><div className="session-actions">{session.state === 'paused' && <Button onClick={() => setControlAction('resume')} type="button" variant="secondary">{text.resume}</Button>}{canPauseAgentSession(session.state) && <Button onClick={() => setControlAction('pause')} type="button" variant="secondary">{text.pause}</Button>}{canRetryAgentSession(session.state) && <Button onClick={() => setControlAction('retry')} type="button" variant="secondary">{text.retry}</Button>}<Button disabled={!canStopAgentSession(session.state)} onClick={() => setControlAction('stop')} type="button" variant="danger">{text.stop}</Button></div></header>}
    {(error || collectionError) && <p className="error" role="alert">{error || collectionError?.message}</p>}
    {session && <><dl className="session-facts"><div><dt>{text.factState}</dt><dd>{agentStateLabel(session.state)}</dd></div><div><dt>{text.factPrincipal}</dt><dd>{humans.find(human => human.id === session.principal_human_actor_id)?.display_name ?? (session.principal_human_actor_id ? session.principal_human_actor_id.slice(0, 8) : text.notReported)}</dd></div><div><dt>{text.factSession}</dt><dd>{session.id.slice(0, 8)}</dd></div><div><dt>{text.factCurrentStep}</dt><dd>{selectedPlan?.steps.find(step => step.status === 'in_progress')?.title ?? text.notReported}</dd></div><div><dt>{text.factHeartbeat}</dt><dd>{formatTime(session.last_heartbeat_at)}</dd></div><div><dt>{text.factBudget}</dt><dd>{session.budget.maxRuntimeSeconds ? text.maxRuntimeSeconds(session.budget.maxRuntimeSeconds) : text.defaultPolicy}</dd></div></dl>
      {!tab && <AgentRunTimeline compact={compact} onControl={action => setControlAction(action)} sessionId={sessionId} />}
      {(!tab || tab === 'conversation') && <><section className="prompt-form" aria-label={text.promptTitle}><p>{text.promptPlaceholder}</p><Button disabled={['stopping', 'completed', 'failed', 'canceled'].includes(session.state)} onClick={() => setControlAction('steer')} type="button" variant="primary">{text.sendPrompt}</Button></section>
      <section className="approval-inbox" aria-label={text.approvalInboxTitle}><h3>{text.approvalInboxTitle}</h3>{pendingApprovals.length === 0 ? <p className="empty">{text.approvalInboxEmpty}</p> : pendingApprovals.map(approval => <article key={approval.id}><strong>{approval.action_name}</strong><span className={`risk-${approval.risk_level}`}>{text.approvalRisk(approval.risk_level)}</span><p>{approval.rationale_summary}</p><small>{text.approvalExpires(formatTime(approval.expires_at))}</small><div className="approval-actions"><Button disabled={busy} onClick={() => void decide(approval, 'approved')} type="button" variant="primary">{text.approve}</Button><Button disabled={busy} onClick={() => void decide(approval, 'rejected')} type="button" variant="danger">{text.reject}</Button></div></article>)}<LoadMoreButton collection={approvalsPage} label={text.loadMoreApprovals} /></section></>}
      {(!tab || tab === 'plan') && <section className="plan-panel" aria-label={text.planVersionsTitle}><header><h3>{text.planVersionsTitle}</h3><label>{text.planCurrent}<select aria-label={text.planCurrent} value={selectedPlan?.id ?? ''} onChange={event => setSelectedPlanId(event.currentTarget.value)}>{plans.map(plan => <option key={plan.id} value={plan.id}>v{plan.revision} · {plan.change_summary}</option>)}</select></label></header>{selectedPlan ? <><ol>{selectedPlan.steps.slice().sort((a, b) => a.ordinal - b.ordinal).map(step => <li key={step.id}><strong>{step.title}</strong><span className={`plan-step step-${step.status}`}>{text.planStepStatus(step.status)}</span>{step.acceptanceCriteria.length > 0 && <small>{text.acceptanceCriteria(step.acceptanceCriteria.join('; '))}</small>}</li>)}</ol>{plans.length > 1 && <section className="plan-compare" aria-label={text.planVersionsTitle}><label>{text.planCompareWith}<select aria-label={text.planCompareWith} value={comparisonPlan?.id ?? ''} onChange={event => setComparePlanId(event.currentTarget.value)}>{plans.filter(plan => plan.id !== selectedPlan.id).map(plan => <option key={plan.id} value={plan.id}>v{plan.revision} · {plan.change_summary}</option>)}</select></label>{comparisonPlan && <ul>{stepChanges.length === 0 ? <li>{text.planStepChangedTitle(comparisonPlan.revision, selectedPlan.revision)}</li> : stepChanges.map(change => <li key={change.current?.id ?? change.previous?.id}>{!change.previous ? <strong>{text.planAdded(change.current?.title ?? '')}</strong> : !change.current ? <strong>{text.planRemoved(change.previous.title)}</strong> : <><strong>{text.planChanged(change.previous.title, change.current.status)}</strong>{change.previous.title !== change.current.title && <> · {text.planRenamed(change.previous.title, change.current.title)}</>}</>}</li>)}</ul>}</section>}</> : <p className="empty">{text.planNoPlan}</p>}<LoadMoreButton collection={plansPage} label={text.loadMorePlans} /></section>}
      {(!tab || tab === 'activity') && <section className="activity-panel" aria-label={text.activityTitle}><header><h3>{text.activityTitle}</h3><label className="heartbeat-toggle"><input type="checkbox" checked={showHeartbeats} onChange={event => setShowHeartbeats(event.currentTarget.checked)} /> {text.showHeartbeats}</label></header><div className="activity-filters" role="group" aria-label={text.activityTitle}>{([{ value: 'all' as const, label: text.activityFilterAll }, { value: 'actions' as const, label: text.activityFilterActions }, { value: 'questions' as const, label: text.activityFilterQuestions }, { value: 'evidence' as const, label: text.activityFilterEvidence }, { value: 'errors' as const, label: text.activityFilterErrors }]).map(item => <button aria-pressed={filter === item.value} className={filter === item.value ? 'selected' : ''} key={item.value} onClick={() => setFilter(item.value)} type="button">{item.label}</button>)}</div>{visibleActivities.length === 0 ? <p className="empty">{text.activityEmpty}</p> : <ol className="activity-timeline">{visibleActivities.map(activity => <li key={activity.id}><div><strong>{text.activityKind(activity.kind)}</strong><time>{formatTime(activity.created_at)}</time></div><p>{activity.summary}</p>{activity.toolInvocation && <small>{text.activityTool(activity.toolInvocation.toolName, activity.toolInvocation.status)}</small>}</li>)}</ol>}<LoadMoreButton collection={activitiesPage} label={text.loadMoreActivities} /></section>}
      {(!tab || tab === 'artifacts') && <section className="artifact-panel" aria-label={text.artifactsTitle}><h3>{text.artifactsTitle}</h3>{artifacts.length === 0 ? <p className="empty">{text.artifactsEmpty}</p> : <ul>{artifacts.map(artifact => <li key={artifact.id}><strong>{artifact.type}</strong> {artifact.uri ? <a href={artifact.uri} target="_blank" rel="noreferrer">{artifact.title}</a> : artifact.title}<small>{formatTime(artifact.created_at)}</small></li>)}</ul>}<LoadMoreButton collection={artifactsPage} label={text.loadMoreArtifacts} /></section>}
    </>}
    <AgentControlDialog action={controlAction} onClose={() => setControlAction(null)} onCommitted={async () => { await load(); await activitiesPage.refresh(); await plansPage.refresh() }} open={controlAction !== null} sessionId={sessionId} />
  </section>
}
