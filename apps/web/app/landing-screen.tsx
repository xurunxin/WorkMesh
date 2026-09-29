'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ControlCenterDigest, HumanAttentionItem, ListResponse } from '@workmesh/contracts'
import {
  AttentionKindBadge,
  AttentionListItem,
  ControlCenterSection,
  RiskBadge,
  RunDigestRow,
  RunHealthBadge,
  UrgencyBadge,
  WorkItemList,
  type RunHealth,
  type WorkItemCardData,
} from '@workmesh/ui'
import { AgentControlDialog, type AgentControlAction } from './agent-control-dialog'
import { apiRequest } from './lib/api'
import { toWorkSurfaceItem } from '../features/work-items/view-model'
import type { WorkItemDto } from '../features/work-items/contracts'

/**
 * The prototype's `#/home`: three bounded sections that answer "what needs me",
 * "what am I responsible for", and "what is running" without making the Human
 * open a screen to find out.
 *
 * Every section is a summary, not a workspace. Each one is capped and links to
 * the surface that owns the full list, so this screen never becomes a second
 * place where work is edited. The three lists are independent: one failing
 * section reports itself and leaves the other two readable.
 */

const ATTENTION_LIMIT = 3
const WORK_ITEM_LIMIT = 5
const RUN_LIMIT = 4

type Segment =
  | { state: 'loading' }
  | { state: 'ready'; count: number }
  | { state: 'failed'; reason: string }

const initialSegment: Segment = { state: 'loading' }

function errorText(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message
  return 'Unavailable'
}

const RUN_STATE_TONE: Record<string, 'info' | 'warning' | 'violet' | 'danger' | 'neutral'> = {
  executing: 'info',
  awaiting_input: 'warning',
  awaiting_approval: 'warning',
  awaiting_review: 'violet',
  planning: 'info',
  blocked: 'warning',
  paused: 'neutral',
  stale: 'danger',
  failed: 'danger',
}

const RUN_HEALTH: Record<string, RunHealth> = {
  healthy: 'healthy',
  degraded: 'degraded',
  stale: 'stalled',
}

