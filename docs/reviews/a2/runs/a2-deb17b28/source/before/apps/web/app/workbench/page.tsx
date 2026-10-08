'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { AuthenticatedWorkspaceShell } from '../authenticated-workspace-shell'
import { ConversationWorkbench } from '../../features/workbench/conversation-workbench'
import { actorAuthorityScopeKey, actorDisplayName } from '../lib/actor'
import { useCurrentTeam } from '../lib/use-current-team'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { useAuthenticatedActor } from '../lib/use-authenticated-actor'
import { workspaceNavigation, workspaceUtilityNavigation } from '../lib/workspace-navigation'

export default function WorkbenchPage() {
  const { agentWorkCopy: text, locale, t } = useLocale()
  const { actor, loading, error, refresh } = useAuthenticatedActor()
  const { readinessCopy } = useLocale()
  const params = useSearchParams()
  const router = useRouter()
  const team = useCurrentTeam(actor)
  const explicitTeam = params?.get('teamId')
  const teamId = team.initialized ? (params?.has('teamId') ? params.getAll('teamId').length === 1 ? team.teams.find(item => item.id === explicitTeam)?.id ?? null : null : team.teamId) : null
  const search = params?.toString() ?? ''
  const workHref = (kind: string) => { const value = new URLSearchParams(search); value.set('workKind', kind); if (teamId) value.set('teamId', teamId); return `/workbench?${value}` }
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
    teamSwitcher={actor && <label>{t('team')}<select aria-label={t('currentTeam')} disabled={!team.initialized} value={teamId ?? ''} onChange={event => { const value = new URLSearchParams(search); value.set('teamId', event.target.value); value.delete('projectId'); value.delete('workItemId'); router.push(`/workbench?${value}`) }}>
      <option disabled value="">{t('noTeam')}</option>{team.teams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>}
    workspaceNavigationLabel={t('workspaceNavigation')}
  >
    <section className="content workbench-page">
      {loading && !actor ? <p>{text.routeLoading}</p>
        : !actor ? <div role="alert"><p>{error || text.routeAccountError}</p><button onClick={() => void refresh()} type="button">{text.retry}</button></div>
          : <><ConversationWorkbench actor={actor} key={`${actorAuthorityScopeKey(actor)}:${teamId}`} readinessSearch={search} readinessTeamId={teamId} />
            {!params?.has('workKind') && teamId && <p><a href={workHref('repository')}>{readinessCopy.repositoryWork}</a> · <a href={workHref('non_repository')}>{readinessCopy.nonRepositoryWork}</a></p>}</>}
    </section>
  </AuthenticatedWorkspaceShell>
}
