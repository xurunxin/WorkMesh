'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@workmesh/ui'
import { publicRequest } from '../lib/api'
import { useLocale } from '../lib/i18n'
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
  const { connectCopy: text } = useLocale()
  const mcpCopy = text
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
  const state = guide ? onboardingStateMessage(guide.state, mcpCopy) : null
  const failureState = failure ? onboardingStateMessage(failure, mcpCopy) : null

  const copy = async (kind: 'config' | 'link', value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(current => current === kind ? null : current), 1800)
  }

  return <main className="center connect-page"><section className="connection-instruction onboarding-shell" aria-labelledby="connect-title">
    <header className="onboarding-heading">
      <div><p className="eyebrow">{text.eyebrow}</p><h1 id="connect-title">{text.title}</h1></div>
      <span className="health-pill health-neutral">{text.healthPill}</span>
    </header>

    {failureState && <div className={`diagnostic-callout diagnostic-${failureState.tone}`} data-onboarding-state={failure} role="alert"><strong>{failureState.label}</strong><p>{failureState.summary}</p><p>{failureState.nextAction}</p>{failureDetail && <small>{failureDetail}</small>}</div>}
    {!failure && (!discovery || !release) && <p role="status">{text.loadingStatus}</p>}
    {!fragmentPresent && <div className="diagnostic-callout diagnostic-critical" role="alert"><strong>{text.fragmentMissingTitle}</strong><p>{text.fragmentMissingBody}</p></div>}

    {guide && state && <>
      <section className={`diagnostic-callout diagnostic-${state.tone}`} aria-label="MCP configuration status">
        <strong>{state.label}</strong><p>{state.summary}</p><p>{state.nextAction}</p>
      </section>
      <div className="onboarding-grid">
        <section className="onboarding-card" aria-labelledby="client-config-title">
          <header><p className="eyebrow">{text.step1}</p><h2 id="client-config-title">{text.chooseClient}</h2></header>
          <label className="client-picker">{text.mcpClient}<select value={clientType} onChange={event => setClientType(event.target.value as McpClientType)}>{mcpClientTypes.map(type => <option key={type} value={type}>{type === 'generic_mcp' ? text.clientGenericMcp : type === 'opencode' ? text.clientOpencode : type === 'codex' ? text.clientCodex : text.clientPi}</option>)}</select></label>
          <dl className="connection-facts compact-facts">
            <div><dt>{text.transport}</dt><dd>{guide.transport}</dd></div>
            <div><dt>{text.discovery}</dt><dd className="break-value">{guide.discoveryUrl}</dd></div>
            <div><dt>{text.profile}</dt><dd>{guide.profileVersion}</dd></div>
            <div><dt>{text.skill}</dt><dd>{guide.skill.name} {guide.skill.version}</dd></div>
            <div><dt>{text.sha256}</dt><dd className="break-value">{guide.skill.sha256}</dd></div>
          </dl>
        </section>
        <section className="onboarding-card" aria-labelledby="config-template-title">
          <header className="onboarding-card-actions"><div><p className="eyebrow">{text.step2}</p><h2 id="config-template-title">{guide.configFile}</h2></div><Button onClick={() => void copy('config', guide.config)} type="button" variant="secondary">{copied === 'config' ? text.copied : text.copyConfig}</Button></header>
          <pre className="config-preview"><code>{guide.config}</code></pre>
          {guide.localStdioFallback && <p>{text.localStdioFallback(guide.localStdioFallback)}</p>}
          <p className="secret-safety"><strong>{text.secretBoundary}</strong></p>
        </section>
      </div>
      <section className="onboarding-card" aria-labelledby="bootstrap-title">
        <header><p className="eyebrow">{text.step3}</p><h2 id="bootstrap-title">{text.bootstrapChecklist}</h2></header>
        <ol className="bootstrap-checklist">{guide.bootstrapChecks.map(check => <li key={check}>{check}</li>)}</ol>
        <details><summary>{text.environmentChecks}</summary><ul>{guide.environmentChecks.map(check => <li key={check}>{check}</li>)}</ul></details>
      </section>
    </>}

    {fragmentPresent && <section className="onboarding-card pairing-card" aria-labelledby="pairing-title">
      <header><div><p className="eyebrow">{text.handoffEyebrow}</p><h2 id="pairing-title">{text.handoffTitle}</h2></div><Button onClick={() => void copy('link', window.location.href)} type="button" variant="secondary">{copied === 'link' ? text.copiedLink : text.copyLink}</Button></header>
      <p>{text.handoffBody}</p>
    </section>}
    <p className="onboarding-authority-note"><strong>{text.authorityTitle}</strong> {text.authorityBody}</p>
    <span className="sr-only" aria-live="polite">{copied ? `${copied} copied` : ''}</span>
  </section></main>
}
