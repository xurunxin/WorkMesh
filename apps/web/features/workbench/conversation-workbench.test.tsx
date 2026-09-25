// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedActor } from '../../app/lib/actor'
import { LocaleProvider } from '../../app/lib/i18n'
import { ConversationWorkbench } from './conversation-workbench'

const mocks = vi.hoisted(() => ({ request: vi.fn(), mutate: vi.fn() }))
vi.mock('../../app/lib/api', () => ({ apiRequest: mocks.request, apiMutation: mocks.mutate, json: () => ({ 'Content-Type': 'application/json' }) }))
vi.mock('../rich-content/editor', () => ({
  clearDraft: vi.fn(),
  RichTextEditor: ({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) =>
    <label>{label}<textarea onChange={event => onChange(event.target.value)} value={value} /></label>,
}))
vi.mock('../rich-content/markdown', () => ({ RichContent: ({ source }: { source: string }) => <p>{source}</p> }))

const actor = { id: 'human-a', workspace_id: 'workspace-a' } as AuthenticatedActor
const conversation = { id: 'conversation-a', title: 'Real work', status: 'active', revision: 3,
  team_id: 'team-a', agent_session_id: 'session-a', default_llm_connection_id: 'connection-a',
  default_llm_model_id: 'model-a', work_item_id: 'item-a', project_id: null, updated_at: '2026-09-25T00:00:00.000Z' }

beforeEach(() => {
  mocks.request.mockReset(); mocks.mutate.mockReset()
  mocks.request.mockImplementation(async (path: string) => {
    if (path === '/api/v1/workbench/conversations') return { items: [conversation], nextCursor: null }
    if (path.startsWith('/api/v1/agent-sessions?')) return { items: [{ id: 'session-a', state: 'executing',
      principal_human_actor_id: 'human-a', work_item_id: 'item-a', project_id: null }], nextCursor: null }
    if (path === '/api/v1/workbench/llm-connections') return { items: [{ id: 'connection-a', name: 'MiniMax China', status: 'active', secret_status: 'configured' }], nextCursor: null }
    if (path === '/api/v1/workbench/llm-connections/connection-a') return { models: [{ id: 'model-a', display_name: 'MiniMax-M3', enabled: true }] }
    if (path === '/api/v1/workbench/conversations/conversation-a') return conversation
    if (path.endsWith('/messages?limit=50')) return { items: [], nextBefore: null }
    if (path.endsWith('/turns?limit=50')) return { items: [], nextBefore: null }
    throw new Error(`Unexpected request: ${path}`)
  })
  mocks.mutate.mockResolvedValue({})
})
afterEach(() => cleanup())

describe('ConversationWorkbench', () => {
  it('sends a Markdown turn with the current conversation revision and keeps the bound session on the server', async () => {
    render(<LocaleProvider><ConversationWorkbench actor={actor} /></LocaleProvider>)
    expect(await screen.findByText('Real work')).toBeInTheDocument()
    expect(await screen.findByText('发送第一条消息以开始。')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('消息（Markdown）'), { target: { value: '请读取当前会话上下文。' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      'workbench:send:conversation-a', '/api/v1/workbench/conversations/conversation-a/turns',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'If-Match': '"revision-3"' }),
        body: JSON.stringify({ messageMarkdown: '请读取当前会话上下文。' }) }),
    ))
  })
})
