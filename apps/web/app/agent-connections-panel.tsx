'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Button, Dialog } from '@workmesh/ui'
import {
  type AgentConnection,
  confirmAgentConnectionRotation,
  createAgentConnection,
  formatTime,
  revokeAgentConnection,
  rotateAgentConnection,
} from './lib/agents'
import { diagnoseConnection, safeConnectionFacts } from './lib/connection-diagnostics'
import { apiRequest, publicRequest } from './lib/api'
import { buildMcpClientGuide, classifyMcpOnboardingFailure, onboardingStateMessage, probeMcpReadiness, type McpDiscovery, type McpOnboardingState, type McpReleaseInfo } from './lib/mcp-onboarding'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'

type Team = { id: string; name: string; key: string }
type Human = { id: string; display_name: string; email?: string }
type FeatureRegistry = { features: { key: string; enabled: boolean }[] }
type Props = { admin: boolean; teams: Team[]; humans: Human[]; currentHumanId: string; onError: (message: string) => void }
const capabilities = ['work:read', 'work:write', 'comment:write', 'message:write', 'plan:write']

export function AgentConnectionsPanel({ admin, teams, humans, currentHumanId, onError }: Props) {
  const connections = usePagedApiList<AgentConnection>(admin ? '/api/v1/agent-connections' : null, { limit: 50 })
  const [connection, setConnection] = useState<AgentConnection | null>(null)
  const [connectUrl, setConnectUrl] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mcpEnvironment, setMcpEnvironment] = useState<{ discovery: McpDiscovery; release: McpReleaseInfo; coordinationEnabled: boolean; mcpHealthy: boolean } | null>(null)
  const [mcpEnvironmentFailure, setMcpEnvironmentFailure] = useState<{ state: McpOnboardingState; detail: string } | null>(null)
  const [mcpEnvironmentLoading, setMcpEnvironmentLoading] = useState(false)
  const [configCopied, setConfigCopied] = useState(false)
  const sentence = useMemo(() => connectUrl
    ? `连接此 WorkMesh：打开 ${connectUrl}，按返回指令安装 MCP 与 WorkMesh Skill，并调用 verify_connection。`
    : '', [connectUrl])
  const diagnostic = connection ? diagnoseConnection(connection, {
    teamIds: teams.map(team => team.id),
    humanIds: humans.map(human => human.id),
    onboarding: mcpEnvironment ? {
      networkAvailable: true,
      discoveryAvailable: true,
      supportedClients: mcpEnvironment.discovery.supportedClients,
      coordinationFeatureEnabled: mcpEnvironment.coordinationEnabled,
      mcpAvailable: mcpEnvironment.mcpHealthy,
    } : mcpEnvironmentFailure ? {
      networkAvailable: mcpEnvironmentFailure.state !== 'network_unavailable',
      discoveryAvailable: false,
      supportedClients: [],
      coordinationFeatureEnabled: mcpEnvironmentFailure.state === 'coordination_feature_disabled' ? false : null,
      mcpAvailable: false,
    } : undefined,
  }) : null
  const facts = connection ? safeConnectionFacts(connection) : null
  const mcpGuide = useMemo(() => connection && mcpEnvironment ? buildMcpClientGuide({
    clientType: connection.client_type,
    discovery: mcpEnvironment.discovery,
    release: mcpEnvironment.release,
    coordinationFeatureEnabled: mcpEnvironment.coordinationEnabled,
    mcpHealthy: mcpEnvironment.mcpHealthy,
  }) : null, [connection, mcpEnvironment])
  const mcpState = mcpGuide ? onboardingStateMessage(mcpGuide.state) : null
  const mcpFailureState = mcpEnvironmentFailure ? onboardingStateMessage(mcpEnvironmentFailure.state) : null

  useEffect(() => {
    if (!admin || connections.loading || connections.error) return
    const storedId = sessionStorage.getItem('workmesh.last-agent-connection-id')
    const selected = connections.items.find(item => item.id === connection?.id)
      ?? connections.items.find(item => item.id === storedId)
      ?? connections.items[0]
      ?? null
    setConnection(selected)
    if (selected) sessionStorage.setItem('workmesh.last-agent-connection-id', selected.id)
    else sessionStorage.removeItem('workmesh.last-agent-connection-id')
  }, [admin, connection?.id, connections.error, connections.items, connections.loading])

  useEffect(() => {
    if (!admin) return
    const controller = new AbortController()
    setMcpEnvironmentLoading(true)
    void Promise.all([
      publicRequest<McpDiscovery>('/.well-known/workmesh-agent', { signal: controller.signal }),
      publicRequest<McpReleaseInfo>('/api/v1/info', { signal: controller.signal }),
      apiRequest<FeatureRegistry>('/api/v1/features', { signal: controller.signal }),
    ]).then(async ([discovery, release, registry]) => {
      const mcpHealthy = await probeMcpReadiness(discovery.mcpUrl, controller.signal)
      if (controller.signal.aborted) return
      setMcpEnvironment({ discovery, release, coordinationEnabled: registry.features.some(feature => feature.key === 'WORKMESH_BETA_COORDINATION_MCP' && feature.enabled), mcpHealthy })
      setMcpEnvironmentFailure(null)
    }).catch(reason => {
      if (!controller.signal.aborted) setMcpEnvironmentFailure({
        state: classifyMcpOnboardingFailure(reason),
        detail: reason instanceof Error ? reason.message : 'MCP environment discovery failed.',
      })
    }).finally(() => {
      if (!controller.signal.aborted) setMcpEnvironmentLoading(false)
    })
    return () => controller.abort()
  }, [admin])

  const run = async (operation: () => Promise<void>) => {
    try { setBusy(true); onError(''); await operation() }
    catch (reason) { onError(reason instanceof Error ? reason.message : 'Agent Connection operation failed.') }
    finally { setBusy(false) }
  }

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    void run(async () => {
      const grantAgentDelegate = values.get('agentDelegate') === 'on'
      const requestedCapabilities = [...capabilities, ...(grantAgentDelegate ? ['agent:delegate'] : [])]
      const result = await createAgentConnection({
        name: String(values.get('name')),
        agentSlug: String(values.get('slug')),
        clientType: String(values.get('client')) as AgentConnection['client_type'],
        teamId: String(values.get('team')),
        principalHumanActorId: String(values.get('principal')),
        requestedCapabilities,
        grantAgentDelegate,
        notes: String(values.get('notes') || '') || undefined,
      })
      setConnection(result.connection)
      setConnectUrl(result.connect_url)
      setCreateOpen(false)
      sessionStorage.setItem('workmesh.last-agent-connection-id', result.connection.id)
      await connections.refresh()
    })
  }

  const selectConnection = (selected: AgentConnection) => {
    setConnection(selected)
    setConnectUrl('')
    sessionStorage.setItem('workmesh.last-agent-connection-id', selected.id)
  }

  return <section className="connection-panel" aria-label="Agent Connections">
    <header className="surface-header">
      <div><p className="eyebrow">Agent access</p><h2>Connections</h2><p>Scoped MCP identities with visible Human ownership and revocable Team authority.</p></div>
      {admin && <div className="page-actions"><Button disabled={connections.loading} onClick={() => void connections.refresh()}>Refresh Connections</Button><Button variant="primary" onClick={() => setCreateOpen(true)}>New connection</Button></div>}
    </header>

    {!admin && <p className="empty">Workspace Admin access is required to create or rotate Connections.</p>}
    {admin && connections.error && <div className="connection-load-error" role="alert"><strong>Unable to load Connections.</strong><p>Existing Connections may still be active. Retry before creating a replacement.</p><Button onClick={() => void connections.refresh()}>Retry</Button></div>}
    {admin && connections.loading && !connection && <p role="status">Loading Connections…</p>}
    {admin && !connections.loading && !connections.error && connections.items.length === 0 && <div className="connection-empty"><strong>No Connections yet</strong><p>Create a Connection to see safe lifecycle diagnostics here. Credentials are never rendered in this dashboard.</p></div>}
    {admin && connections.items.length > 0 && <><div className="connection-list" aria-label="Existing Connections">{connections.items.map(item => <button type="button" key={item.id} className={item.id === connection?.id ? 'selected' : ''} aria-pressed={item.id === connection?.id} onClick={() => selectConnection(item)}><span><strong>{item.name}</strong><small>{item.agent_slug} · {teams.find(team => team.id === item.team_id)?.name ?? 'Unavailable Team'}</small></span><span className={`connection-status connection-status-${item.status}`}>{item.status}</span></button>)}</div><LoadMoreButton collection={connections} label="Connections" /></>}

    {connection && diagnostic && facts && <article className="connection-overview" data-testid="connection-diagnostic">
      <header><div><p className="eyebrow">{connection.client_type.replaceAll('_', ' ')}</p><h3>{connection.name}</h3><p>{connection.agent_slug}</p></div><span className={`health-pill health-${diagnostic.tone}`}>{diagnostic.label}</span></header>
      <section className={`diagnostic-callout diagnostic-${diagnostic.tone}`} aria-label="Connection diagnosis">
        <strong>{diagnostic.summary}</strong><p>{diagnostic.nextAction}</p>
      </section>
      <dl className="connection-facts">
        <div><dt>Team scope</dt><dd>{teams.find(team => team.id === facts.teamId)?.name ?? 'Unavailable'}</dd></div>
        <div><dt>Principal Human</dt><dd>{humans.find(human => human.id === facts.principalHumanActorId)?.display_name ?? 'Unavailable'}</dd></div>
        <div><dt>Credential</dt><dd>{facts.credential}</dd></div>
        <div><dt>Last used</dt><dd>{formatTime(facts.lastUsedAt)}</dd></div>
        <div><dt>Capabilities</dt><dd>{connection.granted_capabilities.join(', ') || 'None granted'}</dd></div>
        <div><dt>Skill</dt><dd>{connection.skill_version ?? 'Pending'}{connection.skill_sha256 ? ` · ${connection.skill_sha256.slice(0, 12)}…` : ''}</dd></div>
      </dl>
      <p className="secret-safety"><strong>Credential safety:</strong> session and installation tokens stay server-side. This screen exposes only a non-secret fingerprint for support and audit.</p>
      <div className="session-actions">
        {connection.status === 'active' && <Button disabled={busy} onClick={() => void run(async () => { const result = await rotateAgentConnection(connection); setConnection(result.connection); setConnectUrl(result.connect_url); await connections.refresh() })}>Rotate credential</Button>}
        {connection.status === 'rotating' && <Button disabled={busy} onClick={() => void run(async () => { setConnection(await confirmAgentConnectionRotation(connection)); await connections.refresh() })}>Confirm verified rotation</Button>}
        {connection.status !== 'revoked' && <Button variant="danger" disabled={busy} onClick={() => void run(async () => { await revokeAgentConnection(connection); setConnection({ ...connection, status: 'revoked', revoked_at: new Date().toISOString(), revision: connection.revision + 1 }); setConnectUrl(''); await connections.refresh() })}>Revoke connection</Button>}
      </div>
    </article>}

    {connection && <article className="connection-overview mcp-onboarding-overview" data-testid="mcp-onboarding-diagnostic">
      <header><div><p className="eyebrow">MCP onboarding</p><h3>Configuration and live checks</h3><p>Server-derived setup facts for {connection.client_type.replaceAll('_', ' ')}. No bearer or installation credential is rendered.</p></div>{mcpEnvironmentLoading && <span className="health-pill health-neutral">Loading</span>}</header>
      {mcpFailureState && mcpEnvironmentFailure && <section className={`diagnostic-callout diagnostic-${mcpFailureState.tone}`} data-onboarding-state={mcpEnvironmentFailure.state} role="alert"><strong>{mcpFailureState.label}</strong><p>{mcpFailureState.summary}</p><p>{mcpFailureState.nextAction}</p><small>{mcpEnvironmentFailure.detail}</small></section>}
      {mcpGuide && mcpState && <>
        <section className={`diagnostic-callout diagnostic-${mcpState.tone}`} data-onboarding-state={mcpGuide.state} aria-label="MCP onboarding state"><strong>{mcpState.label}</strong><p>{mcpState.summary}</p><p>{mcpState.nextAction}</p></section>
        <dl className="connection-facts">
          <div><dt>MCP endpoint</dt><dd className="break-value">{mcpGuide.mcpUrl}</dd></div>
          <div><dt>Discovery</dt><dd className="break-value">{mcpGuide.discoveryUrl}</dd></div>
          <div><dt>Transport</dt><dd>{mcpGuide.transport}</dd></div>
          <div><dt>Client Profile</dt><dd>{mcpGuide.profileVersion}</dd></div>
          <div><dt>Auth readiness</dt><dd>{connection.status === 'active' ? 'Installation credential active' : connection.status === 'pending' ? 'Awaiting pairing' : connection.status}</dd></div>
          <div><dt>Capability summary</dt><dd>{connection.granted_capabilities.join(', ') || 'None granted'}</dd></div>
          <div><dt>Skill selector</dt><dd>{mcpGuide.skill.version} · {mcpGuide.skill.sha256.slice(0, 19)}…</dd></div>
        </dl>
        <details className="config-details"><summary>Secret-safe {mcpGuide.configFile}</summary><pre className="config-preview"><code>{mcpGuide.config}</code></pre>{mcpGuide.localStdioFallback && <p><strong>Local stdio fallback:</strong> {mcpGuide.localStdioFallback}</p>}<Button type="button" onClick={() => void navigator.clipboard.writeText(mcpGuide.config).then(() => { setConfigCopied(true); window.setTimeout(() => setConfigCopied(false), 1800) })}>{configCopied ? 'Copied' : 'Copy config'}</Button></details>
        <ol className="bootstrap-checklist" aria-label="Agent bootstrap checklist">{mcpGuide.bootstrapChecks.map(check => <li key={check}>{check}</li>)}</ol>
      </>}
    </article>}

    {sentence && <article className="connection-instruction"><header><div><p className="eyebrow">One-time setup</p><h3>Connection sentence</h3></div><Button type="button" onClick={() => void navigator.clipboard.writeText(sentence)}>Copy instruction</Button></header><p>{sentence}</p><small>Expires in ten minutes. This pairing URL is not a session token and is shown only in this browser session.</small></article>}

    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New Agent Connection">
      <form onSubmit={create} className="agent-connection-form">
        <label>Client<select name="client" defaultValue="codex"><option value="codex">Codex</option><option value="opencode">OpenCode</option><option value="pi">pi</option><option value="generic_mcp">Generic MCP</option></select></label>
        <label>Agent name<input name="name" required maxLength={120} placeholder="Planning coordinator" /></label>
        <label>Agent slug<input name="slug" required pattern="[a-z0-9][a-z0-9-]{0,79}" placeholder="planning-coordinator" /></label>
        <label>Team<select name="team" required>{teams.map(team => <option key={team.id} value={team.id}>{team.name} ({team.key})</option>)}</select></label>
        <label>Principal Human<select name="principal" defaultValue={currentHumanId}>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}{human.email ? ` · ${human.email}` : ''}</option>)}</select></label>
        <label className="checkbox-field"><input type="checkbox" name="agentDelegate" /> Allow this coordinator to start approved Agents</label>
        <label className="full-field">Notes<textarea name="notes" maxLength={2000} /></label>
        <footer><Button type="button" onClick={() => setCreateOpen(false)}>Cancel</Button><Button variant="primary" disabled={busy || teams.length === 0}>Generate connection sentence</Button></footer>
      </form>
    </Dialog>
  </section>
}
