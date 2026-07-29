import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, opaqueToken, tokenHash } from '@workmesh/db'
import { buildApp } from '../src/server.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 2 API integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 2 API integration requires a dedicated *test* database.')

const db = createDb(databaseUrl)
type Page<T> = { items: T[]; nextCursor: string | null }
const app = buildApp()
type Response = { statusCode: number; headers: Record<string, string | string[] | number | undefined>; json: <T>() => T }
type Human = { cookie: string; csrf: string; actorId: string }
type Agent = { id: string; actorId: string; installationToken: string }
type Session = { id: string; revision: number; exchangeToken: string }
type Fixture = { human: Human; workspaceId: string; teamId: string; readyId: string; workItemId: string; parent: Session; parentToken: string; runner: Agent; reviewer: Agent; overflow: Agent; planVersionId: string; stepA: string; stepB: string; stepC: string }

const humanCall = async (human: Human, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object, extra: Record<string, string> = {}): Promise<Response> =>
  await app.inject({ method, url, payload, headers: { cookie: human.cookie, 'x-csrf-token': human.csrf, 'idempotency-key': randomUUID(), ...extra } }) as unknown as Response
const agentCall = async (token: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object, extra: Record<string, string> = {}): Promise<Response> =>
  await app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID(), ...extra } }) as unknown as Response

