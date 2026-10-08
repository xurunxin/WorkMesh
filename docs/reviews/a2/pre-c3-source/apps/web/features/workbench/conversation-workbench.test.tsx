// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  default_llm_model_id: 'model-a', work_item_id: 'item-a', project_id: null, updated_at: '2026-09-25T00:00:00.000Z',
  context_pins: [{ kind: 'work_item', refId: 'item-a', revision: null, resolved_revision: 2 }] }
const otherConversation = { ...conversation, id: 'conversation-b', title: 'Other work', revision: 1 }
let sessionState = 'executing'
let includeSecondConversation = false
let toolLedger: Array<Record<string, unknown>> = []

beforeEach(() => {
  sessionState = 'executing'
  includeSecondConversation = false
  toolLedger = []
  mocks.request.mockReset(); mocks.mutate.mockReset()
  mocks.request.mockImplementation(async (path: string) => {
    if (path === '/api/v1/workbench/conversations') return { items: includeSecondConversation ? [conversation, otherConversation] : [conversation], nextCursor: null }
    if (path.startsWith('/api/v1/agent-sessions?')) return { items: [{ id: 'session-a', state: 'executing',
      principal_human_actor_id: 'human-a', work_item_id: 'item-a', project_id: null }], nextCursor: null }
    if (path === '/api/v1/workbench/llm-connections') return { items: [
      { id: 'connection-a', name: 'MiniMax China', status: 'active', secret_status: 'configured' },
      { id: 'connection-b', name: 'Second service', status: 'active', secret_status: 'configured' },
    ], nextCursor: null }
    if (path === '/api/v1/workbench/llm-connections/connection-a') return { models: [{ id: 'model-a', display_name: 'MiniMax-M3', enabled: true }] }
    if (path === '/api/v1/workbench/llm-connections/connection-b') return { models: [{ id: 'model-b', display_name: 'Alternate model', enabled: true }] }
    if (path === '/api/v1/workbench/conversations/conversation-a') return conversation
    if (path === '/api/v1/workbench/conversations/conversation-b') return otherConversation
    if (path === '/api/v1/agent-sessions/session-a') return { id: 'session-a', state: sessionState }
    if (path.endsWith('/messages?limit=50')) return { items: [], nextBefore: null }
    if (path.endsWith('/turns?limit=50')) return { items: toolLedger, nextBefore: null }
    throw new Error(`Unexpected request: ${path}`)
  })
  mocks.mutate.mockResolvedValue({})
})
afterEach(() => cleanup())