export default function LandingScreen({ locale }: Readonly<{ locale: 'en' | 'zh-CN' }>) {
  const [attention, setAttention] = useState<HumanAttentionItem[] | null>(null)
  const [attentionSegment, setAttentionSegment] = useState<Segment>(initialSegment)
  const [workItems, setWorkItems] = useState<WorkItemCardData[] | null>(null)
  const [workSegment, setWorkSegment] = useState<Segment>(initialSegment)
  const [runs, setRuns] = useState<ControlCenterDigest[] | null>(null)
  const [runSegment, setRunSegment] = useState<Segment>(initialSegment)
  const [control, setControl] = useState<{ action: AgentControlAction; sessionId: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setAttentionSegment(initialSegment)
    apiRequest<ListResponse<HumanAttentionItem>>(`/api/v1/human-attention?view=active&limit=${ATTENTION_LIMIT}`)
      .then(page => {
        if (cancelled) return
        setAttention(page.items)
        setAttentionSegment({ state: 'ready', count: page.items.length })
      })
      .catch(reason => { if (!cancelled) setAttentionSegment({ state: 'failed', reason: errorText(reason) }) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setWorkSegment(initialSegment)
    apiRequest<ListResponse<WorkItemDto>>(`/api/v1/work-items?limit=${WORK_ITEM_LIMIT}`)
      .then(page => {
        if (cancelled) return
        setWorkItems(page.items.map(toWorkSurfaceItem))
        setWorkSegment({ state: 'ready', count: page.items.length })
      })
      .catch(reason => { if (!cancelled) setWorkSegment({ state: 'failed', reason: errorText(reason) }) })
    return () => { cancelled = true }
  }, [])

  const loadRuns = useCallback(() => {
    setRunSegment(initialSegment)
    // Ask for the running collection explicitly. The endpoint also projects an
    // `attention` collection whose declared response shape does not match what
    // it returns, so an unqualified request fails validation today.
    return apiRequest<{ collections: { running: { items: ControlCenterDigest[] } } }>(`/api/v1/control-center?collection=running&limit=${RUN_LIMIT}`)
      .then(response => {
        setRuns(response.collections.running.items.slice(0, RUN_LIMIT))
        setRunSegment({ state: 'ready', count: response.collections.running.items.length })
      })
      .catch(reason => { setRunSegment({ state: 'failed', reason: errorText(reason) }) })
  }, [])

  useEffect(() => { void loadRuns().catch(() => undefined) }, [loadRuns])

  const copy = useMemo(() => locale === 'zh-CN' ? {
    attention: '需要你',
    attentionAll: '全部处理',
    attentionEmpty: '没有需要你处理的事项。',
    budget: '预算',
    budgetLabel: (limit: string, used: number | null, cap: number) => `运行预算 ${limit}：${used ?? '未知'} / ${cap}`,
    budgetPercent: (ratio: number) => `${Math.round(ratio * 100)}%`,
    budgetUnknown: (limit: string, cap: number) => `${limit} 未知 / ${cap}`,
    empty: '没有可显示的内容。',
    heartbeat: '心跳',
    intervene: '介入',
    kindLabel: '类型',
    loads: '当前显示的条数不是总量。',
    noStep: '尚未开始步骤',
    pause: '暂停',
    runEmpty: '当前没有运行中的智能体。',
    runs: '智能体运行',
    severityLabel: '风险',
    stop: '停止',
    urgencyLabel: '紧急度',
    workEmpty: '没有分配给你的工作项。',
    workItems: '我的工作项',
  } : {
    attention: 'Needs you',
    attentionAll: 'Handle all',
    attentionEmpty: 'Nothing is waiting on you.',
    budget: 'Budget',
    budgetLabel: (limit: string, used: number | null, cap: number) => `Run budget ${limit}: ${used ?? 'unknown'} of ${cap}`,
    budgetPercent: (ratio: number) => `${Math.round(ratio * 100)}%`,
    budgetUnknown: (limit: string, cap: number) => `${limit} unknown of ${cap}`,
    empty: 'Nothing to show.',
    heartbeat: 'Heartbeat',
    intervene: 'Intervene',
    kindLabel: 'Kind',
    loads: 'Shown rows are not the total.',
    noStep: 'No step started',
    pause: 'Pause',
    runEmpty: 'No agent is running.',
    runs: 'Agent runs',
    severityLabel: 'Severity',
    stop: 'Stop',
    urgencyLabel: 'Urgency',
    workEmpty: 'No work items are assigned to you.',
    workItems: 'My work items',
  }, [locale])

  const segmentBody = (segment: Segment, items: ReactNode, empty: string) => {
    if (segment.state === 'loading') return <p className="wm-landing-note">{copy.empty}</p>
    if (segment.state === 'failed') return <p className="wm-landing-note" role="alert">{segment.reason}</p>
    return items
  }

  return <div className="wm-landing">
    <ControlCenterSection
      action={<a className="wm-landing-all" href="/?view=inbox">{copy.attentionAll}</a>}
      count={attentionSegment.state === 'ready' ? attentionSegment.count : 0}
      title={copy.attention}
      tone="attention"
    >
      {segmentBody(attentionSegment, attention?.length
        ? attention.map(item => <AttentionListItem
          key={item.id}
          actor={<span>{item.requestedBy.displayName}</span>}
          badges={<>
            <AttentionKindBadge categoryLabel={copy.kindLabel} label={item.kind.replaceAll('_', ' ')} value={item.kind} />
            <RiskBadge categoryLabel={copy.severityLabel} label={item.severity} value={item.severity === 'info' ? 'none' : item.severity} />
            <UrgencyBadge categoryLabel={copy.urgencyLabel} label={item.urgency} value={item.urgency === 'immediate' ? 'urgent' : item.urgency} />
          </>}
          consequence={item.impactSummary}
          description={item.summary}
          risk={item.severity === 'info' ? 'none' : item.severity}
          title={item.title}
        />)
        : <p className="wm-landing-note">{copy.attentionEmpty}</p>, copy.attentionEmpty)}
    </ControlCenterSection>

    <div className="wm-landing-split">
      <ControlCenterSection
        count={workSegment.state === 'ready' ? workSegment.count : 0}
        title={copy.workItems}
        tone="work"
      >
        {segmentBody(workSegment, workItems?.length
          ? <WorkItemList density="compact" items={workItems} />
          : <p className="wm-landing-note">{copy.workEmpty}</p>, copy.workEmpty)}
      </ControlCenterSection>

      <ControlCenterSection
        count={runSegment.state === 'ready' ? runSegment.count : 0}
        title={copy.runs}
        tone="running"
      >
        {segmentBody(runSegment, runs?.length
          ? runs.map(({ sessionId, ...run }) => <RunDigestRow
            agentName={run.activeAgent?.displayName ?? run.title}
            budget={run.budgetUtilization}
            copy={copy}
            heartbeat={RUN_HEALTH[run.health?.heartbeat ?? ''] ?? 'unknown'}
            key={run.id}
            onIntervene={sessionId ? () => setControl({ action: 'steer', sessionId }) : undefined}
            onPause={sessionId ? () => setControl({ action: 'pause', sessionId }) : undefined}
            onStop={sessionId ? () => setControl({ action: 'stop', sessionId }) : undefined}
            sessionRef={run.id}
            stateLabel={run.state}
            stateTone={RUN_STATE_TONE[run.state] ?? 'neutral'}
            stepTitle={run.currentStep?.title}
            workItemRef={run.workItem?.id}
          />)
          : <p className="wm-landing-note">{copy.runEmpty}</p>, copy.runEmpty)}
      </ControlCenterSection>
    </div>
    {control && <AgentControlDialog action={control.action} onClose={() => setControl(null)} onCommitted={() => { setControl(null); void loadRuns() }} open sessionId={control.sessionId} />}
  </div>
}
