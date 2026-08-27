import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

const webUrl = 'http://127.0.0.1:3200'
const apiUrl = 'http://127.0.0.1:3201'
const scenario = 'approval-journey'
const sessionId = '00000000-0000-4000-8000-000000000005'

const approvalIds = {
  approve: '00000000-0000-4000-8000-000000000101',
  reject: '00000000-0000-4000-8000-000000000102',
  requirements: '00000000-0000-4000-8000-000000000103',
} as const

const reasons = {
  approve: 'Human approved without additional requirements',
  reject: 'Human rejected without additional feedback',
  requirements: 'Keep rollback evidence attached to the final result.',
} as const

type ApprovalKind = keyof typeof approvalIds

type AgentState = Readonly<{
  approvals: ReadonlyArray<Record<string, unknown>>
  artifacts: ReadonlyArray<Record<string, unknown>>
  activities: ReadonlyArray<Record<string, unknown>>
  received: ReadonlyArray<{
    approvalId: string
    decision: 'approved' | 'rejected'
    immutable: boolean
    reason: string
    resultSummary: string
  }>
}>

async function resetScenario(request: APIRequestContext, nextScenario: string): Promise<void> {
  const response = await request.post(`${apiUrl}/__test/reset`, { data: { scenario: nextScenario } })
  expect(response.ok(), await response.text()).toBe(true)
}

async function fakeAgentRequestsApproval(request: APIRequestContext, kind: ApprovalKind): Promise<void> {
  const response = await request.post(`${apiUrl}/__test/agent/request-approval`, {
    data: { kind },
  })
  expect(response.ok(), await response.text()).toBe(true)
  const body = await response.json() as { approval?: { id?: string; status?: string } }
  expect(body.approval?.id).toBe(approvalIds[kind])
  expect(body.approval?.status).toBe('pending')
}

async function readAgentState(request: APIRequestContext): Promise<AgentState> {
  const response = await request.get(`${apiUrl}/__test/agent/state`)
  expect(response.ok(), await response.text()).toBe(true)
  return response.json() as Promise<AgentState>
}

async function expectDecisionRecorded(
  request: APIRequestContext,
  kind: ApprovalKind,
  decision: 'approved' | 'rejected',
  reason: string,
): Promise<void> {
  await expect.poll(async () => {
    const state = await readAgentState(request)
    return state.received.find(item => item.approvalId === approvalIds[kind]) ?? null
  }, { timeout: 5_000 }).toEqual(expect.objectContaining({ decision, immutable: true, reason }))

  const response = await request.get(`${apiUrl}/api/v1/approvals/${approvalIds[kind]}`)
  expect(response.ok(), await response.text()).toBe(true)
  const approval = await response.json() as {
    decisions?: Array<{ decision: string; reason: string }>
    status?: string
    viewer_actionability?: unknown
  }
  expect(approval.status).toBe(decision)
  expect(approval.decisions).toEqual([expect.objectContaining({ decision, reason })])
  expect(approval.viewer_actionability).toEqual({ status: 'blocked', reason: 'already_decided' })
}

async function expectApprovalRow(page: Page, id: string): Promise<Locator> {
  const row = page.getByTestId(`approval-row-${id}`)
  await expect(row).toBeVisible()
  await expect(row.locator('.approval-row-actions')).toBeVisible()
  await expect(row.getByRole('button', { name: 'Approve' })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Reject' })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Other feedback' })).toBeVisible()
  return row
}

async function expectMobileApprovalActions(page: Page, row: Locator, width: number): Promise<void> {
  const actions = row.locator('.approval-row-actions')
  await expect(actions).toBeVisible()
  const bounds = await actions.boundingBox()
  expect(bounds).not.toBeNull()
  if (bounds) {
    expect(bounds.x).toBeGreaterThanOrEqual(-0.5)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 0.5)
  }
  const pageGeometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(pageGeometry.scrollWidth).toBe(pageGeometry.clientWidth)
}

