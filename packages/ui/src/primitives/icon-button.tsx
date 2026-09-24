'use client'

import type { ButtonHTMLAttributes, ReactNode, RefAttributes } from 'react'
import { classNames } from '../internal/utils.js'

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & RefAttributes<HTMLButtonElement> & {
  icon: ReactNode
  label: string
  size?: 'sm' | 'md'
}

export function IconButton({ className, icon, label, size = 'md', type = 'button', ...props }: IconButtonProps) {
  return <button aria-label={label} className={classNames('wm-icon-button', size === 'sm' && 'wm-icon-button-sm', className)} title={label} type={type} {...props}>{icon}</button>
}
