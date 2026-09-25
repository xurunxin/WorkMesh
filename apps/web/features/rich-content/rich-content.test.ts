// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearDraft,
  draftKey,
  findReconciliationDraft,
  isRevisionConflictError,
  readDraft,
  recordEditorChange,
  redoEditorChange,
  RichTextEditor,
  undoEditorChange,
  writeDraft,
  type DraftIdentity,
} from './editor'
import { allowedLink, Markdown, safeMarkdownUrl } from './markdown'
import { uploadRecoveryActions } from './artifacts'

const identity: DraftIdentity = {
  workspaceId: 'workspace', teamId: 'team', actorId: 'human',
  resourceType: 'work_item', resourceId: 'item', field: 'description', baseRevision: 7,
}

/** Controlled wrapper mirroring real call sites: the parent owns the value. */
function StatefulRichTextEditor(props: {
  identity: DraftIdentity
  initialValue: string
  label: string
  name: string
  testId?: string
  onSave?: (value: string, baseRevision: number) => Promise<{ revision: number }>
  onChange?: (value: string) => void
}) {
  const [value, setValue] = useState(props.initialValue)
  const handleChange = (next: string) => { setValue(next); props.onChange?.(next) }
  return createElement(RichTextEditor, {
    identity: props.identity, label: props.label, name: props.name, testId: props.testId,
    onSave: props.onSave, value, onChange: handleChange,
  })
}

