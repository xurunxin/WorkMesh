'use client'

import { AppShell, AsyncStateSurface, ErrorState } from '@workmesh/ui'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { actorAuthorityScopeKey, type AuthenticatedActor } from '../lib/actor'
import { useAuthenticatedActor } from '../lib/use-authenticated-actor'
import { RealtimeStatus } from '../realtime-status'
import { workspaceNavigation, workspaceUtilityNavigation } from '../lib/workspace-navigation'
import { OperationsContent } from '../operations-content'

export default function OperationsPage() {
  const { operationsCopy } = useLocale()
  const { actor, error, loading, refresh } = useAuthenticatedActor()
  if (loading && !actor) return <main className="center foundation-center wm-theme"><AsyncStateSurface description={operationsCopy.loading} state="loading" title={operationsCopy.loading} /></main>
  if (!actor) return <main className="center foundation-center wm-theme"><ErrorState actionLabel={operationsCopy.retry} description={error || operationsCopy.errorDescription} onAction={() => void refresh()} title={operationsCopy.error} /></main>
  return <OperationsPageScope actor={actor} key={actorAuthorityScopeKey(actor)} />
}

function OperationsPageScope({ actor }: { actor: AuthenticatedActor }) {
  const { operationsCopy, t } = useLocale()
  const headerActions = <div className="shell-action-cluster"><LocaleToggle /><RealtimeStatus labels={{ connected: t('live'), connecting: t('connecting'), reconnecting: t('reconnecting'), offline: t('offline') }} /></div>
  const navigation = workspaceNavigation({ active: 'operations', t, onHomeNavigate: undefined })
  const utilityNavigation = workspaceUtilityNavigation({ t })
  return <AppShell
    contextLabel={t('planningAndOperations')}
    headerActions={headerActions}
    navigation={navigation}
    productName="WorkMesh"
    skipLabel={t('skipToContent')}
    utilityNavigation={utilityNavigation}
  >
    <noscript><p>{operationsCopy.noScript}</p></noscript>
    <div className="content content--full">
      <OperationsContent authorityKey={actorAuthorityScopeKey(actor)} />
    </div>
  </AppShell>
}
