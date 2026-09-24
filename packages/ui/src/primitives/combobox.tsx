'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useDismissalLayer } from '../internal/overlay.js'
import { classNames } from '../internal/utils.js'

export type ComboboxOption = {
  id: string
  label: string
}

export type ComboboxProps = {
  ariaLabel: string
  disabled?: boolean
  emptyText?: string
  invalid?: boolean
  name?: string
  onValueChange: (id: string) => void
  options: ComboboxOption[]
  placeholder?: string
  value: string
}

export function Combobox({ ariaLabel, disabled = false, emptyText = 'No matches', invalid = false, name, onValueChange, options, placeholder, value }: ComboboxProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  useDismissalLayer(open, rootRef, inputRef, nextOpen => { setOpen(nextOpen); if (!nextOpen) setQuery('') })

  const selected = options.find(option => option.id === value) ?? null
  const matches = query
    ? options.filter(option => option.label.toLowerCase().includes(query.toLowerCase()))
    : options
  const clampedActiveIndex = matches.length === 0 ? -1 : Math.min(activeIndex, matches.length - 1)
  const activeOption = clampedActiveIndex >= 0 ? matches[clampedActiveIndex] : null

  const select = (option: ComboboxOption) => {
    onValueChange(option.id)
    setQuery('')
    setOpen(false)
    inputRef.current?.focus({ preventScroll: true })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) { setOpen(true); setActiveIndex(0); return }
      if (matches.length === 0) return
      const offset = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((clampedActiveIndex + offset + matches.length) % matches.length)
      return
    }
    if (event.key === 'Enter' && open && activeOption) {
      event.preventDefault()
      select(activeOption)
    }
  }

  return <div className="wm-combobox" ref={rootRef}>
    <input
      aria-activedescendant={open && activeOption ? `${listboxId}-option-${activeOption.id}` : undefined}
      aria-autocomplete="list"
      aria-controls={open ? listboxId : undefined}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-invalid={invalid || undefined}
      aria-label={ariaLabel}
      autoComplete="off"
      className={classNames('wm-input', invalid && 'is-invalid')}
      disabled={disabled}
      id={name}
      name={name}
      onChange={event => { setQuery(event.target.value); setActiveIndex(0); setOpen(true) }}
      onFocus={event => { setOpen(true); event.target.select() }}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      ref={inputRef}
      role="combobox"
      type="text"
      value={open ? query : (selected?.label ?? '')}
    />
    {open && <ul className="wm-combobox-listbox" id={listboxId} role="listbox">
      {matches.length === 0
        ? <li aria-live="polite" className="wm-combobox-empty">{emptyText}</li>
        : matches.map((option, index) => <li
            aria-selected={option.id === value}
            className="wm-combobox-option"
            id={`${listboxId}-option-${option.id}`}
            key={option.id}
            onClick={() => select(option)}
            onMouseDown={event => event.preventDefault()}
            onMouseMove={() => setActiveIndex(index)}
            role="option"
          >
            {option.label}
            {option.id === value && <span aria-hidden="true" className="wm-combobox-option-check">✓</span>}
          </li>)}
    </ul>}
  </div>
}
