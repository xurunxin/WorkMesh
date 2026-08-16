'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell, AsyncStateSurface, Button, ErrorState } from '@workmesh/ui'
import { ApiError, apiRequest, clearCsrfToken, saveCsrfToken } from '../lib/api'
import {
  type Agent,
  type AgentSession,
  type Approval,
  agentHeartbeat,
  agentName,
  agentProvider,
  agentStateClass,
  agentStateLabel,
  agentVersion,
  canManageAgentTeamAccess,
  formatTime,
  grantAgentTeamAccess,
  normalizeApproval,
  revokeAgentTeamAccess,
} from '../lib/agents'
import { LoadMoreButton, usePagedApiList } from '../lib/pagination'
import { type RealtimeResource, useRealtimeSubscription } from '../lib/realtime'
import { agentRegistryRefreshTargets } from '../lib/realtime-refresh'
import { AgentConnectionsPanel } from '../agent-connections-panel'
import { RealtimeStatus } from '../realtime-status'
import { GlobalCommandCenter } from '../../features/command-center'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { workspaceNavigation, workspaceUtilityNavigation } from '../lib/workspace-navigation'

type AuthMe = { actor: { id: string; display_name: string; workspace_id: string; workspace_role: 'admin' | 'member' }; csrfToken: string }
type Team = { id: string; name: string; key: string }
type Human = { id: string; display_name: string; email?: string }
type AgentFilter = 'all' | 'active' | 'inactive'

