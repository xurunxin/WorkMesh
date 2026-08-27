import { expect, test, type Page, type Route } from '@playwright/test'
import type { RunExplanation } from '@workmesh/contracts'

const uuid = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const sessionId = uuid(1)
const actor = { id: uuid(2), kind: 'agent' as const, displayName: 'Roadmap Agent' }
const human = { id: uuid(3), kind: 'human' as const, displayName: 'Roadmap Human' }
const planOne = uuid(10); const planTwo = uuid(11); const stepRead = uuid(20); const stepChange = uuid(21); const stepRecover = uuid(22); const artifactId = uuid(30)
const timestamp = (minute: number) => new Date(Date.UTC(2026, 7, 26, 8) + minute * 60_000).toISOString()
const fulfill = (route: Route, body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status: 200 })

type Group = RunExplanation['causalGroups'][number]
const group = (sequence: number, phase: Group['phase'], summary: string, overrides: Partial<Group> = {}): Group => ({
  id: `activity-group:${uuid(100 + sequence)}`, kind: 'action_completed', phase, actionType: phase === 'validation' ? 'validation' : phase === 'planning' ? 'plan' : phase === 'investigation' ? 'read' : phase === 'human_input' ? 'approval' : phase === 'completion' ? 'state_transition' : 'write', summary,
  trigger: { kind: 'activity', summary: `Triggered: ${summary}`, sourceActivityId: uuid(100 + sequence) }, actor,
  planVersionId: phase === 'planning' ? planTwo : planOne, planStepId: phase === 'investigation' ? stepRead : stepChange,
  risk: null, count: 1, firstSequence: sequence, lastSequence: sequence, sourceActivityIds: [uuid(100 + sequence)], affectedResources: [], evidence: [],
  validation: { state: phase === 'validation' ? 'pending' : 'not_verified', summary: null }, startedAt: timestamp(sequence), endedAt: timestamp(sequence), durationMs: 0,
  collapsed: false, material: phase !== 'investigation', failure: false, attention: phase === 'human_input',
  technicalRecords: [{ id: uuid(100 + sequence), sequence, kind: 'action_completed', summary, detailsSummary: null, actor, createdAt: timestamp(sequence), correlationId: `run-${sequence}`, eventCursor: String(sequence), toolInvocation: null, references: [] }],
  ...overrides,
})

const groups: Group[] = [
  group(1, 'intake', 'Acknowledged the delegated Work Item', { actionType: 'acknowledgement', planVersionId: null, planStepId: null }),
  group(2, 'investigation', 'Read repository and current requirements', { count: 4, lastSequence: 5, collapsed: true, sourceActivityIds: [uuid(102), uuid(103), uuid(104), uuid(105)], technicalRecords: [2, 3, 4, 5].map(sequence => ({ id: uuid(100 + sequence), sequence, kind: 'action_completed', summary: 'Read repository and current requirements', detailsSummary: null, actor, createdAt: timestamp(sequence), correlationId: `run-${sequence}`, eventCursor: String(sequence), toolInvocation: { toolName: 'repository.read', inputSanitized: { path: 'apps/web' }, status: 'succeeded', resultSummary: 'Bounded source read.' }, references: [] })) }),
  group(6, 'implementation', 'Changed API and Web resources', { affectedResources: [{ type: 'work_item', id: uuid(40), label: 'WM-UX-006' }] }),
  group(7, 'validation', 'Focused validation failed', { failure: true, risk: 'high', validation: { state: 'failed', summary: 'One assertion failed.' }, technicalRecords: [{ id: uuid(107), sequence: 7, kind: 'error', summary: 'Focused validation failed', detailsSummary: null, actor, createdAt: timestamp(7), correlationId: 'run-7', eventCursor: '7', toolInvocation: { toolName: 'ci.test', inputSanitized: { suite: 'timeline' }, status: 'failed', resultSummary: 'One assertion failed.' }, references: [] }] }),
  group(8, 'planning', 'Published Plan v2 with a recovery step', { planVersionId: planTwo, planStepId: stepRecover }),
  group(9, 'human_input', 'Human approved the recovery action', { actionType: 'approval', risk: 'medium', planVersionId: planTwo, planStepId: stepRecover, affectedResources: [{ type: 'approval', id: uuid(50) }] }),
  group(10, 'validation', 'Integrated validation passed', { planVersionId: planTwo, planStepId: stepRecover, validation: { state: 'verified', summary: 'All required checks passed.' }, evidence: [{ type: 'test_report', id: artifactId, title: 'Integrated validation report', uri: 'https://example.test/checks/42' }] }),
  group(11, 'completion', 'Completed with verified evidence', { planVersionId: planTwo, planStepId: stepRecover, evidence: [{ type: 'test_report', id: artifactId, title: 'Integrated validation report', uri: 'https://example.test/checks/42' }], validation: { state: 'verified', summary: 'Terminal evidence verified.' } }),
]
const largeGroups = Array.from({ length: 100 }, (_, index) => group(100 + index, 'investigation', `Investigated bounded source ${index + 1}`))
const olderGroups = Array.from({ length: 20 }, (_, index) => group(20 + index, 'investigation', `Older bounded source ${index + 1}`))

