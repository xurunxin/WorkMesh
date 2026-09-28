'use client'

import type { HTMLAttributes, ReactNode } from 'react'
import { classNames } from '../internal/utils.js'

export type EyebrowProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode
  /** Defaults to a <p>; use "span" inside a heading or a label. */
  as?: 'p' | 'span'
}

/**
 * The muted uppercase kicker that names a region before its heading - a team's
 * workspace structure, an Agent's run state, a document's revision. Twelve
 * screens declare the same line, and each had grown its own copy, so it is one
 * primitive with one set of metrics.
 */
export function Eyebrow({ as: Tag = 'p', children, className, ...props }: EyebrowProps) {
  return <Tag className={classNames('wm-eyebrow', className)} {...props}>{children}</Tag>
}
