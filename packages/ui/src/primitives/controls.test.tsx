import { describe, expect, it, vi } from 'vitest'
import { Button } from './button.js'
import { Checkbox, CheckboxGroup } from './checkbox.js'
import { DataTable } from './data-table.js'
import { IconButton } from './icon-button.js'
import { Menu } from './menu.js'
import { buildPaginationSlots, Pagination } from './pagination.js'
import { Switch } from './switch.js'
import { CommandPalette, type CommandPaletteProps } from './command-palette.js'
import { Dialog, type DialogProps } from './overlay-surfaces.js'

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  let nextId = 0
  return {
    ...actual,
    useId: () => `ui-test-${++nextId}`,
    // Direct-call testing of controlled components: refs are plain boxes and
    // effects never run outside a real renderer.
    useEffect: () => undefined,
    useLayoutEffect: () => undefined,
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => [initial, () => undefined],
  }
})

type TestElement = {
  props: Record<string, unknown>
  type: unknown
}

function elementsIn(node: unknown): TestElement[] {
  if (Array.isArray(node)) return node.flatMap(elementsIn)
  if (node === null || typeof node !== 'object') return []
  const props = (node as { props?: unknown }).props
  if (props === null || typeof props !== 'object') return []
  const type = (node as { type?: unknown }).type
  const element: TestElement = { props: props as Record<string, unknown>, type }
  // Invoke nested function components so their host output is visible; hooks
  // are mocked above so the direct call is safe.
  const rendered = typeof type === 'function' ? (type as (p: unknown) => unknown)(props) : element.props.children
  return [element, ...elementsIn(rendered)]
}

/** Recursive text content of a React child tree (elements, arrays, strings). */
function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node === null || typeof node !== 'object') return ''
  const props = (node as { props?: unknown }).props
  if (props === null || typeof props !== 'object') return ''
  return textOf((props as { children?: unknown }).children)
}

/** Invoke an element's event-handler prop (guards undefined handlers). */
function callProp(element: TestElement | undefined, key: string, ...args: unknown[]): unknown {
  const handler = element?.props[key]
  return typeof handler === 'function' ? (handler as (...handlerArgs: unknown[]) => unknown)(...args) : undefined
}

/** CommandPalette wraps itself in a Dialog element; render that dialog's body
 *  with a second direct call so nested assertions see the full tree. */
function renderPalette(props: CommandPaletteProps) {
  const dialog = CommandPalette(props)
  if (dialog === null) return null
  return Dialog(dialog.props as DialogProps)
}

describe('Button busy and size contract', () => {
  it('renders aria-busy with a spinner and disables interaction while busy', () => {
    const busy = Button({ busy: true, children: 'Saving' })
    const elements = elementsIn(busy)
    const root = elements[0]
    expect(root?.props['aria-busy']).toBe(true)
    expect(root?.props.disabled).toBe(true)
    expect(elements.some(element => element.props.className === 'wm-button-busy-spinner')).toBe(true)
    expect(Button({ busy: false, children: 'Idle' }).props['aria-busy']).toBeUndefined()
  })

  it('emits the size class only for non-default sizes', () => {
    expect(String(Button({ children: 'S', size: 'sm' }).props.className)).toContain('wm-button-sm')
    expect(String(Button({ children: 'L', size: 'lg' }).props.className)).toContain('wm-button-lg')
    expect(String(Button({ children: 'M', size: 'md' }).props.className)).not.toContain('wm-button-md')
  })
})

describe('IconButton accessibility contract', () => {
  it('requires an accessible name and defaults to type button', () => {
    const icon = IconButton({ icon: '×', label: 'Close dialog' })
    expect(icon.props['aria-label']).toBe('Close dialog')
    expect(icon.props.type).toBe('button')
    expect(icon.props.title).toBe('Close dialog')
    expect(String(icon.props.className)).toContain('wm-icon-button')
    const small = IconButton({ icon: '×', label: 'Search', size: 'sm' })
    expect(String(small.props.className)).toContain('wm-icon-button-sm')
  })
})

describe('Switch contract', () => {
  it('renders the switch role with an owned checked state and toggle callback', () => {
    const on = Switch({ checked: true, label: 'Notifications', onCheckedChange: () => undefined })
    expect(on.props.role).toBe('switch')
    expect(on.props['aria-checked']).toBe(true)
    expect(on.props['aria-label']).toBe('Notifications')
    const off = Switch({ checked: false, label: 'Notifications', onCheckedChange: () => undefined })
    expect(off.props['aria-checked']).toBe(false)
    const onToggle = vi.fn()
    Switch({ checked: true, label: 'Notifications', onCheckedChange: onToggle }).props.onClick()
    expect(onToggle).toHaveBeenCalledWith(false)
  })
})

