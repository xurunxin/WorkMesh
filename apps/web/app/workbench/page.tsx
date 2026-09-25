'use client'

import { AuthenticatedWorkspaceShell } from '../authenticated-workspace-shell'
import { ConversationWorkbench } from '../../features/workbench/conversation-workbench'
import { actorDisplayName } from '../lib/actor'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { useAuthenticatedActor } from '../lib/use-authenticated-actor'
import { workspaceNavigation, workspaceUtilityNavigation } from '../lib/workspace-navigation'

export default function WorkbenchPage() {
  const { locale, t } = useLocale()
  const { actor, loading, error, refresh } = useAuthenticatedActor()
  const zh = locale === 'zh-CN'
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
    <section className="content">
      {loading && !actor ? <p>{zh ? '正在加载工作台…' : 'Loading workbench…'}</p>
        : !actor ? <div role="alert"><p>{error || (zh ? '无法加载账户。' : 'Could not load account.')}</p><button onClick={() => void refresh()} type="button">{zh ? '重试' : 'Retry'}</button></div>
          : <ConversationWorkbench actor={actor} key={`${actor.workspace_id}:${actor.id}`} />}
    </section>
  </AuthenticatedWorkspaceShell>
}
