// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { publicRequest } from '../lib/api'
import { LocaleProvider } from '../lib/i18n'
import type { McpDiscovery, McpReleaseInfo } from '../lib/mcp-onboarding'
import ConnectPage from './page'

vi.mock('../lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, publicRequest: vi.fn() }
})

const release: McpReleaseInfo = {
  preferredClientProfileVersion: '1.0',
  supportedClientProfileVersions: ['1.0'],
  mcpVersion: '1.29.0',
}

function discovery(supportedClients: McpDiscovery['supportedClients']): McpDiscovery {
  return {
    protocolVersion: 'v1',
    mcpUrl: 'https://workmesh.example/mcp/a-deliberately-long-safe-readiness-path',
    wellKnownUrl: 'https://workmesh.example/.well-known/workmesh-agent',
    apiVersion: 'v1',
    supportedClients,
    skill: {
      name: 'workmesh',
      version: '1.1.0',
      sha256: `sha256:${'a'.repeat(64)}`,
      signature: 'ed25519:safe-public-test-signature',
    },
  }
}

function arrange(nextDiscovery: McpDiscovery) {
  vi.mocked(publicRequest)
    .mockResolvedValueOnce(nextDiscovery as never)
    .mockResolvedValueOnce(release as never)
}

function renderPage(locale: 'zh-CN' | 'en' = 'en') {
  document.cookie = `workmesh_locale=${locale}; Path=/`
  return render(<LocaleProvider><ConnectPage /></LocaleProvider>)
}

beforeEach(() => {
  vi.mocked(publicRequest).mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'credential required' }), { status: 401 })))
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
  window.history.replaceState({}, '', '/connect#test')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.cookie = 'workmesh_locale=; Path=/; Max-Age=0'
})

describe('ConnectPage MCP client state', () => {
  it('atomically selects the first normalized advertised client without ever mounting a Codex guide', async () => {
    arrange(discovery(['opencode', 'generic_mcp']))
    const observedWrongGuide: string[] = []
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-mcp-guide-client="codex"]')) observedWrongGuide.push('codex')
    })
    observer.observe(document.body, { childList: true, subtree: true })

    renderPage()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#workmesh-main')
    expect(document.querySelector('main#workmesh-main')).toHaveAttribute('tabindex', '-1')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const openCode = await screen.findByRole('radio', { name: /OpenCode/i })
    expect(openCode).toBeChecked()
    expect(screen.getAllByRole('radio').map(radio => (radio as HTMLInputElement).value)).toEqual(['opencode', 'generic_mcp'])
    expect(screen.queryByRole('radio', { name: /Codex/i })).not.toBeInTheDocument()
    expect(document.querySelector('[data-mcp-guide-client="opencode"]')).not.toBeNull()
    expect(observedWrongGuide).toEqual([])
    expect(publicRequest).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledTimes(1)
    observer.disconnect()
  })

  it('fails closed when discovery normalizes to an empty client set', async () => {
    arrange(discovery([]))
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('data-onboarding-state', 'unsupported_client')
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /configuration preview/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Generic Streamable HTTP MCP configuration/i)).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never renders an untrusted public failure detail', async () => {
    vi.mocked(publicRequest).mockRejectedValue(new Error('upstream detail wmi_abcdefghijklmnopqrstuvwxyz0123456789'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveAttribute('data-onboarding-state', 'network_unavailable')
    expect(document.body.textContent).not.toContain('upstream detail')
    expect(document.body.textContent).not.toContain('wmi_')
  })

  it('keeps Config and Link copied states distinct while client switches stay local', async () => {
    arrange(discovery(['opencode', 'generic_mcp']))
    renderPage()
    await screen.findByRole('radio', { name: /OpenCode/i })

    fireEvent.click(screen.getByRole('button', { name: 'Copy config' }))
    expect(await screen.findByText('Configuration copied to the clipboard.')).toBeVisible()
    const writes = vi.mocked(navigator.clipboard.writeText)
    expect(writes).toHaveBeenCalledTimes(1)
    expect(String(writes.mock.calls[0]?.[0])).not.toContain('#test')

    fireEvent.click(screen.getByRole('radio', { name: /Generic MCP/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy config' })).toBeVisible())
    expect(screen.queryByText('Configuration copied to the clipboard.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy secure connect URL' }))
    expect(await screen.findByText('Secure connection link copied to the clipboard.')).toBeVisible()
    fireEvent.click(screen.getByRole('radio', { name: /OpenCode/i }))
    expect(screen.getByText('Secure connection link copied to the clipboard.')).toBeVisible()
    expect(publicRequest).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
