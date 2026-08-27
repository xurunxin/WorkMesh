'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FreshnessState, RecoveryCondition, RecoveryItem } from '@workmesh/contracts'
import { Badge, Button, FreshnessBadge, WorkSurfaceState } from '@workmesh/ui'
import { AgentControlDialog, type AgentControlAction } from './agent-control-dialog'
import { EvidenceDrawer, useEvidenceDrawer, type EvidenceDrawerItem } from './evidence-drawer'
import { apiRequest } from './lib/api'
import { useLocale } from './lib/i18n'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { useRealtimeConnectionState, useRealtimeSubscription } from './lib/realtime'
import { readRecoveryRoute, recoveryHref, type RecoveryRoute } from './recovery-route'

type Actor = Readonly<{ id: string; workspace_id?: string; workspace_role: 'admin' | 'member' }>
type ProjectionTrust = 'current' | 'refreshing' | 'resync_required'

const conditions: RecoveryCondition[] = [
  'missing_first_heartbeat', 'heartbeat_timeout', 'session_stale', 'session_failed',
  'session_canceled', 'session_blocked', 'assignment_without_active_executor',
  'lease_lost', 'approval_expired', 'validation_attempts_exhausted',
  'completion_evidence_missing', 'budget_exhausted',
]

const freshnessValue = (state: FreshnessState): 'fresh' | 'stale' | 'offline' | 'partial' => state === 'current'
  ? 'fresh'
  : state === 'offline' ? 'offline' : state === 'partial' ? 'partial' : 'stale'

