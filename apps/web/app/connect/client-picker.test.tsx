// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClientPicker } from './client-picker'

const copy = {
  mcpClient: 'MCP client',
  clientDescription: (type: 'codex' | 'opencode' | 'pi' | 'generic_mcp') => ({
    codex: 'TOML configuration with environment-backed headers.',
    opencode: 'Remote JSON configuration with environment-backed headers.',
    pi: 'Extension configuration over Streamable HTTP.',
    generic_mcp: 'Standards-compatible Streamable HTTP configuration.',
  })[type],
  clientConfiguration: (label: string) => `Configuration: ${label}`,
}

afterEach(cleanup)

describe('ClientPicker', () => {
  it('renders only the normalized advertised subset in server order', () => {
    const onChange = vi.fn()
    render(<ClientPicker supportedClients={['opencode', 'generic_mcp']} value="opencode" onChange={onChange} copy={copy} />)

    const group = screen.getByRole('radiogroup', { name: copy.mcpClient })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map(radio => (radio as HTMLInputElement).value)).toEqual(['opencode', 'generic_mcp'])
    expect(screen.queryByRole('radio', { name: /Codex/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Pi/i })).not.toBeInTheDocument()
    expect(radios.every(radio => (radio as HTMLInputElement).name === 'mcp-client')).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: /Generic MCP/i }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('generic_mcp')
  })

  it('keeps pictograms decorative and exposes descriptive card text', () => {
    render(<ClientPicker supportedClients={['codex', 'pi']} value="codex" onChange={() => undefined} copy={copy} />)

    const group = screen.getByRole('radiogroup', { name: copy.mcpClient })
    expect(within(group).getByText('TOML configuration with environment-backed headers.')).toBeVisible()
    expect(within(group).getByText('Extension configuration over Streamable HTTP.')).toBeVisible()
    expect(group.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2)
    expect(within(group).queryByRole('img')).not.toBeInTheDocument()
  })
})
