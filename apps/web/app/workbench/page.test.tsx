// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../lib/i18n'
import WorkbenchPage from './page'

vi.mock('../lib/api', () => ({
  publicRequest: vi.fn(async () => ({ serverVersion: '0.0.0-test', buildSha: 'testsha', schemaBaseline: 1 })),
  apiMutation: vi.fn(async () => undefined),
  clearCsrfToken: vi.fn(),
}))

afterEach(() => cleanup())

describe('WorkbenchPage (W03 navigation destination)', () => {
  it('renders inside the unified shell with the workbench as the only active destination', () => {
    render(<LocaleProvider><WorkbenchPage /></LocaleProvider>)
    expect(screen.getByTestId('workbench-placeholder')).toBeInTheDocument()
    expect(screen.getByTestId('view-workbench')).toHaveClass('is-active')
    expect(screen.getByTestId('view-agents')).not.toHaveClass('is-active')
    expect([
      'view-workbench',
      'view-inbox',
      'view-projects',
      'view-agents',
      'view-operations',
      'view-my-work',
      'view-guidance',
    ].map(testId => screen.getByTestId(testId).getAttribute('href'))).toEqual([
      '/workbench',
      '/?view=inbox',
      '/?view=projects',
      '/agents',
      '/operations',
      '/?view=my-work',
      '/?view=guidance',
    ])
  })

  it('keeps the shell footer contract (sign out + release info) and the empty-state explanation', async () => {
    render(<LocaleProvider><WorkbenchPage /></LocaleProvider>)
    // The footer renders in both the desktop sidebar and the mobile navigation.
    expect(screen.getAllByTestId('logout').length).toBeGreaterThanOrEqual(1)
    await waitFor(() => expect(screen.getAllByTestId('release-info').length).toBeGreaterThanOrEqual(1))
    expect(screen.getByText('Agent 工作台准备中')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换到深色主题' })).toBeInTheDocument()
  })
})
