'use client'

import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react'
import { classNames } from '../internal/utils.js'

export type CardProps = PropsWithChildren<HTMLAttributes<HTMLElement>> & {
  actions?: ReactNode
  headingLevel?: 1 | 2
  subtitle?: string
  title?: string
}

export function Card({ actions, children, className, headingLevel = 2, subtitle, title, ...props }: CardProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return <section className={classNames('wm-card', className)} {...props}>
    {(title || subtitle || actions) && <header><div>{title && <Heading>{title}</Heading>}{subtitle && <p>{subtitle}</p>}</div>{actions}</header>}
    <div className="wm-card-content">{children}</div>
  </section>
}
