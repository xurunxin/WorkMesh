'use client'

import type { PropsWithChildren, SelectHTMLAttributes } from 'react'
import { classNames } from '../internal/utils.js'

export type SelectProps = PropsWithChildren<SelectHTMLAttributes<HTMLSelectElement>> & {
  invalid?: boolean
}

export function Select({ children, className, invalid = false, ...props }: SelectProps) {
  return <select aria-invalid={invalid || undefined} className={classNames('wm-select', invalid && 'is-invalid', className)} {...props}>{children}</select>
}
