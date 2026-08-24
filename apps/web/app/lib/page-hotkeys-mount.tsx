'use client'

import { type ReactNode, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { RealtimeProvider } from './realtime'
import { isAuthenticatedWorkspacePath } from './shortcut-scope'
import { isAvailableHotkeyFilter, type PageHotkeyDestination, useHotkeys } from './use-hotkeys'
import { workspaceNavigation, workspaceUtilityNavigation } from './workspace-navigation'

const navigationItems = [
  ...workspaceNavigation({ active: 'my-work', t: key => key }),
  ...workspaceUtilityNavigation({ t: key => key }),
]

function navigationHref(testId: string): string {
  const href = navigationItems.find(item => item.testId === testId)?.href
  if (!href) throw new Error(`Missing canonical workspace navigation entry: ${testId}`)
  return href
}

export const pageHotkeyDestinations: Readonly<Record<PageHotkeyDestination, string>> = Object.freeze({
  i: navigationHref('view-my-work'),
  a: navigationHref('view-agents'),
  s: navigationHref('view-settings'),
})

function declaredFilterTarget(): HTMLInputElement | null {
  const candidates = document.querySelectorAll<HTMLInputElement>('[data-hotkey-filter="true"]')
  return Array.from(candidates).find(isAvailableHotkeyFilter) ?? null
}

function semanticLayerOpen(): boolean {
  return Boolean(document.querySelector('[aria-modal="true"]'))
}

export type PageHotkeysMountProps = Readonly<{
  getFilterTarget?: () => HTMLInputElement | null
  getLayerOpen?: () => boolean
  navigate?: (href: string) => void
}>

export function PageHotkeysMount({
  getFilterTarget = declaredFilterTarget,
  getLayerOpen = semanticLayerOpen,
  navigate,
}: PageHotkeysMountProps = {}) {
  const pathname = usePathname()
  const enabled = isAuthenticatedWorkspacePath(pathname)
  const navigateTo = useCallback((destination: PageHotkeyDestination): void => {
    if (!enabled) return
    const href = pageHotkeyDestinations[destination]
    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (currentHref === href) return
    if (navigate) navigate(href)
    else window.location.assign(href)
  }, [enabled, navigate])
  const scopedFilterTarget = useCallback(
    (): HTMLInputElement | null => enabled ? getFilterTarget() : null,
    [enabled, getFilterTarget],
  )
  const scopedLayerOpen = useCallback(
    (): boolean => !enabled || getLayerOpen(),
    [enabled, getLayerOpen],
  )

  useHotkeys({ getFilterTarget: scopedFilterTarget, getLayerOpen: scopedLayerOpen, navigate: navigateTo })
  return null
}

export type AuthenticatedRuntimeProps = Readonly<{
  children: ReactNode
  commandCenter?: ReactNode
}>

export function AuthenticatedRuntime({ children, commandCenter }: AuthenticatedRuntimeProps) {
  const pathname = usePathname()
  if (!isAuthenticatedWorkspacePath(pathname)) return <>{children}</>
  return <RealtimeProvider>
    <PageHotkeysMount />
    {commandCenter}
    {children}
  </RealtimeProvider>
}
