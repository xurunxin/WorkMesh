'use client'

import type { ReactNode } from 'react'
import { classNames } from '../internal/utils.js'

export type AutonomyRowProps = {
  /** The Human-visible name of the policy, shown with a status dot. */
  label: ReactNode
  /** What turning it on actually permits, in the prototype's own wording. */
  description?: ReactNode
  /** Small muted note about who may change it. */
  note?: ReactNode
  /** The enable/disable control, supplied by the caller so the row stays presentational. */
  action?: ReactNode
  tone?: 'neutral' | 'active'
  className?: string
  testId?: string
}

/**
 * The prototype's autonomy strip: a single compact row, not a panel stack. The
 * earlier implementation rendered this as a two-panel block with a secondary
 * column, which is the old admin idiom rather than the prototype's.
 */
export function AutonomyRow({ action, className, description, label, note, testId, tone = 'neutral' }: AutonomyRowProps) {
  return <section className={classNames('wm-autonomy', tone === 'active' && 'is-active', className)} data-testid={testId}>
    <div className="wm-autonomy-head">
      <span className="wm-autonomy-label">
        <span aria-hidden="true" className="wm-autonomy-dot" />
        {label}
      </span>
      {note && <span className="wm-autonomy-note">{note}</span>}
      {action && <div className="wm-autonomy-action">{action}</div>}
    </div>
    {description && <p className="wm-autonomy-description">{description}</p>}
  </section>
}
