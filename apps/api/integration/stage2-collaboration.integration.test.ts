import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, opaqueToken, tokenHash } from '@workmesh/db'
import { buildApp } from '../src/server.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 2 API integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 2 API integration requires a dedicated *test* database.')

const db = createDb(databaseUrl)
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

async function start(human: Human, agent: Agent, workspaceId: string, teamId: string, workItemId: string, budget: Record<string, number> = {}): Promise<Session> {
  const delegation = await humanCall(human, 'POST', `/api/v1/work-items/${workItemId}/delegations`, {
    agentId: agent.id, principalHumanActorId: human.actorId, role: 'executor', scopeType: 'work_item', scopeId: workItemId,
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
  const setCookie = Array.isArray(installed.headers['set-cookie']) ? installed.headers['set-cookie'][0] : installed.headers['set-cookie']
  const cookie = typeof setCookie === 'string' ? setCookie.split(';')[0] ?? '' : ''
  const human = { cookie, csrf: installed.json<{ csrfToken: string }>().csrfToken, actorId: '' }
  const me = await humanCall(human, 'GET', '/api/v1/auth/me')
  human.actorId = me.json<{ actor: { id: string } }>().actor.id
  const teamId = (await humanCall(human, 'GET', '/api/v1/teams')).json<Array<{ id: string }>>()[0]!.id
  const readyId = (await humanCall(human, 'GET', `/api/v1/teams/${teamId}/states`)).json<Array<{ id: string; name: string }>>().find(state => state.name === 'Ready')!.id
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

async function memberForTeam(workspaceId: string, teamId: string): Promise<Human> {
  const actorId = randomUUID()
  const raw = opaqueToken()
  const csrf = opaqueToken()
  await db.query("INSERT INTO actors(id,workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,$2,'human','member',$3,'Scoped member','unused')", [actorId, workspaceId, `${randomUUID()}@example.test`])
  await db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'member')", [workspaceId, teamId, actorId])
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
    const room = await humanCall(f.human, 'GET', `/api/v1/rooms?sessionId=${f.parent.id}`)
    expect(room.statusCode).toBe(200)
    const channelId = room.json<{ id: string }>().id
    const ask = await agentCall(f.parentToken, 'POST', `/api/v1/rooms/${channelId}/messages`, { sessionId: f.parent.id, intent: 'ask', body: 'May I proceed?', recipientActorId: f.reviewer.actorId, requiresResponse: true })
    expect(ask.statusCode).toBe(200)
    const askId = ask.json<{ id: string }>().id
    const answer = await agentCall(childToken, 'POST', `/api/v1/rooms/${channelId}/messages`, { sessionId: childId, intent: 'answer', body: 'Yes, proceed.', recipientActorId: f.runner.actorId, replyToMessageId: askId })
    expect(answer.statusCode).toBe(200)
    expect((await humanCall(f.human, 'GET', '/api/v1/inbox?status=resolved')).json<Array<{ source_id: string; kind: string }>>()).toEqual(expect.arrayContaining([expect.objectContaining({ source_id: askId, kind: 'ask' })]))
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
    expect(listed.json<Array<{ id: string; version: number; revision: number }>>())
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

  it('enforces cross-team collaboration boundaries and trusted context sources', async () => {
    const f = await makeFixture()
    const otherTeam = await humanCall(f.human, 'POST', '/api/v1/teams', { name: 'Isolated team', key: `I${randomUUID().replaceAll('-', '').slice(0, 5).toUpperCase()}` })
    expect(otherTeam.statusCode, JSON.stringify(otherTeam.json())).toBe(200)
    const otherTeamId = otherTeam.json<{ id: string }>().id
    const otherReady = await humanCall(f.human, 'POST', `/api/v1/teams/${otherTeamId}/states`, { name: 'Ready', category: 'planned', position: 0 })
    expect(otherReady.statusCode, JSON.stringify(otherReady.json())).toBe(200)
    const otherReadyId = otherReady.json<{ id: string }>().id
    const scopedMember = await memberForTeam(f.workspaceId, otherTeamId)
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
