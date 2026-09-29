'use client'

import type { ReactNode } from 'react'
import { classNames } from '../internal/utils.js'

export type StatRow = Readonly<{ label: ReactNode; value: ReactNode }>

export type StatGridProps = {
  children: ReactNode
  className?: string
  label?: string
}

export type StatCardProps = {
  /** Rendered after the rows, for anything the rows do not cover. */
  children?: ReactNode
  /** Optional mono heading above the rows, e.g. a currency code. */
  caption?: ReactNode
  className?: string
  /**
   * The accessible name for the tile. Read as one phrase, so it should name
   * what the tile is about rather than restate the markup.
   */
  label: string
  /** Footnote under the rows, e.g. a caveat about what is not counted. */
  note?: ReactNode
  /**
   * The figures. One row for a single total; two when a figure has to be read
   * against its own complement, as a currency bucket's known cost sits beside
   * the count whose cost the server does not know.
   */
  rows: readonly StatRow[]
  testId?: string
}

/**
 * A labelled figure. The prototype states one as a card with a kicker, a large
 * tabular value and an optional delta or caveat, and the product needs the same
 * thing wherever a projection reports a number: cost, tokens, runtime, queue
 * depth. The rows stay a description list so a label and its value remain
 * associated when a tile carries more than one.
 */
export function StatGrid({ children, className, label }: StatGridProps) {
  return <ul aria-label={label} className={classNames('wm-stat-grid', className)}>{children}</ul>
}

export function StatCard({ caption, children, className, label, note, rows, testId }: StatCardProps) {
  return <li aria-label={label} className={classNames('wm-stat-card', className)} data-testid={testId}>
    {caption !== undefined && caption !== null && <h3>{caption}</h3>}
    <dl>{rows.map(row => <div key={String(row.label)}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
    {note !== undefined && note !== null && <small>{note}</small>}
    {children}
  </li>
}
