'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { classNames } from '../internal/utils.js'
import { Dialog } from './overlay-surfaces.js'

export type Command = {
  hint?: string
  id: string
  keywords?: string
  label: string
  onSelect: () => void
}

export type CommandPaletteProps = {
  closeLabel?: string
  commands: Command[]
  onOpenChange: (open: boolean) => void
  open: boolean
  placeholder?: string
  title?: string
}

export function CommandPalette({ closeLabel = 'Close', commands, onOpenChange, open, placeholder = 'Search commands', title = 'Command palette' }: CommandPaletteProps) {
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  useEffect(() => {
    if (open) { setQuery(''); setActiveIndex(0) }
  }, [open])

  const matches = query
    ? commands.filter(command => `${command.label} ${command.keywords ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    : commands
  const clampedActiveIndex = matches.length === 0 ? -1 : Math.min(activeIndex, matches.length - 1)
  const activeCommand = clampedActiveIndex >= 0 ? matches[clampedActiveIndex] : null

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (matches.length === 0) return
      const offset = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((clampedActiveIndex + offset + matches.length) % matches.length)
      return
    }
    if (event.key === 'Enter' && activeCommand) {
      event.preventDefault()
      onOpenChange(false)
      activeCommand.onSelect()
    }
  }

  return <Dialog className={classNames('wm-command-palette')} closeLabel={closeLabel} description="Type to search commands, use arrow keys to navigate." dismissible initialFocusRef={inputRef} onClose={() => onOpenChange(false)} open={open} overlayClassName="wm-command-palette-overlay" title={title}>
    <div className="wm-command-palette-input-wrap">
      <input
        aria-activedescendant={activeCommand ? `${listboxId}-command-${activeCommand.id}` : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-label={title}
        autoComplete="off"
        className="wm-input wm-command-palette-input"
        onChange={event => { setQuery(event.target.value); setActiveIndex(0) }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={inputRef}
        role="combobox"
        type="text"
        value={query}
      />
    </div>
    <ul className="wm-command-palette-list" id={listboxId} role="listbox" aria-label={title}>
      {matches.length === 0
        ? <li aria-live="polite" className="wm-combobox-empty">No matching commands</li>
        : matches.map((command, index) => <li
            aria-selected={index === clampedActiveIndex}
            className="wm-combobox-option"
            id={`${listboxId}-command-${command.id}`}
            key={command.id}
            onMouseDown={event => event.preventDefault()}
            onMouseMove={() => setActiveIndex(index)}
            onClick={() => { onOpenChange(false); command.onSelect() }}
            role="option"
          >
            <span>{command.label}</span>
            {command.hint && <span className="wm-kbd">{command.hint}</span>}
          </li>)}
    </ul>
    <footer className="wm-command-palette-footer">
      <span><span aria-hidden="true" className="wm-kbd">↑</span><span aria-hidden="true" className="wm-kbd">↓</span> navigate</span>
      <span><span aria-hidden="true" className="wm-kbd">↵</span> select</span>
      <span><span aria-hidden="true" className="wm-kbd">esc</span> {closeLabel.toLowerCase()}</span>
    </footer>
  </Dialog>
}
