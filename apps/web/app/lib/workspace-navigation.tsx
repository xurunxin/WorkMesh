import React, { type MouseEvent } from 'react'
import type { NavigationItem } from '@workmesh/ui'
import { BookOpenTextIcon } from '@phosphor-icons/react/dist/csr/BookOpenText'
import { FolderSimpleIcon } from '@phosphor-icons/react/dist/csr/FolderSimple'
import { GearIcon } from '@phosphor-icons/react/dist/csr/Gear'
import { ListBulletsIcon } from '@phosphor-icons/react/dist/csr/ListBullets'
import { RobotIcon } from '@phosphor-icons/react/dist/csr/Robot'
import { TrayIcon } from '@phosphor-icons/react/dist/csr/Tray'
import { homeScopeHref, type HomeScope } from './navigation'

export type WorkspaceNavigationKey = HomeScope | 'agents'

type NavigationTranslationKey =
  | 'agents'
  | 'guidance'
  | 'inbox'
  | 'issues'
  | 'projects'
  | 'settings'

type WorkspaceNavigationOptions = Readonly<{
  active: WorkspaceNavigationKey
  onHomeNavigate?: (event: MouseEvent<HTMLAnchorElement>, scope: HomeScope) => void
  t: (key: NavigationTranslationKey) => string
}>

export function workspaceNavigation({ active, onHomeNavigate, t }: WorkspaceNavigationOptions): NavigationItem[] {
  const homeItems: Array<[HomeScope, string, NavigationItem['icon']]> = [
    ['inbox', t('inbox'), <TrayIcon aria-hidden="true" size={20} weight="regular" />],
    ['my-work', t('issues'), <ListBulletsIcon aria-hidden="true" size={20} weight="regular" />],
    ['projects', t('projects'), <FolderSimpleIcon aria-hidden="true" size={20} weight="regular" />],
    ['guidance', t('guidance'), <BookOpenTextIcon aria-hidden="true" size={20} weight="regular" />],
  ]
  return [
    ...homeItems.map(([scope, label, icon]) => ({
      active: active === scope,
      href: homeScopeHref(scope),
      icon,
      label,
      onClick: onHomeNavigate ? (event: MouseEvent<HTMLAnchorElement>) => onHomeNavigate(event, scope) : undefined,
      testId: `view-${scope}`,
    })),
    {
      active: active === 'agents',
      href: '/agents',
      icon: <RobotIcon aria-hidden="true" size={20} weight="regular" />,
      label: t('agents'),
      testId: 'view-agents',
    },
  ]
}

export function workspaceUtilityNavigation({ t }: Pick<WorkspaceNavigationOptions, 't'>): NavigationItem[] {
  return [
    { href: '/settings', icon: <GearIcon aria-hidden="true" size={20} weight="regular" />, label: t('settings'), testId: 'view-settings' },
  ]
}
