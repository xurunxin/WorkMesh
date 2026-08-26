'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { RunExplanation } from '@workmesh/contracts'
import { ActorAttribution, Button, EvidenceReferenceList, FreshnessBadge, RiskBadge, RunHealthBadge, TechnicalEventGroup } from '@workmesh/ui'
import { apiRequest } from './lib/api'
import { useLocale } from './lib/i18n'
import { useRealtimeSubscription } from './lib/realtime'
import { parseRunTimelineRouteState, runActions, runPhases, writeRunTimelineRouteState, type RunTimelineRouteState } from './run-timeline-route-state'

type RunControlAction = RunExplanation['allowedControls'][number]['action']
type Props = { compact?: boolean; onControl?: (action: RunControlAction) => void | Promise<void>; sessionId: string }
type PlanVersion = RunExplanation['planVersions'][number]

const healthValue = (value: RunExplanation['health']['heartbeat']): 'healthy' | 'degraded' | 'stalled' => value === 'stale' ? 'stalled' : value
const planState = (value: PlanVersion['steps'][number]['status']) => value === 'completed' ? 'complete' : value === 'in_progress' ? 'current' : value === 'blocked' ? 'blocked' : 'pending'

export function AgentRunTimeline({ compact = false, onControl, sessionId }: Props) {
  const { locale } = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const state = useMemo(() => parseRunTimelineRouteState(new URLSearchParams(searchParams.toString())), [searchParams])
  const routeStateRef = useRef(state)
  const routeStateKeyRef = useRef(searchParams.toString())
  const routeStateKey = searchParams.toString()
  if (routeStateKeyRef.current !== routeStateKey) {
    routeStateKeyRef.current = routeStateKey
    routeStateRef.current = state
  }
  const [explanation, setExplanation] = useState<RunExplanation | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const selectedGroupRef = useRef<HTMLElement | null>(null)
  const text = locale === 'zh-CN' ? {
    title: '因果执行时间线', loading: '正在加载执行故事…', loadError: '无法加载执行故事。', retry: '重试',
    project: '项目', workItem: '工作项', session: 'Session', revision: '修订', currentPlan: '当前计划', currentStep: '当前步骤', budget: '预算 / 限制', attention: '待处理的人类事项',
    responsible: '负责人类', agent: '执行智能体', relationship: '智能体代表人类执行', health: '执行健康', freshness: '数据新鲜度',
    planRail: '计划步骤', version: '计划版本', compare: '比较版本', noCompare: '不比较', added: '新增', removed: '移除', changed: '变更', noChanges: '稳定步骤没有变化',
    filters: '时间线筛选', phase: '阶段', step: '计划步骤', actor: '参与者', action: '动作类型', risk: '风险', evidence: '证据', failures: '仅失败', attentionOnly: '仅需人类处理', time: '时间', technical: '显示技术记录', all: '全部', present: '有证据', missing: '缺少证据',
    timeline: '因果事件组', empty: '当前筛选没有匹配的事件。', trigger: '触发来源', validation: '验证', affected: '受影响资源', technicalRecords: '技术来源记录', sourceIds: '源 Activity', correlation: '关联 ID', cursor: '事件游标', input: '已清理输入', result: '结果摘要',
    evidenceTitle: '证据与变更', notVerified: '未验证', pending: '待验证', verified: '已验证', failed: '验证失败', older: '查看更早事件',
    pause: '暂停', resume: '继续', stop: '停止', handoff: '移交', replan: '重新规划', steer: '引导', unavailable: '当前不可用', offline: '当前投影较旧；危险控制保持禁用。',
    phaseLabels: { all: '全部阶段', intake: '接收', investigation: '调查', planning: '计划 / 重计划', implementation: '实现 / 变更', validation: '验证 / 评审', human_input: '人类输入', recovery: '恢复 / 移交', completion: '完成 / 失败' }, timeLabels: { all: '全部时间', '24h': '最近 24 小时', '7d': '最近 7 天', '30d': '最近 30 天' },
  } : {
    title: 'Causal Run Timeline', loading: 'Loading the execution story…', loadError: 'The execution story could not be loaded.', retry: 'Retry',
    project: 'Project', workItem: 'Work Item', session: 'Session', revision: 'Revision', currentPlan: 'Current Plan', currentStep: 'Current Step', budget: 'Budget / limits', attention: 'Pending Human Attention',
    responsible: 'Responsible Human', agent: 'Active Agent Executor', relationship: 'Agent acting on behalf of Human', health: 'Execution health', freshness: 'Data freshness',
    planRail: 'Plan steps', version: 'Plan version', compare: 'Compare version', noCompare: 'Do not compare', added: 'Added', removed: 'Removed', changed: 'Changed', noChanges: 'No stable Step changes',
    filters: 'Timeline filters', phase: 'Phase', step: 'Plan Step', actor: 'Actor', action: 'Action type', risk: 'Risk', evidence: 'Evidence', failures: 'Failures only', attentionOnly: 'Human attention only', time: 'Time', technical: 'Show technical records', all: 'All', present: 'Evidence present', missing: 'Evidence missing',
    timeline: 'Causal event groups', empty: 'No events match the current filters.', trigger: 'Trigger', validation: 'Validation', affected: 'Affected resources', technicalRecords: 'Technical source records', sourceIds: 'Source Activities', correlation: 'Correlation ID', cursor: 'Event cursor', input: 'Sanitized input', result: 'Result summary',
    evidenceTitle: 'Evidence and changes', notVerified: 'Not verified', pending: 'Pending verification', verified: 'Verified', failed: 'Validation failed', older: 'View older events',
    pause: 'Pause', resume: 'Resume', stop: 'Stop', handoff: 'Handoff', replan: 'Replan', steer: 'Steer', unavailable: 'Currently unavailable', offline: 'This projection is stale; dangerous controls remain disabled.',
    phaseLabels: { all: 'All phases', intake: 'Intake', investigation: 'Investigation', planning: 'Planning / replan', implementation: 'Implementation / change', validation: 'Validation / review', human_input: 'Human input', recovery: 'Recovery / handoff', completion: 'Completion / failure' }, timeLabels: { all: 'All time', '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' },
  }

  const updateState = useCallback((patch: Partial<RunTimelineRouteState>) => {
    const nextState = { ...routeStateRef.current, ...patch }
    routeStateRef.current = nextState
    const next = writeRunTimelineRouteState(new URLSearchParams(searchParams.toString()), nextState)
    router.push(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false })
  }, [pathname, router, searchParams])

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true)
    try {
      const query = new URLSearchParams()
      if (state.cursor) query.set('cursor', state.cursor)
      if (state.phase !== 'all') query.set('phase', state.phase)
      if (state.stepId) query.set('planStepId', state.stepId)
      if (state.actorId) query.set('actorId', state.actorId)
      if (state.action !== 'all') query.set('actionType', state.action)
      if (state.risk !== 'all') query.set('risk', state.risk)
      if (state.evidence !== 'all') query.set('evidence', state.evidence)
      if (state.failureOnly) query.set('failure', 'true')
      if (state.attentionOnly) query.set('attention', 'true')
      if (state.timeWindow !== 'all') query.set('timeWindow', state.timeWindow)
      const response = await apiRequest<RunExplanation>(`/api/v1/agent-sessions/${sessionId}/explanation${query.size ? `?${query}` : ''}`)
      setExplanation(response); setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : text.loadError) }
    finally { setRefreshing(false) }
  }, [sessionId, state.action, state.actorId, state.attentionOnly, state.cursor, state.evidence, state.failureOnly, state.phase, state.risk, state.stepId, state.timeWindow, text.loadError])

  useEffect(() => { void load(false) }, [load])
  useRealtimeSubscription(useMemo(() => [{ type: 'session' as const, id: sessionId }], [sessionId]), () => load(true))
  useEffect(() => {
    if (!state.groupId || !explanation) return
    const element = document.getElementById(state.groupId)
    if (element) { selectedGroupRef.current = element; element.tabIndex = -1; element.focus({ preventScroll: true }); element.scrollIntoView({ block: 'nearest' }) }
  }, [explanation, state.groupId])

  if (!explanation) return <section className="run-timeline-state" data-testid="run-timeline"><p className={error ? 'error' : 'empty'} role={error ? 'alert' : undefined}>{error || text.loading}</p>{error && <Button onClick={() => void load(false)} type="button">{text.retry}</Button>}</section>
  const selectedPlan = explanation.planVersions.find(plan => plan.id === state.planId) ?? explanation.planVersions.at(-1)
  const comparison = explanation.planVersions.find(plan => plan.id === state.comparePlanId)
  const diff = selectedPlan && comparison ? Array.from(new Set([...selectedPlan.steps.map(step => step.id), ...comparison.steps.map(step => step.id)])).flatMap(id => {
    const current = selectedPlan.steps.find(step => step.id === id); const previous = comparison.steps.find(step => step.id === id)
    if (!previous) return [{ id, label: `${text.added}: ${current?.title ?? id}` }]
    if (!current) return [{ id, label: `${text.removed}: ${previous.title}` }]
    if (current.title !== previous.title || current.status !== previous.status || current.description !== previous.description) return [{ id, label: `${text.changed}: ${previous.title} → ${current.title} (${previous.status} → ${current.status})` }]
    return []
  }) : []
  const verificationLabel = explanation.verification.state === 'verified' ? text.verified : explanation.verification.state === 'failed' ? text.failed : explanation.verification.state === 'pending' ? text.pending : text.notVerified
  const stale = explanation.freshness.state === 'stale'
  const control = (action: RunControlAction) => explanation.allowedControls.find(item => item.action === action)
  const actors = [...new Map(explanation.causalGroups.map(group => [group.actor.id, group.actor])).values()]

  return <section aria-busy={refreshing || undefined} className={`agent-run-timeline ${compact ? 'compact' : 'full'}`} data-testid="run-timeline">
    <header className="run-timeline-header"><div><p className="eyebrow">{text.title}</p><h2>{explanation.workItem?.title ?? `${text.session} ${sessionId.slice(0, 8)}`}</h2><p>{explanation.session.stateReason ?? explanation.verification.summary}</p></div><div className="run-timeline-badges"><span className={`verification verification-${explanation.verification.state}`}>{verificationLabel}</span><RunHealthBadge categoryLabel={text.health} label={explanation.health.heartbeat} value={healthValue(explanation.health.heartbeat)} /><FreshnessBadge categoryLabel={text.freshness} label={explanation.freshness.state} value={stale ? 'stale' : 'fresh'} /></div></header>
    <dl className="run-timeline-facts"><div><dt>{text.project}</dt><dd>{explanation.project?.name ?? '—'}</dd></div><div><dt>{text.workItem}</dt><dd>{explanation.workItem?.title ?? '—'}</dd></div><div><dt>{text.session}</dt><dd><code>{sessionId}</code></dd></div><div><dt>{text.revision}</dt><dd>{explanation.session.revision}</dd></div><div><dt>{text.currentPlan}</dt><dd>{explanation.plan ? `v${explanation.plan.revision} · ${explanation.plan.changeSummary}` : '—'}</dd></div><div><dt>{text.currentStep}</dt><dd>{explanation.currentStep?.title ?? '—'}</dd></div><div><dt>{text.budget}</dt><dd>{Object.keys(explanation.session.budget).length ? Object.entries(explanation.session.budget).map(([key, value]) => `${key}: ${value}`).join(' · ') : '—'}</dd></div><div><dt>{text.attention}</dt><dd>{explanation.pendingAttention.length}</dd></div></dl>
    <ActorAttribution activeAgent={{ label: text.agent, name: explanation.activeAgent.displayName }} relationshipLabel={text.relationship} responsibleHuman={{ label: text.responsible, name: explanation.responsibleHuman?.displayName ?? '—' }} />
    {stale && <p className="run-stale-warning" role="status">{text.offline}</p>}
    {!compact && <div aria-label={text.title} className="run-control-bar" role="toolbar">{(['pause', 'resume', 'stop', 'retry', 'handoff', 'replan', 'steer'] as const).map(action => { const policy = control(action); return <Button aria-label={policy?.allowed ? text[action] : `${text[action]} — ${policy?.reasonCode ?? text.unavailable}`} disabled={stale || !policy?.allowed || !onControl} key={action} onClick={() => void onControl?.(action)} type="button" variant={action === 'stop' ? 'danger' : 'secondary'}>{text[action]}</Button> })}</div>}

    <section aria-label={text.planRail} className="run-plan-section"><header><h3>{text.planRail}</h3><label>{text.version}<select value={selectedPlan?.id ?? ''} onChange={event => updateState({ planId: event.currentTarget.value, stepId: '', groupId: '' })}>{explanation.planVersions.map(plan => <option key={plan.id} value={plan.id}>v{plan.revision} · {plan.changeSummary}</option>)}</select></label>{!compact && <label>{text.compare}<select value={comparison?.id ?? ''} onChange={event => updateState({ comparePlanId: event.currentTarget.value })}><option value="">{text.noCompare}</option>{explanation.planVersions.filter(plan => plan.id !== selectedPlan?.id).map(plan => <option key={plan.id} value={plan.id}>v{plan.revision} · {plan.changeSummary}</option>)}</select></label>}</header>
      {selectedPlan && <ol className="run-plan-rail">{selectedPlan.steps.map(step => <li className={`state-${planState(step.status)} ${state.stepId === step.id ? 'selected' : ''}`} key={`${selectedPlan.id}:${step.id}`}><button aria-pressed={state.stepId === step.id} onClick={() => updateState({ stepId: state.stepId === step.id ? '' : step.id, groupId: '' })} type="button"><span aria-hidden="true" /><strong>{step.title}</strong><small>{step.status} · {step.causalGroupIds.length} groups · {step.evidenceIds.length} evidence</small>{step.acceptanceCriteria.length > 0 && <em>{step.acceptanceCriteria.join('; ')}</em>}</button></li>)}</ol>}
      {comparison && <section className="run-plan-diff" aria-live="polite"><h4>{comparison.changeSummary} → {selectedPlan?.changeSummary}</h4><ul>{diff.length ? diff.map(item => <li key={item.id}>{item.label}</li>) : <li>{text.noChanges}</li>}</ul></section>}
    </section>

    <fieldset className="run-timeline-filters"><legend>{text.filters}</legend><label>{text.phase}<select value={state.phase} onChange={event => updateState({ phase: event.currentTarget.value as RunTimelineRouteState['phase'], cursor: '', groupId: '' })}>{runPhases.map(value => <option key={value} value={value}>{text.phaseLabels[value]}</option>)}</select></label><label>{text.actor}<select value={state.actorId} onChange={event => updateState({ actorId: event.currentTarget.value, cursor: '', groupId: '' })}><option value="">{text.all}</option>{actors.map(actor => <option key={actor.id} value={actor.id}>{actor.displayName}</option>)}</select></label><label>{text.action}<select value={state.action} onChange={event => updateState({ action: event.currentTarget.value as RunTimelineRouteState['action'], cursor: '', groupId: '' })}>{runActions.map(value => <option key={value} value={value}>{value === 'all' ? text.all : value}</option>)}</select></label><label>{text.risk}<select value={state.risk} onChange={event => updateState({ risk: event.currentTarget.value as RunTimelineRouteState['risk'], cursor: '', groupId: '' })}><option value="all">{text.all}</option>{(['low', 'medium', 'high', 'critical'] as const).map(value => <option key={value}>{value}</option>)}</select></label><label>{text.evidence}<select value={state.evidence} onChange={event => updateState({ evidence: event.currentTarget.value as RunTimelineRouteState['evidence'], cursor: '', groupId: '' })}><option value="all">{text.all}</option><option value="present">{text.present}</option><option value="missing">{text.missing}</option></select></label><label>{text.time}<select value={state.timeWindow} onChange={event => updateState({ timeWindow: event.currentTarget.value as RunTimelineRouteState['timeWindow'], cursor: '', groupId: '' })}>{(['all', '24h', '7d', '30d'] as const).map(value => <option key={value} value={value}>{text.timeLabels[value]}</option>)}</select></label><label className="run-check"><input checked={state.failureOnly} onChange={event => updateState({ failureOnly: event.currentTarget.checked, cursor: '', groupId: '' })} type="checkbox" />{text.failures}</label><label className="run-check"><input checked={state.attentionOnly} onChange={event => updateState({ attentionOnly: event.currentTarget.checked, cursor: '', groupId: '' })} type="checkbox" />{text.attentionOnly}</label><label className="run-check"><input checked={state.technical} onChange={event => updateState({ technical: event.currentTarget.checked })} type="checkbox" />{text.technical}</label></fieldset>

    <section aria-label={text.timeline} className="run-causal-groups"><h3>{text.timeline}</h3>{explanation.causalGroups.length === 0 ? <p className="empty">{text.empty}</p> : <ol>{explanation.causalGroups.map(group => <li key={group.id}><article aria-current={state.groupId === group.id ? 'true' : undefined} className={`run-causal-group phase-${group.phase} ${group.failure ? 'is-failure' : ''}`} id={group.id} onClick={() => updateState({ groupId: group.id })}><header><div><span className="run-phase">{text.phaseLabels[group.phase]}</span>{group.risk && <RiskBadge categoryLabel={text.risk} label={group.risk} value={group.risk} />}<span className={`verification verification-${group.validation.state}`}>{group.validation.state}</span></div><time dateTime={group.startedAt}>{new Date(group.startedAt).toLocaleString(locale)}</time></header><h4>{group.summary}</h4><p>{text.trigger}: {group.trigger.summary}</p><dl><div><dt>{text.actor}</dt><dd>{group.actor.displayName}</dd></div><div><dt>{text.action}</dt><dd>{group.actionType}</dd></div><div><dt>{text.step}</dt><dd>{selectedPlan?.steps.find(step => step.id === group.planStepId)?.title ?? group.planStepId ?? '—'}</dd></div><div><dt>{text.validation}</dt><dd>{group.validation.summary ?? group.validation.state}</dd></div></dl>{group.affectedResources.length > 0 && <ul aria-label={text.affected} className="run-resource-chips">{group.affectedResources.map(resource => <li key={`${resource.type}:${resource.id}`}>{resource.type}: <code>{resource.id.slice(0, 8)}</code></li>)}</ul>}{group.evidence.length > 0 && <EvidenceReferenceList evidence={group.evidence.map(item => ({ id: item.id, href: item.uri ?? `#evidence-${item.id}`, label: item.title ?? item.id, typeLabel: item.type }))} label={text.evidenceTitle} />}{state.technical && <TechnicalEventGroup count={group.technicalRecords.length} label={`${text.technicalRecords} · ${group.count}`} open={state.groupId === group.id}><ol>{group.technicalRecords.map(record => <li key={record.id}><strong>{record.kind} · #${record.sequence}</strong><p>{record.summary}</p>{record.toolInvocation && <dl><div><dt>{text.input}</dt><dd><code>{JSON.stringify(record.toolInvocation.inputSanitized)}</code></dd></div><div><dt>{text.result}</dt><dd>{record.toolInvocation.resultSummary ?? record.toolInvocation.status}</dd></div></dl>}<small>{text.correlation}: {record.correlationId ?? '—'} · {text.cursor}: {record.eventCursor ?? '—'} · {text.sourceIds}: {record.id}</small></li>)}</ol></TechnicalEventGroup>}</article></li>)}</ol>}
      {explanation.nextCursor && <Button onClick={() => updateState({ cursor: explanation.nextCursor!, groupId: '' })} type="button" variant="secondary">{text.older}</Button>}
    </section>
    <section aria-label={text.evidenceTitle} className="run-evidence-section"><h3>{text.evidenceTitle}</h3>{explanation.evidenceDetails.length === 0 ? <p className="empty">{text.notVerified}</p> : <ul>{explanation.evidenceDetails.map(item => <li id={`evidence-${item.id}`} key={item.id}><span className={`verification verification-${item.validationState}`}>{item.validationState}</span>{item.uri ? <a href={item.uri} rel="noreferrer" target="_blank">{item.title ?? item.id}</a> : <strong>{item.title ?? item.id}</strong>}<small>{item.type}{item.checksum ? ` · ${item.checksum}` : ''}{item.repository?.commit ? ` · ${item.repository.commit}` : ''}</small></li>)}</ul>}</section>
    {error && <p className="error" role="alert">{error}</p>}
  </section>
}
