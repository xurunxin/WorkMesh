'use client'

import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode, RefAttributes } from 'react'
import { classNames } from '../internal/utils.js'

export type ButtonProps = PropsWithChildren<RefAttributes<HTMLButtonElement> & ButtonHTMLAttributes<HTMLButtonElement>> & {
  busy?: boolean
  icon?: ReactNode
  iconPosition?: 'start' | 'end'
  size?: 'sm' | 'md' | 'lg'
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function Button({ busy = false, children, className, icon, iconPosition = 'start', size = 'md', variant = 'secondary', ...props }: ButtonProps) {
  return <button aria-busy={busy || undefined} className={classNames('wm-button', `wm-button-${variant}`, size !== 'md' && `wm-button-${size}`, 'ui-button', `ui-button-${variant}`, className)} {...props} disabled={props.disabled ?? busy}>{busy && <span aria-hidden="true" className="wm-button-busy-spinner" />}{icon && iconPosition === 'start' && <span aria-hidden="true" className="wm-button-icon">{icon}</span>}<span className="wm-button-label">{children}</span>{icon && iconPosition === 'end' && <span aria-hidden="true" className="wm-button-icon">{icon}</span>}</button>
}