export default function AgentsPage() {
  const { locale, t } = useLocale()
  const text = locale === 'zh-CN' ? {
    loadingDescription: '正在加载智能体、Session、审批和连接信息。', loadingTitle: '正在加载智能体工作区', context: '人类控制面', loadError: '无法加载智能体。', selectCapability: '请至少选择一项要授予的能力。', updateAccessError: '无法更新团队访问权限。', revokeAccessError: '无法撤销团队访问权限。', refresh: '刷新', eyebrow: '人类控制面', title: '智能体', intro: '监控委派工作、处理审批，并在不接触凭据的情况下诊断连接。', retry: '重试', attentionTitle: '智能体工作区需要关注', attentionDescription: '无法加载智能体工作区。', activeAgents: '活跃智能体', registered: (count: number) => `已注册 ${count} 个`, liveSessions: '运行中 Session', visible: (count: number) => `可见 ${count} 个`, pendingApprovals: '待处理审批', responseRequired: '需要人类响应', queueClear: '队列为空', needsAttention: '需要关注', blockedOrWaiting: '阻塞、过期或等待中', registry: '注册表', registryIntro: '先检查定义；仅在需要审阅时展开团队权限。', all: '全部', active: '活跃', inactive: '停用', noAgents: '没有符合当前筛选的已注册智能体。', humanQueue: '人类队列', approvals: '审批', openInbox: '打开收件箱', noApprovals: '没有待处理审批。', execution: '执行', sessions: 'Sessions', noSessions: '当前没有可见的智能体 Session。', durableState: '持久状态', diagnostics: '诊断', diagnosticsIntro: '健康状态来自服务端 Session 与连接事实；实时更新只触发刷新。', allClear: '一切正常', allClearDetail: '没有可见 Session 处于过期、失败、阻塞或等待人类的状态。',
  } : {
    loadingDescription: 'Loading Agents, Sessions, approvals, and Connection facts.', loadingTitle: 'Loading Agent workspace', context: 'Human control plane', loadError: 'Unable to load agents.', selectCapability: 'Select at least one capability to grant.', updateAccessError: 'Unable to update team access.', revokeAccessError: 'Unable to revoke team access.', refresh: 'Refresh', eyebrow: 'Human control plane', title: 'Agents', intro: 'Monitor delegated work, respond to approvals, and diagnose Connections without handling credentials.', retry: 'Retry', attentionTitle: 'Agent workspace needs attention', attentionDescription: 'Unable to load the Agent workspace.', activeAgents: 'Active agents', registered: (count: number) => `${count} registered`, liveSessions: 'Live sessions', visible: (count: number) => `${count} visible`, pendingApprovals: 'Pending approvals', responseRequired: 'Human response required', queueClear: 'Queue clear', needsAttention: 'Needs attention', blockedOrWaiting: 'Blocked, stale, or waiting', registry: 'Registry', registryIntro: 'Scan definitions first; expand Team authority only when it needs review.', all: 'All', active: 'Active', inactive: 'Inactive', noAgents: 'No registered agents match this filter.', humanQueue: 'Human queue', approvals: 'Approvals', openInbox: 'Open inbox', noApprovals: 'No pending approvals.', execution: 'Execution', sessions: 'Sessions', noSessions: 'No agent session is visible to you.', durableState: 'Durable state', diagnostics: 'Diagnostics', diagnosticsIntro: 'Health comes from server-reported session and Connection facts; realtime updates only prompt a refresh.', allClear: 'All clear', allClearDetail: 'No visible session is stale, failed, blocked, or waiting for a Human.',
  }
  const [actor, setActor] = useState<AuthMe['actor'] | null>(null)
  const [filter, setFilter] = useState<AgentFilter>('all')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyAccess, setBusyAccess] = useState('')
  const agentsPage = usePagedApiList<Agent>(actor ? '/api/v1/agents' : null)
  const teamsPage = usePagedApiList<Team>(actor ? '/api/v1/teams' : null)
  const humansPage = usePagedApiList<Human>(actor ? '/api/v1/actors/humans' : null)
  const sessionsPage = usePagedApiList<AgentSession>(actor ? '/api/v1/agent-sessions' : null, { optional: true })
  const approvalsPage = usePagedApiList<Approval, Approval>(actor ? '/api/v1/approvals?status=pending' : null, {
    optional: true,
    map: value => normalizeApproval(value as unknown as Record<string, unknown>),
  })
  const agents = agentsPage.items
  const teams = teamsPage.items
  const humans = humansPage.items
  const sessions = sessionsPage.items
  const approvals = approvalsPage.items
  const collectionError = [agentsPage.error, teamsPage.error, humansPage.error, sessionsPage.error, approvalsPage.error].find(Boolean)

  const load = useCallback(async () => {
    try {
      setError('')
      const auth = await apiRequest<AuthMe>('/api/v1/auth/me')
      saveCsrfToken(auth.csrfToken)
      setActor(auth.actor)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) { clearCsrfToken(); window.location.assign('/login'); return }
      setError(reason instanceof Error ? reason.message : text.loadError)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const realtimeResources = useMemo<RealtimeResource[]>(() => [
    ...(actor ? [{ type: 'workspace' as const, id: actor.workspace_id }] : []),
    ...teams.map(team => ({ type: 'team' as const, id: team.id })),
    ...sessions.map(session => ({ type: 'session' as const, id: session.id })),
  ], [actor?.workspace_id, sessions, teams])
  useRealtimeSubscription(realtimeResources, invalidation => {
    const targets = agentRegistryRefreshTargets(invalidation)
    if (invalidation.reason === 'resync') return Promise.all([
      agentsPage.refresh(), teamsPage.refresh(), humansPage.refresh(), sessionsPage.refresh(), approvalsPage.refresh(),
    ]).then(() => undefined)
    if (targets.has('agents')) void agentsPage.refresh()
    if (targets.has('teams')) void teamsPage.refresh()
    if (targets.has('sessions')) void sessionsPage.refresh()
    if (targets.has('approvals')) void approvalsPage.refresh()
  })

  const grantAccess = async (event: FormEvent<HTMLFormElement>, agent: Agent, team: Team) => {
    event.preventDefault()
    const approvedCapabilities = new FormData(event.currentTarget).getAll('capabilities').map(String)
    if (approvedCapabilities.length === 0) { setError(text.selectCapability); return }
    const operation = `${agent.id}:${team.id}`
    try { setBusyAccess(operation); setError(''); await grantAgentTeamAccess(agent.id, team.id, approvedCapabilities); await agentsPage.refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : text.updateAccessError) }
    finally { setBusyAccess('') }
  }

  const revokeAccess = async (agent: Agent, team: Team) => {
    const operation = `${agent.id}:${team.id}`
    try { setBusyAccess(operation); setError(''); await revokeAgentTeamAccess(agent.id, team.id); await agentsPage.refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : text.revokeAccessError) }
    finally { setBusyAccess('') }
  }

  const shownAgents = useMemo(() => agents.filter(agent => filter === 'all' || (filter === 'active' ? agent.is_active : !agent.is_active)), [agents, filter])
  const canManageAccess = canManageAgentTeamAccess(actor?.workspace_role)
  const attentionSessions = sessions.filter(session => ['stale', 'failed', 'blocked', 'awaiting_approval', 'awaiting_input'].includes(session.state))
  const refresh = () => { void load(); void agentsPage.refresh(); void teamsPage.refresh(); void humansPage.refresh(); void sessionsPage.refresh(); void approvalsPage.refresh() }

  if (loading) return <main className="center foundation-center wm-theme"><AsyncStateSurface description={text.loadingDescription} state="loading" title={text.loadingTitle} /></main>
  return <AppShell
    administrationNavigationLabel={t('administrationNavigation')}
    actorName={actor?.display_name}
    contextLabel={text.context}
    headerActions={<div className="shell-action-cluster"><LocaleToggle /><GlobalCommandCenter locale={locale} triggerLabel={t('search')} /><RealtimeStatus labels={{ connected: t('live'), connecting: t('connecting'), reconnecting: t('reconnecting'), offline: t('offline') }} /></div>}
    mainNavigationLabel={t('mainNavigation')}
    menuLabel={t('menu')}
    mobileNavigationLabel={t('mobileNavigation')}
    productName="WorkMesh"
    navigation={workspaceNavigation({ active: 'agents', t })}
    skipLabel={t('skipToContent')}
    utilityNavigation={workspaceUtilityNavigation({ t })}
    workspaceNavigationLabel={t('workspaceNavigation')}
  >
    <section className="agent-center">
      <header className="page-header"><div><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p>{text.intro}</p></div><Button onClick={refresh}>{text.refresh}</Button></header>
      {(error || collectionError) && <ErrorState actionLabel={text.retry} description={error || collectionError?.message || text.attentionDescription} onAction={refresh} title={text.attentionTitle} />}

      <section className="control-summary" aria-label="Agent control summary">
        <article><span>{text.activeAgents}</span><strong>{agents.filter(agent => agent.is_active).length}</strong><small>{text.registered(agents.length)}</small></article>
        <article><span>{text.liveSessions}</span><strong>{sessions.filter(session => !['completed', 'failed', 'canceled'].includes(session.state)).length}</strong><small>{text.visible(sessions.length)}</small></article>
        <article className={approvals.length ? 'needs-attention' : ''}><span>{text.pendingApprovals}</span><strong>{approvals.length}</strong><small>{approvals.length ? text.responseRequired : text.queueClear}</small></article>
        <article className={attentionSessions.length ? 'needs-attention' : ''}><span>{text.needsAttention}</span><strong>{attentionSessions.length}</strong><small>{text.blockedOrWaiting}</small></article>
      </section>

      <AgentConnectionsPanel admin={actor?.workspace_role === 'admin'} teams={teams} humans={humans.length ? humans : actor ? [{ id: actor.id, display_name: actor.display_name }] : []} currentHumanId={actor?.id ?? ''} onError={setError} />

      <section className="agent-center-grid">
        <section className="surface-panel agent-registry" aria-label="Agent registry">
          <header className="surface-header"><div><p className="eyebrow">{text.registry}</p><h2>{text.title}</h2><p>{text.registryIntro}</p></div><div className="activity-filters">{(['all', 'active', 'inactive'] as AgentFilter[]).map(value => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{text[value]}</button>)}</div></header>
          {shownAgents.length === 0 ? <p className="empty">{text.noAgents}</p> : <div className="registry-list">{shownAgents.map(agent => <article className="agent-summary-card" id={`agent-${agent.id}`} key={agent.id} data-testid={`agent-registry-${agent.id}`}>
            <header><div><h3>{agentName(agent)}</h3><small>{agent.slug} · {agentProvider(agent)} {agentVersion(agent)}</small></div><span className={agent.is_active ? 'registry-active' : 'registry-inactive'}>{agent.is_active ? 'active' : 'inactive'}</span></header>
            <p>{agent.description || 'No registry description.'}</p>
            <dl className="agent-key-facts"><div><dt>Approved</dt><dd>{agent.approved_capabilities.length || 0} capabilities</dd></div><div><dt>Concurrency</dt><dd>{agent.max_concurrency}</dd></div><div><dt>Heartbeat</dt><dd>{agentHeartbeat(agent)}s</dd></div></dl>
            <details className="agent-access-details"><summary>Team access and capabilities</summary><p><strong>Requested:</strong> {agent.requested_capabilities.join(', ') || 'None'}</p><p><strong>Definition approved:</strong> {agent.approved_capabilities.join(', ') || 'None'}</p><section className="team-access-list" aria-label={`${agentName(agent)} team access`}>{teams.length === 0 ? <p className="empty">No teams are available.</p> : teams.map(team => {
              const access = agent.team_access?.find(candidate => candidate.team_id === team.id)
              const status = access?.status ?? (access?.revoked_at ? 'revoked' : 'not granted')
              const operation = `${agent.id}:${team.id}`
              return <article key={team.id} data-testid={`team-access-${agent.id}-${team.id}`}><header><strong>{team.name} ({team.key})</strong><span className={status === 'active' ? 'registry-active' : 'registry-inactive'}>{status}</span></header><p>Approved: {access?.approved_capabilities.length ? access.approved_capabilities.join(', ') : 'None'}</p>{access?.revoked_at && <small>Revoked {formatTime(access.revoked_at)}</small>}{canManageAccess && <form key={`${operation}:${access?.revision ?? 0}:${status}`} onSubmit={event => void grantAccess(event, agent, team)}><fieldset disabled={busyAccess === operation || agent.requested_capabilities.length === 0}><legend>Approved capability subset</legend>{agent.requested_capabilities.map(capability => <label key={capability}><input type="checkbox" name="capabilities" value={capability} defaultChecked={access?.status === 'active' && access.approved_capabilities.includes(capability)} /> {capability}</label>)}</fieldset><div className="session-actions"><button data-testid={`team-access-grant-${agent.id}-${team.id}`} disabled={busyAccess === operation || agent.requested_capabilities.length === 0}>{access?.status === 'active' ? 'Update grant' : 'Grant access'}</button>{access?.status === 'active' && <button data-testid={`team-access-revoke-${agent.id}-${team.id}`} className="danger" type="button" disabled={busyAccess === operation} onClick={() => void revokeAccess(agent, team)}>Revoke</button>}</div></form>}</article>
            })}</section></details>
          </article>)}</div>}
          <LoadMoreButton collection={agentsPage} label="agents" /><LoadMoreButton collection={teamsPage} label="teams" />
        </section>

        <div className="agent-side-stack">
          <section className="surface-panel approval-inbox" aria-label="Approval inbox"><header className="surface-header"><div><p className="eyebrow">Human queue</p><h2>Approvals</h2></div><a href="/?view=inbox">Open inbox</a></header>{approvals.length === 0 ? <p className="empty">No pending approvals.</p> : approvals.map(approval => <article key={approval.id}><header><strong>{approval.action_name}</strong><span className={`risk-${approval.risk_level}`}>{approval.risk_level} risk</span></header><p>{approval.rationale_summary}</p><a href={`/agent-sessions/${approval.session_id}`}>Review session and evidence</a></article>)}<LoadMoreButton collection={approvalsPage} label="approvals" /></section>

          <section className="surface-panel" aria-label="Agent sessions"><header className="surface-header"><div><p className="eyebrow">Execution</p><h2>Sessions</h2></div></header>{sessions.length === 0 ? <p className="empty">No agent session is visible to you.</p> : <div className="session-table">{sessions.map(session => <a key={session.id} href={`/agent-sessions/${session.id}`}><div><span className={agentStateClass(session.state)}>{agentStateLabel(session.state)}</span><strong>{agentName(agents.find(agent => agent.id === session.agent_id))}</strong></div><span>Session {session.id.slice(0, 8)}</span><span>{session.work_item_id ? `Work item ${session.work_item_id.slice(0, 8)}` : 'No work item'}</span><span>Heartbeat {formatTime(session.last_heartbeat_at)}</span></a>)}</div>}<LoadMoreButton collection={sessionsPage} label="sessions" /></section>

          <section className="surface-panel diagnostics" aria-label="Agent diagnostics"><header className="surface-header"><div><p className="eyebrow">Durable state</p><h2>Diagnostics</h2></div></header><p>Health comes from server-reported session and Connection facts; realtime updates only prompt a refresh.</p><ul>{attentionSessions.map(session => <li key={session.id}><a href={`/agent-sessions/${session.id}`}>Session {session.id.slice(0, 8)}</a><span>{session.state_reason || session.error_summary || agentStateLabel(session.state)}</span></li>)}{attentionSessions.length === 0 && <li><strong>All clear</strong><span>No visible session is stale, failed, blocked, or waiting for a Human.</span></li>}</ul></section>
        </div>
      </section>
    </section>
  </AppShell>
}
