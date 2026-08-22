import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  AppShell,
  AsyncStateSurface,
  Badge,
  Card,
  ConflictState,
  Dialog,
  EmptyState,
  ErrorState,
  ForbiddenState,
  Input,
  Popover,
  Select,
  Sheet,
  Skeleton,
  Tabs,
  Toast,
} from '@workmesh/ui'
import { RealtimeStatus } from './realtime-status'

describe('human UI foundation', () => {
  it('renders semantic desktop and narrow navigation from the same model', () => {
    const html = renderToStaticMarkup(createElement(AppShell, {
      productName: 'WorkMesh',
      actorName: 'Alice',
      teamSwitcher: createElement('label', null, 'Team', createElement('select', { 'aria-label': 'Current team' })),
      navigation: [
        { href: '/?view=my-work', label: 'My Work', active: true },
        { href: '/?view=projects', label: 'Projects' },
      ],
      utilityNavigation: [{ href: '/settings', label: 'Settings' }],
      children: createElement('h1', null, 'Daily work'),
    }))

    expect(html).toContain('aria-label="Main navigation"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('class="mobile-navigation"')
    expect(html).toContain('class="mobile-navigation-context"')
    expect(html).toContain('<summary>Menu</summary>')
    expect(html).toContain('href="/settings"')
    expect(html).toContain('href="#workmesh-main"')
    expect(html).toContain('id="workmesh-main"')
  })

  it('omits the sidebar when both navigation and utilityNavigation are empty', () => {
    const html = renderToStaticMarkup(createElement(AppShell, {
      productName: 'WorkMesh',
      navigation: [],
      utilityNavigation: [],
      children: createElement('h1', null, 'Public page'),
    }))
    expect(html).not.toContain('<aside')
    expect(html).not.toContain('class="mobile-navigation"')
    expect(html).toContain('class="wm-shell-header"')
    expect(html).toContain('Public page')
  })

  it('renders an accessible modal only while it is open', () => {
    expect(renderToStaticMarkup(createElement(Dialog, {
      open: false,
      title: 'Create project',
      onClose: () => undefined,
      children: 'Form',
    }))).toBe('')

    const html = renderToStaticMarkup(createElement(Dialog, {
      open: true,
      title: 'Create project',
      onClose: () => undefined,
      children: 'Form',
    }))
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('Create project')
    expect(html).toContain('aria-label="Close Create project"')
  })

  it('renders the M1.1 form, card and badge primitives without application data', () => {
    const html = renderToStaticMarkup(createElement(Card, {
      title: 'Connection',
      subtitle: 'Presentation only',
      children: [
        createElement(Input, { key: 'input', 'aria-label': 'Name', invalid: true }),
        createElement(Select, { key: 'select', 'aria-label': 'State' }, createElement('option', null, 'Ready')),
        createElement(Badge, { key: 'badge', tone: 'success' }, 'Ready'),
      ],
    }))
    expect(html).toContain('class="wm-card"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('class="wm-select"')
    expect(html).toContain('wm-badge-success')
  })

  it('renders Sheet, Popover and Tabs with controlled accessibility state', () => {
    const sheet = renderToStaticMarkup(createElement(Sheet, { open: true, onClose: () => undefined, title: 'Work item', side: 'right' }, 'Details'))
    const popover = renderToStaticMarkup(createElement(Popover, {
      open: true,
      onOpenChange: () => undefined,
      label: 'Filters',
      trigger: 'Open filters',
      children: 'Filter panel',
    }))
    const tabs = renderToStaticMarkup(createElement(Tabs, {
      ariaLabel: 'Work views',
      value: 'board',
      onValueChange: () => undefined,
      tabs: [
        { id: 'list', label: 'List', panel: 'List panel' },
        { id: 'board', label: 'Board', panel: 'Board panel' },
      ],
    }))
    expect(sheet).toContain('wm-sheet-right')
    expect(sheet).toContain('aria-label="Close Work item"')
    expect(popover).toContain('aria-expanded="true"')
    expect(popover).toContain('aria-haspopup="dialog"')
    expect(tabs).toContain('role="tablist"')
    expect(tabs).toContain('aria-selected="true"')
    expect(tabs).toContain('role="tabpanel"')
  })

  it('collapses Tabs into a select when compact is true so narrow viewports stay usable', () => {
    const compact = renderToStaticMarkup(createElement(Tabs, {
      ariaLabel: 'Detail sections',
      compact: true,
      value: 'discussion',
      onValueChange: () => undefined,
      tabs: [
        { id: 'responsibility', label: 'Responsibility', panel: 'Responsibility panel' },
        { id: 'agent', label: 'Agent executions', panel: 'Agent panel' },
        { id: 'discussion', label: 'Discussion', panel: 'Discussion panel' },
      ],
    }))
    // The button-row variant is gone; a single <select> drives the active panel.
    expect(compact).not.toContain('role="tablist"')
    expect(compact).not.toContain('class="wm-tab-list"')
    expect(compact).toContain('class="wm-tabs wm-tabs-compact"')
    expect(compact).toContain('wm-tab-select')
    expect(compact).toContain('aria-label="Detail sections"')
    expect(compact).toContain('<option value="responsibility"')
    expect(compact).toContain('<option value="agent"')
    expect(compact).toContain('<option value="discussion"')
    // The active panel still renders so callers can keep their state unchanged.
    expect(compact).toContain('role="tabpanel"')
    expect(compact).toContain('Discussion panel')
  })

  it('announces loading, empty, error, forbidden, conflict and toast feedback', () => {
    const html = renderToStaticMarkup(createElement('div', null, [
      createElement(AsyncStateSurface, { key: 'loading', state: 'loading', title: 'Loading work', description: 'Please wait.' }),
      createElement(EmptyState, { key: 'empty', title: 'No work', description: 'Nothing matches.' }),
      createElement(ErrorState, { key: 'error', title: 'Could not load', description: 'Try again.', actionLabel: 'Retry', onAction: () => undefined }),
      createElement(ForbiddenState, { key: 'forbidden', title: 'Access required', description: 'Request access.' }),
      createElement(ConflictState, { key: 'conflict', title: 'Work changed', description: 'Reload latest.' }),
      createElement(Skeleton, { key: 'skeleton', label: 'Refreshing' }),
      createElement(Toast, { key: 'toast', open: true, tone: 'danger', title: 'Save failed', message: 'No changes were lost.' }),
    ]))
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('wm-state-empty')
    expect(html).toContain('wm-state-error')
    expect(html).toContain('wm-state-forbidden')
    expect(html).toContain('wm-state-conflict')
    expect(html).toContain('aria-label="Refreshing"')
    expect(html).toContain('wm-toast-danger')
  })

  it('renders shared live-connection feedback through the application shell', () => {
    const html = renderToStaticMarkup(createElement(RealtimeStatus))
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('data-realtime-state="offline"')
    expect(html).toContain('Offline')
  })
})
