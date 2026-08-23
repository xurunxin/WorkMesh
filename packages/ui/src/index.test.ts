import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { Tabs, Toast } from './index.js'

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  let nextId = 0
  return { ...actual, useId: () => `ui-test-${++nextId}` }
})

type TestElement = {
  props: Record<string, unknown>
}

function elementsIn(node: unknown): TestElement[] {
  if (node === null || typeof node !== 'object') return []
  const props = (node as { props?: unknown }).props
  if (props === null || typeof props !== 'object') return []
  const element = { props: props as Record<string, unknown> }
  const children = element.props.children
  const descendants = Array.isArray(children)
    ? children.flatMap(child => elementsIn(child))
    : elementsIn(children)
  return [element, ...descendants]
}

describe('UI authority and token boundary', () => {
  it('declares the shared interactive component barrel as a client boundary', () => {
    const source = readFileSync(fileURLToPath(new URL('./index.tsx', import.meta.url)), 'utf8')
    expect(source.split(/\r?\n/, 1)[0]).toBe("'use client'")
  })

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
    expect(source).toContain('initialFocusRef?: RefObject<HTMLElement | null>')
    expect(source).toContain('dismissible?: boolean')
  })

  it('exports API-free v27 Work Surface primitives', () => {
    const source = readFileSync(fileURLToPath(new URL('./index.tsx', import.meta.url)), 'utf8')
    for (const component of ['WorkItemList', 'WorkItemBoard', 'WorkItemAdaptiveCollection', 'WorkItemCard', 'WorkItemFilters', 'WorkSurfaceState', 'WorkSurfacePagination']) {
      expect(source).toMatch(new RegExp(`export function ${component}`))
    }
    for (const forbidden of ['fetch(', 'apiRequest', 'localStorage', 'sessionStorage', 'EventSource', 'apps/web']) expect(source).not.toContain(forbidden)
    expect(source).toContain('aria-label={text.boardColumnsLabel}')
    expect(source).toContain('const AdaptiveWorkItemCard = memo(')
    expect(source).toContain('layout="adaptive"')
    expect(source).toContain('data-hotkey-filter="true"')
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
    expect(css).toMatch(/\.wm-card\s*>\s*header\s+:where\(h1,\s*h2\)\s*\{[^}]*margin:\s*0;[^}]*font-size:\s*var\(--wm-text-md\);/s)
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.wm-skeleton\s*\{[^}]*animation:\s*none\s*!important;/)
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

describe('Tabs compact accessibility', () => {
  it('gives nested compact tabpanels valid, instance-local accessible names', () => {
    const inner = Tabs({
      ariaLabel: 'Approval views',
      compact: true,
      onValueChange: () => undefined,
      tabs: [
        { id: 'pending', label: 'Pending', panel: 'Pending approvals' },
        { id: 'history', label: 'History', panel: 'Approval history' },
      ],
      value: 'history',
    })
    const outer = Tabs({
      ariaLabel: 'Agent workspace sections',
      compact: true,
      onValueChange: () => undefined,
      tabs: [
        { id: 'agents', label: 'Agents', panel: 'Agent registry' },
        { id: 'approvals', label: 'Approvals', panel: inner },
      ],
      value: 'approvals',
    })

    const elements = elementsIn(outer)
    const panels = elements.filter(element => element.props.role === 'tabpanel')
    expect(panels).toHaveLength(2)
    const labelledBy = panels.map(panel => panel.props['aria-labelledby'])
    expect(new Set(labelledBy).size).toBe(2)
    const labels = labelledBy.map(id => elements.find(element => element.props.id === id))
    expect(labels.every(Boolean)).toBe(true)
    expect(labels.map(label => label?.props.children)).toEqual(expect.arrayContaining(['Approvals', 'History']))
  })

  it('renders one named selector and one labelled panel without duplicate tab semantics', () => {
    const tabs = Tabs({
      ariaLabel: 'Settings sections',
      compact: true,
      onValueChange: () => undefined,
      tabs: [
        { id: 'workspace', label: 'Workspace', panel: 'Workspace settings' },
        { id: 'operations', label: 'Planning & Operations', panel: 'Operations settings' },
      ],
      value: 'operations',
    })

    const elements = elementsIn(tabs)
    expect(elements.filter(element => element.props.className === 'wm-tab-select')).toHaveLength(1)
    expect(elements.find(element => element.props.className === 'wm-tab-select')?.props['aria-label']).toBe('Settings sections')
    expect(elements.filter(element => element.props.role === 'tablist')).toHaveLength(0)
    expect(elements.filter(element => element.props.role === 'tab')).toHaveLength(0)
    expect(elements.filter(element => element.props.role === 'tabpanel')).toHaveLength(1)
  })

  it('keeps the complete shared desktop keyboard contract in the shared implementation', () => {
    const source = readFileSync(fileURLToPath(new URL('./index.tsx', import.meta.url)), 'utf8')
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) expect(source).toContain(`event.key === '${key}'`)
    expect(source).toContain('onValueChange(target.id)')
    expect(source).toContain('document.getElementById(`${baseId}-tab-${target.id}`)?.focus()')
  })
})

describe('Toast accessibility contract', () => {
  it('renders exactly one atomic live role with caller-owned unique close copy', () => {
    const toast = Toast({
      dismissLabel: '关闭通知：团队已创建',
      dismissText: '关闭',
      message: '团队 Runtime 已可使用。',
      onDismiss: () => undefined,
      open: true,
      title: '团队已创建',
      toastId: 'toast-42',
      tone: 'success',
    })
    const elements = elementsIn(toast)
    const root = elements[0]
    const close = elements.find(element => element.props['data-toast-close-id'] === 'toast-42')

    expect(root?.props.role).toBe('status')
    expect(root?.props['aria-atomic']).toBe(true)
    expect(root?.props['aria-live']).toBeUndefined()
    expect(root?.props['data-toast-id']).toBe('toast-42')
    expect(close?.props['aria-label']).toBe('关闭通知：团队已创建')
  })

  it('uses one alert role for urgent copy and no role when closed', () => {
    const urgent = Toast({ message: 'Retry later.', open: true, tone: 'danger' })
    expect(elementsIn(urgent).filter(element => element.props.role === 'alert')).toHaveLength(1)
    expect(Toast({ message: 'Hidden', open: false })).toBeNull()
  })
})
