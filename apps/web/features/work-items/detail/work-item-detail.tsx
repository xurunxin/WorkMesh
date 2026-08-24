'use client'

import { type FormEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button, ConflictState, ErrorState, ForbiddenState, Sheet, Tabs } from '@workmesh/ui'
import { ArrowClockwise, ArrowSquareOut, FloppyDisk, X } from '@phosphor-icons/react'
import { useMediaQuery } from '../../../app/lib/use-media-query'
import type { StructuredDetailError, WorkItemDetailDraft, WorkItemDetailModel, WorkItemDetailOptions } from './contracts'
import { detailDraft, sameDetailDraft } from './view-model'
import { clearDraft, RichTextEditor, type DraftIdentity, type RichTextEditorCopy } from '../../rich-content/editor'

export type WorkItemDetailCopy = {
  agentExecutions: string
  accessDenied: string
  allChangesSaved: string
  close: string
  conflictIntentPreserved: string
  couldNotLoad: string
  correlation: string
  delegation: string
  delegateToAgent: string
  description: string
  detailTabsAriaLabel: string
  detailTabDiscussion: string
  detailTabResponsibility: string
  detailTabAgentExecutions: string
  discardChanges: string
  dueDate: string
  editProjection: string
  editorCopy: RichTextEditorCopy
  executionState: string
  fullWorkItem: string
  heartbeat: string
  humanResponsibility: string
  labels: string
  milestone: string
  noActiveAgent: string
  noMilestone: string
  noParent: string
  noProject: string
  notFound: string
  offline: string
  openFullPage: string
  ownsOutcome: string
  parentWorkItem: string
  priority: string
  priorityName: (priority: string) => string
  project: string
  properties: string
  quickView: string
  reloadLatest: string
  retry: string
  responsibleHuman: string
  responsibleHumanHelp: string
  revision: (revision: number) => string
  saveChanges: string
  saving: string
  serverConflictTitle: string
  session: (sessionId: string) => string
  title: string
  unassigned: string
  unsavedChanges: string
  unavailableDescription: string
  workItem: string
  workflowHelp: string
  workflowStatus: string
}

const defaultCopy: WorkItemDetailCopy = {
  agentExecutions: 'Agent executions',
  accessDenied: 'Issue access denied',
  allChangesSaved: 'All changes saved',
  close: 'Close',
  conflictIntentPreserved: 'Your unsaved intent is preserved until you choose to load the latest server version.',
  couldNotLoad: 'Issue could not load',
  correlation: 'Correlation',
  delegation: 'Delegation',
  delegateToAgent: 'Delegate to Agent',
  description: 'Description (Markdown)',
  detailTabsAriaLabel: 'Issue sections',
  detailTabDiscussion: 'Discussion',
  detailTabResponsibility: 'Responsibility',
  detailTabAgentExecutions: 'Agent executions',
  discardChanges: 'Discard unsaved Issue changes?',
  dueDate: 'Due date',
  editProjection: 'Edit the authorized Issue projection.',
  editorCopy: {
    formatting: label => `${label} formatting`, undo: 'Undo', redo: 'Redo', heading: 'Heading', bold: 'Bold', italic: 'Italic', strike: 'Strike', bullets: 'Bulleted list', numbered: 'Numbered list', quote: 'Quote', code: 'Inline code', codeBlock: 'Code block', link: 'Link', preview: 'Preview', edit: 'Edit', draftRestored: 'A local draft was restored.', discardDraft: 'Discard draft', revisionDraft: (draftRevision, currentRevision) => `A draft from revision ${draftRevision} is available. Review it before saving against revision ${currentRevision}.`, restoreForReview: 'Restore for review', discardOldDraft: 'Discard old draft', notSaved: 'Not saved yet', savedAgo: seconds => `Saved ${seconds}s ago`,
  },
  executionState: 'Execution state',
  fullWorkItem: 'Full Issue',
  heartbeat: 'Heartbeat',
  humanResponsibility: 'Human responsibility',
  labels: 'Labels',
  milestone: 'Milestone',
  noActiveAgent: 'No Agent currently holds an execution or review lease.',
  noMilestone: 'No milestone',
  noParent: 'No parent Issue',
  noProject: 'No project',
  notFound: 'Issue not found or deleted',
  offline: 'Issue is offline',
  openFullPage: 'Open full page',
  ownsOutcome: 'Owns the outcome and workflow decision.',
  parentWorkItem: 'Parent Issue',
  priority: 'Priority',
  priorityName: priority => ({ none: 'No priority', urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }[priority] ?? priority),
  project: 'Project',
  properties: 'Properties',
  quickView: 'Quick view',
  reloadLatest: 'Reload latest',
  retry: 'Retry',
  responsibleHuman: 'Responsible Human',
  responsibleHumanHelp: 'Accountable for the outcome; never an Agent assignment.',
  revision: revision => `Revision ${revision}`,
  saveChanges: 'Save changes',
  saving: 'Saving…',
  serverConflictTitle: 'The Issue changed on the server',
  session: sessionId => `Session ${sessionId}`,
  title: 'Title',
  unassigned: 'Unassigned',
  unsavedChanges: 'Unsaved changes',
  unavailableDescription: 'The requested authorized Issue projection is unavailable.',
  workItem: 'Issue',
  workflowHelp: 'Issue lifecycle, independent from Agent execution.',
  workflowStatus: 'Workflow status',
}

