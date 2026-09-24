'use client'

import type { HTMLAttributes } from 'react'
import { classNames } from '../internal/utils.js'

export type SkeletonProps = HTMLAttributes<HTMLSpanElement> & { label?: string }

export function Skeleton({ className, label = 'Loading', ...props }: SkeletonProps) {
  return <span aria-label={label} className={classNames('wm-skeleton', className)} role="status" {...props}><span className="wm-visually-hidden">{label}</span></span>
}
