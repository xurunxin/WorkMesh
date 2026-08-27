'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@workmesh/ui'
import { AgentSessionDetail } from '../agent-session-detail'
import { apiRequest } from '../lib/api'
import { type AgentSession, agentStateLabel, formatTime } from '../lib/agents'
import { useLocale } from '../lib/i18n'
import { LoadMoreButton, usePagedApiList } from '../lib/pagination'
import { RichContent } from '../../features/rich-content/markdown'
import styles from './agent-workspace.module.css'

type WorkspaceSession = AgentSession & {
  team_id?: string
  project_id?: string | null
  context_snapshot_id?: string | null
}

type ContextPlanStep = {
  id: string
  title: string
  description?: string
  status: string
  ordinal: number
}

type SessionContext = {
  contextSnapshotId: string | null
  guidanceUris: string[]
  guidancePins: Array<{ uri: string; title?: string; sourceType?: string }>
  plan: null | {
    id: string
    revision: number
    change_summary?: string
    changeSummary?: string
    steps?: ContextPlanStep[]
  }
  workItem: null | { id: string; title: string; team_key?: string; number?: number }
}

const terminalStates = new Set<AgentSession['state']>(['completed', 'failed', 'canceled'])

export function AgentWorkspace({ agentId }: { agentId: string }) {
  const { locale } = useLocale()
  const text = locale === 'zh-CN' ? {
    eyebrow: '人与智能体协同', title: '智能体工作区', intro: '这里展示权威 Session、当前计划、上下文来源、待审批动作与完成证据，不保存隐藏推理。',
    refresh: '刷新', loading: '正在加载智能体工作区…', loadError: '无法加载智能体工作区。', noSessions: '这个智能体尚无可见 Session。', recentSessions: '最近 Session', loadMore: '更多 Session',
    session: 'Session', state: 'Session 状态', workItem: 'WorkItem', context: '上下文快照', plan: '当前计划', heartbeat: '最近心跳', none: '无', notPublished: '尚未发布',
    contextTitle: '项目理解与上下文', contextIntro: '来源固定在当前 Session 的不可变上下文快照；计划与 WorkItem 仍以服务端权威投影为准。', contextLoading: '正在加载上下文…', contextError: '无法加载 Session 上下文。',
    guidance: '上下文来源', noGuidance: '该快照没有外部 guidance 来源。', steps: '计划步骤', noPlan: '当前 Session 尚未发布计划。', current: '当前',
    runTitle: '计划、审批、活动与证据', runIntro: '以下内容来自同一 Session，并随权威事件流刷新。', active: '活跃', historical: '历史',
  } : {
    eyebrow: 'Human–Agent collaboration', title: 'Agent workspace', intro: 'Authoritative Sessions, current plan, context sources, pending approvals, and completion evidence—without hidden reasoning.',
    refresh: 'Refresh', loading: 'Loading the Agent workspace…', loadError: 'The Agent workspace could not be loaded.', noSessions: 'This Agent has no visible Sessions yet.', recentSessions: 'Recent Sessions', loadMore: 'more Sessions',
    session: 'Session', state: 'Session state', workItem: 'WorkItem', context: 'Context snapshot', plan: 'Current plan', heartbeat: 'Last heartbeat', none: 'None', notPublished: 'Not published',
    contextTitle: 'Project understanding and context', contextIntro: 'Sources are pinned by the current Session snapshot; the plan and WorkItem remain server-authoritative projections.', contextLoading: 'Loading context…', contextError: 'The Session context could not be loaded.',
    guidance: 'Context sources', noGuidance: 'This snapshot has no external guidance sources.', steps: 'Plan steps', noPlan: 'This Session has no published plan.', current: 'Current',
    runTitle: 'Plan, approvals, activity, and evidence', runIntro: 'The following surfaces share one Session and refresh from its authoritative event stream.', active: 'Active', historical: 'Historical',
  }
  const sessions = usePagedApiList<WorkspaceSession>(`/api/v1/agent-sessions?agentId=${encodeURIComponent(agentId)}`, { scopeKey: agentId })
  const preferredId = useMemo(() => sessions.items.find(session => !terminalStates.has(session.state))?.id ?? sessions.items[0]?.id ?? '', [sessions.items])
  const [selectedId, setSelectedId] = useState('')
  const [context, setContext] = useState<SessionContext | null>(null)
  const [contextError, setContextError] = useState('')
  const [contextLoading, setContextLoading] = useState(false)

  useEffect(() => {
    if (!sessions.items.some(session => session.id === selectedId)) setSelectedId(preferredId)
  }, [preferredId, selectedId, sessions.items])

  useEffect(() => {
    if (!selectedId) {
      setContext(null)
      setContextError('')
      return
    }
    let current = true
    setContextLoading(true)
    setContextError('')
    void apiRequest<SessionContext>(`/api/v1/agent-sessions/${encodeURIComponent(selectedId)}/context`)
      .then(value => { if (current) setContext(value) })
      .catch(reason => {
        if (!current) return
        setContext(null)
        setContextError(reason instanceof Error ? reason.message : text.contextError)
      })
      .finally(() => { if (current) setContextLoading(false) })
    return () => { current = false }
  }, [selectedId, text.contextError])

  const selected = sessions.items.find(session => session.id === selectedId) ?? null
  const planSteps = [...(context?.plan?.steps ?? [])].sort((left, right) => left.ordinal - right.ordinal)
  const guidance: Array<{ uri: string; title?: string }> = context?.guidancePins.length
    ? context.guidancePins
    : (context?.guidanceUris ?? []).map(uri => ({ uri }))

  return <section aria-label={text.title} className={styles.workspace} data-testid="agent-workspace">
    <header className={styles.header}>
      <div><p className="eyebrow">{text.eyebrow}</p><h2>{text.title}</h2><p>{text.intro}</p></div>
      <Button onClick={() => void sessions.refresh()} type="button" variant="secondary">{text.refresh}</Button>
    </header>

    {sessions.loading && !sessions.initialized && <p className={styles.status} role="status">{text.loading}</p>}
    {sessions.error && <p className={styles.error} role="alert">{sessions.error.message || text.loadError}</p>}
    {sessions.initialized && sessions.items.length === 0 && <p className={styles.status}>{text.noSessions}</p>}

    {sessions.items.length > 0 && <section aria-labelledby="agent-workspace-sessions">
      <header className={styles.sectionHeader}><div><h3 id="agent-workspace-sessions">{text.recentSessions}</h3></div></header>
      <ul className={styles.sessionList}>{sessions.items.map(session => <li key={session.id}>
        <button className={styles.sessionButton} data-selected={session.id === selectedId} onClick={() => setSelectedId(session.id)} type="button">
          <strong>{text.session} {session.id.slice(0, 8)}</strong>
          <span>{agentStateLabel(session.state)} · {terminalStates.has(session.state) ? text.historical : text.active}</span>
          <small>{formatTime(session.updated_at)}</small>
        </button>
      </li>)}</ul>
      <LoadMoreButton collection={sessions} label={text.loadMore} />
    </section>}

    {selected && <>
      <dl className={styles.facts}>
        <div><dt>{text.state}</dt><dd>{agentStateLabel(selected.state)}</dd></div>
        <div><dt>{text.workItem}</dt><dd>{context?.workItem ? `${context.workItem.team_key ?? ''}${context.workItem.number ?? ''} ${context.workItem.title}`.trim() : selected.work_item_id ?? text.none}</dd></div>
        <div><dt>{text.context}</dt><dd>{context?.contextSnapshotId ?? selected.context_snapshot_id ?? text.none}</dd></div>
        <div><dt>{text.heartbeat}</dt><dd>{formatTime(selected.last_heartbeat_at)}</dd></div>
      </dl>

      <section className={styles.contextCard} aria-labelledby="agent-context-title">
        <header className={styles.contextHeader}><div><h3 id="agent-context-title">{text.contextTitle}</h3><p>{text.contextIntro}</p></div></header>
        {contextLoading && <p className={styles.status} role="status">{text.contextLoading}</p>}
        {contextError && <p className={styles.error} role="alert">{contextError}</p>}
        {context && <>
          <dl className={styles.contextFacts}>
            <div><dt>{text.context}</dt><dd>{context.contextSnapshotId ?? text.none}</dd></div>
            <div><dt>{text.plan}</dt><dd>{context.plan ? `v${context.plan.revision} · ${context.plan.changeSummary ?? context.plan.change_summary ?? context.plan.id}` : text.notPublished}</dd></div>
          </dl>
          <section><h4>{text.guidance}</h4>{guidance.length ? <ul className={styles.guidanceList}>{guidance.map(item => <li key={item.uri}><a href={item.uri} rel="noreferrer" target="_blank">{item.title ?? item.uri}</a></li>)}</ul> : <p className={styles.status}>{text.noGuidance}</p>}</section>
          <section><h4>{text.steps}</h4>{planSteps.length ? <ol className={styles.stepList}>{planSteps.map(step => <li data-current={step.status === 'in_progress'} key={step.id}><strong>{step.title}</strong><span>{step.status.replaceAll('_', ' ')}{step.status === 'in_progress' ? ` · ${text.current}` : ''}</span>{step.description && <RichContent density="compact" source={step.description} />}</li>)}</ol> : <p className={styles.status}>{text.noPlan}</p>}</section>
        </>}
      </section>

      <section className={styles.runCard} aria-labelledby="agent-run-detail-title">
        <header className={styles.sectionHeader}><div><h3 id="agent-run-detail-title">{text.runTitle}</h3><p>{text.runIntro}</p></div></header>
        <AgentSessionDetail compact sessionId={selected.id} />
      </section>
    </>}
  </section>
}
