'use client'

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { AppShell, Button } from '@workmesh/ui'
import { ApiError, apiRequest, clearCsrfToken, json, saveCsrfToken } from '../lib/api'
import { LoadMoreButton, usePagedApiList } from '../lib/pagination'
import { canManageWorkspace } from '../lib/settings-permissions'
import { actorDisplayName, type AuthenticatedActor } from '../lib/actor'
import { GlobalCommandCenter } from '../../features/command-center'

type Actor = AuthenticatedActor
type AuthMe = { actor: Actor; csrfToken: string }
type Team = { id: string; name: string; key: string; revision: number }
type WorkflowState = { id: string; name: string; category: string; color: string; revision: number }

const requestError = (reason: unknown): string => reason instanceof Error ? reason.message : 'Something went wrong.'
const revisionHeader = (revision: number): HeadersInit => ({ ...json({}), 'If-Match': `"revision-${revision}"` })

export default function SettingsPage() {
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
    if (!selectedTeam || !window.confirm(`Delete team ${selectedTeam.name}? Its work remains unavailable after this action.`)) return
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

  if (loading) return <main className="center foundation-center">Loading Settings…</main>
  if (!actor) return <main className="center foundation-center"><p className="error">{error || 'Unable to load Settings.'}</p><Button onClick={() => void load()}>Retry</Button></main>
  const canManage = canManageWorkspace(actor.workspace_role)

  return <AppShell
    actorName={actorDisplayName(actor)}
    headerActions={<GlobalCommandCenter />}
    navigation={[{ href: '/?view=my-work', label: 'Back to daily work' }]}
    productName="WorkMesh"
    teamSwitcher={<label className="team-switcher">Team<select aria-label="Current team" value={selectedTeam?.id ?? ''} onChange={event => setTeamId(event.currentTarget.value)}><option value="" disabled>No team</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name} ({team.key})</option>)}</select></label>}
    utilityNavigation={[{ active: true, href: '/settings', label: 'Settings' }]}
  >
    <section className="content settings-page">
      <header><div><h1>Settings</h1><p>Workspace administration stays separate from daily planning.</p></div></header>
      {!canManage && <p className="settings-notice">You can review team settings. Workspace admins manage teams and workflow states.</p>}
      {(error || teamsPage.error || statesPage.error) && <p className="error" role="alert">{error || teamsPage.error?.message || statesPage.error?.message}</p>}
      <div className="settings-grid">
        <section className="settings-card" aria-labelledby="team-settings-heading">
          <header><div><p className="eyebrow">Workspace structure</p><h2 id="team-settings-heading">Teams</h2></div></header>
          {canManage && <form className="settings-form" onSubmit={createTeam}>
            <label>Team name<input name="name" required /></label>
            <label>Team key<input name="key" pattern="[A-Z][A-Z0-9]{1,9}" placeholder="ENG" required /></label>
            <Button type="submit" variant="primary">Create team</Button>
          </form>}
          <LoadMoreButton collection={teamsPage} label="teams" />
        </section>
        <section className="settings-card" aria-labelledby="current-team-heading">
          <header><div><p className="eyebrow">Selected team</p><h2 id="current-team-heading">Team details</h2></div></header>
          {selectedTeam ? <>
            {canManage ? <form className="settings-form" key={`${selectedTeam.id}:${selectedTeam.revision}`} onSubmit={updateTeam}>
              <label>Team name<input name="name" defaultValue={selectedTeam.name} required /></label>
              <label>Team key<input name="key" defaultValue={selectedTeam.key} pattern="[A-Z][A-Z0-9]{1,9}" required /></label>
              <Button type="submit">Save changes</Button>
            </form> : <dl className="settings-summary"><div><dt>Team name</dt><dd>{selectedTeam.name}</dd></div><div><dt>Team key</dt><dd>{selectedTeam.key}</dd></div></dl>}
            {canManage && <div className="danger-zone"><div><strong>Delete team</strong><p>Remove this team from active workspace navigation.</p></div><Button onClick={() => void deleteTeam()} variant="danger">Delete team</Button></div>}
          </> : <p className="empty">Create a team to configure its workflow.</p>}
        </section>
        <section className="settings-card settings-card-wide" aria-labelledby="workflow-settings-heading">
          <header><div><p className="eyebrow">Team workflow</p><h2 id="workflow-settings-heading">Workflow states</h2></div></header>
          {selectedTeam ? <>
            <div className="workflow-state-list">{statesPage.items.map(state => <article key={state.id}><span className="workflow-color" style={{ backgroundColor: state.color }} aria-hidden="true" /><div><strong>{state.name}</strong><small>{state.category}</small></div></article>)}{statesPage.items.length === 0 && <p className="empty">No workflow states yet.</p>}</div>
            {canManage && <form className="settings-form settings-form-inline" onSubmit={createState}>
              <label>Status name<input name="name" required /></label>
              <label>Category<select name="category" defaultValue="planned"><option value="backlog">Backlog</option><option value="planned">Planned</option><option value="started">Started</option><option value="completed">Completed</option><option value="canceled">Canceled</option></select></label>
              <label>Color<input name="color" type="color" defaultValue="#73736f" /></label>
              <Button type="submit" variant="primary">Create status</Button>
            </form>}
            <LoadMoreButton collection={statesPage} label="workflow states" />
          </> : <p className="empty">Select a team to manage its workflow.</p>}
        </section>
      </div>
    </section>
  </AppShell>
}
