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
