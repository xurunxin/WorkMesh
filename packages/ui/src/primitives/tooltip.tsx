'use client'

import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PropsWithChildren, type ReactElement } from 'react'
import { classNames } from '../internal/utils.js'

export type TooltipProps = PropsWithChildren<{
  content: ReactElement | string
  id?: string
  placement?: 'above' | 'below'
}>

const SHOW_DELAY_MS = 300

type TriggerProps = Record<string, unknown>

function composeHandler<P extends TriggerProps, E>(childProps: P, key: string, handler: (event: E) => void): (event: E) => void {
  const original = childProps[key]
  return event => {
    if (typeof original === 'function') (original as (event: E) => void)(event)
    handler(event)
  }
}

export function Tooltip({ children, content, id, placement = 'above' }: TooltipProps) {
  const bubbleId = useId()
  const timerRef = useRef<number | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  const show = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS)
  }
  const hide = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    setOpen(false)
  }
  const handleFocus = (event: FocusEvent) => {
    if (event.target.matches(':focus-visible')) show()
  }
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') hide()
  }
  const handleMouseLeave = (event: MouseEvent) => {
    if (open || timerRef.current !== null) hide()
    void event
  }

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<TriggerProps>, {
        'aria-describedby': open ? bubbleId : (children.props as TriggerProps)['aria-describedby'],
        onBlur: composeHandler((children.props as TriggerProps), 'onBlur', hide),
        onFocus: composeHandler((children.props as TriggerProps), 'onFocus', handleFocus),
        onKeyDown: composeHandler((children.props as TriggerProps), 'onKeyDown', handleKeyDown),
        onMouseEnter: composeHandler((children.props as TriggerProps), 'onMouseEnter', show),
        onMouseLeave: composeHandler((children.props as TriggerProps), 'onMouseLeave', handleMouseLeave),
      } as TriggerProps)
    : children

  return <span className="wm-tooltip">
    {trigger}
    {open && <div className={classNames('wm-tooltip-bubble', placement === 'below' && 'wm-tooltip-below')} id={id ?? bubbleId} role="tooltip">{content}</div>}
  </span>
}
