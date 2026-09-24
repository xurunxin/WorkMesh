import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Button } from './button.js'
import { Combobox } from './combobox.js'
import { ComponentCatalog } from './catalog.js'
import { Tooltip } from './tooltip.js'
import { Menu } from './menu.js'

/* These fixtures render through real React (no hook mocks) so hookful
 * components (Tooltip, Combobox, ComponentCatalog) participate in the
 * assertions. Server rendering executes render logic and initial state. */

describe('Tooltip rendered contract', () => {
  it('renders a wrapper without a bubble and no described-by while closed', () => {
    const markup = renderToStaticMarkup(createElement(Tooltip, { content: 'Runs the item' }, createElement(Button, {}, 'Run')))
    expect(markup).toContain('wm-tooltip')
    expect(markup).not.toContain('wm-tooltip-bubble')
    expect(markup).not.toContain('aria-describedby')
    expect(markup).toContain('Run')
  })

  it('wires hover, focus-visible, escape and a delayed show in source', () => {
    const source = readFileSync(fileURLToPath(new URL('./tooltip.tsx', import.meta.url)), 'utf8')
    expect(source).toContain(":focus-visible")
    expect(source).toContain("'Escape'")
    expect(source).toContain('aria-describedby')
    expect(source).toContain('SHOW_DELAY_MS')
  })
})

describe('Combobox rendered contract', () => {
  const options = [
    { id: 'agent-pi', label: 'Pi Runner' },
    { id: 'agent-claude', label: 'Claude Agent' },
  ]

  it('renders a closed combobox showing the selected option label', () => {
    const markup = renderToStaticMarkup(createElement(Combobox, {
      ariaLabel: 'Assign agent',
      onValueChange: () => undefined,
      options,
      value: 'agent-pi',
    }))
    expect(markup).toContain('role="combobox"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('aria-autocomplete="list"')
    expect(markup).toContain('aria-label="Assign agent"')
    expect(markup).toContain('value="Pi Runner"')
    expect(markup).not.toContain('wm-combobox-listbox')
  })

  it('keeps arrow, enter and dismissal handling in the shared implementation', () => {
    const source = readFileSync(fileURLToPath(new URL('./combobox.tsx', import.meta.url)), 'utf8')
    expect(source).toContain('useDismissalLayer')
    expect(source).toContain("'ArrowDown'")
    expect(source).toContain("'ArrowUp'")
    expect(source).toContain("'Enter'")
  })
})

describe('Menu keyboard contract in source', () => {
  it('keeps roving focus, Home/End and selection close in the shared implementation', () => {
    const source = readFileSync(fileURLToPath(new URL('./menu.tsx', import.meta.url)), 'utf8')
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) expect(source).toContain(`'${key}'`)
    expect(source).toContain('useDismissalLayer')
    expect(source).toContain('onOpenChange(false)')
    expect(source).toContain('triggerRef.current?.focus')
  })
})

describe('ComponentCatalog fixtures', () => {
  it('renders every shared control family with its state fixtures', () => {
    const markup = renderToStaticMarkup(createElement(ComponentCatalog, {}))
    for (const marker of [
      'wm-button-primary',
      'wm-button-danger',
      'wm-button-ghost',
      'wm-icon-button',
      'wm-switch',
      'wm-checkbox',
      'wm-input',
      'wm-menu-trigger',
      'wm-tooltip',
      'wm-combobox',
      'wm-tab',
      'wm-badge-danger',
      'wm-data-table-frame',
      'wm-table-sort',
      'wm-pagination-page',
      'wm-state-surface',
      'wm-skeleton',
      'Component catalog',
    ]) expect(markup).toContain(marker)
  })
})
