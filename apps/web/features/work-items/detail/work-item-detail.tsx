'use client'

import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Button, ConflictState, ErrorState, ForbiddenState, Sheet } from '@workmesh/ui'
import type { StructuredDetailError, WorkItemDetailDraft, WorkItemDetailModel, WorkItemDetailOptions } from './contracts'
import { detailDraft, sameDetailDraft } from './view-model'
import { clearDraft, RichTextEditor, type DraftIdentity } from '../../rich-content/editor'

type Props = {
  mode: 'sheet' | 'full_page'
  model: WorkItemDetailModel
  options: WorkItemDetailOptions
  error?: StructuredDetailError | null
  conflict?: StructuredDetailError | null
  supplemental: ReactNode
  resetKey: number
  draftIdentity: Omit<DraftIdentity, 'field' | 'baseRevision'>
  onClose: () => void
  onOpenFull: () => void
  onReloadLatest: () => void
  onSave: (draft: WorkItemDetailDraft) => Promise<void>
}

type UnavailableProps = {
  mode: 'sheet' | 'full_page'
  requestedKey: string
  error: StructuredDetailError
  onClose: () => void
  onRetry: () => void
}

const errorDescription = (error: StructuredDetailError): string =>
  `${error.message} ${error.correlationId ? `Correlation ${error.correlationId}. ` : ''}${error.safeNextAction}`

function DetailUnavailableContent({ mode, requestedKey, error, onClose, onRetry }: UnavailableProps) {
  const state = error.httpStatus === 403
    ? <ForbiddenState description={errorDescription(error)} title="Work Item access denied" />
    : <ErrorState actionLabel="Retry" description={errorDescription(error)} onAction={onRetry} title={error.httpStatus === 404 ? 'Work Item not found or deleted' : error.code === 'NETWORK_UNAVAILABLE' ? 'Work Item is offline' : 'Work Item could not load'} />
  const body = <div className="work-item-detail work-item-detail-unavailable" data-mode={mode} data-testid="work-item-detail-unavailable">
    <header className="work-item-detail-toolbar"><div><span className="eyebrow">{mode === 'full_page' ? 'Full Work Item' : 'Quick view'}</span><strong>{requestedKey}</strong></div><Button onClick={onClose} type="button" variant="ghost">Close</Button></header>
    {state}
  </div>
  return mode === 'sheet'
    ? <Sheet description="The requested authorized Work Item projection is unavailable." onClose={onClose} open title={requestedKey}>{body}</Sheet>
    : <section className="work-item-full-page" aria-label="Full Work Item view">{body}</section>
}