describe('Checkbox contract', () => {
  it('maps indeterminate to aria-checked mixed and resolves to true on toggle', () => {
    const mixed = Checkbox({ 'aria-label': 'Rows', checked: 'indeterminate', onCheckedChange: () => undefined })
    expect(mixed.props['aria-checked']).toBe('mixed')
    expect(mixed.props.checked).toBe(false)
    expect(mixed.props.type).toBe('checkbox')
    const onCheckedChange = vi.fn()
    Checkbox({ 'aria-label': 'Rows', checked: 'indeterminate', onCheckedChange }).props.onChange()
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    const off = Checkbox({ 'aria-label': 'Rows', checked: false, onCheckedChange: () => undefined })
    expect(off.props['aria-checked']).toBeUndefined()
    expect(off.props.checked).toBe(false)
  })

  it('renders a named group and toggles membership through values', () => {
    const onValuesChange = vi.fn()
    const group = CheckboxGroup({
      label: 'Work item labels',
      onValuesChange,
      options: [
        { label: 'Labels', value: 'labels' },
        { disabled: true, label: 'Estimate', value: 'estimate' },
      ],
      values: ['labels'],
    })
    const elements = elementsIn(group)
    const fieldset = elements[0]
    expect(fieldset?.type).toBe('fieldset')
    expect(elements.some(element => element.type === 'legend' && element.props.className === 'wm-visually-hidden' && element.props.children === 'Work item labels')).toBe(true)
    const estimate = elements.find(element => element.props?.value === 'estimate')
    expect(estimate?.props.disabled).toBe(true)
    const labels = elements.find(element => element.props?.value === 'labels' && element.props.type === 'checkbox')
    callProp(labels, 'onChange')
    expect(onValuesChange).toHaveBeenCalledWith([])
    const empty = CheckboxGroup({ label: 'L', onValuesChange, options: [{ label: 'Labels', value: 'labels' }], values: [] })
    const unchecked = elementsIn(empty).find(element => element.props?.value === 'labels' && element.props.type === 'checkbox')
    callProp(unchecked, 'onChange')
    expect(onValuesChange).toHaveBeenCalledWith(['labels'])
  })
})

