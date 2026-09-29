import React, { type MouseEvent } from 'react'
import type { NavigationItem, NavigationSection } from '@workmesh/ui'
import { BookOpenTextIcon } from '@phosphor-icons/react/dist/csr/BookOpenText'
import { ChatsCircleIcon } from '@phosphor-icons/react/dist/csr/ChatsCircle'
import { FolderSimpleIcon } from '@phosphor-icons/react/dist/csr/FolderSimple'
import { GearIcon } from '@phosphor-icons/react/dist/csr/Gear'
import { GitBranchIcon } from '@phosphor-icons/react/dist/csr/GitBranch'
import { HouseIcon } from '@phosphor-icons/react/dist/csr/House'
import { ListBulletsIcon } from '@phosphor-icons/react/dist/csr/ListBullets'
import { RobotIcon } from '@phosphor-icons/react/dist/csr/Robot'
import { TrayIcon } from '@phosphor-icons/react/dist/csr/Tray'
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'
import { homeScopeHref, type HomeScope } from './navigation'

export type WorkspaceNavigationKey = HomeScope | 'agents' | 'operations' | 'workbench'

type NavigationTranslationKey =
  | 'agents'
  | 'guidance'
  | 'home'
  | 'inbox'
  | 'issues'
  | 'navGroupGovernance'
  | 'navGroupOperations'
  | 'navGroupWorkbench'
  | 'operations'
  | 'projects'
  | 'recovery'
  | 'settings'
  | 'workbench'

type WorkspaceNavigationOptions = Readonly<{
  active: WorkspaceNavigationKey
  /**
   * Optional nav counters, mirroring the prototype's sidebar pills. Only
   * destinations whose count a caller can source honestly are listed; an
   * omitted key renders no pill rather than a fabricated zero.
   */
  counts?: Partial<Record<WorkspaceNavigationKey, number>>
  onHomeNavigate?: (event: MouseEvent<HTMLAnchorElement>, scope: HomeScope) => void
  t: (key: NavigationTranslationKey) => string
}>

export function workspaceNavigation({ active, counts, onHomeNavigate, t }: WorkspaceNavigationOptions): NavigationSection[] {
  const primaryHomeItems: Array<[HomeScope, string, NavigationItem['icon']]> = [
    ['inbox', t('inbox'), <TrayIcon aria-hidden="true" size={20} weight="regular" />],
    ['recovery', t('recovery'), <ArrowCounterClockwiseIcon aria-hidden="true" size={20} weight="regular" />],
    ['projects', t('projects'), <FolderSimpleIcon aria-hidden="true" size={20} weight="regular" />],
  ]
  const legacyHomeItems: Array<[HomeScope, string, NavigationItem['icon']]> = [
    ['home', t('home'), <HouseIcon aria-hidden="true" size={20} weight="regular" />],
    ['my-work', t('issues'), <ListBulletsIcon aria-hidden="true" size={20} weight="regular" />],
    ['guidance', t('guidance'), <BookOpenTextIcon aria-hidden="true" size={20} weight="regular" />],
  ]
  const homeItem = ([scope, label, icon]: [HomeScope, string, NavigationItem['icon']]): NavigationItem => ({
    active: active === scope,
    count: counts?.[scope],
    href: homeScopeHref(scope),
    icon,
    label,
    onClick: onHomeNavigate ? (event: MouseEvent<HTMLAnchorElement>) => onHomeNavigate(event, scope) : undefined,
    testId: `view-${scope}`,
  })
  // Grouped the way design/prototype groups its sidebar: Workbench, then
  // Governance (things an agent does on a Human's behalf), then Operations.
  return [
    {
      label: t('navGroupWorkbench'),
      items: [
        { active: active === 'workbench', href: '/workbench', icon: <ChatsCircleIcon aria-hidden="true" size={20} weight="regular" />, label: t('workbench'), testId: 'view-workbench' },
        ...legacyHomeItems.map(homeItem),
      ],
    },
    {
      label: t('navGroupGovernance'),
      items: [
        ...primaryHomeItems.map(homeItem),
        { active: active === 'agents', count: counts?.agents, href: '/agents', icon: <RobotIcon aria-hidden="true" size={20} weight="regular" />, label: t('agents'), testId: 'view-agents' },
      ],
    },
    {
      label: t('navGroupOperations'),
      items: [
        { active: active === 'operations', href: '/operations', icon: <GitBranchIcon aria-hidden="true" size={20} weight="regular" />, label: t('operations'), testId: 'view-operations' },
      ],
    },
  ]
}

export function workspaceUtilityNavigation({ t }: Pick<WorkspaceNavigationOptions, 't'>): NavigationItem[] {
  return [
    { href: '/settings', icon: <GearIcon aria-hidden="true" size={20} weight="regular" />, label: t('settings'), testId: 'view-settings' },
  ]
}
