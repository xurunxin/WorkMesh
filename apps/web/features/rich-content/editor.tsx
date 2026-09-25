'use client'

import React, { type ClipboardEvent, type CompositionEvent, type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react'
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  Code,
  CodeBlock,
  Columns,
  Eye,
  FloppyDisk,
  LinkSimple,
  ListBullets,
  ListNumbers,
  NotePencil,
  Quotes,
  TextB,
  TextH,
  TextItalic,
  TextStrikethrough,
  type Icon,
} from '@phosphor-icons/react'

import { Markdown } from './markdown'

export type DraftIdentity = { workspaceId: string; teamId: string; actorId: string; resourceType: string; resourceId: string; field: string; baseRevision: number }
export type Draft = DraftIdentity & { value: string; updatedAt: string; expiresAt: string }
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'length' | 'key'>

export const draftKey = (identity: DraftIdentity) => `workmesh.draft.${[identity.workspaceId, identity.teamId, identity.actorId, identity.resourceType, identity.resourceId, identity.field, identity.baseRevision].map(encodeURIComponent).join('.')}`
const sameDraftResource = (draft: Draft, identity: DraftIdentity) =>
  draft.workspaceId === identity.workspaceId && draft.teamId === identity.teamId
  && draft.actorId === identity.actorId && draft.resourceType === identity.resourceType
  && draft.resourceId === identity.resourceId && draft.field === identity.field
export const clearDraft = (storage: Pick<Storage, 'removeItem'>, identity: DraftIdentity): void => storage.removeItem(draftKey(identity))
const expiry = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
export function readDraft(storage: Pick<Storage, 'getItem' | 'removeItem'>, identity: DraftIdentity): Draft | null {
  const key = draftKey(identity)
  try { const draft = JSON.parse(storage.getItem(key) ?? 'null') as Draft | null; if (!draft || !sameDraftResource(draft, identity) || draft.baseRevision !== identity.baseRevision || Date.parse(draft.expiresAt) <= Date.now()) { storage.removeItem(key); return null }; return draft } catch { storage.removeItem(key); return null }
}
export function findReconciliationDraft(storage: DraftStorage, identity: DraftIdentity): Draft | null {
  const candidates: Draft[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key?.startsWith('workmesh.draft.')) continue
    try {
      const draft = JSON.parse(storage.getItem(key) ?? 'null') as Draft | null
      if (!draft || !sameDraftResource(draft, identity) || draft.baseRevision === identity.baseRevision) continue
      if (Date.parse(draft.expiresAt) <= Date.now()) { storage.removeItem(key); continue }
      candidates.push(draft)
    } catch { storage.removeItem(key) }
  }
  return candidates.sort((left, right) => Date.parse(right.updatedAt ?? right.expiresAt) - Date.parse(left.updatedAt ?? left.expiresAt))[0] ?? null
}
export function writeDraft(storage: Pick<Storage, 'setItem'>, identity: DraftIdentity, value: string): void {
  const now = new Date().toISOString()
  storage.setItem(draftKey(identity), JSON.stringify({ ...identity, value, updatedAt: now, expiresAt: expiry() } satisfies Draft))
}

export type EditorHistory = { undo: string[]; redo: string[] }
export const recordEditorChange = (history: EditorHistory, current: string, next: string): EditorHistory =>
  current === next ? history : { undo: [...history.undo.slice(-99), current], redo: [] }
export const undoEditorChange = (history: EditorHistory, current: string): { history: EditorHistory; value: string } | null => {
  const value = history.undo.at(-1)
  return value === undefined ? null : { value, history: { undo: history.undo.slice(0, -1), redo: [...history.redo.slice(-99), current] } }
}
export const redoEditorChange = (history: EditorHistory, current: string): { history: EditorHistory; value: string } | null => {
  const value = history.redo.at(-1)
  return value === undefined ? null : { value, history: { undo: [...history.undo.slice(-99), current], redo: history.redo.slice(0, -1) } }
}

const wrappedValue = (textarea: HTMLTextAreaElement, before: string, after = before) => {
  const start = textarea.selectionStart; const end = textarea.selectionEnd
  return { next: `${textarea.value.slice(0, start)}${before}${textarea.value.slice(start, end)}${after}${textarea.value.slice(end)}`, start: start + before.length, end: end + before.length }
}

