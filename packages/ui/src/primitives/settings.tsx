'use client'

import type { FormHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { classNames } from '../internal/utils.js'
import { Eyebrow } from './eyebrow.js'

export type SettingsGridProps = HTMLAttributes<HTMLElement>

// `title` is omitted from the base attributes: the native one is a tooltip
// string, and intersecting it with a ReactNode title yields a type no call site
// can satisfy. The card's title wins.
export type SettingsCardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /** Small uppercase kicker naming the region, e.g. WORKSPACE STRUCTURE. */
  kicker?: ReactNode
  /** Full-bleed card that spans the grid. */
  wide?: boolean
  /**
   * The card's own heading level. A card that is the page's primary surface
   * takes 1 so the route still has a heading to anchor to; a card inside a
   * page that already has one stays at 2.
   */
  headingLevel?: 1 | 2 | 3
  title?: ReactNode
}

/**
 * A settings surface is a grid of self-contained cards, each naming its region
 * with a kicker before its heading. Several settings screens need the same
 * arrangement, so the grid, the card and the form inside it are declared once.
 */
export function SettingsGrid({ children, className, ...props }: SettingsGridProps) {
  return <div className={classNames('wm-settings-grid', className)} {...props}>{children}</div>
}

export function SettingsCard({ children, className, headingLevel = 2, kicker, title, wide, ...props }: SettingsCardProps) {
  const Heading = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'h3'
  return <section className={classNames('wm-card', 'wm-settings-card', wide && 'wm-settings-card-wide', className)} {...props}>
    {kicker && <Eyebrow>{kicker}</Eyebrow>}
    {title && <Heading className="wm-settings-card-title">{title}</Heading>}
    {children}
  </section>
}

export type SettingsFormProps = FormHTMLAttributes<HTMLFormElement> & {
  /** A single row of label/control pairs, used by the short create forms. */
  inline?: boolean
}

export function SettingsForm({ children, className, inline, ...props }: SettingsFormProps) {
  return <form className={classNames('wm-settings-form', inline && 'wm-settings-form-inline', className)} {...props}>{children}</form>
}

export type SettingsNoticeProps = HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode
}

/** A read-only caller gets a quiet band rather than a disabled form. */
export function SettingsNotice({ children, className, ...props }: SettingsNoticeProps) {
  return <p className={classNames('wm-settings-notice', className)} {...props}>{children}</p>
}

export type DangerZoneProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode
  children: ReactNode
  title: ReactNode
}

/**
 * Destructive actions are separated by a rule, not a red fill: the boundary is
 * what tells a reader this is not a normal action group.
 */
export function DangerZone({ actions, children, className, title, ...props }: DangerZoneProps) {
  return <section className={classNames('wm-danger-zone', className)} {...props}>
    <div><strong>{title}</strong>{children && <p>{children}</p>}</div>
    {actions}
  </section>
}
