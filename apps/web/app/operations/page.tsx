'use client'

import { useEffect } from 'react'
import { AppShell } from '@workmesh/ui'
import { GlobalCommandCenter } from '../../features/command-center'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { RealtimeStatus } from '../realtime-status'
import { workspaceNavigation, workspaceUtilityNavigation } from '../lib/workspace-navigation'
import { OperationsContent } from '../operations-content'

export default function OperationsPage() {
  const { locale, t } = useLocale()
  useEffect(() => {
    if (typeof window === 'undefined') return
    const target = new URL(window.location.href)
    if (target.pathname === '/operations') {
      target.pathname = '/settings'
      target.searchParams.set('tab', 'operations')
      target.hash = 'settings-tab-operations'
      window.location.replace(target.toString())
    }
  }, [])
  const headerActions = <div className="shell-action-cluster"><LocaleToggle /><GlobalCommandCenter locale={locale} triggerLabel={t('search')} /><RealtimeStatus labels={{ connected: t('live'), connecting: t('connecting'), reconnecting: t('reconnecting'), offline: t('offline') }} /></div>
  const navigation = workspaceNavigation({ active: 'agents', t, onHomeNavigate: undefined })
  const utilityNavigation = workspaceUtilityNavigation({ t })
  return <AppShell
    contextLabel={t('planningAndOperations')}
    headerActions={headerActions}
    navigation={navigation}
    productName="WorkMesh"
    utilityNavigation={utilityNavigation}
  >
    <div className="center"><p>{t('planningAndOperations')}</p></div>
    <noscript><p>请使用支持 JavaScript 的浏览器查看运营与规划。</p></noscript>
    <OperationsContent />
  </AppShell>
}
