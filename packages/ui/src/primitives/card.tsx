'use client'

import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react'
import { classNames } from '../internal/utils.js'

export type CardProps = PropsWithChildren<HTMLAttributes<HTMLElement>> & {
  actions?: ReactNode
  headingLevel?: 1 | 2
  /** Small uppercase kicker above the title, naming the region. */
  kicker?: ReactNode
  subtitle?: string
  title?: string
}

export function Card({ actions, children, className, headingLevel = 2, kicker, subtitle, title, ...props }: CardProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return <section className={classNames('wm-card', className)} {...props}>
    {(title || subtitle || actions || kicker) && <header><div>{kicker && <p className="wm-eyebrow">{kicker}</p>}{title && <Heading>{title}</Heading>}{subtitle && <p>{subtitle}</p>}</div>{actions}</header>}
    <div className="wm-card-content">{children}</div>
  </section>
}