const resolveCopy = (copy?: Partial<WorkItemDetailCopy>): WorkItemDetailCopy => ({ ...defaultCopy, ...copy })

type Props = {
  mode: 'sheet' | 'full_page'
  model: WorkItemDetailModel
  options: WorkItemDetailOptions
  error?: StructuredDetailError | null
  conflict?: StructuredDetailError | null
  supplemental: ReactNode
  agentPanel?: ReactNode
  resetKey: number
  draftIdentity: Omit<DraftIdentity, 'field' | 'baseRevision'>
  onClose: () => void
  onOpenFull: () => void
  onReloadLatest: () => void
  onSave: (draft: WorkItemDetailDraft) => Promise<void>
  copy?: Partial<WorkItemDetailCopy>
}

type UnavailableProps = {
  mode: 'sheet' | 'full_page'
  requestedKey: string
  error: StructuredDetailError
  onClose: () => void
  onRetry: () => void
  copy?: Partial<WorkItemDetailCopy>
}

const errorDescription = (error: StructuredDetailError, text: WorkItemDetailCopy): string =>
  `${error.message} ${error.correlationId ? `${text.correlation} ${error.correlationId}. ` : ''}${error.safeNextAction}`

function DetailUnavailableContent({ mode, requestedKey, error, onClose, onRetry, copy }: UnavailableProps) {
  const text = resolveCopy(copy)
  const fullPageHeadingId = useId()
  const state = error.httpStatus === 403
    ? <ForbiddenState description={errorDescription(error, text)} title={text.accessDenied} />
    : <ErrorState actionLabel={text.retry} description={errorDescription(error, text)} onAction={onRetry} title={error.httpStatus === 404 ? text.notFound : error.code === 'NETWORK_UNAVAILABLE' ? text.offline : text.couldNotLoad} />
  const body = <div className="work-item-detail work-item-detail-unavailable" data-mode={mode} data-testid="work-item-detail-unavailable">
    <header className="work-item-detail-toolbar"><div><span className="eyebrow">{mode === 'full_page' ? text.fullWorkItem : text.quickView}</span>{mode === 'full_page' && <h1 className="wm-visually-hidden" id={fullPageHeadingId}>{requestedKey}</h1>}<strong>{requestedKey}</strong></div>{mode === 'full_page' && <Button icon={<X aria-hidden size={16} />} onClick={onClose} type="button" variant="ghost">{text.close}</Button>}</header>
    {state}
  </div>
  return mode === 'sheet'
    ? <Sheet className="work-item-detail-sheet" closeLabel={text.close} description={text.unavailableDescription} onClose={onClose} open title={requestedKey}>{body}</Sheet>
    : <section className="work-item-full-page" aria-labelledby={fullPageHeadingId}>{body}</section>
}

