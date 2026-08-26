import { expect, test, type Page, type Route } from '@playwright/test'
import type { ActionPreview } from '@workmesh/contracts'

const uuid = (suffix: number) => `10000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const sessionId = uuid(1)
const nextSessionId = uuid(2)
const planId = uuid(3)
const stepId = uuid(4)
const timestamp = '2026-08-27T00:00:00.000Z'
const corsHeaders = { 'access-control-allow-origin': 'http://127.0.0.1:3100', 'access-control-allow-credentials': 'true', 'content-type': 'application/json' }
const fulfill = (route: Route, body: unknown, status = 200) => route.fulfill({ body: JSON.stringify(body), headers: corsHeaders, status })
const list = (route: Route, items: unknown[] = []) => fulfill(route, { items, nextCursor: null })

const session = (state: 'executing' | 'failed' | 'stopping', revision: number, id = sessionId) => ({
  id, agent_id: uuid(10), agent_actor_id: uuid(11), principal_human_actor_id: uuid(12), delegation_id: uuid(13), work_item_id: uuid(14),
  state, state_reason: state === 'failed' ? 'Validation failed.' : 'Executing the governed control acceptance.', revision,
  current_plan_version_id: planId, budget: { maxRuntimeSeconds: 600 }, last_heartbeat_at: timestamp,
  retry_of_session_id: id === nextSessionId ? sessionId : null, stop_requested_at: state === 'stopping' ? timestamp : null,
  error_code: state === 'failed' ? 'VALIDATION_FAILED' : null, error_summary: state === 'failed' ? 'One check failed.' : null,
  created_at: timestamp, updated_at: timestamp,
})

const plan = { id: planId, revision: 3, parent_version_id: null, change_summary: 'Governed execution', created_at: timestamp, steps: [{ id: stepId, title: 'Verify governed controls', status: 'in_progress', ordinal: 0, dependsOn: [], acceptanceCriteria: ['Every write is revision-bound'], expectedArtifacts: [] }] }

const preview = (action: ActionPreview['action'], revision: number, options: { stopMode?: 'graceful' | 'immediate'; scope?: NonNullable<ActionPreview['steeringScope']> } = {}): ActionPreview => ({
  projectionVersion: 1, action, allowed: true, reasonCode: 'control.allowed', sourceRevision: revision,
  currentState: action === 'retry' ? 'failed' : 'executing', targetState: action === 'stop' ? 'stopping' : null,
  affectedResources: [{ type: 'agent_session', id: sessionId, revision }], consequences: [{ code: `session.${action}.governed`, summary: 'The final command revalidates the preview revision.' }],
  reversible: action !== 'stop', releaseLease: action === 'stop', preserveArtifacts: true, preserveUncommittedWork: 'runtime_dependent', nextWorkItemState: null,
  invalidatedApprovals: [], requiredReason: true, requiredApproval: { required: false, approvalType: null },
  stopMode: action === 'stop' ? options.stopMode ?? 'graceful' : null,
  supportedStopModes: action === 'stop' ? [{ mode: 'graceful', available: true, summary: 'Stop at a safe boundary.' }, { mode: 'immediate', available: true, summary: 'Fence ordinary writes now.' }] : [],
  steeringScope: ['steer', 'replan', 'handoff'].includes(action) ? options.scope ?? (action === 'replan' ? 'remaining_plan' : 'session') : null,
  supportedSteeringScopes: action === 'steer' ? [
    { scope: 'current_step', available: true, reasonCode: 'control.allowed', result: 'prompt', summary: 'Current step only.' },
    { scope: 'remaining_plan', available: true, reasonCode: 'control.allowed', result: 'plan_version_request', summary: 'Remaining immutable Plan.' },
    { scope: 'session', available: true, reasonCode: 'control.allowed', result: 'prompt', summary: 'Whole Session.' },
    { scope: 'guidance_proposal', available: true, reasonCode: 'control.allowed', result: 'guidance_navigation', summary: 'Open versioned Guidance.' },
  ] : [],
  currentPlan: { id: planId, revision: 3 }, currentStep: { id: stepId, title: 'Verify governed controls' }, lastHeartbeatAt: timestamp,
  leaseBehavior: action === 'stop' ? 'release_now' : 'unchanged', recoveryPath: action === 'retry' ? 'Creates a distinct Agent Session.' : 'Reload the current Session.',
  resultResource: action === 'retry' ? 'new_session' : 'same_session', warnings: ['Preview expires and the final write uses optimistic concurrency.'],
  expiresAt: '2099-08-27T00:00:30.000Z', freshness: { state: 'current', observedAt: timestamp, sourceUpdatedAt: timestamp, invalidAfter: '2099-08-27T00:00:30.000Z' }, advisory: true,
})

async function installBaseRoutes(page: Page, initialState: 'executing' | 'failed' = 'executing') {
  let current = session(initialState, 7)
  await page.route('**/api/v1/auth/me', route => fulfill(route, { actor: { id: uuid(12), kind: 'human', display_name: 'Roadmap Human', workspace_id: uuid(20), workspace_role: 'admin' }, csrfToken: 'governed-controls-csrf' }))
  await page.route('**/api/v1/teams**', route => list(route, [{ id: uuid(21), name: 'Roadmap team', key: 'ROADMAP', revision: 1 }]))
  await page.route(`**/api/v1/agent-sessions/${sessionId}`, route => fulfill(route, current))
  await page.route(`**/api/v1/agent-sessions/${sessionId}/explanation**`, route => fulfill(route, {
    projectionVersion: 1, session: { id: sessionId, state: current.state, revision: current.revision, stateReason: current.state_reason, budget: current.budget, updatedAt: timestamp },
    project: null, workItem: { id: uuid(14), title: 'Governed controls', revision: 2 }, responsibleHuman: { id: uuid(12), kind: 'human', displayName: 'Roadmap Human' }, activeAgent: { id: uuid(11), kind: 'agent', displayName: 'Roadmap Agent' },
    plan: { id: planId, revision: 3, changeSummary: 'Governed execution' }, currentStep: { id: stepId, title: 'Verify governed controls', status: 'in_progress', ordinal: 0 },
    planVersions: [], causalGroups: [], nextCursor: null, pendingAttention: [], changes: [{ type: 'agent_session', id: sessionId, revision: current.revision }], evidence: [], evidenceDetails: [],
    verification: { state: 'not_verified', summary: 'Execution is still active.' }, health: { heartbeat: 'healthy', lastHeartbeatAt: timestamp, leaseCount: 1, pendingApprovalCount: 0 }, freshness: { state: 'current', observedAt: timestamp, sourceUpdatedAt: timestamp },
    allowedControls: (['pause', 'resume', 'stop', 'retry', 'handoff', 'replan', 'steer'] as const).map(action => ({ action, allowed: action === 'retry' ? current.state === 'failed' : current.state === 'executing', reasonCode: 'control.allowed', targetState: action === 'stop' ? 'stopping' : null })),
  }))
  await page.route(`**/api/v1/agent-sessions/${sessionId}/plans**`, route => list(route, [plan]))
  for (const path of [`**/api/v1/agent-sessions/${sessionId}/activities**`, `**/api/v1/artifacts**`, `**/api/v1/approvals**`, `**/api/v1/actors/humans**`]) await page.route(path, route => list(route))
  return { get current() { return current }, setCurrent(value: ReturnType<typeof session>) { current = value } }
}

async function login(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('workmesh.csrf-token', 'governed-controls-csrf'))
  await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: 'http://127.0.0.1:3100' }])
}

test('immediate stop preserves a Human draft across stale revision and requires explicit reissue', async ({ page }, testInfo) => {
  const fixture = await installBaseRoutes(page)
  let previewRevision = 7
  let signalAttempts = 0
  let committedBody: unknown
  let committedIfMatch = ''
  await page.route(`**/api/v1/agent-sessions/${sessionId}/control-preview`, async route => {
    const input = route.request().postDataJSON() as { action: ActionPreview['action']; stopMode?: 'graceful' | 'immediate' }
    return fulfill(route, preview(input.action, previewRevision, { stopMode: input.stopMode }))
  })
  await page.route(`**/api/v1/agent-sessions/${sessionId}/signals`, route => {
    signalAttempts += 1
    if (signalAttempts === 1) {
      previewRevision = 8
      fixture.setCurrent(session('executing', 8))
      return fulfill(route, { error: { code: 'STALE_REVISION', message: 'Session changed.', details: {}, correlationId: 'governed-stale' } }, 409)
    }
    committedBody = route.request().postDataJSON()
    committedIfMatch = route.request().headers()['if-match'] ?? ''
    fixture.setCurrent(session('stopping', 9))
    return fulfill(route, fixture.current)
  })
  await login(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/agent-sessions/${sessionId}`)
  const detail = page.getByTestId('agent-session-detail')
  await detail.getByRole('button', { name: 'Stop', exact: true }).first().click()
  const reason = page.getByRole('textbox', { name: 'Reason' })
  await expect(reason).toBeFocused()
  await page.getByRole('radio', { name: /Immediate/ }).click()
  await reason.fill('Stop before the maintenance window; preserve this exact draft.')
  await page.getByRole('button', { name: 'Confirm and execute' }).click()
  await expect(page.getByTestId('agent-session-detail').getByRole('alert')).toContainText(
    'Your draft is preserved',
  )
  await expect(reason).toHaveValue('Stop before the maintenance window; preserve this exact draft.')
  await expect(page.getByText(/revision 8/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm and execute' })).toBeDisabled()
  await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath('governed-stop-stale-390.png') })
  await page.getByRole('button', { name: 'Review latest state' }).click()
  await expect(page.getByRole('button', { name: 'Confirm and execute' })).toBeEnabled()
  await page.getByRole('button', { name: 'Confirm and execute' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(signalAttempts).toBe(2)
  expect(committedIfMatch).toBe('"revision-8"')
  expect(committedBody).toEqual({ signal: 'stop', reason: 'Stop before the maintenance window; preserve this exact draft.', stopMode: 'immediate' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('remaining Plan steering binds the instruction to the current Plan revision', async ({ page }, testInfo) => {
  await installBaseRoutes(page)
  let promptBody: unknown
  let promptIfMatch = ''
  await page.route(`**/api/v1/agent-sessions/${sessionId}/control-preview`, async route => {
    const input = route.request().postDataJSON() as { action: ActionPreview['action']; steeringScope?: NonNullable<ActionPreview['steeringScope']> }
    return fulfill(route, preview(input.action, 7, { scope: input.steeringScope }))
  })
  await page.route(`**/api/v1/agent-sessions/${sessionId}/prompt`, route => {
    promptBody = route.request().postDataJSON(); promptIfMatch = route.request().headers()['if-match'] ?? ''
    return fulfill(route, { id: uuid(30), revision: 1 })
  })
  await login(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`/agent-sessions/${sessionId}`)
  await page.getByTestId('agent-session-detail').getByRole('button', { name: 'Send prompt' }).click()
  await page.getByLabel('Scope').selectOption('remaining_plan')
  await page.getByLabel('Reason').fill('The validation boundary changed after review.')
  await page.getByLabel('Instruction').fill('Update only the remaining Plan steps and preserve completed evidence.')
  await expect(page.getByText('session.steer.governed')).toBeVisible()
  await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath('governed-steer-1440.png') })
  await page.getByRole('button', { name: 'Confirm and execute' }).click()
  expect(promptIfMatch).toBe('"revision-7"')
  expect(promptBody).toEqual({ bodyMarkdown: '## Remaining Plan guidance\n\nReason: The validation boundary changed after review.\n\nUpdate only the remaining Plan steps and preserve completed evidence.', planRevision: 3 })
})

test('retry creates and navigates to a distinct result Session exactly once', async ({ page }, testInfo) => {
  await installBaseRoutes(page, 'failed')
  let retries = 0
  await page.route(`**/api/v1/agent-sessions/${sessionId}/control-preview`, route => fulfill(route, preview('retry', 7)))
  await page.route(`**/api/v1/agent-sessions/${sessionId}/retry`, route => { retries += 1; return fulfill(route, session('executing', 1, nextSessionId)) })
  await page.route(`**/api/v1/agent-sessions/${nextSessionId}`, route => fulfill(route, session('executing', 1, nextSessionId)))
  await login(page)
  await page.setViewportSize({ width: 768, height: 900 })
  await page.goto(`/agent-sessions/${sessionId}`)
  await page.getByTestId('agent-session-detail').getByRole('button', { name: 'Retry', exact: true }).first().click()
  await page.getByLabel('Reason').fill('Retry after the failed validation is understood.')
  await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath('governed-retry-768.png') })
  const submit = page.getByRole('button', { name: 'Confirm and execute' })
  await submit.dblclick()
  await expect(page).toHaveURL(`/agent-sessions/${nextSessionId}`)
  expect(retries).toBe(1)
})
