import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('UI authority and token boundary', () => {
  it('contains no application, transport, domain or persistence authority', () => {
    const source = readFileSync(fileURLToPath(new URL('./index.tsx', import.meta.url)), 'utf8')
    for (const forbidden of ["from 'next/", 'apps/web', 'packages/domain', 'packages/db', 'fetch(', 'EventSource', 'credentials:']) {
      expect(source).not.toContain(forbidden)
    }
  })

  it('exports the complete M1.1 component Interface', () => {
    const source = readFileSync(fileURLToPath(new URL('./index.tsx', import.meta.url)), 'utf8')
    for (const component of ['Button', 'Input', 'Select', 'Dialog', 'Sheet', 'Popover', 'Tabs', 'Badge', 'Card', 'Toast', 'Skeleton', 'AsyncStateSurface', 'EmptyState', 'ErrorState', 'ForbiddenState', 'ConflictState']) {
      expect(source).toMatch(new RegExp(`export (?:function|const) ${component}`))
    }
    for (const accessibilityContract of [
      'aria-modal="true"',
      "event.key === 'Escape'",
      "event.key !== 'Tab'",
      "event.key === 'ArrowRight'",
      "event.key === 'ArrowLeft'",
      'previousFocus?.focus()',
    ]) {
      expect(source).toContain(accessibilityContract)
    }
  })

  it('exports API-free v27 Work Surface primitives', () => {
    const source = readFileSync(fileURLToPath(new URL('./index.tsx', import.meta.url)), 'utf8')
    for (const component of ['WorkItemList', 'WorkItemBoard', 'WorkItemCard', 'WorkItemFilters', 'WorkSurfaceState', 'WorkSurfacePagination']) {
      expect(source).toMatch(new RegExp(`export function ${component}`))
    }
    for (const forbidden of ['fetch(', 'apiRequest', 'localStorage', 'sessionStorage', 'EventSource', 'apps/web']) expect(source).not.toContain(forbidden)
    expect(source).toContain('aria-label={text.boardColumnsLabel}')
    expect(source).toContain('explicit-status-selector')
    expect(source).not.toContain('showStatusControl={false}')
    expect(source).toContain('wm-work-item-project')
    expect(source).toContain('onOpenProject')
    expect(source).not.toContain('role="button"')
  })

  it('owns the complete M1 token vocabulary and reduced-motion fallback', () => {
    const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')
    for (const token of ['--wm-canvas', '--wm-font-sans', '--wm-space-4', '--wm-radius-md', '--wm-shadow-md', '--wm-motion-normal', '--wm-focus-ring']) {
      expect(css).toContain(token)
    }
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

describe('WorkItemCard status name pill', () => {
  it('renders a status name pill colored by statusCategory', () => {
    const source = readFileSync(fileURLToPath(new URL('./index.tsx', import.meta.url)), 'utf8')
    expect(source).toContain('wm-work-item-status-pill')
    expect(source).toMatch(/`status-\$\{statusCategory\}`/)
    expect(source).toMatch(/\{item\.statusName\}/)
  })
})
