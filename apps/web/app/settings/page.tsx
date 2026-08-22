'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { AppShell, Button } from '@workmesh/ui'
import { ArrowLeft, FloppyDisk, Gear, Plus, Trash } from '@phosphor-icons/react'
import { apiRequest, json } from '../lib/api'
import { LoadMoreButton, usePagedApiList } from '../lib/pagination'
import { canManageWorkspace } from '../lib/settings-permissions'
import { actorDisplayName } from '../lib/actor'
import { GlobalCommandCenter } from '../../features/command-center'
import { LocaleToggle, useLocale } from '../lib/i18n'
import { useAuthenticatedActor } from '../lib/use-authenticated-actor'
import { OperationsContent } from '../operations-content'

type Team = { id: string; name: string; key: string; revision: number }
type WorkflowState = { id: string; name: string; category: string; color: string; revision: number }

type SettingsTab = 'workspace' | 'operations'

const requestError = (reason: unknown): string => reason instanceof Error ? reason.message : 'Something went wrong.'
const revisionHeader = (revision: number): HeadersInit => ({ ...json({}), 'If-Match': `"revision-${revision}"` })

const parseTab = (raw: string | null | undefined): SettingsTab =>
  raw === 'operations' ? 'operations' : 'workspace'

export default function SettingsPage() {
  const { locale, settingsCopy: text, t } = useLocale()
  const { actor, loading, error: actorError, refresh: refreshActor } = useAuthenticatedActor()
  const [teamId, setTeamId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<SettingsTab>('workspace')
  const teamsPage = usePagedApiList<Team>(actor ? '/api/v1/teams' : null)
  const teams = teamsPage.items
  const selectedTeam = teams.find(team => team.id === teamId) ?? null
  const statesPage = usePagedApiList<WorkflowState>(
    actor && selectedTeam ? `/api/v1/teams/${selectedTeam.id}/states` : null,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setTab(parseTab(params.get('tab')))
  }, [])
  useEffect(() => {
    if (teamsPage.loading) return
    setTeamId(current => teams.some(team => team.id === current) ? current : teams[0]?.id ?? null)
  }, [teams, teamsPage.loading])

  const selectTab = (next: SettingsTab) => {
    setTab(next)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (next === 'operations') {
      url.searchParams.set('tab', 'operations')
      url.hash = 'settings-tab-operations'
    } else {
      url.searchParams.delete('tab')
      url.hash = 'settings-tab-workspace'
    }
    window.history.replaceState(null, '', url.toString())
  }

  const tabs = useMemo(() => ([
    { key: 'workspace' as const, id: 'settings-tab-workspace', label: text.tabWorkspace, description: text.tabWorkspaceDescription },
    { key: 'operations' as const, id: 'settings-tab-operations', label: text.tabOperations, description: text.tabOperationsDescription },
  ]), [text.tabWorkspace, text.tabWorkspaceDescription, text.tabOperations, text.tabOperationsDescription])

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
  if (!actor) return <main className="center foundation-center"><p className="error">{actorError || text.loadFailed}</p><Button icon={<ArrowLeft aria-hidden size={16} />} onClick={() => void refreshActor()}>{text.retry}</Button></main>
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
      <nav className="settings-tabs" role="tablist" aria-label={text.settingsTabsLabel}>
        {tabs.map(entry => (
          <button
            aria-controls={entry.id}
            aria-selected={tab === entry.key}
            className={tab === entry.key ? 'is-selected' : ''}
            id={`${entry.id}-trigger`}
            key={entry.key}
            onClick={() => selectTab(entry.key)}
            role="tab"
            type="button"
          >
            <span className="settings-tab-label">{entry.label}</span>
            <span className="settings-tab-description">{entry.description}</span>
          </button>
        ))}
      </nav>
      <div className="settings-tab-panels">
        <section
          aria-labelledby="settings-tab-workspace-trigger"
          className={`settings-tab-panel${tab === 'workspace' ? ' is-active' : ''}`}
          hidden={tab !== 'workspace'}
          id="settings-tab-workspace"
          role="tabpanel"
        >
          {!canManage && <p className="settings-notice">{text.reviewOnly}</p>}
          {(error || teamsPage.error || statesPage.error) && tab === 'workspace' && <p className="error" role="alert">{error || teamsPage.error?.message || statesPage.error?.message}</p>}
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
        <section
          aria-labelledby="settings-tab-operations-trigger"
          className={`settings-tab-panel${tab === 'operations' ? ' is-active' : ''}`}
          hidden={tab !== 'operations'}
          id="settings-tab-operations"
          role="tabpanel"
        >
          <OperationsContent embedded />
        </section>
      </div>
    </section>
  </AppShell>
}
