'use client'

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { coordinateDismissalTriggerActivation, useDismissalLayer } from '../internal/overlay.js'
import { classNames } from '../internal/utils.js'

export type MenuItem = {
  disabled?: boolean
  id: string
  label: ReactNode
  tone?: 'danger'
}

export type MenuEntry = MenuItem | 'separator'

export type MenuProps = {
  align?: 'start' | 'end'
  entries: MenuEntry[]
  label: string
  onOpenChange: (open: boolean) => void
  onSelection: (id: string) => void
  open: boolean
  selectedId?: string
  trigger: ReactNode
}

function enabledMenuItems(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return []
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'))
}

export function Menu({ align = 'start', entries, label, onOpenChange, onSelection, open, selectedId, trigger }: MenuProps) {
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLUListElement | null>(null)
  useDismissalLayer(open, rootRef, triggerRef, onOpenChange)

  const handleMenuKeydown = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = enabledMenuItems(menuRef.current)
    if (items.length === 0) return
    const currentIndex = items.findIndex(item => item === document.activeElement)
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length
    else if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = items.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    items[nextIndex]?.focus({ preventScroll: true })
  }

  return <div className="wm-popover wm-menu-root" ref={rootRef}>
    <button
      aria-controls={open ? menuId : undefined}
      aria-expanded={open}
      aria-haspopup="menu"
      className="wm-popover-trigger wm-menu-trigger"
      data-wm-dismissal-trigger="true"
      onClick={event => { coordinateDismissalTriggerActivation(event); onOpenChange(!open) }}
      onKeyDown={event => { if (!open && event.key === 'ArrowDown') { event.preventDefault(); onOpenChange(true) } }}
      ref={triggerRef}
      type="button"
    >{trigger}</button>
    {open && <ul aria-label={label} className={classNames('wm-menu', `wm-menu-${align}`)} id={menuId} onKeyDown={handleMenuKeydown} ref={menuRef} role="menu" tabIndex={-1}>
      {entries.map((entry, index) => {
        if (entry === 'separator') return <li aria-hidden={true} className="wm-menu-separator" key={`separator-${index}`} role="presentation" />
        const selected = entry.id === selectedId
        return <li key={entry.id} role="presentation">
          <button
            aria-checked={selected ? 'true' : undefined}
            aria-disabled={entry.disabled || undefined}
            className={classNames('wm-menu-item', entry.tone === 'danger' && 'wm-menu-item-danger')}
            onClick={() => { if (entry.disabled) return; onSelection(entry.id); onOpenChange(false); triggerRef.current?.focus({ preventScroll: true }) }}
            role={selected ? 'menuitemradio' : 'menuitem'}
            tabIndex={-1}
            type="button"
          >{selected && <span aria-hidden="true" className="wm-menu-item-check">✓</span>}{entry.label}</button>
        </li>
      })}
    </ul>}
  </div>
}
