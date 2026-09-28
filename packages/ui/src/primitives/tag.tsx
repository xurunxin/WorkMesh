'use client'

import type { ReactNode } from 'react'
import { classNames } from '../internal/utils.js'

export type TagProps = {
  children: ReactNode
  className?: string
  /** Visual weight: a quiet identity pill, or the emphasised selected one. */
  tone?: 'neutral' | 'accent'
  testId?: string
}

/**
 * The prototype's pill. One primitive covers the identities it repeats in
 * several places - work item and repository tags, resource and evidence
 * counts, and the sidebar's navigation counters - so those stops cannot drift
 * apart from one another or from the prototype's own metrics.
 */
export function Tag({ children, className, tone = 'neutral', testId }: TagProps) {
  return <span className={classNames('wm-tag', tone === 'accent' && 'wm-tag-accent', className)} data-testid={testId}>{children}</span>
}
