'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Button, Dialog } from '@workmesh/ui'
import { ApiError, apiMutation, apiRequest, json } from '../../app/lib/api'
import { useLocale } from '../../app/lib/i18n'
import { usePagedApiList } from '../../app/lib/pagination'
import { clearDraft, RichTextEditor, writeDraft, type DraftIdentity } from '../rich-content/editor'
import { RichContent } from '../rich-content/markdown'

type Milestone = Readonly<{
  id: string
  name: string
  description: string | null
  target_date: string | null
  revision: number
}>

type Actor = Readonly<{ id: string; workspace_id?: string }>

export function ProjectMilestones({ actor, onChanged, onClose, open, projectId, teamId }: {
  actor: Actor
  onChanged: () => void
  onClose: () => void
  open: boolean
  projectId: string
  teamId: string
}) {
  const { editorCopy, locale } = useLocale()
  const zh = locale === 'zh-CN'
  const copy = zh ? {
    title: '项目里程碑', create: '新建里程碑', edit: '编辑', save: '保存里程碑',
    delete: '删除', cancel: '取消', close: '关闭', name: '名称', description: '描述',
    targetDate: '目标日期', empty: '尚无里程碑。', loading: '正在加载里程碑…',
    loadMore: '加载更多里程碑', retry: '重试', reload: '重新加载最新版本',
    confirmDelete: '确定删除此里程碑？已关联工作项的里程碑不能删除。',
  } : {
    title: 'Project milestones', create: 'New milestone', edit: 'Edit', save: 'Save milestone',
    delete: 'Delete', cancel: 'Cancel', close: 'Close', name: 'Name', description: 'Description',
    targetDate: 'Target date', empty: 'No milestones yet.', loading: 'Loading milestones…',
    loadMore: 'Load more milestones', retry: 'Retry', reload: 'Reload latest version',
    confirmDelete: 'Delete this milestone? Milestones linked to active work items cannot be deleted.',
  }
  const collection = usePagedApiList<Milestone>(open ? `/api/v1/projects/${encodeURIComponent(projectId)}/milestones` : null, {
    scopeKey: `${actor.workspace_id ?? ''}:${actor.id}:${teamId}:${projectId}`,
  })
  const [selection, setSelection] = useState<Milestone | 'new' | null>(null)
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const selected = selection && selection !== 'new' ? selection : null
  const identity: DraftIdentity = {
    workspaceId: actor.workspace_id ?? '', teamId, actorId: actor.id,
    resourceType: 'project_milestone', resourceId: selected?.id ?? `new:${projectId}`,
    field: 'description', baseRevision: selected?.revision ?? 0,
  }

  useEffect(() => {
    if (!open) return
    setSelection(null)
    setDescription('')
    setError('')
    setConflict(false)
  }, [open, projectId])

  const choose = (milestone: Milestone | 'new' | null) => {
    if (busyRef.current) return
    setSelection(milestone)
    setDescription(milestone && milestone !== 'new' ? milestone.description ?? '' : '')
    setError('')
    setConflict(false)
  }

  const reloadSelected = async () => {
    if (!selected || busyRef.current) return
    try {
      const latest = await apiRequest<Milestone>(`/api/v1/milestones/${encodeURIComponent(selected.id)}`)
      setSelection(latest)
      setDescription(latest.description ?? '')
      setError('')
      setConflict(false)
      await collection.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selection || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    setConflict(false)
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const targetDate = String(form.get('targetDate') ?? '')
    const body = selected
      ? { name, description: description || null, targetDate: targetDate || null }
      : { name, description: description || undefined, targetDate: targetDate || undefined }
    try {
      await apiMutation(`milestone:save:${selected?.id ?? projectId}`, selected ? `/api/v1/milestones/${encodeURIComponent(selected.id)}` : `/api/v1/projects/${encodeURIComponent(projectId)}/milestones`, {
        method: selected ? 'PATCH' : 'POST',
        headers: selected ? { ...json(body), 'If-Match': `"revision-${selected.revision}"` } : json(body),
        body: JSON.stringify(body),
      })
      clearDraft(window.localStorage, identity)
      setSelection(null)
      setDescription('')
      await collection.refresh()
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      if (reason instanceof ApiError && reason.status === 409) writeDraft(window.localStorage, identity, description)
      setConflict(reason instanceof ApiError && reason.status === 409)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!selected || busyRef.current || !window.confirm(copy.confirmDelete)) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      await apiMutation(`milestone:delete:${selected.id}`, `/api/v1/milestones/${encodeURIComponent(selected.id)}`, {
        method: 'DELETE', headers: { 'If-Match': `"revision-${selected.revision}"` },
      })
      setSelection(null)
      setDescription('')
      await collection.refresh()
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setConflict(reason instanceof ApiError && reason.status === 409)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return <Dialog closeLabel={copy.close} onClose={() => { if (!busyRef.current) onClose() }} open={open} title={copy.title}>
    <div className="project-milestone-manager" data-testid="project-milestones">
      {error && <div role="alert"><p>{error}</p>{conflict && selected && <Button onClick={() => void reloadSelected()} type="button" variant="secondary">{copy.reload}</Button>}</div>}
      {selection ? <form className="project-form modal-form" data-testid="milestone-form" onSubmit={event => void save(event)}>
        <label>{copy.name}<input defaultValue={selected?.name ?? ''} key={`name-${selected?.id ?? 'new'}-${selected?.revision ?? 0}`} maxLength={180} name="name" required /></label>
        <label>{copy.targetDate}<input defaultValue={selected?.target_date?.slice(0, 10) ?? ''} key={`date-${selected?.id ?? 'new'}-${selected?.revision ?? 0}`} name="targetDate" type="date" /></label>
        <div className="form-span"><RichTextEditor copy={editorCopy} identity={identity} label={copy.description} mode="description" name="description" onChange={setDescription} value={description} /></div>
        <div className="form-actions"><Button disabled={busy} onClick={() => choose(null)} type="button">{copy.cancel}</Button>{selected && <Button disabled={busy} onClick={() => void remove()} type="button" variant="secondary">{copy.delete}</Button>}<Button disabled={busy} type="submit" variant="primary">{copy.save}</Button></div>
      </form> : <>
        <Button onClick={() => choose('new')} type="button" variant="primary">{copy.create}</Button>
        {collection.loading && !collection.initialized && <p>{copy.loading}</p>}
        {collection.error && <div role="alert"><p>{collection.error.message}</p><Button onClick={() => void collection.refresh()} type="button">{copy.retry}</Button></div>}
        {collection.initialized && collection.items.length === 0 && <p>{copy.empty}</p>}
        <ul className="project-milestone-list">{collection.items.map(milestone => <li key={milestone.id}>
          <div><strong>{milestone.name}</strong>{milestone.target_date && <time dateTime={milestone.target_date}>{milestone.target_date.slice(0, 10)}</time>}</div>
          {milestone.description && <RichContent density="compact" source={milestone.description} />}
          <Button onClick={() => choose(milestone)} type="button" variant="secondary">{copy.edit} {milestone.name}</Button>
        </li>)}</ul>
        {collection.nextCursor && <Button disabled={collection.loadingMore} onClick={() => void collection.loadMore()} type="button">{copy.loadMore}</Button>}
      </>}
    </div>
  </Dialog>
}
