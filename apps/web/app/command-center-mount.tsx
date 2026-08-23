'use client'

import { GlobalCommandCenter } from '../features/command-center'
import { usePathname } from 'next/navigation'
import { useLocale } from './lib/i18n'
import { isAuthenticatedWorkspacePath } from './lib/shortcut-scope'

/**
 * Mounts the global command center once, in the root layout, so every route
 * shares a single instance. The component owns its own open state and
 * keyboard shortcuts (Cmd/Ctrl+K and `/`, when not focused on an editable
 * element), so pages never need to import `GlobalCommandCenter` themselves.
 */
export function CommandCenterMount() {
  const pathname = usePathname()
  const { locale, t } = useLocale()
  if (!isAuthenticatedWorkspacePath(pathname)) return null
  return <GlobalCommandCenter locale={locale} triggerLabel={t('search')} />
}
