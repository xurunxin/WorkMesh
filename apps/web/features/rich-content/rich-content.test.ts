import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { clearDraft, draftKey, findReconciliationDraft, readDraft, recordEditorChange, redoEditorChange, RichTextEditor, undoEditorChange, writeDraft, type DraftIdentity } from './editor'
import { allowedLink, Markdown } from './markdown'
import { uploadRecoveryActions } from './artifacts'

const identity: DraftIdentity = {
  workspaceId: 'workspace', teamId: 'team', actorId: 'human',
  resourceType: 'work_item', resourceId: 'item', field: 'description', baseRevision: 7,
}

describe('rich-content safety boundary', () => {
  it('renders only the deterministic Markdown allowlist and leaves unsafe HTML as text', () => {
    const html = renderToStaticMarkup(createElement(Markdown, { source: '## Heading\n<script>alert(1)</script>\n[safe](https://example.com)\n[unsafe](javascript:alert(1))' }))
    expect(html).toContain('<h2>Heading</h2>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('href="https://example.com"')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('<script>')
  })

  it('allows only credential-free http(s) and same-origin relative links', () => {
    expect(allowedLink('/projects/one')).toBe(true)
    expect(allowedLink('https://example.com/docs')).toBe(true)
    expect(allowedLink('https://user:secret@example.com')).toBe(false)
    expect(allowedLink('//example.com')).toBe(false)
    expect(allowedLink('data:text/html,boom')).toBe(false)
    expect(allowedLink('javascript:alert(1)')).toBe(false)
  })
})

describe('revision-bound local drafts', () => {
  it('exposes explicit undo and redo controls for controlled editors', () => {
    const html = renderToStaticMarkup(createElement(RichTextEditor, {
      identity, label: 'Description', name: 'description', value: 'before', onChange: () => undefined,
    }))
    expect(html).toContain('aria-label="Undo"')
    expect(html).toContain('aria-label="Redo"')
  })
  it('keeps controlled editor undo and redo deterministic', () => {
    const recorded = recordEditorChange({ undo: [], redo: [] }, 'before', '**after**')
    const undone = undoEditorChange(recorded, '**after**')
    expect(undone).toEqual({ value: 'before', history: { undo: [], redo: ['**after**'] } })
    expect(redoEditorChange(undone!.history, undone!.value)).toEqual({
      value: '**after**', history: { undo: ['before'], redo: [] },
    })
  })
  it('restores an unexpired exact-revision draft and clears it explicitly', () => {
    const values = new Map([[draftKey(identity), JSON.stringify({ ...identity, value: 'draft', updatedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2999-01-01T00:00:00.000Z' })]])
    const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: vi.fn((key: string) => values.delete(key)) }
    expect(readDraft(storage, identity)?.value).toBe('draft')
    clearDraft(storage, identity)
    expect(values.has(draftKey(identity))).toBe(false)
  })

  it('expires stale drafts and never crosses a durable revision boundary', () => {
    const values = new Map([[draftKey(identity), JSON.stringify({ ...identity, value: 'stale', updatedAt: '1999-01-01T00:00:00.000Z', expiresAt: '2000-01-01T00:00:00.000Z' })]])
    const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: vi.fn((key: string) => values.delete(key)) }
    expect(readDraft(storage, identity)).toBeNull()
    expect(readDraft(storage, { ...identity, baseRevision: 8 })).toBeNull()
  })

  it('offers but never automatically applies a draft from an older revision', () => {
    const values = new Map<string, string>()
    const storage = {
      get length() { return values.size },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    writeDraft(storage, identity, 'unsaved intent')
    const next = { ...identity, baseRevision: 8 }
    expect(readDraft(storage, next)).toBeNull()
    expect(findReconciliationDraft(storage, next)).toMatchObject({ baseRevision: 7, value: 'unsaved intent' })
  })
})

describe('attachment recovery controls', () => {
  it('keeps retry and cancel explicit after a failed upload', () => {
    expect(uploadRecoveryActions('failed', true, true)).toEqual({ retry: true, cancel: true })
    expect(uploadRecoveryActions('failed', true, false)).toEqual({ retry: true, cancel: true })
    expect(uploadRecoveryActions('verifying', true, true)).toEqual({ retry: false, cancel: false })
    expect(uploadRecoveryActions('idle', false, false)).toEqual({ retry: false, cancel: false })
  })
})
