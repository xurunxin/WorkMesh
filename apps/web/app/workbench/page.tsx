'use client'

import { AsyncStateSurface } from '@workmesh/ui'
import { AuthenticatedWorkspaceShell } from '../authenticated-workspace-shell'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { useWorkMeshDocumentTitle } from '../lib/document-title'
import { workspaceNavigation, workspaceUtilityNavigation } from '../lib/workspace-navigation'

/**
 * W03 placeholder for the conversational agent workbench (real surfaces land
 * in W13). It exists so the workbench is a first-class, reachable navigation
 * destination from every page while keeping a single canonical URL.
 */
export default function WorkbenchPage() {
  const { t } = useLocale()
  useWorkMeshDocumentTitle(t('workbench'))
  return <AuthenticatedWorkspaceShell
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
    <section className="content" data-testid="workbench-placeholder">
      <AsyncStateSurface description={t('workbenchPlaceholderDescription')} state="empty" title={t('workbenchPlaceholderTitle')} />
    </section>
  </AuthenticatedWorkspaceShell>
}
