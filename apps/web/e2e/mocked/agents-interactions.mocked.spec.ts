import { expect, test } from '@playwright/test'
import {
  equivalenceGroup,
  mockIds,
  readMockRequests,
  requestsFor,
  resetMock,
  restoreDefaultMock,
  writeMockEvidence,
} from './mock-control'

const webUrl = 'http://127.0.0.1:3200'
const apiUrl = 'http://127.0.0.1:3201'
const agentsListUrl = `/agents?tab=agents&approvalView=pending&approvalStatus=approved&name=Orbit&team=${mockIds.targetTeam}&capability=work%3Aread&status=active`

test.beforeEach(async ({ context, request }) => {
  await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])
  await resetMock(request, 'agents-interactions')
})

test.afterEach(async ({ request }) => {
  await restoreDefaultMock(request)
})

test('restores approval URL state, keeps History read-only, and retries one bulk decision idempotently', async ({ page, request }, testInfo) => {
  const initialUrl = `/agents?tab=approvals&approvalView=history&approvalStatus=rejected&name=Orbit&team=${mockIds.targetTeam}&capability=work%3Aread&status=active`
  await page.goto(initialUrl)

  await expect(page).toHaveURL(`${webUrl}${initialUrl}`)
  await expect(page.getByRole('tab', { name: 'Approvals' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId(`approval-history-row-${mockIds.approvalRejected}`)).toContainText('Rejected historical action')
  await expect(page.getByRole('table', { name: 'Approval history' }).getByRole('row')).toHaveCount(2)
  await expect(page.getByRole('table', { name: 'Approval history' }).getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Approve selected|Reject selected/ })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Pending' }).click()
  const pendingUrl = `/agents?tab=approvals&approvalView=pending&approvalStatus=rejected&name=Orbit&team=${mockIds.targetTeam}&capability=work%3Aread&status=active`
  await expect(page).toHaveURL(`${webUrl}${pendingUrl}`)
  await expect(page.getByTestId('approval-row-approval-mixed-approved')).toHaveCount(0)
  await expect(page.getByTestId(`approval-row-${mockIds.approvalRetry}`)).toBeVisible()
  await expect(page.getByTestId(`approval-row-${mockIds.approvalDirect}`)).toBeVisible()

  await page.getByTestId(`approval-checkbox-${mockIds.approvalRetry}`).check()
  await page.getByRole('button', { name: 'Approve selected' }).click()
  await expect(page.getByText('Approval action could not be completed')).toBeVisible()
  await expect(page.getByTestId(`approval-checkbox-${mockIds.approvalRetry}`)).toBeChecked()

  await page.getByRole('button', { name: 'Approve selected' }).click()
  await expect(page.getByTestId(`approval-row-${mockIds.approvalRetry}`)).toHaveCount(0)
  await expect(page.getByText('Approved 1 request')).toBeVisible()
  await expect(page).toHaveURL(`${webUrl}${pendingUrl}`)

  await expect.poll(async () => {
    const ledger = await readMockRequests(request)
    return requestsFor(ledger, 'POST', `/api/v1/approvals/${mockIds.approvalRetry}/decide`).map(entry => ({
      status: entry.status,
      group: entry.equivalenceGroup,
      hasKey: entry.hasIdempotencyKey,
    }))
  }).toEqual([
    { status: 503, group: 1, hasKey: true },
    { status: 200, group: 1, hasKey: true },
  ])
  const ledger = await readMockRequests(request)
  expect(equivalenceGroup(ledger, 1)).toEqual({ group: 1, requestCount: 2, commitCount: 1 })
  await writeMockEvidence({ ledger, name: 'agents-approval-retry-green', page, testInfo })
})

test('keeps Peek, Team Access, selection, URL, and stable Agent navigation independent', async ({ page, request }, testInfo) => {
  const approvalContextUrl = agentsListUrl.replace('tab=agents', 'tab=approvals')
  await page.goto(approvalContextUrl)
  await page.getByTestId(`approval-checkbox-${mockIds.approvalDirect}`).check()
  await page.getByRole('tab', { name: 'Agents' }).click()
  await expect(page).toHaveURL(`${webUrl}${agentsListUrl}`)
  const card = page.getByTestId(`agent-registry-${mockIds.activeAgent}`)
  const detailLink = card.getByRole('link', { name: 'Open details for Orbit Agent' })
  const teamAccessButton = card.getByRole('button', { name: 'Manage team access for Orbit Agent' })

  await detailLink.focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('dialog', { name: 'Peek at Orbit Agent' })).toBeVisible()
  await expect(page).toHaveURL(`${webUrl}${agentsListUrl}`)
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-center')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Peek at Orbit Agent' })).toHaveCount(0)
  await expect(detailLink).toBeFocused()

  await teamAccessButton.click()
  const teamAccessUrl = `${agentsListUrl}&teamAccessAgent=agent%2Froute`
  await expect(page).toHaveURL(`${webUrl}${teamAccessUrl}`)
  await expect(page.getByRole('dialog', { name: 'Orbit Agent' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Peek at Orbit Agent' })).toHaveCount(0)
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-center')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Orbit Agent' })).toHaveCount(0)
  await expect(page).toHaveURL(`${webUrl}${agentsListUrl}`)
  await expect(teamAccessButton).toBeFocused()

  await page.getByRole('tab', { name: 'Approvals' }).click()
  await expect(page).toHaveURL(`${webUrl}${approvalContextUrl}`)
  await expect(page.getByTestId(`approval-checkbox-${mockIds.approvalDirect}`)).toBeChecked()
  await page.getByRole('tab', { name: 'Agents' }).click()
  await expect(page).toHaveURL(`${webUrl}${agentsListUrl}`)

  await detailLink.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(`${webUrl}/agents/agent%2Froute`)
  await expect(page.getByRole('heading', { level: 1, name: 'Orbit Agent' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Agent facts' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(`${webUrl}${agentsListUrl}`)
  await expect(detailLink).toBeFocused()
  await writeMockEvidence({ ledger: await readMockRequests(request), name: 'agents-layers-back-green', page, testInfo })
})

test('replays an equivalent direct decision once and rejects a conflicting body without a second commit', async ({ request }, testInfo) => {
  const path = `/api/v1/approvals/${mockIds.approvalDirect}/decide`
  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': 'task-7-1-direct-equivalence',
    'If-Match': '"revision-3"',
  }
  const approved = { decision: 'approved', reason: 'Equivalent direct fixture.' }
  const first = await request.post(`${apiUrl}${path}`, { data: approved, headers })
  const replay = await request.post(`${apiUrl}${path}`, { data: approved, headers })
  const conflict = await request.post(`${apiUrl}${path}`, {
    data: { decision: 'rejected', reason: 'Non-equivalent direct fixture.' },
    headers,
  })

  expect(first.status()).toBe(200)
  expect(replay.status()).toBe(200)
  expect(await replay.json()).toEqual(await first.json())
  expect(conflict.status()).toBe(409)
  expect(await conflict.json()).toEqual({
    error: {
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'The idempotency key was reused for a different request.',
    },
  })

  const ledger = await readMockRequests(request)
  const decisions = requestsFor(ledger, 'POST', path)
  expect(decisions).toHaveLength(3)
  expect(decisions.map(entry => entry.equivalenceGroup)).toEqual([1, 1, 1])
  expect(decisions.every(entry => entry.hasIdempotencyKey)).toBe(true)
  expect(equivalenceGroup(ledger, 1)).toEqual({ group: 1, requestCount: 3, commitCount: 1 })
  await writeMockEvidence({ ledger, name: 'agents-idempotency-green', testInfo })
})

