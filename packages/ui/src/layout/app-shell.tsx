'use client'

import { useEffect, useRef, useState, type AnchorHTMLAttributes, type PropsWithChildren, type ReactNode } from 'react'
import { classNames } from '../internal/utils.js'

export type NavigationItem = Pick<AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> & {
  active?: boolean
  href: string
  icon?: ReactNode
  label: string
  testId?: string
}

export type AppShellProps = PropsWithChildren<{
  administrationNavigationLabel?: string
  actorName?: string
  brandIcon?: ReactNode
  contextLabel?: string
  footer?: ReactNode
  headerActions?: ReactNode
  mainNavigationLabel?: string
  menuLabel?: string
  mobileNavigationLabel?: string
  navigation: NavigationItem[]
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
  >{item.icon && <span aria-hidden="true" className="app-navigation-icon">{item.icon}</span>}{item.label}</a>)}</>
}

export function AppShell({
  administrationNavigationLabel = 'Administration',
  actorName,
  brandIcon,
  children,
  contextLabel = 'Workspace',
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
  const allNavigation = [...navigation, ...utilityNavigation]
  const hasNavigation = navigation.length > 0 || utilityNavigation.length > 0
  return <div className={`app-shell wm-theme${hasNavigation ? '' : ' app-shell--no-sidebar'}`}>
    <a className="wm-skip-link" href="#workmesh-main">{skipLabel}</a>
    {hasNavigation && <aside className="app-sidebar" aria-label={mainNavigationLabel}>
      <header className="app-brand"><span className="app-brand-title">{brandIcon}<strong>{productName}</strong></span>{actorName && <small>{actorName}</small>}</header>
      {teamSwitcher && <div className="app-team-switcher">{teamSwitcher}</div>}
      <nav className="app-navigation" aria-label={workspaceNavigationLabel}><NavigationLinks items={navigation} /></nav>
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
        <p>{contextLabel}</p>
        <div className="wm-shell-search" id="workmesh-command-center-trigger-slot" ref={commandCenterSlot} />
        {headerActions && <div className="wm-shell-actions">{headerActions}</div>}
      </header>
      <main className="app-content" id="workmesh-main" tabIndex={-1}>{children}</main>
    </div>
  </div>
}
