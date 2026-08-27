import { expect, test, type Page, type Route } from '@playwright/test'
import type { InboxItemDetail, InboxListItem } from '@workmesh/contracts'

test.use({ storageState: { cookies: [], origins: [] } })

const uuid = (suffix: number): string =>
  `10000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const timestamp = '2026-08-27T08:00:00.000Z'
const secretAgentBody = 'agent-body-must-never-reach-human-queue'

const humanItems: InboxListItem[] = [{
  id: uuid(1), kind: 'approval', source_type: 'room_message', source_id: uuid(11), status: 'open',
  requires_response: true, recipient_session_id: null, claimed_by_session_id: null, claimed_at: null,
  revision: 3, created_at: timestamp, updated_at: timestamp, payload: {}, detail_available: true,
  recipient_actor_id: uuid(20), recipient_actor_kind: 'human', recipient_actor_name: 'Roadmap Human',
  source_author_name: 'Delivery Agent', source_subject_kind: 'work_item', source_subject_id: uuid(30),
  source_subject_key: 'WM-96', source_subject_title: 'Approve release evidence', source_thread_id: uuid(11),
  source_summary: 'Approve release evidence', receipt_summary: { claimed: 0, read: 1, acknowledged: 1, replied: 0, lastReceiptAt: timestamp },
}, {
  id: uuid(2), kind: 'mention', source_type: 'room_message', source_id: uuid(12), status: 'open',
  requires_response: false, recipient_session_id: null, claimed_by_session_id: null, claimed_at: null,
  revision: 2, created_at: timestamp, updated_at: timestamp, payload: {}, detail_available: true,
  recipient_actor_id: uuid(20), recipient_actor_kind: 'human', recipient_actor_name: 'Roadmap Human',
  source_author_name: 'Delivery Agent', source_subject_kind: 'work_item', source_subject_id: uuid(30),
  source_subject_key: 'WM-96', source_subject_title: 'Implementation thread update', source_thread_id: uuid(12),
  source_summary: 'Implementation thread update', receipt_summary: { claimed: 0, read: 0, acknowledged: 0, replied: 0, lastReceiptAt: null },
}]

const agentItems: InboxListItem[] = [{
  id: uuid(3), kind: 'review_request', source_type: 'room_message', source_id: uuid(13), status: 'open',
  requires_response: true, recipient_session_id: uuid(40), claimed_by_session_id: uuid(40), claimed_at: timestamp,
  revision: 4, created_at: timestamp, updated_at: timestamp, payload: {}, detail_available: false,
  recipient_actor_id: uuid(21), recipient_actor_kind: 'agent', recipient_actor_name: 'Review Agent',
  recipient_session_state: 'executing', claimed_by_session_state: 'executing', source_author_name: 'Roadmap Human',
  source_subject_kind: 'work_item', source_subject_id: uuid(30), source_subject_key: 'WM-96',
  source_subject_title: 'Exact-session review delivery', source_thread_id: uuid(13),
  source_summary: 'Exact-session review delivery', receipt_summary: { claimed: 1, read: 1, acknowledged: 1, replied: 0, lastReceiptAt: timestamp },
  stale_recipient: false, observable_only: true,
}]

const humanDetail: InboxItemDetail = {
  id: uuid(2), workspace_id: uuid(50), recipient_actor_id: uuid(20), recipient_human_actor_id: uuid(20),
  recipient_session_id: null, claimed_by_session_id: null, claimed_at: null, team_id: uuid(51), session_id: null,
  kind: 'mention', source_type: 'room_message', source_id: uuid(12), source_room_message_id: uuid(12),
  requires_response: false, status: 'open', revision: 2, payload: {}, resolved_at: null, resolved_by_actor_id: null,
  created_at: timestamp, updated_at: timestamp, channel_id: uuid(60), source_message_body: 'Human-authorized visible thread body',
  source_message_intent: 'inform', source_author_actor_id: uuid(21), source_author_session_id: uuid(40),
  source_thread_id: uuid(12), source_subject_kind: 'work_item', source_subject_id: uuid(30), receipts: [], detailAvailable: true,
}

const fulfill = (route: Route, body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: 'application/json' })

async function installRoutes(page: Page) {
  await page.route('**/api/v1/inbox**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === `/api/v1/inbox/${uuid(2)}`) return fulfill(route, humanDetail)
    if (url.pathname !== '/api/v1/inbox') return route.fallback()
    return fulfill(route, { items: url.searchParams.get('scope') === 'agent_observability' ? agentItems : humanItems, nextCursor: null })
  })
  await page.route(`**/api/v1/rooms/${uuid(60)}/timeline**`, route => fulfill(route, {
    items: [{ id: uuid(12), kind: 'message', actorName: 'Delivery Agent', body: 'Human-authorized visible thread body', occurredAt: timestamp, threadId: uuid(12) }],
    nextCursor: null,
  }))
}

test('actionable queues preserve governed separation, redaction, URLs, and responsive layout', async ({ page, context }, testInfo) => {
  const status = await context.request.get('http://127.0.0.1:3101/api/v1/install-status')
  const installed = (await status.json() as { installed: boolean }).installed
  if (installed) {
    const login = await context.request.post('http://127.0.0.1:3101/api/v1/auth/login', {
      data: { email: 'alice@example.test', password: 'password-acceptance' },
      headers: { 'idempotency-key': `actionable-queue-login-${Date.now()}`, origin: 'http://127.0.0.1:3100' },
    })
    expect(login.ok()).toBeTruthy()
  } else {
    await page.goto('/install')
    const install = page.getByTestId('install-form')
    await install.getByPlaceholder('部署启动令牌').fill(process.env.WORKMESH_BOOTSTRAP_TOKEN!)
    await install.getByPlaceholder('My Workspace', { exact: true }).fill('Queue acceptance workspace')
    await install.getByPlaceholder('workspace-slug').fill('queue-acceptance-workspace')
    await install.getByPlaceholder('管理员姓名').fill('Alice')
    await install.getByPlaceholder('name@example.com').fill('alice@example.test')
    await install.getByPlaceholder('至少 12 个字符').fill('password-acceptance')
    await install.getByTestId('install-submit').click()
    await expect(page.getByRole('heading', { name: 'WorkMesh' })).toBeVisible()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await page.waitForTimeout(1_000)
  }
  await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: 'http://127.0.0.1:3100' }])
  await installRoutes(page)
  await page.goto('/?view=inbox&queue=messages')

  const queues = page.getByTestId('actionable-collaboration')
  await expect(queues.getByRole('heading', { name: 'Needs response (governed in Needs You)' })).toBeVisible()
  await expect(queues.getByRole('button', { name: /Approve release evidence/ })).toBeVisible()
  await expect(queues.getByRole('heading', { name: 'Mentions and informational updates' })).toBeVisible()
  await queues.getByRole('button', { name: /Implementation thread update/ }).click()
  await expect(page).toHaveURL(new RegExp(`inboxItem=${uuid(2)}`))
  await expect(queues.getByText('Acknowledged is a receipt; it is not a response or resolution.')).toBeVisible()
  await expect(queues.getByRole('textbox', { name: 'Reply' })).toBeVisible()

  await queues.getByRole('tab', { name: 'Agent delivery' }).click()
  await queues.getByRole('button', { name: /Exact-session review delivery/ }).click()
  await expect(queues.getByRole('heading', { name: 'Exact-session review delivery' })).toBeVisible()
  await expect(queues.getByText(/claim 1 · read 1 · ack 1 · reply 0/).last()).toBeVisible()
  await expect(queues.getByRole('button', { name: 'Claim', exact: true })).toHaveCount(0)
  await expect(queues).not.toContainText(secretAgentBody)

  await page.reload()
  await expect(queues.getByRole('heading', { name: 'Exact-session review delivery' })).toBeVisible()
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width)
  }
  await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath('actionable-collaboration-queues.png') })
})
