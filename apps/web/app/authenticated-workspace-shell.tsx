'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut'
import { AppShell, Button, type AppShellProps } from '@workmesh/ui'
import { ThemeToggle } from '../features/navigation'
import { apiMutation, clearCsrfToken, publicRequest } from './lib/api'
import { WorkMeshBrandIcon } from './lib/brand'
import { useWorkMeshDocumentTitle } from './lib/document-title'
import { useLocale } from './lib/i18n'

type ReleaseInfo = { serverVersion: string; buildSha: string; schemaBaseline: number }

/** Where the workspace remembers that its sidebar is collapsed. */
const SIDEBAR_KEY = 'workmesh.sidebar'

export type AuthenticatedWorkspaceShellProps = Omit<AppShellProps, 'brandIcon' | 'footer' | 'productName'> & {
  documentTitle: string
  footerExtra?: ReactNode
}

export function AuthenticatedWorkspaceShell({ children, documentTitle, footerExtra, headerActions, ...props }: AuthenticatedWorkspaceShellProps) {
  const { t } = useLocale()
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null)
  // The application, not the shared shell, decides that this preference is
  // durable. Collapsing exists to reclaim width, and a width that snaps back on
  // every reload makes the gesture feel broken.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useWorkMeshDocumentTitle(documentTitle)

  useEffect(() => {
    try { setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === 'collapsed') } catch { setSidebarCollapsed(false) }
  }, [])

  const changeSidebarCollapsed = useCallback((next: boolean) => {
    setSidebarCollapsed(next)
    try { window.localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded') } catch { /* preference is best effort */ }
  }, [])

  useEffect(() => {
    let current = true
    void publicRequest<ReleaseInfo>('/api/v1/info')
      .then(value => { if (current) setReleaseInfo(value) })
      .catch(() => { if (current) setReleaseInfo(null) })
    return () => { current = false }
  }, [])

  const signOut = async (): Promise<void> => {
    try { await apiMutation('logout', '/api/v1/auth/logout', { method: 'POST' }) }
    catch { /* The session cookie may already be expired. */ }
    clearCsrfToken()
    window.location.assign('/login')
  }

  // The footer belongs to the application, so the application decides what it
  // shows on the icon rail. Squeezing text into a 56px column would wrap the
  // sign-out label and the build stamp one character per line, so the rail
  // keeps an icon with an accessible name and drops the stamp entirely.
  const footer = <div className="app-sidebar-footer-content" data-collapsed={sidebarCollapsed || undefined}>
    {!sidebarCollapsed && footerExtra}
    <Button
      aria-label={t('signOut')}
      data-testid="logout"
      icon={<SignOutIcon aria-hidden="true" size={16} weight="bold" />}
      onClick={() => void signOut()}
      title={t('signOut')}
      variant="ghost"
    >
      {sidebarCollapsed ? <span className="wm-visually-hidden">{t('signOut')}</span> : t('signOut')}
    </Button>
    {releaseInfo && !sidebarCollapsed && <small className="release-info" data-testid="release-info">{t('versionPrefix')}{releaseInfo.serverVersion} · {t('build')} {releaseInfo.buildSha} · {t('schema')} {releaseInfo.schemaBaseline}</small>}
  </div>

  return <AppShell {...props} brandIcon={<WorkMeshBrandIcon />} collapseSidebarLabel={t('collapseSidebar')} expandSidebarLabel={t('expandSidebar')} footer={footer} onSidebarCollapsedChange={changeSidebarCollapsed} productName="WorkMesh" sidebarCollapsed={sidebarCollapsed} headerActions={<><ThemeToggle />{headerActions}</>}>{children}</AppShell>
}
