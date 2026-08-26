'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import type { HumanAttentionItem, ListResponse, WorkItemExecutionSummary } from '@workmesh/contracts'
import { Button, EvidenceReferenceList, FreshnessBadge, RunHealthBadge } from '@workmesh/ui'
import { AgentRunTimeline } from '../../../app/agent-run-timeline'
import { apiRequest } from '../../../app/lib/api'
import { useRealtimeSubscription } from '../../../app/lib/realtime'
import type { WorkItemDetailModel } from './contracts'

type Props = Readonly<{
  model: WorkItemDetailModel
  locale?: 'en' | 'zh-CN'
  onOpenAgent: () => void
  relationships?: ReactNode
}>

const attentionHref = (workItemId: string, attentionId: string): string => {
  const params = new URLSearchParams({
    view: 'inbox',
    attentionWorkItem: workItemId,
    attentionSelected: attentionId,
  })
  return `/?${params.toString()}`
}

export function WorkItemExecutionWorkspace({ model, onOpenAgent, relationships, locale = 'en' }: Props) {
  const [summary, setSummary] = useState<WorkItemExecutionSummary | null>(null)
  const [attention, setAttention] = useState<HumanAttentionItem | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const text = locale === 'zh-CN' ? {
    title: '当前状态', intro: '来自授权执行、关注事项和证据投影的当前事实。', workflow: '工作流状态', responsibility: '负责人类', executor: '当前智能体执行者', none: '无',
    loading: '正在加载执行工作区…', failed: '无法加载执行工作区。', refresh: '刷新', needsYou: '需要你处理', noAttention: '当前没有需要 Human 响应的事项。', review: '审阅并响应',
    execution: '当前执行', noExecution: '当前没有活跃 Run。', state: 'Session 状态', step: '当前步骤', health: '执行健康', activity: '最近有效活动', humanActions: '待处理 Human 事项', openRun: '打开 Run', controls: '打开智能体控制',
    evidence: '验收与证据', verified: '已验证', missing: '缺少证据', unknown: '已产出，尚未验证', notLoaded: '尚未加载', noEvidence: '尚未发布证据。', history: '最近 Run', relationships: '依赖与关系', timeline: '展开因果 Run 时间线', freshness: '数据新鲜度', offline: '离线', partial: '部分',
  } : {
    title: 'Current state', intro: 'Current facts from authorized execution, Attention, and evidence projections.', workflow: 'Workflow state', responsibility: 'Responsible Human', executor: 'Active Agent Executor', none: 'None',
    loading: 'Loading the execution workspace…', failed: 'The execution workspace could not be loaded.', refresh: 'Refresh', needsYou: 'Needs You', noAttention: 'No Human response is currently required.', review: 'Review and respond',
    execution: 'Current execution', noExecution: 'No active Run exists.', state: 'Session state', step: 'Current Step', health: 'Execution health', activity: 'Last meaningful activity', humanActions: 'Pending Human action', openRun: 'Open Run', controls: 'Open Agent controls',
    evidence: 'Acceptance and evidence', verified: 'Verified', missing: 'Evidence missing', unknown: 'Produced, not verified', notLoaded: 'Not loaded', noEvidence: 'No evidence has been published.', history: 'Recent Runs', relationships: 'Dependencies and relationships', timeline: 'Expand causal Run Timeline', freshness: 'Data freshness', offline: 'Offline', partial: 'Partial',
  }

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true)
    try {
      const [nextSummary, attentionPage] = await Promise.all([
        apiRequest<WorkItemExecutionSummary>(`/api/v1/work-items/${model.id}/execution-summary`),
        apiRequest<ListResponse<HumanAttentionItem>>(`/api/v1/human-attention?status=open&workItemId=${encodeURIComponent(model.id)}&limit=1`),
      ])
      setSummary(nextSummary)
      setAttention(attentionPage.items[0] ?? null)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.failed)
    } finally {
      setRefreshing(false)
    }
  }, [model.id, text.failed])

  useEffect(() => { void load(false) }, [load])
  useRealtimeSubscription(useMemo(() => [{ type: 'work_item' as const, id: model.id }], [model.id]), () => load(true))

  // Treat the projection as an external boundary even though the API client is
  // typed. A partial deploy, stale browser cache, or replayed test fixture must
  // degrade to an empty projection instead of taking down the whole Issue.
  const activeRuns = Array.isArray(summary?.activeRuns) ? summary.activeRuns : []
  const evidence = Array.isArray(summary?.evidence) ? summary.evidence : []
  const recentRuns = Array.isArray(summary?.recentRuns) ? summary.recentRuns : []
  const active = activeRuns[0] ?? null
  const executor = active?.activeAgent?.displayName ?? model.agentExecutions[0]?.agent.displayName ?? null
  const evidenceState = !summary
    ? 'unknown'
    : activeRuns.some(run => run.verified)
    ? 'verified'
    : evidence.length === 0 ? 'missing' : 'unknown'
  const freshness = error && summary ? 'partial'
      : summary?.freshness.state ?? 'current'

  return <section aria-busy={refreshing || undefined} className="work-item-execution-workspace" data-testid="work-item-execution-workspace">
    <header className="work-item-execution-header">
      <div><p className="eyebrow">{text.title}</p><h3>{model.title}</h3><p>{active?.summary ?? text.intro}</p></div>
      {(summary || error) && <FreshnessBadge categoryLabel={text.freshness} label={freshness} value={freshness === 'current' ? 'fresh' : freshness === 'offline' ? 'offline' : freshness === 'partial' ? 'partial' : 'stale'} />}
    </header>
    <dl className="work-item-execution-facts">
      <div><dt>{text.workflow}</dt><dd>{model.workflowState.name}</dd></div>
      <div><dt>{text.responsibility}</dt><dd data-testid="responsible-human">{model.responsibleHuman?.displayName ?? text.none}</dd></div>
      <div><dt>{text.executor}</dt><dd>{executor ?? text.none}</dd></div>
      <div><dt>{text.evidence}</dt><dd><span className={`verification verification-${evidenceState === 'unknown' ? 'not_verified' : evidenceState}`}>{!summary ? text.notLoaded : evidenceState === 'verified' ? text.verified : evidenceState === 'missing' ? text.missing : text.unknown}</span></dd></div>
    </dl>

    {!summary && !error && <p className="empty" role="status">{text.loading}</p>}
    {error && <div className="error-state"><p className="error" role="alert">{error}</p><Button onClick={() => void load(false)} type="button" variant="secondary">{text.refresh}</Button></div>}

    <section className="work-item-needs-you" aria-labelledby="work-item-needs-you-title">
      <header><h3 id="work-item-needs-you-title">{text.needsYou}</h3></header>
      {attention ? <article>
        <div><strong>{attention.title}</strong><p>{attention.summary}</p><small>{attention.impactSummary}</small></div>
        <a className="wm-button wm-button-primary" href={attentionHref(model.id, attention.id)}>{text.review}</a>
      </article> : <p className="empty">{text.noAttention}</p>}
    </section>

    <section className="work-item-current-execution" aria-labelledby="work-item-current-execution-title">
      <header><h3 id="work-item-current-execution-title">{text.execution}</h3><Button onClick={onOpenAgent} type="button" variant="secondary">{text.controls}</Button></header>
      {active ? <article>
        <div className="work-item-current-run-heading"><div><strong>{active.title}</strong><span>{active.summary}</span></div>{active.health && <RunHealthBadge categoryLabel={text.health} label={active.health.heartbeat} value={active.health.heartbeat === 'stale' ? 'stalled' : active.health.heartbeat} />}</div>
        <dl><div><dt>{text.state}</dt><dd>{active.state}</dd></div><div><dt>{text.step}</dt><dd>{active.currentStep?.title ?? '—'}</dd></div><div><dt>{text.activity}</dt><dd>{active.lastActivity?.summary ?? '—'}</dd></div><div><dt>{text.humanActions}</dt><dd>{active.pendingHumanActionCount}</dd></div></dl>
        {active.sessionId && <div className="work-item-current-run-actions"><a href={`/agent-sessions/${active.sessionId}`}>{text.openRun}</a></div>}
        {active.sessionId && <details className="work-item-run-timeline"><summary>{text.timeline}</summary><AgentRunTimeline compact sessionId={active.sessionId} /></details>}
      </article> : <p className="empty">{text.noExecution}</p>}
    </section>

    <section className="work-item-evidence-summary" aria-labelledby="work-item-evidence-title">
      <h3 id="work-item-evidence-title">{text.evidence}</h3>
      {evidence.length ? <EvidenceReferenceList evidence={evidence.map(item => ({ id: item.id, href: item.uri ?? `#work-item-evidence-${item.id}`, label: item.title ?? item.id, typeLabel: item.type }))} label={text.evidence} /> : <p className="empty">{text.noEvidence}</p>}
    </section>

    {recentRuns.length ? <section className="work-item-run-history" aria-labelledby="work-item-run-history-title"><h3 id="work-item-run-history-title">{text.history}</h3><ul>{recentRuns.slice(0, 5).map(run => <li key={run.id}><a href={run.sessionId ? `/agent-sessions/${run.sessionId}` : '#'}>{run.title}</a><span>{run.state} · {run.summary}</span></li>)}</ul></section> : null}
    {relationships && <section className="work-item-overview-relationships" aria-labelledby="work-item-overview-relationships-title"><h3 id="work-item-overview-relationships-title">{text.relationships}</h3>{relationships}</section>}
  </section>
}
