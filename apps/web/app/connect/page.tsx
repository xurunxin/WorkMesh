'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@workmesh/ui'
import { publicRequest } from '../lib/api'
import { useLocale } from '../lib/i18n'
import {
  buildMcpClientGuide,
  classifyMcpOnboardingFailure,
  onboardingStateMessage,
  probeMcpReadiness,
  supportedMcpClientTypes,
  type McpClientType,
  type McpDiscovery,
  type McpOnboardingState,
  type McpReleaseInfo,
} from '../lib/mcp-onboarding'
import { ClientPicker } from './client-picker'

type LoadedMcpEnvironment = {
  discovery: McpDiscovery
  release: McpReleaseInfo
  supportedClients: readonly McpClientType[]
  clientType: McpClientType | null
  coordinationFeatureEnabled: boolean
  mcpHealthy: boolean | undefined
}

export default function ConnectPage() {
  const { connectCopy: text, t } = useLocale()
  const [environment, setEnvironment] = useState<LoadedMcpEnvironment | null>(null)
  const [fragmentPresent, setFragmentPresent] = useState<boolean | null>(null)
  const [failure, setFailure] = useState<McpOnboardingState | null>(null)
  const [configCopied, setConfigCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [copyAnnouncement, setCopyAnnouncement] = useState<'config' | 'link' | null>(null)

  useEffect(() => {
    setFragmentPresent(window.location.hash.length > 1)
    const controller = new AbortController()
    void Promise.all([
      publicRequest<McpDiscovery>('/.well-known/workmesh-agent', { signal: controller.signal }),
      publicRequest<McpReleaseInfo>('/api/v1/info', { signal: controller.signal }),
    ]).then(async ([nextDiscovery, nextRelease]) => {
      const supportedClients = supportedMcpClientTypes(nextDiscovery.supportedClients)
      const normalizedDiscovery = { ...nextDiscovery, supportedClients }
      if (supportedClients.length === 0) {
        if (controller.signal.aborted) return
        setEnvironment({
          discovery: normalizedDiscovery,
          release: nextRelease,
          supportedClients,
          clientType: null,
          coordinationFeatureEnabled: true,
          mcpHealthy: undefined,
        })
        setFailure(null)
        return
      }
      const nextMcpHealthy = await probeMcpReadiness(normalizedDiscovery.mcpUrl, controller.signal)
      if (controller.signal.aborted) return
      setEnvironment({
        discovery: normalizedDiscovery,
        release: nextRelease,
        supportedClients,
        clientType: supportedClients[0] ?? null,
        // This discovery route is server-gated by WORKMESH_BETA_COORDINATION_MCP.
        coordinationFeatureEnabled: true,
        mcpHealthy: nextMcpHealthy,
      })
      setFailure(null)
    }).catch(reason => {
      if (controller.signal.aborted) return
      const nextFailure = classifyMcpOnboardingFailure(reason)
      setEnvironment(null)
      setFailure(nextFailure)
    })
    return () => controller.abort()
  }, [])

  const guide = useMemo(() => environment?.clientType
    ? buildMcpClientGuide({
      clientType: environment.clientType,
      discovery: environment.discovery,
      release: environment.release,
      coordinationFeatureEnabled: environment.coordinationFeatureEnabled,
      mcpHealthy: environment.mcpHealthy,
    }, text)
    : null, [environment, text])
  const stateKey = guide?.state ?? (environment && environment.supportedClients.length === 0 ? 'unsupported_client' : null)
  const state = stateKey ? onboardingStateMessage(stateKey, text) : null
  const failureState = failure ? onboardingStateMessage(failure, text) : null

  const copy = async (kind: 'config' | 'link', value: string) => {
    await navigator.clipboard.writeText(value)
    setCopyAnnouncement(kind)
    if (kind === 'config') setConfigCopied(true)
    else setLinkCopied(true)
    window.setTimeout(() => {
      if (kind === 'config') setConfigCopied(false)
      else setLinkCopied(false)
      setCopyAnnouncement(current => current === kind ? null : current)
    }, 1800)
  }

  const selectClient = (clientType: McpClientType) => {
    setEnvironment(current => current && current.supportedClients.includes(clientType)
      ? { ...current, clientType }
      : current)
    setConfigCopied(false)
    setCopyAnnouncement(current => current === 'config' ? null : current)
  }

  return <>
    <a className="wm-skip-link" href="#workmesh-main">{t('skipToContent')}</a>
    <main className="center connect-page" id="workmesh-main" tabIndex={-1}><section className="connection-instruction onboarding-shell" aria-labelledby="connect-title">
    <header className="onboarding-heading">
      <div><p className="eyebrow">{text.eyebrow}</p><h1 id="connect-title">{text.title}</h1></div>
      <span className="health-pill health-neutral">{text.healthPill}</span>
    </header>

    {failureState && <div className={`diagnostic-callout diagnostic-${failureState.tone}`} data-onboarding-state={failure} role="alert"><strong>{failureState.label}</strong><p>{failureState.summary}</p><p>{failureState.nextAction}</p></div>}
    {!failure && !environment && <p role="status">{text.loadingStatus}</p>}
    {fragmentPresent === false && <div className="diagnostic-callout diagnostic-critical" role="alert"><strong>{text.fragmentMissingTitle}</strong><p>{text.fragmentMissingBody}</p></div>}

    {state && stateKey && <section className={`diagnostic-callout diagnostic-${state.tone}`} aria-label={text.configurationStatus} data-onboarding-state={stateKey} role={state.tone === 'critical' ? 'alert' : 'status'}>
        <strong>{state.label}</strong><p>{state.summary}</p><p>{state.nextAction}</p>
      </section>}
    {guide && environment?.clientType && <>
      <div className="onboarding-grid" data-mcp-guide-client={guide.clientType}>
        <section className="onboarding-card" aria-labelledby="client-config-title">
          <header><p className="eyebrow">{text.step1}</p><h2 id="client-config-title">{text.chooseClient}</h2></header>
          <ClientPicker copy={text} onChange={selectClient} supportedClients={environment.supportedClients} value={environment.clientType} />
          <dl className="connection-facts compact-facts">
            <div><dt>{text.transport}</dt><dd>{guide.transport}</dd></div>
            <div><dt>{text.discovery}</dt><dd className="break-value">{guide.discoveryUrl}</dd></div>
            <div><dt>{text.profile}</dt><dd>{guide.profileVersion}</dd></div>
            <div><dt>{text.skill}</dt><dd>{guide.skill.name} {guide.skill.version}</dd></div>
            <div><dt>{text.sha256}</dt><dd className="break-value">{guide.skill.sha256}</dd></div>
          </dl>
        </section>
        <section className="onboarding-card" aria-labelledby="config-template-title">
          <header className="onboarding-card-actions"><div><p className="eyebrow">{text.step2}</p><h2 id="config-template-title">{guide.configLabel}</h2></div><Button onClick={() => void copy('config', guide.config)} type="button" variant="secondary">{configCopied ? text.copied : text.copyConfig}</Button></header>
          <pre aria-label={text.configRegionLabel(guide.configLabel)} className="config-preview" role="region" tabIndex={0}><code>{guide.config}</code></pre>
          {guide.localStdioFallback && <p>{guide.localStdioFallback}</p>}
          <p className="secret-safety"><strong>{text.secretBoundary}</strong></p>
        </section>
      </div>
      <section className="onboarding-card" aria-labelledby="bootstrap-title">
        <header><p className="eyebrow">{text.step3}</p><h2 id="bootstrap-title">{text.bootstrapChecklist}</h2></header>
        <ol className="bootstrap-checklist">{guide.bootstrapChecks.map(check => <li key={check}>{check}</li>)}</ol>
        <details><summary>{text.environmentChecks}</summary><ul>{guide.environmentChecks.map(check => <li key={check}>{check}</li>)}</ul></details>
      </section>
    </>}

    {fragmentPresent === true && <section className="onboarding-card pairing-card" aria-labelledby="pairing-title">
      <header><div><p className="eyebrow">{text.handoffEyebrow}</p><h2 id="pairing-title">{text.handoffTitle}</h2></div><Button onClick={() => void copy('link', window.location.href)} type="button" variant="secondary">{linkCopied ? text.copiedLink : text.copyLink}</Button></header>
      <p>{text.handoffBody}</p>
    </section>}
    <p className="onboarding-authority-note"><strong>{text.authorityTitle}</strong> {text.authorityBody}</p>
    <span className="sr-only" aria-live="polite">{copyAnnouncement === 'config' ? text.configCopiedAnnouncement : copyAnnouncement === 'link' ? text.linkCopiedAnnouncement : ''}</span>
    </section></main>
  </>
}
