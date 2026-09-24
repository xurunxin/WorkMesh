'use client'

import type { HTMLAttributes, PropsWithChildren } from 'react'
import { classNames } from '../internal/utils.js'

export type BadgeProps = PropsWithChildren<HTMLAttributes<HTMLSpanElement>> & {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

export function Badge({ children, className, tone = 'neutral', ...props }: BadgeProps) {
  return <span className={classNames('wm-badge', `wm-badge-${tone}`, className)} {...props}>{children}</span>
}
