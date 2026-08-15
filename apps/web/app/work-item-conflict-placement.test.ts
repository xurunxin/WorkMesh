import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Work Item conflict recovery placement', () => {
  it('owns the active recovery notice inside the shared WorkItemDetail surface', () => {
    const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
    const detail = readFileSync(new URL('../features/work-items/detail/work-item-detail.tsx', import.meta.url), 'utf8')

    expect(page).toContain('{conflictNotice && !selectedItem && <aside')
    const composition = page.slice(page.indexOf('{selectedItem && <WorkItemDetail'), page.indexOf('{!selectedItem && requestedItem'))
    expect(composition).toContain('conflict={detailConflict}')
    expect(composition).toContain('onReloadLatest=')
    expect(detail).toContain('<ConflictState')
    expect(detail).toContain('Your unsaved intent is preserved')
    expect(detail.indexOf('<ConflictState')).toBeGreaterThan(detail.indexOf('data-testid="work-item-detail"'))
    expect(detail.indexOf('<ConflictState')).toBeLessThan(detail.indexOf('<form className="work-item-detail-form"'))
  })
})
