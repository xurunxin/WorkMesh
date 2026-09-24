'use client'

import type { InputHTMLAttributes, RefAttributes } from 'react'
import { classNames } from '../internal/utils.js'

export type InputProps = RefAttributes<HTMLInputElement> & InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
}

export function Input({ className, invalid = false, ...props }: InputProps) {
  return <input aria-invalid={invalid || undefined} className={classNames('wm-input', invalid && 'is-invalid', className)} {...props} />
}
