'use client'

import React, { type ClipboardEvent, type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react'
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  Code,
  CodeBlock,
  LinkSimple,
  ListBullets,
  ListNumbers,
  Quotes,
  TextB,
  TextH,
  TextItalic,
  TextStrikethrough,
  type Icon,
} from '@phosphor-icons/react'

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
  draftRestored: string
  discardDraft: string
  revisionDraft: (draftRevision: number, currentRevision: number) => string
  restoreForReview: string
  discardOldDraft: string
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
  draftRestored: 'A local draft was restored.',
  discardDraft: 'Discard draft',
  revisionDraft: (draftRevision, currentRevision) => `A draft from revision ${draftRevision} is available. Review it before saving against revision ${currentRevision}.`,
  restoreForReview: 'Restore for review',
  discardOldDraft: 'Discard old draft',
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

export function RichTextEditor({ identity, label, name, value, onChange, required, textareaRef, copy, testId }: { identity: DraftIdentity; label: string; name: string; value: string; onChange: (value: string) => void; required?: boolean; textareaRef?: RefObject<HTMLTextAreaElement | null>; copy?: Partial<RichTextEditorCopy>; testId?: string }) {
  const text = { ...defaultEditorCopy, ...copy }
  const internalRef = useRef<HTMLTextAreaElement>(null); const ref = textareaRef ?? internalRef
  const [restored, setRestored] = useState(false)
  const [reconciliation, setReconciliation] = useState<Draft | null>(null)
  const serverValue = useRef(value)
  const currentValue = useRef(value)
  const history = useRef<EditorHistory>({ undo: [], redo: [] })
  const identityKey = draftKey(identity)
  useEffect(() => {
    serverValue.current = value
    setRestored(false)
    const exact = readDraft(localStorage, identity)
    if (exact && exact.value !== value) { onChange(exact.value); setRestored(true); setReconciliation(null); return }
    setReconciliation(findReconciliationDraft(localStorage, identity))
  }, [identityKey])
  currentValue.current = value
  const persist = (next: string) => { currentValue.current = next; onChange(next); if (next === serverValue.current) clearDraft(localStorage, identity); else writeDraft(localStorage, identity, next) }
  const change = (next: string) => { history.current = recordEditorChange(history.current, currentValue.current, next); persist(next) }
  const applyHistory = (direction: 'undo' | 'redo') => {
    const result = direction === 'redo' ? redoEditorChange(history.current, currentValue.current) : undoEditorChange(history.current, currentValue.current)
    if (result) { history.current = result.history; persist(result.value) }
  }
  const format = (textarea: HTMLTextAreaElement, before: string, after = before) => { const wrapped = wrappedValue(textarea, before, after); change(wrapped.next); requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(wrapped.start, wrapped.end) }) }
  const paste = (event: ClipboardEvent<HTMLTextAreaElement>) => { event.preventDefault(); const text = event.clipboardData.getData('text/plain'); const target = event.currentTarget; target.setRangeText(text, target.selectionStart, target.selectionEnd, 'end'); change(target.value) }
  const keyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (key === 'b') { event.preventDefault(); format(event.currentTarget, '**'); return }
    if (key !== 'z' && key !== 'y') return
    event.preventDefault()
    applyHistory(key === 'y' || (key === 'z' && event.shiftKey) ? 'redo' : 'undo')
  }
  return <section className="rich-editor" data-restored={restored || undefined}><div className="rich-editor-toolbar" role="toolbar" aria-label={text.formatting(label)}>
    <button aria-label={text.undo} className="rich-editor-tool" onClick={() => applyHistory('undo')} title={text.undo} type="button"><ArrowUUpLeft aria-hidden size={17} /></button>
    <button aria-label={text.redo} className="rich-editor-tool" onClick={() => applyHistory('redo')} title={text.redo} type="button"><ArrowUUpRight aria-hidden size={17} /></button>
    <span aria-hidden className="rich-editor-tool-separator" />
    {formatTools.map(tool => { const ToolIcon = tool.icon; return <button aria-label={text[tool.label]} className="rich-editor-tool" key={tool.label} onClick={() => ref.current && format(ref.current, tool.before, tool.after)} title={text[tool.label]} type="button"><ToolIcon aria-hidden size={17} /></button> })}
  </div><label>{label}<textarea data-testid={testId} name={name} onChange={event => change(event.currentTarget.value)} onKeyDown={keyboard} onPaste={paste} ref={ref} required={required} value={value} /></label>{restored && <div className="draft-notice" role="status"><span>{text.draftRestored}</span><button type="button" onClick={() => { clearDraft(localStorage, identity); onChange(serverValue.current); setRestored(false) }}>{text.discardDraft}</button></div>}{reconciliation && <div className="draft-notice" role="status" data-testid="draft-reconciliation"><span>{text.revisionDraft(reconciliation.baseRevision, identity.baseRevision)}</span><button type="button" onClick={() => { onChange(reconciliation.value); writeDraft(localStorage, identity, reconciliation.value); clearDraft(localStorage, reconciliation); setReconciliation(null); setRestored(true) }}>{text.restoreForReview}</button><button type="button" onClick={() => { clearDraft(localStorage, reconciliation); setReconciliation(null) }}>{text.discardOldDraft}</button></div>}</section>
}
