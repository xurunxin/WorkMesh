'use client'

import { use, useEffect, useState } from 'react'
import { AppShell, AsyncStateSurface, ErrorState } from '@workmesh/ui'
import { type Agent, agentName } from '../../lib/agents'
import { ApiError, apiRequest } from '../../lib/api'
import { LocaleToggle, useLocale } from '../../lib/i18n'
import { useAuthenticatedActor } from '../../lib/use-authenticated-actor'
import { workspaceNavigation, workspaceUtilityNavigation } from '../../lib/workspace-navigation'
import { RealtimeStatus } from '../../realtime-status'
import { AgentDetailPanel } from '../agent-detail-panel'
import { agentTeamAccessHref, decodeAgentRouteSegment } from '../approval-route-state'

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, agentsCopy: text } = useLocale()
  const { actor, loading: actorLoading, error: actorError, refresh: refreshActor } = useAuthenticatedActor()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [agentLoading, setAgentLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const actorId = actor?.id
  const agentId = decodeAgentRouteSegment(id)

  useEffect(() => {
    if (!actorId) return
    if (agentId === null) {
      setAgent(null)
      setAgentLoading(false)
      setRequestError('')
      setNotFound(true)
      return
    }
    let current = true
    setAgentLoading(true)
    setAgent(null)
    setNotFound(false)
    setRequestError('')
    void apiRequest<Agent>(`/api/v1/agents/${encodeURIComponent(agentId)}`)
      .then(value => { if (current) setAgent(value) })
      .catch((reason: unknown) => {
        if (!current) return
        if (reason instanceof ApiError && reason.status === 404) setNotFound(true)
        else setRequestError(reason instanceof Error ? reason.message : '')
      })
      .finally(() => { if (current) setAgentLoading(false) })
    return () => { current = false }
  }, [actorId, agentId, reloadKey])

  const retry = (): void => {
    if (!actor) void refreshActor()
    else setReloadKey(current => current + 1)
  }
  const title = agent ? agentName(agent) : agentId ?? text.title

  return <AppShell
    administrationNavigationLabel={t('administrationNavigation')}
    actorName={actor?.display_name}
    contextLabel={text.context}
    headerActions={<div className="shell-action-cluster"><LocaleToggle /><RealtimeStatus labels={{ connected: t('live'), connecting: t('connecting'), reconnecting: t('reconnecting'), offline: t('offline') }} /></div>}
    mainNavigationLabel={t('mainNavigation')}
    menuLabel={t('menu')}
    mobileNavigationLabel={t('mobileNavigation')}
    navigation={workspaceNavigation({ active: 'agents', t })}
    productName="WorkMesh"
    skipLabel={t('skipToContent')}
    utilityNavigation={workspaceUtilityNavigation({ t })}
    workspaceNavigationLabel={t('workspaceNavigation')}
  >
    <section className="agent-center agent-detail-page">
      <header className="page-header">
        <div><p className="eyebrow">{text.agentDetailEyebrow}</p><h1>{title}</h1><p>{text.agentDetailIntro}</p></div>
        <a href="/agents?tab=agents">{text.backToAgentRegistry}</a>
      </header>
      <div className="agent-detail-page-content">
        {actorLoading
          ? <AsyncStateSurface description={text.loadingDescription} state="loading" title={text.loadingTitle} />
          : !actor
            ? <ErrorState actionLabel={text.retry} description={actorError || text.loadError} onAction={retry} title={text.attentionTitle} />
            : agentLoading
              ? <AsyncStateSurface description={text.loadingDescription} state="loading" title={text.loadingTitle} />
              : notFound
                ? <AsyncStateSurface description={text.agentNotFoundDescription} state="not_found" title={text.agentNotFoundTitle} />
                : requestError
                  ? <ErrorState actionLabel={text.retry} description={requestError || text.agentDetailErrorDescription} onAction={retry} title={text.agentDetailErrorTitle} />
                  : agent
                    ? <>
                      <AgentDetailPanel agent={agent} />
                      <aside className="agent-detail-management">
                        <p>{text.teamAccessAndCapabilities}</p>
                        <a aria-label={text.manageTeamAccess(agentName(agent))} href={agentTeamAccessHref(agent.id)}>{text.manageTeamAccessLabel}</a>
                      </aside>
                    </>
                    : <ErrorState actionLabel={text.retry} description={text.agentDetailErrorDescription} onAction={retry} title={text.agentDetailErrorTitle} />
        }
      </div>
    </section>
  </AppShell>
}