function WorkItemDetailContent({ mode, model, options, error, conflict, supplemental, draftIdentity, onClose, onOpenFull, onReloadLatest, onSave }: Props) {
  const fullPageRef = useRef<HTMLElement | null>(null)
  // The route adapter rebuilds the view-model object on ordinary parent renders.
  // Reset drafts only when the durable resource version changes; otherwise a
  // structured conflict render would erase the Human's unsaved intent.
  const initial = useMemo(() => detailDraft(model), [model.id, model.revision])
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(initial), [initial])
  const dirty = !sameDetailDraft(initial, draft)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => { if (mode === 'full_page') fullPageRef.current?.focus() }, [mode])
  const confirmDiscard = (action: () => void) => { if (!dirty || window.confirm('Discard unsaved Work Item changes?')) action() }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true)
    try {
      await onSave(draft)
      clearDraft(localStorage, { ...draftIdentity, field: 'description', baseRevision: model.revision })
    } finally { setSaving(false) }
  }
  const set = <Key extends keyof WorkItemDetailDraft>(key: Key, value: WorkItemDetailDraft[Key]) => setDraft(current => ({ ...current, [key]: value }))
  const body = <div className="work-item-detail" data-mode={mode} data-testid="work-item-detail">
    <header className="work-item-detail-toolbar"><div><span className="eyebrow">{mode === 'full_page' ? 'Full Work Item' : 'Quick view'}</span><strong>{model.key}</strong><small>Revision {model.revision}</small></div><div>{mode === 'sheet' && <Button onClick={() => confirmDiscard(onOpenFull)} type="button" variant="secondary">Open full page</Button>}<Button onClick={() => confirmDiscard(onClose)} type="button" variant="ghost">Close</Button></div></header>
    {error?.httpStatus === 403 ? <ForbiddenState description={errorDescription(error)} title="Work Item access denied" /> : error && <ErrorState actionLabel="Reload latest" description={errorDescription(error)} onAction={() => confirmDiscard(onReloadLatest)} title={error.httpStatus === 404 ? 'Work Item not found or deleted' : error.code === 'NETWORK_UNAVAILABLE' ? 'Work Item is offline' : 'Work Item could not load'} />}
    {conflict && <ConflictState actionLabel="Load latest version" description={`${conflict.message} ${conflict.correlationId ? `Correlation ${conflict.correlationId}. ` : ''}Your unsaved intent is preserved until you choose to load the latest server version.`} onAction={onReloadLatest} title="The Work Item changed on the server" />}
    <div className="work-item-detail-layout">
      <form className="work-item-detail-form" data-dirty={dirty} onSubmit={event => void submit(event)}>
        <section className="work-item-detail-content" aria-labelledby="work-item-content-heading"><h3 id="work-item-content-heading">Work Item</h3><label>Title<input name="title" required value={draft.title} onChange={event => set('title', event.currentTarget.value)} /></label><RichTextEditor identity={{...draftIdentity,field:'description',baseRevision:model.revision}} label="Description (Markdown)" name="description" value={draft.description} onChange={value=>set('description',value)} /></section>
        <aside className="work-item-properties" aria-labelledby="work-item-properties-heading"><h3 id="work-item-properties-heading">Properties</h3><label>Workflow status<select name="statusId" value={draft.statusId} onChange={event => set('statusId', event.currentTarget.value)}>{options.statuses.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><small>Work Item lifecycle, independent from Agent execution.</small></label><label>Priority<select name="priority" value={draft.priority} onChange={event => set('priority', event.currentTarget.value as WorkItemDetailDraft['priority'])}>{['none', 'urgent', 'high', 'medium', 'low'].map(priority => <option key={priority} value={priority}>{priority}</option>)}</select></label><label>Due date<input name="dueDate" type="date" value={draft.dueDate} onChange={event => set('dueDate', event.currentTarget.value)} /></label><label>Responsible Human<select name="responsibleHumanActorId" value={draft.responsibleHumanActorId} onChange={event => set('responsibleHumanActorId', event.currentTarget.value)}><option value="">Unassigned</option>{options.humans.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><small>Accountable for the outcome; never an Agent assignment.</small></label><label>Project<select name="projectId" value={draft.projectId} onChange={event => set('projectId', event.currentTarget.value)}><option value="">No project</option>{options.projects.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Milestone<select name="milestoneId" value={draft.milestoneId} onChange={event => set('milestoneId', event.currentTarget.value)}><option value="">No milestone</option>{options.milestones.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Parent Work Item<select name="parentId" value={draft.parentId} onChange={event => set('parentId', event.currentTarget.value)}><option value="">No parent</option>{options.parents.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Labels<input name="labels" value={draft.labels} onChange={event => set('labels', event.currentTarget.value)} /></label></aside>
        <div className="work-item-detail-actions"><Button disabled={saving || !dirty} type="submit" variant="primary">{saving ? 'Saving…' : 'Save changes'}</Button><Button onClick={() => confirmDiscard(onReloadLatest)} type="button" variant="secondary">Reload latest</Button><span aria-live="polite">{dirty ? 'Unsaved changes' : 'All changes saved'}</span></div>
      </form>
      <section className="responsibility-projection" aria-labelledby="responsibility-heading"><h3 id="responsibility-heading">Human responsibility</h3><strong data-testid="responsible-human">{model.responsibleHuman?.displayName ?? 'Unassigned'}</strong><p>Owns the outcome and workflow decision.</p></section>
      <section className="agent-execution-projection" aria-labelledby="agent-executions-heading"><h3 id="agent-executions-heading">Agent executions</h3>{model.agentExecutions.length ? model.agentExecutions.map(execution => <article key={execution.delegation.leaseId}><strong>{execution.agent.displayName}</strong><span>Execution state: {execution.executionState}</span><span>Session {execution.sessionId.slice(0, 8)}</span><span>Heartbeat: {execution.heartbeat.health}</span><span>Delegation: {execution.delegation.kind}</span></article>) : <p>No Agent currently holds an execution or review lease.</p>}</section>
      <div className="work-item-detail-supplemental">{supplemental}</div>
    </div>
  </div>
  return mode === 'sheet' ? <Sheet description="Edit the authorized Work Item projection." onClose={() => confirmDiscard(onClose)} open title={model.key}>{body}</Sheet> : <section className="work-item-full-page" aria-label="Full Work Item view" ref={fullPageRef} tabIndex={-1}>{body}</section>
}

export function WorkItemDetail(props: Props) { return <WorkItemDetailContent key={`${props.model.id}:${props.model.revision}:${props.mode}:${props.resetKey}`} {...props} /> }
export function WorkItemDetailUnavailable(props: UnavailableProps) { return <DetailUnavailableContent key={`${props.requestedKey}:${props.mode}:${props.error.code}`} {...props} /> }
