// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LocaleProvider } from '../lib/i18n'
import type { Agent } from '../lib/agents'
import { AgentPeek } from './agent-peek'

afterEach(() => { cleanup() })

const agent: Agent = {
  id: 'agent-1', workspace_id: 'workspace-1', actor_id: 'actor-1', name: 'Coder Bot', slug: 'coder',
  description: null, provider: 'openai', version: '1.2.3', supported_protocols: ['mcp'], skills: [],
  requested_capabilities: ['work:read'], approved_capabilities: ['work:read'], max_concurrency: 2,
  heartbeat_interval_seconds: 30, is_active: true, revision: 1, team_access: [],
}

function Harness() {
  const [open, setOpen] = useState(false)
  return <LocaleProvider>
    <button onClick={() => setOpen(true)} type="button">Open Coder Bot</button>
    <AgentPeek agent={agent} onClose={() => setOpen(false)} open={open} />
  </LocaleProvider>
}

describe('AgentPeek', () => {
  it('uses the shared Sheet, loaded list projection, and restores trigger focus on close', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open Coder Bot' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: /Coder Bot/ })
    expect(dialog).toBeVisible()
    expect(screen.getByTestId('agent-team-access-projection')).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