test('rejects malformed approval decisions before mutating the fixture', async ({ request }) => {
  const path = `/api/v1/approvals/${mockIds.approvalDirect}/decide`
  const validHeaders = {
    'Content-Type': 'application/json',
    'If-Match': '"revision-3"',
  }
  const cases = [
    { name: 'invalid decision enum', body: { decision: 'approved_with_requirements', reason: 'Not a supported domain decision.' }, status: 422, code: 'INVALID_APPROVAL_DECISION' },
    { name: 'missing reason', body: { decision: 'approved', reason: '   ' }, status: 422, code: 'APPROVAL_REASON_REQUIRED' },
    { name: 'stale revision', body: { decision: 'approved', reason: 'Current enough text.' }, headers: { ...validHeaders, 'If-Match': '"revision-2"' }, status: 412, code: 'STALE_REVISION' },
  ] as const
  for (const [index, candidate] of cases.entries()) {
    const response = await request.post(`${apiUrl}${path}`, {
      data: candidate.body,
      headers: { ...validHeaders, ...('headers' in candidate ? candidate.headers : {}), 'Idempotency-Key': `strict-approval-${index}` },
    })
    expect(response.status(), candidate.name).toBe(candidate.status)
    expect(await response.json()).toEqual({ error: expect.objectContaining({ code: candidate.code }) })
  }
  const missingKey = await request.post(`${apiUrl}${path}`, { data: { decision: 'approved', reason: 'A valid reason.' }, headers: validHeaders })
  expect(missingKey.status()).toBe(400)
  expect(await missingKey.json()).toEqual({ error: expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REQUIRED' }) })

  const approval = await request.get(`${apiUrl}/api/v1/approvals/${mockIds.approvalDirect}`)
  expect(approval.status()).toBe(200)
  expect(await approval.json()).toEqual(expect.objectContaining({ status: 'pending', revision: 3, decisions: [] }))
})