test.describe('M6.6 fake Agent approval hand-off', () => {
  test.beforeEach(async ({ context, request }) => {
    await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])
    await resetScenario(request, scenario)
  })

  test.afterEach(async ({ request }) => {
    await resetScenario(request, 'default')
  })

  test('records one-click decisions and attached requirements in the fake Agent result', async ({ page, request }) => {
    await fakeAgentRequestsApproval(request, 'approve')
    await fakeAgentRequestsApproval(request, 'reject')
    await fakeAgentRequestsApproval(request, 'requirements')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/agents?tab=approvals&approvalView=pending', { waitUntil: 'domcontentloaded' })

    const approveRow = await expectApprovalRow(page, approvalIds.approve)
    const rejectRow = await expectApprovalRow(page, approvalIds.reject)
    const requirementsRow = await expectApprovalRow(page, approvalIds.requirements)
    await expect(page.getByRole('button', { name: 'Approve selected' })).toHaveCount(0)
    await expectMobileApprovalActions(page, approveRow, 390)

    // The first click is deliberately delayed by the fixture. Only that row
    // enters the submitting state; the other approval cards remain usable.
    await approveRow.getByRole('button', { name: 'Approve' }).click()
    await expect(approveRow.getByRole('button', { name: 'Submitting…' })).toBeVisible()
    await expect(rejectRow.getByRole('button', { name: 'Approve' })).toBeEnabled()
    await expect(requirementsRow.getByRole('button', { name: 'Other feedback' })).toBeEnabled()
    await expect(approveRow.locator('.approval-decision-status')).toContainText('Approval decision recorded.', { timeout: 5_000 })
    await expectDecisionRecorded(request, 'approve', 'approved', reasons.approve)
    await expect(approveRow).toHaveCount(0, { timeout: 5_000 })
    await expect(rejectRow.getByRole('button', { name: 'Approve' })).toBeFocused()

    await rejectRow.getByRole('button', { name: 'Reject' }).click()
    await expect(rejectRow.getByRole('button', { name: 'Submitting…' })).toBeVisible()
    await expect(rejectRow.locator('.approval-decision-status')).toContainText('Rejection decision recorded.', { timeout: 5_000 })
    await expectDecisionRecorded(request, 'reject', 'rejected', reasons.reject)
    await expect(rejectRow).toHaveCount(0, { timeout: 5_000 })
    await expect(requirementsRow.getByRole('button', { name: 'Approve' })).toBeFocused()

    await requirementsRow.getByRole('button', { name: 'Other feedback' }).click()
    const feedback = requirementsRow.getByRole('textbox', { name: 'Decision information for the Agent' })
    await expect(feedback).toBeVisible()
    await feedback.fill(reasons.requirements)
    await requirementsRow.getByRole('button', { name: 'Approve with requirements' }).click()
    // The attached-requirements composer mirrors the selected decision label
    // while the request is in flight. Scope the loading assertion to the
    // primary row actions so it verifies the clicked card action rather than
    // the composer submit button as well.
    await expect(requirementsRow.locator('.approval-row-actions').getByRole('button', { name: 'Submitting…' })).toBeVisible()
    await expect(requirementsRow.locator('.approval-decision-status')).toContainText('Approval decision recorded.', { timeout: 5_000 })
    await expectDecisionRecorded(request, 'requirements', 'approved', reasons.requirements)
    await expect(requirementsRow).toHaveCount(0, { timeout: 5_000 })
    await expect(page.locator('.approval-table-region')).toBeFocused()

    const state = await readAgentState(request)
    expect(state.received).toEqual(expect.arrayContaining([
      expect.objectContaining({ approvalId: approvalIds.approve, reason: reasons.approve, immutable: true }),
      expect.objectContaining({ approvalId: approvalIds.reject, reason: reasons.reject, immutable: true }),
      expect.objectContaining({ approvalId: approvalIds.requirements, reason: reasons.requirements, immutable: true }),
    ]))
    expect(state.activities.filter(activity => activity.kind === 'completion')).toHaveLength(3)
    expect(state.artifacts).toHaveLength(3)
    expect(JSON.stringify(state.activities)).toContain(reasons.requirements)

    // The Agent's human-visible timeline and evidence panel are the durable
    // acknowledgement surface, not merely the decision response body.
    await page.goto(`/agent-sessions/${sessionId}`, { waitUntil: 'domcontentloaded' })
    const timeline = page.getByTestId('run-timeline')
    await expect(timeline).toBeVisible()
    await expect(timeline.getByRole('region', { name: 'Causal event groups' })).toBeVisible()
    await expect(timeline.getByText(reasons.approve, { exact: false })).toBeVisible()
    await expect(timeline.getByText(reasons.reject, { exact: false })).toBeVisible()
    await expect(timeline.getByText(reasons.requirements, { exact: false })).toBeVisible()
    await expect(timeline.getByText(/Result summary/)).toHaveCount(3)

    const evidence = timeline.getByRole('region', { name: 'Evidence and changes' })
    await expect(evidence).toBeVisible()
    await expect(evidence.getByText('Evidence for Publish the verified result')).toBeVisible()
    await expect(evidence.getByText('Evidence for Delete the unverified draft')).toBeVisible()
    await expect(evidence.getByText('Evidence for Apply the readability improvements')).toBeVisible()
  })

  test('exposes the same decision controls through Human Attention on a narrow card', async ({ page, request }) => {
    await fakeAgentRequestsApproval(request, 'reject')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/?view=inbox', { waitUntil: 'domcontentloaded' })

    const center = page.getByTestId('attention-center')
    await expect(center).toBeVisible()
    const queueRow = center.getByRole('listitem').filter({ hasText: 'Delete the unverified draft' })
    await expect(queueRow).toBeVisible()
    await queueRow.getByRole('button', { name: 'Review and respond' }).click()

    const decision = center.locator('.approval-decision-controls')
    await expect(decision).toBeVisible()
    await expect(decision.getByRole('button', { name: 'Approve' })).toBeVisible()
    await expect(decision.getByRole('button', { name: 'Reject' })).toBeVisible()
    await expect(decision.getByRole('button', { name: 'Other feedback' })).toBeVisible()
    const decisionBounds = await decision.boundingBox()
    expect(decisionBounds).not.toBeNull()
    if (decisionBounds) expect(decisionBounds.x + decisionBounds.width).toBeLessThanOrEqual(390.5)
    await expectMobileApprovalActions(page, decision, 390)

    await decision.getByRole('button', { name: 'Reject' }).click()
    await expect(decision.getByRole('button', { name: 'Submitting…' })).toBeVisible()
    await expect(decision.locator('.approval-decision-status')).toContainText('Rejection decision recorded.', { timeout: 5_000 })
    await expectDecisionRecorded(request, 'reject', 'rejected', reasons.reject)
  })
})
