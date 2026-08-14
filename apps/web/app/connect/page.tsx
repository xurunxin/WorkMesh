'use client'

import { useEffect, useMemo, useState } from 'react'
import { publicRequest } from '../lib/api'
import {
  buildMcpClientGuide,
  classifyMcpOnboardingFailure,
  mcpClientTypes,
  onboardingStateMessage,
  probeMcpReadiness,
  type McpClientType,
  type McpDiscovery,
  type McpOnboardingState,
  type McpReleaseInfo,
} from '../lib/mcp-onboarding'

export default function ConnectPage() {
  const [discovery, setDiscovery] = useState<McpDiscovery | null>(null)
  const [release, setRelease] = useState<McpReleaseInfo | null>(null)
  const [clientType, setClientType] = useState<McpClientType>('codex')
  const [fragmentPresent, setFragmentPresent] = useState(false)
  const [failure, setFailure] = useState<McpOnboardingState | null>(null)
  const [failureDetail, setFailureDetail] = useState('')
  const [coordinationFeatureEnabled, setCoordinationFeatureEnabled] = useState<boolean | null>(null)
  const [mcpHealthy, setMcpHealthy] = useState<boolean | undefined>(undefined)
  const [copied, setCopied] = useState<'config' | 'link' | null>(null)

  useEffect(() => {
    setFragmentPresent(window.location.hash.length > 1)
    const controller = new AbortController()
    void Promise.all([
      publicRequest<McpDiscovery>('/.well-known/workmesh-agent', { signal: controller.signal }),
      publicRequest<McpReleaseInfo>('/api/v1/info', { signal: controller.signal }),
    ]).then(async ([nextDiscovery, nextRelease]) => {
      const nextMcpHealthy = await probeMcpReadiness(nextDiscovery.mcpUrl, controller.signal)
      if (controller.signal.aborted) return
      setDiscovery(nextDiscovery)
      setRelease(nextRelease)
      // This discovery route is server-gated by WORKMESH_BETA_COORDINATION_MCP.
      setCoordinationFeatureEnabled(true)
      setMcpHealthy(nextMcpHealthy)
      setFailure(null)
      setFailureDetail('')
      if (!nextDiscovery.supportedClients.includes('codex')) setClientType(nextDiscovery.supportedClients[0] ?? 'generic_mcp')
    }).catch(reason => {
      if (controller.signal.aborted) return
      const nextFailure = classifyMcpOnboardingFailure(reason)
      setFailure(nextFailure)
      setFailureDetail(reason instanceof Error ? reason.message : 'Live onboarding facts could not be loaded.')
      setCoordinationFeatureEnabled(nextFailure === 'coordination_feature_disabled' ? false : null)
    })
    return () => controller.abort()
  }, [])

  const guide = useMemo(() => discovery && release && coordinationFeatureEnabled !== null
    ? buildMcpClientGuide({ clientType, discovery, release, coordinationFeatureEnabled, mcpHealthy })
    : null, [clientType, coordinationFeatureEnabled, discovery, mcpHealthy, release])
  const state = guide ? onboardingStateMessage(guide.state) : null
  const failureState = failure ? onboardingStateMessage(failure) : null

  const copy = async (kind: 'config' | 'link', value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(current => current === kind ? null : current), 1800)
  }

  return <main className="center connect-page"><section className="connection-instruction onboarding-shell" aria-labelledby="connect-title">
    <header className="onboarding-heading">
      <div><p className="eyebrow">Secure Agent setup</p><h1 id="connect-title">Connect an Agent to WorkMesh</h1></div>
      <span className="health-pill health-neutral">Pair once · verify live</span>
    </header>

    {failureState && <div className={`diagnostic-callout diagnostic-${failureState.tone}`} data-onboarding-state={failure} role="alert"><strong>{failureState.label}</strong><p>{failureState.summary}</p><p>{failureState.nextAction}</p>{failureDetail && <small>{failureDetail}</small>}</div>}
    {!failure && (!discovery || !release) && <p role="status">Loading server-derived MCP configuration…</p>}
    {!fragmentPresent && <div className="diagnostic-callout diagnostic-critical" role="alert"><strong>Pairing fragment missing</strong><p>Ask a Workspace Admin to generate a new Agent Connection. A fragment is single-use and expires; it is not an Agent Session token.</p></div>}

    {guide && state && <>
      <section className={`diagnostic-callout diagnostic-${state.tone}`} aria-label="MCP configuration status">
        <strong>{state.label}</strong><p>{state.summary}</p><p>{state.nextAction}</p>
      </section>
      <div className="onboarding-grid">
        <section className="onboarding-card" aria-labelledby="client-config-title">
          <header><p className="eyebrow">1 · Client</p><h2 id="client-config-title">Choose a supported client</h2></header>
          <label className="client-picker">MCP client<select value={clientType} onChange={event => setClientType(event.target.value as McpClientType)}>{mcpClientTypes.map(type => <option key={type} value={type}>{type === 'generic_mcp' ? 'Generic MCP' : type === 'opencode' ? 'OpenCode' : type === 'codex' ? 'Codex' : 'Pi'}</option>)}</select></label>
          <dl className="connection-facts compact-facts">
            <div><dt>Transport</dt><dd>{guide.transport}</dd></div>
            <div><dt>Discovery</dt><dd className="break-value">{guide.discoveryUrl}</dd></div>
            <div><dt>Profile</dt><dd>{guide.profileVersion}</dd></div>
            <div><dt>Skill</dt><dd>{guide.skill.name} {guide.skill.version}</dd></div>
            <div><dt>SHA-256</dt><dd className="break-value">{guide.skill.sha256}</dd></div>
          </dl>
        </section>
        <section className="onboarding-card" aria-labelledby="config-template-title">
          <header className="onboarding-card-actions"><div><p className="eyebrow">2 · Configuration</p><h2 id="config-template-title">{guide.configFile}</h2></div><button type="button" onClick={() => void copy('config', guide.config)}>{copied === 'config' ? 'Copied' : 'Copy config'}</button></header>
          <pre className="config-preview"><code>{guide.config}</code></pre>
          {guide.localStdioFallback && <p><strong>Local stdio fallback:</strong> {guide.localStdioFallback}</p>}
          <p className="secret-safety"><strong>Secret boundary:</strong> the template contains only an environment-variable name. Put the redeemed installation credential in the client secret store, never in this file.</p>
        </section>
      </div>
      <section className="onboarding-card" aria-labelledby="bootstrap-title">
        <header><p className="eyebrow">3 · Verify</p><h2 id="bootstrap-title">Bounded bootstrap checklist</h2></header>
        <ol className="bootstrap-checklist">{guide.bootstrapChecks.map(check => <li key={check}>{check}</li>)}</ol>
        <details><summary>Environment checks</summary><ul>{guide.environmentChecks.map(check => <li key={check}>{check}</li>)}</ul></details>
      </section>
    </>}

    {fragmentPresent && <section className="onboarding-card pairing-card" aria-labelledby="pairing-title">
      <header><div><p className="eyebrow">One-time handoff</p><h2 id="pairing-title">Pairing link is present in browser memory</h2></div><button type="button" onClick={() => void copy('link', window.location.href)}>{copied === 'link' ? 'Copied' : 'Copy secure connect URL'}</button></header>
      <p>The fragment has not been sent to WorkMesh. Give the exact link only to the intended Agent, redeem it before expiry, and then discard it.</p>
    </section>}
    <p className="onboarding-authority-note"><strong>Authority stays server-side.</strong> A Human Connection creates an installation identity only. Ordinary mutations still require an active Agent Session, Delegation, capability and resource scope, plus approval, lease, revision, and idempotency where applicable.</p>
    <span className="sr-only" aria-live="polite">{copied ? `${copied} copied` : ''}</span>
  </section></main>
}
