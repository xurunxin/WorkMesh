import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import * as UiBarrel from './index.js'
import { DataTableFrame, DescriptionList, Field, OverflowText, ResponsiveActionBar, TabBar, Tabs, Toast } from './index.js'

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

const barrelSource = readFileSync(fileURLToPath(new URL('./index.tsx', import.meta.url)), 'utf8')

function collectModuleFiles(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) return collectModuleFiles(new URL(`./${entry.name}/`, dir))
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\./.test(entry.name)) return []
    return [new URL(`./${entry.name}`, dir)]
  })
}

const barrelUrl = new URL('./index.tsx', import.meta.url)
const moduleSources = collectModuleFiles(new URL('./', import.meta.url))
  .filter(url => url.href !== barrelUrl.href)
  .map(url => ({
    path: fileURLToPath(url),
    source: readFileSync(url, 'utf8'),
  }))
const combinedModuleSource = moduleSources.map(module => module.source).join('\n')

const FORBIDDEN_AUTHORITY_STRINGS = [
  "from 'next/",
  'apps/web',
  'packages/domain',
  'packages/db',
  'packages/contracts',
  'fetch(',
  'EventSource',
  'credentials:',
  'localStorage',
  'sessionStorage',
  'window.prompt',
  'window.confirm',
  'apiRequest',
]

const RUNTIME_BARREL_INVENTORY = [
  'Button', 'Input', 'Select', 'Dialog', 'Sheet', 'Popover', 'TabBar', 'Tabs', 'Badge', 'Card', 'Toast', 'Skeleton',
  'AsyncStateSurface', 'EmptyState', 'ErrorState', 'ForbiddenState', 'ConflictState',
  'AppShell',
  'WorkItemCard', 'WorkItemList', 'WorkItemBoard', 'WorkItemAdaptiveCollection', 'WorkItemFilters', 'WorkSurfaceState', 'WorkSurfacePagination',
  'AttentionKindBadge', 'RiskBadge', 'UrgencyBadge', 'FreshnessBadge', 'RunHealthBadge', 'LifecycleBadge',
  'ActorAttribution', 'ControlCenterSection', 'AttentionListItem', 'AttentionCard', 'RunStatusBar', 'RunDigestCard',
  'PlanStepRail', 'CausalTimeline', 'TechnicalEventGroup', 'EvidenceReferenceList', 'EvidenceDrawer', 'ConsequencePreviewDialog',
  'AffectedResourceList', 'ReasonCodeList', 'ControlCapabilityBar',
  'ResponsiveActionBar', 'DataTableFrame', 'DescriptionList', 'Field', 'OverflowText',
]

describe('UI authority and token boundary', () => {
  it('splits the barrel into implementation modules', () => {
    expect(moduleSources.length).toBeGreaterThanOrEqual(14)
    const modulePaths = moduleSources.map(module => module.path.replaceAll('\\', '/'))
    for (const required of ['/internal/', '/primitives/', '/layout/', '/domain/']) {
      expect(modulePaths.some(path => path.includes(required))).toBe(true)
    }
  })

  it('declares every implementation module as a client boundary', () => {
    for (const module of moduleSources) {
      expect(module.source.split(/\r?\n/, 1)[0], module.path).toBe("'use client'")
    }
  })

  it('keeps the barrel a pure re-export surface covering the full inventory', () => {
    const lines = barrelSource.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '' && !line.startsWith('//'))
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line.startsWith('export'), line).toBe(true)
    for (const component of RUNTIME_BARREL_INVENTORY) expect(component in UiBarrel, component).toBe(true)
    expect(barrelSource).not.toContain('internal/')
  })

  it('contains no application, transport, domain or persistence authority in any module', () => {
    const allSources = [...moduleSources, { path: 'index.tsx', source: barrelSource }]
    for (const forbidden of FORBIDDEN_AUTHORITY_STRINGS) {
      const offenders = allSources.filter(module => module.source.includes(forbidden)).map(module => module.path)
      expect(offenders, `forbidden string: ${forbidden}`).toEqual([])
    }
  })

  it('exports the complete M1.1 component Interface', () => {
    for (const component of ['Button', 'Input', 'Select', 'Dialog', 'Sheet', 'Popover', 'Tabs', 'Badge', 'Card', 'Toast', 'Skeleton', 'AsyncStateSurface', 'EmptyState', 'ErrorState', 'ForbiddenState', 'ConflictState']) {
      expect(combinedModuleSource).toMatch(new RegExp(`export (?:function|const) ${component}`))
    }
    expect(combinedModuleSource).toContain('initialFocusRef?: RefObject<HTMLElement | null>')
    expect(combinedModuleSource).toContain('dismissible?: boolean')
  })

  it('exports API-free v27 Work Surface primitives', () => {
    for (const component of ['WorkItemList', 'WorkItemBoard', 'WorkItemAdaptiveCollection', 'WorkItemCard', 'WorkItemFilters', 'WorkSurfaceState', 'WorkSurfacePagination']) {
      expect(combinedModuleSource).toMatch(new RegExp(`export function ${component}`))
    }
    expect(combinedModuleSource).toContain('aria-label={text.boardColumnsLabel}')
    expect(combinedModuleSource).toContain('const AdaptiveWorkItemCard = memo(')
    expect(combinedModuleSource).toContain('layout="adaptive"')
    expect(combinedModuleSource).toContain('data-hotkey-filter="true"')
    expect(combinedModuleSource).toContain('explicit-status-selector')
    expect(combinedModuleSource).not.toContain('showStatusControl={false}')
    expect(combinedModuleSource).toContain('wm-work-item-project')
    expect(combinedModuleSource).toContain('onOpenProject')
    expect(combinedModuleSource).not.toContain('role="button"')
  })

  it('exports the API-free Human Control Plane component inventory', () => {
    for (const component of ['TabBar', 'AttentionCard', 'AttentionListItem', 'AttentionKindBadge', 'RiskBadge', 'UrgencyBadge', 'FreshnessBadge', 'RunHealthBadge', 'LifecycleBadge', 'RunStatusBar', 'RunDigestCard', 'PlanStepRail', 'CausalTimeline', 'TechnicalEventGroup', 'EvidenceDrawer', 'EvidenceReferenceList', 'ConsequencePreviewDialog', 'ActorAttribution', 'AffectedResourceList', 'ReasonCodeList', 'ControlCapabilityBar', 'ControlCenterSection']) {
      expect(combinedModuleSource).toMatch(new RegExp(`export function ${component}`))
    }
    expect(combinedModuleSource).toContain('initialFocusRef={cancelRef}')
    expect(combinedModuleSource).toContain('aria-label={`${categoryLabel}: ${label}`}')
  })

  it('exports API-free responsive content primitives', () => {
    for (const component of ['ResponsiveActionBar', 'DataTableFrame', 'DescriptionList', 'Field', 'OverflowText']) {
      expect(combinedModuleSource).toMatch(new RegExp(`export function ${component}`))
    }
    const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')
    for (const className of ['wm-responsive-action-bar', 'wm-data-table-frame', 'wm-description-list', 'wm-field', 'wm-overflow-text']) {
      expect(css).toContain(`.${className}`)
    }
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

  it('keeps lifecycle, health, risk, urgency, and freshness as separate semantic values', () => {
    for (const type of ['LifecycleState', 'RunHealth', 'RiskLevel', 'UrgencyLevel', 'FreshnessState']) expect(combinedModuleSource).toContain(`export type ${type}`)
    const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')
    for (const value of ['healthy', 'stalled', 'critical', 'urgent', 'fresh', 'stale', 'verified']) expect(css).toContain(`.wm-semantic-${value}`)
  })
})

