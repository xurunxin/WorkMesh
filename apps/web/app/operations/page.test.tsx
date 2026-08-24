// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../lib/i18n'
import OperationsPage from './page'

const authMock = vi.hoisted(() => ({
  state: {
    actor: { id: 'actor-1', display_name: 'Ada', workspace_id: 'workspace-1', workspace_role: 'admin' } as {
      id: string
      display_name: string
      workspace_id: string
      workspace_role: 'admin' | 'member'
    } | null,
    error: '',
    loading: false,
    refresh: vi.fn(async () => undefined),
  },
}))

vi.mock('../operations-content', () => ({
  OperationsContent: ({ authorityKey }: { authorityKey: string | null }) => <div data-authority={authorityKey ?? ''} data-testid="operations-content" />,
}))
vi.mock('../realtime-status', () => ({ RealtimeStatus: () => null }))
vi.mock('../lib/use-authenticated-actor', () => ({
  useAuthenticatedActor: () => authMock.state,
}))

afterEach(() => {
  cleanup()
  document.cookie = 'workmesh_locale=; Path=/; Max-Age=0'
})
beforeEach(() => {
  authMock.state.actor = { id: 'actor-1', display_name: 'Ada', workspace_id: 'workspace-1', workspace_role: 'admin' }
  authMock.state.error = ''
  authMock.state.loading = false
  authMock.state.refresh.mockClear()
})

describe('OperationsPage navigation', () => {
  it('binds the no-script boundary to the localized copy contract', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/operations/page.tsx'), 'utf8')

    expect(source).toContain('<noscript><p>{operationsCopy.noScript}</p></noscript>')
  })

  it('keeps the visible workspace destinations without falsely marking Agents active', () => {
    render(<LocaleProvider><OperationsPage /></LocaleProvider>)

    expect(screen.getByTestId('operations-content')).toBeInTheDocument()
    expect(document.querySelector('.center')).toBeNull()
    expect(screen.getByTestId('view-agents')).not.toHaveClass('is-active')
    expect(document.querySelectorAll('.app-navigation-link.is-active')).toHaveLength(0)
    expect([
      'view-inbox',
      'view-my-work',
      'view-projects',
      'view-guidance',
      'view-agents',
    ].map(testId => screen.getByTestId(testId).getAttribute('href'))).toEqual([
      '/?view=inbox',
      '/?view=my-work',
      '/?view=projects',
      '/?view=guidance',
      '/agents',
    ])
  })

  it('fails closed before authentication and replaces the scoped content synchronously when authority changes', () => {
    authMock.state.actor = null
    authMock.state.loading = true
    const view = render(<LocaleProvider><OperationsPage /></LocaleProvider>)
    expect(screen.queryByTestId('operations-content')).toBeNull()

    authMock.state.loading = false
    authMock.state.actor = { id: 'actor-a', display_name: 'Actor A', workspace_id: 'workspace-1', workspace_role: 'admin' }
    view.rerender(<LocaleProvider><OperationsPage /></LocaleProvider>)
    const first = screen.getByTestId('operations-content')
    expect(first).toHaveAttribute('data-authority', 'workspace-1:actor-a:admin')

    authMock.state.actor = { id: 'actor-b', display_name: 'Actor B', workspace_id: 'workspace-1', workspace_role: 'member' }
    view.rerender(<LocaleProvider><OperationsPage /></LocaleProvider>)
    const second = screen.getByTestId('operations-content')
    expect(second).toHaveAttribute('data-authority', 'workspace-1:actor-b:member')
    expect(second).not.toBe(first)
    expect(first.isConnected).toBe(false)
  })

  it('keeps the same scoped content instance through a same-authority actor refresh', () => {
    const view = render(<LocaleProvider><OperationsPage /></LocaleProvider>)
    const content = screen.getByTestId('operations-content')

    authMock.state.actor = { id: 'actor-1', display_name: 'Ada refreshed', workspace_id: 'workspace-1', workspace_role: 'admin' }
    authMock.state.loading = true
    view.rerender(<LocaleProvider><OperationsPage /></LocaleProvider>)

    expect(screen.getByTestId('operations-content')).toBe(content)
    expect(content).toHaveAttribute('data-authority', 'workspace-1:actor-1:admin')
  })
})
