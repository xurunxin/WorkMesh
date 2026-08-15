'use client'

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { AppShell, Button } from '@workmesh/ui'
import { ArrowLeft, FloppyDisk, Gear, Plus, Trash } from '@phosphor-icons/react'
import { ApiError, apiRequest, clearCsrfToken, json, saveCsrfToken } from '../lib/api'
import { LoadMoreButton, usePagedApiList } from '../lib/pagination'
import { canManageWorkspace } from '../lib/settings-permissions'
import { actorDisplayName, type AuthenticatedActor } from '../lib/actor'
import { GlobalCommandCenter } from '../../features/command-center'
import { LocaleToggle, useLocale } from '../lib/i18n'

type Actor = AuthenticatedActor
type AuthMe = { actor: Actor; csrfToken: string }
type Team = { id: string; name: string; key: string; revision: number }
type WorkflowState = { id: string; name: string; category: string; color: string; revision: number }

const requestError = (reason: unknown): string => reason instanceof Error ? reason.message : 'Something went wrong.'
const revisionHeader = (revision: number): HeadersInit => ({ ...json({}), 'If-Match': `"revision-${revision}"` })

export default function SettingsPage() {
  const { locale } = useLocale()
  const text = locale === 'zh-CN' ? {
    loading: '正在加载设置…', loadFailed: '无法加载设置。', retry: '重试', back: '返回 Issues', team: '团队', currentTeam: '当前团队', noTeam: '无团队', settings: '设置', title: '设置', workspace: '工作区', subtitle: '工作区管理与日常规划保持分离。', reviewOnly: '你可以查看团队设置；工作区管理员负责管理团队和工作流状态。', workspaceStructure: '工作区结构', teams: '团队', teamName: '团队名称', teamKey: '团队标识', createTeam: '新建团队', selectedTeam: '已选团队', teamDetails: '团队详情', saveChanges: '保存更改', deleteTeam: '删除团队', deleteHelp: '从当前工作区导航中移除此团队。', createFirst: '新建团队后即可配置工作流。', teamWorkflow: '团队工作流', workflowStates: '工作流状态', noStates: '暂无工作流状态。', statusName: '状态名称', category: '分类', color: '颜色', createStatus: '新建状态', selectTeam: '请选择团队以管理工作流。', loadingMore: '正在加载…', loadMoreTeams: '加载更多团队', loadMoreStates: '加载更多工作流状态', mainNavigation: '主导航', workspaceNavigation: '工作区导航', administrationNavigation: '管理导航', mobileNavigation: '移动端导航', menu: '菜单', skip: '跳到主要内容', confirmDelete: (name: string) => `确定删除团队 ${name}？删除后其工作将不可用。`, requestFailed: '操作失败。', categories: { backlog: '待办', planned: '已规划', started: '进行中', completed: '已完成', canceled: '已取消' },
  } : {
    loading: 'Loading Settings…', loadFailed: 'Unable to load Settings.', retry: 'Retry', back: 'Back to Issues', team: 'Team', currentTeam: 'Current team', noTeam: 'No team', settings: 'Settings', title: 'Settings', workspace: 'Workspace', subtitle: 'Workspace administration stays separate from daily planning.', reviewOnly: 'You can review team settings. Workspace admins manage teams and workflow states.', workspaceStructure: 'Workspace structure', teams: 'Teams', teamName: 'Team name', teamKey: 'Team key', createTeam: 'Create team', selectedTeam: 'Selected team', teamDetails: 'Team details', saveChanges: 'Save changes', deleteTeam: 'Delete team', deleteHelp: 'Remove this team from active workspace navigation.', createFirst: 'Create a team to configure its workflow.', teamWorkflow: 'Team workflow', workflowStates: 'Workflow states', noStates: 'No workflow states yet.', statusName: 'Status name', category: 'Category', color: 'Color', createStatus: 'Create status', selectTeam: 'Select a team to manage its workflow.', loadingMore: 'Loading…', loadMoreTeams: 'Load more teams', loadMoreStates: 'Load more workflow states', mainNavigation: 'Main navigation', workspaceNavigation: 'Workspace navigation', administrationNavigation: 'Administration navigation', mobileNavigation: 'Mobile navigation', menu: 'Menu', skip: 'Skip to content', confirmDelete: (name: string) => `Delete team ${name}? Its work remains unavailable after this action.`, requestFailed: 'Something went wrong.', categories: { backlog: 'Backlog', planned: 'Planned', started: 'Started', completed: 'Completed', canceled: 'Canceled' },
  }
  const [actor, setActor] = useState<Actor | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const teamsPage = usePagedApiList<Team>(actor ? '/api/v1/teams' : null)
  const teams = teamsPage.items
  const selectedTeam = teams.find(team => team.id === teamId) ?? null
  const statesPage = usePagedApiList<WorkflowState>(
    actor && selectedTeam ? `/api/v1/teams/${selectedTeam.id}/states` : null,
  )

  const load = useCallback(async () => {
    try {
      setError('')
      const auth = await apiRequest<AuthMe>('/api/v1/auth/me')
      saveCsrfToken(auth.csrfToken)
      setActor(auth.actor)
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        clearCsrfToken()
        window.location.assign('/login')
        return
      }
      setError(requestError(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (teamsPage.loading) return
    setTeamId(current => teams.some(team => team.id === current) ? current : teams[0]?.id ?? null)
  }, [teams, teamsPage.loading])

  const createTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      setError('')
      const team = await apiRequest<Team>('/api/v1/teams', {
        method: 'POST',
        headers: json({}),
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          key: String(form.get('key') ?? '').toUpperCase(),
        }),
      })
      formElement.reset()
      await teamsPage.refresh()
      setTeamId(team.id)
    } catch (reason) { setError(requestError(reason)) }
  }

  const updateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTeam) return
    const form = new FormData(event.currentTarget)
    try {
      setError('')
      await apiRequest(`/api/v1/teams/${selectedTeam.id}`, {
        method: 'PATCH',
        headers: revisionHeader(selectedTeam.revision),
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          key: String(form.get('key') ?? '').toUpperCase(),
        }),
      })
      await teamsPage.refresh()
    } catch (reason) { setError(requestError(reason)) }
  }

  const deleteTeam = async () => {
    if (!selectedTeam || !window.confirm(text.confirmDelete(selectedTeam.name))) return
    try {
      setError('')
      const removedId = selectedTeam.id
      await apiRequest(`/api/v1/teams/${removedId}`, {
        method: 'DELETE',
        headers: { 'If-Match': `"revision-${selectedTeam.revision}"` },
      })
      setTeamId(teams.find(team => team.id !== removedId)?.id ?? null)
      await teamsPage.refresh()
    } catch (reason) { setError(requestError(reason)) }
  }

  const createState = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTeam) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      setError('')
      await apiRequest(`/api/v1/teams/${selectedTeam.id}/states`, {
        method: 'POST',
        headers: json({}),
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          category: form.get('category'),
          color: form.get('color') || undefined,
          position: statesPage.items.length,
        }),
      })
      formElement.reset()
      await statesPage.refresh()
    } catch (reason) { setError(requestError(reason)) }
  }

  if (loading) return <main className="center foundation-center">{text.loading}</main>
  if (!actor) return <main className="center foundation-center"><p className="error">{error || text.loadFailed}</p><Button icon={<ArrowLeft aria-hidden size={16} />} onClick={() => void load()}>{text.retry}</Button></main>
  const canManage = canManageWorkspace(actor.workspace_role)

  return <AppShell
    administrationNavigationLabel={text.administrationNavigation}
    actorName={actorDisplayName(actor)}
    contextLabel={text.workspace}
    headerActions={<div className="shell-action-cluster"><LocaleToggle /><GlobalCommandCenter locale={locale} /></div>}
    mainNavigationLabel={text.mainNavigation}
    menuLabel={text.menu}
    mobileNavigationLabel={text.mobileNavigation}
    navigation={[{ href: '/?view=my-work', icon: <ArrowLeft aria-hidden size={18} />, label: text.back }]}
    productName="WorkMesh"
    skipLabel={text.skip}
    teamSwitcher={<label className="team-switcher">{text.team}<select aria-label={text.currentTeam} value={selectedTeam?.id ?? ''} onChange={event => setTeamId(event.currentTarget.value)}><option value="" disabled>{text.noTeam}</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name} ({team.key})</option>)}</select></label>}
    utilityNavigation={[{ active: true, href: '/settings', icon: <Gear aria-hidden size={18} />, label: text.settings }]}
    workspaceNavigationLabel={text.workspaceNavigation}
  >
    <section className="content settings-page">
      <header><div><h1>{text.title}</h1><p>{text.subtitle}</p></div></header>
      {!canManage && <p className="settings-notice">{text.reviewOnly}</p>}
      {(error || teamsPage.error || statesPage.error) && <p className="error" role="alert">{error || teamsPage.error?.message || statesPage.error?.message}</p>}
      <div className="settings-grid">
        <section className="settings-card" aria-labelledby="team-settings-heading">
          <header><div><p className="eyebrow">{text.workspaceStructure}</p><h2 id="team-settings-heading">{text.teams}</h2></div></header>
          {canManage && <form className="settings-form" onSubmit={createTeam}>
            <label>{text.teamName}<input name="name" required /></label>
            <label>{text.teamKey}<input name="key" pattern="[A-Z][A-Z0-9]{1,9}" placeholder="ENG" required /></label>
            <Button icon={<Plus aria-hidden size={16} />} type="submit" variant="primary">{text.createTeam}</Button>
          </form>}
          <LoadMoreButton collection={teamsPage} label="teams" loadingLabel={text.loadingMore} loadMoreLabel={text.loadMoreTeams} />
        </section>
        <section className="settings-card" aria-labelledby="current-team-heading">
          <header><div><p className="eyebrow">{text.selectedTeam}</p><h2 id="current-team-heading">{text.teamDetails}</h2></div></header>
          {selectedTeam ? <>
            {canManage ? <form className="settings-form" key={`${selectedTeam.id}:${selectedTeam.revision}`} onSubmit={updateTeam}>
              <label>{text.teamName}<input name="name" defaultValue={selectedTeam.name} required /></label>
              <label>{text.teamKey}<input name="key" defaultValue={selectedTeam.key} pattern="[A-Z][A-Z0-9]{1,9}" required /></label>
              <Button icon={<FloppyDisk aria-hidden size={16} />} type="submit">{text.saveChanges}</Button>
            </form> : <dl className="settings-summary"><div><dt>{text.teamName}</dt><dd>{selectedTeam.name}</dd></div><div><dt>{text.teamKey}</dt><dd>{selectedTeam.key}</dd></div></dl>}
            {canManage && <div className="danger-zone"><div><strong>{text.deleteTeam}</strong><p>{text.deleteHelp}</p></div><Button icon={<Trash aria-hidden size={16} />} onClick={() => void deleteTeam()} variant="danger">{text.deleteTeam}</Button></div>}
          </> : <p className="empty">{text.createFirst}</p>}
        </section>
        <section className="settings-card settings-card-wide" aria-labelledby="workflow-settings-heading">
          <header><div><p className="eyebrow">{text.teamWorkflow}</p><h2 id="workflow-settings-heading">{text.workflowStates}</h2></div></header>
          {selectedTeam ? <>
            <div className="workflow-state-list">{statesPage.items.map(state => <article key={state.id}><span className="workflow-color" style={{ backgroundColor: state.color }} aria-hidden="true" /><div><strong>{state.name}</strong><small>{text.categories[state.category as keyof typeof text.categories] ?? state.category}</small></div></article>)}{statesPage.items.length === 0 && <p className="empty">{text.noStates}</p>}</div>
            {canManage && <form className="settings-form settings-form-inline" onSubmit={createState}>
              <label>{text.statusName}<input name="name" required /></label>
              <label>{text.category}<select name="category" defaultValue="planned">{Object.entries(text.categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>{text.color}<input name="color" type="color" defaultValue="#73736f" /></label>
              <Button icon={<Plus aria-hidden size={16} />} type="submit" variant="primary">{text.createStatus}</Button>
            </form>}
            <LoadMoreButton collection={statesPage} label="workflow states" loadingLabel={text.loadingMore} loadMoreLabel={text.loadMoreStates} />
          </> : <p className="empty">{text.selectTeam}</p>}
        </section>
      </div>
    </section>
  </AppShell>
}
