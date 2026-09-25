'use client'

import { useEffect, useId, useRef, type PropsWithChildren, type ReactNode, type RefObject } from 'react'
import { coordinateDismissalTriggerActivation, eligibleControls, focusModalRoot, handleModalBackdrop, topDismissal, topModal, useDismissalLayer, useOverlayFocus } from '../internal/overlay.js'
import { classNames } from '../internal/utils.js'
import { Button } from './button.js'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'

export type DialogProps = PropsWithChildren<{
  className?: string
  closeLabel?: string
  description?: string
  dismissible?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  overlayClassName?: string
  title: string
}>

export function Dialog({ children, className, closeLabel = 'Close', description, dismissible = true, initialFocusRef, onClose, open, overlayClassName, title }: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useOverlayFocus(open, dialogRef, backdropRef, initialFocusRef, dismissible, onClose)
  useEffect(() => {
    const layer = layerRef.current
    if (open && !dismissible && layer && eligibleControls(layer.root).length === 0) focusModalRoot(layer)
  }, [dismissible, layerRef, open])
  if (!open) return null
  return <div className={classNames('wm-overlay ui-dialog-backdrop', overlayClassName)} onMouseDown={event => handleModalBackdrop(event, layerRef.current)} ref={backdropRef}>
    <section aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" className={classNames('wm-dialog', 'ui-dialog', className)} ref={dialogRef} role="dialog" tabIndex={-1}>
      <header><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div>{dismissible && <Button aria-label={`${closeLabel} ${title}`} icon={<XIcon aria-hidden size={16} />} onClick={() => { const layer = layerRef.current; if (layer && topModal() === layer && !topDismissal()) layer.onClose() }} type="button" variant="ghost">{closeLabel}</Button>}</header>
      <div className="wm-dialog-content ui-dialog-content">{children}</div>
    </section>
  </div>
}

export type SheetProps = PropsWithChildren<{
  className?: string
  closeLabel?: string
  description?: string
  dismissible?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  side?: 'left' | 'right'
  title: string
}>

export function Sheet({ children, className, closeLabel = 'Close', description, dismissible = true, initialFocusRef, onClose, open, side = 'right', title }: SheetProps) {
  const titleId = useId()
  const descriptionId = useId()
  const sheetRef = useRef<HTMLElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useOverlayFocus(open, sheetRef, backdropRef, initialFocusRef, dismissible, onClose)
  useEffect(() => {
    const layer = layerRef.current
    if (open && !dismissible && layer && eligibleControls(layer.root).length === 0) focusModalRoot(layer)
  }, [dismissible, layerRef, open])
  if (!open) return null
  return <div className="wm-overlay wm-sheet-overlay" onMouseDown={event => handleModalBackdrop(event, layerRef.current)} ref={backdropRef}>
    <section aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" className={classNames('wm-sheet', `wm-sheet-${side}`, className)} ref={sheetRef} role="dialog" tabIndex={-1}>
      <header><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div>{dismissible && <Button aria-label={`${closeLabel} ${title}`} onClick={() => { const layer = layerRef.current; if (layer && topModal() === layer && !topDismissal()) layer.onClose() }} type="button" variant="ghost">{closeLabel}</Button>}</header>
      <div className="wm-sheet-content">{children}</div>
    </section>
  </div>
}

export type PopoverProps = PropsWithChildren<{
  align?: 'start' | 'end'
  label: string
  onOpenChange: (open: boolean) => void
  open: boolean
  trigger: ReactNode
}>

export function Popover({ align = 'start', children, label, onOpenChange, open, trigger }: PopoverProps) {
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  useDismissalLayer(open, rootRef, triggerRef, onOpenChange)
  return <div className="wm-popover" ref={rootRef}>
    <button aria-controls={panelId} aria-expanded={open} aria-haspopup="dialog" className="wm-popover-trigger" data-wm-dismissal-trigger="true" onClick={event => { coordinateDismissalTriggerActivation(event); onOpenChange(!open) }} ref={triggerRef} type="button">{trigger}</button>
    {open && <div aria-label={label} className={classNames('wm-popover-panel', `wm-popover-${align}`)} id={panelId} role="dialog">{children}</div>}
  </div>
}
