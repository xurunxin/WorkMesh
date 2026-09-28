'use client'

import { useEffect, useRef, useState, type AnchorHTMLAttributes, type PropsWithChildren, type ReactNode } from 'react'
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
  navigation: NavigationEntries
  productName: string
  skipLabel?: string
  teamSwitcher?: ReactNode
  utilityNavigation?: NavigationItem[]
  workspaceNavigationLabel?: string
}>

function NavigationLinks({ items, onNavigate, testIds = true }: { items: NavigationItem[]; onNavigate?: () => void; testIds?: boolean }) {
  return <>{items.map(item => <a
    aria-current={item.active ? 'page' : undefined}
    className={classNames('app-navigation-link', item.active && 'is-active')}
    data-testid={testIds ? item.testId : undefined}
    href={item.href}
    key={`${item.href}:${item.label}`}
    onClick={event => {
      item.onClick?.(event)
      onNavigate?.()
    }}
  >{item.icon && <span aria-hidden="true" className="app-navigation-icon">{item.icon}</span>}<span className="app-navigation-label">{item.label}</span>{item.count !== undefined && item.count !== null && <span aria-hidden="true" className="wm-tag app-navigation-count">{item.count}</span>}</a>)}</>
}

function NavigationGroups({ entries, onNavigate, testIds }: { entries: NavigationEntries; onNavigate?: () => void; testIds: boolean }) {
  if (!entries.some(isSection)) return <NavigationLinks items={flattenNavigation(entries)} onNavigate={onNavigate} testIds={testIds} />
  return <>{entries.map((entry, index) => isSection(entry)
    ? <div className="app-navigation-group" key={`${entry.label ?? 'group'}:${index}`}>
      {entry.label && <p className="app-navigation-group-label">{entry.label}</p>}
      <NavigationLinks items={entry.items} onNavigate={onNavigate} testIds={testIds} />
    </div>
    : <NavigationLinks items={[entry]} key={`${entry.href}:${entry.label}`} onNavigate={onNavigate} testIds={testIds} />)}</>
}

export function AppShell({
  administrationNavigationLabel = 'Administration',
  actorName,
  brandIcon,
  children,
  contextLabel = 'Workspace',
  contextTrail,
  footer,
  headerActions,
  mainNavigationLabel = 'Main navigation',
  menuLabel = 'Menu',
  mobileNavigationLabel = 'Mobile navigation',
  navigation,
  productName,
  skipLabel = 'Skip to content',
  teamSwitcher,
  utilityNavigation = [],
  workspaceNavigationLabel = 'Workspace',
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
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
  return <div className={`app-shell wm-theme${hasNavigation ? '' : ' app-shell--no-sidebar'}`}>
    <a className="wm-skip-link" href="#workmesh-main">{skipLabel}</a>
    {hasNavigation && <aside className="app-sidebar" aria-label={mainNavigationLabel}>
      <header className="app-brand"><span className="app-brand-title">{brandIcon}<strong>{productName}</strong></span>{actorName && <small>{actorName}</small>}</header>
      {teamSwitcher && <div className="app-team-switcher">{teamSwitcher}</div>}
      <nav className="app-navigation" aria-label={workspaceNavigationLabel}><NavigationGroups entries={navigation} testIds /></nav>
      {utilityNavigation.length > 0 && <nav className="app-navigation app-utility-navigation" aria-label={administrationNavigationLabel}><NavigationLinks items={utilityNavigation} /></nav>}
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