export type RichTextEditorCopy = {
  formatting: (label: string) => string
  undo: string
  redo: string
  heading: string
  bold: string
  italic: string
  strike: string
  bullets: string
  numbered: string
  quote: string
  code: string
  codeBlock: string
  link: string
  edit: string
  split: string
  preview: string
  save: string
  saving: string
  serverSaved: string
  saveFailed: string
  versionConflict: string
  conflictHelp: string
  retrySave: string
  draftRestored: string
  discardDraft: string
  revisionDraft: (draftRevision: number, currentRevision: number) => string
  restoreForReview: string
  discardOldDraft: string
  notSaved: string
  savedLocally: (seconds: number) => string
}

const defaultEditorCopy: RichTextEditorCopy = {
  formatting: label => `${label} formatting`,
  undo: 'Undo',
  redo: 'Redo',
  heading: 'Heading',
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strike',
  bullets: 'Bulleted list',
  numbered: 'Numbered list',
  quote: 'Quote',
  code: 'Inline code',
  codeBlock: 'Code block',
  link: 'Link',
  edit: 'Edit',
  split: 'Split view',
  preview: 'Preview',
  save: 'Save to server',
  saving: 'Saving…',
  serverSaved: 'Saved to server',
  saveFailed: 'Save failed. Local draft kept.',
  versionConflict: 'Server has a newer revision. Your draft was not applied.',
  conflictHelp: 'Load the latest version before saving. Your local draft is kept.',
  retrySave: 'Retry save',
  draftRestored: 'A local draft was restored.',
  discardDraft: 'Discard draft',
  revisionDraft: (draftRevision, currentRevision) => `A draft from revision ${draftRevision} is available. Review it before saving against revision ${currentRevision}.`,
  restoreForReview: 'Restore for review',
  discardOldDraft: 'Discard old draft',
  notSaved: 'Not saved yet',
  savedLocally: seconds => `Local draft saved ${seconds}s ago`,
}

type FormatTool = { label: keyof Pick<RichTextEditorCopy, 'heading' | 'bold' | 'italic' | 'strike' | 'bullets' | 'numbered' | 'quote' | 'code' | 'codeBlock' | 'link'>; before: string; after: string; icon: Icon }
const formatTools: FormatTool[] = [
  { label: 'heading', before: '## ', after: '', icon: TextH },
  { label: 'bold', before: '**', after: '**', icon: TextB },
  { label: 'italic', before: '*', after: '*', icon: TextItalic },
  { label: 'strike', before: '~~', after: '~~', icon: TextStrikethrough },
  { label: 'bullets', before: '- ', after: '', icon: ListBullets },
  { label: 'numbered', before: '1. ', after: '', icon: ListNumbers },
  { label: 'quote', before: '> ', after: '', icon: Quotes },
  { label: 'code', before: '`', after: '`', icon: Code },
  { label: 'codeBlock', before: '```\n', after: '\n```', icon: CodeBlock },
  { label: 'link', before: '[', after: '](https://)', icon: LinkSimple },
]

export type RichTextEditorMode = 'comment' | 'reply' | 'description'
const editorModeClass = (mode: RichTextEditorMode | undefined): string => mode ? `rich-editor rich-editor--${mode}` : 'rich-editor'

export type RichTextEditorView = 'edit' | 'split' | 'preview'

/**
 * Draft save lifecycle shown in the editor status area. `idle`/`local-draft`
 * describe local-only state; the remaining states come from the optional
 * server save pipeline (`onSave`).
 */
export type DraftSaveState = 'idle' | 'local-draft' | 'saving' | 'server-saved' | 'save-failed' | 'version-conflict'
export type ServerSaveResult = { revision: number }
export type ServerSave = (value: string, baseRevision: number) => Promise<ServerSaveResult>

/** 409 (or an explicit revision-conflict code) means the server moved on; a local draft must never be applied over it. */
export function isRevisionConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const status = (error as { status?: unknown }).status
  const code = String((error as { code?: unknown }).code ?? '').toUpperCase()
  return status === 409 || code.includes('REVISION_CONFLICT') || code.includes('STALE_REVISION')
}

