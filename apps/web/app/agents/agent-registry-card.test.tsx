// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider, LocaleToggle } from '../lib/i18n'
import type { Agent } from '../lib/agents'
import { AgentRegistryCard } from './agent-registry-card'

afterEach(() => { cleanup() })

const agent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'agent/1',
  workspace_id: 'workspace-1',
  actor_id: 'actor-1',
  name: 'Coder Bot',
  slug: 'coder',
  description: 'Plans and implements scoped changes.',
  provider: 'openai',
  version: '1.2.3',
  supported_protocols: ['mcp'],
  skills: [],
  requested_capabilities: ['work:read'],
  approved_capabilities: ['work:read'],
  max_concurrency: 2,
  heartbeat_interval_seconds: 30,
  is_active: true,
  revision: 1,
  team_access: [],
  ...overrides,
})

describe('AgentRegistryCard', () => {
  it('uses an ordinary article, a stable encoded link, and a sibling management button', () => {
    render(<LocaleProvider><AgentRegistryCard agent={agent()} focused={false} onFocus={() => undefined} onManageTeamAccess={() => undefined} onPeek={() => undefined} /></LocaleProvider>)

    const card = screen.getByTestId('agent-registry-agent/1')
    const link = screen.getByRole('link', { name: /Coder Bot/ })
    const manage = screen.getByRole('button', { name: /Coder Bot/ })
    expect(card.tagName).toBe('ARTICLE')
    expect(card).not.toHaveAttribute('role', 'button')
    expect(link).toHaveAttribute('href', '/agents/agent%2F1')
    expect(link).toHaveAttribute('data-agent-id', 'agent/1')
    expect(link).toHaveAttribute('data-agent-roving-link', 'true')
    expect(link).toHaveAttribute('tabindex', '-1')
    expect(link.querySelector('button')).toBeNull()
    expect(manage.closest('a')).toBeNull()
  })

  it('makes only the focused primary link tabbable and reports its DOM ref', () => {
    const linkRef = vi.fn()
    const { rerender } = render(<LocaleProvider><AgentRegistryCard agent={agent()} focused={false} linkRef={linkRef} onFocus={() => undefined} onManageTeamAccess={() => undefined} onPeek={() => undefined} /></LocaleProvider>)
    expect(screen.getByRole('link', { name: /Coder Bot/ })).toHaveAttribute('tabindex', '-1')
    expect(linkRef).toHaveBeenCalledWith('agent/1', expect.any(HTMLAnchorElement))

    rerender(<LocaleProvider><AgentRegistryCard agent={agent()} focused linkRef={linkRef} onFocus={() => undefined} onManageTeamAccess={() => undefined} onPeek={() => undefined} /></LocaleProvider>)
    expect(screen.getByRole('link', { name: /Coder Bot/ })).toHaveAttribute('tabindex', '0')
  })

  it('opens Peek on Space while leaving Enter to the native link', () => {
    const onPeek = vi.fn()
    render(<LocaleProvider><AgentRegistryCard agent={agent()} focused={false} onFocus={() => undefined} onManageTeamAccess={() => undefined} onPeek={onPeek} /></LocaleProvider>)
    const link = screen.getByRole('link', { name: /Coder Bot/ })

    expect(fireEvent.keyDown(link, { key: ' ' })).toBe(false)
    expect(onPeek).toHaveBeenCalledTimes(1)
    expect(onPeek).toHaveBeenLastCalledWith('agent/1')
    fireEvent.keyDown(link, { key: 'Enter' })
    expect(onPeek).toHaveBeenCalledTimes(1)
  })

  it('records return focus only for an unmodified primary detail navigation', () => {
    const onNavigateToDetails = vi.fn()
    render(<LocaleProvider><AgentRegistryCard agent={agent()} focused onFocus={() => undefined} onManageTeamAccess={() => undefined} onNavigateToDetails={onNavigateToDetails} onPeek={() => undefined} /></LocaleProvider>)
    const link = screen.getByRole('link', { name: /Coder Bot/ })
    const preventNavigation = (event: Event): void => event.preventDefault()
    window.addEventListener('click', preventNavigation)

    try {
      fireEvent.click(link, { button: 0 })
      fireEvent.click(link, { button: 0, ctrlKey: true })
      fireEvent.click(link, { button: 0, metaKey: true })
      fireEvent.click(link, { button: 0, shiftKey: true })
      fireEvent.click(link, { button: 0, altKey: true })
      fireEvent.click(link, { button: 1 })
    } finally {
      window.removeEventListener('click', preventNavigation)
    }

    expect(onNavigateToDetails).toHaveBeenCalledTimes(1)
    expect(onNavigateToDetails).toHaveBeenLastCalledWith('agent/1')
  })

  it('rejects modified, repeated, composing, and already-handled Space intents', () => {
    const onPeek = vi.fn()
    render(<LocaleProvider><AgentRegistryCard agent={agent()} focused onFocus={() => undefined} onManageTeamAccess={() => undefined} onPeek={onPeek} /></LocaleProvider>)
    const link = screen.getByRole('link', { name: /Coder Bot/ })

    fireEvent.keyDown(link, { key: ' ', shiftKey: true })
    fireEvent.keyDown(link, { ctrlKey: true, key: ' ' })
    fireEvent.keyDown(link, { altKey: true, key: ' ' })
    fireEvent.keyDown(link, { key: ' ', metaKey: true })
    fireEvent.keyDown(link, { key: ' ', repeat: true })
    fireEvent.keyDown(link, { isComposing: true, key: ' ' })
    const prevented = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' })
    prevented.preventDefault()
    fireEvent(link, prevented)

    expect(onPeek).not.toHaveBeenCalled()
  })

  it('reports focus, Peek, and Team Access through independent callbacks', () => {
    const onFocus = vi.fn()
    const onPeek = vi.fn()
    const onManageTeamAccess = vi.fn()
    render(<LocaleProvider><AgentRegistryCard agent={agent()} focused onFocus={onFocus} onManageTeamAccess={onManageTeamAccess} onPeek={onPeek} /></LocaleProvider>)

    const link = screen.getByRole('link', { name: /Coder Bot/ })
    fireEvent.focus(link)
    fireEvent.keyDown(link, { key: ' ' })
    fireEvent.click(screen.getByRole('button', { name: /Coder Bot/ }))

    expect(screen.getByTestId('agent-registry-agent/1')).toHaveAttribute('data-focused', 'true')
    expect(onFocus).toHaveBeenCalledTimes(1)
    expect(onPeek).toHaveBeenCalledTimes(1)
    expect(onManageTeamAccess).toHaveBeenCalledTimes(1)
    expect(onFocus).toHaveBeenLastCalledWith('agent/1')
    expect(onPeek).toHaveBeenLastCalledWith('agent/1')
    expect(onManageTeamAccess).toHaveBeenLastCalledWith('agent/1')
  })

  it('still refreshes localized card copy through context while memoized', () => {
    document.cookie = 'workmesh_locale=zh-CN; Path=/'
    render(<LocaleProvider>
      <AgentRegistryCard agent={agent()} focused onFocus={() => undefined} onManageTeamAccess={() => undefined} onPeek={() => undefined} />
      <LocaleToggle />
    </LocaleProvider>)

    expect(screen.getByText('活跃')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('active')).toBeVisible()
  })
})