async function register(human: Human, teamId: string, slug: string): Promise<Agent> {
  const response = await humanCall(human, 'POST', '/api/v1/agents/register', { name: slug, slug, provider: 'fake', version: '1', supportedProtocols: ['native_http'], requestedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'], approvedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'], maxConcurrency: 2 })
  expect(response.statusCode).toBe(200)
  const created = response.json<{ id: string; installation_token: string }>()
  expect((await humanCall(human, 'PUT', `/api/v1/agents/${created.id}/team-access/${teamId}`, { approvedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'] })).statusCode).toBe(200)
  const row = await db.query<{ actor_id: string }>('SELECT actor_id FROM agent_definitions WHERE id=$1', [created.id])
  return { id: created.id, actorId: row.rows[0]!.actor_id, installationToken: created.installation_token }
}

async function registerWithoutTeamAccess(human: Human, slug: string): Promise<Agent> {
  const response = await humanCall(human, 'POST', '/api/v1/agents/register', { name: slug, slug, provider: 'fake', version: '1', supportedProtocols: ['native_http'], requestedCapabilities: ['work:read', 'work:write'], approvedCapabilities: ['work:read', 'work:write'], maxConcurrency: 2 })
  expect(response.statusCode).toBe(200)
  const created = response.json<{ id: string; installation_token: string }>()
  const row = await db.query<{ actor_id: string }>('SELECT actor_id FROM agent_definitions WHERE id=$1', [created.id])
  return { id: created.id, actorId: row.rows[0]!.actor_id, installationToken: created.installation_token }
}

async function start(human: Human, agent: Agent, workspaceId: string, teamId: string, workItemId: string, budget: Record<string, number> = {}, role: 'executor' | 'reviewer' = 'executor'): Promise<Session> {
  const delegation = await humanCall(human, 'POST', `/api/v1/work-items/${workItemId}/delegations`, {
    agentId: agent.id, principalHumanActorId: human.actorId, role, scopeType: 'work_item', scopeId: workItemId,
    permissionsSnapshot: ['work:read', 'work:write', 'plan:write', 'artifact:write'], capabilityScope: { workspaceId, teamIds: [teamId], projectIds: [], workItemIds: [workItemId], repositoryIds: [], capabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'] },
  })
  expect(delegation.statusCode).toBe(200)
  const response = await humanCall(human, 'POST', '/api/v1/agent-sessions', { delegationId: delegation.json<{ id: string }>().id, workItemId, initialPrompt: 'Stage 2 integration', budget })
  expect(response.statusCode).toBe(200)
  return response.json<Session>()
}

async function exchangeAndExecute(session: Session, agent: Agent): Promise<string> {
  const exchange = await app.inject({ method: 'POST', url: `/api/v1/agent-sessions/${session.id}/token/exchange`, payload: { exchangeToken: session.exchangeToken }, headers: { authorization: `Bearer ${agent.installationToken}`, 'idempotency-key': randomUUID() } }) as unknown as Response
  expect(exchange.statusCode).toBe(200)
  const token = exchange.json<{ sessionToken: string }>().sessionToken
  const ack = await agentCall(token, 'POST', `/api/v1/agent-sessions/${session.id}/ack`, { summary: 'accepted', externalUrls: [] })
  expect(ack.statusCode).toBe(200)
  const state = await agentCall(token, 'POST', `/api/v1/agent-sessions/${session.id}/state`, { state: 'executing', reason: 'integration' }, { 'if-match': `"revision-${ack.json<{ revision: number }>().revision}"` })
  expect(state.statusCode).toBe(200)
  return token
}

async function makeFixture(): Promise<Fixture> {
  await db.query('TRUNCATE workspaces CASCADE')
  const installed = await app.inject({ method: 'POST', url: '/api/v1/auth/install', payload: { name: 'Stage Two', slug: `stage-two-${randomUUID().slice(0, 8)}`, adminName: 'Admin', email: `${randomUUID()}@example.test`, password: 'stage-two-password' }, headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! } }) as unknown as Response
  expect(installed.statusCode, JSON.stringify(installed.json())).toBe(200)
  const setCookie = Array.isArray(installed.headers['set-cookie']) ? installed.headers['set-cookie'][0] : installed.headers['set-cookie']
  const cookie = typeof setCookie === 'string' ? setCookie.split(';')[0] ?? '' : ''
  const human = { cookie, csrf: installed.json<{ csrfToken: string }>().csrfToken, actorId: '' }
  const me = await humanCall(human, 'GET', '/api/v1/auth/me')
  human.actorId = me.json<{ actor: { id: string } }>().actor.id
  const teamId = (await humanCall(human, 'GET', '/api/v1/teams')).json<Page<{ id: string }>>().items[0]!.id
  const readyId = (await humanCall(human, 'GET', `/api/v1/teams/${teamId}/states`)).json<Page<{ id: string; name: string }>>().items.find(state => state.name === 'Ready')!.id
  const work = await humanCall(human, 'POST', '/api/v1/work-items', { teamId, title: 'Stage 2 collaboration', statusId: readyId, responsibleHumanActorId: human.actorId })
  const workItemId = work.json<{ id: string }>().id
  const workspaceId = (await db.query<{ workspace_id: string }>('SELECT workspace_id FROM work_items WHERE id=$1', [workItemId])).rows[0]!.workspace_id
  const runner = await register(human, teamId, `runner-${randomUUID().slice(0, 8)}`)
  const reviewer = await register(human, teamId, `reviewer-${randomUUID().slice(0, 8)}`)
  const overflow = await register(human, teamId, `overflow-${randomUUID().slice(0, 8)}`)
  const parent = await start(human, runner, workspaceId, teamId, workItemId, { maxRuntimeSeconds: 600, maxInputTokens: 200 })
  const parentToken = await exchangeAndExecute(parent, runner)
  const [stepA, stepB, stepC] = [randomUUID(), randomUUID(), randomUUID()]
  const revision = (await db.query<{ revision: number }>('SELECT revision FROM agent_sessions WHERE id=$1', [parent.id])).rows[0]!.revision
  const published = await agentCall(parentToken, 'PUT', `/api/v1/agent-sessions/${parent.id}/plan`, {
    changeSummary: 'Stage 2 coordination plan',
    steps: [
      { id: stepA, title: 'Implement A', ordinal: 0, dependsOn: [], acceptanceCriteria: ['Step A is accepted'], expectedArtifacts: ['test_report'], status: 'pending' },
      { id: stepB, title: 'Implement B', ordinal: 1, dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [], status: 'pending' },
      { id: stepC, title: 'Review C', ordinal: 2, dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [], status: 'pending' },
    ],
  }, { 'if-match': `"revision-${revision}"` })
  expect(published.statusCode).toBe(200)
  const planVersionId = (await db.query<{ current_plan_version_id: string }>('SELECT current_plan_version_id FROM agent_sessions WHERE id=$1', [parent.id])).rows[0]!.current_plan_version_id
  expect((await db.query<{ acceptance_criteria: string[]; expected_artifacts: string[] }>('SELECT acceptance_criteria,expected_artifacts FROM agent_plan_steps WHERE plan_version_id=$1 AND id=$2', [planVersionId, stepA])).rows[0]).toEqual({
    acceptance_criteria: ['Step A is accepted'],
    expected_artifacts: ['test_report'],
  })
  return { human, workspaceId, teamId, readyId, workItemId, parent, parentToken, runner, reviewer, overflow, planVersionId, stepA, stepB, stepC }
}

async function directSession(f: Fixture, agent: Agent, title: string): Promise<{ id: string; delegationId: string; workItemId: string }> {
  const work = await humanCall(f.human, 'POST', '/api/v1/work-items', { teamId: f.teamId, title, statusId: f.readyId, responsibleHumanActorId: f.human.actorId })
  const workItemId = work.json<{ id: string }>().id
  const context = await db.query<{ id: string }>('INSERT INTO context_snapshots(workspace_id,work_item_id,manifest,content_hash,created_by_actor_id) VALUES($1,$2,$3,$4,$5) RETURNING id', [f.workspaceId, workItemId, { workItem: { id: workItemId, title } }, `sha256:${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`, f.human.actorId])
  const delegation = await db.query<{ id: string }>("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id,permissions_snapshot,capability_scope) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,$7,$8) RETURNING id", [f.workspaceId, f.teamId, agent.id, agent.actorId, f.human.actorId, workItemId, ['work:read', 'work:write'], { workspaceId: f.workspaceId, teamIds: [f.teamId], workItemIds: [workItemId], capabilities: ['work:read', 'work:write'] }])
  const session = await db.query<{ id: string }>("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,context_snapshot_id,state,budget,inherited_budget) VALUES($1,$2,$3,$4,$5,$6,$7,'executing',$8,$8) RETURNING id", [f.workspaceId, f.teamId, agent.id, agent.actorId, delegation.rows[0]!.id, workItemId, context.rows[0]!.id, { maxRuntimeSeconds: 600, maxInputTokens: 200 }])
  return { id: session.rows[0]!.id, delegationId: delegation.rows[0]!.id, workItemId }
}

async function tokenFor(sessionId: string, agent: Agent): Promise<string> {
  const raw = opaqueToken()
  const installation = await db.query<{ id: string }>('SELECT id FROM agent_installation_tokens WHERE agent_id=$1 AND revoked_at IS NULL LIMIT 1', [agent.id])
  await db.query("INSERT INTO agent_session_tokens(session_id,agent_id,installation_token_id,token_hash,exchange_nonce_hash,expires_at,exchanged_at) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',now())", [sessionId, agent.id, installation.rows[0]!.id, tokenHash(raw), tokenHash(opaqueToken())])
  return raw
}

async function memberForTeam(workspaceId: string, teamId: string, role: 'maintainer' | 'member' = 'member'): Promise<Human> {
  const actorId = randomUUID()
  const raw = opaqueToken()
  const csrf = opaqueToken()
  await db.query("INSERT INTO actors(id,workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,$2,'human','member',$3,'Scoped member','unused')", [actorId, workspaceId, `${randomUUID()}@example.test`])
  await db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,$4)", [workspaceId, teamId, actorId, role])
  await db.query("INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [actorId, tokenHash(raw), csrf])
  return { cookie: `workmesh_session=${raw}`, csrf, actorId }
}

async function durableEvent(type: string, aggregateId: string): Promise<void> {
  const row = await db.query<{ event_count: number; outbox_count: number }>('SELECT count(*)::int AS event_count,(SELECT count(*)::int FROM outbox_events o JOIN domain_events d ON d.id=o.domain_event_id WHERE d.event_type=$1 AND d.aggregate_id=$2) AS outbox_count FROM domain_events WHERE event_type=$1 AND aggregate_id=$2', [type, aggregateId])
  expect(row.rows[0]).toMatchObject({ event_count: 1, outbox_count: 1 })
}

describe('Stage 2 collaboration API acceptance', () => {
  beforeAll(async () => { await applyMigrations(db) }, 300_000)
  beforeEach(async () => { await db.query('TRUNCATE workspaces CASCADE') })
  afterAll(async () => { await app.close(); await db.end() })

  it('coordinates exclusive and shared leases, child budgets, and durable parent blocking', async () => {
    const f = await makeFixture()
    const excessive = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/children`, { agentId: f.reviewer.id, planStepId: f.stepC, planVersionId: f.planVersionId, initialPrompt: 'too expensive', budget: { maxRuntimeSeconds: 601 } })
    expect(excessive.statusCode).toBe(409)
    expect(excessive.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'CHILD_BUDGET_EXCEEDED' } })
    const child = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/children`, { agentId: f.reviewer.id, planStepId: f.stepB, planVersionId: f.planVersionId, initialPrompt: 'Own step B', budget: { maxRuntimeSeconds: 300, maxInputTokens: 100 } })
    expect(child.statusCode).toBe(200)
    const childId = child.json<{ id: string }>().id
    const childToken = await tokenFor(childId, f.reviewer)
    const childAck = await agentCall(childToken, 'POST', `/api/v1/agent-sessions/${childId}/ack`, { summary: 'Own step B', externalUrls: [] })
    expect(childAck.statusCode, JSON.stringify(childAck.json())).toBe(200)
    const childExecuting = await agentCall(childToken, 'POST', `/api/v1/agent-sessions/${childId}/state`, { state: 'executing', reason: 'working step B' }, { 'if-match': `"revision-${childAck.json<{ revision: number }>().revision}"` })
    expect(childExecuting.statusCode, JSON.stringify(childExecuting.json())).toBe(200)
    const first = await agentCall(f.parentToken, 'POST', '/api/v1/leases', { sessionId: f.parent.id, resourceType: 'plan_step', resourceId: f.stepA, kind: 'exclusive', ttlSeconds: 60, reason: 'runner owns A' })
    expect(first.statusCode).toBe(200)
    const second = await agentCall(childToken, 'POST', '/api/v1/leases', { sessionId: childId, resourceType: 'plan_step', resourceId: f.stepB, kind: 'exclusive', ttlSeconds: 60, reason: 'reviewer owns B' })
    expect(second.statusCode).toBe(200)
    const conflict = await agentCall(childToken, 'POST', '/api/v1/leases', { sessionId: childId, resourceType: 'plan_step', resourceId: f.stepA, kind: 'exclusive', ttlSeconds: 60, reason: 'must conflict' })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json<{ error: { code: string; details: { holderSessionId: string } } }>()).toMatchObject({ error: { code: 'LEASE_CONFLICT', details: { holderSessionId: f.parent.id } } })
    await durableEvent('lease.acquired', first.json<{ id: string }>().id)
    await durableEvent('lease.acquired', second.json<{ id: string }>().id)

    const review = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/review-delegations`, { reviewerAgentId: f.reviewer.id, planStepId: f.stepC, planVersionId: f.planVersionId, initialPrompt: 'Review C', ttlSeconds: 60 })
    expect(review.statusCode, JSON.stringify(review.json())).toBe(200)
    const reviewLease = review.json<{ lease: { id: string; kind: string }; session: { id: string; required_for_parent: boolean } }>()
    expect(reviewLease.lease.kind).toBe('review_shared')
    expect((await db.query<{ kind: string; status: string; required_for_parent: boolean }>('SELECT l.kind,l.status,s.required_for_parent FROM leases l JOIN agent_sessions s ON s.id=l.session_id WHERE l.id=$1', [reviewLease.lease.id])).rows[0]).toEqual({ kind: 'review_shared', status: 'active', required_for_parent: true })
    await durableEvent('review.delegation.created', reviewLease.lease.id)
    const reviewerToken = await tokenFor(reviewLease.session.id, f.reviewer)
    const reviewerAck = await agentCall(reviewerToken, 'POST', `/api/v1/agent-sessions/${reviewLease.session.id}/ack`, { summary: 'review accepted', externalUrls: [] })
    expect(reviewerAck.statusCode).toBe(200)
    const reviewerExecuting = await agentCall(reviewerToken, 'POST', `/api/v1/agent-sessions/${reviewLease.session.id}/state`, { state: 'executing', reason: 'reviewing step C' }, { 'if-match': `"revision-${reviewerAck.json<{ revision: number }>().revision}"` })
    expect(reviewerExecuting.statusCode).toBe(200)
    const reviewerPlanWrite = await agentCall(reviewerToken, 'PUT', `/api/v1/agent-sessions/${reviewLease.session.id}/plan`, { changeSummary: 'Reviewer must not complete implementation', steps: [{ id: f.stepC, title: 'Review C', ordinal: 0, dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [], status: 'completed' }] }, { 'if-match': `"revision-${reviewerExecuting.json<{ revision: number }>().revision}"` })
    expect(reviewerPlanWrite.statusCode).toBe(403)
    expect(reviewerPlanWrite.json<{ error: { code: string } }>()).toMatchObject({ error: { code: expect.stringMatching(/CAPABILITY_DENIED|FORBIDDEN/) } })
    const missingDeliverables = await agentCall(reviewerToken, 'POST', `/api/v1/agent-sessions/${reviewLease.session.id}/complete`, { summary: 'review without protocol deliverables', artifactIds: [], checks: [], limitations: [], noArtifactReason: 'attempted omission' }, { 'if-match': `"revision-${reviewerExecuting.json<{ revision: number }>().revision}"` })
    expect(missingDeliverables.statusCode).toBe(409)
    expect(missingDeliverables.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'REVIEW_COMPLETION_EVIDENCE_REQUIRED' } })
    const codeReview = await agentCall(reviewerToken, 'POST', '/api/v1/artifacts', { sessionId: reviewLease.session.id, workItemId: f.workItemId, type: 'code_review', title: 'Step C review', metadata: { verdict: 'approved' } })
    expect(codeReview.statusCode).toBe(200)
    const parentRoomId = (await db.query<{ id: string }>("SELECT id FROM work_room_channels WHERE subject_kind='session' AND subject_id=$1", [f.parent.id])).rows[0]!.id
    const reviewResult = await agentCall(reviewerToken, 'POST', `/api/v1/rooms/${parentRoomId}/messages`, { sessionId: reviewLease.session.id, intent: 'review_result', body: 'Step C review passed.', payload: { verdict: 'approved', artifactId: codeReview.json<{ id: string }>().id } })
    expect(reviewResult.statusCode).toBe(200)
    const reviewerRevision = (await db.query<{ revision: number }>('SELECT revision FROM agent_sessions WHERE id=$1', [reviewLease.session.id])).rows[0]!.revision
    const reviewComplete = await agentCall(reviewerToken, 'POST', `/api/v1/agent-sessions/${reviewLease.session.id}/complete`, { summary: 'Step C reviewed', artifactIds: [codeReview.json<{ id: string }>().id], checks: [{ name: 'review protocol', status: 'passed', summary: 'review_result and code_review recorded' }], limitations: [] }, { 'if-match': `"revision-${reviewerRevision}"` })
    expect(reviewComplete.statusCode, JSON.stringify(reviewComplete.json())).toBe(200)

    const inherited = await db.query<{ budget: Record<string, number>; inherited_budget: Record<string, number>; required_for_parent: boolean }>('SELECT budget,inherited_budget,required_for_parent FROM agent_sessions WHERE id=$1', [childId])
    expect(inherited.rows[0]).toEqual({ budget: { maxRuntimeSeconds: 300, maxInputTokens: 100 }, inherited_budget: { maxRuntimeSeconds: 300, maxInputTokens: 100 }, required_for_parent: true })
    await db.query('UPDATE agent_sessions SET max_child_sessions=1 WHERE id=$1', [f.parent.id])
    const overLimit = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/children`, { agentId: f.overflow.id, planStepId: f.stepC, planVersionId: f.planVersionId, initialPrompt: 'one too many' })
    expect(overLimit.statusCode, JSON.stringify(overLimit.json())).toBe(409)
    expect(overLimit.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'CHILD_SESSION_LIMIT' } })
    const revision = (await db.query<{ revision: number }>('SELECT revision FROM agent_sessions WHERE id=$1', [f.parent.id])).rows[0]!.revision
    const blocked = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/complete`, { summary: 'cannot complete', artifactIds: [], checks: [{ name: 'unit', status: 'passed', summary: 'ok' }], limitations: [] }, { 'if-match': `"revision-${revision}"` })
    expect(blocked.statusCode, JSON.stringify(blocked.json())).toBe(409)
    expect(blocked.json<{ error: { code: string; details: { blockerSessionIds: string[] } } }>()).toMatchObject({ error: { code: 'COMPLETION_PLAN_INCOMPLETE', details: { blockerSessionIds: [childId] } } })
  })

  it('audits human-visible ask/answer, rejects hidden messages and cross-scope context deltas, and records force release', async () => {
    const f = await makeFixture()
    const child = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/children`, { agentId: f.reviewer.id, planStepId: f.stepB, planVersionId: f.planVersionId, initialPrompt: 'Answer the coordinator', budget: { maxRuntimeSeconds: 120, maxInputTokens: 50 } })
    expect(child.statusCode).toBe(200)
    const childId = child.json<{ id: string }>().id
    const childToken = await tokenFor(childId, f.reviewer)
    const childAck = await agentCall(childToken, 'POST', `/api/v1/agent-sessions/${childId}/ack`, { summary: 'ready to answer', externalUrls: [] })
    expect(childAck.statusCode).toBe(200)
    const childExecuting = await agentCall(childToken, 'POST', `/api/v1/agent-sessions/${childId}/state`, { state: 'executing', reason: 'responding to coordinator' }, { 'if-match': `"revision-${childAck.json<{ revision: number }>().revision}"` })
    expect(childExecuting.statusCode).toBe(200)
    const sibling = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/children`, { agentId: f.overflow.id, planStepId: f.stepC, planVersionId: f.planVersionId, initialPrompt: 'Remain isolated from the reviewer Inbox', budget: { maxRuntimeSeconds: 120, maxInputTokens: 50 } })
    expect(sibling.statusCode).toBe(200)
    const siblingId = sibling.json<{ id: string }>().id
    const siblingToken = await tokenFor(siblingId, f.overflow)
    const siblingAck = await agentCall(siblingToken, 'POST', `/api/v1/agent-sessions/${siblingId}/ack`, { summary: 'ready but not the recipient', externalUrls: [] })
    expect(siblingAck.statusCode).toBe(200)
    const room = await humanCall(f.human, 'GET', `/api/v1/rooms?sessionId=${f.parent.id}`)
    expect(room.statusCode).toBe(200)
    const channelId = room.json<{ id: string }>().id
    const ask = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, { sessionId: f.parent.id, intent: 'ask', body: 'May I proceed?', recipientSessionId: childId, requiresResponse: true })
    expect(ask.statusCode).toBe(200)
    const askId = ask.json<{ id: string }>().id
    const childInbox = await agentCall(childToken, 'GET', '/api/v1/inbox')
    expect(childInbox.statusCode).toBe(200)
    const childAskItem = childInbox.json<Page<{ id: string; source_id: string }>>().items.find(item => item.source_id === askId)
    expect(childAskItem).toBeDefined()
    expect((await agentCall(childToken, 'GET', `/api/v1/inbox/${childAskItem!.id}`)).statusCode).toBe(200)
    expect((await agentCall(siblingToken, 'GET', `/api/v1/inbox/${childAskItem!.id}`)).statusCode).toBe(404)
    const answer = await agentCall(childToken, 'POST', `/api/v1/rooms/${channelId}/messages`, { sessionId: childId, intent: 'answer', body: 'Yes, proceed.', recipientSessionId: f.parent.id, replyToMessageId: askId })
    expect(answer.statusCode).toBe(200)
    expect((await humanCall(f.human, 'GET', '/api/v1/inbox?status=resolved')).json<Page<{ source_id: string; kind: string }>>().items).toEqual(expect.arrayContaining([expect.objectContaining({ source_id: askId, kind: 'ask' })]))
    const timeline = await humanCall(f.human, 'GET', `/api/v1/rooms/${channelId}/timeline`)
    expect(timeline.statusCode).toBe(200)
    expect(timeline.json<{ items: Array<{ kind: string; subtype: string }> }>().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'message', subtype: 'ask' }),
      expect.objectContaining({ kind: 'message', subtype: 'answer' }),
    ]))
    await durableEvent('room.message.posted', askId)
    await durableEvent('room.message.posted', answer.json<{ id: string }>().id)

    const beforeHidden = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM room_messages')
    const hidden = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, { sessionId: f.parent.id, intent: 'inform', body: 'do not hide', payload: { visibility: 'private' } })
    expect(hidden.statusCode).toBe(400)
    const alsoHidden = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, { sessionId: f.parent.id, intent: 'inform', body: 'do not hide', payload: { visibility: 'hidden' } })
    expect(alsoHidden.statusCode).toBe(400)
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM room_messages')).rows[0]!.count).toBe(beforeHidden.rows[0]!.count)

    const foreign = await db.query<{ id: string }>("INSERT INTO workspaces(name,slug) VALUES('Foreign', $1) RETURNING id", [`foreign-${randomUUID().slice(0, 8)}`])
    const foreignActor = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','admin',$2,'Foreign admin','unused') RETURNING id", [foreign.rows[0]!.id, `${randomUUID()}@example.test`])
    const foreignSnapshot = await db.query<{ id: string }>("INSERT INTO context_snapshots(workspace_id,manifest,content_hash,created_by_actor_id) VALUES($1,'{}',$2,$3) RETURNING id", [foreign.rows[0]!.id, `sha256:${randomUUID().replaceAll('-', '')}`, foreignActor.rows[0]!.id])
    const beforeDelta = await db.query<{ delta_count: number; event_count: number; outbox_count: number }>("SELECT (SELECT count(*)::int FROM context_deltas) AS delta_count,(SELECT count(*)::int FROM domain_events WHERE event_type='context.delta.appended') AS event_count,(SELECT count(*)::int FROM outbox_events) AS outbox_count")
    const denied = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/context-deltas`, { baseSnapshotId: foreignSnapshot.rows[0]!.id, additions: [{ sourceType: 'message', sourceId: foreignSnapshot.rows[0]!.id, hash: `sha256:${'0'.repeat(64)}` }], rationale: 'must not cross tenant' })
    expect(denied.statusCode).toBe(403)
    expect(denied.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'RESOURCE_SCOPE_DENIED' } })
    expect((await db.query<{ delta_count: number; event_count: number; outbox_count: number }>("SELECT (SELECT count(*)::int FROM context_deltas) AS delta_count,(SELECT count(*)::int FROM domain_events WHERE event_type='context.delta.appended') AS event_count,(SELECT count(*)::int FROM outbox_events) AS outbox_count")).rows[0]).toEqual(beforeDelta.rows[0])

    const sourceHash = `sha256:${'1'.repeat(64)}`
    const artifact = await agentCall(f.parentToken, 'POST', '/api/v1/artifacts', { sessionId: f.parent.id, workItemId: f.workItemId, type: 'test_report', title: 'Authorized context evidence', uri: 'https://evidence.example.test/stage2-context-report', checksum: sourceHash, metadata: {} })
    expect(artifact.statusCode).toBe(200)
    const baseSnapshotId = (await db.query<{ context_snapshot_id: string }>('SELECT context_snapshot_id FROM agent_sessions WHERE id=$1', [f.parent.id])).rows[0]!.context_snapshot_id
    const appended = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/context-deltas`, {
      baseSnapshotId,
      additions: [{ sourceType: 'artifact', sourceId: artifact.json<{ id: string }>().id, hash: sourceHash }],
      rationale: 'Add verified test evidence without mutating the original snapshot',
    })
    expect(appended.statusCode, JSON.stringify(appended.json())).toBe(200)
    const deltaId = appended.json<{ delta: { id: string } }>().delta.id
    expect((await db.query<{ additions: Array<{ sourceType: string; sourceId: string; hash: string }>; content_hash: string; rationale: string }>('SELECT additions,content_hash,rationale FROM context_deltas WHERE id=$1', [deltaId])).rows[0]).toEqual({
      additions: [{ sourceType: 'artifact', sourceId: artifact.json<{ id: string }>().id, hash: sourceHash }],
      content_hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      rationale: 'Add verified test evidence without mutating the original snapshot',
    })
    const deltaTimeline = await humanCall(f.human, 'GET', `/api/v1/rooms/${channelId}/timeline`)
    expect(deltaTimeline.json<{ items: Array<{ id: string; kind: string; payload: { additions: unknown[]; contentHash: string; rationale: string } }> }>().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: deltaId, kind: 'context_delta', payload: expect.objectContaining({ additions: expect.any(Array), rationale: 'Add verified test evidence without mutating the original snapshot' }) }),
    ]))
    const deltaHandoff = await agentCall(f.parentToken, 'POST', '/api/v1/handoffs', {
      fromSessionId: f.parent.id,
      targetAgentId: f.runner.id,
      summary: 'Continue from the context delta snapshot',
      completedWork: ['Added verified context evidence'],
      remainingWork: ['Inspect the delta lineage'],
      openQuestions: [],
      risks: [],
      acceptanceCriteria: ['Handoff snapshot preserves JSON sources'],
      requestedAction: 'Inspect context lineage',
      leaseTransferPolicy: 'retain',
      artifactIds: [artifact.json<{ id: string }>().id],
      requestedCapabilities: ['work:read', 'work:write'],
      status: 'draft',
    })
    expect(deltaHandoff.statusCode, JSON.stringify(deltaHandoff.json())).toBe(200)

    const unrelated = await humanCall(f.human, 'POST', '/api/v1/work-items', { teamId: f.teamId, title: 'Unrelated lease target', statusId: f.readyId, responsibleHumanActorId: f.human.actorId })
    const deniedLease = await agentCall(f.parentToken, 'POST', '/api/v1/leases', { sessionId: f.parent.id, resourceType: 'work_item', resourceId: unrelated.json<{ id: string }>().id, kind: 'exclusive', ttlSeconds: 60, reason: 'a lease must not grant scope' })
    expect(deniedLease.statusCode).toBe(403)
    expect(deniedLease.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'RESOURCE_SCOPE_DENIED' } })
    const lease = await agentCall(f.parentToken, 'POST', '/api/v1/leases', { sessionId: f.parent.id, resourceType: 'work_item', resourceId: f.workItemId, kind: 'exclusive', ttlSeconds: 60, reason: 'hold before force release' })
    expect(lease.statusCode, JSON.stringify(lease.json())).toBe(200)
    const leased = lease.json<{ id: string; version: number; revision: number }>()
    expect(leased).toMatchObject({ version: 1, revision: 1 })
    expect(lease.headers.etag).toBe('"revision-1"')
    const listed = await humanCall(f.human, 'GET', `/api/v1/leases?sessionId=${f.parent.id}`)
    expect(listed.statusCode, JSON.stringify(listed.json())).toBe(200)
    expect(listed.json<Page<{ id: string; version: number; revision: number }>>().items)
      .toContainEqual(expect.objectContaining({ id: leased.id, version: 1, revision: 1 }))
    const forceUrl = `/api/v1/leases/${leased.id}/force-release`
    const missingRevision = await humanCall(f.human, 'POST', forceUrl, { reason: 'missing optimistic lock' })
    expect(missingRevision.statusCode).toBe(400)
    expect(missingRevision.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'IF_MATCH_REQUIRED' } })
    const staleRevision = await humanCall(f.human, 'POST', forceUrl, { reason: 'stale optimistic lock' }, { 'if-match': '"revision-0"' })
    expect(staleRevision.statusCode).toBe(409)
    expect(staleRevision.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'REVISION_CONFLICT' } })
    expect((await db.query<{ status: string; version: number }>('SELECT status,version FROM leases WHERE id=$1', [leased.id])).rows[0]).toEqual({ status: 'active', version: 1 })
    const forceKey = `force-release:${randomUUID()}`
    const forceHeaders = { 'if-match': `"revision-${leased.revision}"`, 'idempotency-key': forceKey }
    const forced = await humanCall(f.human, 'POST', forceUrl, { reason: 'operator intervention' }, forceHeaders)
    const replay = await humanCall(f.human, 'POST', forceUrl, { reason: 'operator intervention' }, forceHeaders)
    expect(forced.statusCode, JSON.stringify(forced.json())).toBe(200)
    expect(replay.statusCode, JSON.stringify(replay.json())).toBe(200)
    expect(replay.json()).toEqual(forced.json())
    expect(forced.json<{ version: number; revision: number }>()).toMatchObject({ version: 2, revision: 2 })
    expect(forced.headers.etag).toBe('"revision-2"')
    expect((await db.query<{ status: string; audit_reason: string; version: number }>('SELECT status,audit_reason,version FROM leases WHERE id=$1', [leased.id])).rows[0]).toEqual({ status: 'revoked', audit_reason: 'operator intervention', version: 2 })
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM domain_events WHERE aggregate_id=$1 AND event_type='lease.revoked'", [leased.id])).rows[0]!.count).toBe(1)
    await durableEvent('lease.revoked', leased.id)
  })

  it('claims actor Inbox items once and keeps exact Session ask, review, blocker, and mention flows isolated', async () => {
    const f = await makeFixture()
    const reviewerSession = await start(f.human, f.reviewer, f.workspaceId, f.teamId, f.workItemId, {}, 'reviewer')
    const reviewerDelegationId = (await db.query<{ delegation_id: string }>('SELECT delegation_id FROM agent_sessions WHERE id=$1', [reviewerSession.id])).rows[0]!.delegation_id
    const siblingResponse = await humanCall(f.human, 'POST', '/api/v1/agent-sessions', {
      delegationId: reviewerDelegationId, workItemId: f.workItemId, initialPrompt: 'Compete for actor-targeted Inbox work', budget: {},
    })
    expect(siblingResponse.statusCode, JSON.stringify(siblingResponse.json())).toBe(200)
    const siblingSession = siblingResponse.json<Session>()
    const siblingToken = await exchangeAndExecute(siblingSession, f.reviewer)
    const reviewerToken = await exchangeAndExecute(reviewerSession, f.reviewer)
    const room = await humanCall(f.human, 'GET', `/api/v1/rooms?workItemId=${f.workItemId}`)
    expect(room.statusCode).toBe(200)
    const channelId = room.json<{ id: string }>().id

    const beforePluralExact = (await db.query<{ cursor: string }>(
      'SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const pluralExact = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'inform', body: 'Each exact Session receives its own Inbox projection.',
      recipientSessionIds: [siblingSession.id, reviewerSession.id],
    })
    expect(pluralExact.statusCode, JSON.stringify(pluralExact.json())).toBe(200)
    const pluralExactId = pluralExact.json<{ id: string }>().id
    const pluralExactItems = (await db.query<{ id: string; recipient_session_id: string }>(`SELECT id,recipient_session_id
      FROM inbox_items WHERE source_type='room_message' AND source_id=$1 ORDER BY recipient_session_id`,
    [pluralExactId])).rows
    expect(pluralExactItems.map(item => item.recipient_session_id).sort()).toEqual([siblingSession.id, reviewerSession.id].sort())
    expect(pluralExactItems).toHaveLength(2)
    for (const [token, session] of [[siblingToken, siblingSession], [reviewerToken, reviewerSession]] as const) {
      const visibleEvents = (await agentCall(token, 'GET', `/api/v1/events?cursor=${beforePluralExact}`))
        .json<Array<{ aggregate_id: string; event_type: string; session_id: string; audience_actor_id: string }>>()
      const exactEvents = visibleEvents
        .filter(event => event.aggregate_id === pluralExactId && event.event_type === 'room.message.posted')
      expect(exactEvents).toEqual([
        expect.objectContaining({
          session_id: session.id,
          audience_actor_id: f.reviewer.actorId,
        }),
      ])
      expect(visibleEvents.find(event =>
        event.aggregate_id === pluralExactId
        && event.event_type === 'room.message.human_visibility_recorded',
      )).toBeUndefined()
    }
    const humanObserverEvents = (await humanCall(f.human, 'GET', `/api/v1/events?cursor=${beforePluralExact}`))
      .json<Array<{
        aggregate_id: string
        event_type: string
        invalidates: Array<{ type: string; id: string }>
      }>>()
      .filter(event =>
        event.aggregate_id === pluralExactId
        && event.event_type === 'room.message.human_visibility_recorded',
      )
    expect(humanObserverEvents).toEqual([
      expect.objectContaining({
        invalidates: expect.arrayContaining([
          { type: 'work_item', id: f.workItemId },
        ]),
      }),
    ])
    const pluralExactDurability = (await db.query<{
      events: number; outbox: number; generic_events: number; target_sessions: string[]
    }>(`SELECT count(DISTINCT event.id)::int AS events,
              count(outbox.id)::int AS outbox,
              count(*) FILTER (WHERE event.audience_actor_id IS NULL)::int AS generic_events,
              array_agg(event.session_id::text ORDER BY event.session_id) AS target_sessions
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE event.aggregate_id=$1 AND event.event_type='room.message.posted'`,
    [pluralExactId])).rows[0]!
    expect(pluralExactDurability).toEqual({
      events: 2,
      outbox: 2,
      generic_events: 0,
      target_sessions: [siblingSession.id, reviewerSession.id].sort(),
    })
    expect((await db.query<{ events: number; outbox: number }>(`SELECT
      count(DISTINCT event.id)::int AS events,count(outbox.id)::int AS outbox
      FROM domain_events event
      JOIN outbox_events outbox ON outbox.domain_event_id=event.id
      WHERE event.aggregate_id=$1
        AND event.event_type='room.message.human_visibility_recorded'`,
    [pluralExactId])).rows[0]).toEqual({ events: 1, outbox: 1 })

    const sessionRoomId = (await db.query<{ id: string }>("SELECT id FROM work_room_channels WHERE subject_kind='session' AND subject_id=$1", [f.parent.id])).rows[0]!.id
    const beforeSessionRoomActorTarget = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM room_messages')).rows[0]!.count
    const deniedSessionRoomActorTarget = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${sessionRoomId}/messages`, {
      sessionId: f.parent.id, intent: 'ask', body: 'Actor targeting must not expand a Session room.', recipientActorId: f.reviewer.actorId, requiresResponse: true,
    })
    expect(deniedSessionRoomActorTarget.statusCode).toBe(400)
    expect(deniedSessionRoomActorTarget.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'MESSAGE_RECIPIENT_OUT_OF_SCOPE' } })
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM room_messages')).rows[0]!.count).toBe(beforeSessionRoomActorTarget)

    const projectionCounts = async () => (await db.query<{ messages: number; inbox: number; events: number; outbox: number }>(`SELECT
      (SELECT count(*)::int FROM room_messages) AS messages,
      (SELECT count(*)::int FROM inbox_items) AS inbox,
      (SELECT count(*)::int FROM domain_events) AS events,
      (SELECT count(*)::int FROM outbox_events) AS outbox`)).rows[0]!
    const assertDeniedProjection = async (response: Response, code: string, before: Awaited<ReturnType<typeof projectionCounts>>) => {
      expect(response.statusCode).not.toBe(200)
      expect(response.json<{ error: { code: string } }>()).toMatchObject({ error: { code } })
      expect(await projectionCounts()).toEqual(before)
    }
    const parentAuthority = (await db.query<{
      agent_id: string
      delegation_id: string
      capability_scope: Record<string, unknown>
      team_capabilities: string[]
    }>(`SELECT s.agent_id,s.delegation_id,d.capability_scope,
              ata.approved_capabilities AS team_capabilities
         FROM agent_sessions s
         JOIN delegations d ON d.id=s.delegation_id
         JOIN agent_team_access ata
           ON ata.workspace_id=s.workspace_id AND ata.team_id=s.team_id AND ata.agent_id=s.agent_id
        WHERE s.id=$1`, [f.parent.id])).rows[0]!
    let beforeDenied = await projectionCounts()
    await db.query('UPDATE agent_team_access SET revoked_at=now() WHERE workspace_id=$1 AND team_id=$2 AND agent_id=$3', [f.workspaceId, f.teamId, parentAuthority.agent_id])
    const revokedSender = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'blocker', body: 'Revoked Team access must fail.', recipientActorId: f.reviewer.actorId,
    })
    await db.query('UPDATE agent_team_access SET revoked_at=NULL WHERE workspace_id=$1 AND team_id=$2 AND agent_id=$3', [f.workspaceId, f.teamId, parentAuthority.agent_id])
    await assertDeniedProjection(revokedSender, 'DELEGATION_NOT_ACTIVE', beforeDenied)

    beforeDenied = await projectionCounts()
    await db.query('UPDATE agent_definitions SET is_active=false WHERE id=$1', [parentAuthority.agent_id])
    const disabledSender = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'blocker', body: 'Disabled Agent must fail.', recipientActorId: f.reviewer.actorId,
    })
    await db.query('UPDATE agent_definitions SET is_active=true WHERE id=$1', [parentAuthority.agent_id])
    await assertDeniedProjection(disabledSender, 'UNAUTHENTICATED', beforeDenied)

    beforeDenied = await projectionCounts()
    await db.query("UPDATE agent_team_access SET approved_capabilities=array_remove(approved_capabilities,'work:write') WHERE workspace_id=$1 AND team_id=$2 AND agent_id=$3", [f.workspaceId, f.teamId, parentAuthority.agent_id])
    const narrowedSender = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'blocker', body: 'Narrowed capability must fail.', recipientActorId: f.reviewer.actorId,
    })
    await db.query('UPDATE agent_team_access SET approved_capabilities=$4 WHERE workspace_id=$1 AND team_id=$2 AND agent_id=$3', [f.workspaceId, f.teamId, parentAuthority.agent_id, parentAuthority.team_capabilities])
    await assertDeniedProjection(narrowedSender, 'CAPABILITY_DENIED', beforeDenied)

    beforeDenied = await projectionCounts()
    await db.query("UPDATE delegations SET capability_scope=jsonb_set(capability_scope,'{workItemIds}','[]'::jsonb) WHERE id=$1", [parentAuthority.delegation_id])
    const outOfScopeSender = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'blocker', body: 'Removed resource scope must fail.', recipientActorId: f.reviewer.actorId,
    })
    await db.query('UPDATE delegations SET capability_scope=$2 WHERE id=$1', [parentAuthority.delegation_id, parentAuthority.capability_scope])
    await assertDeniedProjection(outOfScopeSender, 'RESOURCE_SCOPE_DENIED', beforeDenied)

    const targetTeamCapabilities = (await db.query<{ approved_capabilities: string[] }>(
      `SELECT approved_capabilities FROM agent_team_access
        WHERE workspace_id=$1 AND team_id=$2 AND agent_id=$3`,
      [f.workspaceId, f.teamId, f.reviewer.id],
    )).rows[0]!.approved_capabilities
    const targetDelegationScope = (await db.query<{ capability_scope: Record<string, unknown> }>(
      'SELECT capability_scope FROM delegations WHERE id=$1',
      [reviewerDelegationId],
    )).rows[0]!.capability_scope
    const targetDenied = async (body: string) => {
      const before = await projectionCounts()
      const response = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
        sessionId: f.parent.id, intent: 'blocker', body, recipientActorId: f.reviewer.actorId,
      })
      await assertDeniedProjection(response, 'MESSAGE_RECIPIENT_OUT_OF_SCOPE', before)
    }
    await db.query('UPDATE agent_definitions SET is_active=false WHERE id=$1', [f.reviewer.id])
    await targetDenied('Disabled recipient definition must fail before Inbox projection.')
    await db.query('UPDATE agent_definitions SET is_active=true WHERE id=$1', [f.reviewer.id])
    beforeDenied = await projectionCounts()
    await db.query('UPDATE actors SET is_active=false WHERE id=$1', [f.reviewer.actorId])
    const inactiveExactRecipient = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'blocker', body: 'Inactive exact recipient Actor must fail before Inbox projection.', recipientSessionId: reviewerSession.id,
    })
    await db.query('UPDATE actors SET is_active=true WHERE id=$1', [f.reviewer.actorId])
    await assertDeniedProjection(inactiveExactRecipient, 'MESSAGE_RECIPIENT_OUT_OF_SCOPE', beforeDenied)
    await db.query("UPDATE agent_team_access SET approved_capabilities=array_remove(approved_capabilities,'work:read') WHERE workspace_id=$1 AND team_id=$2 AND agent_id=$3", [f.workspaceId, f.teamId, f.reviewer.id])
    await targetDenied('Recipient capability narrowing must fail before Inbox projection.')
    await db.query('UPDATE agent_team_access SET approved_capabilities=$4 WHERE workspace_id=$1 AND team_id=$2 AND agent_id=$3', [f.workspaceId, f.teamId, f.reviewer.id, targetTeamCapabilities])
    await db.query("UPDATE delegations SET status='revoked',revoked_at=now() WHERE id=$1", [reviewerDelegationId])
    await targetDenied('Revoked recipient delegation must fail before Inbox projection.')
    await db.query("UPDATE delegations SET status='active',revoked_at=NULL WHERE id=$1", [reviewerDelegationId])
    await db.query("UPDATE agent_sessions SET state='stale' WHERE id=ANY($1::uuid[])", [[reviewerSession.id, siblingSession.id]])
    await targetDenied('Stale recipient Sessions must fail before Inbox projection.')
    await db.query("UPDATE agent_sessions SET state='executing' WHERE id=ANY($1::uuid[])", [[reviewerSession.id, siblingSession.id]])
    await db.query("UPDATE delegations SET capability_scope=jsonb_set(capability_scope,'{workItemIds}','[]'::jsonb) WHERE id=$1", [reviewerDelegationId])
    await targetDenied('Out-of-scope recipient delegation must fail before Inbox projection.')
    await db.query('UPDATE delegations SET capability_scope=$2 WHERE id=$1', [reviewerDelegationId, targetDelegationScope])
    const revokeGate = await db.connect()
    await revokeGate.query('BEGIN')
    await revokeGate.query('UPDATE agent_team_access SET revoked_at=now() WHERE workspace_id=$1 AND team_id=$2 AND agent_id=$3', [f.workspaceId, f.teamId, f.reviewer.id])
    const beforeRacedRecipient = await projectionCounts()
    const racedRecipient = agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'blocker', body: 'Concurrent recipient revocation must win before projection.', recipientActorId: f.reviewer.actorId,
    })
    await new Promise(resolve => setTimeout(resolve, 100))
    await revokeGate.query('COMMIT')
    revokeGate.release()
    const racedRecipientResponse = await racedRecipient
    await db.query('UPDATE agent_team_access SET revoked_at=NULL WHERE workspace_id=$1 AND team_id=$2 AND agent_id=$3', [f.workspaceId, f.teamId, f.reviewer.id])
    await assertDeniedProjection(racedRecipientResponse, 'MESSAGE_RECIPIENT_OUT_OF_SCOPE', beforeRacedRecipient)

    const beforeActorTarget = (await db.query<{ cursor: string }>(
      'SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const blocker = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'blocker', body: 'Choose one active Session to own this blocker.', recipientActorId: f.reviewer.actorId, requiresResponse: true,
    })
    expect(blocker.statusCode, JSON.stringify(blocker.json())).toBe(200)
    const blockerMessageId = blocker.json<{ id: string }>().id
    const blockerItemId = (await db.query<{ id: string }>(`SELECT id FROM inbox_items
      WHERE source_type='room_message' AND source_id=$1 AND recipient_actor_id=$2 AND recipient_human_actor_id IS NULL`,
    [blockerMessageId, f.reviewer.actorId])).rows[0]!.id
    for (const token of [siblingToken, reviewerToken]) {
      const recipientEvents = (await agentCall(token, 'GET', `/api/v1/events?cursor=${beforeActorTarget}`))
        .json<Array<{ aggregate_id: string; event_type: string; audience_actor_id: string | null; session_id: string | null }>>()
        .filter(event => event.aggregate_id === blockerMessageId)
      expect(recipientEvents).toEqual([
        expect.objectContaining({
          event_type: 'room.message.posted',
          audience_actor_id: f.reviewer.actorId,
          session_id: null,
        }),
      ])
    }
    const actorTargetObserverEvents = (await humanCall(f.human, 'GET', `/api/v1/events?cursor=${beforeActorTarget}`))
      .json<Array<{ aggregate_id: string; event_type: string }>>()
      .filter(event => event.aggregate_id === blockerMessageId)
    expect(actorTargetObserverEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ event_type: 'room.message.human_visibility_recorded' }),
    ]))
    expect(actorTargetObserverEvents.filter(event => event.event_type === 'room.message.posted')).toEqual([])

    for (const token of [siblingToken, reviewerToken]) {
      const list = await agentCall(token, 'GET', '/api/v1/inbox')
      expect(list.statusCode, JSON.stringify(list.json())).toBe(200)
      expect(list.json<Page<{ id: string; detail_available: boolean; payload: Record<string, unknown> }>>().items).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: blockerItemId, detail_available: false, payload: { intent: 'blocker', channelId } }),
      ]))
      expect((await agentCall(token, 'GET', `/api/v1/inbox/${blockerItemId}`)).statusCode).toBe(404)
    }

    const beforeInvalidClaim = await projectionCounts()
    const invalidClaimBody = await agentCall(
      siblingToken,
      'POST',
      `/api/v1/inbox/${blockerItemId}/claim`,
      { unexpected: true },
    )
    expect(invalidClaimBody.statusCode).toBe(400)
    await expect(db.query(
      'SELECT claimed_by_session_id FROM inbox_items WHERE id=$1',
      [blockerItemId],
    )).resolves.toMatchObject({ rows: [{ claimed_by_session_id: null }] })
    expect(await projectionCounts()).toEqual(beforeInvalidClaim)

    const claimKeys = [randomUUID(), randomUUID()] as const
    const claimGate = await db.connect()
    await claimGate.query('BEGIN')
    await claimGate.query('SELECT 1 FROM agent_definitions WHERE id=$1 FOR UPDATE', [f.reviewer.id])
    const claimsPending = Promise.all([
      agentCall(siblingToken, 'POST', `/api/v1/inbox/${blockerItemId}/claim`, {}, { 'idempotency-key': claimKeys[0] }),
      agentCall(reviewerToken, 'POST', `/api/v1/inbox/${blockerItemId}/claim`, {}, { 'idempotency-key': claimKeys[1] }),
    ])
    await new Promise(resolve => setTimeout(resolve, 100))
    await claimGate.query('COMMIT')
    claimGate.release()
    const claims = await claimsPending
    expect(claims.filter(response => response.statusCode === 200)).toHaveLength(1)
    expect([404, 409]).toContain(claims.find(response => response.statusCode !== 200)!.statusCode)
    const winnerIndex = claims.findIndex(response => response.statusCode === 200)
    const winnerToken = [siblingToken, reviewerToken][winnerIndex]!
    const loserToken = [siblingToken, reviewerToken][1 - winnerIndex]!
    const winnerSession = [siblingSession, reviewerSession][winnerIndex]!
    const loserSession = [siblingSession, reviewerSession][1 - winnerIndex]!
    const winnerClaimKey = claimKeys[winnerIndex]!
    const claim = claims[winnerIndex]!.json<{ revision: number; claimed_by_session_id: string; source_message_body: string; detailAvailable: boolean }>()
    expect(claim).toMatchObject({ claimed_by_session_id: winnerSession.id, source_message_body: 'Choose one active Session to own this blocker.', detailAvailable: true })
    const loserClaim = claims[1 - winnerIndex]!
    expect(loserClaim.statusCode).toBe(404)
    expect(loserClaim.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND')
    const expectedWinnerHash = createHash('sha256').update(JSON.stringify({
      agentSessionId: winnerSession.id,
      body: {},
      ifMatch: null,
      method: 'POST',
      pathParams: { id: blockerItemId },
      route: '/api/v1/inbox/:id/claim',
    })).digest('hex')
    expect((await db.query<{ request_hash: string }>(
      `SELECT request_hash FROM api_idempotency_keys
        WHERE workspace_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
      [f.workspaceId, f.reviewer.actorId, winnerClaimKey],
    )).rows[0]!.request_hash).toBe(expectedWinnerHash)
    const claimReplay = await agentCall(winnerToken, 'POST', `/api/v1/inbox/${blockerItemId}/claim`, {}, { 'idempotency-key': winnerClaimKey })
    expect(claimReplay.statusCode, JSON.stringify(claimReplay.json())).toBe(200)
    expect(claimReplay.json()).toEqual(claim)
    const keyConflictMessage = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'blocker', body: 'Keep idempotency conflict separate from the claim race.', recipientActorId: f.reviewer.actorId,
    })
    const keyConflictItemId = (await db.query<{ id: string }>(
      `SELECT id FROM inbox_items WHERE source_id=$1 AND recipient_actor_id=$2`,
      [keyConflictMessage.json<{ id: string }>().id, f.reviewer.actorId],
    )).rows[0]!.id
    const keyConflict = await agentCall(winnerToken, 'POST', `/api/v1/inbox/${keyConflictItemId}/claim`, {}, { 'idempotency-key': winnerClaimKey })
    expect(keyConflict.statusCode).toBe(409)
    expect(keyConflict.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } })
    expect((await db.query<{ claimed_by_session_id: string | null }>(
      'SELECT claimed_by_session_id FROM inbox_items WHERE id=$1',
      [keyConflictItemId],
    )).rows[0]!.claimed_by_session_id).toBeNull()
    expect((await agentCall(loserToken, 'GET', `/api/v1/inbox/${blockerItemId}`)).statusCode).toBe(404)

    const acknowledged = await agentCall(winnerToken, 'POST', `/api/v1/inbox/${blockerItemId}/acknowledge`, {})
    expect(acknowledged.statusCode, JSON.stringify(acknowledged.json())).toBe(200)
    expect(acknowledged.json<{ status: string }>().status).toBe('open')
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM room_message_response_resolutions WHERE message_id=$1', [blockerMessageId])).rows[0]!.count).toBe(0)

    const beforeReply = (await db.query<{ work_item_revision: number; handoffs: number; leases: number }>(`SELECT revision AS work_item_revision,
      (SELECT count(*)::int FROM handoffs) AS handoffs,(SELECT count(*)::int FROM leases) AS leases FROM work_items WHERE id=$1`, [f.workItemId])).rows[0]!
    const blockerReply = await agentCall(winnerToken, 'POST', `/api/v1/inbox/${blockerItemId}/reply`, {
      body: 'I have claimed and handled the blocker.', payload: { outcome: 'handled' },
    }, { 'if-match': `"revision-${claim.revision}"` })
    expect(blockerReply.statusCode, JSON.stringify(blockerReply.json())).toBe(200)
    expect(blockerReply.json<{ status: string }>().status).toBe('resolved')
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM room_message_response_resolutions WHERE message_id=$1', [blockerMessageId])).rows[0]!.count).toBe(1)
    expect((await db.query<{ work_item_revision: number; handoffs: number; leases: number }>(`SELECT revision AS work_item_revision,
      (SELECT count(*)::int FROM handoffs) AS handoffs,(SELECT count(*)::int FROM leases) AS leases FROM work_items WHERE id=$1`, [f.workItemId])).rows[0]).toEqual(beforeReply)
    await durableEvent('inbox.item.replied', blockerItemId)

    const resolvedBeforeClaim = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'ask', body: 'Resolve this before any Agent claim.', recipientActorId: f.reviewer.actorId, requiresResponse: true,
    })
    expect(resolvedBeforeClaim.statusCode).toBe(200)
    const resolvedMessageId = resolvedBeforeClaim.json<{ id: string }>().id
    const resolvedItemId = (await db.query<{ id: string }>(
      `SELECT id FROM inbox_items WHERE source_type='room_message' AND source_id=$1
        AND recipient_actor_id=$2 AND recipient_human_actor_id IS NULL`,
      [resolvedMessageId, f.reviewer.actorId],
    )).rows[0]!.id
    const resolvedInitialRevision = (await db.query<{ revision: number }>(
      'SELECT revision FROM inbox_items WHERE id=$1',
      [resolvedItemId],
    )).rows[0]!.revision
    expect((await humanCall(f.human, 'POST', `/api/v1/messages/${resolvedMessageId}/resolve`, {}, { 'if-match': '"revision-1"' })).statusCode).toBe(200)
    expect((await db.query<{ status: string; revision: number }>(
      'SELECT status,revision FROM inbox_items WHERE id=$1',
      [resolvedItemId],
    )).rows[0]).toEqual({ status: 'resolved', revision: resolvedInitialRevision + 1 })
    expect((await agentCall(siblingToken, 'POST', `/api/v1/inbox/${resolvedItemId}/claim`, {})).statusCode).toBe(404)
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM inbox_item_receipts
        WHERE inbox_item_id=$1 AND kind='claimed'`,
      [resolvedItemId],
    )).rows[0]!.count).toBe(0)

    const beforeMentionCreation = (await db.query<{ cursor: string }>(
      'SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const mention = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'inform', body: 'This mention is for one exact Session.', recipientSessionId: loserSession.id,
    })
    expect(mention.statusCode, JSON.stringify(mention.json())).toBe(200)
    const mentionMessageId = mention.json<{ id: string }>().id
    const mentionItemId = (await db.query<{ id: string }>(`SELECT id FROM inbox_items
      WHERE source_id=$1 AND recipient_session_id=$2 AND kind='mention'`, [mentionMessageId, loserSession.id])).rows[0]!.id
    const loserCreationEvents = (await agentCall(loserToken, 'GET', `/api/v1/events?cursor=${beforeMentionCreation}`))
      .json<Array<{ aggregate_id: string; event_type: string; session_id: string }>>()
    const winnerCreationEvents = (await agentCall(winnerToken, 'GET', `/api/v1/events?cursor=${beforeMentionCreation}`))
      .json<Array<{ aggregate_id: string; event_type: string; session_id: string }>>()
    expect(loserCreationEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        aggregate_id: mentionMessageId,
        event_type: 'room.message.posted',
        session_id: loserSession.id,
      }),
    ]))
    expect(winnerCreationEvents.filter(event => event.aggregate_id === mentionMessageId)).toEqual([])
    const beforeMentionRead = (await db.query<{ cursor: string; receipts: number }>(
      `SELECT COALESCE(max(cursor),0)::text AS cursor,
              (SELECT count(*)::int FROM inbox_item_receipts WHERE inbox_item_id=$1) AS receipts
         FROM domain_events`,
      [mentionItemId],
    )).rows[0]!
    expect((await agentCall(winnerToken, 'GET', `/api/v1/inbox/${mentionItemId}`)).statusCode).toBe(404)
    const mentionDetail = await agentCall(loserToken, 'GET', `/api/v1/inbox/${mentionItemId}`)
    expect(mentionDetail.statusCode, JSON.stringify(mentionDetail.json())).toBe(200)
    expect(mentionDetail.json<{ source_message_body: string }>().source_message_body).toBe('This mention is for one exact Session.')
    expect((await db.query<{ cursor: string; receipts: number }>(
      `SELECT COALESCE(max(cursor),0)::text AS cursor,
              (SELECT count(*)::int FROM inbox_item_receipts WHERE inbox_item_id=$1) AS receipts
         FROM domain_events`,
      [mentionItemId],
    )).rows[0]).toEqual(beforeMentionRead)
    const mentionAck = await agentCall(loserToken, 'POST', `/api/v1/inbox/${mentionItemId}/acknowledge`, {})
    expect(mentionAck.statusCode).toBe(200)
    expect(mentionAck.json<{ status: string }>().status).toBe('open')
    const loserInboxEvents = (await agentCall(loserToken, 'GET', `/api/v1/events?cursor=${beforeMentionRead.cursor}`)).json<Array<{ aggregate_id: string; event_type: string }>>()
    const winnerInboxEvents = (await agentCall(winnerToken, 'GET', `/api/v1/events?cursor=${beforeMentionRead.cursor}`)).json<Array<{ aggregate_id: string; event_type: string }>>()
    expect(loserInboxEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ aggregate_id: mentionItemId, event_type: 'inbox.item.acknowledged' }),
    ]))
    expect(loserInboxEvents.find(event => event.event_type === 'inbox.item.read')).toBeUndefined()
    expect(winnerInboxEvents.filter(event => event.aggregate_id === mentionItemId)).toEqual([])

    const ask = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'ask', body: 'Can your exact Session answer this question?', recipientSessionId: loserSession.id, requiresResponse: true,
    })
    expect(ask.statusCode, JSON.stringify(ask.json())).toBe(200)
    const askItemId = (await db.query<{ id: string }>(`SELECT id FROM inbox_items
      WHERE source_id=$1 AND recipient_session_id=$2 AND kind='ask'`, [ask.json<{ id: string }>().id, loserSession.id])).rows[0]!.id
    const askDetail = await agentCall(loserToken, 'GET', `/api/v1/inbox/${askItemId}`)
    expect(askDetail.statusCode, JSON.stringify(askDetail.json())).toBe(200)
    const beforeInactiveSourceReply = await projectionCounts()
    await db.query('UPDATE actors SET is_active=false WHERE id=$1', [f.runner.actorId])
    const inactiveSourceReply = await agentCall(loserToken, 'POST', `/api/v1/inbox/${askItemId}/reply`, {
      body: 'This reply must roll back while the exact source Actor is inactive.', payload: {},
    }, { 'if-match': `"revision-${askDetail.json<{ revision: number }>().revision}"` })
    await db.query('UPDATE actors SET is_active=true WHERE id=$1', [f.runner.actorId])
    await assertDeniedProjection(inactiveSourceReply, 'NOT_FOUND', beforeInactiveSourceReply)
    const beforeOutOfScopeSourceReply = await projectionCounts()
    await db.query(
      "UPDATE delegations SET capability_scope=jsonb_set(capability_scope,'{workItemIds}','[]'::jsonb) WHERE id=$1",
      [parentAuthority.delegation_id],
    )
    const outOfScopeSourceReply = await agentCall(loserToken, 'POST', `/api/v1/inbox/${askItemId}/reply`, {
      body: 'This reply must roll back while the source Session scope is revoked.', payload: {},
    }, { 'if-match': `"revision-${askDetail.json<{ revision: number }>().revision}"` })
    await db.query(
      'UPDATE delegations SET capability_scope=$2 WHERE id=$1',
      [parentAuthority.delegation_id, parentAuthority.capability_scope],
    )
    await assertDeniedProjection(outOfScopeSourceReply, 'NOT_FOUND', beforeOutOfScopeSourceReply)

    const responsibleObserver = await memberForTeam(f.workspaceId, f.teamId)
    await db.query(
      'UPDATE work_items SET responsible_human_actor_id=$2 WHERE id=$1',
      [f.workItemId, responsibleObserver.actorId],
    )
    const responsibleAsk = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id,
      intent: 'ask',
      body: 'The Work Item responsible Human must observe this request.',
      recipientSessionId: reviewerSession.id,
      requiresResponse: true,
    })
    expect(responsibleAsk.statusCode, JSON.stringify(responsibleAsk.json())).toBe(200)
    const responsibleRecipients = (await db.query<{ recipient_human_actor_id: string | null }>(
      `SELECT recipient_human_actor_id
         FROM inbox_items
        WHERE source_type='room_message' AND source_id=$1
        ORDER BY recipient_human_actor_id NULLS LAST`,
      [responsibleAsk.json<{ id: string }>().id],
    )).rows
    expect(responsibleRecipients).toEqual(expect.arrayContaining([
      { recipient_human_actor_id: responsibleObserver.actorId },
      { recipient_human_actor_id: null },
    ]))
    expect(responsibleRecipients).not.toContainEqual({ recipient_human_actor_id: f.human.actorId })
    await db.query(
      'UPDATE work_items SET responsible_human_actor_id=$2 WHERE id=$1',
      [f.workItemId, f.human.actorId],
    )

    const humanAsk = await humanCall(f.human, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      intent: 'ask', body: 'Can you reply to the responsible Human?', recipientSessionId: loserSession.id, requiresResponse: true,
    })
    expect(humanAsk.statusCode, JSON.stringify(humanAsk.json())).toBe(200)
    const humanAskItemId = (await db.query<{ id: string }>(`SELECT id FROM inbox_items
      WHERE source_id=$1 AND recipient_session_id=$2 AND kind='ask'`, [humanAsk.json<{ id: string }>().id, loserSession.id])).rows[0]!.id
    const humanAskDetail = await agentCall(loserToken, 'GET', `/api/v1/inbox/${humanAskItemId}`)
    expect(humanAskDetail.statusCode, JSON.stringify(humanAskDetail.json())).toBe(200)
    const beforeInactiveHumanSourceReply = await projectionCounts()
    await db.query('UPDATE actors SET is_active=false WHERE id=$1', [f.human.actorId])
    const inactiveHumanSourceReply = await agentCall(loserToken, 'POST', `/api/v1/inbox/${humanAskItemId}/reply`, {
      body: 'This reply must roll back while the Human source Actor is inactive.', payload: {},
    }, { 'if-match': `"revision-${humanAskDetail.json<{ revision: number }>().revision}"` })
    await db.query('UPDATE actors SET is_active=true WHERE id=$1', [f.human.actorId])
    await assertDeniedProjection(inactiveHumanSourceReply, 'NOT_FOUND', beforeInactiveHumanSourceReply)

    const memberSource = await memberForTeam(f.workspaceId, f.teamId, 'maintainer')
    const memberAsk = await humanCall(memberSource, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      intent: 'ask',
      body: 'Membership must remain live until the reply commits.',
      recipientSessionId: loserSession.id,
      requiresResponse: true,
    })
    expect(memberAsk.statusCode, JSON.stringify(memberAsk.json())).toBe(200)
    const memberAskItemId = (await db.query<{ id: string }>(
      `SELECT id FROM inbox_items WHERE source_id=$1 AND recipient_session_id=$2`,
      [memberAsk.json<{ id: string }>().id, loserSession.id],
    )).rows[0]!.id
    const memberAskDetail = await agentCall(loserToken, 'GET', `/api/v1/inbox/${memberAskItemId}`)
    const beforeRevokedMemberReply = await projectionCounts()
    await db.query(
      'DELETE FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3',
      [f.workspaceId, f.teamId, memberSource.actorId],
    )
    const revokedMemberReply = await agentCall(loserToken, 'POST', `/api/v1/inbox/${memberAskItemId}/reply`, {
      body: 'This must roll back after the Human loses Team membership.', payload: {},
    }, { 'if-match': `"revision-${memberAskDetail.json<{ revision: number }>().revision}"` })
    await db.query(
      "INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'member')",
      [f.workspaceId, f.teamId, memberSource.actorId],
    )
    await assertDeniedProjection(revokedMemberReply, 'NOT_FOUND', beforeRevokedMemberReply)

    const reverseAsk = await agentCall(loserToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: loserSession.id,
      intent: 'ask',
      body: 'Reply concurrently in the opposite Session direction.',
      recipientSessionId: f.parent.id,
      requiresResponse: true,
    })
    expect(reverseAsk.statusCode, JSON.stringify(reverseAsk.json())).toBe(200)
    const reverseAskItemId = (await db.query<{ id: string }>(
      `SELECT id FROM inbox_items WHERE source_id=$1 AND recipient_session_id=$2`,
      [reverseAsk.json<{ id: string }>().id, f.parent.id],
    )).rows[0]!.id
    const reverseAskDetail = await agentCall(f.parentToken, 'GET', `/api/v1/inbox/${reverseAskItemId}`)
    const reciprocalReplies = await Promise.all([
      agentCall(loserToken, 'POST', `/api/v1/inbox/${askItemId}/reply`, {
        body: 'Yes. Only this exact Session can reply.', payload: {},
      }, { 'if-match': `"revision-${askDetail.json<{ revision: number }>().revision}"` }),
      agentCall(f.parentToken, 'POST', `/api/v1/inbox/${reverseAskItemId}/reply`, {
        body: 'The deterministic Session lock order avoids reciprocal deadlock.', payload: {},
      }, { 'if-match': `"revision-${reverseAskDetail.json<{ revision: number }>().revision}"` }),
    ])
    expect(reciprocalReplies.map(response => response.statusCode)).toEqual([200, 200])
    const askReply = reciprocalReplies[0]!
    expect(askReply.statusCode, JSON.stringify(askReply.json())).toBe(200)
    expect(askReply.json<{ status: string }>().status).toBe('resolved')
    const askReplyMessageId = askReply.json<{ replyMessageId: string }>().replyMessageId
    const sourceReplyInbox = (await db.query<{ id: string }>(
      `SELECT id FROM inbox_items
        WHERE source_type='room_message' AND source_id=$1
          AND recipient_session_id=$2 AND kind='mention'`,
      [askReplyMessageId, f.parent.id],
    )).rows[0]
    expect(sourceReplyInbox).toBeDefined()
    const sourceReplyDetail = await agentCall(f.parentToken, 'GET', `/api/v1/inbox/${sourceReplyInbox!.id}`)
    expect(sourceReplyDetail.statusCode, JSON.stringify(sourceReplyDetail.json())).toBe(200)
    expect(sourceReplyDetail.json<{ source_message_body: string }>().source_message_body).toBe('Yes. Only this exact Session can reply.')
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM inbox_items
        WHERE source_type='room_message' AND source_id=$1 AND status='open'`,
      [ask.json<{ id: string }>().id],
    )).rows[0]!.count).toBe(0)
    await durableEvent('room.message.posted', askReplyMessageId)
    await durableEvent('inbox.item.replied', askItemId)

    const reviewRequest = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, {
      sessionId: f.parent.id, intent: 'review_request', body: 'Review the evidence with your reviewer authority.', recipientSessionId: reviewerSession.id, requiresResponse: true,
    })
    expect(reviewRequest.statusCode, JSON.stringify(reviewRequest.json())).toBe(200)
    const reviewItemId = (await db.query<{ id: string }>(`SELECT id FROM inbox_items
      WHERE source_id=$1 AND recipient_session_id=$2 AND kind='review_request'`, [reviewRequest.json<{ id: string }>().id, reviewerSession.id])).rows[0]!.id
    const reviewDetail = await agentCall(reviewerToken, 'GET', `/api/v1/inbox/${reviewItemId}`)
    expect(reviewDetail.statusCode, JSON.stringify(reviewDetail.json())).toBe(200)
    await db.query(`UPDATE agent_team_access SET approved_capabilities=array_remove(approved_capabilities,'artifact:write')
      WHERE workspace_id=$1 AND team_id=$2 AND agent_id=$3`, [f.workspaceId, f.teamId, f.reviewer.id])
    const deniedReview = await agentCall(reviewerToken, 'POST', `/api/v1/inbox/${reviewItemId}/reply`, {
      body: 'This must fail while live artifact authority is revoked.', payload: {},
    }, { 'if-match': `"revision-${reviewDetail.json<{ revision: number }>().revision}"` })
    expect(deniedReview.statusCode).toBe(403)
    expect((await db.query<{ status: string }>('SELECT status FROM inbox_items WHERE id=$1', [reviewItemId])).rows[0]!.status).toBe('open')
    await db.query(`UPDATE agent_team_access SET approved_capabilities=array_append(approved_capabilities,'artifact:write')
      WHERE workspace_id=$1 AND team_id=$2 AND agent_id=$3`, [f.workspaceId, f.teamId, f.reviewer.id])
    const reviewReply = await agentCall(reviewerToken, 'POST', `/api/v1/inbox/${reviewItemId}/reply`, {
      body: 'Review complete with auditable evidence.', payload: { verdict: 'approved' },
    }, { 'if-match': `"revision-${reviewDetail.json<{ revision: number }>().revision}"` })
    expect(reviewReply.statusCode, JSON.stringify(reviewReply.json())).toBe(200)
    expect((await db.query<{ intent: string }>('SELECT intent::text AS intent FROM room_messages WHERE id=$1',
      [reviewReply.json<{ replyMessageId: string }>().replyMessageId])).rows[0]).toEqual({ intent: 'review_result' })
    await durableEvent('inbox.item.replied', reviewItemId)

    await db.query("UPDATE delegations SET status='revoked',revoked_at=now() WHERE id=$1", [reviewerDelegationId])
    const revokedInboxRead = await agentCall(reviewerToken, 'GET', `/api/v1/inbox/${reviewItemId}`)
    expect(revokedInboxRead.statusCode).toBe(409)
    expect(revokedInboxRead.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'DELEGATION_NOT_ACTIVE' } })
  })

  it('enforces cross-team collaboration boundaries and trusted context sources', async () => {
    const f = await makeFixture()
    const otherTeam = await humanCall(f.human, 'POST', '/api/v1/teams', { name: 'Isolated team', key: `I${randomUUID().replaceAll('-', '').slice(0, 5).toUpperCase()}` })
    expect(otherTeam.statusCode, JSON.stringify(otherTeam.json())).toBe(200)
    const otherTeamId = otherTeam.json<{ id: string }>().id
    const otherReady = await humanCall(f.human, 'POST', `/api/v1/teams/${otherTeamId}/states`, { name: 'Ready', category: 'planned', position: 0 })
    expect(otherReady.statusCode, JSON.stringify(otherReady.json())).toBe(200)
    const otherReadyId = otherReady.json<{ id: string }>().id
    const scopedMember = await memberForTeam(f.workspaceId, otherTeamId)
    const concealedInbox = (await db.query<{ id: string }>(
      `INSERT INTO inbox_items(
         workspace_id,recipient_human_actor_id,recipient_actor_id,team_id,
         kind,source_type,source_id,payload
       ) VALUES($1,$2,$2,$3,'mention','handoff',$4,'{}'::jsonb)
       RETURNING id`,
      [f.workspaceId, scopedMember.actorId, otherTeamId, randomUUID()],
    )).rows[0]!.id
    expect((await agentCall(f.parentToken, 'GET', `/api/v1/inbox/${concealedInbox}`)).statusCode).toBe(404)
    expect((await agentCall(f.parentToken, 'POST', `/api/v1/inbox/${concealedInbox}/claim`, {})).statusCode).toBe(404)
    expect((await humanCall(f.human, 'GET', `/api/v1/inbox/${concealedInbox}`)).statusCode).toBe(404)
    const otherAgent = await register(f.human, otherTeamId, `isolated-${randomUUID().slice(0, 8)}`)
    const otherWork = await humanCall(f.human, 'POST', '/api/v1/work-items', { teamId: otherTeamId, title: 'Isolated work', statusId: otherReadyId, responsibleHumanActorId: f.human.actorId })
    expect(otherWork.statusCode).toBe(200)
    const otherSession = await start(f.human, otherAgent, f.workspaceId, otherTeamId, otherWork.json<{ id: string }>().id)
    const otherToken = await exchangeAndExecute(otherSession, otherAgent)
    const otherStep = randomUUID()
    const otherRevision = (await db.query<{ revision: number }>('SELECT revision FROM agent_sessions WHERE id=$1', [otherSession.id])).rows[0]!.revision
    const otherPlan = await agentCall(otherToken, 'PUT', `/api/v1/agent-sessions/${otherSession.id}/plan`, {
      changeSummary: 'Isolated plan',
      steps: [{ id: otherStep, title: 'Other team step', ordinal: 0, dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [], status: 'pending' }],
    }, { 'if-match': `"revision-${otherRevision}"` })
    expect(otherPlan.statusCode, JSON.stringify(otherPlan.json())).toBe(200)
    const otherPlanVersionId = (await db.query<{ current_plan_version_id: string }>('SELECT current_plan_version_id FROM agent_sessions WHERE id=$1', [otherSession.id])).rows[0]!.current_plan_version_id

    const proposed = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/decisions`, {
      title: 'Ship the collaboration boundary?',
      rationale: 'The decision must remain scoped to its Team.',
      options: ['ship', 'hold'],
      affectedResources: [{ resourceType: 'work_item', resourceId: f.workItemId, impact: 'release gate' }],
    })
    expect(proposed.statusCode, JSON.stringify(proposed.json())).toBe(200)
    const proposedDecision = proposed.json<{ id: string; revision: number }>()
    const crossTeamFinalize = await humanCall(scopedMember, 'POST', `/api/v1/decisions/${proposedDecision.id}/finalize`, { selectedOption: 'ship', reason: 'must not cross Team' }, { 'if-match': `"revision-${proposedDecision.revision}"` })
    expect(crossTeamFinalize.statusCode).toBe(403)
    expect(crossTeamFinalize.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'FORBIDDEN' } })
    const concurrentFinalizations = await Promise.all([
      humanCall(f.human, 'POST', `/api/v1/decisions/${proposedDecision.id}/finalize`, { selectedOption: 'ship', reason: 'authorized final decision A' }, { 'if-match': `"revision-${proposedDecision.revision}"` }),
      humanCall(f.human, 'POST', `/api/v1/decisions/${proposedDecision.id}/finalize`, { selectedOption: 'ship', reason: 'authorized final decision B' }, { 'if-match': `"revision-${proposedDecision.revision}"` }),
    ])
    expect(concurrentFinalizations.map(response => response.statusCode).sort()).toEqual([200, 409])
    const finalized = concurrentFinalizations.find(response => response.statusCode === 200)!
    const duplicateFinalize = concurrentFinalizations.find(response => response.statusCode === 409)!
    expect(duplicateFinalize.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'DECISION_TRANSITION_CONFLICT' } })
    const finalizedId = finalized.json<{ id: string }>().id
    const superseded = await humanCall(f.human, 'POST', `/api/v1/decisions/${finalizedId}/supersede`, { selectedOption: 'hold', reason: 'new evidence' }, { 'if-match': '"revision-1"' })
    expect(superseded.statusCode, JSON.stringify(superseded.json())).toBe(200)
    const conflictingReverse = await humanCall(f.human, 'POST', `/api/v1/decisions/${finalizedId}/reverse`, { reason: 'the consumed decision cannot branch' }, { 'if-match': '"revision-1"' })
    expect(conflictingReverse.statusCode).toBe(409)
    expect(conflictingReverse.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'DECISION_TRANSITION_CONFLICT' } })
    expect((await db.query<{ resource_type: string; resource_id: string; impact: string }>('SELECT resource_type,resource_id,impact FROM decision_affected_resources WHERE decision_id=$1', [finalizedId])).rows).toEqual([
      { resource_type: 'work_item', resource_id: f.workItemId, impact: 'release gate' },
    ])

    const beforeComments = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM plan_step_comments')).rows[0]!.count
    const crossSessionComment = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/plan/comments`, { planVersionId: otherPlanVersionId, planStepId: otherStep, body: 'cross-session write must fail', references: [] })
    expect(crossSessionComment.statusCode).toBe(409)
    expect(crossSessionComment.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'STALE_PLAN_VERSION' } })
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM plan_step_comments')).rows[0]!.count).toBe(beforeComments)
    const crossSessionAssignment = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/assignment-proposals`, { planStepId: otherStep, agentId: f.reviewer.id, rationale: 'cross-session assignment must fail' })
    expect(crossSessionAssignment.statusCode).toBe(409)
    expect(crossSessionAssignment.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'STALE_PLAN_VERSION' } })

    const channelId = (await db.query<{ id: string }>("SELECT id FROM work_room_channels WHERE subject_kind='session' AND subject_id=$1", [f.parent.id])).rows[0]!.id
    const beforeMessages = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM room_messages')).rows[0]!.count
    for (const recipientActorId of [scopedMember.actorId, otherAgent.actorId]) {
      const deniedRecipient = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, { sessionId: f.parent.id, intent: 'ask', body: 'cross-team recipient must fail', recipientActorId, requiresResponse: true })
      expect(deniedRecipient.statusCode).toBe(400)
      expect(deniedRecipient.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'MESSAGE_RECIPIENT_OUT_OF_SCOPE' } })
    }
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM room_messages')).rows[0]!.count).toBe(beforeMessages)

    const baseSnapshotId = (await db.query<{ context_snapshot_id: string }>('SELECT context_snapshot_id FROM agent_sessions WHERE id=$1', [f.parent.id])).rows[0]!.context_snapshot_id
    const dummyHash = `sha256:${'a'.repeat(64)}`
    for (const sourceType of ['artifact', 'message', 'work_item', 'plan_step'] as const) {
      const uriBypass = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/context-deltas`, { baseSnapshotId, additions: [{ sourceType, uri: 'https://untrusted.example.test/context', hash: dummyHash }], rationale: `reject ${sourceType} URI bypass` })
      expect(uriBypass.statusCode).toBe(400)
      expect(uriBypass.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    }
    const guidanceHash = `sha256:${createHash('sha256').update('').digest('hex')}`
    const unauthorizedGuidance = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/context-deltas`, { baseSnapshotId, additions: [{ sourceType: 'guidance', uri: `workmesh://team/${otherTeamId}/guidance`, hash: guidanceHash }], rationale: 'reject guidance outside the session Team' })
    expect(unauthorizedGuidance.statusCode).toBe(403)
    expect(unauthorizedGuidance.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'RESOURCE_SCOPE_DENIED' } })
    const validGuidance = await agentCall(f.parentToken, 'POST', `/api/v1/agent-sessions/${f.parent.id}/context-deltas`, { baseSnapshotId, additions: [{ sourceType: 'guidance', uri: `workmesh://team/${f.teamId}/guidance`, hash: guidanceHash }], rationale: 'append server-verified Team guidance' })
    expect(validGuidance.statusCode, JSON.stringify(validGuidance.json())).toBe(200)
  })

  it('accepts, rolls back, and rejects handoffs atomically with durable events and outbox', async () => {
    const f = await makeFixture()
    const source = await directSession(f, f.runner, 'Handoff accepted source')
    const sourceToken = await tokenFor(source.id, f.runner)
    const lease = await agentCall(sourceToken, 'POST', '/api/v1/leases', { sessionId: source.id, resourceType: 'work_item', resourceId: source.workItemId, kind: 'exclusive', ttlSeconds: 60, reason: 'transfer me' })
    expect(lease.statusCode).toBe(200)
    const offered = await agentCall(sourceToken, 'POST', '/api/v1/handoffs', {
      fromSessionId: source.id,
      targetAgentId: f.reviewer.id,
      summary: 'Please take over',
      completedWork: ['Implemented room projection'],
      remainingWork: ['Validate final evidence'],
      openQuestions: ['Is the audit trail complete?'],
      risks: ['Review may uncover a blocker'],
      acceptanceCriteria: ['Reviewer approves the handoff'],
      artifactIds: [],
      requestedCapabilities: ['work:read', 'work:write'],
      leaseTransferPolicy: 'transfer',
    })
    expect(offered.statusCode).toBe(200)
    const handoffId = offered.json<{ id: string }>().id
    expect((await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM inbox_items
      WHERE source_type='handoff' AND source_id=$1 AND recipient_human_actor_id IS NULL`, [handoffId])).rows[0]!.count).toBe(0)
    expect((await db.query<{
      completed_work: string[]
      remaining_work: string[]
      open_questions: string[]
      risks: string[]
      acceptance_criteria: string[]
    }>('SELECT completed_work,remaining_work,open_questions,risks,acceptance_criteria FROM handoffs WHERE id=$1', [handoffId])).rows[0]).toEqual({
      completed_work: ['Implemented room projection'],
      remaining_work: ['Validate final evidence'],
      open_questions: ['Is the audit trail complete?'],
      risks: ['Review may uncover a blocker'],
      acceptance_criteria: ['Reviewer approves the handoff'],
    })
    const accepted = await humanCall(f.human, 'POST', `/api/v1/handoffs/${handoffId}/accept`, { initialPrompt: 'Take the handoff' })
    expect(accepted.statusCode, JSON.stringify(accepted.json())).toBe(200)
    const acceptedSessionId = accepted.json<{ session: { id: string } }>().session.id
    expect((await db.query<{ status: string; accepted_session_id: string }>('SELECT status,accepted_session_id FROM handoffs WHERE id=$1', [handoffId])).rows[0]).toEqual({ status: 'accepted', accepted_session_id: acceptedSessionId })
    expect((await db.query<{ status: string }>('SELECT status FROM delegations WHERE id=$1', [source.delegationId])).rows[0]!.status).toBe('completed')
    expect((await db.query<{ old_status: string; new_status: string }>('SELECT (SELECT status FROM leases WHERE id=$1) AS old_status,(SELECT status FROM leases WHERE session_id=$2 AND status=\'active\') AS new_status', [lease.json<{ id: string }>().id, acceptedSessionId])).rows[0]).toEqual({ old_status: 'released', new_status: 'active' })
    await durableEvent('handoff.accepted', handoffId)
    const prematureComplete = await humanCall(f.human, 'POST', `/api/v1/handoffs/${handoffId}/complete`, { reason: 'must wait for target evidence' })
    expect(prematureComplete.statusCode).toBe(409)
    expect(prematureComplete.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'HANDOFF_TARGET_INCOMPLETE' } })
    const acceptedToken = await tokenFor(acceptedSessionId, f.reviewer)
    const acceptedAck = await agentCall(acceptedToken, 'POST', `/api/v1/agent-sessions/${acceptedSessionId}/ack`, { summary: 'accepted handoff ready', externalUrls: [] })
    const acceptedExecuting = await agentCall(acceptedToken, 'POST', `/api/v1/agent-sessions/${acceptedSessionId}/state`, { state: 'executing', reason: 'finishing handoff' }, { 'if-match': `"revision-${acceptedAck.json<{ revision: number }>().revision}"` })
    expect(acceptedExecuting.statusCode, JSON.stringify(acceptedExecuting.json())).toBe(200)
    const acceptedInbox = await agentCall(acceptedToken, 'GET', '/api/v1/inbox')
    expect(acceptedInbox.statusCode, JSON.stringify(acceptedInbox.json())).toBe(200)
    const handoffInboxItem = acceptedInbox.json<Page<{ id: string; source_id: string; kind: string; recipient_session_id: string; detail_available: boolean }>>()
      .items.find(item => item.source_id === handoffId)
    expect(handoffInboxItem).toMatchObject({
      source_id: handoffId, kind: 'handoff', recipient_session_id: acceptedSessionId, detail_available: true,
    })
    const handoffAcknowledged = await agentCall(acceptedToken, 'POST', `/api/v1/inbox/${handoffInboxItem!.id}/acknowledge`, {})
    expect(handoffAcknowledged.statusCode, JSON.stringify(handoffAcknowledged.json())).toBe(200)
    expect((await db.query<{ status: string }>('SELECT status FROM handoffs WHERE id=$1', [handoffId])).rows[0]!.status).toBe('accepted')
    const acceptedComplete = await agentCall(acceptedToken, 'POST', `/api/v1/agent-sessions/${acceptedSessionId}/complete`, { summary: 'handoff work completed', artifactIds: [], checks: [{ name: 'handoff acceptance', status: 'passed', summary: 'all criteria met' }], limitations: [] }, { 'if-match': `"revision-${acceptedExecuting.json<{ revision: number }>().revision}"` })
    expect(acceptedComplete.statusCode, JSON.stringify(acceptedComplete.json())).toBe(200)
    const completedHandoff = await humanCall(f.human, 'POST', `/api/v1/handoffs/${handoffId}/complete`, { reason: 'target completed with evidence' })
    expect(completedHandoff.statusCode, JSON.stringify(completedHandoff.json())).toBe(200)
    expect((await db.query<{ status: string }>('SELECT status FROM handoffs WHERE id=$1', [handoffId])).rows[0]!.status).toBe('completed')
    await durableEvent('handoff.completed', handoffId)

    const rollbackSource = await directSession(f, f.runner, 'Handoff rollback source')
    const rollbackToken = await tokenFor(rollbackSource.id, f.runner)
    const rollbackOffer = await agentCall(rollbackToken, 'POST', '/api/v1/handoffs', { fromSessionId: rollbackSource.id, targetAgentId: f.overflow.id, summary: 'Rollback me', openQuestions: [], artifactIds: [], requestedCapabilities: [] })
    const rollbackId = rollbackOffer.json<{ id: string }>().id
    const failure = await humanCall(f.human, 'POST', `/api/v1/handoffs/${rollbackId}/accept`, { failureInjection: 'afterSession' })
    expect(failure.statusCode).toBe(500)
    expect((await db.query<{ status: string }>('SELECT status FROM handoffs WHERE id=$1', [rollbackId])).rows[0]!.status).toBe('requested')
    expect((await db.query<{ status: string }>('SELECT status FROM delegations WHERE id=$1', [rollbackSource.delegationId])).rows[0]!.status).toBe('active')
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM agent_sessions WHERE parent_session_id=$1', [rollbackSource.id])).rows[0]!.count).toBe(0)
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM domain_events WHERE event_type='handoff.accepted' AND aggregate_id=$1", [rollbackId])).rows[0]!.count).toBe(0)

    const revokedSource = await directSession(f, f.runner, 'Handoff revoked source')
    const revokedToken = await tokenFor(revokedSource.id, f.runner)
    const revokedOffer = await agentCall(revokedToken, 'POST', '/api/v1/handoffs', { fromSessionId: revokedSource.id, targetAgentId: f.overflow.id, summary: 'Revoked source must not transfer', openQuestions: [], artifactIds: [], requestedCapabilities: [] })
    const revokedId = revokedOffer.json<{ id: string }>().id
    await db.query("UPDATE delegations SET status='revoked',revoked_at=now() WHERE id=$1", [revokedSource.delegationId])
    const revokedAccept = await humanCall(f.human, 'POST', `/api/v1/handoffs/${revokedId}/accept`, { initialPrompt: 'must fail' })
    expect(revokedAccept.statusCode).toBe(409)
    expect(revokedAccept.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'DELEGATION_NOT_ACTIVE' } })
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM agent_sessions WHERE parent_session_id=$1', [revokedSource.id])).rows[0]!.count).toBe(0)

    const rejectedSource = await directSession(f, f.runner, 'Handoff rejected source')
    const rejectedToken = await tokenFor(rejectedSource.id, f.runner)
    const noTeamTarget = await registerWithoutTeamAccess(f.human, `no-team-${randomUUID().slice(0, 8)}`)
    const handoffsBeforeUnauthorizedTarget = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM handoffs')).rows[0]!.count
    const unauthorizedTargetOffer = await agentCall(rejectedToken, 'POST', '/api/v1/handoffs', { fromSessionId: rejectedSource.id, targetAgentId: noTeamTarget.id, status: 'requested', summary: 'Must not disclose source context', openQuestions: [], artifactIds: [], requestedCapabilities: ['work:read'] })
    expect(unauthorizedTargetOffer.statusCode).toBe(403)
    expect(unauthorizedTargetOffer.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'CAPABILITY_DENIED' } })
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM handoffs')).rows[0]!.count).toBe(handoffsBeforeUnauthorizedTarget)

    const revokedInspectTarget = await register(f.human, f.teamId, `revoked-inspect-${randomUUID().slice(0, 8)}`)
    const revocableOffer = await agentCall(rejectedToken, 'POST', '/api/v1/handoffs', { fromSessionId: rejectedSource.id, targetAgentId: revokedInspectTarget.id, status: 'requested', summary: 'Access may be revoked before inspection', openQuestions: [], artifactIds: [], requestedCapabilities: ['work:read'] })
    expect(revocableOffer.statusCode, JSON.stringify(revocableOffer.json())).toBe(200)
    const revocableId = revocableOffer.json<{ id: string }>().id
    await db.query('UPDATE agent_team_access SET revoked_at=now() WHERE workspace_id=$1 AND team_id=$2 AND agent_id=$3', [f.workspaceId, f.teamId, revokedInspectTarget.id])
    const revokedInspect = await app.inject({ method: 'GET', url: `/api/v1/handoffs/${revocableId}/inspect`, headers: { authorization: `Bearer ${revokedInspectTarget.installationToken}` } }) as unknown as Response
    expect(revokedInspect.statusCode).toBe(404)
    expect(JSON.stringify(revokedInspect.json())).not.toContain('contextSnapshot')

    const rejectedOffer = await agentCall(rejectedToken, 'POST', '/api/v1/handoffs', { fromSessionId: rejectedSource.id, targetAgentId: f.reviewer.id, status: 'draft', summary: 'Reject me', completedWork: [], remainingWork: ['Try another reviewer'], openQuestions: [], risks: [], acceptanceCriteria: ['A reviewer accepts'], requestedAction: 'Review the work', leaseTransferPolicy: 'retain', artifactIds: [], requestedCapabilities: ['work:read'] })
    expect(rejectedOffer.statusCode, JSON.stringify(rejectedOffer.json())).toBe(200)
    const rejectedId = rejectedOffer.json<{ id: string }>().id
    expect((await db.query<{ status: string; requested_at: Date | null }>('SELECT status,requested_at FROM handoffs WHERE id=$1', [rejectedId])).rows[0]).toEqual({ status: 'draft', requested_at: null })
    process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS = 'true'
    const targetEndpoint = await humanCall(f.human, 'POST', `/api/v1/agents/${f.reviewer.id}/webhook-endpoints`, { url: 'http://127.0.0.2:9999/handoffs' })
    delete process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS
    expect(targetEndpoint.statusCode, JSON.stringify(targetEndpoint.json())).toBe(200)
    const targetRevision = (await db.query<{ revision: number }>('SELECT revision FROM agent_definitions WHERE id=$1', [f.reviewer.id])).rows[0]!.revision
    const targetSecret = await humanCall(f.human, 'POST', `/api/v1/agents/${f.reviewer.id}/webhook-endpoints/${targetEndpoint.json<{ id: string }>().id}/rotate-secret`, {}, { 'if-match': `"revision-${targetRevision}"` })
    expect(targetSecret.statusCode, JSON.stringify(targetSecret.json())).toBe(200)
    const requested = await agentCall(rejectedToken, 'POST', `/api/v1/handoffs/${rejectedId}/request`, { reason: 'package is ready' })
    expect(requested.statusCode).toBe(200)
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM agent_webhook_deliveries WHERE agent_id=$1 AND event_type='handoff.requested' AND payload->>'handoffId'=$2", [f.reviewer.id, rejectedId])).rows[0]!.count).toBe(1)
    const inspected = await app.inject({ method: 'GET', url: `/api/v1/handoffs/${rejectedId}/inspect`, headers: { authorization: `Bearer ${f.reviewer.installationToken}` } }) as unknown as Response
    expect(inspected.statusCode, JSON.stringify(inspected.json())).toBe(200)
    expect(inspected.json<{ handoff: { id: string; summary: string }; contextSnapshot: { id: string } }>().handoff).toMatchObject({ id: rejectedId, summary: 'Reject me' })
    expect(inspected.json<{ contextSnapshot: { id: string } }>().contextSnapshot.id).toBeTruthy()
    const otherInspect = await app.inject({ method: 'GET', url: `/api/v1/handoffs/${rejectedId}/inspect`, headers: { authorization: `Bearer ${f.overflow.installationToken}` } }) as unknown as Response
    expect(otherInspect.statusCode).toBe(404)
    const redirected = await humanCall(f.human, 'POST', `/api/v1/handoffs/${rejectedId}/accept`, { agentId: f.overflow.id, initialPrompt: 'must not redirect exact target' })
    expect(redirected.statusCode).toBe(409)
    expect(redirected.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'ROUTING_TARGET_LOCKED' } })
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM agent_sessions WHERE parent_session_id=$1', [rejectedSource.id])).rows[0]!.count).toBe(0)
    const rejected = await app.inject({ method: 'POST', url: `/api/v1/handoffs/${rejectedId}/reject`, payload: { machineReason: 'concurrency_limit' }, headers: { authorization: `Bearer ${f.reviewer.installationToken}`, 'idempotency-key': randomUUID() } }) as unknown as Response
    expect(rejected.statusCode).toBe(200)
    expect((await db.query<{ status: string; machine_reject_reason: string }>('SELECT status,machine_reject_reason FROM handoffs WHERE id=$1', [rejectedId])).rows[0]).toEqual({ status: 'rejected', machine_reject_reason: 'concurrency_limit' })
    await durableEvent('handoff.rejected', rejectedId)

    await db.query("UPDATE agent_definitions SET skills=ARRAY['review']::text[],max_concurrency=CASE WHEN id=$1 THEN 1 ELSE max_concurrency END WHERE id=ANY($2::uuid[])", [f.reviewer.id, [f.reviewer.id, f.overflow.id]])
    const routedSource = await directSession(f, f.runner, 'Skill-routed handoff source')
    const routedToken = await tokenFor(routedSource.id, f.runner)
    const routedOffer = await agentCall(routedToken, 'POST', '/api/v1/handoffs', { fromSessionId: routedSource.id, targetSkill: 'review', summary: 'Route deterministically', completedWork: ['Prepared evidence'], remainingWork: ['Review evidence'], openQuestions: [], risks: [], acceptanceCriteria: ['Review completed'], requestedAction: 'Review the evidence', leaseTransferPolicy: 'retain', artifactIds: [], requestedCapabilities: ['work:read', 'work:write'] })
    expect(routedOffer.statusCode).toBe(200)
    const routedId = routedOffer.json<{ id: string }>().id
    const routedAccept = await humanCall(f.human, 'POST', `/api/v1/handoffs/${routedId}/accept`, { initialPrompt: 'Take the skill-routed review' })
    expect(routedAccept.statusCode, JSON.stringify(routedAccept.json())).toBe(200)
    const routing = (await db.query<{ resolved_agent_id: string; routing_snapshot: { candidateIds: string[]; selectedAgentId: string; filters: string[] } }>('SELECT resolved_agent_id,routing_snapshot FROM handoffs WHERE id=$1', [routedId])).rows[0]!
    expect(routing.resolved_agent_id).toBe(f.overflow.id)
    expect(routing.routing_snapshot).toMatchObject({ selectedAgentId: f.overflow.id, filters: expect.arrayContaining(['skill', 'capability', 'team_access', 'active_status', 'concurrency']) })
    expect(routing.routing_snapshot.candidateIds[0]).toBe(f.overflow.id)
    expect(routing.routing_snapshot.candidateIds).toEqual(expect.arrayContaining([f.overflow.id, f.reviewer.id]))
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM routing_records WHERE source_session_id=$1 AND target_agent_id=$2 AND outcome IN ('candidate','selected')", [routedSource.id, f.overflow.id])).rows[0]!.count).toBe(2)

    const noCandidateSource = await directSession(f, f.runner, 'No-candidate routing source')
    const noCandidateToken = await tokenFor(noCandidateSource.id, f.runner)
    const unavailableSkill = `missing-${randomUUID()}`
    const noCandidateOffer = await agentCall(noCandidateToken, 'POST', '/api/v1/handoffs', { fromSessionId: noCandidateSource.id, targetSkill: unavailableSkill, summary: 'Record failed routing', completedWork: [], remainingWork: ['Find a capable target'], openQuestions: [], risks: [], acceptanceCriteria: ['Routing failure remains auditable'], requestedAction: 'Take over', leaseTransferPolicy: 'retain', artifactIds: [], requestedCapabilities: ['work:read', 'work:write'] })
    expect(noCandidateOffer.statusCode, JSON.stringify(noCandidateOffer.json())).toBe(200)
    const noCandidateId = noCandidateOffer.json<{ id: string }>().id
    const routingAttemptKey = randomUUID()
    const attemptAccept = async (): Promise<Response> => await app.inject({
      method: 'POST',
      url: `/api/v1/handoffs/${noCandidateId}/accept`,
      payload: { initialPrompt: 'No target exists' },
      headers: { cookie: f.human.cookie, 'x-csrf-token': f.human.csrf, 'idempotency-key': routingAttemptKey },
    }) as unknown as Response
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const failedRouting = await attemptAccept()
      expect(failedRouting.statusCode).toBe(409)
      expect(failedRouting.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'ROUTING_TARGET_REQUIRED' } })
    }
    expect((await db.query<{ candidate_count: number; selected_agent_id: string | null; outcome: string; failure_code: string; count: number }>('SELECT candidate_count,selected_agent_id,outcome,failure_code,count(*) OVER()::int AS count FROM routing_attempts WHERE handoff_id=$1 AND attempt_key=$2', [noCandidateId, routingAttemptKey])).rows[0]).toEqual({
      candidate_count: 0,
      selected_agent_id: null,
      outcome: 'no_candidate',
      failure_code: 'ROUTING_TARGET_REQUIRED',
      count: 1,
    })
    expect((await db.query<{ status: string; children: number; accepted_events: number }>("SELECT h.status,(SELECT count(*)::int FROM agent_sessions s WHERE s.parent_session_id=h.from_session_id) AS children,(SELECT count(*)::int FROM domain_events e WHERE e.aggregate_id=h.id AND e.event_type='handoff.accepted') AS accepted_events FROM handoffs h WHERE h.id=$1", [noCandidateId])).rows[0]).toEqual({ status: 'requested', children: 0, accepted_events: 0 })
  })
})