export function RichTextEditor({ identity, label, mode, name, value, onChange, onSave, onSavedAt, defaultView, preview, required, textareaRef, copy, testId }: { identity: DraftIdentity; label: string; mode?: RichTextEditorMode; name: string; value: string; onChange: (value: string) => void; onSave?: ServerSave; onSavedAt?: (date: Date) => void; defaultView?: RichTextEditorView; preview?: boolean; required?: boolean; textareaRef?: RefObject<HTMLTextAreaElement | null>; copy?: Partial<RichTextEditorCopy>; testId?: string }) {
  const text = { ...defaultEditorCopy, ...copy }
  const internalRef = useRef<HTMLTextAreaElement>(null); const ref = textareaRef ?? internalRef
  const [restored, setRestored] = useState(false)
  const [reconciliation, setReconciliation] = useState<Draft | null>(null)
  const [uncontrolledView, setUncontrolledView] = useState<RichTextEditorView>(() => (preview ? 'preview' : defaultView ?? 'edit'))
  const view = uncontrolledView
  const setView = (next: RichTextEditorView) => setUncontrolledView(next)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [saveState, setSaveState] = useState<DraftSaveState>('idle')
  const [now, setNow] = useState(() => Date.now())
  const serverValue = useRef(value)
  const currentValue = useRef(value)
  const history = useRef<EditorHistory>({ undo: [], redo: [] })
  const composingRef = useRef(false)
  const compositionBaseRef = useRef('')
  const savingRef = useRef(false)
  const identityKey = draftKey(identity)
  useEffect(() => {
    serverValue.current = value
    setRestored(false)
    setSaveState('idle')
    const exact = readDraft(localStorage, identity)
    if (exact && exact.value !== value) { onChange(exact.value); setRestored(true); setSaveState('local-draft'); setReconciliation(null); return }
    setReconciliation(findReconciliationDraft(localStorage, identity))
  }, [identityKey])
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  currentValue.current = value
  const dirty = value !== serverValue.current
  useEffect(() => {
    if (!dirty) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])
  const persist = (next: string) => {
    currentValue.current = next; onChange(next)
    if (next === serverValue.current) { clearDraft(localStorage, identity); setSavedAt(null); setSaveState('server-saved'); return }
    const at = new Date()
    setSavedAt(at)
    onSavedAt?.(at)
    writeDraft(localStorage, identity, next)
    setSaveState('local-draft')
  }
  const change = (next: string) => { history.current = recordEditorChange(history.current, currentValue.current, next); persist(next) }
  // IME composition fires many onChange updates; persist them but record a
  // single history entry at compositionEnd so undo never walks intermediates.
  const changeComposing = (next: string) => persist(next)
  const runSave = async () => {
    if (!onSave || savingRef.current) return
    savingRef.current = true
    setSaveState('saving')
    try {
      await onSave(currentValue.current, identity.baseRevision)
      serverValue.current = currentValue.current
      clearDraft(localStorage, identity)
      setSavedAt(null)
      setSaveState('server-saved')
    } catch (error) {
      setSaveState(isRevisionConflictError(error) ? 'version-conflict' : 'save-failed')
    } finally { savingRef.current = false }
  }
  const applyHistory = (direction: 'undo' | 'redo') => {
    const result = direction === 'redo' ? redoEditorChange(history.current, currentValue.current) : undoEditorChange(history.current, currentValue.current)
    if (result) { history.current = result.history; persist(result.value) }
  }
  const format = (textarea: HTMLTextAreaElement, before: string, after = before) => { const wrapped = wrappedValue(textarea, before, after); change(wrapped.next); requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(wrapped.start, wrapped.end) }) }
  const paste = (event: ClipboardEvent<HTMLTextAreaElement>) => { event.preventDefault(); const text = event.clipboardData.getData('text/plain'); const target = event.currentTarget; target.setRangeText(text, target.selectionStart, target.selectionEnd, 'end'); change(target.value) }
  const compositionStart = (event: CompositionEvent<HTMLTextAreaElement>) => { composingRef.current = true; compositionBaseRef.current = currentValue.current }
  const compositionEnd = (event: CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = false
    history.current = recordEditorChange(history.current, compositionBaseRef.current, event.currentTarget.value)
  }
  const keyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 229 / isComposing: keydown synthesized by an IME must never trigger
    // formatting, undo, or server-save shortcuts mid-composition.
    if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (key === 's' && onSave) { event.preventDefault(); void runSave(); return }
    if (key === 'b') { event.preventDefault(); format(event.currentTarget, '**'); return }
    if (key !== 'z' && key !== 'y') return
    event.preventDefault()
    applyHistory(key === 'y' || (key === 'z' && event.shiftKey) ? 'redo' : 'undo')
  }
  const savedAgoSeconds = savedAt ? Math.max(0, Math.floor((now - savedAt.getTime()) / 1000)) : null
  const statusState: DraftSaveState = saveState === 'saving' || saveState === 'server-saved' || saveState === 'save-failed' || saveState === 'version-conflict'
    ? saveState
    : savedAt ? 'local-draft' : 'idle'
  const statusText = statusState === 'saving' ? text.saving
    : statusState === 'server-saved' ? text.serverSaved
    : statusState === 'save-failed' ? text.saveFailed
    : statusState === 'version-conflict' ? text.versionConflict
    : statusState === 'local-draft' && savedAgoSeconds !== null ? text.savedLocally(savedAgoSeconds)
    : text.notSaved
  return <section className={editorModeClass(mode)} data-restored={restored || undefined} data-view={view}><div className="rich-editor-toolbar" role="toolbar" aria-label={text.formatting(label)}>
    <button aria-label={text.undo} className="rich-editor-tool" onClick={() => applyHistory('undo')} title={text.undo} type="button"><ArrowUUpLeft aria-hidden size={17} /></button>
    <button aria-label={text.redo} className="rich-editor-tool" onClick={() => applyHistory('redo')} title={text.redo} type="button"><ArrowUUpRight aria-hidden size={17} /></button>
    <span aria-hidden className="rich-editor-tool-separator" />
    {formatTools.map(tool => { const ToolIcon = tool.icon; return <button aria-label={text[tool.label]} className="rich-editor-tool" key={tool.label} onClick={() => ref.current && format(ref.current, tool.before, tool.after)} title={text[tool.label]} type="button"><ToolIcon aria-hidden size={17} /></button> })}
    <span aria-hidden className="rich-editor-tool-separator" />
    <button aria-label={text.edit} aria-pressed={view === 'edit'} className="rich-editor-tool" onClick={() => setView('edit')} title={text.edit} type="button"><NotePencil aria-hidden size={17} /></button>
    <button aria-label={text.split} aria-pressed={view === 'split'} className="rich-editor-tool" onClick={() => setView('split')} title={text.split} type="button"><Columns aria-hidden size={17} /></button>
    <button aria-label={text.preview} aria-pressed={view === 'preview'} className="rich-editor-tool" onClick={() => setView('preview')} title={text.preview} type="button"><Eye aria-hidden size={17} /></button>
    {onSave && <button aria-label={text.save} className="rich-editor-tool" data-testid="rich-editor-save" onClick={() => void runSave()} title={text.save} type="button"><FloppyDisk aria-hidden size={17} /></button>}
    <span aria-live="polite" className="rich-editor-saved" data-state={statusState} data-testid="rich-editor-saved" role="status">{statusText}{statusState === 'save-failed' && <button onClick={() => void runSave()} type="button">{text.retrySave}</button>}{statusState === 'version-conflict' && <small className="rich-editor-conflict-help">{text.conflictHelp}</small>}</span>
  </div><label>{label}<div className="rich-editor-input-pane" data-hidden={view === 'preview' || undefined}><textarea data-testid={testId} name={name} onChange={event => (composingRef.current ? changeComposing(event.currentTarget.value) : change(event.currentTarget.value))} onCompositionEnd={compositionEnd} onCompositionStart={compositionStart} onKeyDown={keyboard} onPaste={paste} ref={ref} required={required} value={value} /></div></label>{view !== 'edit' && <div aria-label={text.preview} className="rich-editor-preview-pane" role="region"><Markdown source={value} /></div>}{restored && <div className="draft-notice" role="status"><span>{text.draftRestored}</span><button type="button" onClick={() => { clearDraft(localStorage, identity); onChange(serverValue.current); setRestored(false) }}>{text.discardDraft}</button></div>}{reconciliation && <div className="draft-notice" role="status" data-testid="draft-reconciliation"><span>{text.revisionDraft(reconciliation.baseRevision, identity.baseRevision)}</span><button type="button" onClick={() => { onChange(reconciliation.value); writeDraft(localStorage, identity, reconciliation.value); clearDraft(localStorage, reconciliation); setReconciliation(null); setRestored(true) }}>{text.restoreForReview}</button><button type="button" onClick={() => { clearDraft(localStorage, reconciliation); setReconciliation(null) }}>{text.discardOldDraft}</button></div>}</section>
}
