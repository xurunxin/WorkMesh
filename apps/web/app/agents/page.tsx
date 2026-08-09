'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, apiRequest, clearCsrfToken, saveCsrfToken } from '../lib/api'
import { type Agent, type AgentSession, type Approval, agentHeartbeat, agentName, agentProvider, agentStateClass, agentStateLabel, agentVersion, canManageAgentTeamAccess, formatTime, grantAgentTeamAccess, normalizeApproval, revokeAgentTeamAccess } from '../lib/agents'
import { LoadMoreButton, usePagedApiList } from '../lib/pagination'
import { type RealtimeResource, useRealtimeSubscription } from '../lib/realtime'
import { agentRegistryRefreshTargets } from '../lib/realtime-refresh'

type AuthMe = { actor: { id: string; display_name: string; workspace_id: string; workspace_role: 'admin' | 'member' }; csrfToken: string }
type Team = { id: string; name: string; key: string }
type AgentFilter = 'all' | 'active' | 'inactive'

export default function AgentsPage() {
  const [actor, setActor] = useState<AuthMe['actor'] | null>(null)
  const [filter, setFilter] = useState<AgentFilter>('all')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyAccess, setBusyAccess] = useState('')
  const agentsPage = usePagedApiList<Agent>(actor ? '/api/v1/agents' : null)
  const teamsPage = usePagedApiList<Team>(actor ? '/api/v1/teams' : null)
  const sessionsPage = usePagedApiList<AgentSession>(
    actor ? '/api/v1/agent-sessions' : null,
    { optional: true },
  )
  const approvalsPage = usePagedApiList<Approval, Approval>(
    actor ? '/api/v1/approvals?status=pending' : null,
    {
      optional: true,
      map: value => normalizeApproval(value as unknown as Record<string, unknown>),
    },
  )
  const agents = agentsPage.items
  const teams = teamsPage.items
  const sessions = sessionsPage.items
  const approvals = approvalsPage.items
  const collectionError = [
    agentsPage.error, teamsPage.error, sessionsPage.error, approvalsPage.error,
  ].find(Boolean)

  const load = useCallback(async () => {
    try {
      setError('')
      const auth = await apiRequest<AuthMe>('/api/v1/auth/me')
      saveCsrfToken(auth.csrfToken); setActor(auth.actor)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) { clearCsrfToken(); window.location.assign('/login'); return }
      setError(reason instanceof Error ? reason.message : 'Unable to load agents.')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const realtimeResources = useMemo<RealtimeResource[]>(() => [
    ...(actor
      ? [{ type: 'workspace' as const, id: actor.workspace_id }]
      : []),
    ...teams.map(team => ({ type: 'team' as const, id: team.id })),
    ...sessions.map(session => ({
      type: 'session' as const,
      id: session.id,
    })),
  ], [actor?.workspace_id, sessions, teams])
  useRealtimeSubscription(realtimeResources, invalidation => {
    const targets = agentRegistryRefreshTargets(invalidation)
    if (invalidation.reason === 'resync')
      return Promise.all([
        agentsPage.refresh(), teamsPage.refresh(),
        sessionsPage.refresh(), approvalsPage.refresh(),
      ]).then(() => undefined)
    if (targets.has('agents')) void agentsPage.refresh()
    if (targets.has('teams')) void teamsPage.refresh()
    if (targets.has('sessions')) void sessionsPage.refresh()
    if (targets.has('approvals')) void approvalsPage.refresh()
  })

  const grantAccess = async (event: FormEvent<HTMLFormElement>, agent: Agent, team: Team) => {
    event.preventDefault()
    const approvedCapabilities = new FormData(event.currentTarget).getAll('capabilities').map(String)
    if (approvedCapabilities.length === 0) { setError('Select at least one capability to grant.'); return }
    const operation = `${agent.id}:${team.id}`
    try {
      setBusyAccess(operation); setError('')
      await grantAgentTeamAccess(agent.id, team.id, approvedCapabilities)
      await agentsPage.refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update team access.') } finally { setBusyAccess('') }
  }

  const revokeAccess = async (agent: Agent, team: Team) => {
    const operation = `${agent.id}:${team.id}`
    try {
      setBusyAccess(operation); setError('')
      await revokeAgentTeamAccess(agent.id, team.id)
      await agentsPage.refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to revoke team access.') } finally { setBusyAccess('') }
  }

  const shownAgents = useMemo(() => agents.filter(agent => filter === 'all' || (filter === 'active' ? agent.is_active : !agent.is_active)), [agents, filter])
  const canManageAccess = canManageAgentTeamAccess(actor?.workspace_role)
  if (loading) return <main className="center">Loading Agent Control Center…</main>
  return <main className="agent-center"><header><div><a href="/">← WorkMesh</a><h1>Agent Control Center</h1><p>{actor?.display_name ?? 'Human operator'} · registry, live sessions, approvals and diagnostics</p></div><button onClick={() => { void load(); void agentsPage.refresh(); void teamsPage.refresh(); void sessionsPage.refresh(); void approvalsPage.refresh() }}>Refresh durable state</button></header>{(error || collectionError) && <p className="error" role="alert">{error || collectionError?.message}</p>}
    <section className="agent-center-grid"><section aria-label="Agent registry"><header><h2>Agents</h2><div className="activity-filters">{(['all', 'active', 'inactive'] as AgentFilter[]).map(value => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{value}</button>)}</div></header>{shownAgents.length === 0 ? <p className="empty">No registered agents match this filter.</p> : <div className="registry-list">{shownAgents.map(agent => <article key={agent.id} data-testid={`agent-registry-${agent.id}`}><header><div><h3>{agentName(agent)}</h3><small>{agent.slug} · {agentProvider(agent)} {agentVersion(agent)}</small></div><span className={agent.is_active ? 'registry-active' : 'registry-inactive'}>{agent.is_active ? 'active' : 'inactive'}</span></header><p>{agent.description || 'No registry description.'}</p><dl><div><dt>Requested capabilities</dt><dd>{agent.requested_capabilities.length ? agent.requested_capabilities.join(', ') : 'None requested'}</dd></div><div><dt>Definition approved</dt><dd>{agent.approved_capabilities.length ? agent.approved_capabilities.join(', ') : 'None approved'}</dd></div><div><dt>Maximum concurrency</dt><dd>{agent.max_concurrency} concurrent session{agent.max_concurrency === 1 ? '' : 's'}</dd></div><div><dt>Heartbeat</dt><dd>Every {agentHeartbeat(agent)}s</dd></div></dl><section className="team-access-list" aria-label={`${agentName(agent)} team access`}><h4>Team access</h4>{teams.length === 0 ? <p className="empty">No teams are available.</p> : teams.map(team => { const access = agent.team_access?.find(candidate => candidate.team_id === team.id); const status = access?.status ?? (access?.revoked_at ? 'revoked' : 'not granted'); const operation = `${agent.id}:${team.id}`; return <article key={team.id} data-testid={`team-access-${agent.id}-${team.id}`}><header><strong>{team.name} ({team.key})</strong><span className={status === 'active' ? 'registry-active' : 'registry-inactive'}>{status}</span></header><p>Approved: {access?.approved_capabilities.length ? access.approved_capabilities.join(', ') : 'None'}</p>{access?.revoked_at && <small>Revoked {formatTime(access.revoked_at)}</small>}{canManageAccess && <form key={`${operation}:${access?.revision ?? 0}:${status}`} onSubmit={event => void grantAccess(event, agent, team)}><fieldset disabled={busyAccess === operation || agent.requested_capabilities.length === 0}><legend>Approved capability subset</legend>{agent.requested_capabilities.map(capability => <label key={capability}><input type="checkbox" name="capabilities" value={capability} defaultChecked={access?.status === 'active' && access.approved_capabilities.includes(capability)} /> {capability}</label>)}</fieldset><div className="session-actions"><button data-testid={`team-access-grant-${agent.id}-${team.id}`} disabled={busyAccess === operation || agent.requested_capabilities.length === 0}>{access?.status === 'active' ? 'Update grant' : 'Grant access'}</button>{access?.status === 'active' && <button data-testid={`team-access-revoke-${agent.id}-${team.id}`} className="danger" type="button" disabled={busyAccess === operation} onClick={() => void revokeAccess(agent, team)}>Revoke</button>}</div></form>}</article> })}</section></article>)}</div>}</section>
      <LoadMoreButton collection={agentsPage} label="agents" /><LoadMoreButton collection={teamsPage} label="teams" />
      <section aria-label="Agent sessions"><h2>Sessions</h2>{sessions.length === 0 ? <p className="empty">No agent session is visible to you.</p> : <div className="session-table">{sessions.map(session => <a key={session.id} href={`/agent-sessions/${session.id}`}><div><span className={agentStateClass(session.state)}>{agentStateLabel(session.state)}</span><strong>{agentName(agents.find(agent => agent.id === session.agent_id))}</strong></div><span>Issue: {session.work_item_id ? session.work_item_id.slice(0, 8) : 'No issue'}</span><span>Current step: {session.current_plan_version_id ? 'Plan active' : 'Not published'}</span><span>Heartbeat: {formatTime(session.last_heartbeat_at)}</span><span>Budget: {session.budget.maxRuntimeSeconds ? `${session.budget.maxRuntimeSeconds}s` : 'Default'}</span></a>)}</div>}<LoadMoreButton collection={sessionsPage} label="sessions" /></section>
      <section className="approval-inbox" aria-label="Approval inbox"><h2>Approval inbox</h2>{approvals.length === 0 ? <p className="empty">No pending approvals.</p> : approvals.map(approval => <article key={approval.id}><strong>{approval.action_name}</strong><span className={`risk-${approval.risk_level}`}>{approval.risk_level} risk</span><p>{approval.rationale_summary}</p><a href={`/agent-sessions/${approval.session_id}`}>Review session</a></article>)}<LoadMoreButton collection={approvalsPage} label="approvals" /></section>
      <section className="diagnostics" aria-label="Agent diagnostics"><h2>Diagnostics</h2><p>Session freshness is calculated from each agent’s server-reported heartbeat interval. Webhook and ACK failures appear as <em>stale</em> session state or a state reason; this page never treats SSE as the source of truth.</p><ul>{sessions.filter(session => session.state === 'stale' || session.state === 'failed').map(session => <li key={session.id}><a href={`/agent-sessions/${session.id}`}>{session.id.slice(0, 8)}</a>: {session.state_reason || session.error_summary || session.state}</li>)}{sessions.every(session => !['stale', 'failed'].includes(session.state)) && <li>No stale or failed session reported.</li>}</ul></section>
    </section>
  </main>
}
