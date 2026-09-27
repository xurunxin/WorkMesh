// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkItemCard, type WorkItemCardData } from '@workmesh/ui'

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
