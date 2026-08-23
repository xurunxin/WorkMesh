// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandCenterMount } from './command-center-mount'
import { LocaleProvider } from './lib/i18n'
import { AuthenticatedRuntime, PageHotkeysMount, pageHotkeyDestinations } from './lib/page-hotkeys-mount'

const navigation = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

beforeEach(() => {
  document.body.replaceChildren()
  navigation.pathname = '/'
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PageHotkeysMount', () => {
  it('derives exact destinations from the shared workspace navigation registry', () => {
    expect(pageHotkeyDestinations).toEqual({
      a: '/agents',
      i: '/?view=my-work',
      s: '/settings',
    })
  })

  it('navigates declared chords, treats the exact current canonical URL as a no-op, and focuses the declared filter', () => {
    window.history.replaceState(null, '', '/?view=my-work')
    const navigate = vi.fn()
    const filter = document.createElement('input')
    filter.dataset.hotkeyFilter = 'true'
    document.body.append(filter)
    render(<PageHotkeysMount getFilterTarget={() => filter} navigate={navigate} />)

    fireEvent.keyDown(document.body, { key: 'g' })
    fireEvent.keyDown(document.body, { key: 'i' })
    expect(navigate).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'g' })
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(navigate).toHaveBeenCalledWith('/agents')
    fireEvent.keyDown(document.body, { key: 'f' })
    expect(filter).toHaveFocus()
  })

  it('skips an earlier CSS-hidden declared filter and focuses the visible candidate', () => {
    const hiddenFilter = document.createElement('input')
    hiddenFilter.dataset.hotkeyFilter = 'true'
    hiddenFilter.style.display = 'none'
    const visibleFilter = document.createElement('input')
    visibleFilter.dataset.hotkeyFilter = 'true'
    document.body.append(hiddenFilter, visibleFilter)
    render(<PageHotkeysMount />)

    expect(fireEvent.keyDown(document.body, { key: 'f' })).toBe(false)
    expect(hiddenFilter).not.toHaveFocus()
    expect(visibleFilter).toHaveFocus()
  })
})

describe('AuthenticatedRuntime', () => {
  it.each(['/login', '/install', '/connect', '/unknown-future-route'])('mounts no authenticated runtime and makes zero auth requests on %s', async pathname => {
    navigation.pathname = pathname
    window.history.replaceState(null, '', pathname)
    render(<LocaleProvider><AuthenticatedRuntime><main>Public content</main></AuthenticatedRuntime></LocaleProvider>)

    expect(screen.getByText('Public content')).toBeInTheDocument()
    expect(screen.queryByTestId('command-center-trigger')).toBeNull()
    await Promise.resolve()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('mounts realtime, page hotkeys and one command center on an authenticated workspace route', async () => {
    navigation.pathname = '/agents'
    window.history.replaceState(null, '', '/agents')
    render(<LocaleProvider><AuthenticatedRuntime commandCenter={<CommandCenterMount />}><main>Agents content</main></AuthenticatedRuntime></LocaleProvider>)

    expect(screen.getAllByTestId('command-center-trigger')).toHaveLength(1)
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/me'),
      expect.objectContaining({ credentials: 'include' }),
    ))
  })
})
