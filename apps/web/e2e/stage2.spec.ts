import { expect, test, type Page } from '@playwright/test'

const apiUrl = 'http://127.0.0.1:3101'
const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:3100', 'Access-Control-Allow-Credentials': 'true', 'Content-Type': 'application/json' }
const releaseInfo = {
  serverVersion: '1.0.0',
  restApiVersion: '1.0',
  agentProtocolVersion: '1.0',
  mcpVersion: '1.0.0',
  a2aUpstreamVersion: '0.3',
  schemaBaseline: 1,
  buildSha: 'stage2-e2e',
}
const featureRegistry = {
  features: [
    { key: 'WORKMESH_BETA_PLANNING', tier: 'beta', enabled: false },
    { key: 'WORKMESH_BETA_TEMPLATES', tier: 'beta', enabled: false },
    { key: 'WORKMESH_BETA_COSTS', tier: 'beta', enabled: false },
    { key: 'WORKMESH_BETA_GITEA', tier: 'beta', enabled: false },
    { key: 'WORKMESH_BETA_OPERATIONS_UI', tier: 'beta', enabled: false },
    { key: 'WORKMESH_EXPERIMENTAL_AUTOMATION', tier: 'experimental', enabled: false },
    { key: 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS', tier: 'experimental', enabled: false },
    { key: 'WORKMESH_EXPERIMENTAL_A2A', tier: 'experimental', enabled: false },
    { key: 'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS', tier: 'experimental', enabled: false },
    { key: 'WORKMESH_EXPERIMENTAL_MULTI_RUNTIME', tier: 'experimental', enabled: false },
  ],
}

async function humanApi<T>(page: Page, path: string, method = 'GET', body?: unknown, revision?: number): Promise<{ status: number; body: T }> {
  return page.evaluate(async ({ apiUrl, path, method, body, revision }) => {
    const requestHeaders = new Headers({ Accept: 'application/json' })
    if (method !== 'GET') { requestHeaders.set('Content-Type', 'application/json'); requestHeaders.set('Idempotency-Key', crypto.randomUUID()); requestHeaders.set('X-CSRF-Token', sessionStorage.getItem('workmesh.csrf-token') ?? '') }
    if (revision !== undefined) requestHeaders.set('If-Match', `"revision-${revision}"`)
    const response = await fetch(`${apiUrl}${path}`, { method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'include' })
    return { status: response.status, body: await response.json() }
  }, { apiUrl, path, method, body, revision })
}

async function agentApi<T>(page: Page, bearerToken: string, path: string, method: 'POST' | 'PUT', body: unknown, revision?: number): Promise<{ status: number; body: T }> {
  const requestHeaders: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${bearerToken}`, 'Idempotency-Key': crypto.randomUUID() }
  if (revision !== undefined) requestHeaders['If-Match'] = `"revision-${revision}"`
  const response = await page.request.fetch(`${apiUrl}${path}`, { method, headers: requestHeaders, data: body })
  return { status: response.status(), body: await response.json() as T }
}

test('renders auditable multi-agent Work Room cards and confirms force release', async ({ page }) => {
  const actor = { id: 'human-1', displayName: 'Alex' }
  const executor = { agent_id: 'agent-definition-coordinator', agent_actor_id: 'agent-coordinator', agent_slug: 'coordinator', agent_display_name: 'Coordinator', session_id: 'session-parent', lease_id: 'lease-executor', lease_kind: 'exclusive', resource_type: 'work_item', resource_id: 'work-1', execution_state: 'executing', heartbeat_health: 'healthy', last_heartbeat_at: '2026-07-23T01:00:00.000Z', lease_heartbeat_at: '2026-07-23T01:00:00.000Z', lease_expires_at: '2026-07-23T01:30:00.000Z' }
  const reviewer = { agent_id: 'agent-definition-reviewer', agent_actor_id: 'agent-reviewer', agent_slug: 'reviewer', agent_display_name: 'Reviewer', session_id: 'session-child', lease_id: 'lease-reviewer', lease_kind: 'review_shared', resource_type: 'plan_step', resource_id: 'step-review', execution_state: 'awaiting_input', heartbeat_health: 'healthy', last_heartbeat_at: '2026-07-23T01:01:00.000Z', lease_heartbeat_at: '2026-07-23T01:01:00.000Z', lease_expires_at: '2026-07-23T01:31:00.000Z' }
  const workItem = { id: 'work-1', title: 'Coordinate multi-agent release', description: null, number: 42, revision: 3, status_id: 'state-1', status_name: 'In progress', status_category: 'started', team_id: 'team-1', team_key: 'ENG', priority: 'high', due_date: null, responsible_human_actor_id: actor.id, responsible_human: { actor_id: actor.id, display_name: actor.displayName }, active_executor: executor, shared_reviewers: [reviewer], labels: [], project_id: null }
  const sessions = [{ id: 'session-parent', agent_id: 'agent-coordinator', agent_actor_id: 'agent-coordinator', delegation_id: 'delegation-1', work_item_id: workItem.id, state: 'executing', state_reason: null, revision: 2, current_plan_version_id: 'plan-1', budget: { maxRuntimeSeconds: 300 }, last_heartbeat_at: '2026-07-23T01:00:00.000Z', stop_requested_at: null, error_code: null, error_summary: null, created_at: '2026-07-23T00:00:00.000Z', updated_at: '2026-07-23T01:00:00.000Z' }, { id: 'session-child', agent_id: 'agent-reviewer', agent_actor_id: 'agent-reviewer', delegation_id: 'delegation-2', work_item_id: workItem.id, state: 'awaiting_input', state_reason: null, revision: 1, current_plan_version_id: 'plan-2', budget: {}, last_heartbeat_at: '2026-07-23T01:01:00.000Z', stop_requested_at: null, error_code: null, error_summary: null, created_at: '2026-07-23T00:05:00.000Z', updated_at: '2026-07-23T01:01:00.000Z', parent_session_id: 'session-parent' }]
  const timeline = [
    { id: 'msg-ask', kind: 'ask', sourceId: 'message-1', channelId: 'room-1', actorId: 'agent-coordinator', actorName: 'Coordinator', sessionId: 'session-parent', occurredAt: '2026-07-23T01:02:00.000Z', summary: 'Can a human approve the release checklist?', status: 'open', payload: { planStepTitle: 'Release checklist' } },
    { id: 'msg-answer', kind: 'answer', sourceId: 'message-2', channelId: 'room-1', actorId: 'human-1', actorName: 'Alex', sessionId: 'session-parent', occurredAt: '2026-07-23T01:03:00.000Z', summary: 'Approved after security review.', payload: {} },
    { id: 'delta-1', kind: 'context_delta', subtype: 'delta', occurredAt: '2026-07-23T01:03:30.000Z', payload: { sessionId: 'session-parent', baseSnapshotId: 'snapshot-base', sourceSnapshotId: 'snapshot-delta', additions: [{ sourceType: 'artifact', sourceId: 'artifact-review', hash: `sha256:${'a'.repeat(64)}` }], contentHash: `sha256:${'b'.repeat(64)}`, rationale: 'Added security review evidence.', createdByActorId: 'agent-coordinator' } },
    { id: 'decision-1', kind: 'decision', subtype: 'proposed', occurredAt: '2026-07-23T01:04:00.000Z', payload: { title: 'Ship this release?' } },
  ]
  let forceReleaseCalled = false
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const url = new URL(route.request().url()); const path = url.pathname; const method = route.request().method()
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/install-status') return body({ installed: true })
    if (path === '/api/v1/auth/me') return body({ actor, csrfToken: 'stage2-csrf' })
    if (path === '/api/v1/features') return body(featureRegistry)
    if (path === '/api/v1/info') return body(releaseInfo)
    if (path === '/api/v1/teams') return body({ items: [{ id: 'team-1', name: 'Engineering', key: 'ENG', revision: 1 }], nextCursor: null })
    if (path === '/api/v1/actors/humans') return body({ items: [{ id: actor.id, display_name: 'Alex', email: 'alex@example.test' }], nextCursor: null })
    if (path === '/api/v1/projects' || path === '/api/v1/views') return body({ items: [], nextCursor: null })
    if (path === '/api/v1/teams/team-1/states') return body({ items: [{ id: 'state-1', name: 'In progress', category: 'started', color: '#2563eb', revision: 1 }], nextCursor: null })
    if (path === '/api/v1/work-items') return body({ items: [workItem], nextCursor: null })
    if (path === '/api/v1/work-items/work-1') return body(workItem)
    if (path === '/api/v1/work-items/work-1/comments') return body({ items: [], nextCursor: null })
    if (path === '/api/v1/agents') return body({ items: [], nextCursor: null })
    if (path === '/api/v1/agent-sessions') return body({ items: sessions, nextCursor: null })
    if (path === '/api/v1/rooms') return body([{ id: 'room-1', activeParticipants: [{ id: actor.id, displayName: 'Alex' }, { id: 'agent-coordinator', displayName: 'Coordinator' }] }])
    if (path === '/api/v1/rooms/room-1/timeline') return body({ items: timeline, nextCursor: null })
    if (path === '/api/v1/leases') return body({ items: [{ id: 'lease-1', status: 'conflict', resourceType: 'plan_step', holderName: 'Reviewer', holderSessionId: 'session-child', planStepId: 'step-review', expiresAt: '2026-07-23T01:30:00.000Z', revision: 4 }], nextCursor: null })
    if (path === '/api/v1/handoffs') return body({ items: [{ id: 'handoff-1', status: 'requested', summary: 'Transfer the final validation.', requestedAction: 'Review the final evidence', toAgentName: 'Reviewer', scopeType: 'plan_step', scopeId: 'step-review', contextSnapshotId: 'snapshot-handoff', completedWork: ['Implementation complete'], remainingWork: ['Final review'], openQuestions: ['Is the evidence sufficient?'], risks: ['Release regression'], acceptanceCriteria: ['Reviewer approves'], leaseTransferPolicy: 'transfer', artifactIds: ['artifact-review'], routingSnapshot: { candidateIds: ['agent-reviewer'], selectedAgentId: 'agent-reviewer' }, revision: 1 }], nextCursor: null })
    if (path === '/api/v1/work-items/work-1/decisions') return body([{ id: 'decision-1', status: 'proposed', question: 'Ship this release?', proposedByActorId: 'agent-coordinator', options: [{ label: 'Ship' }, { label: 'Hold' }], revision: 2 }])
    if (path === '/api/v1/leases/lease-1/force-release' && method === 'POST') { forceReleaseCalled = true; return body({ id: 'lease-1', status: 'released' }) }
    if (path === '/api/v1/messages/msg-ask/resolve' && method === 'POST') return body({ id: 'msg-ask', status: 'resolved' })
    if (path === '/api/v1/events/stream') return route.fulfill({ status: 204, headers })
    return body({ error: { message: `Unexpected ${method} ${path}` } }, 404)
  })

  await page.goto('/')
  await page.locator('[data-work-item-id="work-1"] .wm-work-item-title').click()
  await expect(page.getByTestId('responsible-human')).toContainText('Alex')
  const executions = page.getByRole('region', { name: 'Agent executions' })
  await expect(executions).toContainText('Coordinator')
  await expect(executions).toContainText('Delegation: exclusive')
  await expect(executions).toContainText('Reviewer')
  await expect(executions).toContainText('Delegation: review_shared')
  const room = page.getByTestId('work-room')
  await expect(room).toContainText('Agent participants')
  await expect(room.getByRole('tab')).toHaveCount(6)
  await expect(room).toContainText('Can a human approve the release checklist?')
  await expect(room).toContainText('Approved after security review.')
  await expect(room).toContainText('Context delta')
  await expect(room).toContainText('Added security review evidence.')
  await expect(room).toContainText('snapshot-base')

  await room.getByRole('tab', { name: 'Plan' }).click()
  await expect(room.getByTestId('session-tree-session-parent')).toBeVisible()
  await expect(room.getByTestId('session-tree-session-child')).toBeVisible()

  await room.getByRole('tab', { name: 'Decisions' }).click()
  await expect(room.getByTestId('handoff-handoff-1')).toContainText('Review the final evidence')
  await expect(room.getByTestId('handoff-handoff-1')).toContainText('Final review')
  await expect(room.getByTestId('handoff-handoff-1')).toContainText('Routing: selected agent-reviewer')
  await expect(room.getByTestId('decision-decision-1')).toContainText('Agent proposal')

  await room.getByRole('tab', { name: 'Sessions' }).click()
  await expect(room.getByTestId('lease-lease-1')).toContainText('Lease conflict')
  page.once('dialog', dialog => dialog.accept())
  await room.getByRole('button', { name: 'Force release' }).click()
  await expect.poll(() => forceReleaseCalled).toBe(true)
})

test('renders a real API-backed multi-agent Work Room and controls durable collaboration state', async ({ page }) => {
  test.setTimeout(120_000)
  const installStatusResponse = await page.request.get(`${apiUrl}/api/v1/install-status`)
  expect(installStatusResponse.status()).toBe(200)
  const installStatus = await installStatusResponse.json() as { installed: boolean }
  if (!installStatus.installed) {
    await page.goto('/install')
    const installForm = page.getByTestId('install-form')
    await expect(installForm).toBeVisible()
    await installForm.getByPlaceholder('Workspace', { exact: true }).fill('Stage 2 collaboration workspace')
    await installForm.getByPlaceholder('workspace-slug').fill('stage2-collaboration')
    await installForm.getByPlaceholder('Your name').fill('Stage 2 human')
    await installForm.getByPlaceholder('Email').fill('stage2@example.test')
    await installForm.getByPlaceholder('At least 12 characters').fill('password-stage2-acceptance')
    await installForm.getByTestId('install-submit').click()
  } else {
    // The complete acceptance suite installs the workspace in Stage 0.
    await page.goto('/login')
    const loginForm = page.getByTestId('login-form')
    await expect(loginForm).toBeVisible()
    await loginForm.getByPlaceholder('Email').fill('alice@example.test')
    await loginForm.getByPlaceholder('Password').fill('password-acceptance')
    await loginForm.getByTestId('login-submit').click()
  }
  await page.waitForURL(url => url.pathname === '/')
  await expect(page.getByRole('heading', { name: 'WorkMesh', exact: true })).toBeVisible()

  const me = await humanApi<{ actor: { id: string } }>(page, '/api/v1/auth/me')
  const rootAgent = await humanApi<{ id: string; actor_id: string; installation_token: string }>(page, '/api/v1/agents/register', 'POST', {
    name: 'Stage 2 coordinator', slug: 'stage2-coordinator', provider: 'playwright', version: '1.0.0', supportedProtocols: ['native_http'], requestedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'], approvedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'], outputArtifactTypes: ['test_report'], maxConcurrency: 2, heartbeatIntervalSeconds: 30,
  })
  const childAgent = await humanApi<{ id: string; actor_id: string }>(page, '/api/v1/agents/register', 'POST', {
    name: 'Stage 2 reviewer', slug: 'stage2-reviewer', provider: 'playwright', version: '1.0.0', supportedProtocols: ['native_http'], requestedCapabilities: ['work:read', 'work:write', 'artifact:write'], approvedCapabilities: ['work:read', 'work:write', 'artifact:write'], outputArtifactTypes: ['test_report'], maxConcurrency: 2, heartbeatIntervalSeconds: 30,
  })
  expect(rootAgent.status).toBeLessThan(300); expect(childAgent.status).toBeLessThan(300)
  const team = await humanApi<{ id: string }>(page, '/api/v1/teams', 'POST', { name: 'Stage 2 delivery', key: 'S2D' })
  const rootAccess = await humanApi(page, `/api/v1/agents/${rootAgent.body.id}/team-access/${team.body.id}`, 'PUT', { approvedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'] })
  const childAccess = await humanApi(page, `/api/v1/agents/${childAgent.body.id}/team-access/${team.body.id}`, 'PUT', { approvedCapabilities: ['work:read', 'work:write', 'artifact:write'] })
  expect(rootAccess.status).toBeLessThan(300); expect(childAccess.status).toBeLessThan(300)
  const state = await humanApi<{ id: string }>(page, `/api/v1/teams/${team.body.id}/states`, 'POST', { name: 'Ready', category: 'planned', position: 0 })
  const work = await humanApi<{ id: string; revision: number }>(page, '/api/v1/work-items', 'POST', { teamId: team.body.id, title: 'Real Stage 2 collaboration room', statusId: state.body.id, priority: 'high', responsibleHumanActorId: me.body.actor.id })
  expect(work.status).toBeLessThan(300)

  const created = await humanApi<{ session: { id: string; revision: number; exchangeToken: string } }>(page, `/api/v1/work-items/${work.body.id}/agent-session`, 'POST', { agentId: rootAgent.body.id, principalHumanActorId: me.body.actor.id, role: 'executor', requestedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'], initialPrompt: 'Coordinate the Stage 2 browser acceptance flow.', budget: { maxRuntimeSeconds: 600 } }, work.body.revision)
  expect(created.status).toBeLessThan(300)
  const exchange = await agentApi<{ sessionToken: string }>(page, rootAgent.body.installation_token, `/api/v1/agent-sessions/${created.body.session.id}/token/exchange`, 'POST', { exchangeToken: created.body.session.exchangeToken })
  expect(exchange.status).toBeLessThan(300)
  const acknowledged = await agentApi<{ revision: number }>(page, exchange.body.sessionToken, `/api/v1/agent-sessions/${created.body.session.id}/ack`, 'POST', { summary: 'Accepted the Stage 2 browser flow.', externalUrls: [] })
  expect(acknowledged.status).toBeLessThan(300)
  const executing = await agentApi<{ revision: number }>(page, exchange.body.sessionToken, `/api/v1/agent-sessions/${created.body.session.id}/state`, 'POST', { state: 'executing', reason: 'Running the Stage 2 browser flow.' }, acknowledged.body.revision)
  expect(executing.status).toBeLessThan(300)

  const stepOne = '00000000-0000-4000-8000-000000000501'; const stepTwo = '00000000-0000-4000-8000-000000000502'
  const published = await agentApi<{ plan: { id: string } }>(page, exchange.body.sessionToken, `/api/v1/agent-sessions/${created.body.session.id}/plan`, 'PUT', { changeSummary: 'Split implementation and review.', steps: [{ id: stepOne, title: 'Implement collaboration', ordinal: 0, status: 'in_progress', acceptanceCriteria: ['Work Room is visible'], expectedArtifacts: [] }, { id: stepTwo, title: 'Review collaboration', ordinal: 1, status: 'pending', dependsOn: [stepOne], acceptanceCriteria: ['Human can audit messages'], expectedArtifacts: [] }] }, executing.body.revision)
  expect(published.status).toBeLessThan(300)
  const child = await agentApi<{ id: string }>(page, exchange.body.sessionToken, `/api/v1/agent-sessions/${created.body.session.id}/children`, 'POST', { agentId: childAgent.body.id, planStepId: stepTwo, planVersionId: published.body.plan.id, role: 'reviewer', initialPrompt: 'Review the collaboration output.', required: true, budget: { maxRuntimeSeconds: 120 } })
  expect(child.status).toBeLessThan(300)

  const room = await humanApi<{ id: string }>(page, `/api/v1/rooms?workItemId=${work.body.id}`)
  const ask = await agentApi<{ id: string }>(page, exchange.body.sessionToken, `/api/v1/rooms/${room.body.id}/messages`, 'POST', { intent: 'ask', body: 'Coordinator, can you validate the collaboration evidence?', recipientSessionId: created.body.session.id, sessionId: created.body.session.id, requiresResponse: true, payload: { planStepTitle: 'Review collaboration' } })
  expect(ask.status).toBeLessThan(300)
  const answer = await humanApi<{ id: string }>(page, `/api/v1/rooms/${room.body.id}/messages`, 'POST', { intent: 'answer', body: 'Yes. I will review the evidence in the Work Room.', replyToMessageId: ask.body.id, requiresResponse: false, payload: {} })
  const context = await humanApi<{ contextSnapshotId: string }>(page, `/api/v1/agent-sessions/${created.body.session.id}/context`)
  const evidenceHash = `sha256:${'c'.repeat(64)}`
  const contextArtifact = await agentApi<{ id: string }>(page, exchange.body.sessionToken, '/api/v1/artifacts', 'POST', { sessionId: created.body.session.id, workItemId: work.body.id, type: 'test_report', title: 'Stage 2 context evidence', uri: 'https://evidence.example.test/stage2-context-report', checksum: evidenceHash, metadata: {} })
  const delta = await agentApi(page, exchange.body.sessionToken, `/api/v1/agent-sessions/${created.body.session.id}/context-deltas`, 'POST', { baseSnapshotId: context.body.contextSnapshotId, additions: [{ sourceType: 'artifact', sourceId: contextArtifact.body.id, hash: evidenceHash }], rationale: 'Added real API-backed Stage 2 evidence.' })
  const lease = await humanApi<{ id: string }>(page, '/api/v1/leases', 'POST', { sessionId: created.body.session.id, resourceType: 'work_item', resourceId: work.body.id, kind: 'exclusive', ttlSeconds: 300, reason: 'Coordinate final acceptance.' })
  const handoff = await agentApi<{ id: string }>(page, exchange.body.sessionToken, '/api/v1/handoffs', 'POST', { fromSessionId: created.body.session.id, targetAgentId: childAgent.body.id, summary: 'Review the Stage 2 evidence.', completedWork: ['Created collaboration room'], remainingWork: ['Validate audit cards'], openQuestions: [], risks: [], acceptanceCriteria: ['Human can inspect messages'], requestedAction: 'Review and report', leaseTransferPolicy: 'retain', artifactIds: [], requestedCapabilities: ['work:read', 'work:write'] })
  const decision = await agentApi<{ id: string }>(page, exchange.body.sessionToken, `/api/v1/agent-sessions/${created.body.session.id}/decisions`, 'POST', { title: 'Ship Stage 2 collaboration UI?', rationale: 'The durable room shows human-visible messages and controls.', options: ['ship', 'hold'], evidence: [], affectedResources: [] })
  expect(answer.status).toBeLessThan(300); expect(context.status).toBeLessThan(300); expect(contextArtifact.status).toBeLessThan(300); expect(delta.status).toBeLessThan(300); expect(lease.status).toBeLessThan(300); expect(handoff.status).toBeLessThan(300); expect(decision.status).toBeLessThan(300)

  const projectedWork = await humanApi<{ responsible_human: { actor_id: string; display_name: string } | null; active_executor: { session_id: string; lease_id: string; execution_state: string } | null; shared_reviewers: unknown[] }>(page, `/api/v1/work-items/${work.body.id}`)
  expect(projectedWork.status).toBe(200)
  expect(projectedWork.body.responsible_human?.actor_id).toBe(me.body.actor.id)
  expect(projectedWork.body.responsible_human?.display_name).toBeTruthy()
  expect(projectedWork.body.active_executor).toMatchObject({ session_id: created.body.session.id, lease_id: lease.body.id, execution_state: 'executing' })
  expect(projectedWork.body.shared_reviewers).toEqual([])

  await page.goto('/')
  await page.getByLabel('Current team').first().selectOption(team.body.id)
  await page.locator(`[data-work-item-id="${work.body.id}"] .wm-work-item-title`).click()
  await expect(page.getByTestId('responsible-human')).toContainText(projectedWork.body.responsible_human!.display_name)
  const executions = page.getByRole('region', { name: 'Agent executions' })
  await expect(executions).toContainText('Stage 2 coordinator')
  await expect(executions).toContainText('Delegation: exclusive')
  await expect(executions).not.toContainText('Delegation: review_shared')
  const workRoom = page.getByTestId('work-room')
  await expect(workRoom.getByRole('tab')).toHaveCount(6)
  await expect(workRoom).toContainText('Coordinator, can you validate the collaboration evidence?')
  await expect(workRoom).toContainText('Yes. I will review the evidence in the Work Room.')
  await workRoom.getByRole('tab', { name: 'Plan' }).click()
  await expect(workRoom.getByTestId(`session-tree-${created.body.session.id}`)).toBeVisible()
  await expect(workRoom.getByTestId(`session-tree-${child.body.id}`)).toBeVisible()
  await workRoom.getByRole('tab', { name: 'Artifacts' }).click()
  await expect(workRoom).toContainText('Added real API-backed Stage 2 evidence.')
  await expect(workRoom).toContainText(evidenceHash)
  await workRoom.getByRole('tab', { name: 'Decisions' }).click()
  await expect(workRoom).toContainText('Review the Stage 2 evidence.')
  await expect(workRoom).toContainText('Agent proposal')
  await workRoom.getByRole('tab', { name: 'Sessions' }).click()
  await expect(workRoom.getByTestId(`lease-${lease.body.id}`)).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  const releaseResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/leases/${lease.body.id}/force-release`)
  await workRoom.getByRole('button', { name: 'Force release' }).click()
  expect((await releaseResponse).status()).toBeLessThan(300)
  const rootTree = workRoom.getByTestId(`session-tree-${created.body.session.id}`)
  const stopResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/agent-sessions/${created.body.session.id}/signals`)
  await rootTree.locator(':scope > div').getByRole('button', { name: 'Stop' }).click()
  expect((await stopResponse).status()).toBeLessThan(300)
})
