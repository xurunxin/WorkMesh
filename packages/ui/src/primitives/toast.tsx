'use client'

import type { HTMLAttributes } from 'react'
import { classNames } from '../internal/utils.js'
import { Button } from './button.js'

export type ToastProps = {
  dismissLabel?: string
  dismissText?: string
  message: string
  onBlurCapture?: HTMLAttributes<HTMLElement>['onBlurCapture']
  onDismiss?: () => void
  onFocusCapture?: HTMLAttributes<HTMLElement>['onFocusCapture']
  onPointerEnter?: HTMLAttributes<HTMLElement>['onPointerEnter']
  onPointerLeave?: HTMLAttributes<HTMLElement>['onPointerLeave']
  open: boolean
  title?: string
  toastId?: string
  tone?: 'info' | 'success' | 'warning' | 'danger'
}

export function Toast({
  dismissLabel = 'Dismiss notification',
  dismissText = 'Dismiss',
  message,
  onBlurCapture,
  onDismiss,
  onFocusCapture,
  onPointerEnter,
  onPointerLeave,
  open,
  title,
  toastId,
  tone = 'info',
}: ToastProps) {
  if (!open) return null
  const urgent = tone === 'danger' || tone === 'warning'
  return <aside
    aria-atomic={true}
    className={classNames('wm-toast', `wm-toast-${tone}`)}
    data-toast-id={toastId}
    onBlurCapture={onBlurCapture}
    onFocusCapture={onFocusCapture}
    onPointerEnter={onPointerEnter}
    onPointerLeave={onPointerLeave}
    role={urgent ? 'alert' : 'status'}
  >
    <div>{title && <strong>{title}</strong>}<p>{message}</p></div>
    {onDismiss && <Button aria-label={dismissLabel} data-toast-close-id={toastId} onClick={onDismiss} type="button" variant="ghost">{dismissText}</Button>}
  </aside>
}
