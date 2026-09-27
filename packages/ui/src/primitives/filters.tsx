'use client'

import type { FormEventHandler, ReactNode } from 'react'
import { classNames } from '../internal/utils.js'

export type FilterDisclosureProps = {
  children: ReactNode
  className?: string
  /** Collapsed label. The prototype shows no filter grid in its resting state. */
  label: ReactNode
  onSubmit?: FormEventHandler<HTMLFormElement>
  testId?: string
}

/**
 * Filters stay reachable without owning the resting layout. Two screens needed
 * the same "collapsed filter row above the content" arrangement, so it is one
 * control rather than a per-screen disclosure rule.
 */
export function FilterDisclosure({ children, className, label, onSubmit, testId }: FilterDisclosureProps) {
  return <details className={classNames('wm-filter-disclosure', className)} data-testid={testId}>
    <summary>{label}</summary>
    <form className="wm-filter-grid" onSubmit={onSubmit}>{children}</form>
  </details>
}