const explanation: RunExplanation = {
  projectionVersion: 1,
  session: { id: sessionId, state: 'completed', revision: 12, stateReason: 'Roadmap slice completed.', budget: { maxRuntimeSeconds: 3600 }, updatedAt: timestamp(12) },
  project: { id: uuid(60), name: 'Human Control Plane', revision: 6 }, workItem: { id: uuid(40), title: 'Causal Agent Run Timeline', revision: 4 },
  responsibleHuman: human, activeAgent: actor, plan: { id: planTwo, revision: 2, changeSummary: 'Recover after failed validation' }, currentStep: { id: stepRecover, title: 'Recover and verify', status: 'completed', ordinal: 2 },
  planVersions: [
    { id: planOne, revision: 1, parentVersionId: null, changeSummary: 'Initial execution plan', author: actor, createdAt: timestamp(1), steps: [
      { id: stepRead, title: 'Investigate', description: 'Read bounded sources.', status: 'completed', ordinal: 0, dependsOn: [], acceptanceCriteria: ['Relevant source facts recorded'], expectedArtifacts: [], causalGroupIds: [groups[1]!.id], evidenceIds: [] },
      { id: stepChange, title: 'Implement and validate', description: 'Change the causal surface.', status: 'blocked', ordinal: 1, dependsOn: [stepRead], acceptanceCriteria: ['Focused checks pass'], expectedArtifacts: ['test_report'], causalGroupIds: [groups[2]!.id, groups[3]!.id], evidenceIds: [] },
    ] },
    { id: planTwo, revision: 2, parentVersionId: planOne, changeSummary: 'Recover after failed validation', author: actor, createdAt: timestamp(8), steps: [
      { id: stepRead, title: 'Investigate', description: 'Read bounded sources.', status: 'completed', ordinal: 0, dependsOn: [], acceptanceCriteria: ['Relevant source facts recorded'], expectedArtifacts: [], causalGroupIds: [], evidenceIds: [] },
      { id: stepChange, title: 'Implement and validate', description: 'Change the causal surface.', status: 'completed', ordinal: 1, dependsOn: [stepRead], acceptanceCriteria: ['Failure is explained'], expectedArtifacts: ['test_report'], causalGroupIds: [], evidenceIds: [] },
      { id: stepRecover, title: 'Recover and verify', description: 'Add the recovery gate.', status: 'completed', ordinal: 2, dependsOn: [stepChange], acceptanceCriteria: ['Integrated validation passes'], expectedArtifacts: ['test_report'], causalGroupIds: [groups[4]!.id, groups[5]!.id, groups[6]!.id, groups[7]!.id], evidenceIds: [artifactId] },
    ] },
  ],
  causalGroups: groups, nextCursor: null, pendingAttention: [], changes: [{ type: 'agent_session', id: sessionId, revision: 12 }, { type: 'artifact', id: artifactId, label: 'Integrated validation report' }],
  evidence: [{ type: 'test_report', id: artifactId, title: 'Integrated validation report', uri: 'https://example.test/checks/42' }],
  evidenceDetails: [{ type: 'test_report', id: artifactId, title: 'Integrated validation report', uri: 'https://example.test/checks/42', checksum: 'sha256:fixture', sourceTool: 'ci.test', createdAt: timestamp(10), planStepId: stepRecover, causalGroupIds: [groups[6]!.id, groups[7]!.id], validationState: 'verified', repository: { repository: 'xurunxin/WorkMesh', branch: 'codex/wm-ux-006-run-timeline', commit: '0123456789abcdef', pullRequest: 'https://github.com/xurunxin/WorkMesh/pull/106' } }],
  verification: { state: 'verified', summary: 'Source-backed validation evidence is available.' },
  health: { heartbeat: 'healthy', lastHeartbeatAt: timestamp(11), leaseCount: 0, pendingApprovalCount: 0 }, freshness: { state: 'current', observedAt: timestamp(12), sourceUpdatedAt: timestamp(12) },
  allowedControls: (['pause', 'resume', 'stop', 'retry', 'handoff', 'replan', 'steer'] as const).map(action => ({ action, allowed: false, reasonCode: 'session.terminal', targetState: null })),
}

