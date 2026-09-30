'use client'

import { useCallback, useEffect, useRef, useState, type AnchorHTMLAttributes, type PropsWithChildren, type ReactNode } from 'react'
import { CaretDoubleRightIcon } from '@phosphor-icons/react/dist/csr/CaretDoubleRight'
import { classNames } from '../internal/utils.js'

export type NavigationItem = Pick<AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> & {
  active?: boolean
  /** Right-aligned count pill, mirroring the prototype's nav counters. */
  count?: number | null
  href: string
  icon?: ReactNode
  label: string
  testId?: string
}

/**
 * The prototype groups its sidebar into labelled sections (Workbench /
 * Governance / Operations) instead of one flat list. A bare item list is still
 * accepted so a caller can opt out of grouping.
 */
export type NavigationSection = { label?: string; items: NavigationItem[] }
export type NavigationEntries = NavigationItem[] | NavigationSection[]

const isSection = (entry: NavigationItem | NavigationSection): entry is NavigationSection =>
  Array.isArray((entry as NavigationSection).items)

const flattenNavigation = (entries: NavigationEntries): NavigationItem[] =>
  entries.flatMap(entry => (isSection(entry) ? entry.items : [entry]))

export type AppShellProps = PropsWithChildren<{
  administrationNavigationLabel?: string
  actorName?: string
  brandIcon?: ReactNode
  contextLabel?: string
  /**
   * Optional breadcrumb trail, outermost first. The prototype shows
   * "Workbench / Agent workbench"; the last entry renders in the strong
   * foreground and the rest stay muted.
   */
  contextTrail?: readonly string[]
  footer?: ReactNode
  headerActions?: ReactNode
  mainNavigationLabel?: string
  menuLabel?: string
  mobileNavigationLabel?: string
  /** Label for the control that hides the sidebar down to its icons. */
  collapseSidebarLabel?: string
  /** Label for the control that restores the sidebar's labels. */
  expandSidebarLabel?: string
  /** Controlled collapsed state; omit to let the control own it. */
  sidebarCollapsed?: boolean
  onSidebarCollapsedChange?: (collapsed: boolean) => void
  navigation: NavigationEntries
  productName: string
  skipLabel?: string
  teamSwitcher?: ReactNode
  utilityNavigation?: NavigationItem[]
  workspaceNavigationLabel?: string
}>

function NavigationLinks({ items, onNavigate, testIds = true, compact = false }: { items: NavigationItem[]; onNavigate?: () => void; testIds?: boolean; compact?: boolean }) {
  return <>{items.map(item => <a
    aria-current={item.active ? 'page' : undefined}
    className={classNames('app-navigation-link', item.active && 'is-active')}
    data-testid={testIds ? item.testId : undefined}
    href={item.href}
    key={`${item.href}:${item.label}`}
    // Only offer the tooltip when the icon is the only thing left to read.
    title={compact ? item.label : undefined}
    onClick={event => {
      item.onClick?.(event)
      onNavigate?.()
    }}
  >{item.icon && <span aria-hidden="true" className="app-navigation-icon">{item.icon}</span>}<span className="app-navigation-label">{item.label}</span>{item.count !== undefined && item.count !== null && <span aria-hidden="true" className="wm-tag app-navigation-count">{item.count}</span>}</a>)}</>
}

function NavigationGroups({ entries, onNavigate, testIds, compact = false }: { entries: NavigationEntries; onNavigate?: () => void; testIds: boolean; compact?: boolean }) {
  if (!entries.some(isSection)) return <NavigationLinks compact={compact} items={flattenNavigation(entries)} onNavigate={onNavigate} testIds={testIds} />
  return <>{entries.map((entry, index) => isSection(entry)
    ? <div className="app-navigation-group" key={`${entry.label ?? 'group'}:${index}`}>
      {entry.label && <p className="app-navigation-group-label">{entry.label}</p>}
      <NavigationLinks compact={compact} items={entry.items} onNavigate={onNavigate} testIds={testIds} />
    </div>
    : <NavigationLinks compact={compact} items={[entry]} key={`${entry.href}:${entry.label}`} onNavigate={onNavigate} testIds={testIds} />)}</>
}

