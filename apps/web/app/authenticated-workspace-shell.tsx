'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { AppShell, Button, type AppShellProps } from '@workmesh/ui'
import { ThemeToggle } from '../features/navigation'
import { apiMutation, clearCsrfToken, publicRequest } from './lib/api'
import { WorkMeshBrandIcon } from './lib/brand'
import { useWorkMeshDocumentTitle } from './lib/document-title'
import { useLocale } from './lib/i18n'

type ReleaseInfo = { serverVersion: string; buildSha: string; schemaBaseline: number }

export type AuthenticatedWorkspaceShellProps = Omit<AppShellProps, 'brandIcon' | 'footer' | 'productName'> & {
  documentTitle: string
  footerExtra?: ReactNode
}

export function AuthenticatedWorkspaceShell({ children, documentTitle, footerExtra, headerActions, ...props }: AuthenticatedWorkspaceShellProps) {
  const { t } = useLocale()
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null)

  useWorkMeshDocumentTitle(documentTitle)

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

  const footer = <>
    {footerExtra}
    <Button data-testid="logout" onClick={() => void signOut()} variant="ghost">{t('signOut')}</Button>
    {releaseInfo && <small className="release-info" data-testid="release-info">v{releaseInfo.serverVersion} · {t('build')} {releaseInfo.buildSha} · {t('schema')} {releaseInfo.schemaBaseline}</small>}
  </>

  return <AppShell {...props} brandIcon={<WorkMeshBrandIcon />} footer={footer} productName="WorkMesh" headerActions={<><ThemeToggle />{headerActions}</>}>{children}</AppShell>
}