async function installRoutes(page: Page, initialGroups: Group[] = groups, pagedGroups: Group[] = [], nextCursor: string | null = null) {
  const session = { id: sessionId, agent_id: uuid(70), agent_actor_id: actor.id, delegation_id: uuid(71), work_item_id: uuid(40), principal_human_actor_id: human.id, state: 'completed', state_reason: 'Roadmap slice completed.', revision: 12, current_plan_version_id: planTwo, budget: { maxRuntimeSeconds: 3600 }, last_heartbeat_at: timestamp(11), retry_of_session_id: null, stop_requested_at: null, error_code: null, error_summary: null, created_at: timestamp(0), updated_at: timestamp(12) }
  await page.route(`**/api/v1/agent-sessions/${sessionId}/explanation**`, route => {
    const query = new URL(route.request().url()).searchParams
    const source = query.get('cursor') ? pagedGroups : initialGroups
    const filtered = source.filter(candidate => (!query.get('phase') || candidate.phase === query.get('phase')) && (!query.get('planStepId') || candidate.planStepId === query.get('planStepId')) && (!query.get('failure') || candidate.failure) && (!query.get('attention') || candidate.attention))
    return fulfill(route, { ...explanation, causalGroups: filtered, nextCursor: query.get('cursor') ? null : nextCursor })
  })
  await page.route(`**/api/v1/agent-sessions/${sessionId}`, route => fulfill(route, session))
  for (const path of [`**/api/v1/agent-sessions/${sessionId}/activities**`, `**/api/v1/agent-sessions/${sessionId}/plans**`, `**/api/v1/artifacts**`, `**/api/v1/approvals**`, `**/api/v1/actors/humans**`]) await page.route(path, route => fulfill(route, { items: [], nextCursor: null }))
}