describe('Menu contract', () => {
  const entries = [
    { id: 'open', label: 'Open item' },
    'separator' as const,
    { id: 'archive', label: 'Archive', tone: 'danger' as const },
    { id: 'locked', label: 'Locked action', disabled: true },
  ]

  /** Locate a rendered menu item button by role and visible text — the item's
   *  children are an array ([check span?] + label), never a plain string. */
  const menuItem = (elements: TestElement[], label: string) =>
    elements.find(element =>
      (element.props.role === 'menuitem' || element.props.role === 'menuitemradio')
      && textOf(element.props.children).includes(label))

  it('renders only the trigger while closed with menu semantics', () => {
    const closed = Menu({ entries, label: 'Item actions', onOpenChange: () => undefined, onSelection: () => undefined, open: false, trigger: 'Actions' })
    const elements = elementsIn(closed)
    expect(elements.filter(element => element.props.role === 'menu')).toHaveLength(0)
    const trigger = elements.find(element => element.props['aria-haspopup'] === 'menu')
    expect(trigger?.props['aria-expanded']).toBe(false)
    expect(elementsIn(closed).some(element => element.props['data-wm-dismissal-trigger'] === 'true')).toBe(true)
  })

  it('renders items, separators, danger tone and a selected radio entry while open', () => {
    const open = Menu({ entries, label: 'Item actions', onOpenChange: () => undefined, onSelection: () => undefined, open: true, selectedId: 'open', trigger: 'Actions' })
    const elements = elementsIn(open)
    const menu = elements.find(element => element.props.role === 'menu')
    expect(menu?.props['aria-label']).toBe('Item actions')
    expect(elements.filter(element => element.props['aria-hidden'] === true && element.props.className === 'wm-menu-separator')).toHaveLength(1)
    const openItem = menuItem(elements, 'Open item')
    expect(openItem?.props.role).toBe('menuitemradio')
    expect(openItem?.props['aria-checked']).toBe('true')
    const archive = menuItem(elements, 'Archive')
    expect(String(archive?.props.className)).toContain('wm-menu-item-danger')
    const locked = menuItem(elements, 'Locked action')
    expect(locked?.props['aria-disabled']).toBe(true)
  })

  it('selects, closes and returns focus through the trigger callback', () => {
    const onOpenChange = vi.fn()
    const onSelection = vi.fn()
    const open = Menu({ entries, label: 'Item actions', onOpenChange, onSelection, open: true, trigger: 'Actions' })
    const item = menuItem(elementsIn(open), 'Open item')
    callProp(item, 'onClick')
    expect(onSelection).toHaveBeenCalledWith('open')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('opens from the trigger with ArrowDown', () => {
    const onOpenChange = vi.fn()
    const closed = Menu({ entries, label: 'Item actions', onOpenChange, onSelection: () => undefined, open: false, trigger: 'Actions' })
    const trigger = elementsIn(closed).find(element => element.props['aria-haspopup'] === 'menu')
    callProp(trigger, 'onKeyDown', { key: 'ArrowDown', preventDefault: () => undefined })
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })
})

describe('Pagination contract', () => {
  it('builds a collapsed slot window with ellipses and pinned edges', () => {
    expect(buildPaginationSlots(5, 20, 1)).toEqual([1, 'ellipsis-before', 4, 5, 6, 'ellipsis-after', 20])
    expect(buildPaginationSlots(1, 3, 1)).toEqual([1, 2, 3])
    expect(buildPaginationSlots(2, 7, 0)).toEqual([1, 2, 'ellipsis-after', 7])
  })

  it('marks the current page, disables at bounds and reports clicks', () => {
    const onPageChange = vi.fn()
    const nav = Pagination({ onPageChange, page: 5, pageCount: 20 })
    const elements = elementsIn(nav)
    expect(elements[0]?.props['aria-label']).toBe('Pagination')
    const current = elements.find(element => element.props['aria-current'] === 'page')
    expect(current?.props.children).toBe(5)
    const previous = elements.find(element => element.props['aria-label'] === 'Previous page')
    const next = elements.find(element => element.props['aria-label'] === 'Next page')
    expect(previous?.props.disabled).toBe(false)
    expect(next?.props.disabled).toBe(false)
    callProp(previous, 'onClick')
    expect(onPageChange).toHaveBeenLastCalledWith(4)
    const first = Pagination({ onPageChange, page: 1, pageCount: 20 })
    expect(elementsIn(first).find(element => element.props['aria-label'] === 'Previous page')?.props.disabled).toBe(true)
    const last = Pagination({ onPageChange, page: 20, pageCount: 20 })
    expect(elementsIn(last).find(element => element.props['aria-label'] === 'Next page')?.props.disabled).toBe(true)
  })
})

describe('DataTable contract', () => {
  type Row = { id: string; priority: number; title: string }
  const columns = [
    { id: 'title', sortValue: (row: Row) => row.title, title: 'Title' },
    { align: 'numeric' as const, id: 'priority', sortValue: (row: Row) => row.priority, title: 'Priority' },
  ]
  const rows: Row[] = [
    { id: 'WM-1', priority: 2, title: 'Freeze contracts' },
    { id: 'WM-2', priority: 1, title: 'Audit secrets' },
  ]

  it('renders sortable headers with aria-sort and cycles null → asc → desc → null', () => {
    const onSortChange = vi.fn()
    const unsorted = DataTable<Row>({
      columns,
      getRowId: row => row.id,
      onSortChange,
      renderCell: (row, column) => String(row[column.id as keyof Row]),
      rows,
      sort: null,
    })
    let elements = elementsIn(unsorted)
    expect(elements.filter(element => element.props['aria-sort'] !== undefined)).toHaveLength(0)
    const sortButtons = elements.filter(element => element.props.className === 'wm-table-sort')
    expect(sortButtons).toHaveLength(2)
    callProp(sortButtons[0], 'onClick')
    expect(onSortChange).toHaveBeenCalledWith({ columnId: 'title', direction: 'asc' })

    const ascending = DataTable<Row>({ columns, getRowId: row => row.id, onSortChange, renderCell: () => null, rows, sort: { columnId: 'title', direction: 'asc' } })
    elements = elementsIn(ascending)
    expect(elements.find(element => element.props['aria-sort'] === 'ascending')).toBeTruthy()
    const sortButton = elements.filter(element => element.props.className === 'wm-table-sort')[0]
    callProp(sortButton, 'onClick')
    expect(onSortChange).toHaveBeenCalledWith({ columnId: 'title', direction: 'desc' })

    const descending = DataTable<Row>({ columns, getRowId: row => row.id, onSortChange, renderCell: () => null, rows, sort: { columnId: 'title', direction: 'desc' } })
    expect(elementsIn(descending).find(element => element.props['aria-sort'] === 'descending')).toBeTruthy()
    const lastToggle = elementsIn(descending).filter(element => element.props.className === 'wm-table-sort')[0]
    callProp(lastToggle, 'onClick')
    expect(onSortChange).toHaveBeenCalledWith(null)
  })

  it('renders selection checkboxes with names and row selection state', () => {
    const onToggleRow = vi.fn()
    const onToggleAllRows = vi.fn()
    const table = DataTable<Row>({
      columns,
      getRowId: row => row.id,
      onToggleAllRows,
      onToggleRow,
      renderCell: (row, column) => String(row[column.id as keyof Row]),
      rows,
      selectedRowIds: ['WM-1'],
    })
    const elements = elementsIn(table)
    const selectedRow = elements.find(element => String(element.props.className).includes('is-selected'))
    expect(selectedRow).toBeTruthy()
    const allToggle = elements.find(element => typeof element.props['aria-label'] === 'string' && element.props['aria-label'].includes('Select all rows'))
    expect(allToggle).toBeTruthy()
    const rowToggle = elements.find(element => element.props['aria-label'] === 'Select WM-2' && element.props.type === 'checkbox')
    callProp(rowToggle, 'onChange')
    expect(onToggleRow).toHaveBeenCalledWith('WM-2')
    const numericCell = elements.find(element => element.props.className === 'wm-table-num')
    expect(numericCell).toBeTruthy()
  })

  it('renders an empty state spanning all columns', () => {
    const table = DataTable<Row>({ columns, emptyLabel: 'No rows', getRowId: row => row.id, renderCell: () => null, rows: [] })
    const empty = elementsIn(table).find(element => element.props.colSpan === 2)
    expect(empty?.props.children).toBe('No rows')
    const selectable = DataTable<Row>({ columns, emptyLabel: 'No rows', getRowId: row => row.id, onToggleRow: () => undefined, renderCell: () => null, rows: [] })
    expect(elementsIn(selectable).find(element => element.props.colSpan === 3)).toBeTruthy()
  })

  it('renders a caption when provided', () => {
    const table = DataTable<Row>({ caption: 'Work items', columns, getRowId: row => row.id, renderCell: () => null, rows })
    expect(elementsIn(table).some(element => element.type === 'caption' && element.props.children === 'Work items')).toBe(true)
  })
})

describe('CommandPalette contract', () => {
  const commands = [
    { id: 'new-item', label: 'New work item', onSelect: () => undefined },
    { id: 'stop', label: 'Stop agent session', hint: 'S', onSelect: () => undefined },
  ]

  it('renders nothing while closed', () => {
    expect(renderPalette({ commands, onOpenChange: () => undefined, open: false })).toBeNull()
  })

  it('renders a named combobox over a listbox of selectable commands', () => {
    const palette = renderPalette({ commands, onOpenChange: () => undefined, open: true })
    const elements = elementsIn(palette)
    expect(elements.some(element => element.props.role === 'dialog')).toBe(true)
    const input = elements.find(element => element.props.role === 'combobox')
    expect(input?.props['aria-expanded']).toBe('true')
    expect(input?.props['aria-autocomplete']).toBe('list')
    const listbox = elements.find(element => element.props.role === 'listbox')
    expect(listbox).toBeTruthy()
    expect(input?.props['aria-controls']).toBe(listbox?.props.id)
    const hint = elements.find(element => element.props.className === 'wm-kbd')
    expect(hint?.props.children).toBe('S')
  })

  it('selects the active command with Enter and closes', () => {
    const onOpenChange = vi.fn()
    const onSelect = vi.fn()
    const palette = renderPalette({ commands: [{ id: 'a', label: 'New work item', onSelect }], onOpenChange, open: true })
    const input = elementsIn(palette).find(element => element.props.role === 'combobox')
    callProp(input, 'onKeyDown', { key: 'Enter', preventDefault: () => undefined })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('moves the active option with arrow keys', () => {
    const palette = renderPalette({ commands, onOpenChange: () => undefined, open: true })
    const input = elementsIn(palette).find(element => element.props.role === 'combobox')
    expect(() => callProp(input, 'onKeyDown', { key: 'ArrowDown', preventDefault: () => undefined })).not.toThrow()
  })
})
