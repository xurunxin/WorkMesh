import { expect, test, type Page, type Route } from '@playwright/test'
import type { HumanAttentionItem } from '@workmesh/contracts'

const uuid = (suffix: number): string =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`

const item = (
  suffix: number,
  kind: HumanAttentionItem['kind'],
  overrides: Partial<HumanAttentionItem> = {},
): HumanAttentionItem => {
  const sourceType = kind === 'completion_review' ? 'completion_suggestion' : kind === 'recovery' ? 'agent_session' : kind
  const sourceId = uuid(suffix)
  const command = kind === 'approval' ? 'decideApproval' : kind === 'clarification' ? 'replyInboxItem' : 'retryAgentSession'
  const optionId = kind === 'approval' ? 'approve' : kind === 'clarification' ? 'answer' : 'retry'
  return {
    projectionVersion: 1,
    id: `v1:${sourceType}:${sourceId}`,
    kind,
    status: 'open',
    workspaceId: uuid(100),
    teamId: uuid(101),
    projectId: uuid(102),
    workItemId: uuid(103 + suffix),
    sessionId: uuid(120 + suffix),
    planVersionId: null,
    planStepId: null,
    title: `${kind.replaceAll('_', ' ')} ${suffix}`,
    summary: `Authorized ${kind} source summary`,
    summaryDerived: true,
    reasonCodes: [`${kind}.response_required`],
    severity: kind === 'recovery' ? 'high' : 'low',
    urgency: kind === 'recovery' ? 'immediate' : 'soon',
    requestedBy: { id: uuid(200), kind: 'agent', displayName: 'Roadmap Agent' },
    responsibleHuman: { id: uuid(201), kind: 'human', displayName: 'Roadmap Human' },
    options: [{
      id: optionId,
      label: optionId,
      command,
      method: 'POST',
      path: `/api/v1/test-attention/${suffix}`,
      targetRevision: 4,
      requiredCapabilities: ['work:write'],
      requiredActorKinds: ['human'],
      requiresApproval: false,
    }],
    recommendedOptionId: optionId,
    audience: { relationship: 'assigned_to_me', canRespond: true },
    response: {
      workflow: kind,
      requiresReason: kind !== 'clarification',
      requiresMessage: kind === 'clarification',
      choices: [],
      expectedStatus: kind === 'approval' ? 'decided' : 'verified',
    },
    bulk: {
      eligible: kind === 'approval',
      compatibilityKey: kind === 'approval' ? 'approval:sha256:exact-payload' : null,
      prohibitedReason: kind === 'approval' ? null : 'bulk.kind_not_supported',
      revalidateIndividually: true,
    },
    impactSummary: 'The authoritative workflow remains paused until this response commits.',
    affectedResources: [{ type: 'work_item', id: uuid(103 + suffix), label: `WM-${suffix}` }],
    evidence: [{ type: 'artifact', id: uuid(220 + suffix), title: 'Acceptance evidence' }],
    expiresAt: null,
    sourceRevision: 4,
    source: { type: sourceType, id: sourceId, status: 'pending' },
    freshness: {
      state: 'current',
      observedAt: '2026-08-26T00:00:00.000Z',
      sourceUpdatedAt: '2026-08-26T00:00:00.000Z',
    },
    correlationId: `attention-e2e-${suffix}`,
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
    ...overrides,
  }
}

const fulfillJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status })

async function installAttentionRoutes(page: Page) {
  const active = [
    item(1, 'approval'),
    item(2, 'approval'),
    item(3, 'clarification'),
    item(4, 'recovery', {
      freshness: {
        state: 'stale',
        observedAt: '2026-08-26T00:00:00.000Z',
        sourceUpdatedAt: '2026-08-25T23:00:00.000Z',
      },
    }),
  ]
  const history = [item(5, 'completion_review', {
    status: 'verified',
    audience: { relationship: 'assigned_to_me', canRespond: false },
    options: [],
    recommendedOptionId: null,
  })]
  const attempts = new Map<string, number>()

  await page.route('**/api/v1/human-attention**', async route => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/human-attention')) return route.fallback()
    const source = url.searchParams.get('view') === 'history' ? history : active
    const kind = url.searchParams.get('kind')
    return fulfillJson(route, {
      items: kind ? source.filter(candidate => candidate.kind === kind) : source,
      nextCursor: null,
    })
  })
  await page.route('**/api/v1/test-attention/*', async route => {
    const path = new URL(route.request().url()).pathname
    const count = (attempts.get(path) ?? 0) + 1
    attempts.set(path, count)
    if (path.endsWith('/2')) return fulfillJson(route, { error: { code: 'REVISION_CONFLICT', message: 'Changed concurrently', correlationId: 'bulk-2' } }, 409)
    return fulfillJson(route, { ok: true, attempt: count })
  })
  return { attempts }
}

test('Attention Center preserves URL state, uses governed forms, retains partial bulk failures, and blocks stale recovery', async ({ page, context }, testInfo) => {
  const login = await context.request.post('http://127.0.0.1:3101/api/v1/auth/login', {
    data: { email: 'alice@example.test', password: 'password-acceptance' },
    headers: { 'idempotency-key': `attention-center-login-${Date.now()}`, origin: 'http://127.0.0.1:3100' },
  })
  expect(login.ok()).toBeTruthy()
  await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: 'http://127.0.0.1:3100' }])
  const { attempts } = await installAttentionRoutes(page)
  await page.goto('/?view=inbox')
  const center = page.getByTestId('attention-center')
  await expect(center).toBeVisible()
  await expect(center.getByRole('listitem')).toHaveCount(4)

  await center.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('clarification')
  await center.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page).toHaveURL(/attentionKind=clarification/)
  await expect(center.getByRole('listitem')).toHaveCount(1)
  const clarificationTrigger = center.getByRole('button', { name: 'Review and respond' })
  await clarificationTrigger.click()
  await expect(page).toHaveURL(/attentionSelected=/)
  await center.getByRole('button', { name: 'Response', exact: true }).click()
  await center.getByRole('textbox', { name: 'Response', exact: true }).fill('Use the current release branch.')
  await center.getByRole('button', { name: 'Submit response' }).click()
  await expect.poll(() => attempts.get('/api/v1/test-attention/3') ?? 0).toBe(1)

  await center.getByRole('button', { name: 'Clear' }).click()
  const bulkOne = center.getByLabel('Bulk response: approval 1')
  const bulkTwo = center.getByLabel('Bulk response: approval 2')
  await bulkOne.check()
  await bulkTwo.check()
  await center.getByLabel('Bulk reason').fill('Evidence matches the exact payload.')
  await center.getByRole('button', { name: 'Bulk approve' }).click()
  await expect(center.getByText('1 succeeded; 1 remain actionable.')).toBeVisible()
  await expect(bulkOne).not.toBeChecked()
  await expect(bulkTwo).toBeChecked()

  const recoveryRow = center.getByRole('listitem').filter({ hasText: 'recovery 4' })
  const recoveryTrigger = recoveryRow.getByRole('button', { name: 'Review and respond' })
  await recoveryTrigger.click()
  await expect(center.getByRole('button', { name: /Current data cannot authorize/ })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(recoveryTrigger).toBeFocused()

  await center.getByRole('tab', { name: 'History' }).click()
  await expect(page).toHaveURL(/attentionView=history/)
  await expect(center.getByText('completion review 5')).toBeVisible()
  await page.goBack()
  await expect(page).not.toHaveURL(/attentionView=history/)
  await expect(center.getByRole('listitem')).toHaveCount(4)
  await page.goForward()
  await expect(page).toHaveURL(/attentionView=history/)
  await expect(center.getByText('completion review 5')).toBeVisible()
  await page.goBack()
  await expect(center.getByRole('listitem')).toHaveCount(4)

  await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath('attention-center.png') })
})