test('Run Timeline preserves causal URL state, Plan comparison, provenance disclosure, History, and responsive evidence', async ({ page, context }, testInfo) => {
  const login = await context.request.post('http://127.0.0.1:3101/api/v1/auth/login', { data: { email: 'alice@example.test', password: 'password-acceptance' }, headers: { 'idempotency-key': `run-timeline-login-${Date.now()}`, origin: 'http://127.0.0.1:3100' } })
  expect(login.ok()).toBeTruthy()
  await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: 'http://127.0.0.1:3100' }])
  await installRoutes(page)
  await page.goto(`/agent-sessions/${sessionId}`)
  const timeline = page.getByTestId('run-timeline')
  await expect(timeline).toBeVisible()
  await expect(timeline.getByText('Verified', { exact: true }).first()).toBeVisible()
  await expect(timeline.locator('.run-causal-group')).toHaveCount(8)
  await expect(timeline.getByText('Read repository and current requirements', { exact: true })).toBeVisible()

  await timeline.getByLabel('Compare version').selectOption(planOne)
  await expect(page).toHaveURL(/runCompare=/)
  await expect(timeline.getByText(/Added: Recover and verify/)).toBeVisible()
  await timeline.getByLabel('Phase').selectOption('validation')
  await expect(page).toHaveURL(/runPhase=validation/)
  await expect(timeline.locator('.run-causal-group')).toHaveCount(2)
  await timeline.getByLabel('Show technical records').click()
  await expect(page).toHaveURL(/runTechnical=1/)
  await expect(timeline.getByLabel('Show technical records')).toBeChecked()
  await timeline.locator('.run-causal-group').first().click()
  await expect(page).toHaveURL(/runGroup=/)
  await expect(timeline.getByText('Sanitized input')).toBeVisible()
  await expect(timeline.locator('.wm-technical-events').getByText('One assertion failed.')).toBeVisible()

  await page.goBack()
  await expect(page).not.toHaveURL(/runGroup=/)
  await page.goBack()
  await expect(page).not.toHaveURL(/runTechnical=1/)
  await page.goForward()
  await expect(page).toHaveURL(/runTechnical=1/)
  await expect(timeline.locator('.run-causal-group')).toHaveCount(2)

  await timeline.getByLabel('Phase').selectOption('all')
  await timeline.getByRole('combobox', { name: 'Time', exact: true }).selectOption('7d')
  await expect(page).toHaveURL(/runTime=7d/)
  await timeline.getByLabel('Human attention only').click()
  await expect(page).toHaveURL(/runAttention=1/)
  await expect(timeline.locator('.run-causal-group')).toHaveCount(1)
  await timeline.getByLabel('Human attention only').click()
  await expect(page).not.toHaveURL(/runAttention=1/)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(timeline).toBeVisible()
  await page.screenshot({ animations: 'disabled', fullPage: true, path: testInfo.outputPath('agent-run-timeline-390.png') })
})

test('Run Timeline keeps a bounded DOM, keyboard order, and durable pagination for 100 groups', async ({ page, context }) => {
  const login = await context.request.post('http://127.0.0.1:3101/api/v1/auth/login', { data: { email: 'alice@example.test', password: 'password-acceptance' }, headers: { 'idempotency-key': `run-timeline-scale-login-${Date.now()}`, origin: 'http://127.0.0.1:3100' } })
  expect(login.ok()).toBeTruthy()
  await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: 'http://127.0.0.1:3100' }])
  await installRoutes(page, largeGroups, olderGroups, '100')
  const startedAt = Date.now()
  await page.goto(`/agent-sessions/${sessionId}`)
  const timeline = page.getByTestId('run-timeline')
  await expect(timeline.locator('.run-causal-group')).toHaveCount(100)
  expect(Date.now() - startedAt).toBeLessThan(5_000)
  expect(await timeline.locator('*').count()).toBeLessThan(5_000)
  await timeline.getByLabel('Phase').focus()
  await page.keyboard.press('Tab')
  await expect(timeline.getByLabel('Actor')).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await timeline.getByRole('button', { name: 'View older events' }).click()
  await expect(page).toHaveURL(/runCursor=100/)
  await expect(timeline.locator('.run-causal-group')).toHaveCount(20)
  await expect(timeline.getByText('Older bounded source 1', { exact: true })).toBeVisible()
})
