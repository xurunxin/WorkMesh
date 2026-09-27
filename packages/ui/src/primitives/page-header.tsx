'use client'

import type { ReactNode } from 'react'
import { classNames } from '../internal/utils.js'

export type PageHeaderProps = {
  actions?: ReactNode
  className?: string
  /** One line stating what the page is for, in the prototype's muted 13px voice. */
  description?: ReactNode
  title: ReactNode
  /**
   * Rendered beside the title, not inside it. The prototype puts a freshness
   * badge next to the name; nesting it in the heading would fold it into the
   * heading's accessible name.
   */
  titleMeta?: ReactNode
}

/**
 * The prototype's .page-head: a 22px title, a 13px muted description and the
 * page's actions pushed to the opposite edge. Every screen repeats this shape,
 * so it lives here rather than being re-declared per page.
 */
export function PageHeader({ actions, className, description, title, titleMeta }: PageHeaderProps) {
  return <header className={classNames('wm-page-head', className)}>
    <div className="wm-page-head-text">
      <div className="wm-page-title-row">
        <h1>{title}</h1>
        {titleMeta}
      </div>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="wm-page-actions">{actions}</div>}
  </header>
}

export type SectionHeaderProps = {
  actions?: ReactNode
  children?: ReactNode
  className?: string
  /** Small uppercase label naming a group inside a page. */
  label: ReactNode
}

/** The prototype's .section-head, including its count pill slot. */
export function SectionHeader({ actions, children, className, label }: SectionHeaderProps) {
  return <div className={classNames('wm-section-head', className)}>
    <h2>{label}</h2>
    {children}
    {actions && <div className="wm-section-actions">{actions}</div>}
  </div>
}
