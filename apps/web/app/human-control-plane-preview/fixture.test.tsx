// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LocaleProvider } from '../lib/i18n'
import { HumanControlPlaneFixture } from './fixture'

afterEach(() => cleanup())

function renderFixture() {
  return render(<LocaleProvider><HumanControlPlaneFixture /></LocaleProvider>)
}

describe('Human Control Plane reference fixture', () => {
  it('renders the task-oriented global and Project navigation while preserving Stable links', () => {
    renderFixture()
    expect(screen.getAllByRole('link', { name: '需要我处理' })[0]).toHaveAttribute('href', '/?view=inbox')
    expect(screen.getAllByRole('link', { name: 'Issues' })[0]).toHaveAttribute('href', '/?view=my-work')
    expect(screen.getAllByRole('link', { name: '运营' })[0]).toHaveAttribute('href', '/operations')
    const projectNavigation = screen.getByRole('navigation', { name: '项目导航' })
    fireEvent.click(within(projectNavigation).getByRole('link', { name: '工作' }))
    expect(within(projectNavigation).getByRole('link', { name: '工作' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens Evidence in a focus-restoring drawer with progressive technical disclosure', async () => {
    renderFixture()
    const evidenceButtons = screen.getAllByRole('button', { name: '查看证据' })
    evidenceButtons[0]?.focus()
    fireEvent.click(evidenceButtons[0]!)
    const drawer = await screen.findByRole('dialog', { name: '证据' })
    expect(within(drawer).getByText('技术详情')).toBeVisible()
    fireEvent.click(within(drawer).getByRole('button', { name: '关闭 证据' }))
    await waitFor(() => expect(evidenceButtons[0]).toHaveFocus())
  })

  it('uses an explicit consequence preview for pause and restores the trigger', async () => {
    renderFixture()
    const pause = screen.getByRole('button', { name: '暂停运行' })
    pause.focus()
    fireEvent.click(pause)
    const dialog = await screen.findByRole('dialog', { name: '暂停这次运行？' })
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3)
    expect(within(dialog).getByRole('button', { name: '暂停运行' })).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(pause).toHaveFocus())
  })
})