export function RecoveryCenter({ actor }: { actor: Actor }) {
  const { locale } = useLocale()
  const copy = locale === 'zh-CN' ? {
    title: '恢复中心', intro: '查看失败、新鲜度、保留工作和受治理的恢复路径。', active: '待恢复', history: '已解决历史',
    lifecycle: '生命周期', condition: '恢复条件', severity: '严重度', all: '全部', apply: '应用筛选',
    loading: '正在加载恢复投影…', empty: '当前筛选没有恢复事项。', error: '恢复投影暂不可用。', retry: '重试',
    open: '打开恢复详情', close: '返回列表', freshness: '数据新鲜度', current: '当前', refreshing: '刷新中', stale: '已过期', offline: '离线', resync: '需要重新同步', partial: '部分数据',
    executor: '执行关系', activeExecutor: '活跃执行者', historical: '历史分配', terminalOnly: '仅终态分配', unassigned: '未分配',
    authority: '权限与运行事实', session: 'Session', delegation: '委派', connection: '连接', lease: '租约',
    preserved: '已保留工作', artifacts: '产物/证据', messages: '消息', context: '上下文快照', uncommitted: '未提交运行时工作',
    attempts: '自动恢复边界', used: '已使用', remaining: '剩余', circuit: '熔断状态', unsupported: '未配置',
    impact: '下游影响', recommended: '建议操作', alternatives: '其他操作与权衡', technical: '技术详情', source: '源记录', cursor: '事件游标', revision: '修订',
    unsafe: '该操作要求当前投影；刷新或重新同步前保持禁用。', pending: '正在重新验证当前授权投影，已保留列表、筛选和焦点。',
  } : {
    title: 'Recovery Center', intro: 'Inspect failures, freshness, preserved work, and governed recovery paths.', active: 'Needs recovery', history: 'Resolved history',
    lifecycle: 'Lifecycle', condition: 'Recovery condition', severity: 'Severity', all: 'All', apply: 'Apply filters',
    loading: 'Loading the Recovery projection…', empty: 'No recovery items match these filters.', error: 'The Recovery projection is unavailable.', retry: 'Retry',
    open: 'Open recovery details', close: 'Back to list', freshness: 'Data freshness', current: 'Current', refreshing: 'Refreshing', stale: 'Stale', offline: 'Offline', resync: 'Resync required', partial: 'Partial',
    executor: 'Execution relationship', activeExecutor: 'Active executor', historical: 'Historical assignment', terminalOnly: 'Terminal-only assignment', unassigned: 'Unassigned',
    authority: 'Authority and runtime facts', session: 'Session', delegation: 'Delegation', connection: 'Connection', lease: 'Lease',
    preserved: 'Preserved work', artifacts: 'Artifacts/evidence', messages: 'Messages', context: 'Context snapshot', uncommitted: 'Uncommitted runtime work',
    attempts: 'Automatic recovery bounds', used: 'Used', remaining: 'Remaining', circuit: 'Circuit breaker', unsupported: 'Not configured',
    impact: 'Downstream impact', recommended: 'Recommended action', alternatives: 'Alternatives and trade-offs', technical: 'Technical details', source: 'Source record', cursor: 'Event cursor', revision: 'Revision',
    unsafe: 'This action requires a current projection and stays disabled until refresh or resync succeeds.', pending: 'Revalidating the authorized projection while preserving the list, filters, and focus.',
  }
  const [route, setRoute] = useState<RecoveryRoute>(() => typeof window === 'undefined' ? { lifecycle: 'active' } : readRecoveryRoute(window.location.search))
  const [draftRoute, setDraftRoute] = useState(route)
  const [trust, setTrust] = useState<ProjectionTrust>('current')
  const [selected, setSelected] = useState<RecoveryItem | null>(null)
  const [detailError, setDetailError] = useState('')
  const [control, setControl] = useState<AgentControlAction | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const connection = useRealtimeConnectionState()
  const query = useMemo(() => {
    const params = new URLSearchParams({ lifecycle: route.lifecycle })
    if (route.condition) params.set('condition', route.condition)
    if (route.severity) params.set('severity', route.severity)
    if (route.projectId) params.set('projectId', route.projectId)
    return `/api/v1/recovery-items?${params}`
  }, [route.condition, route.lifecycle, route.projectId, route.severity])
  const page = usePagedApiList<RecoveryItem>(query, { scopeKey: `${actor.id}:${query}` })
  const recoveryEvidence = useMemo<EvidenceDrawerItem[]>(() => {
    const sources = selected ? [selected] : page.items
    return sources.flatMap(source => source.preservedWork.artifacts.map(item => ({
      ...item,
      sessionId: source.scope.sessionId ?? undefined,
      workItem: source.scope.workItemId ? { id: source.scope.workItemId, label: source.scope.workItemTitle ?? 'Work Item', projectId: source.scope.projectId ?? undefined } : undefined,
      producer: source.executor.agent ? { id: source.executor.agent.id, label: source.executor.agent.displayName, kind: 'agent' as const } : undefined,
      principalHuman: source.scope.responsibleHuman ? { id: source.scope.responsibleHuman.id, label: source.scope.responsibleHuman.displayName } : undefined,
      freshness: effectiveRecoveryFreshness(source, connection, trust),
      validationState: item.status === 'validated' ? 'verified' as const : item.status === 'failed' ? 'failed' as const : item.status === 'superseded' ? 'superseded' as const : item.status === 'produced' ? 'pending' as const : 'unknown' as const,
      summary: `Preserved by recovery source ${source.condition}; uncommitted runtime work is ${source.preservedWork.uncommitted}.`,
    })))
  }, [connection, page.items, selected, trust])
  const evidenceDrawer = useEvidenceDrawer(recoveryEvidence, 'recovery')

  const writeRoute = useCallback((next: RecoveryRoute, replace = false) => {
    const href = recoveryHref(window.location.href, next)
    window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', href)
    setRoute(next); setDraftRoute(next)
  }, [])
  useEffect(() => {
    const restore = () => { const next = readRecoveryRoute(window.location.search); setRoute(next); setDraftRoute(next) }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  const refresh = useCallback(async (resync = false) => {
    setTrust(resync ? 'resync_required' : 'refreshing')
    try { await page.refresh(); setTrust('current') } catch { setTrust(resync ? 'resync_required' : 'current') }
  }, [page.refresh])
  useRealtimeSubscription(actor.workspace_id ? [{ type: 'workspace', id: actor.workspace_id }] : [], invalidation => refresh(invalidation.reason === 'resync'))

  useEffect(() => {
    if (!route.selectedId) { setSelected(null); setDetailError(''); return }
    const fromPage = page.items.find(item => item.id === route.selectedId)
    if (fromPage) { setSelected(fromPage); setDetailError(''); return }
    let current = true
    apiRequest<RecoveryItem>(`/api/v1/recovery-items/${encodeURIComponent(route.selectedId)}`)
      .then(item => { if (current) { setSelected(item); setDetailError('') } })
      .catch(reason => { if (current) setDetailError(reason instanceof Error ? reason.message : copy.error) })
    return () => { current = false }
  }, [copy.error, page.items, route.selectedId])

  const effectiveFreshness = (item: RecoveryItem): FreshnessState => effectiveRecoveryFreshness(item, connection, trust)
  const freshnessLabel = (state: FreshnessState) => state === 'current' ? copy.current : state === 'refreshing' ? copy.refreshing : state === 'offline' ? copy.offline : state === 'resync_required' ? copy.resync : state === 'partial' ? copy.partial : copy.stale
  const executorLabel = (item: RecoveryItem) => item.executor.state === 'active_executor' ? copy.activeExecutor : item.executor.state === 'terminal_only_assignment' ? copy.terminalOnly : item.executor.state === 'unassigned' ? copy.unassigned : copy.historical
  const openItem = (item: RecoveryItem, trigger: HTMLElement) => { returnFocusRef.current = trigger; setSelected(item); writeRoute({ ...route, selectedId: item.id }) }
  const closeItem = () => { setSelected(null); writeRoute({ ...route, selectedId: undefined }, true); queueMicrotask(() => returnFocusRef.current?.focus()) }
  const submitFilters = (event: FormEvent) => { event.preventDefault(); writeRoute({ ...draftRoute, selectedId: undefined }) }

  const card = (item: RecoveryItem) => {
    const fresh = effectiveFreshness(item)
    return <button className="recovery-card" data-recovery-id={item.id} key={item.id} onClick={event => openItem(item, event.currentTarget)} type="button">
      <span className="recovery-card-badges"><Badge tone={item.severity === 'critical' ? 'danger' : 'warning'}>{item.severity}</Badge><FreshnessBadge categoryLabel={copy.freshness} label={freshnessLabel(fresh)} value={freshnessValue(fresh)} /></span>
      <strong>{item.title}</strong><span>{item.scope.workItemTitle ?? item.scope.projectName ?? item.executor.agent?.displayName ?? item.condition.replaceAll('_', ' ')}</span>
      <p>{item.summary}</p><small>{executorLabel(item)} · {new Date(item.happenedAt).toLocaleString(locale)}</small><span>{copy.open}</span>
    </button>
  }

  const detail = selected && (() => {
    const fresh = effectiveFreshness(selected)
    const current = fresh === 'current'
    const recommended = selected.actions.find(item => item.id === selected.recommendedActionId)
    const renderAction = (item: RecoveryItem['actions'][number]) => {
      const disabled = item.requiresCurrent && !current
      if (item.method === 'GET') return <a className="wm-button wm-button-secondary" href={item.path} key={item.id}>{item.label}</a>
      if ((item.kind === 'retry' || item.kind === 'handoff') && selected.scope.sessionId)
        return <Button disabled={disabled} key={item.id} onClick={() => setControl(item.kind === 'retry' ? 'retry' : 'handoff')} title={disabled ? copy.unsafe : item.tradeoff} type="button" variant={item.id === selected.recommendedActionId ? 'primary' : 'secondary'}>{item.label}</Button>
      return <a aria-disabled={disabled || undefined} className={`wm-button wm-button-secondary${disabled ? ' disabled' : ''}`} href={disabled ? undefined : `/agent-sessions/${selected.scope.sessionId ?? ''}`} key={item.id} title={item.tradeoff}>{item.label}</a>
    }
    return <aside aria-labelledby="recovery-detail-title" className="recovery-detail">
      <header><div><p className="eyebrow">{selected.condition.replaceAll('_', ' ')}</p><h3 id="recovery-detail-title">{selected.title}</h3><p>{selected.summary}</p></div><Button onClick={closeItem} type="button" variant="secondary">{copy.close}</Button></header>
      <div className="recovery-detail-badges"><Badge tone={selected.severity === 'critical' ? 'danger' : 'warning'}>{selected.severity}</Badge><Badge tone={selected.lifecycle === 'resolved' ? 'success' : 'warning'}>{selected.lifecycle}</Badge><FreshnessBadge categoryLabel={copy.freshness} label={freshnessLabel(fresh)} value={freshnessValue(fresh)} /></div>
      {!current && <p className="recovery-trust-warning" role="status">{trust !== 'current' ? copy.pending : copy.unsafe}</p>}
      <section><h4>{copy.executor}</h4><dl className="recovery-facts"><div><dt>{copy.executor}</dt><dd>{executorLabel(selected)} · {selected.executor.agent?.displayName ?? '—'}</dd></div><div><dt>{copy.session}</dt><dd>{selected.authority.sessionState ?? '—'}</dd></div><div><dt>{copy.delegation}</dt><dd>{selected.authority.delegationStatus ?? '—'}</dd></div><div><dt>{copy.connection}</dt><dd>{selected.authority.connectionStatus ?? '—'}</dd></div><div><dt>{copy.lease}</dt><dd>{selected.lease.status}{selected.lease.expiresAt ? ` · ${new Date(selected.lease.expiresAt).toLocaleString(locale)}` : ''}</dd></div></dl></section>
      <section><h4>{copy.preserved}</h4><dl className="recovery-facts"><div><dt>{copy.artifacts}</dt><dd>{selected.preservedWork.artifacts.length}</dd></div><div><dt>{copy.messages}</dt><dd>{selected.preservedWork.messages}</dd></div><div><dt>{copy.context}</dt><dd>{selected.preservedWork.contextSnapshotId ?? '—'}</dd></div><div><dt>{copy.uncommitted}</dt><dd>{selected.preservedWork.uncommitted} · {selected.preservedWork.uncommittedExplanation}</dd></div></dl>{selected.preservedWork.artifacts.length > 0 && <ul className="evidence-reference-buttons">{selected.preservedWork.artifacts.map(item => { const evidence = recoveryEvidence.find(candidate => candidate.id === item.id); return <li key={`${item.type}:${item.id}`}><button disabled={!evidence} onClick={event => evidence && evidenceDrawer.open(evidence, event.currentTarget)} type="button"><span>{item.type}</span>{item.title ?? item.id} · {item.status ?? 'unknown'}</button></li> })}</ul>}</section>
      <section><h4>{copy.attempts}</h4><dl className="recovery-facts"><div><dt>{copy.used}</dt><dd>{selected.attempts.used}</dd></div><div><dt>{copy.remaining}</dt><dd>{selected.attempts.remaining ?? copy.unsupported}</dd></div><div><dt>{copy.circuit}</dt><dd>{selected.attempts.circuitBreaker}</dd></div></dl></section>
      <section><h4>{copy.impact}</h4><p>{selected.downstreamImpact}</p></section>
      <section><h4>{copy.recommended}</h4><div className="recovery-actions">{recommended && renderAction(recommended)}</div><h4>{copy.alternatives}</h4><div className="recovery-actions">{selected.actions.filter(item => item.id !== recommended?.id).map(renderAction)}</div></section>
      <details><summary>{copy.technical}</summary><dl className="recovery-facts"><div><dt>{copy.source}</dt><dd>{selected.source.type} · {selected.source.id} · {selected.source.status}</dd></div><div><dt>{copy.revision}</dt><dd>{selected.source.revision}</dd></div><div><dt>{copy.cursor}</dt><dd>{selected.source.eventCursor ?? '—'}</dd></div><div><dt>Recovery</dt><dd>{selected.id}</dd></div></dl></details>
      {selected.scope.sessionId && <AgentControlDialog action={control} onClose={() => setControl(null)} onCommitted={() => refresh(false)} open={control !== null} sessionId={selected.scope.sessionId} />}
    </aside>
  })()

  return <section className="recovery-center" data-testid="recovery-center">
    <header className="surface-header"><div><p className="eyebrow">Human Control Plane</p><h2>{copy.title}</h2><p>{copy.intro}</p></div>{page.items[0] && <FreshnessBadge categoryLabel={copy.freshness} label={freshnessLabel(effectiveFreshness(page.items[0]))} value={freshnessValue(effectiveFreshness(page.items[0]))} />}</header>
    <nav aria-label={copy.lifecycle} className="collaboration-queue-tabs" role="tablist"><button aria-selected={route.lifecycle === 'active'} onClick={() => writeRoute({ ...route, lifecycle: 'active', selectedId: undefined })} role="tab" type="button">{copy.active}</button><button aria-selected={route.lifecycle === 'resolved'} onClick={() => writeRoute({ ...route, lifecycle: 'resolved', selectedId: undefined })} role="tab" type="button">{copy.history}</button></nav>
    <form className="recovery-filters" onSubmit={submitFilters}><label>{copy.condition}<select onChange={event => setDraftRoute(value => ({ ...value, condition: event.currentTarget.value ? event.currentTarget.value as RecoveryCondition : undefined }))} value={draftRoute.condition ?? ''}><option value="">{copy.all}</option>{conditions.map(condition => <option key={condition} value={condition}>{condition.replaceAll('_', ' ')}</option>)}</select></label><label>{copy.severity}<select onChange={event => setDraftRoute(value => ({ ...value, severity: event.currentTarget.value === 'medium' || event.currentTarget.value === 'high' || event.currentTarget.value === 'critical' ? event.currentTarget.value : undefined }))} value={draftRoute.severity ?? ''}><option value="">{copy.all}</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option></select></label><Button type="submit" variant="secondary">{copy.apply}</Button></form>
    {trust !== 'current' && <p className="recovery-update-notice" role="status">{copy.pending}</p>}
    <div className={`recovery-layout${route.selectedId ? ' has-detail' : ''}`}><section aria-label={copy.title} className="recovery-list">{page.error ? <WorkSurfaceState actionLabel={copy.retry} description={page.error.message} onAction={() => void refresh()} state="error" title={copy.error} /> : page.loading && page.items.length === 0 ? <WorkSurfaceState description={copy.intro} state="loading" title={copy.loading} /> : page.items.length === 0 ? <WorkSurfaceState description={copy.empty} state="empty" title={copy.title} /> : <>{page.items.map(card)}<LoadMoreButton collection={page} label={copy.title} /></>}</section>{detailError ? <p className="error" role="alert">{detailError}</p> : detail}</div>
    <EvidenceDrawer item={evidenceDrawer.selected} onClose={evidenceDrawer.close} />
  </section>
}

function effectiveRecoveryFreshness(item: RecoveryItem, connection: string, trust: ProjectionTrust): FreshnessState {
  return connection === 'offline' ? 'offline' : trust === 'resync_required' ? 'resync_required' : trust === 'refreshing' ? 'refreshing' : item.freshness.state
}
