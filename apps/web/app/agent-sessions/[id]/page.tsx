'use client'

import { use } from 'react'
import { AppShell } from '@workmesh/ui'
import { AgentSessionDetail } from '../../agent-session-detail'
import { LocaleToggle, useLocale } from '../../lib/i18n'
import { workspaceNavigation, workspaceUtilityNavigation } from '../../lib/workspace-navigation'
import { RealtimeStatus } from '../../realtime-status'

export default function AgentSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { locale, t } = useLocale()
  const text = locale === 'zh-CN' ? {
    context: '智能体执行', eyebrow: '智能体执行', session: 'Session', intro: '面向人类的控制、证据、计划和持久执行事实。', back: '返回智能体',
  } : {
    context: 'Agent execution', eyebrow: 'Agent execution', session: 'Session', intro: 'Human-visible control, evidence, plans, and durable execution facts.', back: 'Back to Agents',
  }
  return <AppShell
    administrationNavigationLabel={t('administrationNavigation')}
    contextLabel={text.context}
    headerActions={<div className="shell-action-cluster"><LocaleToggle /><RealtimeStatus labels={{ connected: t('live'), connecting: t('connecting'), reconnecting: t('reconnecting'), offline: t('offline') }} /></div>}
    mainNavigationLabel={t('mainNavigation')}
    menuLabel={t('menu')}
    mobileNavigationLabel={t('mobileNavigation')}
    productName="WorkMesh"
    navigation={workspaceNavigation({ active: 'agents', t })}
    skipLabel={t('skipToContent')}
    utilityNavigation={workspaceUtilityNavigation({ t })}
    workspaceNavigationLabel={t('workspaceNavigation')}
  >
    <section className="session-page"><header className="page-header"><div><p className="eyebrow">{text.eyebrow}</p><h1>{text.session} {id.slice(0, 8)}</h1><p>{text.intro}</p></div><a href="/agents">{text.back}</a></header><AgentSessionDetail sessionId={id} /></section>
  </AppShell>
}
