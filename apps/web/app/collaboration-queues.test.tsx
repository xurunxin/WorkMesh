// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InboxItemDetail, InboxListItem } from '@workmesh/contracts'
import type { PagedCollection } from './lib/pagination'
import { ApiError } from './lib/api'
import { ActionableCollaborationQueues } from './collaboration-queues'

const apiMock = vi.hoisted(() => ({ apiMutation: vi.fn(), apiRequest: vi.fn() }))
const paginationMock = vi.hoisted(() => ({ usePagedApiList: vi.fn() }))

vi.mock('./lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('./lib/api')>()
  return { ...actual, ...apiMock }
})
vi.mock('./lib/pagination', async importOriginal => {
  const actual = await importOriginal<typeof import('./lib/pagination')>()
  return { ...actual, usePagedApiList: paginationMock.usePagedApiList }
})
vi.mock('./lib/realtime', () => ({
  useRealtimeConnectionState: () => 'connected',
  useRealtimeSubscription: () => undefined,
}))
vi.mock('./attention-center', () => ({ AttentionCenter: () => <div>Governed attention controls</div> }))
vi.mock('../features/collaboration/collaboration-hub', () => ({ CollaborationHub: () => <div>Grouped notification feed</div> }))
vi.mock('./lib/i18n', () => ({ useLocale: () => ({ locale: 'en-US' }) }))

const ids = {
  agent: '11111111-1111-4111-8111-111111111111',
  agentInbox: '22222222-2222-4222-8222-222222222222',
  channel: '33333333-3333-4333-8333-333333333333',
  human: '44444444-4444-4444-8444-444444444444',
  infoInbox: '55555555-5555-4555-8555-555555555555',
  message: '66666666-6666-4666-8666-666666666666',
  requiredInbox: '77777777-7777-4777-8777-777777777777',
  session: '88888888-8888-4888-8888-888888888888',
  source: '99999999-9999-4999-8999-999999999999',
  workspace: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
} as const
const timestamp = '2026-08-27T08:00:00.000Z'

function listItem(overrides: Partial<InboxListItem>): InboxListItem {
  return {
    id: ids.infoInbox,
    kind: 'mention',
    source_type: 'room_message',
    source_id: ids.source,
    status: 'open',
    requires_response: false,
    recipient_session_id: null,
    claimed_by_session_id: null,
    claimed_at: null,
    revision: 1,
    created_at: timestamp,
    updated_at: timestamp,
    payload: {},
    detail_available: true,
    source_author_name: 'Ada',
    source_subject_key: 'WM-96',
    source_subject_title: 'Actionable queues',
    source_summary: 'A visible collaboration update',
    ...overrides,
  }
}

function collection<T extends { id: string }>(items: T[]): PagedCollection<T> {
  return {
    error: null,
    initialized: true,
    items,
    loadMore: vi.fn(async () => undefined),
    loading: false,
    loadingMore: false,
    nextCursor: null,
    refresh: vi.fn(async () => undefined),
  }
}

const humanItems = [
  listItem({ id: ids.requiredInbox, kind: 'approval', requires_response: true, source_subject_title: 'Approval needs a Human decision', source_summary: 'Approval needs a Human decision' }),
  listItem({ id: ids.infoInbox, source_subject_title: 'FYI from the implementation thread', source_summary: 'FYI from the implementation thread' }),
]
const agentItems = [listItem({
  id: ids.agentInbox,
  detail_available: false,
  observable_only: true,
  payload: {},
  recipient_actor_id: ids.agent,
  recipient_actor_kind: 'agent',
  recipient_actor_name: 'Delivery Agent',
  recipient_session_id: ids.session,
  recipient_session_state: 'executing',
  claimed_by_session_id: ids.session,
  claimed_by_session_state: 'executing',
  receipt_summary: { acknowledged: 1, claimed: 1, lastReceiptAt: timestamp, read: 1, replied: 0 },
  source_subject_title: 'Exact-session delivery status',
  source_summary: 'Exact-session delivery status',
  stale_recipient: false,
})]

const detail: InboxItemDetail = {
  id: ids.infoInbox,
  workspace_id: ids.workspace,
  recipient_actor_id: ids.human,
  recipient_human_actor_id: ids.human,
  recipient_session_id: null,
  claimed_by_session_id: null,
  claimed_at: null,
  team_id: null,
  session_id: null,
  kind: 'mention',
  source_type: 'room_message',
  source_id: ids.source,
  source_room_message_id: ids.message,
  requires_response: false,
  status: 'open',
  revision: 2,
  payload: {},
  resolved_at: null,
  resolved_by_actor_id: null,
  created_at: timestamp,
  updated_at: timestamp,
  channel_id: ids.channel,
  source_message_body: 'Visible Human message body',
  source_message_intent: 'inform',
  source_author_actor_id: ids.human,
  source_author_session_id: null,
  source_thread_id: ids.message,
  source_subject_kind: 'work_item',
  source_subject_id: ids.source,
  receipts: [],
  detailAvailable: true,
}

beforeEach(() => {
  window.history.replaceState({}, '', '/?view=inbox&queue=messages')
  paginationMock.usePagedApiList.mockReset()
  paginationMock.usePagedApiList.mockImplementation((path: string) =>
    path.includes('agent_observability') ? collection(agentItems) : collection(humanItems))
  apiMock.apiRequest.mockReset()
  apiMock.apiRequest.mockImplementation(async (path: string) => {
    if (path.includes('/timeline')) return { items: [], nextCursor: null }
    return detail
  })
  apiMock.apiMutation.mockReset()
  apiMock.apiMutation.mockResolvedValue(detail)
})

afterEach(cleanup)

describe('ActionableCollaborationQueues', () => {
  it('separates governed responses from informational messages and restores selection in the URL', async () => {
    render(<ActionableCollaborationQueues actor={{ id: ids.human, workspace_id: ids.workspace, workspace_role: 'admin' }} />)

    expect(screen.getByRole('heading', { name: 'Needs response (governed in Needs You)' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Approval needs a Human decision/ })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Mentions and informational updates' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /FYI from the implementation thread/ }))

    expect((await screen.findAllByText('Visible Human message body')).length).toBeGreaterThan(0)
    expect(window.location.search).toContain(`inboxItem=${ids.infoInbox}`)
    expect(screen.getByText('Acknowledged is a receipt; it is not a response or resolution.')).toBeVisible()
  })

  it('keeps Agent delivery body-redacted and exposes only recipient, claim, and receipt facts', () => {
    render(<ActionableCollaborationQueues actor={{ id: ids.human, workspace_id: ids.workspace, workspace_role: 'admin' }} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Agent delivery' }))
    fireEvent.click(screen.getByRole('button', { name: /Exact-session delivery status/ }))

    expect(screen.getAllByText(/Read-only operations view/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Delivery Agent/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/claim 1 · read 1 · ack 1 · reply 0/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Visible Human message body')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Claim' })).toBeNull()
  })

  it('preserves the reply draft when optimistic concurrency reports a conflict', async () => {
    apiMock.apiMutation.mockRejectedValueOnce(new ApiError(409, 'Revision changed', 'REVISION_CONFLICT'))
    render(<ActionableCollaborationQueues actor={{ id: ids.human, workspace_id: ids.workspace, workspace_role: 'admin' }} />)
    fireEvent.click(screen.getByRole('button', { name: /FYI from the implementation thread/ }))
    const reply = await screen.findByRole('textbox', { name: 'Reply' })
    fireEvent.change(reply, { target: { value: 'Keep this draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))

    await screen.findByText(/draft is preserved/)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('Keep this draft'))
  })
})
