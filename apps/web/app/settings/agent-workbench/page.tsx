'use client'

import { useEffect, useState } from 'react'
import { AuthenticatedWorkspaceShell } from '../../authenticated-workspace-shell'
import { apiRequest, type ListResponse } from '../../lib/api'
import { actorDisplayName } from '../../lib/actor'
import { LocaleToggle, useLocale } from '../../lib/i18n'
import { useAuthenticatedActor } from '../../lib/use-authenticated-actor'
import { WorkbenchLlmSettings } from '../workbench-llm-settings'

type Team = { id: string; name: string }

export default function AgentWorkbenchSettingsPage() {
  const { settingsCopy: text, t } = useLocale()
  const { actor, loading, error, refresh } = useAuthenticatedActor()
  const [teams, setTeams] = useState<Team[]>([])
  useEffect(() => {
    if (!actor) return
    let active = true
    void apiRequest<ListResponse<Team>>('/api/v1/teams').then(response => {
      if (active) setTeams(response.items)
    }).catch(() => { if (active) setTeams([]) })
    return () => { active = false }
  }, [actor?.id, actor?.workspace_id])
  const title = text.pageTitle
  return <AuthenticatedWorkspaceShell
    actorName={actor ? actorDisplayName(actor) : undefined}
    contextLabel={title}
    documentTitle={title}
    headerActions={<LocaleToggle />}
    navigation={[{ href: '/settings', label: text.backToSettings }]}
    skipLabel={t('skipToContent')}
    utilityNavigation={[{ active: true, href: '/settings/agent-workbench', label: title }]}
  >
    <section className="content settings-page">
      {loading && !actor ? <p>{text.routeLoading}</p>
        : !actor ? <div role="alert"><p>{error || text.routeAccountError}</p><button onClick={() => void refresh()} type="button">{text.retry}</button></div>
          : <WorkbenchLlmSettings canManageWorkspace={actor.workspace_role === 'admin'} key={`${actor.workspace_id}:${actor.id}`} teams={teams} />}
    </section>
  </AuthenticatedWorkspaceShell>
}
