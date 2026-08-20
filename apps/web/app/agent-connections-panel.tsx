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
import { buildAgentConnectionInstruction, buildMcpClientGuide, classifyMcpOnboardingFailure, onboardingStateMessage, probeMcpReadiness, type McpDiscovery, type McpOnboardingState, type McpReleaseInfo } from './lib/mcp-onboarding'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { useLocale } from './lib/i18n'

type Team = { id: string; name: string; key: string }
type Human = { id: string; display_name: string; email?: string }
type FeatureRegistry = { features: { key: string; enabled: boolean }[] }
type Props = { admin: boolean; teams: Team[]; humans: Human[]; currentHumanId: string; onError: (message: string) => void }
const capabilities = ['work:read', 'work:write', 'comment:write', 'message:write', 'plan:write']

export function AgentConnectionsPanel({ admin, teams, humans, currentHumanId, onError }: Props) {
  const { agentsCopy: text } = useLocale()
  const connections = usePagedApiList<AgentConnection>(admin ? '/api/v1/agent-connections' : null, { limit: 50 })
  const [connection, setConnection] = useState<AgentConnection | null>(null)
  const [connectUrl, setConnectUrl] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mcpEnvironment, setMcpEnvironment] = useState<{ discovery: McpDiscovery; release: McpReleaseInfo; coordinationEnabled: boolean; mcpHealthy: boolean } | null>(null)
  const [mcpEnvironmentFailure, setMcpEnvironmentFailure] = useState<{ state: McpOnboardingState; detail: string } | null>(null)
  const [mcpEnvironmentLoading, setMcpEnvironmentLoading] = useState(false)
  const [configCopied, setConfigCopied] = useState(false)
  const instruction = useMemo(() => connectUrl && connection
    ? buildAgentConnectionInstruction({ connectUrl, agentSlug: connection.agent_slug, clientType: connection.client_type })
    : '', [connectUrl, connection])
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

  return <section className="connection-panel" aria-label={text.connectionsTitle}>
    <header className="surface-header">
      <div><p className="eyebrow">{text.connectionsEyebrow}</p><h2>{text.connectionsTitle}</h2><p>{text.connectionsIntro}</p></div>
      {admin && <div className="page-actions"><Button disabled={connections.loading} onClick={() => void connections.refresh()}>{text.refreshConnections}</Button><Button variant="primary" onClick={() => setCreateOpen(true)}>{text.newConnection}</Button></div>}
    </header>

    {!admin && <p className="empty">{text.adminRequiredHint}</p>}
    {admin && connections.error && <div className="connection-load-error" role="alert"><strong>{text.unableToLoadConnections}</strong><p>{text.retryLoadHint}</p><Button onClick={() => void connections.refresh()}>{text.retry}</Button></div>}
    {admin && connections.loading && !connection && <p role="status">{text.loadingConnections}</p>}
    {admin && !connections.loading && !connections.error && connections.items.length === 0 && <div className="connection-empty"><strong>{text.noConnectionsTitle}</strong><p>{text.noConnectionsHint}</p></div>}
    {admin && connections.items.length > 0 && <><div className="connection-list" aria-label={text.existingConnections}>{connections.items.map(item => { const statusKey = `connectionStatus${item.status[0]!.toUpperCase()}${item.status.slice(1)}` as keyof typeof text; const statusLabel = typeof text[statusKey] === 'string' ? (text[statusKey] as string) : item.status; return <button type="button" key={item.id} className={item.id === connection?.id ? 'selected' : ''} aria-pressed={item.id === connection?.id} onClick={() => selectConnection(item)}><span><strong>{item.name}</strong><small>{item.agent_slug} · {teams.find(team => team.id === item.team_id)?.name ?? text.unavailableTeam}</small></span><span className={`connection-status connection-status-${item.status}`}>{statusLabel}</span></button>; })}</div><LoadMoreButton collection={connections} label={text.connectionsTitle} /></>}

    {connection && diagnostic && facts && <article className="connection-overview" data-testid="connection-diagnostic">
      <header><div><p className="eyebrow">{connection.client_type.replaceAll('_', ' ')}</p><h3>{connection.name}</h3><p>{connection.agent_slug}</p></div><span className={`health-pill health-${diagnostic.tone}`}>{diagnostic.label}</span></header>
      <section className={`diagnostic-callout diagnostic-${diagnostic.tone}`} aria-label={text.connectionsTitle}>
        <strong>{diagnostic.summary}</strong><p>{diagnostic.nextAction}</p>
      </section>
      <dl className="connection-facts">
        <div><dt>{text.teamScope}</dt><dd>{teams.find(team => team.id === facts.teamId)?.name ?? text.unavailable}</dd></div>
        <div><dt>{text.principalHuman}</dt><dd>{humans.find(human => human.id === facts.principalHumanActorId)?.display_name ?? text.unavailable}</dd></div>
        <div><dt>{text.credential}</dt><dd>{facts.credential}</dd></div>
        <div><dt>{text.lastUsed}</dt><dd>{formatTime(facts.lastUsedAt)}</dd></div>
        <div><dt>{text.capabilities}</dt><dd>{connection.granted_capabilities.join(', ') || text.noCapabilities}</dd></div>
        <div><dt>{text.skill}</dt><dd>{connection.skill_version ?? text.credentialPending}{connection.skill_sha256 ? ` · ${connection.skill_sha256.slice(0, 12)}…` : ''}</dd></div>
      </dl>
      <p className="secret-safety"><strong>{text.credentialSafety}</strong></p>
      <div className="session-actions">
        {connection.status === 'active' && <Button disabled={busy} onClick={() => void run(async () => { const result = await rotateAgentConnection(connection); setConnection(result.connection); setConnectUrl(result.connect_url); await connections.refresh() })}>{text.rotateCredential}</Button>}
        {connection.status === 'rotating' && <Button disabled={busy} onClick={() => void run(async () => { setConnection(await confirmAgentConnectionRotation(connection)); await connections.refresh() })}>{text.confirmRotation}</Button>}
        {connection.status !== 'revoked' && <Button variant="danger" disabled={busy} onClick={() => void run(async () => { await revokeAgentConnection(connection); setConnection({ ...connection, status: 'revoked', revoked_at: new Date().toISOString(), revision: connection.revision + 1 }); setConnectUrl(''); await connections.refresh() })}>{text.revokeConnection}</Button>}
      </div>
    </article>}

    {connection && <article className="connection-overview mcp-onboarding-overview" data-testid="mcp-onboarding-diagnostic">
      <header><div><p className="eyebrow">{text.mcpOnboardingEyebrow}</p><h3>{text.mcpOnboardingTitle}</h3><p>{text.mcpOnboardingIntro(connection.client_type.replaceAll('_', ' '))}</p></div>{mcpEnvironmentLoading && <span className="health-pill health-neutral">{text.mcpLoading}</span>}</header>
      {mcpFailureState && mcpEnvironmentFailure && <section className={`diagnostic-callout diagnostic-${mcpFailureState.tone}`} data-onboarding-state={mcpEnvironmentFailure.state} role="alert"><strong>{mcpFailureState.label}</strong><p>{mcpFailureState.summary}</p><p>{mcpFailureState.nextAction}</p><small>{mcpEnvironmentFailure.detail}</small></section>}
      {mcpGuide && mcpState && <>
        <section className={`diagnostic-callout diagnostic-${mcpState.tone}`} data-onboarding-state={mcpGuide.state} aria-label={text.mcpOnboardingTitle}><strong>{mcpState.label}</strong><p>{mcpState.summary}</p><p>{mcpState.nextAction}</p></section>
        <dl className="connection-facts">
          <div><dt>{text.mcpEndpoint}</dt><dd className="break-value">{mcpGuide.mcpUrl}</dd></div>
          <div><dt>{text.mcpDiscovery}</dt><dd className="break-value">{mcpGuide.discoveryUrl}</dd></div>
          <div><dt>{text.mcpTransport}</dt><dd>{mcpGuide.transport}</dd></div>
          <div><dt>{text.mcpProfile}</dt><dd>{mcpGuide.profileVersion}</dd></div>
          <div><dt>{text.mcpAuthReadiness}</dt><dd>{connection.status === 'active' ? text.mcpAuthActive : connection.status === 'pending' ? text.mcpAuthPending : connection.status}</dd></div>
          <div><dt>{text.mcpCapabilitySummary}</dt><dd>{connection.granted_capabilities.join(', ') || text.noCapabilities}</dd></div>
          <div><dt>{text.mcpSkillSelector}</dt><dd>{mcpGuide.skill.version} · {mcpGuide.skill.sha256.slice(0, 19)}…</dd></div>
        </dl>
        <details className="config-details"><summary>{text.secretSafeConfig(mcpGuide.configFile)}</summary><pre className="config-preview"><code>{mcpGuide.config}</code></pre>{mcpGuide.localStdioFallback && <p><strong>{text.localStdioFallback}</strong> {mcpGuide.localStdioFallback}</p>}<Button type="button" onClick={() => void navigator.clipboard.writeText(mcpGuide.config).then(() => { setConfigCopied(true); window.setTimeout(() => setConfigCopied(false), 1800) })}>{configCopied ? text.configCopied : text.copyConfig}</Button></details>
        <ol className="bootstrap-checklist" aria-label={text.bootstrapChecklist}>{mcpGuide.bootstrapChecks.map(check => <li key={check}>{check}</li>)}</ol>
      </>}
    </article>}

    {instruction && <article className="connection-instruction"><header><div><p className="eyebrow">{text.handoffEyebrow}</p><h3>{text.handoffTitle}</h3><p>{text.handoffIntro}</p></div><Button type="button" onClick={() => void navigator.clipboard.writeText(instruction)}>{text.copyFullInstructions}</Button></header><pre className="agent-connection-instruction"><code>{instruction}</code></pre><small>{text.handoffExpiryNote}</small></article>}

    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={text.newConnectionTitle}>
      <form onSubmit={create} className="agent-connection-form">
        <label>{text.fieldClient}<select name="client" defaultValue="codex"><option value="codex">Codex</option><option value="opencode">OpenCode</option><option value="pi">pi</option><option value="generic_mcp">Generic MCP</option></select></label>
        <label>{text.fieldAgentName}<input name="name" required maxLength={120} placeholder="Planning coordinator" /></label>
        <label>{text.fieldAgentSlug}<input name="slug" required pattern="[a-z0-9][a-z0-9-]{0,79}" placeholder="planning-coordinator" /></label>
        <label>{text.fieldTeam}<select name="team" required>{teams.map(team => <option key={team.id} value={team.id}>{team.name} ({team.key})</option>)}</select></label>
        <label>{text.fieldPrincipal}<select name="principal" defaultValue={currentHumanId}>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}{human.email ? ` · ${human.email}` : ''}</option>)}</select></label>
        <label className="checkbox-field"><input type="checkbox" name="agentDelegate" /> {text.fieldAgentDelegate}</label>
        <label className="full-field">{text.fieldNotes}<textarea name="notes" maxLength={2000} /></label>
        <footer><Button type="button" onClick={() => setCreateOpen(false)}>{text.cancel}</Button><Button variant="primary" disabled={busy || teams.length === 0}>{text.generateConnection}</Button></footer>
      </form>
    </Dialog>
  </section>
}
