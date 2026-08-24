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
import { isCollectionAuthorityRevoked } from './lib/collection-authority'
import { buildAgentConnectionInstruction, buildMcpClientGuide, classifyMcpOnboardingFailure, mcpClientFacts, mcpClientTypes, onboardingStateMessage, probeMcpReadiness, type McpDiscovery, type McpOnboardingState, type McpReleaseInfo } from './lib/mcp-onboarding'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { SkeletonList } from './lib/skeleton-list'
import { useLocale } from './lib/i18n'
import { useAuthorityLifetime } from './lib/use-authority-lifetime'

type Team = { id: string; name: string; key: string }
type Human = { id: string; display_name: string; email?: string }
type FeatureRegistry = { features: { key: string; enabled: boolean }[] }
type Props = {
  admin: boolean
  authorityKey: string
  contextError: Error | null
  contextInitialized: boolean
  contextLoading: boolean
  teams: Team[]
  humans: Human[]
  currentHumanId: string
  onError: (message: string) => void
  onRefreshContext: () => void | Promise<void>
}
const capabilities = ['work:read', 'work:write', 'comment:write', 'message:write', 'plan:write']

export function AgentConnectionsPanel(props: Props) {
  return <AgentConnectionsPanelScope key={props.authorityKey} {...props} />
}