describe('responsive content primitives', () => {
  it('labels action and horizontally scrollable table regions', () => {
    const actions = ResponsiveActionBar({ children: 'Actions', label: 'Approval actions' })
    const table = DataTableFrame({ children: 'Table', label: 'Approvals' })
    expect(actions.props.role).toBe('toolbar')
    expect(actions.props['aria-label']).toBe('Approval actions')
    expect(table.props.role).toBe('region')
    expect(table.props.tabIndex).toBe(0)
    expect(table.props['aria-label']).toBe('Approvals')
  })

  it('renders description, field, and overflow semantics without application authority', () => {
    const descriptions = DescriptionList({ items: [{ id: 'scope', term: 'Scope', description: '/projects/one' }] })
    const terms = elementsIn(descriptions)
    expect(terms.some(element => element.props.children === 'Scope')).toBe(true)
    expect(terms.some(element => element.props.children === '/projects/one')).toBe(true)

    const field = Field({ children: createElement('textarea'), description: 'Optional context', error: 'Required', htmlFor: 'approval-note', label: 'Decision note' })
    const fieldElements = elementsIn(field)
    expect(fieldElements.find(element => element.props.htmlFor === 'approval-note')?.props.children).toBeTruthy()
    expect(fieldElements.find(element => element.props.role === 'alert')?.props.children).toBe('Required')
    const control = fieldElements.find(element => element.props.id === 'approval-note')
    expect(control?.props['aria-invalid']).toBe(true)
    expect(String(control?.props['aria-describedby'])).toContain('ui-test-')

    const overflow = OverflowText({ children: 'Long relationship title', lines: 2 })
    expect(overflow.props.className).toContain('wm-overflow-text-2')
  })
})

describe('WorkItemCard status name pill', () => {
  it('renders a status name pill colored by statusCategory', () => {
    expect(combinedModuleSource).toContain('wm-work-item-status-pill')
    expect(combinedModuleSource).toMatch(/`status-\$\{statusCategory\}`/)
    expect(combinedModuleSource).toMatch(/\{item\.statusName\}/)
  })
})

describe('Tabs compact accessibility', () => {
  it('renders counts through the shared tab badge vocabulary', () => {
    const bar = TabBar({ ariaLabel: 'Work views', onValueChange: () => undefined, tabs: [{ id: 'list', label: 'List' }, { badge: 12, id: 'backlog', label: 'Backlog' }], value: 'backlog' })
    const elements = elementsIn(bar)
    expect(elements.find(element => element.props.className === 'wm-tab-badge')?.props.children).toBe(12)
    expect(elements.filter(element => element.props.role === 'tab' && element.props['aria-selected'] === true)).toHaveLength(1)
  })

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
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) expect(combinedModuleSource).toContain(`event.key === '${key}'`)
    expect(combinedModuleSource).toContain('onValueChange(target.id)')
    expect(combinedModuleSource).toContain('document.getElementById(`${baseId}-tab-${target.id}`)?.focus()')
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
