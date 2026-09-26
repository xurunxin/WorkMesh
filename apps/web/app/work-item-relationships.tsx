'use client'

// The blocking/related relation editor shown inside the work item detail sheet.
// Extracted from page.tsx (W04) with the detail wiring; it owns its own relation
// and candidate lists and never touches page-level state.

import { type FormEvent, useState } from 'react'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { ApiError, apiMutation, apiRequest, json } from './lib/api'
import { useLocale } from './lib/i18n'
import { useAuthorityLifetime } from './lib/use-authority-lifetime'
import { useRealtimeSubscription } from './lib/realtime'
import { revisionConflictNotice } from './lib/project-work'
import type { WorkItemDto } from '../features/work-items/contracts'

const requestError = (reason: unknown): string => reason instanceof Error ? reason.message : 'Something went wrong.'
const revisionHeader = (revision: number): HeadersInit => ({ ...json({}), 'If-Match': `"revision-${revision}"` })

type Human = { id: string; display_name: string; email: string }
type WorkItem = WorkItemDto & { team_id: string }
type Milestone = { id: string; name: string; description: string | null; target_date: string | null; revision: number }
type WorkItemRelation = { id: string; source_work_item_id: string; target_work_item_id: string; kind: 'blocks' | 'related'; revision: number }

export function MentionPicker({ humans }: { humans: Human[] }) {
  const { relationsCopy: text } = useLocale()
  return <label className="mentions">{text.fieldWorkItem}<select name="mentions" multiple aria-label={text.fieldWorkItem ?? undefined}>{humans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select></label>
}

export function WorkItemRelationships({ authorityKey, item, projectItems }: { authorityKey: string | null; item: WorkItem; projectItems: WorkItemDto[] }) {
  const { relationsCopy: text } = useLocale()
  const isAuthorityCurrent = useAuthorityLifetime()
  const relations = usePagedApiList<WorkItemRelation>(`/api/v1/work-items/${encodeURIComponent(item.id)}/relations`, { scopeKey: authorityKey })
  const candidates = usePagedApiList<WorkItemDto>(`/api/v1/work-items?teamId=${encodeURIComponent(item.team_id)}`, { scopeKey: authorityKey })
  const candidateItems = [...new Map([...projectItems, ...candidates.items].map(candidate => [candidate.id, candidate])).values()]
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<ReturnType<typeof revisionConflictNotice>>(null)
  useRealtimeSubscription([{ type: 'work_item', id: item.id }], invalidation => {
    if (invalidation.reason === 'resync' || [
      ...invalidation.event.scopes,
      ...invalidation.event.invalidates,
    ].some(resource => resource.type === 'work_item' && resource.id === item.id))
      return relations.refresh()
  })
  const workLabel = (id: string) => {
    const target = candidateItems.find(candidate => candidate.id === id)
    return target ? `${target.team_key}-${target.number} · ${target.title}` : id
  }
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setError('')
    try {
      await apiMutation(`work-item:relation:add:${item.id}`, `/api/v1/work-items/${encodeURIComponent(item.id)}/relations`, { method: 'POST', headers: json({}), body: JSON.stringify({ targetWorkItemId: form.get('targetWorkItemId'), kind: form.get('kind') }) })
      if (!isAuthorityCurrent()) return
      formElement.reset(); await relations.refresh()
    } catch (reason) { if (isAuthorityCurrent()) setError(requestError(reason)) }
  }
  const remove = async (relation: WorkItemRelation) => {
    setError('')
    try {
      await apiMutation(`work-item:relation:remove:${relation.id}`, `/api/v1/work-items/${encodeURIComponent(item.id)}/relations/${encodeURIComponent(relation.id)}`, { method: 'DELETE', headers: revisionHeader(relation.revision) })
      if (!isAuthorityCurrent()) return
      await relations.refresh()
    } catch (reason) {
      if (!isAuthorityCurrent()) return
      const notice = reason instanceof ApiError ? revisionConflictNotice(reason) : null
      if (notice) setConflict(notice); else setError(requestError(reason))
    }
  }
  return <section className="relationship-panel" aria-labelledby="relationships-heading">
    <header><div><span className="eyebrow">{text.eyebrow}</span><h3 id="relationships-heading">{text.title}</h3></div></header>
    {(error || relations.error || candidates.error) && <p className="error" role="alert">{error || relations.error?.message || candidates.error?.message} {candidates.error && <button onClick={() => void candidates.refresh()} type="button">{text.reload}</button>}</p>}
    {conflict && <aside className="conflict-notice" role="alert"><div><strong>{text.conflictTitle}</strong><p>{text.conflictAction}</p></div><button onClick={() => { setConflict(null); void relations.refresh() }} type="button">{text.reload}</button></aside>}
    <div className="relation-list">{relations.items.map(relation => {
      const otherId = relation.source_work_item_id === item.id ? relation.target_work_item_id : relation.source_work_item_id
      const direction = relation.kind === 'related' ? text.related : relation.source_work_item_id === item.id ? text.blocks : text.blockedBy
      return <article key={relation.id}><span className={`relation-kind relation-${relation.kind}`}>{direction}</span><strong>{workLabel(otherId)}</strong><button onClick={() => void remove(relation)} type="button">{text.remove}</button></article>
    })}{!relations.loading && relations.items.length === 0 && <p className="empty">{text.empty}</p>}</div>
    <form className="relation-create" onSubmit={event => void add(event)}><label>{text.fieldKind}<select name="kind"><option value="blocks">{text.kindBlocks}</option><option value="related">{text.kindRelated}</option></select></label><label>{text.fieldWorkItem}<select name="targetWorkItemId" required defaultValue=""><option value="" disabled>{text.fieldWorkItemPlaceholder}</option>{candidateItems.filter(candidate => candidate.id !== item.id).map(candidate => <option key={candidate.id} value={candidate.id}>{workLabel(candidate.id)}</option>)}</select></label><button disabled={candidateItems.every(candidate => candidate.id === item.id)} type="submit">{text.add}</button></form>
    <LoadMoreButton collection={candidates} label={text.fieldWorkItem} loadMoreLabel={text.loadMoreCandidates} />
    <LoadMoreButton collection={relations} label={text.loadMore} />
  </section>
}

export type { Milestone }
