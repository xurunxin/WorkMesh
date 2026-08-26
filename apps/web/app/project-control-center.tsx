'use client'

import { type FormEvent, type MouseEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import type { ControlCenterResponse } from '@workmesh/contracts'
import {
  ActorAttribution,
  AttentionKindBadge,
  AttentionListItem,
  Button,
  ControlCenterSection,
  EvidenceDrawer,
  FreshnessBadge,
  LifecycleBadge,
  PlanStepRail,
  ProjectControlNavigation,
  RiskBadge,
  RunDigestCard,
  RunHealthBadge,
  WorkSurfacePagination,
} from '@workmesh/ui'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen'
import { apiRequest } from './lib/api'
import { useLocale } from './lib/i18n'
import {
  projectControlHref,
  projectControlNavigation,
  readProjectControlRoute,
  type ProjectControlSurface,
} from './lib/human-control-plane-navigation'
import { useRealtimeConnectionState, useRealtimeSubscription, type RealtimeEvent } from './lib/realtime'

type Collection = keyof ControlCenterResponse['collections']
type Digest = ControlCenterResponse['collections'][Collection]['items'][number]
type Project = Readonly<{ id: string; name: string; summary: string | null; description: string | null; status: string }>
type Filters = Readonly<{
  responsibleHumanActorId?: string
  agentActorId?: string
  risk?: 'at_risk'
  workItemState?: 'backlog' | 'planned' | 'started' | 'completed' | 'canceled'
  timeWindow?: '24h' | '7d' | '30d'
}>

const collectionOrder: readonly Collection[] = ['attention', 'running', 'risks', 'recently_verified', 'ready_work', 'blocked_work']
export const projectControlCenterFeatureEnabled = (value = process.env.NEXT_PUBLIC_WORKMESH_HCP_PROJECT_CONTROL_CENTER): boolean => value !== '0'
const filterKeys = ['responsibleHumanActorId', 'agentActorId', 'risk', 'workItemState', 'timeWindow'] as const

const readFilters = (search: string): Filters => {
  const params = new URLSearchParams(search)
  const responsibleHumanActorId = params.get('responsibleHumanActorId') || undefined
  const agentActorId = params.get('agentActorId') || undefined
  const risk = params.get('risk') === 'at_risk' ? 'at_risk' : undefined
  const workItemStateValue = params.get('workItemState')
  const workItemState = workItemStateValue && ['backlog', 'planned', 'started', 'completed', 'canceled'].includes(workItemStateValue)
    ? workItemStateValue as Filters['workItemState']
    : undefined
  const timeWindowValue = params.get('timeWindow')
  const timeWindow = timeWindowValue && ['24h', '7d', '30d'].includes(timeWindowValue)
    ? timeWindowValue as Filters['timeWindow']
    : undefined
  return { responsibleHumanActorId, agentActorId, risk, workItemState, timeWindow }
}

const controlCenterPath = (projectId: string, filters: Filters, collection?: Collection, cursor?: string): string => {
  const params = new URLSearchParams()
  for (const key of filterKeys) if (filters[key]) params.set(key, filters[key]!)
  if (collection) params.set('collection', collection)
  if (cursor) params.set('cursor', cursor)
  params.set('limit', collection ? '20' : '10')
  return `/api/v1/projects/${encodeURIComponent(projectId)}/control-center?${params.toString()}`
}

const eventCollections = (event: RealtimeEvent): Collection[] => {
  const collections = new Set<Collection>()
  if (/^(approval|decision|inbox|completion_suggestion)\./.test(event.event_type)) collections.add('attention')
  if (/^(agent\.session|lease|handoff)\./.test(event.event_type)) {
    collections.add('running')
    collections.add('risks')
    collections.add('recently_verified')
  }
  if (/^(work_item|agent\.plan)\./.test(event.event_type)) {
    collections.add('ready_work')
    collections.add('blocked_work')
  }
  if (/^(artifact|delivery)\./.test(event.event_type)) collections.add('recently_verified')
  return [...collections]
}

const uniqueItems = (current: readonly Digest[], incoming: readonly Digest[]): Digest[] => {
  const incomingById = new Map(incoming.map(item => [item.id, item]))
  const retained = current.map(item => incomingById.get(item.id) ?? item)
  const currentIds = new Set(current.map(item => item.id))
  return [...retained, ...incoming.filter(item => !currentIds.has(item.id))]
}

const refreshItems = (current: readonly Digest[], incoming: readonly Digest[]): Digest[] => {
  const incomingById = new Map(incoming.map(item => [item.id, item]))
  const retained = current.flatMap(item => incomingById.has(item.id) ? [incomingById.get(item.id)!] : [])
  const currentIds = new Set(current.map(item => item.id))
  return [...retained, ...incoming.filter(item => !currentIds.has(item.id))]
}

export function ProjectControlCenter({ project, onOpenWork }: { project: Project; onOpenWork: () => void }) {
  const { humanControlPlaneCopy: copy, locale } = useLocale()
  const local = locale === 'zh-CN' ? {
    activeAgent: '运行中的智能体', all: '全部', applyFilters: '应用筛选', blockedDescription: '被执行状态或依赖阻塞的工作。', clearFilters: '清除筛选', currentStep: '当前计划步骤', details: '查看详情', empty: '当前没有项目。', evidenceCount: '证据', filters: 'Project Control Center 筛选', heartbeat: '心跳', lastActivity: '最近活动', loadError: '无法加载 Project Control Center。', loading: '正在加载 Project Control Center...', loadingMore: '正在加载…', loadMore: '加载更多工作项', noActivity: '暂无可显示的活动', noHuman: '未指定负责人', noItems: '当前没有此类项目。', pendingHuman: '待 Human 处理', projectStatus: '项目状态', readyDescription: '已满足服务端就绪条件、可进入执行的工作。', responsibleHumanFilter: '负责人', retry: '重试', riskFilter: '风险', stateFilter: '工作状态', timeFilter: '时间窗口', workItem: '工作项',
  } : {
    activeAgent: 'Active Agent Executor', all: 'All', applyFilters: 'Apply filters', blockedDescription: 'Work blocked by execution state or dependencies.', clearFilters: 'Clear filters', currentStep: 'Current Plan Step', details: 'View details', empty: 'There is nothing in this Project yet.', evidenceCount: 'Evidence', filters: 'Project Control Center filters', heartbeat: 'Heartbeat', lastActivity: 'Last activity', loadError: 'Unable to load the Project Control Center.', loading: 'Loading Project Control Center...', loadingMore: 'Loading…', loadMore: 'Load more work items', noActivity: 'No meaningful activity recorded', noHuman: 'No responsible Human', noItems: 'No items in this section.', pendingHuman: 'Pending Human actions', projectStatus: 'Project status', readyDescription: 'Work that satisfies the server-side readiness projection.', responsibleHumanFilter: 'Responsible Human', retry: 'Retry', riskFilter: 'Risk', stateFilter: 'Work Item state', timeFilter: 'Time window', workItem: 'Work Item',
  }
  const [data, setData] = useState<ControlCenterResponse | null>(null)
  const [error, setError] = useState('')
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<Collection, string>>>({})
  const [loadingMore, setLoadingMore] = useState<Collection | null>(null)
  const [activeSurface, setActiveSurface] = useState<ProjectControlSurface>('overview')
  const [selected, setSelected] = useState<Digest | null>(null)
  const [filters, setFilters] = useState<Filters>(() => typeof window === 'undefined' ? {} : readFilters(window.location.search))
  const [draftFilters, setDraftFilters] = useState<Filters>(() => typeof window === 'undefined' ? {} : readFilters(window.location.search))
  const connectionState = useRealtimeConnectionState()

  const refreshAll = useCallback(async () => {
    setError('')
    try {
      const next = await apiRequest<ControlCenterResponse>(controlCenterPath(project.id, filters))
      setData(next)
      setSectionErrors({})
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : local.loadError)
    }
  }, [filters, local.loadError, project.id])

  const refreshCollection = useCallback(async (collection: Collection) => {
    try {
      const next = await apiRequest<ControlCenterResponse>(controlCenterPath(project.id, filters, collection))
      setData(current => current ? { ...current, revision: Math.max(current.revision, next.revision), freshness: next.freshness, collections: { ...current.collections, [collection]: { items: refreshItems(current.collections[collection].items, next.collections[collection].items), nextCursor: next.collections[collection].nextCursor } } } : next)
      setSectionErrors(current => ({ ...current, [collection]: undefined }))
    } catch (reason) {
      setSectionErrors(current => ({ ...current, [collection]: reason instanceof Error ? reason.message : local.loadError }))
    }
  }, [filters, local.loadError, project.id])

  useEffect(() => { void refreshAll() }, [refreshAll])
  useEffect(() => {
    const restore = () => {
      const route = readProjectControlRoute(window.location.search)
      const restoredFilters = readFilters(window.location.search)
      setActiveSurface(route.surface)
      setFilters(current => JSON.stringify(current) === JSON.stringify(restoredFilters) ? current : restoredFilters)
      setDraftFilters(current => JSON.stringify(current) === JSON.stringify(restoredFilters) ? current : restoredFilters)
      if (!route.selectedId) setSelected(null)
      else setSelected(current => current?.id === route.selectedId ? current : data ? collectionOrder.flatMap(collection => data.collections[collection].items).find(item => item.id === route.selectedId) ?? null : null)
    }
    restore()
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [data])
  useRealtimeSubscription([{ type: 'project', id: project.id }], invalidation => {
    if (invalidation.reason === 'resync') void refreshAll()
    else eventCollections(invalidation.event).forEach(collection => void refreshCollection(collection))
  })

  const navigation = useMemo(() => projectControlNavigation({
    active: activeSurface,
    copy: { overview: copy.overview, work: copy.work, attention: copy.attention, runs: copy.runs, graph: copy.graph, activity: copy.activity, settings: copy.projectSettings, beta: copy.beta },
    currentSearch: typeof window === 'undefined' ? '' : window.location.search,
    projectId: project.id,
  }).map(item => ({ ...item, onClick: (event: MouseEvent<HTMLAnchorElement>) => {
    if (item.id === 'work') { event.preventDefault(); onOpenWork(); return }
    if (!['overview', 'attention', 'runs'].includes(item.id)) return
    event.preventDefault()
    setActiveSurface(item.id)
    window.history.pushState({}, '', item.href)
  } })), [activeSurface, copy, onOpenWork, project.id])

  const openDetails = (item: Digest) => {
    setSelected(item)
    window.history.pushState({}, '', projectControlHref({ currentSearch: window.location.search, drawerId: 'digest', projectId: project.id, selectedId: item.id, surface: activeSurface }))
  }
  const closeDetails = () => {
    setSelected(null)
    window.history.replaceState({}, '', projectControlHref({ currentSearch: window.location.search, projectId: project.id, surface: activeSurface }))
  }
  const loadMore = async (collection: Collection) => {
    const cursor = data?.collections[collection].nextCursor
    if (!cursor || loadingMore) return
    setLoadingMore(collection)
    try {
      const next = await apiRequest<ControlCenterResponse>(controlCenterPath(project.id, filters, collection, cursor))
      setData(current => current ? { ...current, collections: { ...current.collections, [collection]: { items: uniqueItems(current.collections[collection].items, next.collections[collection].items), nextCursor: next.collections[collection].nextCursor } } } : next)
    } catch (reason) {
      setSectionErrors(current => ({ ...current, [collection]: reason instanceof Error ? reason.message : local.loadError }))
    } finally { setLoadingMore(null) }
  }
  const writeFilters = (next: Filters) => {
    const params = new URLSearchParams(window.location.search)
    for (const key of filterKeys) {
      if (next[key]) params.set(key, next[key]!)
      else params.delete(key)
    }
    params.delete('selected')
    params.delete('drawer')
    window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`)
    setSelected(null)
    setFilters(next)
    setDraftFilters(next)
  }
  const applyFilters = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); writeFilters(draftFilters) }

  const attribution = (item: Digest) => <ActorAttribution
    activeAgent={item.activeAgent ? { label: local.activeAgent, name: item.activeAgent.displayName } : null}
    relationshipLabel={copy.agentRelationship}
    responsibleHuman={{ label: copy.responsibleHuman, name: item.responsibleHuman?.displayName ?? local.noHuman }}
  />
  const freshness = connectionState === 'offline' ? 'offline' : !data ? error ? 'partial' : 'stale' : data.freshness.state === 'stale' ? 'stale' : data.freshness.state === 'partial' ? 'partial' : 'fresh'
  const freshnessLabel = freshness === 'fresh' ? copy.freshNow : freshness === 'offline' ? 'Offline' : freshness === 'partial' ? 'Partial' : copy.stale
  const allDigests = data ? collectionOrder.flatMap(collection => data.collections[collection].items) : []
  const humanOptions = [...new Map(allDigests.flatMap(item => item.responsibleHuman ? [[item.responsibleHuman.id, item.responsibleHuman.displayName] as const] : [])).entries()]
  const agentOptions = [...new Map(allDigests.flatMap(item => item.activeAgent ? [[item.activeAgent.id, item.activeAgent.displayName] as const] : [])).entries()]
  const metadata = (item: Digest) => <dl className="project-control-digest-meta">
    {item.workItem && <div><dt>{local.workItem}</dt><dd>{item.workItem.title}</dd></div>}
    {item.currentStep && <div><dt>{local.currentStep}</dt><dd>{item.currentStep.title}</dd></div>}
    {item.lastActivity && <div><dt>{local.lastActivity}</dt><dd>{item.lastActivity.summary}</dd></div>}
    {item.health && <div><dt>{local.heartbeat}</dt><dd>{item.health.lastHeartbeatAt ? new Date(item.health.lastHeartbeatAt).toLocaleString(locale) : copy.stale}</dd></div>}
    <div><dt>{local.pendingHuman}</dt><dd>{item.pendingHumanActionCount}</dd></div>
    <div><dt>{local.evidenceCount}</dt><dd>{item.evidenceCount}</dd></div>
  </dl>

  const genericSection = (collection: Collection, title: string, description: string, tone: 'attention' | 'running' | 'risk' | 'verified', badges: (item: Digest) => ReactNode) => {
    const section = data?.collections[collection]
    return <ControlCenterSection count={section?.items.length ?? 0} description={description} title={title} tone={tone}>
      {sectionErrors[collection] && <div className="project-control-section-state" role="alert"><span>{sectionErrors[collection]}</span><Button onClick={() => void refreshCollection(collection)} type="button" variant="ghost">{local.retry}</Button></div>}
      {section?.items.map(item => <AttentionListItem actions={<Button icon={<ArrowRightIcon aria-hidden="true" size={16} />} iconPosition="end" onClick={() => openDetails(item)} type="button" variant="ghost">{local.details}</Button>} actor={attribution(item)} badges={badges(item)} description={item.summary} key={item.id} metadata={metadata(item)} title={item.title} />)}
      {section && section.items.length === 0 && !sectionErrors[collection] && <div className="project-control-section-state"><span>{local.noItems}</span></div>}
      <WorkSurfacePagination copy={{ loadMore: local.loadMore, loading: local.loadingMore }} loading={loadingMore === collection} nextCursor={section?.nextCursor ?? null} onLoadMore={() => loadMore(collection)} />
    </ControlCenterSection>
  }

  const projectHeader = <>
    <header className="hcp-project-header">
      <div className="hcp-project-heading"><div><div className="hcp-title-row"><h1>{project.name}</h1><FreshnessBadge categoryLabel={copy.freshness} label={freshnessLabel} value={freshness} /></div><p>{project.description || project.summary || local.empty}</p></div><div className="hcp-project-actions"><Button data-testid="project-control-view-work" icon={<FolderOpenIcon aria-hidden="true" size={16} />} onClick={onOpenWork} type="button">{copy.viewWork}</Button></div></div>
      <dl className="project-control-project-status"><div><dt>{local.projectStatus}</dt><dd>{project.status.replaceAll('_', ' ')}</dd></div><div><dt>{copy.responsibleHuman}</dt><dd>{data?.project?.responsibleHuman?.displayName ?? local.noHuman}</dd></div><div><dt>{locale === 'zh-CN' ? '目标日期' : 'Target date'}</dt><dd>{data?.project?.targetDate ?? '-'}</dd></div><div><dt>{copy.freshness}</dt><dd>{data ? `rev ${data.revision}` : '-'}</dd></div></dl>
    </header>
    <ProjectControlNavigation items={navigation} label={copy.projectNavigation} />
  </>

  if (!data && !error) return <div className="hcp-reference project-control-center" data-testid="project-control-center">{projectHeader}<div className="project-control-loading" role="status">{local.loading}</div></div>
  if (!data) return <div className="hcp-reference project-control-center" data-testid="project-control-center">{projectHeader}<div className="project-control-loading" role="alert"><span>{error || local.loadError}</span><Button onClick={() => void refreshAll()} type="button">{local.retry}</Button></div></div>

  const attention = genericSection('attention', copy.needsYou, copy.needsYouDescription, 'attention', item => <><AttentionKindBadge categoryLabel={copy.attentionKind} label={item.kind.replaceAll('_', ' ')} value={(item.kind === 'completion_review' ? 'completion_review' : item.kind === 'approval' ? 'approval' : item.kind === 'clarification' ? 'clarification' : item.kind === 'conflict' ? 'conflict' : item.kind === 'recovery' ? 'recovery' : 'decision')} /><LifecycleBadge categoryLabel={copy.lifecycle} label={copy.statusOpen} value="open" /></>)
  const running = <ControlCenterSection count={data.collections.running.items.length} description={copy.runningDescription} title={copy.running} tone="running">
    {sectionErrors.running && <div className="project-control-section-state" role="alert"><span>{sectionErrors.running}</span><Button onClick={() => void refreshCollection('running')} type="button" variant="ghost">{local.retry}</Button></div>}
    {data.collections.running.items.map(item => <RunDigestCard actions={<Button icon={<ArrowRightIcon aria-hidden="true" size={16} />} iconPosition="end" onClick={() => openDetails(item)} type="button" variant="ghost">{local.details}</Button>} attribution={attribution(item)} badges={<><RunHealthBadge categoryLabel={copy.health} label={item.health?.heartbeat ?? 'unknown'} value={item.health?.heartbeat === 'stale' ? 'stalled' : item.health?.heartbeat ?? 'unknown'} /><FreshnessBadge categoryLabel={copy.freshness} label={freshnessLabel} value={freshness} /></>} description={item.summary} key={item.id} status={<span className="project-control-run-state">{item.state.replaceAll('_', ' ')}</span>} title={item.workItem?.title ?? item.title}>{item.currentStep && <PlanStepRail label={local.currentStep} steps={[{ id: item.currentStep.id, label: item.currentStep.title, description: item.lastActivity?.summary ?? local.noActivity, state: item.currentStep.status === 'blocked' ? 'blocked' : item.currentStep.status === 'completed' ? 'complete' : 'current' }]} />}{metadata(item)}</RunDigestCard>)}
    {data.collections.running.items.length === 0 && <div className="project-control-section-state"><span>{local.noItems}</span></div>}
    <WorkSurfacePagination copy={{ loadMore: local.loadMore, loading: local.loadingMore }} loading={loadingMore === 'running'} nextCursor={data.collections.running.nextCursor} onLoadMore={() => loadMore('running')} />
  </ControlCenterSection>
  const risks = genericSection('risks', copy.atRisk, copy.atRiskDescription, 'risk', item => <><RunHealthBadge categoryLabel={copy.health} label={item.health?.heartbeat ?? item.state} value={item.health?.heartbeat === 'stale' ? 'stalled' : item.state === 'failed' ? 'failed' : item.health?.heartbeat ?? 'unknown'} /><RiskBadge categoryLabel={copy.risk} label={copy.riskHigh} value="high" /></>)
  const verified = genericSection('recently_verified', copy.recentlyVerified, copy.recentlyVerifiedDescription, 'verified', () => <LifecycleBadge categoryLabel={copy.lifecycle} label={copy.statusVerified} value="verified" />)
  const ready = genericSection('ready_work', copy.ready, local.readyDescription, 'verified', () => <LifecycleBadge categoryLabel={copy.lifecycle} label={copy.ready} value="open" />)
  const blocked = genericSection('blocked_work', copy.blocked, local.blockedDescription, 'risk', () => <RiskBadge categoryLabel={copy.risk} label={copy.blocked} value="high" />)
  const surfaces: Record<ProjectControlSurface, ReactNode> = { overview: <>{attention}{running}{risks}{verified}{ready}{blocked}</>, attention, runs: running, work: null, graph: null, activity: null, settings: null }

  return <div className="hcp-reference project-control-center" data-testid="project-control-center">
    {projectHeader}
    <form aria-label={local.filters} className="project-control-filters" onSubmit={applyFilters}>
      <label>{local.responsibleHumanFilter}<select onChange={event => { const value = event.currentTarget.value; setDraftFilters(current => ({ ...current, responsibleHumanActorId: value || undefined })) }} value={draftFilters.responsibleHumanActorId ?? ''}><option value="">{local.all}</option>{humanOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>{copy.activeAgent}<select onChange={event => { const value = event.currentTarget.value; setDraftFilters(current => ({ ...current, agentActorId: value || undefined })) }} value={draftFilters.agentActorId ?? ''}><option value="">{local.all}</option>{agentOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>{local.riskFilter}<select onChange={event => { const value = event.currentTarget.value; setDraftFilters(current => ({ ...current, risk: value === 'at_risk' ? 'at_risk' : undefined })) }} value={draftFilters.risk ?? ''}><option value="">{local.all}</option><option value="at_risk">{copy.atRisk}</option></select></label>
      <label>{local.stateFilter}<select onChange={event => { const value = event.currentTarget.value; setDraftFilters(current => ({ ...current, workItemState: value ? value as Filters['workItemState'] : undefined })) }} value={draftFilters.workItemState ?? ''}><option value="">{local.all}</option>{['backlog', 'planned', 'started', 'completed', 'canceled'].map(state => <option key={state} value={state}>{state.replaceAll('_', ' ')}</option>)}</select></label>
      <label>{local.timeFilter}<select onChange={event => { const value = event.currentTarget.value; setDraftFilters(current => ({ ...current, timeWindow: value ? value as Filters['timeWindow'] : undefined })) }} value={draftFilters.timeWindow ?? ''}><option value="">{local.all}</option><option value="24h">24h</option><option value="7d">7d</option><option value="30d">30d</option></select></label>
      <div className="project-control-filter-actions"><Button type="submit">{local.applyFilters}</Button><Button onClick={() => writeFilters({})} type="button" variant="ghost">{local.clearFilters}</Button></div>
    </form>
    <section aria-label={copy.summaryLabel} className="hcp-summary-strip">{collectionOrder.map(collection => { const labels: Record<Collection, string> = { attention: copy.needsYou, running: copy.running, risks: copy.atRisk, recently_verified: copy.recentlyVerified, ready_work: copy.ready, blocked_work: copy.blocked }; const tones: Record<Collection, string> = { attention: 'attention', running: 'running', risks: 'risk', recently_verified: 'verified', ready_work: 'ready', blocked_work: 'blocked' }; return <article className={`tone-${tones[collection]}`} key={collection}><strong>{data.collections[collection].items.length}</strong><span>{labels[collection]}</span></article> })}</section>
    <div className="hcp-control-grid">{surfaces[activeSurface] ?? <div className="project-control-section-state">{local.empty}</div>}</div>
    <EvidenceDrawer closeLabel={copy.close} description={selected?.summary} onClose={closeDetails} open={Boolean(selected)} title={selected?.title ?? copy.evidence}>{selected && <>{attribution(selected)}{metadata(selected)}<Button onClick={onOpenWork} type="button">{copy.viewWork}</Button></>}</EvidenceDrawer>
  </div>
}