describe('ConversationWorkbench', () => {
  it('固定提示仅追加未发送草稿并聚焦，点击不自动发送或激活', async () => {
    render(<LocaleProvider><ConversationWorkbench actor={actor} /></LocaleProvider>)
    const editor = await screen.findByLabelText('消息（Markdown）')
    fireEvent.change(editor, { target: { value: '保留原草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '介绍一下 WorkMesh 的主要功能和使用方式。' }))
    expect(editor).toHaveValue('保留原草稿\n介绍一下 WorkMesh 的主要功能和使用方式。')
    await waitFor(() => expect(editor).toHaveFocus())
    expect(mocks.mutate).not.toHaveBeenCalled()
  })
  it('没有对话时提示仅展开既有创建表单，取消不会写入', async () => {
    const original = mocks.request.getMockImplementation()!
    mocks.request.mockImplementation((path: string) => path === '/api/v1/workbench/conversations' ? Promise.resolve({ items: [], nextCursor: null }) : original(path))
    render(<LocaleProvider><ConversationWorkbench actor={actor} /></LocaleProvider>)
    await screen.findByText('选择或新建对话。')
    fireEvent.click(screen.getByRole('button', { name: '帮我梳理项目目标，整理待办和下一步。' }))
    expect(document.getElementById('workbench-create-form')).toBeInTheDocument()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })
  it('offers a return path to the classic screen now that it is the default landing', () => {
    render(<LocaleProvider><ConversationWorkbench actor={actor} /></LocaleProvider>)
    // The workbench is where a bare "/" lands, so the classic Issues screen must
    // be reachable from inside it without going back through the sidebar.
    const back = screen.getByTestId('workbench-back-to-issues')
    expect(back.getAttribute('href')).toBe('/?view=my-work')
  })

  it('states the recorded tools for a settled turn and does not imply a count it does not have', async () => {
    toolLedger = [{
      id: 'turn-a', conversation_id: 'conversation-a', sequence: 1, status: 'failed',
      error_code: 'RUNNER_TIMEOUT', retry_of_turn_id: null,
      tool_invocations: [{
        id: 'invocation-a', turn_id: 'turn-a', tool_name: 'create_work_item', call_count: 3,
        sanitized_input_summary: 'title, statusId', usage: {}, sequence: 1,
        created_at: '2026-09-27T00:00:00.000Z',
      }],
    }]
    render(<LocaleProvider><ConversationWorkbench actor={actor} /></LocaleProvider>)

    // A turn that has settled with a recorded tool.
    expect(await screen.findByText('create_work_item')).toBeInTheDocument()
    expect(screen.getByText('×3')).toBeInTheDocument()
    // The dot follows the turn, so a failed turn never presents its tools as done.
    const chip = screen.getByTitle('title, statusId')
    expect(chip.className).toContain('is-failed')
    expect(chip.className).not.toContain('is-done')
    expect(screen.getByText('did not complete')).toBeInTheDocument()

    // A turn with no ledger must not claim it called no tools: the row is absent,
    // and nothing anywhere states a zero.
    expect(screen.queryByText('×0')).toBeNull()
    expect(screen.queryByText('0 tools')).toBeNull()
  })
  it('sends a Markdown turn with the current conversation revision and keeps the bound session on the server', async () => {
    render(<LocaleProvider><ConversationWorkbench actor={actor} /></LocaleProvider>)
    expect(await screen.findByText('Real work')).toBeInTheDocument()
    expect(await screen.findByText('发送第一条消息以开始。')).toBeInTheDocument()
    expect(await screen.findByText('执行会话状态: executing')).toBeInTheDocument()
    expect(screen.getByLabelText('本次模型服务')).toHaveValue('connection-a')
    await waitFor(() => expect(screen.getByLabelText('本次模型')).toHaveValue('model-a'))
    fireEvent.change(screen.getByLabelText('消息（Markdown）'), { target: { value: '请读取当前会话上下文。' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      'workbench:send:conversation-a', '/api/v1/workbench/conversations/conversation-a/turns',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'If-Match': '"revision-3"' }),
        body: JSON.stringify({ messageMarkdown: '请读取当前会话上下文。', llmConnectionId: 'connection-a', llmModelId: 'model-a' }) }),
    ))
  })

  it('uses the service and model selected for this turn in the actual request', async () => {
    render(<LocaleProvider><ConversationWorkbench actor={actor} /></LocaleProvider>)
    expect(await screen.findByText('发送第一条消息以开始。')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('本次模型服务'), { target: { value: 'connection-b' } })
    await waitFor(() => expect(screen.getByLabelText('本次模型')).toHaveValue('model-b'))
    fireEvent.change(screen.getByLabelText('消息（Markdown）'), { target: { value: 'Use the alternate model' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      'workbench:send:conversation-a', '/api/v1/workbench/conversations/conversation-a/turns',
      expect.objectContaining({ body: JSON.stringify({ messageMarkdown: 'Use the alternate model',
        llmConnectionId: 'connection-b', llmModelId: 'model-b' }) }),
    ))
  })

  it('shows a terminal bound session and prevents queuing a turn', async () => {
    sessionState = 'completed'
    render(<LocaleProvider><ConversationWorkbench actor={actor} /></LocaleProvider>)
    expect(await screen.findByText('执行会话状态: completed')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('消息（Markdown）'), { target: { value: 'Should not queue' } })
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    expect(screen.getByText('绑定的执行会话已结束，请创建新的委派会话。')).toBeInTheDocument()
  })

  it('keeps the newly selected conversation draft when the previous send returns late', async () => {
    includeSecondConversation = true
    let settle: ((value: unknown) => void) | undefined
    mocks.mutate.mockImplementation(() => new Promise(resolve => { settle = resolve }))
    render(<LocaleProvider><ConversationWorkbench actor={actor} /></LocaleProvider>)
    await waitFor(() => expect(screen.getByLabelText('本次模型')).toHaveValue('model-a'))
    fireEvent.change(screen.getByLabelText('消息（Markdown）'), { target: { value: 'Old conversation message' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Other work/ }))
    expect(await screen.findByRole('heading', { name: 'Other work' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('消息（Markdown）'), { target: { value: 'Keep this newer draft' } })
    await act(async () => { settle?.({}) })
    expect(screen.getByLabelText('消息（Markdown）')).toHaveValue('Keep this newer draft')
  })
})
