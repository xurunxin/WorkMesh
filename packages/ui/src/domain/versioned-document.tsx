'use client'

import type { ReactNode } from 'react'
import { classNames } from '../internal/utils.js'
import { Tag } from '../primitives/tag.js'

export type DocumentRowData = {
  id: string
  /** Shown beside the title, e.g. "r3" or "已归档". */
  meta?: ReactNode
  title: string
}

export type RevisionRowData = {
  id: string
  /** "r3 · Title · 2026-09-27 15:48" or whatever the caller composes. */
  label: string
  title: string
}

export type DiffChange = Readonly<{ kind: 'added' | 'removed' | 'context'; text: string }>

export type DocumentListProps = {
  children: ReactNode
  className?: string
  empty?: ReactNode
  testId?: string
}

export type DocumentRowProps = {
  data: DocumentRowData
  onSelect: (id: string) => void
  selected?: boolean
}

export type DocumentRevisionListProps = {
  className?: string
  empty?: ReactNode
  onInspect: (id: string) => void
  /** The revision the reader is currently showing, so the timeline can mark it. */
  selectedRevisionId?: string | null
  revisions: readonly RevisionRowData[]
}

export type DocumentReadingProps = {
  /** The revision marker, e.g. "r3". Kept in a <small> so it stays a caption. */
  revisionLabel: ReactNode
  /**
   * Optional. A surface that already names the document in a heading above it -
   * the reading tab - omits this; an inspected revision carries its own.
   */
  title?: ReactNode
  children: ReactNode
  className?: string
  /** Status pill beside the title, e.g. 已归档. */
  status?: ReactNode
}

export type DiffViewProps = {
  changes: readonly DiffChange[]
  className?: string
  emptyLabel: string
}

export type DocumentRowGroupProps = {
  children: ReactNode
  className?: string
  label: string
}

/**
 * A versioned document has three faces: the list of them, one revision being
 * read, and the revision timeline behind it. Every Project and every Work Item
 * opens the same surface, so the anatomy lives here instead of being restated
 * per screen. The prototype has no document screen, so this composes the
 * vocabulary it does declare - a titled row list, a 20px heading over a muted
 * caption line, and pill identities - rather than inventing a new shape.
 */
export function DocumentList({ children, className, empty, testId }: DocumentListProps) {
  return <div className={classNames('wm-document-list', className)} data-testid={testId}>
    {children}
    {empty}
  </div>
}

export function DocumentRow({ data, onSelect, selected }: DocumentRowProps) {
  return <button aria-current={selected ? 'true' : undefined} className={classNames('wm-document-row', selected && 'is-current')} onClick={() => onSelect(data.id)} type="button">
    <strong>{data.title}</strong>
    {data.meta !== undefined && data.meta !== null && <span className="wm-document-row-meta">{data.meta}</span>}
  </button>
}

export function DocumentRowGroup({ children, className, label }: DocumentRowGroupProps) {
  return <div aria-label={label} className={classNames('wm-document-list', className)} role="list">
    {(Array.isArray(children) ? children : [children]).map((child, index) => <div className="wm-document-list-item" key={index} role="listitem">{child}</div>)}
  </div>
}

export function DocumentReading({ children, className, revisionLabel, status, title }: DocumentReadingProps) {
  return <article className={classNames('wm-document-reading', className)}>
    {(title !== undefined && title !== null || status !== undefined && status !== null) && <header className="wm-document-reading-head">
      {title !== undefined && title !== null && <h3>{title}</h3>}
      {status !== undefined && status !== null && <Tag>{status}</Tag>}
      <small>{revisionLabel}</small>
    </header>}
    <div className="wm-document-body">{children}</div>
  </article>
}

export function DocumentRevisionList({ className, empty, onInspect, revisions, selectedRevisionId }: DocumentRevisionListProps) {
  return <div className={classNames('wm-document-history', className)}>
    <ul>
      {revisions.map(revision => <li key={revision.id}><button
        aria-current={revision.id === selectedRevisionId ? 'true' : undefined}
        onClick={() => onInspect(revision.id)}
        type="button"
      ><span className="wm-document-revision-number">{revision.title}</span><span className="wm-document-revision-label">{revision.label}</span></button></li>)}
    </ul>
    {revisions.length === 0 && empty}
  </div>
}

/**
 * Unified diff over the server's own change list. The sign is taken from the
 * server's `kind` rather than guessed from the text, so the component stays
 * presentation-only and the transport vocabulary passes straight through.
 */
export function DiffView({ changes, className, emptyLabel }: DiffViewProps) {
  if (changes.length === 0) return <p className="wm-diff-empty">{emptyLabel}</p>
  return <pre className={classNames('wm-diff', className)}>{changes.map((change, index) => {
    const marker = change.kind === 'added' ? '+' : change.kind === 'removed' ? '-' : ' '
    return <span className={`wm-diff-line wm-diff-${change.kind}`} key={index}><span aria-hidden="true" className="wm-diff-marker">{marker}</span>{change.text}{'\n'}</span>
  })}</pre>
}
