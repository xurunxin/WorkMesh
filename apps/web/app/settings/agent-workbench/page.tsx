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
  const { locale, t } = useLocale()
  const zh = locale === 'zh-CN'
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
  const title = zh ? 'Agent 工作台服务接入' : 'Agent workbench services'
  return <AuthenticatedWorkspaceShell
    actorName={actor ? actorDisplayName(actor) : undefined}
    contextLabel={title}
    documentTitle={title}
    headerActions={<LocaleToggle />}
    navigation={[{ href: '/settings', label: zh ? '返回设置' : 'Back to settings' }]}
    skipLabel={t('skipToContent')}
    utilityNavigation={[{ active: true, href: '/settings/agent-workbench', label: title }]}
  >
    <section className="content settings-page">
      {loading && !actor ? <p>{zh ? '正在加载…' : 'Loading…'}</p>
        : !actor ? <div role="alert"><p>{error || (zh ? '无法加载账户。' : 'Could not load account.')}</p><button onClick={() => void refresh()} type="button">{zh ? '重试' : 'Retry'}</button></div>
          : <WorkbenchLlmSettings canManageWorkspace={actor.workspace_role === 'admin'} key={`${actor.workspace_id}:${actor.id}`} teams={teams} />}
    </section>
  </AuthenticatedWorkspaceShell>
}
