// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkItemCard, workItemDueKind, type WorkItemCardData } from '@workmesh/ui'

// Testing Library's automatic cleanup only fires when the test environment
// is `jsdom` and the project has been initialized for it; in this monorepo
// the suite mixes node + jsdom files, so we unmount explicitly to keep each
// test's DOM isolated.
afterEach(() => { cleanup() })

const baseItem: WorkItemCardData = {
  id: 'work-1',
  identifier: 'WM-1',
  title: 'Test work item',
  statusId: 'status-1',
  statusName: 'Open',
}

describe('WorkItemCard density modifier', () => {
  it('applies the compact modifier class when density="compact"', () => {
    const { container } = render(<WorkItemCard density="compact" item={baseItem} layout="list" />)
    const article = container.querySelector('.wm-work-item-card')
    expect(article).not.toBeNull()
    expect(article?.className).toContain('wm-work-item-card--compact')
  })

  it('omits the compact modifier class by default (comfortable)', () => {
    const { container } = render(<WorkItemCard item={baseItem} layout="list" />)
    const article = container.querySelector('.wm-work-item-card')
    expect(article).not.toBeNull()
    expect(article?.className).not.toContain('wm-work-item-card--compact')
  })

  it('omits the compact modifier class when density="comfortable" is explicit', () => {
    const { container } = render(<WorkItemCard density="comfortable" item={baseItem} layout="list" />)
    const article = container.querySelector('.wm-work-item-card')
    expect(article).not.toBeNull()
    expect(article?.className).not.toContain('wm-work-item-card--compact')
  })

  it('applies the compact modifier on board layout as well', () => {
    const { container } = render(<WorkItemCard density="compact" item={baseItem} layout="board" />)
    const article = container.querySelector('.wm-work-item-card')
    expect(article).not.toBeNull()
    expect(article?.className).toContain('wm-work-item-card--compact')
    expect(article?.className).toContain('wm-work-item-card-board')
  })
})

