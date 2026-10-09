'use client'

import { AuthenticatedWorkspaceShell } from '../authenticated-workspace-shell'
import { ConversationWorkbench } from '../../features/workbench/conversation-workbench'
import { actorDisplayName } from '../lib/actor'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { useAuthenticatedActor } from '../lib/use-authenticated-actor'
import { workspaceNavigation, workspaceUtilityNavigation } from '../lib/workspace-navigation'

export default function WorkbenchPage() {
  const { agentWorkCopy: text, locale, t } = useLocale()
  const { actor, loading, error, refresh } = useAuthenticatedActor()
  return <AuthenticatedWorkspaceShell
    actorName={actor ? actorDisplayName(actor) : undefined}
    administrationNavigationLabel={t('administrationNavigation')}
    contextLabel={t('workbench')}
    documentTitle={t('workbench')}
    headerActions={<div className="shell-action-cluster"><LocaleToggle /></div>}
    mainNavigationLabel={t('mainNavigation')}
    menuLabel={t('menu')}
    mobileNavigationLabel={t('mobileNavigation')}
    navigation={workspaceNavigation({ active: 'workbench', t })}
    skipLabel={t('skipToContent')}
    utilityNavigation={workspaceUtilityNavigation({ t })}
    workspaceNavigationLabel={t('workspaceNavigation')}
  >
    <section className="content workbench-page">
      {loading && !actor ? <p>{text.routeLoading}</p>
        : !actor ? <div role="alert"><p>{error || text.routeAccountError}</p><button onClick={() => void refresh()} type="button">{text.retry}</button></div>
          : <ConversationWorkbench actor={actor} key={`${actor.workspace_id}:${actor.id}`} />}
    </section>
  </AuthenticatedWorkspaceShell>
}