function AgentConnectionsPanelScope({ admin, authorityKey, contextError, contextInitialized, contextLoading, teams, humans, currentHumanId, onError, onRefreshContext }: Props) {
  const { agentsCopy: text, connectCopy: copy, t } = useLocale()
  const isAuthorityCurrent = useAuthorityLifetime()
  const connections = usePagedApiList<AgentConnection>(admin ? '/api/v1/agent-connections' : null, { limit: 50, scopeKey: authorityKey })
  const [connection, setConnection] = useState<AgentConnection | null>(null)
  const [pendingCreatedConnectionId, setPendingCreatedConnectionId] = useState<string | null>(null)
  const [pendingCreatedAuthorityKey, setPendingCreatedAuthorityKey] = useState<string | null>(null)
  const [connectUrl, setConnectUrl] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mcpEnvironment, setMcpEnvironment] = useState<{ discovery: McpDiscovery; release: McpReleaseInfo; coordinationEnabled: boolean; mcpHealthy: boolean } | null>(null)
  const [mcpEnvironmentFailure, setMcpEnvironmentFailure] = useState<McpOnboardingState | null>(null)
  const [mcpEnvironmentLoading, setMcpEnvironmentLoading] = useState(false)
  const [configCopied, setConfigCopied] = useState(false)
  const authorityForbidden = isCollectionAuthorityRevoked(connections.error)
    || isCollectionAuthorityRevoked(contextError)
  const panelInitialized = connections.initialized && contextInitialized && !authorityForbidden
  const listedConnection = panelInitialized
    ? connections.items.find(item => item.id === connection?.id) ?? null
    : null
  const committedConnection = listedConnection && connection?.id === listedConnection.id && connection.revision >= listedConnection.revision
    ? connection
    : listedConnection
  const authoritativeConnection = committedConnection
    ?? (panelInitialized
      && pendingCreatedAuthorityKey === authorityKey
      && pendingCreatedConnectionId === connection?.id
      && teams.some(team => team.id === connection.team_id)
      && humans.some(human => human.id === connection.principal_human_actor_id)
      ? connection
      : null)
  const instruction = useMemo(() => connectUrl && authoritativeConnection
    ? buildAgentConnectionInstruction({ connectUrl, agentSlug: authoritativeConnection.agent_slug, clientType: authoritativeConnection.client_type })
    : '', [authoritativeConnection, connectUrl])
  const diagnostic = authoritativeConnection ? diagnoseConnection(authoritativeConnection, {
    teamIds: teams.map(team => team.id),
    humanIds: humans.map(human => human.id),
    onboarding: mcpEnvironment ? {
      networkAvailable: true,
      discoveryAvailable: true,
      supportedClients: mcpEnvironment.discovery.supportedClients,
      coordinationFeatureEnabled: mcpEnvironment.coordinationEnabled,
      mcpAvailable: mcpEnvironment.mcpHealthy,
    } : mcpEnvironmentFailure ? {
      networkAvailable: mcpEnvironmentFailure !== 'network_unavailable',
      discoveryAvailable: false,
      supportedClients: [],
      coordinationFeatureEnabled: mcpEnvironmentFailure === 'coordination_feature_disabled' ? false : null,
      mcpAvailable: false,
    } : undefined,
  }) : null
  const facts = authoritativeConnection ? safeConnectionFacts(authoritativeConnection) : null
  const mcpGuide = useMemo(() => authoritativeConnection && mcpEnvironment ? buildMcpClientGuide({
    clientType: authoritativeConnection.client_type,
    discovery: mcpEnvironment.discovery,
    release: mcpEnvironment.release,
    coordinationFeatureEnabled: mcpEnvironment.coordinationEnabled,
    mcpHealthy: mcpEnvironment.mcpHealthy,
  }, copy) : null, [authoritativeConnection, copy, mcpEnvironment])
  const mcpState = mcpGuide ? onboardingStateMessage(mcpGuide.state, copy) : null
  const mcpFailureState = mcpEnvironmentFailure ? onboardingStateMessage(mcpEnvironmentFailure, copy) : null

  useEffect(() => {
    if (!admin || authorityForbidden || (pendingCreatedAuthorityKey && pendingCreatedAuthorityKey !== authorityKey)) {
      setConnection(null)
      setConnectUrl('')
      setCreateOpen(false)
      setPendingCreatedConnectionId(null)
      setPendingCreatedAuthorityKey(null)
      return
    }
    if (!panelInitialized || connections.error || contextError) return
    const createdConnection = pendingCreatedConnectionId
      ? connections.items.find(item => item.id === pendingCreatedConnectionId)
      : undefined
    if (pendingCreatedConnectionId && !createdConnection) {
      if (connections.loading) return
      setPendingCreatedConnectionId(null)
      setPendingCreatedAuthorityKey(null)
    } else if (createdConnection) {
      setPendingCreatedConnectionId(null)
      setPendingCreatedAuthorityKey(null)
    }
    const storedId = sessionStorage.getItem('workmesh.last-agent-connection-id')
    const selected = connections.items.find(item => item.id === connection?.id)
      ?? connections.items.find(item => item.id === storedId)
      ?? connections.items[0]
      ?? null
    setConnection(current => selected && current?.id === selected.id && current.revision >= selected.revision
      ? current
      : selected)
    if (selected) sessionStorage.setItem('workmesh.last-agent-connection-id', selected.id)
    else sessionStorage.removeItem('workmesh.last-agent-connection-id')
  }, [admin, authorityForbidden, authorityKey, connection?.id, connections.error, connections.items, connections.loading, contextError, panelInitialized, pendingCreatedAuthorityKey, pendingCreatedConnectionId])

  useEffect(() => {
    if (!admin) return
    const controller = new AbortController()
    setMcpEnvironmentLoading(true)
    void Promise.all([
      publicRequest<McpDiscovery>('/.well-known/workmesh-agent', { signal: controller.signal }),
      publicRequest<McpReleaseInfo>('/api/v1/info', { signal: controller.signal }),
      apiRequest<FeatureRegistry>('/api/v1/features', { signal: controller.signal }),
    ]).then(async ([discovery, release, registry]) => {
      if (!isAuthorityCurrent() || controller.signal.aborted) return
      const mcpHealthy = await probeMcpReadiness(discovery.mcpUrl, controller.signal)
      if (!isAuthorityCurrent() || controller.signal.aborted) return
      setMcpEnvironment({ discovery, release, coordinationEnabled: registry.features.some(feature => feature.key === 'WORKMESH_BETA_COORDINATION_MCP' && feature.enabled), mcpHealthy })
      setMcpEnvironmentFailure(null)
    }).catch(reason => {
      if (isAuthorityCurrent() && !controller.signal.aborted) setMcpEnvironmentFailure(classifyMcpOnboardingFailure(reason))
    }).finally(() => {
      if (isAuthorityCurrent() && !controller.signal.aborted) setMcpEnvironmentLoading(false)
    })
    return () => controller.abort()
  }, [admin, isAuthorityCurrent])

  const run = async (operation: () => Promise<void>) => {
    try {
      setBusy(true)
      onError('')
      await operation()
    } catch (reason) {
      if (isAuthorityCurrent()) onError(reason instanceof Error ? reason.message : 'Agent Connection operation failed.')
    } finally {
      if (isAuthorityCurrent()) setBusy(false)
    }
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
      if (!isAuthorityCurrent()) return
      setConnection(result.connection)
      setPendingCreatedConnectionId(result.connection.id)
      setPendingCreatedAuthorityKey(authorityKey)
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

  const refreshPanel = () => {
    void connections.refresh()
    void onRefreshContext()
  }

  return <section aria-busy={admin && panelInitialized && (connections.loading || contextLoading) || undefined} className="connection-panel" aria-label={text.connectionsTitle}>
    <header className="surface-header">
      <div><p className="eyebrow">{text.connectionsEyebrow}</p><h2>{text.connectionsTitle}</h2><p>{text.connectionsIntro}</p></div>
      {admin && <div className="page-actions"><Button disabled={connections.loading || contextLoading} onClick={refreshPanel}>{text.refreshConnections}</Button><Button variant="primary" onClick={() => setCreateOpen(true)}>{text.newConnection}</Button></div>}
    </header>

    {!admin && <p className="empty">{text.adminRequiredHint}</p>}
    {admin && (connections.error || contextError) && <div className="connection-load-error" role="alert"><strong>{text.unableToLoadConnections}</strong><p>{text.retryLoadHint}</p><Button onClick={refreshPanel}>{text.retry}</Button></div>}
    {admin && !panelInitialized && !connections.error && !contextError && <div className="agent-connections-loading"><SkeletonList columns={4} items={4} label={text.loadingConnections} /></div>}
    {admin && panelInitialized && connections.items.length === 0 && <div className="connection-empty"><strong>{text.noConnectionsTitle}</strong><p>{text.noConnectionsHint}</p></div>}
    {admin && panelInitialized && connections.items.length > 0 && <><div className="connection-list" aria-label={text.existingConnections}>{connections.items.map(item => { const statusKey = `connectionStatus${item.status[0]!.toUpperCase()}${item.status.slice(1)}` as keyof typeof text; const statusLabel = typeof text[statusKey] === 'string' ? (text[statusKey] as string) : item.status; return <button type="button" key={item.id} className={item.id === authoritativeConnection?.id ? 'selected' : ''} aria-pressed={item.id === authoritativeConnection?.id} onClick={() => selectConnection(item)}><span><strong>{item.name}</strong><small>{item.agent_slug} · {teams.find(team => team.id === item.team_id)?.name ?? text.unavailableTeam}</small></span><span className={`connection-status connection-status-${item.status}`}>{statusLabel}</span></button>; })}</div><LoadMoreButton collection={connections} label={text.connectionsTitle} /></>}

    {admin && authoritativeConnection && diagnostic && facts && <article className="connection-overview" data-testid="connection-diagnostic">
      <header><div><p className="eyebrow">{mcpClientFacts(authoritativeConnection.client_type).label}</p><h3>{authoritativeConnection.name}</h3><p>{authoritativeConnection.agent_slug}</p></div><span className={`health-pill health-${diagnostic.tone}`}>{diagnostic.label}</span></header>
      <section className={`diagnostic-callout diagnostic-${diagnostic.tone}`} aria-label={text.connectionsTitle}>
        <strong>{diagnostic.summary}</strong><p>{diagnostic.nextAction}</p>
      </section>
      <dl className="connection-facts">
        <div><dt>{text.teamScope}</dt><dd>{teams.find(team => team.id === facts.teamId)?.name ?? text.unavailable}</dd></div>
        <div><dt>{text.principalHuman}</dt><dd>{humans.find(human => human.id === facts.principalHumanActorId)?.display_name ?? text.unavailable}</dd></div>
        <div><dt>{text.credential}</dt><dd>{facts.credential}</dd></div>
        <div><dt>{text.lastUsed}</dt><dd>{formatTime(facts.lastUsedAt)}</dd></div>
        <div><dt>{text.capabilities}</dt><dd>{authoritativeConnection.granted_capabilities.join(', ') || text.noCapabilities}</dd></div>
        <div><dt>{text.skill}</dt><dd>{authoritativeConnection.skill_version ?? text.credentialPending}{authoritativeConnection.skill_sha256 ? ` · ${authoritativeConnection.skill_sha256.slice(0, 12)}…` : ''}</dd></div>
      </dl>
      <p className="secret-safety"><strong>{text.credentialSafety}</strong></p>
      <div className="session-actions">
        {authoritativeConnection.status === 'active' && <Button disabled={busy} onClick={() => void run(async () => {
          const result = await rotateAgentConnection(authoritativeConnection)
          if (!isAuthorityCurrent()) return
          setConnection(result.connection)
          setConnectUrl(result.connect_url)
          await connections.refresh()
        })}>{text.rotateCredential}</Button>}
        {authoritativeConnection.status === 'rotating' && <Button disabled={busy} onClick={() => void run(async () => {
          const result = await confirmAgentConnectionRotation(authoritativeConnection)
          if (!isAuthorityCurrent()) return
          setConnection(result)
          await connections.refresh()
        })}>{text.confirmRotation}</Button>}
        {authoritativeConnection.status !== 'revoked' && <Button variant="danger" disabled={busy} onClick={() => void run(async () => {
          await revokeAgentConnection(authoritativeConnection)
          if (!isAuthorityCurrent()) return
          setConnection({ ...authoritativeConnection, status: 'revoked', revoked_at: new Date().toISOString(), revision: authoritativeConnection.revision + 1 })
          setConnectUrl('')
          await connections.refresh()
        })}>{text.revokeConnection}</Button>}
      </div>
    </article>}

    {admin && authoritativeConnection && <article className="connection-overview mcp-onboarding-overview" data-testid="mcp-onboarding-diagnostic">
      <header><div><p className="eyebrow">{text.mcpOnboardingEyebrow}</p><h3>{text.mcpOnboardingTitle}</h3><p>{text.mcpOnboardingIntro(mcpClientFacts(authoritativeConnection.client_type).label)}</p></div>{mcpEnvironmentLoading && <span className="health-pill health-neutral">{text.mcpLoading}</span>}</header>
      {mcpFailureState && mcpEnvironmentFailure && <section className={`diagnostic-callout diagnostic-${mcpFailureState.tone}`} data-onboarding-state={mcpEnvironmentFailure} role="alert"><strong>{mcpFailureState.label}</strong><p>{mcpFailureState.summary}</p><p>{mcpFailureState.nextAction}</p></section>}
      {mcpGuide && mcpState && <>
        <section className={`diagnostic-callout diagnostic-${mcpState.tone}`} data-onboarding-state={mcpGuide.state} aria-label={text.mcpOnboardingTitle}><strong>{mcpState.label}</strong><p>{mcpState.summary}</p><p>{mcpState.nextAction}</p></section>
        <dl className="connection-facts">
          <div><dt>{text.mcpEndpoint}</dt><dd className="break-value">{mcpGuide.mcpUrl}</dd></div>
          <div><dt>{text.mcpDiscovery}</dt><dd className="break-value">{mcpGuide.discoveryUrl}</dd></div>
          <div><dt>{text.mcpTransport}</dt><dd>{mcpGuide.transport}</dd></div>
          <div><dt>{text.mcpProfile}</dt><dd>{mcpGuide.profileVersion}</dd></div>
          <div><dt>{text.mcpAuthReadiness}</dt><dd>{authoritativeConnection.status === 'active' ? text.mcpAuthActive : authoritativeConnection.status === 'pending' ? text.mcpAuthPending : authoritativeConnection.status}</dd></div>
          <div><dt>{text.mcpCapabilitySummary}</dt><dd>{authoritativeConnection.granted_capabilities.join(', ') || text.noCapabilities}</dd></div>
          <div><dt>{text.mcpSkillSelector}</dt><dd>{mcpGuide.skill.version} · {mcpGuide.skill.sha256.slice(0, 19)}…</dd></div>
        </dl>
        <details className="config-details"><summary>{text.secretSafeConfig(mcpGuide.configLabel)}</summary><pre aria-label={copy.configRegionLabel(mcpGuide.configLabel)} className="config-preview" role="region" tabIndex={0}><code>{mcpGuide.config}</code></pre>{mcpGuide.localStdioFallback && <p>{mcpGuide.localStdioFallback}</p>}<Button type="button" onClick={() => void navigator.clipboard.writeText(mcpGuide.config).then(() => { setConfigCopied(true); window.setTimeout(() => setConfigCopied(false), 1800) })}>{configCopied ? text.configCopied : text.copyConfig}</Button></details>
        <ol className="bootstrap-checklist" aria-label={text.bootstrapChecklist}>{mcpGuide.bootstrapChecks.map(check => <li key={check}>{check}</li>)}</ol>
      </>}
    </article>}

    {admin && panelInitialized && instruction && <article className="connection-instruction"><header><div><p className="eyebrow">{text.handoffEyebrow}</p><h3>{text.handoffTitle}</h3><p>{text.handoffIntro}</p></div><Button type="button" onClick={() => void navigator.clipboard.writeText(instruction)}>{text.copyFullInstructions}</Button></header><pre className="agent-connection-instruction"><code>{instruction}</code></pre><small>{text.handoffExpiryNote}</small></article>}

    <Dialog closeLabel={t('close')} open={admin && createOpen} onClose={() => setCreateOpen(false)} title={text.newConnectionTitle}>
      <form onSubmit={create} className="agent-connection-form">
        <label>{text.fieldClient}<select name="client" defaultValue="codex">{mcpClientTypes.map(type => <option key={type} value={type}>{mcpClientFacts(type).label}</option>)}</select></label>
        <label>{text.fieldAgentName}<input name="name" required maxLength={120} placeholder={text.fieldAgentNamePlaceholder} /></label>
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
