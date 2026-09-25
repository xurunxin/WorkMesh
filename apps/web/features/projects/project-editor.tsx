'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Button, Dialog } from '@workmesh/ui'
import { ApiError, apiMutation, json } from '../../app/lib/api'
import { useLocale } from '../../app/lib/i18n'
import { clearDraft, RichTextEditor, writeDraft, type DraftIdentity } from '../rich-content/editor'

export type EditableProject = Readonly<{
  id: string
  team_id: string
  name: string
  summary: string | null
  description: string | null
  status: string
  lead_actor_id: string | null
  target_date: string | null
  revision: number
}>

type Actor = Readonly<{ id: string; workspace_id?: string }>
type Human = Readonly<{ id: string; display_name: string }>

export function ProjectEditor({ actor, humans, mode, onClose, onReload, onSaved, open, project, teamId }: {
  actor: Actor
  humans: readonly Human[]
  mode: 'create' | 'edit'
  onClose: () => void
  onReload?: () => Promise<void>
  onSaved: (id: string) => void
  open: boolean
  project?: EditableProject | null
  teamId: string
}) {
  const { editorCopy, t } = useLocale()
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const editing = mode === 'edit' && Boolean(project)
  const identity: DraftIdentity = {
    workspaceId: actor.workspace_id ?? '', teamId, actorId: actor.id,
    resourceType: 'project', resourceId: editing ? project!.id : 'new',
    field: 'description', baseRevision: editing ? project!.revision : 0,
  }

  useEffect(() => {
    if (!open) return
    setDescription(editing ? project?.description ?? '' : '')
    setError('')
    setConflict(false)
  }, [open, mode, project?.id, project?.revision, editing])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busyRef.current || !teamId || (mode === 'edit' && !project)) return
    busyRef.current = true
    setBusy(true)
    setError('')
    setConflict(false)
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const summary = String(form.get('summary') ?? '').trim()
    const leadActorId = String(form.get('leadActorId') ?? '') || null
    const targetDate = String(form.get('targetDate') ?? '') || null
    const body = mode === 'create'
      ? { teamId, name, summary, description, leadActorId, targetDate }
      : { name, summary, description, status: String(form.get('status') ?? '').trim(), leadActorId, targetDate }
    try {
      const result = await apiMutation<{ id: string }>(
        `project:${mode}:${editing ? project!.id : teamId}`,
        mode === 'create' ? '/api/v1/projects' : `/api/v1/projects/${encodeURIComponent(project!.id)}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: mode === 'create' ? json(body) : { ...json(body), 'If-Match': `"revision-${project!.revision}"` },
        body: JSON.stringify(body),
      })
      clearDraft(window.localStorage, identity)
      setDescription('')
      onClose()
      onSaved(result.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('actionCouldNotComplete'))
      if (reason instanceof ApiError && reason.status === 409) writeDraft(window.localStorage, identity, description)
      setConflict(reason instanceof ApiError && reason.status === 409)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return <Dialog closeLabel={t('close')} onClose={onClose} open={open} title={editing ? t('editProject') : t('createProject')}>
    <form className="project-form modal-form" data-testid={editing ? 'edit-project' : 'create-project'} onSubmit={event => void submit(event)}>
      {error && <div className="form-span" role="alert"><p>{error}</p>{conflict && onReload &&
        <Button onClick={() => void onReload()} type="button" variant="secondary">{t('reloadLatestWork')}</Button>}</div>}
      <label>{t('projectName')}<input defaultValue={editing ? project?.name : ''} key={`name-${project?.id ?? 'new'}-${project?.revision ?? 0}`} maxLength={180} name="name" required /></label>
      <label>{t('summary')}<input defaultValue={editing ? project?.summary ?? '' : ''} key={`summary-${project?.id ?? 'new'}-${project?.revision ?? 0}`} maxLength={500} name="summary" /></label>
      {editing && <label>{t('status')}<input defaultValue={project?.status} key={`status-${project?.id}-${project?.revision}`} maxLength={80} name="status" required /></label>}
      <label>{t('targetDate')}<input defaultValue={editing ? project?.target_date?.slice(0, 10) ?? '' : ''} key={`date-${project?.id ?? 'new'}-${project?.revision ?? 0}`} name="targetDate" type="date" /></label>
      <label>{t('lead')}<select defaultValue={editing ? project?.lead_actor_id ?? '' : ''} key={`lead-${project?.id ?? 'new'}-${project?.revision ?? 0}`} name="leadActorId"><option value="">{t('noLead')}</option>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select></label>
      <div className="form-span"><RichTextEditor copy={editorCopy} identity={identity} label={t('description')} mode="description" name="description" onChange={setDescription} value={description} /></div>
      <div className="form-actions"><Button disabled={busy} onClick={onClose} type="button">{t('cancel')}</Button><Button disabled={busy} type="submit" variant="primary">{editing ? t('saveChanges') : t('createProject')}</Button></div>
    </form>
  </Dialog>
}
