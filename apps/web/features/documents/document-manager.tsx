'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import type { DocumentDiffResponse, DocumentHistoryResponse, DocumentResponse, DocumentRevision } from '@workmesh/contracts'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple'
import {
  Button,
  Dialog,
  DiffView,
  DocumentList,
  DocumentReading,
  DocumentRevisionList,
  DocumentRow,
  DocumentRowGroup,
  SectionHeader,
  TabBar,
} from '@workmesh/ui'
import { ApiError, apiBase, apiMutation, apiRequest, json } from '../../app/lib/api'
import { useLocale } from '../../app/lib/i18n'
import { usePagedApiList } from '../../app/lib/pagination'
import { clearDraft, RichTextEditor, writeDraft, type DraftIdentity } from '../rich-content/editor'
import { RichContent } from '../rich-content/markdown'

type Owner = Readonly<{ type: 'project' | 'work_item'; id: string; teamId: string }>
type Actor = Readonly<{ id: string; workspace_id?: string }>

type Mode = 'view' | 'edit' | 'history'

export function DocumentManager({ actor, onClose, owner }: { actor: Actor; onClose: () => void; owner: Owner }) {
  const { editorCopy, locale } = useLocale()
  const zh = locale === 'zh-CN'
  const copy = zh ? {
    heading: '文档', new: '新建文档', title: '标题', content: '内容', save: '保存修订', cancel: '返回列表',
    edit: '编辑', history: '历史', view: '阅读', empty: '尚无文档。', loading: '正在加载文档…',
    retry: '重试', loadMore: '加载更多', reload: '基于最新版本继续编辑', conflict: '文档已被其他人更新。你的草稿已保留。',
    summary: '修订说明', export: '导出 Markdown', restore: '恢复此版本为新修订',
    archive: '归档', unarchive: '恢复归档', reason: '原因', compare: '与当前版本比较',
    close: '关闭', current: '当前版本', archived: '已归档', noChanges: '无内容差异。',
    revisions: '修订历史', noRevisions: '尚无历史修订。', inspect: '查看此修订',
  } : {
    heading: 'Documents', new: 'New document', title: 'Title', content: 'Content', save: 'Save revision', cancel: 'Back to list',
    edit: 'Edit', history: 'History', view: 'Read', empty: 'No documents yet.', loading: 'Loading documents…',
    retry: 'Retry', loadMore: 'Load more', reload: 'Continue on latest revision', conflict: 'The document changed elsewhere. Your draft is preserved.',
    summary: 'Revision summary', export: 'Export Markdown', restore: 'Restore this version as a new revision',
    archive: 'Archive', unarchive: 'Unarchive', reason: 'Reason', compare: 'Compare with current',
    close: 'Close', current: 'Current revision', archived: 'Archived', noChanges: 'No content differences.',
    revisions: 'Revision history', noRevisions: 'No earlier revisions yet.', inspect: 'Inspect this revision',
  }
  const path = `/api/v1/documents?ownerType=${owner.type}&ownerId=${encodeURIComponent(owner.id)}`
  const collection = usePagedApiList<DocumentResponse>(path, {
    scopeKey: `${actor.workspace_id ?? ''}:${owner.teamId}:${actor.id}:${owner.type}:${owner.id}`,
  })
  const [selected, setSelected] = useState<DocumentResponse | 'new' | null>(null)
  const [mode, setMode] = useState<Mode>('view')
  const [title, setTitle] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [changeSummary, setChangeSummary] = useState('')
  const [statusReason, setStatusReason] = useState('')
  const [history, setHistory] = useState<DocumentHistoryResponse | null>(null)
  const [olderRevision, setOlderRevision] = useState<DocumentRevision | null>(null)
  const [diff, setDiff] = useState<DocumentDiffResponse | null>(null)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const document = selected && selected !== 'new' ? selected : null
  const identity: DraftIdentity = {
    workspaceId: actor.workspace_id ?? '', teamId: owner.teamId, actorId: actor.id,
    resourceType: 'document', resourceId: document?.id ?? `new:${owner.type}:${owner.id}`,
    field: 'markdown', baseRevision: document?.revision ?? 0,
  }

  useEffect(() => {
    setSelected(null); setMode('view'); setHistory(null); setOlderRevision(null); setDiff(null); setError('')
  }, [owner.type, owner.id])

  const choose = (value: DocumentResponse | 'new' | null, afterMutation = false) => {
    if (busyRef.current && !afterMutation) return
    setSelected(value); setMode(value === 'new' ? 'edit' : 'view')
    setTitle(value && value !== 'new' ? value.title : '')
    setMarkdown(value && value !== 'new' ? value.currentRevision.markdown : '')
    setChangeSummary(''); setStatusReason(''); setHistory(null); setOlderRevision(null); setDiff(null)
    setError(''); setConflict(false)
  }

  const reload = async () => {
    if (!document || busyRef.current) return
    try {
      const latest = await apiRequest<DocumentResponse>(`/api/v1/documents/${encodeURIComponent(document.id)}`)
      if (mode === 'edit') {
        const rebasedIdentity = { ...identity, baseRevision: latest.revision }
        writeDraft(window.localStorage, rebasedIdentity, markdown)
        setSelected(latest)
        setConflict(false)
        setError('')
      } else choose(latest)
      await collection.refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected || busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); setConflict(false)
    const body = document
      ? { title: title.trim(), markdown, baseRevisionId: document.currentRevision.id,
          baseContentHash: document.currentRevision.contentHash, changeSummary: changeSummary.trim() || undefined }
      : { ownerType: owner.type, ownerId: owner.id, title: title.trim(), markdown,
          changeSummary: changeSummary.trim() || undefined }
    try {
      const saved = await apiMutation<DocumentResponse>(`document:save:${document?.id ?? owner.id}`,
        document ? `/api/v1/documents/${encodeURIComponent(document.id)}` : '/api/v1/documents', {
          method: document ? 'PATCH' : 'POST',
          headers: document ? { ...json(body), 'If-Match': `"revision-${document.revision}"` } : json(body),
          body: JSON.stringify(body),
        })
      clearDraft(window.localStorage, identity)
      choose(saved, true)
      await collection.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      if (reason instanceof ApiError && reason.status === 409) {
        writeDraft(window.localStorage, identity, markdown)
        setConflict(true)
      }
    } finally { busyRef.current = false; setBusy(false) }
  }

  const loadHistory = async () => {
    if (!document) return
    setError('')
    try {
      const result = await apiRequest<DocumentHistoryResponse>(`/api/v1/documents/${encodeURIComponent(document.id)}/history?limit=100`)
      setHistory(result); setOlderRevision(null); setDiff(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const changeMode = (next: Mode) => {
    if (next === 'history' && !history) void loadHistory()
    setMode(next)
  }
  const moreHistory = async () => {
    if (!document || !history?.nextCursor) return
    try {
      const result = await apiRequest<DocumentHistoryResponse>(`/api/v1/documents/${encodeURIComponent(document.id)}/history?limit=100&cursor=${encodeURIComponent(history.nextCursor)}`)
      setHistory({ ...history, revisions: [...history.revisions, ...result.revisions], nextCursor: result.nextCursor })
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const inspectRevision = async (revisionId: string) => {
    if (!document) return
    setError(''); setDiff(null)
    try {
      const revision = await apiRequest<DocumentRevision>(`/api/v1/documents/${encodeURIComponent(document.id)}/revisions/${encodeURIComponent(revisionId)}`)
      setOlderRevision(revision)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const compare = async () => {
    if (!document || !olderRevision) return
    try {
      const query = new URLSearchParams({ fromRevisionId: olderRevision.id, toRevisionId: document.currentRevision.id })
      setDiff(await apiRequest<DocumentDiffResponse>(`/api/v1/documents/${encodeURIComponent(document.id)}/diff?${query}`))
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const restore = async () => {
    if (!document || !olderRevision || busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); setConflict(false)
    const body = { revisionId: olderRevision.id, baseRevisionId: document.currentRevision.id,
      baseContentHash: document.currentRevision.contentHash,
      changeSummary: changeSummary.trim() || `Restore revision ${olderRevision.revisionNumber}` }
    try {
      const restored = await apiMutation<DocumentResponse>(`document:restore:${document.id}`,
        `/api/v1/documents/${encodeURIComponent(document.id)}/restore`, {
          method: 'POST', headers: { ...json(body), 'If-Match': `"revision-${document.revision}"` }, body: JSON.stringify(body),
        })
      choose(restored, true); await collection.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setConflict(reason instanceof ApiError && reason.status === 409)
    } finally { busyRef.current = false; setBusy(false) }
  }
  const changeArchive = async () => {
    if (!document || busyRef.current || !statusReason.trim()) return
    busyRef.current = true; setBusy(true); setError(''); setConflict(false)
    const action = document.status === 'active' ? 'archive' : 'unarchive'
    const body = { reason: statusReason.trim() }
    try {
      const updated = await apiMutation<DocumentResponse>(`document:${action}:${document.id}`,
        `/api/v1/documents/${encodeURIComponent(document.id)}/${action}`, {
          method: 'POST', headers: { ...json(body), 'If-Match': `"revision-${document.revision}"` }, body: JSON.stringify(body),
        })
      choose(updated, true); await collection.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setConflict(reason instanceof ApiError && reason.status === 409)
    } finally { busyRef.current = false; setBusy(false) }
  }
  const exportMarkdown = async (revisionId?: string) => {
    if (!document) return
    try {
      const url = `${apiBase}/api/v1/documents/${encodeURIComponent(document.id)}/export${revisionId ? `?revisionId=${encodeURIComponent(revisionId)}` : ''}`
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) throw new Error(`${copy.export}: ${response.status}`)
      const objectUrl = URL.createObjectURL(await response.blob())
      const link = window.document.createElement('a')
      link.href = objectUrl
      link.download = `document-${document.id}-r${revisionId && olderRevision && revisionId === olderRevision.id ? olderRevision.revisionNumber : document.currentRevision.revisionNumber}.md`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const editor = <form className="project-form modal-form" onSubmit={event => void save(event)}>
    <label>{copy.title}<input maxLength={180} onChange={event => setTitle(event.currentTarget.value)} required value={title} /></label>
    <div className="form-span"><RichTextEditor copy={editorCopy} identity={identity} label={copy.content} mode="description" name="markdown" onChange={setMarkdown} value={markdown} /></div>
    <label>{copy.summary}<input maxLength={500} onChange={event => setChangeSummary(event.currentTarget.value)} value={changeSummary} /></label>
    <div className="form-actions"><Button disabled={busy} type="submit" variant="primary">{copy.save}</Button></div>
  </form>

  return <Dialog closeLabel={copy.close} onClose={() => { if (!busyRef.current) onClose() }} open title={copy.heading}>
    <div className="wm-document-surface" data-testid="document-manager">
      {error && <div role="alert"><p>{conflict ? copy.conflict : error}</p>{conflict && document && <Button onClick={() => void reload()} type="button" variant="secondary">{copy.reload}</Button>}</div>}

      {selected === null ? <>
        {/* The dialog already names this surface, so the resting state opens with the
            action rather than a second heading saying the same thing. */}
        <div className="wm-responsive-action-bar">
          <Button onClick={() => choose('new')} type="button" variant="primary">{copy.new}</Button>
        </div>
        {collection.loading && !collection.initialized && <p>{copy.loading}</p>}
        {collection.error && <div role="alert"><p>{collection.error.message}</p><Button onClick={() => void collection.refresh()} type="button">{copy.retry}</Button></div>}
        <DocumentList empty={collection.initialized && collection.items.length === 0 ? <p>{copy.empty}</p> : null} testId="document-list">
          <DocumentRowGroup label={copy.heading}>
            {collection.items.map(item => <DocumentRow
              data={{ id: item.id, meta: <>{`r${item.currentRevision.revisionNumber}`}{item.status === 'archived' ? ` · ${copy.archived}` : ''}</>, title: item.title }}
              key={item.id}
              onSelect={() => choose(item)}
            />)}
          </DocumentRowGroup>
        </DocumentList>
        {collection.nextCursor && <Button disabled={collection.loadingMore} onClick={() => void collection.loadMore()} type="button">{copy.loadMore}</Button>}
      </> : <>
        <SectionHeader actions={<>
          <Button onClick={() => choose(null)} type="button">{copy.cancel}</Button>
          {document && <Button icon={<DownloadSimpleIcon aria-hidden="true" size={16} />} onClick={() => void exportMarkdown()} type="button" variant="secondary">{copy.export}</Button>}
        </>} label={document ? document.title : copy.heading} />

        {selected === 'new' ? editor : <>
          <TabBar ariaLabel={copy.heading} onValueChange={value => changeMode(value as Mode)} tabs={[
            { id: 'view', label: copy.view },
            ...(document?.status === 'active' ? [{ id: 'edit' as const, label: copy.edit }] : []),
            { id: 'history', label: copy.history, badge: history?.revisions.length },
          ]} value={mode} />

          {mode === 'edit' && editor}
          {document && mode === 'view' && <DocumentReading
            revisionLabel={`r${document.currentRevision.revisionNumber} · ${document.currentRevision.contentHash}`}
            status={document.status === 'archived' ? copy.archived : copy.current}
          >
            <RichContent source={document.currentRevision.markdown} />
            <label>{copy.reason}<input maxLength={2000} onChange={event => setStatusReason(event.currentTarget.value)} value={statusReason} /></label>
            <Button disabled={busy || !statusReason.trim()} onClick={() => void changeArchive()} type="button" variant="secondary">{document.status === 'active' ? copy.archive : copy.unarchive}</Button>
          </DocumentReading>}

          {document && mode === 'history' && <>
            <DocumentRevisionList
              empty={<p>{copy.noRevisions}</p>}
              onInspect={revisionId => void inspectRevision(revisionId)}
              revisions={(history?.revisions ?? []).map(revision => ({ id: revision.id, label: `${revision.title} · ${new Date(revision.createdAt).toLocaleString(locale)}`, title: `r${revision.revisionNumber}` }))}
              selectedRevisionId={olderRevision?.id ?? null}
            />
            {history?.nextCursor && <Button onClick={() => void moreHistory()} type="button">{copy.loadMore}</Button>}
            {olderRevision && <DocumentReading revisionLabel={`r${olderRevision.revisionNumber} · ${olderRevision.contentHash}`} title={olderRevision.title}>
              <RichContent source={olderRevision.markdown} />
              <div className="wm-responsive-action-bar">
                <Button onClick={() => void exportMarkdown(olderRevision.id)} type="button">{copy.export}</Button>
                <Button onClick={() => void compare()} type="button">{copy.compare}</Button>
              </div>
              {diff && <DiffView changes={diff.changes} emptyLabel={copy.noChanges} />}
              {olderRevision.id !== document.currentRevision.id && document.status === 'active' && <>
                <label>{copy.summary}<input maxLength={500} onChange={event => setChangeSummary(event.currentTarget.value)} value={changeSummary} /></label>
                <Button disabled={busy} onClick={() => void restore()} type="button" variant="secondary">{copy.restore}</Button>
              </>}
            </DocumentReading>}
          </>}
        </>}
      </>}
    </div>
  </Dialog>
}
