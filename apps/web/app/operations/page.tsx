'use client'

import type { ReactNode } from 'react'
import { AsyncStateSurface, ErrorState } from '@workmesh/ui'
import { AuthenticatedWorkspaceShell } from '../authenticated-workspace-shell'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { actorAuthorityScopeKey, type AuthenticatedActor } from '../lib/actor'
import { useAuthenticatedActor } from '../lib/use-authenticated-actor'
import { RealtimeStatus } from '../realtime-status'
import { workspaceNavigation, workspaceUtilityNavigation } from '../lib/workspace-navigation'
import { OperationsContent } from '../operations-content'

export default function OperationsPage() {
  const { operationsCopy, t } = useLocale()
  const { actor, error, loading, refresh } = useAuthenticatedActor()
  const stateShell = (content: ReactNode) => <AuthenticatedWorkspaceShell
    contextLabel={operationsCopy.title}
    documentTitle={operationsCopy.title}
    headerActions={<LocaleToggle />}
    navigation={workspaceNavigation({ active: 'operations', t })}
    skipLabel={t('skipToContent')}
    utilityNavigation={workspaceUtilityNavigation({ t })}
  >{content}</AuthenticatedWorkspaceShell>
  if (loading && !actor) return stateShell(<div className="center foundation-center wm-theme"><AsyncStateSurface description={operationsCopy.loading} state="loading" title={operationsCopy.loading} /></div>)
  if (!actor) return stateShell(<div className="center foundation-center wm-theme"><ErrorState actionLabel={operationsCopy.retry} description={error || operationsCopy.errorDescription} onAction={() => void refresh()} title={operationsCopy.error} /></div>)
  return <OperationsPageScope actor={actor} key={actorAuthorityScopeKey(actor)} />
}

function OperationsPageScope({ actor }: { actor: AuthenticatedActor }) {
  const { operationsCopy, t } = useLocale()
  const headerActions = <div className="shell-action-cluster"><LocaleToggle /><RealtimeStatus labels={{ connected: t('live'), connecting: t('connecting'), reconnecting: t('reconnecting'), offline: t('offline') }} /></div>
  const navigation = workspaceNavigation({ active: 'operations', t, onHomeNavigate: undefined })
  const utilityNavigation = workspaceUtilityNavigation({ t })
  return <AuthenticatedWorkspaceShell
    actorName={actor.display_name}
    contextLabel={t('planningAndOperations')}
    documentTitle={operationsCopy.title}
    headerActions={headerActions}
    navigation={navigation}
    skipLabel={t('skipToContent')}
    utilityNavigation={utilityNavigation}
  >
    <noscript><p>{operationsCopy.noScript}</p></noscript>
    <div className="content content--full">
      <OperationsContent authorityKey={actorAuthorityScopeKey(actor)} />
    </div>
  </AuthenticatedWorkspaceShell>
}