describe('rich-content safety boundary', () => {
  it('renders CommonMark and GFM while skipping raw HTML', () => {
    const html = renderToStaticMarkup(createElement(Markdown, { source: '# Heading\n\n<script>alert(1)</script>\n\n[safe](https://example.com)\n\n- [x] done\n\n| Key | Value |\n| --- | --- |\n| one | **two** |' }))
    expect(html).toContain('<h1>Heading</h1>')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('<table>')
    expect(html).toContain('<strong>two</strong>')
    expect(html).not.toContain('alert(1)')
    expect(html).toContain('href="https://example.com"')
    expect(html).not.toContain('<script>')
  })

  it('allows only credential-free http(s) and same-origin relative links', () => {
    expect(allowedLink('/projects/one')).toBe(true)
    expect(allowedLink('https://example.com/docs')).toBe(true)
    expect(allowedLink('https://user:secret@example.com')).toBe(false)
    expect(allowedLink(' https://example.com')).toBe(false)
    expect(allowedLink('//example.com')).toBe(false)
    expect(allowedLink('/\\example.com')).toBe(false)
    expect(allowedLink('data:text/html,boom')).toBe(false)
    expect(allowedLink('javascript:alert(1)')).toBe(false)
    expect(safeMarkdownUrl('javascript:alert(1)')).toBe('')
  })

  it('keeps soft-wrapped Markdown in one paragraph and handles nested lists', () => {
    const { container } = render(createElement(Markdown, { source: 'First line\nsecond line\n\n- parent\n  - child' }))
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.querySelector('p')?.textContent).toContain('First line')
    expect(container.querySelector('p')?.textContent).toContain('second line')
    expect(container.querySelectorAll('ul')).toHaveLength(2)
  })

  it('covers the readable document grammar in one renderer', () => {
    const source = [
      '# H1', '## H2', '### H3', '#### H4', '##### H5', '###### H6', '',
      '1. ordered', '', '> quoted', '', '---', '', '~~removed~~', '',
      '<https://example.com/docs>', '', '![diagram](/artifacts/diagram.png)',
    ].join('\n')
    const { container } = render(createElement(Markdown, { source }))
    for (const heading of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) expect(container.querySelector(heading)).not.toBeNull()
    expect(container.querySelector('ol')).not.toBeNull()
    expect(container.querySelector('blockquote')).not.toBeNull()
    expect(container.querySelector('hr')).not.toBeNull()
    expect(container.querySelector('del')).toHaveTextContent('removed')
    expect(container.querySelector('a')).toHaveAttribute('href', 'https://example.com/docs')
    expect(container.querySelector('img')).toHaveAttribute('src', '/artifacts/diagram.png')
  })

  it('removes unsafe link and image attributes while retaining useful labels', () => {
    const { container } = render(createElement(Markdown, { source: '[unsafe](javascript:alert(1))\n\n![diagram](data:text/html,boom)' }))
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('unsafe')
    expect(container.textContent).toContain('diagram')
  })

  it('keeps CJK, Windows paths, UUIDs, and hashes readable while rejecting unsafe protocols and raw HTML', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const hash = `sha256:${'a'.repeat(64)}`
    const source = [
      '人机协同审批说明',
      '',
      '`C:\\Projects\\WorkMesh\\README.md`',
      '',
      `UUID: \`${uuid}\``,
      '',
      `Hash: \`${hash}\``,
      '',
      '[unsafe protocol](javascript:alert(1))',
      '',
      '<span>raw HTML must not render</span>',
    ].join('\n')
    const { container } = render(createElement(Markdown, { source }))

    expect(container.textContent).toContain('人机协同审批说明')
    expect(container.textContent).toContain('C:\\Projects\\WorkMesh\\README.md')
    expect(container.textContent).toContain(uuid)
    expect(container.textContent).toContain(hash)
    expect(container.textContent).toContain('unsafe protocol')
    expect(container.querySelector('a')).toBeNull()
    expect(Array.from(container.querySelectorAll('span')).some(span => span.textContent?.includes('raw HTML'))).toBe(false)
    expect(container.innerHTML).not.toMatch(/<span[^>]*>raw HTML must not render/)
  })

  it('keeps the 14px and 1.625 line-height baseline for both densities at mobile widths', () => {
    // The CSS module is the source of truth for the responsive typography
    // contract; keep this assertion explicit so a mobile override cannot
    // silently reduce the readable body size again.
    const stylesheet = readFileSync(join(import.meta.dirname, 'markdown.module.css'), 'utf8')
    expect(stylesheet).toMatch(/\.document\s*\{[^}]*font-size:\s*14px;[^}]*line-height:\s*1\.625;/s)
    expect(stylesheet).toMatch(/\.compact\s*\{[^}]*font-size:\s*14px;[^}]*line-height:\s*1\.625;/s)
    expect(stylesheet).not.toMatch(/@media[\s\S]*\.document\s*\{[^}]*font-size:\s*13px/s)
  })

  it('collapses only oversized compact content and exposes an accessible toggle', () => {
    const source = Array.from({ length: 15 }, (_, index) => `Line ${index + 1}`).join('\n\n')
    render(createElement(Markdown, { density: 'compact', source }))
    const toggle = screen.getByRole('button', { name: 'Show all' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveTextContent('Show less')
  })

  it('copies fenced code and announces the result', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(createElement(Markdown, { source: '```ts\nconst value = 1\n```' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy code: ts' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('const value = 1'))
    expect(screen.getByRole('status')).toHaveTextContent('Copied')
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
  it('applies the mode-specific border class to the editor wrapper', () => {
    const commentHtml = renderToStaticMarkup(createElement(RichTextEditor, {
      identity, label: 'Comment', mode: 'comment', name: 'body', value: 'hi', onChange: () => undefined,
    }))
    const replyHtml = renderToStaticMarkup(createElement(RichTextEditor, {
      identity, label: 'Reply', mode: 'reply', name: 'body', value: 'hi', onChange: () => undefined,
    }))
    const descriptionHtml = renderToStaticMarkup(createElement(RichTextEditor, {
      identity, label: 'Description', mode: 'description', name: 'description', value: 'hi', onChange: () => undefined,
    }))
    const plainHtml = renderToStaticMarkup(createElement(RichTextEditor, {
      identity, label: 'Description', name: 'description', value: 'hi', onChange: () => undefined,
    }))
    expect(commentHtml).toContain('class="rich-editor rich-editor--comment"')
    expect(replyHtml).toContain('class="rich-editor rich-editor--reply"')
    expect(descriptionHtml).toContain('class="rich-editor rich-editor--description"')
    expect(plainHtml).not.toContain('rich-editor--comment')
    expect(plainHtml).not.toContain('rich-editor--reply')
    expect(plainHtml).not.toContain('rich-editor--description')
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

describe('edit, split, and preview views', () => {
  afterEach(() => { cleanup(); localStorage.clear() })

  it('renders Markdown in the initial preview view while keeping the textarea mounted', () => {
    const html = renderToStaticMarkup(createElement(RichTextEditor, {
      identity, label: 'Description', name: 'description', onChange: () => undefined, preview: true, value: '**bold**',
    }))
    expect(html).toContain('data-view="preview"')
    expect(html).toContain('rich-editor-preview-pane')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('data-hidden="true"')
    expect(html).toContain('<textarea')
  })

  it('renders the split view with both the input and the preview pane', () => {
    const html = renderToStaticMarkup(createElement(RichTextEditor, {
      identity, defaultView: 'split', label: 'Description', name: 'description', onChange: () => undefined, value: 'text',
    }))
    expect(html).toContain('data-view="split"')
    expect(html).toContain('<textarea')
    expect(html).toContain('rich-editor-preview-pane')
  })

  it('keeps selection, value, and undo history across preview toggles', () => {
    const onChange = vi.fn()
    render(createElement(StatefulRichTextEditor, { identity, initialValue: 'one', label: 'Description', name: 'description', onChange, testId: 'editor-body' }))
    const textarea = screen.getByTestId('editor-body') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'one two' } })
    textarea.focus()
    textarea.setSelectionRange(2, 5)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    // the input pane stays mounted (hidden) so selection and value survive the toggle
    expect(textarea.closest('[data-hidden]')).not.toBeNull()
    expect(screen.getByRole('region', { name: 'Preview' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(textarea.closest('[data-hidden]')).toBeNull()
    expect(textarea.value).toBe('one two')
    expect(textarea.selectionStart).toBe(2)
    expect(textarea.selectionEnd).toBe(5)
    fireEvent.keyDown(textarea, { key: 'z', ctrlKey: true })
    expect(onChange).toHaveBeenLastCalledWith('one')
  })

  it('isolates draft storage keys by actor, team, field, and revision', () => {
    expect(draftKey(identity)).not.toBe(draftKey({ ...identity, actorId: 'other-actor' }))
    expect(draftKey(identity)).not.toBe(draftKey({ ...identity, teamId: 'team-b' }))
    expect(draftKey(identity)).not.toBe(draftKey({ ...identity, field: 'comment' }))
    expect(draftKey(identity)).not.toBe(draftKey({ ...identity, baseRevision: 8 }))
  })
})

describe('IME composition', () => {
  afterEach(() => { cleanup(); localStorage.clear() })

  it('records one undo step per composition instead of every intermediate', () => {
    const onChange = vi.fn()
    render(createElement(StatefulRichTextEditor, { identity, initialValue: '', label: 'Description', name: 'description', onChange, testId: 'editor-body' }))
    const textarea = screen.getByTestId('editor-body') as HTMLTextAreaElement
    fireEvent.compositionStart(textarea)
    fireEvent.change(textarea, { target: { value: '你' } })
    fireEvent.change(textarea, { target: { value: '你好' } })
    fireEvent.compositionEnd(textarea)
    fireEvent.keyDown(textarea, { key: 'z', ctrlKey: true })
    expect(onChange).toHaveBeenLastCalledWith('')
    // the undo stack is exhausted after a single step; no composition intermediates remain
    fireEvent.keyDown(textarea, { key: 'z', ctrlKey: true })
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('ignores formatting and undo shortcuts while a composition is active', () => {
    const onChange = vi.fn()
    render(createElement(StatefulRichTextEditor, { identity, initialValue: '', label: 'Description', name: 'description', onChange, testId: 'editor-body' }))
    const textarea = screen.getByTestId('editor-body') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'composed' } })
    onChange.mockClear()
    fireEvent.compositionStart(textarea)
    fireEvent.keyDown(textarea, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(textarea, { key: 'b', ctrlKey: true })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('server save pipeline', () => {
  afterEach(() => { cleanup(); localStorage.clear() })

  it('marks server-saved, clears the local draft, and saves against the base revision', async () => {
    const onSave = vi.fn(async () => ({ revision: 8 }))
    render(createElement(StatefulRichTextEditor, { identity, initialValue: 'base', label: 'Description', name: 'description', onSave, testId: 'editor-body' }))
    fireEvent.change(screen.getByTestId('editor-body'), { target: { value: 'next' } })
    expect(localStorage.getItem(draftKey(identity))).not.toBeNull()
    fireEvent.click(screen.getByTestId('rich-editor-save'))
    const status = await waitFor(() => {
      const element = screen.getByTestId('rich-editor-saved')
      expect(element).toHaveAttribute('data-state', 'server-saved')
      return element
    })
    expect(status).toHaveTextContent('Saved to server')
    expect(localStorage.getItem(draftKey(identity))).toBeNull()
    expect(onSave).toHaveBeenCalledWith('next', 7)
  })

  it('shows version-conflict and keeps the local draft when the server revision moved on', async () => {
    const conflict = Object.assign(new Error('stale revision'), { status: 409 })
    expect(isRevisionConflictError(conflict)).toBe(true)
    expect(isRevisionConflictError(new Error('network down'))).toBe(false)
    expect(isRevisionConflictError(Object.assign(new Error('x'), { code: 'REVISION_CONFLICT' }))).toBe(true)
    const onSave = vi.fn(async () => { throw conflict })
    render(createElement(StatefulRichTextEditor, { identity, initialValue: 'base', label: 'Description', name: 'description', onSave, testId: 'editor-body' }))
    fireEvent.change(screen.getByTestId('editor-body'), { target: { value: 'next' } })
    fireEvent.click(screen.getByTestId('rich-editor-save'))
    const status = await waitFor(() => {
      const element = screen.getByTestId('rich-editor-saved')
      expect(element).toHaveAttribute('data-state', 'version-conflict')
      return element
    })
    expect(status).toHaveTextContent('Server has a newer revision. Your draft was not applied.')
    expect(status).toHaveTextContent('Load the latest version before saving. Your local draft is kept.')
    expect(localStorage.getItem(draftKey(identity))).not.toBeNull()
  })

  it('shows save-failed with an explicit retry and never claims the server saved', async () => {
    const onSave = vi.fn(async () => { throw new Error('network down') })
    render(createElement(StatefulRichTextEditor, { identity, initialValue: 'base', label: 'Description', name: 'description', onSave, testId: 'editor-body' }))
    fireEvent.change(screen.getByTestId('editor-body'), { target: { value: 'next' } })
    fireEvent.click(screen.getByTestId('rich-editor-save'))
    const status = await waitFor(() => {
      const element = screen.getByTestId('rich-editor-saved')
      expect(element).toHaveAttribute('data-state', 'save-failed')
      return element
    })
    expect(status).toHaveTextContent('Save failed. Local draft kept.')
    expect(status).not.toHaveTextContent('Saved to server')
    expect(localStorage.getItem(draftKey(identity))).not.toBeNull()
    fireEvent.click(within(status).getByRole('button', { name: 'Retry save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
  })

  it('saves with Ctrl+S but not while an IME composition is active', async () => {
    const onSave = vi.fn(async () => ({ revision: 8 }))
    render(createElement(StatefulRichTextEditor, { identity, initialValue: 'base', label: 'Description', name: 'description', onSave, testId: 'editor-body' }))
    const textarea = screen.getByTestId('editor-body') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'next' } })
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true })
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    fireEvent.compositionStart(textarea)
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true })
    fireEvent.compositionEnd(textarea)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})

describe('dirty leave guard', () => {
  afterEach(() => { cleanup(); localStorage.clear() })

  it('cancels beforeunload while dirty and allows navigation once edits match the server value', () => {
    render(createElement(StatefulRichTextEditor, { identity, initialValue: 'base', label: 'Description', name: 'description', testId: 'editor-body' }))
    const textarea = screen.getByTestId('editor-body') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'dirty' } })
    const blocked = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(blocked)
    expect(blocked.defaultPrevented).toBe(true)
    fireEvent.change(textarea, { target: { value: 'base' } })
    const allowed = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(allowed)
    expect(allowed.defaultPrevented).toBe(false)
  })
})

describe('Draft saved indicator', () => {
  it('shows a not-saved indicator until the editor writes its first draft', () => {
    const html = renderToStaticMarkup(createElement(RichTextEditor, {
      identity, label: 'Description', name: 'description', onChange: () => undefined, value: 'hi',
    }))
    expect(html).toContain('rich-editor-saved')
    expect(html).toContain('Not saved yet')
  })
})