describe('WorkItemCard priority bars', () => {
  // The prototype's signature priority glyph encodes the level in the filled
  // bar count as well as in colour and text, so priority survives a missing hue.
  const filledBars = (priority: string) => {
    const { container } = render(<WorkItemCard item={{ ...baseItem, priority }} layout="list" />)
    return container.querySelectorAll('.wm-priority-bar[data-on="true"]').length
  }

  it('fills three bars for urgent, two for high, one for medium and none for low', () => {
    expect(filledBars('urgent')).toBe(3)
    expect(filledBars('high')).toBe(2)
    expect(filledBars('medium')).toBe(1)
    expect(filledBars('low')).toBe(0)
  })

  it('renders exactly three bars so the shape is stable across priorities', () => {
    const { container } = render(<WorkItemCard item={{ ...baseItem, priority: 'urgent' }} layout="list" />)
    expect(container.querySelectorAll('.wm-priority-bar')).toHaveLength(3)
  })

  it('keeps the text label alongside the bars as the accessible channel', () => {
    const { container } = render(<WorkItemCard item={{ ...baseItem, priority: 'urgent' }} layout="list" />)
    const badge = container.querySelector('.wm-work-item-priority')
    expect(badge?.textContent).toContain('Urgent')
    expect(badge?.querySelector('.wm-priority-bars')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders no bars when the work item has no priority', () => {
    const { container } = render(<WorkItemCard item={baseItem} layout="list" />)
    expect(container.querySelector('.wm-priority-bars')).toBeNull()
  })
})

describe('WorkItemCard status name pill', () => {
  it('uses the matching workflow status color as the shared CSS custom property', () => {
    const { container } = render(<WorkItemCard item={baseItem} layout="list" statusOptions={[{ id: 'status-1', name: 'Open', color: '#2563EB' }]} />)
    const article = container.querySelector<HTMLElement>('.wm-work-item-card')
    expect(article?.style.getPropertyValue('--wm-status-color')).toBe('#2563EB')
  })

  it('renders the status name as a pill next to the identifier', () => {
    const { container } = render(<WorkItemCard item={baseItem} layout="list" />)
    const pill = container.querySelector('.wm-work-item-status-pill')
    expect(pill).not.toBeNull()
    expect(pill?.textContent).toBe('Open')
  })

  it('places the status pill inside the heading row alongside the identifier', () => {
    const { container } = render(<WorkItemCard item={baseItem} layout="list" />)
    const heading = container.querySelector('.wm-work-item-card-heading')
    expect(heading).not.toBeNull()
    const identifier = heading?.querySelector('.wm-work-item-identifier')
    const pill = heading?.querySelector('.wm-work-item-status-pill')
    expect(identifier).not.toBeNull()
    expect(pill).not.toBeNull()
    expect(identifier?.textContent).toBe('WM-1')
  })

  it('applies a status-category modifier class to the pill', () => {
    const item: WorkItemCardData = { ...baseItem, statusCategory: 'in_progress' }
    const { container } = render(<WorkItemCard item={item} layout="list" />)
    const pill = container.querySelector('.wm-work-item-status-pill')
    expect(pill).not.toBeNull()
    expect(pill?.className).toContain('status-in_progress')
  })

  it('falls back to the "unknown" status-category modifier when statusCategory is missing', () => {
    const { container } = render(<WorkItemCard item={baseItem} layout="list" />)
    const pill = container.querySelector('.wm-work-item-status-pill')
    expect(pill).not.toBeNull()
    expect(pill?.className).toContain('status-unknown')
  })
})

describe('workItemDueKind', () => {
  const now = new Date(2026, 5, 15, 9, 30) // 2026-06-15 local

  it('classifies a past day as overdue against the viewer local day', () => {
    expect(workItemDueKind('2026-06-14', now)).toBe('overdue')
  })

  it('classifies the viewer local day as today', () => {
    expect(workItemDueKind('2026-06-15', now)).toBe('today')
  })

  it('classifies a future day as upcoming', () => {
    expect(workItemDueKind('2026-06-16', now)).toBe('upcoming')
  })

  it('ignores the time of day on both sides', () => {
    // 23:30 local on the 14th is still the 14th, so an Issue due that day is
    // not overdue yet; a UTC-parsed timestamp would have flipped this.
    expect(workItemDueKind('2026-06-14', new Date(2026, 5, 14, 23, 30))).toBe('today')
  })

  it('returns null for an unset or unparseable date instead of guessing', () => {
    expect(workItemDueKind(undefined, now)).toBeNull()
    expect(workItemDueKind(null, now)).toBeNull()
    expect(workItemDueKind('', now)).toBeNull()
    expect(workItemDueKind('not-a-date', now)).toBeNull()
  })

  it('accepts a full ISO timestamp and reads only its calendar day', () => {
    expect(workItemDueKind('2026-06-15T23:59:59.000Z', now)).toBe('today')
  })
})

describe('WorkItemCard due date chip', () => {
  const localToday = (): string => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  it('renders no chip when the Issue has no due date', () => {
    const { container } = render(<WorkItemCard item={baseItem} layout="board" />)
    expect(container.querySelector('.wm-work-item-due')).toBeNull()
  })

  it('marks an overdue date so it reads differently from an upcoming one', () => {
    const { container } = render(<WorkItemCard item={{ ...baseItem, dueDate: '2000-01-01' }} layout="board" />)
    const chip = container.querySelector('.wm-work-item-due')
    expect(chip?.className).toContain('is-overdue')
    expect(chip?.textContent).toContain('1/1')
  })

  it('marks a date due today', () => {
    const { container } = render(<WorkItemCard item={{ ...baseItem, dueDate: localToday() }} layout="board" />)
    expect(container.querySelector('.wm-work-item-due')?.className).toContain('is-today')
  })

  it('leaves a future date visually quiet', () => {
    const { container } = render(<WorkItemCard item={{ ...baseItem, dueDate: '2999-12-31' }} layout="board" />)
    expect(container.querySelector('.wm-work-item-due')?.className).toContain('is-upcoming')
  })

  it('places the chip in the heading row beside the other state chips', () => {
    const { container } = render(<WorkItemCard item={{ ...baseItem, priority: 'high', dueDate: '2999-12-31' }} layout="board" />)
    const heading = container.querySelector('.wm-work-item-card-heading')
    expect(heading?.querySelector('.wm-work-item-due')).not.toBeNull()
    expect(heading?.querySelector('.wm-work-item-priority')).not.toBeNull()
  })
})

describe('WorkItemCard keyboard move', () => {
  const columns = [{ id: 'status-1', name: 'Open' }, { id: 'status-2', name: 'Doing' }, { id: 'status-3', name: 'Done' }]
  const renderMovable = () => {
    const moves: Array<{ statusId: string; source: string }> = []
    const view = render(<WorkItemCard item={baseItem} layout="board" onMove={(_item, statusId, source) => { moves.push({ statusId, source }) }} statusOptions={columns} />)
    const card = view.container.querySelector<HTMLElement>('.wm-work-item-card')!
    return { card, moves }
  }

  it('moves one column right with Control + ArrowRight and reports a keyboard source', () => {
    const { card, moves } = renderMovable()
    fireEvent.keyDown(card, { key: 'ArrowRight', ctrlKey: true })
    expect(moves).toEqual([{ statusId: 'status-2', source: 'keyboard' }])
  })

  it('accepts Meta (macOS) as well as Control', () => {
    const { card, moves } = renderMovable()
    fireEvent.keyDown(card, { key: 'ArrowRight', metaKey: true })
    expect(moves).toEqual([{ statusId: 'status-2', source: 'keyboard' }])
  })

  it('does nothing at the first column moving further left', () => {
    const { card, moves } = renderMovable()
    fireEvent.keyDown(card, { key: 'ArrowLeft', ctrlKey: true })
    expect(moves).toEqual([])
  })

  it('ignores a bare arrow so it does not steal ordinary caret movement', () => {
    const { card, moves } = renderMovable()
    fireEvent.keyDown(card, { key: 'ArrowRight' })
    expect(moves).toEqual([])
  })

  it('ignores other modified keys', () => {
    const { card, moves } = renderMovable()
    fireEvent.keyDown(card, { key: 'ArrowUp', ctrlKey: true })
    expect(moves).toEqual([])
  })

  it('does nothing when the card cannot be moved at all', () => {
    const moves: string[] = []
    const { container } = render(<WorkItemCard item={baseItem} layout="board" statusOptions={columns} />)
    fireEvent.keyDown(container.querySelector<HTMLElement>('.wm-work-item-card')!, { key: 'ArrowRight', ctrlKey: true })
    expect(moves).toEqual([])
  })
})

describe('WorkItemCard drag-then-click guard', () => {
  // Runs last in this file on purpose: the guard is a module-level timestamp,
  // so it must not be armed before the title-click tests above run.
  it('still opens the Issue on a plain click', () => {
    const opened: string[] = []
    const { container } = render(<WorkItemCard draggable item={baseItem} layout="board" onOpen={item => { opened.push(item.id) }} />)
    fireEvent.click(container.querySelector<HTMLElement>('.wm-work-item-title')!)
    expect(opened).toEqual(['work-1'])
  })

  it('swallows the click a finished drag leaves behind', () => {
    const opened: string[] = []
    const { container } = render(<WorkItemCard draggable item={baseItem} layout="board" onOpen={item => { opened.push(item.id) }} />)
    fireEvent.dragEnd(container.querySelector<HTMLElement>('.wm-work-item-card')!)
    fireEvent.click(container.querySelector<HTMLElement>('.wm-work-item-title')!)
    expect(opened).toEqual([])
  })
})