function WorkItemDetailContent({ mode, model, options, error, conflict, supplemental, agentPanel, draftIdentity, onClose, onOpenFull, onReloadLatest, onSave, copy }: Props) {
  const text = resolveCopy(copy)
  const fullPageHeadingId = useId()
  const fullPageRef = useRef<HTMLElement | null>(null)
  // The Save button receives keyboard focus as soon as a revision conflict
  // surfaces so the Human can re-issue the save without hunting for the
  // primary action (especially inside the sheet viewport, where the conflict
  // banner scrolls the Save row out of view). The effect only runs when
  // `hasConflict` flips, so ordinary edits do not yank focus mid-typing.
  const saveRef = useRef<HTMLButtonElement>(null)
  const hasConflict = Boolean(conflict)
  // The route adapter rebuilds the view-model object on ordinary parent renders.
  // Reset drafts only when the durable resource version changes; otherwise a
  // structured conflict render would erase the Human's unsaved intent.
  const initial = useMemo(() => detailDraft(model), [model.id, model.revision])
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('responsibility')
  // The editor renders its own "Saved Xs ago" indicator inside the toolbar, but
  // the parent keeps a copy of the timestamp so future detail-page surfaces
  // (e.g. a global "draft saved" toast) can show the same fact without having
  // to mirror the editor's internal clock.
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<Date | null>(null)
  // The Issue detail page is laid out as a 2-column form on wide viewports
  // (1180px+) and stacks the supplementary sections below it on narrower
  // screens. Once the supplementary sections overflow, swapping the button
  // row for a <select> keeps the page usable without horizontal scrolling.
  const isCompact = useMediaQuery('(max-width: 1180px)')
  useEffect(() => setDraft(initial), [initial])
  const dirty = !sameDetailDraft(initial, draft)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => { if (mode === 'full_page') fullPageRef.current?.focus() }, [mode])
  useEffect(() => { if (hasConflict) saveRef.current?.focus() }, [hasConflict])
  const confirmDiscard = (action: () => void) => { if (!dirty || window.confirm(text.discardChanges)) action() }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true)
    try {
      await onSave(draft)
      clearDraft(localStorage, { ...draftIdentity, field: 'description', baseRevision: model.revision })
    } finally { setSaving(false) }
  }
  const set = <Key extends keyof WorkItemDetailDraft>(key: Key, value: WorkItemDetailDraft[Key]) => setDraft(current => ({ ...current, [key]: value }))
  const body = <div className="work-item-detail" data-mode={mode} data-testid="work-item-detail">
    <header className="work-item-detail-toolbar"><div><span className="eyebrow">{mode === 'full_page' ? text.fullWorkItem : text.quickView}</span>{mode === 'full_page' && <h1 className="wm-visually-hidden" id={fullPageHeadingId}>{model.title}</h1>}<strong>{model.key}</strong><small>{text.revision(model.revision)}</small></div><div className="work-item-detail-toolbar-actions">{agentPanel && <Button onClick={() => setActiveTab('agent')} type="button" variant="primary">{text.delegateToAgent}</Button>}{mode === 'sheet' && <Button icon={<ArrowSquareOut aria-hidden size={16} />} onClick={() => confirmDiscard(onOpenFull)} type="button" variant="secondary">{text.openFullPage}</Button>}{mode === 'full_page' && <Button icon={<X aria-hidden size={16} />} onClick={() => confirmDiscard(onClose)} type="button" variant="ghost">{text.close}</Button>}</div></header>
    {error?.httpStatus === 403 ? <ForbiddenState description={errorDescription(error, text)} title={text.accessDenied} /> : error && <ErrorState actionLabel={text.reloadLatest} description={errorDescription(error, text)} onAction={() => confirmDiscard(onReloadLatest)} title={error.httpStatus === 404 ? text.notFound : error.code === 'NETWORK_UNAVAILABLE' ? text.offline : text.couldNotLoad} />}
    {conflict && <ConflictState actionLabel={text.reloadLatest} description={`${errorDescription(conflict, text)} ${text.conflictIntentPreserved}`} onAction={onReloadLatest} title={text.serverConflictTitle} />}
    <div className="work-item-detail-layout">
      <form className="work-item-detail-form" data-dirty={dirty} onSubmit={event => void submit(event)}>
        <section className="work-item-detail-content" aria-labelledby="work-item-content-heading"><h3 id="work-item-content-heading">{text.workItem}</h3><label>{text.title}<input name="title" required value={draft.title} onChange={event => set('title', event.currentTarget.value)} /></label><RichTextEditor copy={text.editorCopy} identity={{...draftIdentity,field:'description',baseRevision:model.revision}} label={text.description} mode="description" name="description" onChange={value=>set('description',value)} onSavedAt={setLastDraftSavedAt} value={draft.description} /></section>
        <aside className="work-item-properties" aria-labelledby="work-item-properties-heading"><h3 id="work-item-properties-heading">{text.properties}</h3><label>{text.workflowStatus}<select name="statusId" value={draft.statusId} onChange={event => set('statusId', event.currentTarget.value)}>{options.statuses.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><small>{text.workflowHelp}</small></label><label>{text.priority}<select name="priority" value={draft.priority} onChange={event => set('priority', event.currentTarget.value as WorkItemDetailDraft['priority'])}>{['none', 'urgent', 'high', 'medium', 'low'].map(priority => <option key={priority} value={priority}>{text.priorityName(priority)}</option>)}</select></label><label>{text.dueDate}<input name="dueDate" type="date" value={draft.dueDate} onChange={event => set('dueDate', event.currentTarget.value)} /></label><label>{text.responsibleHuman}<select name="responsibleHumanActorId" value={draft.responsibleHumanActorId} onChange={event => set('responsibleHumanActorId', event.currentTarget.value)}><option value="">{text.unassigned}</option>{options.humans.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select><small>{text.responsibleHumanHelp}</small></label><label>{text.project}<select name="projectId" value={draft.projectId} onChange={event => set('projectId', event.currentTarget.value)}><option value="">{text.noProject}</option>{options.projects.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>{text.milestone}<select name="milestoneId" value={draft.milestoneId} onChange={event => set('milestoneId', event.currentTarget.value)}><option value="">{text.noMilestone}</option>{options.milestones.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>{text.parentWorkItem}<select name="parentId" value={draft.parentId} onChange={event => set('parentId', event.currentTarget.value)}><option value="">{text.noParent}</option>{options.parents.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>{text.labels}<input name="labels" value={draft.labels} onChange={event => set('labels', event.currentTarget.value)} /></label></aside>
        <div className="work-item-detail-actions"><Button disabled={saving || !dirty} icon={<FloppyDisk aria-hidden size={16} />} ref={saveRef} type="submit" variant="primary">{saving ? text.saving : text.saveChanges}</Button><Button icon={<ArrowClockwise aria-hidden size={16} />} onClick={() => confirmDiscard(onReloadLatest)} type="button" variant="secondary">{text.reloadLatest}</Button><span aria-live="polite">{dirty ? text.unsavedChanges : text.allChangesSaved}</span></div>
      </form>
      <Tabs
        ariaLabel={text.detailTabsAriaLabel}
        compact={isCompact}
        onValueChange={setActiveTab}
        tabs={[
          { id: 'responsibility', label: text.detailTabResponsibility, panel: <section className="responsibility-projection" aria-labelledby="responsibility-heading"><h3 id="responsibility-heading">{text.humanResponsibility}</h3><strong data-testid="responsible-human">{model.responsibleHuman?.displayName ?? text.unassigned}</strong><p>{text.ownsOutcome}</p></section> },
          { id: 'agent', label: text.detailTabAgentExecutions, panel: <section className="agent-execution-projection" aria-labelledby="agent-executions-heading"><h3 id="agent-executions-heading">{text.agentExecutions}</h3>{model.agentExecutions.length ? model.agentExecutions.map(execution => <article key={execution.delegation.leaseId}><strong>{execution.agent.displayName}</strong><span>{text.executionState}: {execution.executionState}</span><span>{text.session(execution.sessionId.slice(0, 8))}</span><span>{text.heartbeat}: {execution.heartbeat.health}</span><span>{text.delegation}: {execution.delegation.kind}</span></article>) : <p>{text.noActiveAgent}</p>}{agentPanel}</section> },
          { id: 'discussion', label: text.detailTabDiscussion, panel: <div className="work-item-detail-supplemental">{supplemental}</div> },
        ]}
        value={activeTab}
      />
    </div>
  </div>
  return mode === 'sheet' ? <Sheet className="work-item-detail-sheet" closeLabel={text.close} description={text.editProjection} onClose={() => confirmDiscard(onClose)} open title={model.key}>{body}</Sheet> : <section className="work-item-full-page" aria-labelledby={fullPageHeadingId} ref={fullPageRef} tabIndex={-1}>{body}</section>
}

export function WorkItemDetail(props: Props) { return <WorkItemDetailContent key={`${props.model.id}:${props.model.revision}:${props.mode}:${props.resetKey}`} {...props} /> }
export function WorkItemDetailUnavailable(props: UnavailableProps) { return <DetailUnavailableContent key={`${props.requestedKey}:${props.mode}:${props.error.code}`} {...props} /> }