export function AppShell({
  administrationNavigationLabel = 'Administration',
  actorName,
  brandIcon,
  children,
  collapseSidebarLabel = 'Collapse sidebar',
  contextLabel = 'Workspace',
  contextTrail,
  expandSidebarLabel = 'Expand sidebar',
  footer,
  headerActions,
  mainNavigationLabel = 'Main navigation',
  menuLabel = 'Menu',
  mobileNavigationLabel = 'Mobile navigation',
  navigation,
  onSidebarCollapsedChange,
  productName,
  skipLabel = 'Skip to content',
  sidebarCollapsed,
  teamSwitcher,
  utilityNavigation = [],
  workspaceNavigationLabel = 'Workspace',
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  // Collapsing is a presentation preference, so the shared control takes it as
  // a controlled value and never reaches for browser storage itself: deciding
  // that a preference is durable belongs to the application, not to a control
  // that other layers mount. Uncontrolled use still works for callers that
  // have no preference to keep.
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const collapsed = sidebarCollapsed ?? internalCollapsed
  const toggleCollapsed = useCallback(() => {
    const next = !collapsed
    setInternalCollapsed(next)
    onSidebarCollapsedChange?.(next)
  }, [collapsed, onSidebarCollapsedChange])
  const commandCenterSlot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const slot = commandCenterSlot.current
    if (!slot) return
    // The command center lives in the root layout. It must wait until this
    // streamed page boundary has hydrated before it portals into the header.
    slot.dataset.wmHydrated = 'true'
    return () => { delete slot.dataset.wmHydrated }
  }, [])
  const allNavigation = [...flattenNavigation(navigation), ...utilityNavigation]
  const hasNavigation = allNavigation.length > 0
  const breadcrumb = contextTrail?.length ? contextTrail : [contextLabel]
  return <div className={`app-shell wm-theme${hasNavigation ? '' : ' app-shell--no-sidebar'}`} data-sidebar-collapsed={collapsed || undefined}>
    <a className="wm-skip-link" href="#workmesh-main">{skipLabel}</a>
    {hasNavigation && <aside className="app-sidebar" aria-label={mainNavigationLabel}>
      <header className="app-brand"><span className="app-brand-title">{brandIcon}<strong>{productName}</strong></span>{actorName && <small>{actorName}</small>}</header>
      <button
        aria-controls="workmesh-sidebar"
        aria-expanded={!collapsed}
        className="app-sidebar-collapse"
        data-testid="app-sidebar-collapse"
        onClick={toggleCollapsed}
        title={collapsed ? expandSidebarLabel : collapseSidebarLabel}
        type="button"
      >
        <CaretDoubleRightIcon aria-hidden="true" className="app-sidebar-collapse-icon" size={16} weight="bold" />
        <span className="wm-visually-hidden">{collapsed ? expandSidebarLabel : collapseSidebarLabel}</span>
      </button>
      {teamSwitcher && <div className="app-team-switcher">{teamSwitcher}</div>}
      <nav className="app-navigation" aria-label={workspaceNavigationLabel} id="workmesh-sidebar"><NavigationGroups compact={collapsed} entries={navigation} testIds /></nav>
      {utilityNavigation.length > 0 && <nav className="app-navigation app-utility-navigation" aria-label={administrationNavigationLabel}><NavigationLinks compact={collapsed} items={utilityNavigation} /></nav>}
      {footer && <footer className="app-sidebar-footer">{footer}</footer>}
    </aside>}
    <div className="app-workspace">
      <header className="wm-shell-header">
        {!hasNavigation && <header className="app-brand app-brand-inline"><span className="app-brand-title">{brandIcon}<strong>{productName}</strong></span></header>}
        {hasNavigation && <details className="mobile-navigation" onToggle={event => setMobileOpen(event.currentTarget.open)} open={mobileOpen}>
          <summary onKeyDown={event => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setMobileOpen(open => !open)
          }}>{menuLabel}</summary>
          <div className="mobile-navigation-context">
            <header className="app-brand"><span className="app-brand-title">{brandIcon}<strong>{productName}</strong></span>{actorName && <small>{actorName}</small>}</header>
            {teamSwitcher && <div className="app-team-switcher">{teamSwitcher}</div>}
          </div>
          <nav aria-label={mobileNavigationLabel}><NavigationLinks items={allNavigation} onNavigate={() => setMobileOpen(false)} testIds={false} /></nav>
          {footer && <footer className="app-sidebar-footer mobile-navigation-footer">{footer}</footer>}
        </details>}
        <p className="wm-shell-breadcrumb">
          {breadcrumb.map((segment, index) => <span key={`${segment}:${index}`}>
            {index > 0 && <span aria-hidden="true" className="wm-shell-breadcrumb-sep"> / </span>}
            {index === breadcrumb.length - 1 ? <b>{segment}</b> : segment}
          </span>)}
        </p>
        <div className="wm-shell-search" id="workmesh-command-center-trigger-slot" ref={commandCenterSlot} />
        {headerActions && <div className="wm-shell-actions">{headerActions}</div>}
      </header>
      <main className="app-content" id="workmesh-main" tabIndex={-1}>{children}</main>
    </div>
  </div>
}
