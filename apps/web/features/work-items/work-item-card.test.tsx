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

describe('WorkItemCard status name pill', () => {
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
