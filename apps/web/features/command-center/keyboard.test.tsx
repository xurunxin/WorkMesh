// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GlobalCommandCenter } from './command-center'

const returnFocusStateKey = '__workmeshCommandCenterReturnFocusV1'

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  window.history.replaceState(null, '', '/')
})

describe('GlobalCommandCenter keyboard ownership', () => {
  it('opens once for slash and Ctrl/Meta+K while preserving interactive contexts', () => {
    render(<GlobalCommandCenter triggerLabel="Search" />)

    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K')
    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(false)
    expect(screen.getAllByTestId('command-center')).toHaveLength(1)
    expect(screen.getByRole('combobox', { name: 'Search WorkMesh' })).toHaveFocus()
    fireEvent.keyDown(document.body, { key: '/' })
    expect(screen.getAllByTestId('command-center')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Close/ }))

    fireEvent.keyDown(document.body, { ctrlKey: true, key: 'k' })
    expect(screen.getAllByTestId('command-center')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Close/ }))
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true })
    expect(screen.getAllByTestId('command-center')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Close/ }))

    const input = document.body.appendChild(document.createElement('input'))
    const button = document.body.appendChild(document.createElement('button'))
    const link = document.body.appendChild(document.createElement('a'))
    link.href = '/agents'
    const editable = document.body.appendChild(document.createElement('div'))
    editable.setAttribute('contenteditable', 'plaintext-only')
    for (const target of [input, button, link, editable]) {
      fireEvent.keyDown(target, { key: '/' })
      fireEvent.keyDown(target, { ctrlKey: true, key: 'k' })
    }
    expect(screen.queryByTestId('command-center')).toBeNull()
  })

  it('rejects repeat, composition and live modal stacking', () => {
    render(<GlobalCommandCenter triggerLabel="Search" />)
    fireEvent.keyDown(document.body, { key: '/', repeat: true })
    fireEvent.keyDown(document.body, { isComposing: true, key: '/' })
    fireEvent.keyDown(document.body, { key: '/', shiftKey: true })
    expect(screen.queryByTestId('command-center')).toBeNull()

    const modal = document.body.appendChild(document.createElement('section'))
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('role', 'dialog')
    fireEvent.keyDown(document.body, { key: '/' })
    fireEvent.keyDown(document.body, { ctrlKey: true, key: 'k' })
    expect(screen.queryByTestId('command-center')).toBeNull()
    fireEvent.click(screen.getByTestId('command-center-trigger'))
    expect(screen.queryByTestId('command-center')).toBeNull()
  })

  it('restores the real trigger once when an exact Command Center history entry returns', () => {
    const priorUrl = '/agents?tab=agents&name=Command&status=active'
    window.history.replaceState({
      existingNextState: 'preserved',
      [returnFocusStateKey]: { from: priorUrl, to: '/agents/agent%2Fcommand-route' },
    }, '', priorUrl)

    render(<GlobalCommandCenter triggerLabel="Search" />)

    expect(screen.getByTestId('command-center-trigger')).toHaveFocus()
    expect(screen.queryByTestId('command-center')).toBeNull()
    expect(window.history.state).toEqual({ existingNextState: 'preserved' })

    cleanup()
    render(<GlobalCommandCenter triggerLabel="Search" />)
    expect(screen.getByTestId('command-center-trigger')).not.toHaveFocus()
  })

  it('marks a plain result navigation on the prior entry without replacing existing router state', () => {
    const priorUrl = '/agents?tab=agents&name=Command&status=active'
    window.history.replaceState({ existingNextState: 'preserved' }, '', priorUrl)
    render(<GlobalCommandCenter triggerLabel="Search" />)
    fireEvent.click(screen.getByTestId('command-center-trigger'))
    window.addEventListener('click', event => event.preventDefault(), { once: true })

    fireEvent.click(screen.getByRole('option', { name: /^Agentsnavigation$/ }))

    expect(window.history.state).toEqual({
      existingNextState: 'preserved',
      [returnFocusStateKey]: { from: priorUrl, to: '/agents' },
    })
  })

  it('does not restore focus for another URL or override an active user control', () => {
    window.history.replaceState({
      [returnFocusStateKey]: { from: '/agents?tab=agents', to: '/agents/agent-1' },
    }, '', '/agents?tab=sessions')
    const mismatch = render(<GlobalCommandCenter triggerLabel="Search" />)
    expect(screen.getByTestId('command-center-trigger')).not.toHaveFocus()
    mismatch.unmount()

    const ownedFocus = document.body.appendChild(document.createElement('button'))
    ownedFocus.textContent = 'Existing focus owner'
    ownedFocus.focus()
    const currentUrl = '/agents?tab=agents&name=Command&status=active'
    window.history.replaceState({
      [returnFocusStateKey]: { from: currentUrl, to: '/agents/agent%2Fcommand-route' },
    }, '', currentUrl)
    render(<GlobalCommandCenter triggerLabel="Search" />)

    expect(ownedFocus).toHaveFocus()
    expect(screen.getByTestId('command-center-trigger')).not.toHaveFocus()
    expect(window.history.state).toBeNull()
  })
})
