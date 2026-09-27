// @vitest-environment jsdom
// Guards the prototype's shell anatomy: grouped sidebar sections, right-aligned
// nav counters, and the "Workbench / Current" breadcrumb. These are the visual
// structures design/prototype defines, so a regression here means the shell
// silently drifted back to a generic admin sidebar.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppShell, type NavigationSection } from '@workmesh/ui'

afterEach(() => { cleanup() })

const sections: NavigationSection[] = [
  {
    label: 'Workbench',
    items: [
      { active: true, count: 7, href: '/workbench', label: 'Workbench', testId: 'view-workbench' },
      { count: 12, href: '/?view=backlog', label: 'Backlog' },
    ],
  },
  {
    label: 'Governance',
    items: [
      { count: 3, href: '/?view=inbox', label: 'Needs You' },
      { count: 0, href: '/?view=recovery', label: 'Recovery' },
    ],
  },
]

const renderShell = () => render(<AppShell contextTrail={['Workbench', 'Agent workbench']} navigation={sections} productName="WorkMesh" />)

describe('AppShell prototype anatomy', () => {
  // The mobile drawer repeats the same links in the DOM for its own layout, so
  // every structural assertion is scoped to the desktop sidebar.
  const sidebar = (container: HTMLElement) => container.querySelector('.app-sidebar') as HTMLElement

  it('renders one labelled group per navigation section', () => {
    const { container } = renderShell()
    expect([...sidebar(container).querySelectorAll('.app-navigation-group-label')].map(node => node.textContent)).toEqual(['Workbench', 'Governance'])
    expect(sidebar(container).querySelectorAll('.app-navigation-group')).toHaveLength(2)
  })

  it('renders the nav counters the prototype shows', () => {
    const { container } = renderShell()
    expect([...sidebar(container).querySelectorAll('.app-navigation-count')].map(node => node.textContent)).toEqual(['7', '12', '3', '0'])
  })

  it('keeps a zero counter visible rather than hiding it', () => {
    // The prototype renders a 0 pill; dropping it would make an empty queue
    // indistinguishable from a destination that does not exist.
    const { container } = renderShell()
    expect(sidebar(container).querySelectorAll('.app-navigation-count')).toHaveLength(4)
  })

  it('omits the counter entirely when the caller does not supply one', () => {
    const { container } = render(<AppShell navigation={[{ href: '/settings', label: 'Settings' }]} productName="WorkMesh" />)
    expect(sidebar(container).querySelectorAll('.app-navigation-count')).toHaveLength(0)
  })

  it('renders the breadcrumb trail with the current segment emphasised', () => {
    const { container } = renderShell()
    const crumb = container.querySelector('.wm-shell-breadcrumb') as HTMLElement
    expect(crumb.textContent?.replace(/\s+/g, ' ').trim()).toBe('Workbench / Agent workbench')
    expect(crumb.querySelector('b')?.textContent).toBe('Agent workbench')
    expect(crumb.querySelector('.wm-shell-breadcrumb-sep')?.textContent?.trim()).toBe('/')
  })

  it('falls back to the single context label when no trail is supplied', () => {
    const { container } = render(<AppShell contextLabel="Operations" navigation={[{ href: '/operations', label: 'Operations' }]} productName="WorkMesh" />)
    expect(container.querySelector('.wm-shell-breadcrumb b')?.textContent).toBe('Operations')
  })
})
