import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  applyMigrations,
  appendEvent,
  createDb,
  opaqueToken,
  tokenHash,
  withTx,
} from '@workmesh/db'
import { loadFeatureConfig } from '@workmesh/config'
import { authorizeCommandInTx } from '../src/agent/guard.js'
import type { ApiActor } from '../src/agent/types.js'
import { buildApp } from '../src/server.js'
import type { AuthRateLimitStore } from '../src/auth-rate-limit/redis-store.js'
import { seedAgentSessionBearer } from './agent-session-test-credentials.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl)
  throw new Error('Route policy integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Route policy integration requires a dedicated *test* database.')

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH'
type Page<T> = { items: T[]; nextCursor: string | null }
type Response = {
  statusCode: number
  headers: Record<string, string | string[] | number | undefined>
  json: <T>() => T
  body: string
}
type Human = { actorId: string; cookie: string; csrf: string }
type AgentFixture = {
  agentId: string
  actorId: string
  delegationId: string
  sessionId: string
  workItemId: string
  token: string
}
type WorkItem = { id: string; revision: number }
type AuthorityCounts = {
  revision: number
  state: string
  state_reason: string | null
  activity_count: string
  event_count: string
  outbox_count: string
  effect_count: string
}

const db = createDb(databaseUrl)
class AllowRateLimitStore implements AuthRateLimitStore {
  async eval(script: string): Promise<unknown> {
    if (script.includes("redis.call('DEL'")) return 1
    return [1, 0]
  }
  async set(): Promise<string | null> { return 'OK' }
  async close(): Promise<void> {}
}
const app = buildApp({ authRateLimitStore: new AllowRateLimitStore() })
let appUrl = ''
let admin: Human
let workspaceId = ''
let teamA = ''
let teamB = ''
let readyA = ''
let readyB = ''
let itemA: WorkItem
let itemSameTeam: WorkItem
let itemCrossTeam: WorkItem

const humanCall = async (
  human: Human,
  method: Method,
  url: string,
  payload?: object,
  extra: Record<string, string> = {},
): Promise<Response> => await app.inject({
  method,
  url,
  payload,
  headers: {
    cookie: human.cookie,
    'x-csrf-token': human.csrf,
    'idempotency-key': randomUUID(),
    ...extra,
  },
}) as unknown as Response

const agentCall = async (
  token: string,
  method: Method,
  url: string,
  payload?: object,
  extra: Record<string, string> = {},
): Promise<Response> => await app.inject({
  method,
  url,
  payload,
  headers: {
    authorization: `Bearer ${token}`,
    'idempotency-key': randomUUID(),
    ...extra,
  },
}) as unknown as Response

const errorCode = (response: Response): string =>
  response.json<{ error: { code: string } }>().error.code

async function createHuman(
  displayName: string,
  teamId?: string,
): Promise<Human> {
  const actorId = (await db.query<{ id: string }>(
    `INSERT INTO actors(
       workspace_id,kind,workspace_role,email,display_name,password_hash
     ) VALUES($1,'human','member',$2,$3,'fixture-password-hash')
     RETURNING id`,
    [workspaceId, `${displayName.toLowerCase()}-${randomUUID()}@example.test`, displayName],
  )).rows[0]!.id
  if (teamId) {
    await db.query(
      `INSERT INTO memberships(workspace_id,team_id,actor_id,role)
       VALUES($1,$2,$3,'member')`,
      [workspaceId, teamId, actorId],
    )
  }
  const rawToken = opaqueToken()
  const csrf = opaqueToken()
  await db.query(
    `INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at)
     VALUES($1,$2,$3,now()+interval '1 day')`,
    [actorId, tokenHash(rawToken), csrf],
  )
  return { actorId, cookie: `workmesh_session=${rawToken}`, csrf }
}

async function createWorkItemFixture(
  teamId: string,
  statusId: string,
  title: string,
): Promise<WorkItem> {
  const response = await humanCall(admin, 'POST', '/api/v1/work-items', {
    teamId,
    title,
    statusId,
    responsibleHumanActorId: admin.actorId,
  })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<WorkItem>()
}

async function createAgentFixture(input: {
  slug: string
  workItemId: string
  teamId: string
  capabilities: string[]
  repositoryIds?: string[]
  projectIds?: string[]
}): Promise<AgentFixture> {
  // Every fixture is created through the Human forced-assignment route. Keep
  // its mandatory execution capabilities while retaining each test's extra
  // capability or scope-specific assertions.
  const executorCapabilities = [...new Set([
    'work:read',
    'work:write',
    ...input.capabilities,
  ])]
  const registered = await humanCall(admin, 'POST', '/api/v1/agents/register', {
    name: input.slug,
    slug: input.slug,
    provider: 'fake',
    version: '1',
    supportedProtocols: ['native_http'],
    requestedCapabilities: executorCapabilities,
    approvedCapabilities: executorCapabilities,
  })
  expect(registered.statusCode, registered.body).toBe(200)
  const registration = registered.json<{
    id: string
    actorId: string
    installation_token: string
  }>()
  const grant = await humanCall(
    admin,
    'PUT',
    `/api/v1/agents/${registration.id}/team-access/${input.teamId}`,
    { approvedCapabilities: executorCapabilities },
  )
  expect(grant.statusCode, grant.body).toBe(200)
  const workItemRevision = (await db.query<{ revision: number }>(
    'SELECT revision FROM work_items WHERE id=$1',
    [input.workItemId],
  )).rows[0]!.revision
  const started = await humanCall(
    admin,
    'POST',
    `/api/v1/work-items/${input.workItemId}/agent-session`,
    {
      agentId: registration.id,
      principalHumanActorId: admin.actorId,
      role: 'executor',
      requestedCapabilities: executorCapabilities,
      initialPrompt: 'Exercise route policy authorization.',
      budget: {},
    },
    { 'if-match': `"revision-${workItemRevision}"` },
  )
  expect(started.statusCode, started.body).toBe(200)
  const assignment = started.json<{
    delegation: { id: string }
    session: { id: string }
  }>()
  const delegationId = assignment.delegation.id
  const session = assignment.session
  await db.query(
    'UPDATE delegations SET capability_scope=$2 WHERE id=$1',
    [delegationId, {
      workspaceId,
      teamIds: [input.teamId],
      projectIds: input.projectIds ?? [],
      workItemIds: [input.workItemId],
      repositoryIds: input.repositoryIds ?? [],
      capabilities: executorCapabilities,
    }],
  )
  const token = await seedAgentSessionBearer(db, session.id, registration.id)
  if (executorCapabilities.includes('work:write')) {
    const acknowledged = await agentCall(
      token,
      'POST',
      `/api/v1/agent-sessions/${session.id}/ack`,
      { summary: 'accepted', externalUrls: [] },
    )
    expect(acknowledged.statusCode, acknowledged.body).toBe(200)
  } else {
    await db.query(
      `UPDATE agent_sessions
       SET state='acknowledged',acknowledged_at=now(),revision=revision+1
       WHERE id=$1`,
      [session.id],
    )
  }
  const actorId = (await db.query<{ actor_id: string }>(
    'SELECT actor_id FROM agent_definitions WHERE id=$1',
    [registration.id],
  )).rows[0]!.actor_id
  return {
    agentId: registration.id,
    actorId,
    delegationId,
    sessionId: session.id,
    workItemId: input.workItemId,
    token,
  }
}

async function insertEvent(input: {
  eventType: string
  teamId?: string
  aggregateType: string
  aggregateId: string
  sessionId?: string
  audienceActorId?: string
  payload?: Record<string, unknown>
}): Promise<string> {
  const eventId = await withTx(db, tx => appendEvent(tx, {
    workspaceId,
    teamId: input.teamId,
    audienceActorId: input.audienceActorId,
    actorId: admin.actorId,
    correlationId: `route-policy:${input.eventType}`,
    type: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payload: input.payload ?? {},
    sessionId: input.sessionId,
  }))
  return (await db.query<{ cursor: string }>(
    `SELECT cursor::text FROM domain_events WHERE id=$1`,
    [eventId],
  )).rows[0]!.cursor
}

async function authorityCounts(sessionId: string): Promise<AuthorityCounts> {
  return (await db.query<AuthorityCounts>(
    `SELECT s.revision,s.state,s.state_reason,
            (SELECT count(*)::text FROM agent_activities
             WHERE session_id=s.id) AS activity_count,
            (SELECT count(*)::text FROM domain_events
             WHERE workspace_id=s.workspace_id) AS event_count,
            (SELECT count(*)::text FROM outbox_events o
             JOIN domain_events e ON e.id=o.domain_event_id
             WHERE e.workspace_id=s.workspace_id) AS outbox_count,
            (SELECT count(*)::text FROM automation_effects
             WHERE workspace_id=s.workspace_id) AS effect_count
     FROM agent_sessions s WHERE s.id=$1`,
    [sessionId],
  )).rows[0]!
}

async function waitForBlockedLock(pid: number): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const blocked = (await db.query<{ blocked: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM pg_stat_activity
         WHERE pid=$1 AND wait_event_type='Lock'
       ) AS blocked`,
      [pid],
    )).rows[0]?.blocked
    if (blocked) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Connection ${pid} did not block on an authority lock`)
}

async function proveRevocationSerialization(
  fixture: AgentFixture,
  kind: 'delegation' | 'team_grant',
): Promise<void> {
  const authorityClient = await db.connect()
  const revocationClient = await db.connect()
  let authorityOpen = false
  let revocationOpen = false
  try {
    await authorityClient.query('BEGIN')
    authorityOpen = true
    const actor: ApiActor = {
      id: fixture.actorId,
      workspaceId,
      displayName: `Concurrency ${kind} agent`,
      workspaceRole: 'member',
      csrfToken: '',
      kind: 'agent',
      agentSessionId: fixture.sessionId,
      authentication: 'agent_session',
      credentialHash: tokenHash(fixture.token),
    }
    await authorizeCommandInTx(authorityClient, {
      actor,
      sessionId: fixture.sessionId,
      capability: 'work:write',
      operation: 'activity',
      idempotencyKey: randomUUID(),
      resourceId: fixture.workItemId,
    })

    await revocationClient.query('BEGIN')
    revocationOpen = true
    const revokerPid = (await revocationClient.query<{ pid: number }>(
      'SELECT pg_backend_pid() AS pid',
    )).rows[0]!.pid
    const revocation = kind === 'delegation'
      ? revocationClient.query(
        `UPDATE delegations
         SET status='revoked',revoked_at=now(),revoked_by_actor_id=$2
         WHERE id=$1 AND status='active'`,
        [fixture.delegationId, admin.actorId],
      )
      : revocationClient.query(
        `UPDATE agent_team_access
         SET revoked_at=now()
         WHERE agent_id=$1 AND team_id=$2 AND revoked_at IS NULL`,
        [fixture.agentId, teamA],
      )

    await waitForBlockedLock(revokerPid)
    await authorityClient.query('COMMIT')
    authorityOpen = false
    const revoked = await revocation
    expect(revoked.rowCount).toBe(1)
    await revocationClient.query('COMMIT')
    revocationOpen = false

    const beforeDeniedMutation = await authorityCounts(fixture.sessionId)
    const denied = await agentCall(
      fixture.token,
      'POST',
      `/api/v1/agent-sessions/${fixture.sessionId}/activities`,
      {
        kind: 'status',
        summary: `Must not persist after ${kind} revocation`,
        artifactIds: [],
        references: [],
        visibility: 'team',
        ephemeral: false,
      },
    )
    expect(denied.statusCode, denied.body).toBe(409)
    expect(errorCode(denied)).toBe('DELEGATION_NOT_ACTIVE')
    expect(await authorityCounts(fixture.sessionId)).toEqual(beforeDeniedMutation)
  } finally {
    if (authorityOpen) {
      await authorityClient.query('ROLLBACK').catch(() => undefined)
    }
    if (revocationOpen) {
      await revocationClient.query('ROLLBACK').catch(() => undefined)
    }
    authorityClient.release()
    revocationClient.release()
  }
}

beforeAll(async () => {
  await applyMigrations(db)
  await db.query('DELETE FROM platform_installation')
  appUrl = await app.listen({ port: 0, host: '127.0.0.1' })
  const installed = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/install',
    payload: {
      name: 'Route Policy Acceptance',
      slug: `route-policy-${randomUUID()}`,
      adminName: 'Route Policy Admin',
      email: `route-policy-${randomUUID()}@example.test`,
      password: 'route-policy-password',
    },
    headers: {
      'idempotency-key': randomUUID(),
      'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN!,
    },
  }) as unknown as Response
  expect(installed.statusCode, installed.body).toBe(200)
  const setCookie = installed.headers['set-cookie']
  const cookieHeader = Array.isArray(setCookie)
    ? setCookie[0]
    : typeof setCookie === 'string'
      ? setCookie
      : ''
  const cookie = cookieHeader?.split(';')[0] ?? ''
  const csrf = installed.json<{ csrfToken: string }>().csrfToken
  const me = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { cookie },
  }) as unknown as Response
  admin = {
    actorId: me.json<{ actor: { id: string } }>().actor.id,
    cookie,
    csrf,
  }
  workspaceId = (await db.query<{ workspace_id: string }>(
    'SELECT workspace_id FROM actors WHERE id=$1',
    [admin.actorId],
  )).rows[0]!.workspace_id
  teamA = (await humanCall(admin, 'GET', '/api/v1/teams'))
    .json<Page<{ id: string }>>().items[0]!.id
  const createdTeam = await humanCall(admin, 'POST', '/api/v1/teams', {
    name: 'Route Policy Other Team',
    key: `RP${randomUUID().slice(0, 6)}`.toUpperCase(),
  })
  expect(createdTeam.statusCode, createdTeam.body).toBe(200)
  teamB = createdTeam.json<{ id: string }>().id
  readyA = (await humanCall(admin, 'GET', `/api/v1/teams/${teamA}/states`))
    .json<Page<{ id: string; name: string }>>().items
    .find(state => state.name === 'Ready')!.id
  const createdReadyB = await humanCall(
    admin,
    'POST',
    `/api/v1/teams/${teamB}/states`,
    { name: 'Ready', category: 'planned', position: 1 },
  )
  expect(createdReadyB.statusCode, createdReadyB.body).toBe(200)
  readyB = createdReadyB.json<{ id: string }>().id
  itemA = await createWorkItemFixture(teamA, readyA, 'Authorized route policy item')
  itemSameTeam = await createWorkItemFixture(teamA, readyA, 'PRIVATE SAME TEAM TITLE')
  itemCrossTeam = await createWorkItemFixture(teamB, readyB, 'PRIVATE CROSS TEAM TITLE')
}, 300_000)

afterAll(async () => {
  await app.close()
  if (workspaceId) {
    await db.query(
      'DELETE FROM platform_installation WHERE workspace_id=$1',
      [workspaceId],
    )
  }
  await db.end()
}, 300_000)

describe('declarative route policy live authorization', () => {
  it('rejects an ordinary execution Session from the Human-or-Coordination forced assignment route', async () => {
    const source = await createWorkItemFixture(teamA, readyA, 'Ordinary Agent source')
    const target = await createWorkItemFixture(teamA, readyA, 'Forced assignment target')
    const ordinary = await createAgentFixture({
      slug: `ordinary-force-denied-${randomUUID()}`,
      workItemId: source.id,
      teamId: teamA,
      capabilities: ['work:read', 'work:write', 'agent:delegate'],
    })
    const denied = await agentCall(
      ordinary.token,
      'POST',
      `/api/v1/work-items/${target.id}/agent-session`,
      {
        agentId: ordinary.agentId,
        principalHumanActorId: admin.actorId,
        role: 'executor',
        requestedCapabilities: ['work:read', 'work:write'],
        initialPrompt: 'An ordinary execution Session must not force assignment.',
        budget: {},
      },
      { 'if-match': `"revision-${target.revision}"` },
    )
    expect(denied.statusCode, denied.body).toBe(401)
    expect(errorCode(denied)).toBe('UNAUTHENTICATED')
    expect((await db.query(
      'SELECT 1 FROM delegations WHERE work_item_id=$1',
      [target.id],
    )).rowCount).toBe(0)
    expect((await db.query(
      'SELECT 1 FROM agent_sessions WHERE work_item_id=$1',
      [target.id],
    )).rowCount).toBe(0)
  })

  it('fails closed across principals, resources, audit, events, revocation, and feature gates', async () => {
    const member = await createHuman('Team Member', teamA)
    const outsider = await createHuman('Outside Team')
    const primary = await createAgentFixture({
      slug: `route-policy-primary-${randomUUID()}`,
      workItemId: itemA.id,
      teamId: teamA,
      capabilities: ['work:read', 'work:write'],
    })

    const anonymousMutationWithoutIdempotency = await app.inject({
      method: 'POST',
      url: '/api/v1/work-items',
      payload: {
        teamId: teamA,
        title: 'Must not reach the handler',
        statusId: readyA,
        responsibleHumanActorId: admin.actorId,
      },
    }) as unknown as Response
    expect(anonymousMutationWithoutIdempotency.statusCode).toBe(401)
    expect(errorCode(anonymousMutationWithoutIdempotency)).toBe('UNAUTHENTICATED')

    const authenticatedMutationWithoutIdempotency = await app.inject({
      method: 'POST',
      url: '/api/v1/work-items',
      payload: {
        teamId: teamA,
        title: 'Must not reach the handler',
        statusId: readyA,
        responsibleHumanActorId: admin.actorId,
      },
      headers: {
        cookie: admin.cookie,
        'x-csrf-token': admin.csrf,
      },
    }) as unknown as Response
    expect(authenticatedMutationWithoutIdempotency.statusCode).toBe(409)
    expect(errorCode(authenticatedMutationWithoutIdempotency))
      .toBe('IDEMPOTENCY_KEY_REQUIRED')

    const bootstrapBeforeIdempotency = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      payload: {
        name: 'Must not reinstall',
        slug: 'must-not-reinstall',
        adminName: 'Must Not Reinstall',
        email: 'must-not-reinstall@example.test',
        password: 'must-not-reinstall-password',
      },
    }) as unknown as Response
    expect(bootstrapBeforeIdempotency.statusCode, bootstrapBeforeIdempotency.body)
      .toBe(401)
    expect(errorCode(bootstrapBeforeIdempotency)).toBe('BOOTSTRAP_AUTH_FAILED')

    for (const publicMutation of [{
      url: '/api/v1/auth/login',
      payload: {
        email: 'route-policy@example.test',
        password: 'not-reached',
      },
    }]) {
      const response = await app.inject({
        method: 'POST',
        url: publicMutation.url,
        payload: publicMutation.payload,
      }) as unknown as Response
      expect(response.statusCode, response.body).toBe(409)
      expect(errorCode(response)).toBe('IDEMPOTENCY_KEY_REQUIRED')
    }

    for (const installationTargetMutation of [
      `/api/v1/agent-sessions/${primary.sessionId}/token/exchange`,
      `/api/v1/agent-sessions/${primary.sessionId}/token/refresh`,
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: installationTargetMutation,
        payload: {},
      }) as unknown as Response
      expect(response.statusCode, response.body).toBe(409)
      expect(errorCode(response)).toBe('IDEMPOTENCY_KEY_REQUIRED')
    }

    const unrelated = await createAgentFixture({
      slug: `route-policy-unrelated-${randomUUID()}`,
      workItemId: itemSameTeam.id,
      teamId: teamA,
      capabilities: ['work:read'],
    })

    const anonymousFeatures = await app.inject({
      method: 'GET',
      url: '/api/v1/features',
    }) as unknown as Response
    expect(anonymousFeatures.statusCode, anonymousFeatures.body).toBe(401)
    expect((await humanCall(admin, 'GET', '/api/v1/features')).statusCode).toBe(200)
    expect((await agentCall(primary.token, 'GET', '/api/v1/features')).statusCode)
      .toBe(200)

    const inScope = await agentCall(primary.token, 'GET', `/api/v1/work-items/${itemA.id}`)
    expect(inScope.statusCode, inScope.body).toBe(200)
    expect(inScope.json<{ id: string }>().id).toBe(itemA.id)

    const sameTeamDenied = await agentCall(
      primary.token,
      'PATCH',
      `/api/v1/work-items/${itemSameTeam.id}?probe=PRIVATE_QUERY_VALUE`,
      { title: 'PRIVATE REQUEST BODY TITLE' },
      { 'if-match': `"revision-${itemSameTeam.revision}"` },
    )
    expect(sameTeamDenied.statusCode).toBe(403)
    expect(errorCode(sameTeamDenied)).toBe('RESOURCE_SCOPE_DENIED')
    expect(sameTeamDenied.body).not.toContain('PRIVATE SAME TEAM TITLE')
    expect(sameTeamDenied.body).not.toContain('PRIVATE REQUEST BODY TITLE')

    const crossTeamDenied = await agentCall(
      primary.token,
      'GET',
      `/api/v1/work-items/${itemCrossTeam.id}`,
    )
    expect(crossTeamDenied.statusCode).toBe(403)
    expect(errorCode(crossTeamDenied)).toBe('RESOURCE_SCOPE_DENIED')
    expect(crossTeamDenied.body).not.toContain('PRIVATE CROSS TEAM TITLE')

    const auditCorrelation = sameTeamDenied
      .json<{ error: { correlationId: string } }>().error.correlationId
    const audit = (await db.query<{
      policy_id: string
      operation_id: string
      route_template: string
      reason_code: string
      resource_fingerprint: string
      serialized: string
    }>(
      `SELECT policy_id,operation_id,route_template,reason_code,
              resource_fingerprint,to_jsonb(authorization_denials)::text AS serialized
       FROM authorization_denials WHERE correlation_id=$1`,
      [auditCorrelation],
    )).rows[0]!
    expect(audit).toMatchObject({
      policy_id: 'route.updateWorkItem',
      operation_id: 'updateWorkItem',
      route_template: '/api/v1/work-items/{id}',
      reason_code: 'RESOURCE_SCOPE_DENIED',
    })
    expect(audit.resource_fingerprint).toMatch(/^[0-9a-f]{64}$/)
    for (const forbidden of [
      itemSameTeam.id,
      'PRIVATE_QUERY_VALUE',
      'PRIVATE REQUEST BODY TITLE',
      'PRIVATE SAME TEAM TITLE',
      primary.token,
    ]) expect(audit.serialized).not.toContain(forbidden)

    expect((await humanCall(admin, 'GET', `/api/v1/work-items/${itemCrossTeam.id}`)).statusCode)
      .toBe(200)
    expect((await humanCall(member, 'GET', `/api/v1/work-items/${itemA.id}`)).statusCode)
      .toBe(200)
    const memberCrossTeam = await humanCall(member, 'GET', `/api/v1/work-items/${itemCrossTeam.id}`)
    expect(memberCrossTeam.statusCode).toBe(403)
    expect(errorCode(memberCrossTeam)).toBe('FORBIDDEN')
    const outsiderDenied = await humanCall(outsider, 'GET', `/api/v1/work-items/${itemA.id}`)
    expect(outsiderDenied.statusCode).toBe(403)
    expect(errorCode(outsiderDenied)).toBe('FORBIDDEN')

    const featureDisabled = await humanCall(admin, 'GET', '/api/v1/cycles')
    expect(featureDisabled.statusCode).toBe(403)
    expect(errorCode(featureDisabled)).toBe('FEATURE_DISABLED')
    const wrongKindBeforeFeatureGate = await agentCall(
      primary.token,
      'POST',
      '/api/v1/cycles',
      {},
    )
    expect(wrongKindBeforeFeatureGate.statusCode).toBe(403)
    expect(errorCode(wrongKindBeforeFeatureGate)).toBe('FORBIDDEN')

    const lease = await agentCall(primary.token, 'POST', '/api/v1/leases', {
      sessionId: primary.sessionId,
      resourceType: 'work_item',
      resourceId: itemA.id,
      kind: 'exclusive',
      reason: 'Prove a Lease does not grant authority.',
      ttlSeconds: 300,
    })
    expect(lease.statusCode, lease.body).toBe(200)
    const leaseId = lease.json<{ id: string }>().id
    await db.query(
      `UPDATE agent_definitions
       SET approved_capabilities=ARRAY['work:read']::text[] WHERE id=$1`,
      [primary.agentId],
    )
    await db.query(
      `UPDATE agent_team_access
       SET approved_capabilities=ARRAY['work:read']::text[]
       WHERE agent_id=$1 AND team_id=$2`,
      [primary.agentId, teamA],
    )
    await db.query(
      `UPDATE delegations
       SET permissions_snapshot=ARRAY['work:read']::text[] WHERE id=$1`,
      [primary.delegationId],
    )
    const leaseWithoutCapability = await agentCall(
      primary.token,
      'POST',
      `/api/v1/leases/${leaseId}/heartbeat`,
      {},
    )
    expect(leaseWithoutCapability.statusCode).toBe(403)
    expect(errorCode(leaseWithoutCapability)).toBe('CAPABILITY_DENIED')
    await db.query(
      `UPDATE agent_definitions
       SET approved_capabilities=ARRAY['work:read','work:write']::text[]
       WHERE id=$1`,
      [primary.agentId],
    )
    await db.query(
      `UPDATE agent_team_access
       SET approved_capabilities=ARRAY['work:read','work:write']::text[]
       WHERE agent_id=$1 AND team_id=$2`,
      [primary.agentId, teamA],
    )
    await db.query(
      `UPDATE delegations
       SET permissions_snapshot=ARRAY['work:read','work:write']::text[]
       WHERE id=$1`,
      [primary.delegationId],
    )

    await db.query(
      'UPDATE agent_team_access SET revoked_at=now() WHERE agent_id=$1 AND team_id=$2',
      [unrelated.agentId, teamA],
    )
    const revokedGrant = await agentCall(
      unrelated.token,
      'GET',
      `/api/v1/work-items/${itemSameTeam.id}`,
    )
    expect(revokedGrant.statusCode).toBe(409)
    expect(errorCode(revokedGrant)).toBe('DELEGATION_NOT_ACTIVE')

    const cursor = (await db.query<{ cursor: string }>(
      'SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    await insertEvent({
      eventType: 'policy.current_session',
      teamId: teamA,
      aggregateType: 'agent_session',
      aggregateId: primary.sessionId,
      sessionId: primary.sessionId,
    })
    await insertEvent({
      eventType: 'policy.explicit_recipient',
      teamId: teamA,
      aggregateType: 'work_item',
      aggregateId: itemSameTeam.id,
      audienceActorId: primary.actorId,
    })
    await insertEvent({
      eventType: 'policy.scoped_work_item',
      teamId: teamA,
      aggregateType: 'work_item',
      aggregateId: itemA.id,
    })
    await insertEvent({
      eventType: 'policy.hidden_unrelated_session',
      teamId: teamA,
      aggregateType: 'agent_session',
      aggregateId: unrelated.sessionId,
      sessionId: unrelated.sessionId,
      payload: { title: 'PRIVATE UNRELATED SESSION EVENT' },
    })
    await insertEvent({
      eventType: 'policy.hidden_same_team_item',
      teamId: teamA,
      aggregateType: 'work_item',
      aggregateId: itemSameTeam.id,
      payload: { title: 'PRIVATE SAME TEAM EVENT' },
    })
    await insertEvent({
      eventType: 'policy.hidden_cross_team_item',
      teamId: teamB,
      aggregateType: 'work_item',
      aggregateId: itemCrossTeam.id,
      payload: { title: 'PRIVATE CROSS TEAM EVENT' },
    })
    const listed = await agentCall(primary.token, 'GET', `/api/v1/events?cursor=${cursor}`)
    expect(listed.statusCode, listed.body).toBe(200)
    const eventTypes = listed.json<Array<{ event_type: string }>>()
      .map(event => event.event_type)
    expect(eventTypes).toEqual(expect.arrayContaining([
      'policy.current_session',
      'policy.explicit_recipient',
      'policy.scoped_work_item',
    ]))
    expect(eventTypes).not.toEqual(expect.arrayContaining([
      'policy.hidden_unrelated_session',
      'policy.hidden_same_team_item',
      'policy.hidden_cross_team_item',
    ]))
    expect(listed.body).not.toContain('PRIVATE UNRELATED SESSION EVENT')
    expect(listed.body).not.toContain('PRIVATE SAME TEAM EVENT')
    expect(listed.body).not.toContain('PRIVATE CROSS TEAM EVENT')

    const streamCursor = (await db.query<{ cursor: string }>(
      'SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const controller = new AbortController()
    const stream = await fetch(`${appUrl}/api/v1/events/stream?cursor=${streamCursor}`, {
      headers: { authorization: `Bearer ${primary.token}` },
      signal: controller.signal,
    })
    expect(stream.status).toBe(200)
    const reader = stream.body?.getReader()
    if (!reader) throw new Error('SSE response did not expose a reader')
    const decoder = new TextDecoder()
    let streamed = ''
    const readUntil = async (
      predicate: () => boolean,
      timeoutMs: number,
    ): Promise<'matched' | 'closed'> => {
      const expiresAt = Date.now() + timeoutMs
      while (!predicate()) {
        const remaining = expiresAt - Date.now()
        if (remaining <= 0) throw new Error('Timed out waiting for SSE evidence')
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_resolve, reject) =>
            setTimeout(() => reject(new Error('Timed out waiting for SSE chunk')), remaining)),
        ])
        if (chunk.done) return 'closed'
        streamed += decoder.decode(chunk.value, { stream: true })
      }
      return 'matched'
    }
    await insertEvent({
      eventType: 'policy.sse_visible',
      teamId: teamA,
      aggregateType: 'agent_session',
      aggregateId: primary.sessionId,
      sessionId: primary.sessionId,
    })
    expect(await readUntil(() => streamed.includes('policy.sse_visible'), 5_000))
      .toBe('matched')
    await db.query(
      `UPDATE delegations
       SET status='revoked',revoked_at=now(),revoked_by_actor_id=$2
       WHERE id=$1`,
      [primary.delegationId, admin.actorId],
    )
    await insertEvent({
      eventType: 'policy.sse_after_revoke',
      teamId: teamA,
      aggregateType: 'agent_session',
      aggregateId: primary.sessionId,
      sessionId: primary.sessionId,
      payload: { title: 'PRIVATE POST REVOCATION EVENT' },
    })
    expect(await readUntil(() => false, 5_000)).toBe('closed')
    expect(streamed).not.toContain('policy.sse_after_revoke')
    expect(streamed).not.toContain('PRIVATE POST REVOCATION EVENT')
    controller.abort()
    await reader.cancel().catch(() => undefined)
    const streamAudit = await db.query<{ reason_code: string; transport: string }>(
      `SELECT reason_code,transport FROM authorization_denials
       WHERE operation_id='streamEvents' ORDER BY occurred_at DESC LIMIT 1`,
    )
    expect(streamAudit.rows[0]).toEqual({
      reason_code: 'SESSION_NOT_ACTIVE',
      transport: 'sse',
    })
  })

  it('does not widen multi-Team initiative or dependency events to unrelated humans', async () => {
    const createdTeam = await humanCall(admin, 'POST', '/api/v1/teams', {
      name: `Realtime Unrelated ${randomUUID()}`,
      key: `RU${randomUUID().slice(0, 6)}`.toUpperCase(),
    })
    expect(createdTeam.statusCode, createdTeam.body).toBe(200)
    const unrelatedTeamId = createdTeam.json<{ id: string }>().id
    const linkedMember = await createHuman('Multi-Team linked member', teamA)
    const initiativeOwner = await createHuman(
      'Multi-Team initiative owner',
      unrelatedTeamId,
    )
    const unrelated = await createHuman(
      'Multi-Team unrelated member',
      unrelatedTeamId,
    )
    const sourceProject = (await db.query<{ id: string }>(
      `INSERT INTO projects(workspace_id,team_id,name)
       VALUES($1,$2,$3) RETURNING id`,
      [workspaceId, teamA, `Multi-Team source ${randomUUID()}`],
    )).rows[0]!
    const targetProject = (await db.query<{ id: string }>(
      `INSERT INTO projects(workspace_id,team_id,name)
       VALUES($1,$2,$3) RETURNING id`,
      [workspaceId, teamB, `Multi-Team target ${randomUUID()}`],
    )).rows[0]!
    const initiative = (await db.query<{ id: string }>(
      `INSERT INTO initiatives(workspace_id,name,owner_actor_id)
       VALUES($1,$2,$3) RETURNING id`,
      [
        workspaceId,
        `Multi-Team initiative ${randomUUID()}`,
        initiativeOwner.actorId,
      ],
    )).rows[0]!
    await db.query(
      `INSERT INTO initiative_projects(
         workspace_id,initiative_id,project_id,sort_order
       ) VALUES($1,$2,$3,0),($1,$2,$4,1)`,
      [workspaceId, initiative.id, sourceProject.id, targetProject.id],
    )
    await db.query(
      `INSERT INTO project_dependencies(
         project_id,depends_on_project_id,created_by_actor_id
       ) VALUES($1,$2,$3)`,
      [sourceProject.id, targetProject.id, admin.actorId],
    )

    const cursor = (await db.query<{ cursor: string }>(
      'SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const controller = new AbortController()
    const stream = await fetch(
      `${appUrl}/api/v1/events/stream?cursor=${cursor}`,
      {
        headers: { cookie: unrelated.cookie },
        signal: controller.signal,
      },
    )
    expect(stream.status).toBe(200)
    const reader = stream.body?.getReader()
    if (!reader) throw new Error('Human SSE response did not expose a reader')

    const initiativeSecret = `PRIVATE MULTI TEAM INITIATIVE ${randomUUID()}`
    const dependencySecret = `PRIVATE MULTI TEAM DEPENDENCY ${randomUUID()}`
    const legacyInitiativeSecret =
      `PRIVATE LEGACY MULTI TEAM INITIATIVE ${randomUUID()}`
    const legacyDependencySecret =
      `PRIVATE LEGACY MULTI TEAM DEPENDENCY ${randomUUID()}`
    await withTx(db, tx => appendEvent(tx, {
      workspaceId,
      actorId: admin.actorId,
      correlationId: `route-policy:initiative:${randomUUID()}`,
      type: 'initiative.created',
      aggregateType: 'initiative',
      aggregateId: initiative.id,
      payload: {
        projectIds: [sourceProject.id, targetProject.id],
        title: initiativeSecret,
      },
    }))
    await withTx(db, tx => appendEvent(tx, {
      workspaceId,
      actorId: admin.actorId,
      correlationId: `route-policy:dependency:${randomUUID()}`,
      type: 'project.dependency.created',
      aggregateType: 'project',
      aggregateId: sourceProject.id,
      payload: {
        dependsOnProjectId: targetProject.id,
        title: dependencySecret,
      },
    }))
    // These rows model pre-0025 events whose exact resource metadata could not
    // be reconstructed. The final audience policy must fail closed rather than
    // treating team_id NULL as Workspace visibility.
    await db.query(
      `INSERT INTO domain_events(
         workspace_id,event_type,aggregate_type,aggregate_id,actor_id,
         correlation_id,payload
       ) VALUES
         ($1,'initiative.updated','initiative',$2,$3,$4,$5),
         ($1,'project.dependency.deleted','project',$6,$3,$7,$8)`,
      [
        workspaceId,
        initiative.id,
        admin.actorId,
        `route-policy:legacy-initiative:${randomUUID()}`,
        { title: legacyInitiativeSecret },
        sourceProject.id,
        `route-policy:legacy-dependency:${randomUUID()}`,
        {
          dependsOnProjectId: targetProject.id,
          title: legacyDependencySecret,
        },
      ],
    )
    await insertEvent({
      eventType: 'policy.multi_team_direct_recipient',
      teamId: unrelatedTeamId,
      aggregateType: 'team',
      aggregateId: unrelatedTeamId,
      audienceActorId: unrelated.actorId,
    })

    const decoder = new TextDecoder()
    let streamed = ''
    const expiresAt = Date.now() + 8_000
    while (!streamed.includes('policy.multi_team_direct_recipient')) {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0)
        throw new Error('Timed out waiting for human SSE audience evidence')
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error('Timed out waiting for human SSE chunk')),
            remaining,
          )),
      ])
      if (chunk.done)
        throw new Error('Human SSE closed before audience evidence arrived')
      streamed += decoder.decode(chunk.value, { stream: true })
    }
    expect(streamed).not.toContain(initiativeSecret)
    expect(streamed).not.toContain(dependencySecret)
    expect(streamed).not.toContain(legacyInitiativeSecret)
    expect(streamed).not.toContain(legacyDependencySecret)
    controller.abort()
    await reader.cancel().catch(() => undefined)

    const listEventTypes = async (human: Human): Promise<string[]> => {
      const response = await humanCall(
        human,
        'GET',
        `/api/v1/events?cursor=${cursor}`,
      )
      expect(response.statusCode, response.body).toBe(200)
      return response.json<Array<{ event_type: string }>>()
        .map(event => event.event_type)
    }
    const adminTypes = await listEventTypes(admin)
    expect(adminTypes).toEqual(expect.arrayContaining([
      'initiative.created',
      'project.dependency.created',
      'initiative.updated',
      'project.dependency.deleted',
    ]))
    expect(adminTypes).not.toContain('policy.multi_team_direct_recipient')

    const ownerTypes = await listEventTypes(initiativeOwner)
    expect(ownerTypes).toEqual(expect.arrayContaining([
      'initiative.created',
      'initiative.updated',
    ]))
    for (const hiddenType of [
      'project.dependency.created',
      'project.dependency.deleted',
      'policy.multi_team_direct_recipient',
    ])
      expect(ownerTypes).not.toContain(hiddenType)

    const linkedTypes = await listEventTypes(linkedMember)
    expect(linkedTypes).toEqual(expect.arrayContaining([
      'initiative.created',
      'project.dependency.created',
    ]))
    for (const hiddenType of [
      'initiative.updated',
      'project.dependency.deleted',
      'policy.multi_team_direct_recipient',
    ])
      expect(linkedTypes).not.toContain(hiddenType)

    const unrelatedResponse = await humanCall(
      unrelated,
      'GET',
      `/api/v1/events?cursor=${cursor}`,
    )
    expect(unrelatedResponse.statusCode, unrelatedResponse.body).toBe(200)
    const unrelatedTypes = unrelatedResponse
      .json<Array<{ event_type: string }>>()
      .map(event => event.event_type)
    expect(unrelatedTypes).toContain('policy.multi_team_direct_recipient')
    for (const hiddenType of [
      'initiative.created',
      'project.dependency.created',
      'initiative.updated',
      'project.dependency.deleted',
    ])
      expect(unrelatedTypes).not.toContain(hiddenType)
    expect(unrelatedResponse.body).not.toContain(initiativeSecret)
    expect(unrelatedResponse.body).not.toContain(dependencySecret)
    expect(unrelatedResponse.body).not.toContain(legacyInitiativeSecret)
    expect(unrelatedResponse.body).not.toContain(legacyDependencySecret)
  }, 60_000)

  it('keeps current personal view and notification producers private across REST and SSE', async () => {
    const owner = await createHuman('Private realtime owner', teamA)
    const peer = await createHuman('Private realtime peer', teamA)
    const cursor = (await db.query<{ cursor: string }>(
      'SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const controller = new AbortController()
    const stream = await fetch(
      `${appUrl}/api/v1/events/stream?cursor=${cursor}`,
      {
        headers: { cookie: peer.cookie },
        signal: controller.signal,
      },
    )
    expect(stream.status).toBe(200)
    const reader = stream.body?.getReader()
    if (!reader) throw new Error('Private audience SSE did not expose a reader')

    const personalView = await humanCall(owner, 'POST', '/api/v1/views', {
      name: `Personal Team view ${randomUUID()}`,
      teamId: teamA,
      filters: {},
      layout: 'list',
    })
    expect(personalView.statusCode, personalView.body).toBe(200)

    const planningApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      features: loadFeatureConfig({ WORKMESH_BETA_PLANNING: 'true' }),
    })
    const planningCall = async (
      method: Method,
      url: string,
      payload: object,
    ): Promise<Response> => await planningApp.inject({
      method,
      url,
      payload,
      headers: {
        cookie: owner.cookie,
        'x-csrf-token': owner.csrf,
        'idempotency-key': randomUUID(),
      },
    }) as unknown as Response
    try {
      const advanced = await planningCall(
        'POST',
        '/api/v1/advanced-views',
        {
          name: `Private advanced view ${randomUUID()}`,
          entityType: 'issue',
          filters: {},
          ordering: [],
          visibleFields: [],
          layout: 'list',
          scope: 'private',
        },
      )
      expect(advanced.statusCode, advanced.body).toBe(200)
      const preferences = await planningCall(
        'PUT',
        '/api/v1/notification-preferences',
        {
          channels: ['in_app'],
          digest: 'immediate',
          minimumPriority: 'update',
          mutedKinds: [],
        },
      )
      expect(preferences.statusCode, preferences.body).toBe(200)
      const notification = await planningCall(
        'POST',
        '/api/v1/notifications',
        {
          recipientActorId: owner.actorId,
          priority: 'update',
          kind: 'private.realtime.test',
          title: 'Private realtime notification',
          body: 'PRIVATE CURRENT NOTIFICATION',
          sourceType: 'test',
          sourceId: randomUUID(),
          channels: ['in_app'],
          dedupeKey: randomUUID(),
        },
      )
      expect(notification.statusCode, notification.body).toBe(200)
    } finally {
      await planningApp.close()
    }

    await insertEvent({
      eventType: 'policy.private_audience_marker',
      teamId: teamA,
      aggregateType: 'team',
      aggregateId: teamA,
      audienceActorId: peer.actorId,
    })

    const decoder = new TextDecoder()
    let streamed = ''
    const expiresAt = Date.now() + 8_000
    while (!streamed.includes('policy.private_audience_marker')) {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0)
        throw new Error('Timed out waiting for private audience SSE evidence')
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) =>
          setTimeout(
            () => reject(new Error('Timed out waiting for private audience SSE chunk')),
            remaining,
          )),
      ])
      if (chunk.done)
        throw new Error('Private audience SSE closed before marker arrived')
      streamed += decoder.decode(chunk.value, { stream: true })
    }
    for (const privateType of [
      'saved_view.created',
      'view.created',
      'notification.created',
      'notification.preferences_updated',
    ])
      expect(streamed).not.toContain(privateType)
    controller.abort()
    await reader.cancel().catch(() => undefined)

    const eventTypes = async (human: Human): Promise<string[]> => {
      const response = await humanCall(
        human,
        'GET',
        `/api/v1/events?cursor=${cursor}`,
      )
      expect(response.statusCode, response.body).toBe(200)
      return response.json<Array<{ event_type: string }>>()
        .map(event => event.event_type)
    }
    const ownerTypes = await eventTypes(owner)
    expect(ownerTypes).toEqual(expect.arrayContaining([
      'saved_view.created',
      'view.created',
      'notification.created',
      'notification.preferences_updated',
    ]))
    for (const privateType of [
      'saved_view.created',
      'view.created',
      'notification.created',
      'notification.preferences_updated',
    ]) {
      expect(await eventTypes(peer)).not.toContain(privateType)
      expect(await eventTypes(admin)).not.toContain(privateType)
    }
  }, 60_000)

  it('returns a structured retryable response when realtime capacity is saturated', async () => {
    const member = await createHuman('Realtime capacity member', teamA)
    const capacityApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      realtimeMaxClients: 0,
    })
    try {
      const response = await capacityApp.inject({
        method: 'GET',
        url: '/api/v1/events/stream?cursor=0',
        headers: { cookie: member.cookie },
      }) as unknown as Response
      expect(response.statusCode, response.body).toBe(503)
      expect(response.headers['retry-after']).toBe('1')
      expect(response.json<{ error: { code: string; details: unknown } }>())
        .toMatchObject({
          error: {
            code: 'REALTIME_CAPACITY_EXCEEDED',
            details: {
              retryable: true,
              retryAfterSeconds: 1,
            },
          },
        })
    } finally {
      await capacityApp.close()
    }
  })

  it('rechecks Team and session authorization between opaque cursor pages', async () => {
    const member = await createHuman('Pagination revoke member', teamA)
    const firstPrivate = `PRIVATE PAGINATION FIRST ${randomUUID()}`
    const secondPrivate = `PRIVATE PAGINATION SECOND ${randomUUID()}`
    await createWorkItemFixture(teamA, readyA, firstPrivate)
    await createWorkItemFixture(teamA, readyA, secondPrivate)

    const firstHumanPage = await humanCall(
      member,
      'GET',
      `/api/v1/work-items?teamId=${teamA}&limit=1`,
    )
    expect(firstHumanPage.statusCode, firstHumanPage.body).toBe(200)
    const humanCursor = firstHumanPage.json<Page<{ title: string }>>().nextCursor
    expect(humanCursor).toEqual(expect.any(String))
    await db.query(
      'DELETE FROM memberships WHERE team_id=$1 AND actor_id=$2',
      [teamA, member.actorId],
    )
    const afterTeamRevoke = await humanCall(
      member,
      'GET',
      `/api/v1/work-items?teamId=${teamA}&limit=1&cursor=${encodeURIComponent(humanCursor!)}`,
    )
    expect([200, 403, 404]).toContain(afterTeamRevoke.statusCode)
    expect(afterTeamRevoke.body).not.toContain(firstPrivate)
    expect(afterTeamRevoke.body).not.toContain(secondPrivate)
    if (afterTeamRevoke.statusCode === 200)
      expect(afterTeamRevoke.json<Page<unknown>>().items).toEqual([])

    const activityWork = await createWorkItemFixture(
      teamA,
      readyA,
      `Pagination session revoke ${randomUUID()}`,
    )
    const agent = await createAgentFixture({
      slug: `pagination-revoke-${randomUUID()}`,
      workItemId: activityWork.id,
      teamId: teamA,
      capabilities: ['work:read', 'work:write'],
    })
    const nextSequence = Number((await db.query<{ sequence: string }>(
      'SELECT coalesce(max(sequence),0)::text AS sequence FROM agent_activities WHERE session_id=$1',
      [agent.sessionId],
    )).rows[0]!.sequence) + 1
    await db.query(
      `INSERT INTO agent_activities(session_id,actor_id,sequence,kind,summary)
       VALUES($1,$2,$3,'message',$4),($1,$2,$3+1,'message',$5)`,
      [agent.sessionId, agent.actorId, nextSequence, firstPrivate, secondPrivate],
    )
    const firstAgentPage = await agentCall(
      agent.token,
      'GET',
      `/api/v1/agent-sessions/${agent.sessionId}/activities?limit=1`,
    )
    expect(firstAgentPage.statusCode, firstAgentPage.body).toBe(200)
    const agentCursor = firstAgentPage.json<Page<{ summary: string }>>().nextCursor
    expect(agentCursor).toEqual(expect.any(String))
    await db.query(
      'UPDATE agent_session_tokens SET revoked_at=now() WHERE session_id=$1 AND revoked_at IS NULL',
      [agent.sessionId],
    )
    const afterSessionRevoke = await agentCall(
      agent.token,
      'GET',
      `/api/v1/agent-sessions/${agent.sessionId}/activities?limit=1&cursor=${encodeURIComponent(agentCursor!)}`,
    )
    expect(afterSessionRevoke.statusCode).toBe(401)
    expect(afterSessionRevoke.body).not.toContain(firstPrivate)
    expect(afterSessionRevoke.body).not.toContain(secondPrivate)
  })

  it('rechecks live authority inside the final paged SQL after preflight', async () => {
    const member = await createHuman('Final SQL revoke member', teamA)
    let humanRevoked = false
    const humanApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      beforePagedQuery: async route => {
        if (route !== '/api/v1/teams/:id/states' || humanRevoked) return
        humanRevoked = true
        await db.query(
          'DELETE FROM memberships WHERE team_id=$1 AND actor_id=$2',
          [teamA, member.actorId],
        )
      },
    })
    try {
      const response = await humanApp.inject({
        method: 'GET',
        url: `/api/v1/teams/${teamA}/states?limit=10`,
        headers: {
          cookie: member.cookie,
          'x-csrf-token': member.csrf,
          'idempotency-key': randomUUID(),
        },
      }) as unknown as Response
      expect(humanRevoked).toBe(true)
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json<Page<unknown>>()).toEqual({
        items: [],
        nextCursor: null,
      })
    } finally {
      await humanApp.close()
    }

    const work = await createWorkItemFixture(
      teamA,
      readyA,
      `Final SQL Agent revoke ${randomUUID()}`,
    )
    const projectId = (await db.query<{ id: string }>(
      `INSERT INTO projects(workspace_id,team_id,name)
       VALUES($1,$2,$3) RETURNING id`,
      [workspaceId, teamA, `Final SQL project ${randomUUID()}`],
    )).rows[0]!.id
    for (const url of [
      `/api/v1/actors/humans?teamId=${teamA}&limit=10`,
      `/api/v1/work-items/${work.id}/comments?limit=10`,
    ]) {
      const response = await humanCall(admin, 'GET', url)
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json<Page<unknown>>().items).toEqual(expect.any(Array))
    }
    const planningApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      features: loadFeatureConfig({ WORKMESH_BETA_PLANNING: 'true' }),
    })
    try {
      const health = await planningApp.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectId}/health?limit=10`,
        headers: { cookie: admin.cookie },
      })
      expect(health.statusCode, health.body).toBe(200)
      expect(health.json<Page<unknown>>().items).toEqual(expect.any(Array))
    } finally {
      await planningApp.close()
    }
    const roomResponse = await humanCall(
      admin,
      'GET',
      `/api/v1/rooms?workItemId=${work.id}`,
    )
    expect(roomResponse.statusCode, roomResponse.body).toBe(200)
    const roomId = roomResponse.json<{ id: string }>().id
    const timeline = await humanCall(
      admin,
      'GET',
      `/api/v1/rooms/${roomId}/timeline?limit=10`,
    )
    expect(timeline.statusCode, timeline.body).toBe(200)
    expect(timeline.json<Page<unknown>>().items).toEqual(expect.any(Array))

    const scopedAgent = await createAgentFixture({
      slug: `final-sql-revoke-${randomUUID()}`,
      workItemId: work.id,
      teamId: teamA,
      capabilities: ['work:read', 'work:write'],
    })
    for (const url of [
      `/api/v1/agent-sessions/${scopedAgent.sessionId}/plans?limit=10`,
      `/api/v1/artifacts?sessionId=${scopedAgent.sessionId}&limit=10`,
      `/api/v1/approvals?sessionId=${scopedAgent.sessionId}&limit=10`,
    ]) {
      const response = await humanCall(admin, 'GET', url)
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json<Page<unknown>>().items).toEqual(expect.any(Array))
    }
    const privateSummary = `PRIVATE FINAL SQL ACTIVITY ${randomUUID()}`
    const nextSequence = Number((await db.query<{ sequence: string }>(
      'SELECT coalesce(max(sequence),0)::text AS sequence FROM agent_activities WHERE session_id=$1',
      [scopedAgent.sessionId],
    )).rows[0]!.sequence) + 1
    await db.query(
      `INSERT INTO agent_activities(session_id,actor_id,sequence,kind,summary)
       VALUES($1,$2,$3,'message',$4)`,
      [scopedAgent.sessionId, scopedAgent.actorId, nextSequence, privateSummary],
    )
    let delegationRevoked = false
    const agentApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      beforePagedQuery: async route => {
        if (
          route !== '/api/v1/agent-sessions/:id/activities'
          || delegationRevoked
        ) return
        delegationRevoked = true
        await db.query(
          `UPDATE delegations
              SET status='revoked',revoked_at=now(),revoked_by_actor_id=$2
            WHERE id=$1 AND status='active'`,
          [scopedAgent.delegationId, admin.actorId],
        )
      },
    })
    try {
      const response = await agentApp.inject({
        method: 'GET',
        url: `/api/v1/agent-sessions/${scopedAgent.sessionId}/activities?limit=10`,
        headers: {
          authorization: `Bearer ${scopedAgent.token}`,
          'idempotency-key': randomUUID(),
        },
      }) as unknown as Response
      expect(delegationRevoked).toBe(true)
      expect(response.statusCode, response.body).toBe(200)
      expect(response.body).not.toContain(privateSummary)
      expect(response.json<Page<unknown>>()).toEqual({
        items: [],
        nextCursor: null,
      })
    } finally {
      await agentApp.close()
    }

    const tokenWork = await createWorkItemFixture(
      teamA,
      readyA,
      `Final SQL token revoke ${randomUUID()}`,
    )
    const tokenFixture = await createAgentFixture({
      slug: `final-sql-token-revoke-${randomUUID()}`,
      workItemId: tokenWork.id,
      teamId: teamA,
      capabilities: ['work:read'],
    })
    let tokenRevoked = false
    const tokenApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      beforePagedQuery: async route => {
        if (route !== '/api/v1/work-items' || tokenRevoked) return
        tokenRevoked = true
        await db.query(
          `UPDATE agent_session_tokens
              SET revoked_at=now()
            WHERE session_id=$1 AND revoked_at IS NULL`,
          [tokenFixture.sessionId],
        )
      },
    })
    try {
      const response = await tokenApp.inject({
        method: 'GET',
        url: '/api/v1/work-items?limit=10',
        headers: {
          authorization: `Bearer ${tokenFixture.token}`,
          'idempotency-key': randomUUID(),
        },
      }) as unknown as Response
      expect(tokenRevoked).toBe(true)
      expect(response.statusCode, response.body).toBe(200)
      expect(response.body).not.toContain(tokenWork.id)
      expect(response.json<Page<unknown>>()).toEqual({
        items: [],
        nextCursor: null,
      })
    } finally {
      await tokenApp.close()
    }

    const serviceActorId = (await db.query<{ id: string }>(
      `INSERT INTO actors(workspace_id,kind,display_name)
       VALUES($1,'service',$2) RETURNING id`,
      [workspaceId, `Final SQL repository service ${randomUUID()}`],
    )).rows[0]!.id
    const connectionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_connections(
         workspace_id,provider,external_account_id,display_name,
         service_actor_id,webhook_secret_ciphertext
       ) VALUES($1,'fake',$2,$3,$4,$5) RETURNING id`,
      [
        workspaceId,
        randomUUID(),
        `Final SQL fake provider ${randomUUID()}`,
        serviceActorId,
        Buffer.from('final-sql-fake-secret'),
      ],
    )).rows[0]!.id
    const repositoryId = (await db.query<{ id: string }>(
      `INSERT INTO repositories(
         workspace_id,connection_id,team_id,external_id,full_name,default_branch
       ) VALUES($1,$2,$3,$4,$5,'main') RETURNING id`,
      [
        workspaceId,
        connectionId,
        teamA,
        randomUUID(),
        `workmesh/final-sql-${randomUUID()}`,
      ],
    )).rows[0]!.id
    const repositoryWork = await createWorkItemFixture(
      teamA,
      readyA,
      `Final SQL Team grant revoke ${randomUUID()}`,
    )
    const repositoryFixture = await createAgentFixture({
      slug: `final-sql-repository-revoke-${randomUUID()}`,
      workItemId: repositoryWork.id,
      teamId: teamA,
      capabilities: ['work:read', 'repo:read'],
      repositoryIds: [repositoryId],
    })
    await db.query(
      `INSERT INTO repository_contexts(
         workspace_id,repository_id,session_id,base_branch,base_sha,
         branch_pattern,allowed_paths,permissions,guidance_manifest_hash,
         created_by_actor_id
       ) VALUES(
         $1,$2,$3,'main','base','workmesh/{workItemKey}-{slug}',
         ARRAY['**'],ARRAY['read'],$4,$5
       )`,
      [
        workspaceId,
        repositoryId,
        repositoryFixture.sessionId,
        `sha256:${'b'.repeat(64)}`,
        admin.actorId,
      ],
    )
    let teamGrantRevoked = false
    const repositoryApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      beforePagedQuery: async route => {
        if (route !== '/api/v1/repositories' || teamGrantRevoked) return
        teamGrantRevoked = true
        await db.query(
          `UPDATE agent_team_access
              SET revoked_at=now()
            WHERE agent_id=$1 AND team_id=$2 AND revoked_at IS NULL`,
          [repositoryFixture.agentId, teamA],
        )
      },
    })
    try {
      const response = await repositoryApp.inject({
        method: 'GET',
        url: '/api/v1/repositories?limit=10',
        headers: {
          authorization: `Bearer ${repositoryFixture.token}`,
          'idempotency-key': randomUUID(),
        },
      }) as unknown as Response
      expect(teamGrantRevoked).toBe(true)
      expect(response.statusCode, response.body).toBe(200)
      expect(response.body).not.toContain(repositoryId)
      expect(response.json<Page<unknown>>()).toEqual({
        items: [],
        nextCursor: null,
      })
    } finally {
      await repositoryApp.close()
    }

    const sessionListWork = await createWorkItemFixture(
      teamA,
      readyA,
      `Final SQL session-list token revoke ${randomUUID()}`,
    )
    const sessionListFixture = await createAgentFixture({
      slug: `final-sql-session-list-${randomUUID()}`,
      workItemId: sessionListWork.id,
      teamId: teamA,
      capabilities: ['work:read'],
    })
    let sessionListTokenRevoked = false
    const sessionListApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      beforePagedQuery: async route => {
        if (route !== '/api/v1/agent-sessions' || sessionListTokenRevoked) return
        sessionListTokenRevoked = true
        await db.query(
          `UPDATE agent_session_tokens
              SET revoked_at=now()
            WHERE session_id=$1 AND revoked_at IS NULL`,
          [sessionListFixture.sessionId],
        )
      },
    })
    try {
      const response = await sessionListApp.inject({
        method: 'GET',
        url: '/api/v1/agent-sessions?limit=10',
        headers: {
          authorization: `Bearer ${sessionListFixture.token}`,
          'idempotency-key': randomUUID(),
        },
      }) as unknown as Response
      expect(sessionListTokenRevoked).toBe(true)
      expect(response.statusCode, response.body).toBe(200)
      expect(response.body).not.toContain(sessionListFixture.sessionId)
      expect(response.json<Page<unknown>>()).toEqual({
        items: [],
        nextCursor: null,
      })
    } finally {
      await sessionListApp.close()
    }

    const leaseWork = await createWorkItemFixture(
      teamA,
      readyA,
      `Final SQL lease delegation revoke ${randomUUID()}`,
    )
    const leaseFixture = await createAgentFixture({
      slug: `final-sql-lease-list-${randomUUID()}`,
      workItemId: leaseWork.id,
      teamId: teamA,
      capabilities: ['work:read', 'work:write'],
    })
    const lease = await agentCall(leaseFixture.token, 'POST', '/api/v1/leases', {
      sessionId: leaseFixture.sessionId,
      resourceType: 'work_item',
      resourceId: leaseWork.id,
      kind: 'exclusive',
      reason: 'Exercise final SQL delegation revocation.',
      ttlSeconds: 300,
    })
    expect(lease.statusCode, lease.body).toBe(200)
    const leaseId = lease.json<{ id: string }>().id
    let leaseDelegationRevoked = false
    const leaseListApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      beforePagedQuery: async route => {
        if (route !== '/api/v1/leases' || leaseDelegationRevoked) return
        leaseDelegationRevoked = true
        await db.query(
          `UPDATE delegations
              SET status='revoked',revoked_at=now(),revoked_by_actor_id=$2
            WHERE id=$1 AND status='active'`,
          [leaseFixture.delegationId, admin.actorId],
        )
      },
    })
    try {
      const response = await leaseListApp.inject({
        method: 'GET',
        url: '/api/v1/leases?limit=10',
        headers: {
          authorization: `Bearer ${leaseFixture.token}`,
          'idempotency-key': randomUUID(),
        },
      }) as unknown as Response
      expect(leaseDelegationRevoked).toBe(true)
      expect(response.statusCode, response.body).toBe(200)
      expect(response.body).not.toContain(leaseId)
      expect(response.json<Page<unknown>>()).toEqual({
        items: [],
        nextCursor: null,
      })
    } finally {
      await leaseListApp.close()
    }

    const handoffSourceWork = await createWorkItemFixture(
      teamA,
      readyA,
      `Final SQL handoff Team grant revoke ${randomUUID()}`,
    )
    const handoffSource = await createAgentFixture({
      slug: `final-sql-handoff-source-${randomUUID()}`,
      workItemId: handoffSourceWork.id,
      teamId: teamA,
      capabilities: ['work:read', 'work:write'],
    })
    const handoffTargetWork = await createWorkItemFixture(
      teamA,
      readyA,
      `Final SQL handoff target ${randomUUID()}`,
    )
    const handoffTarget = await createAgentFixture({
      slug: `final-sql-handoff-target-${randomUUID()}`,
      workItemId: handoffTargetWork.id,
      teamId: teamA,
      capabilities: ['work:read'],
    })
    const handoff = await agentCall(
      handoffSource.token,
      'POST',
      '/api/v1/handoffs',
      {
        fromSessionId: handoffSource.sessionId,
        targetAgentId: handoffTarget.agentId,
        summary: 'Exercise final SQL Team-grant revocation.',
        completedWork: [],
        remainingWork: ['Verify live authority.'],
        openQuestions: [],
        risks: [],
        acceptanceCriteria: ['Revoked readers see no handoff.'],
        artifactIds: [],
        requestedCapabilities: ['work:read'],
        leaseTransferPolicy: 'retain',
      },
    )
    expect(handoff.statusCode, handoff.body).toBe(200)
    const handoffId = handoff.json<{ id: string }>().id
    let handoffGrantRevoked = false
    const handoffListApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      beforePagedQuery: async route => {
        if (route !== '/api/v1/handoffs' || handoffGrantRevoked) return
        handoffGrantRevoked = true
        await db.query(
          `UPDATE agent_team_access
              SET revoked_at=now()
            WHERE agent_id=$1 AND team_id=$2 AND revoked_at IS NULL`,
          [handoffSource.agentId, teamA],
        )
      },
    })
    try {
      const response = await handoffListApp.inject({
        method: 'GET',
        url: '/api/v1/handoffs?limit=10',
        headers: {
          authorization: `Bearer ${handoffSource.token}`,
          'idempotency-key': randomUUID(),
        },
      }) as unknown as Response
      expect(handoffGrantRevoked).toBe(true)
      expect(response.statusCode, response.body).toBe(200)
      expect(response.body).not.toContain(handoffId)
      expect(response.json<Page<unknown>>()).toEqual({
        items: [],
        nextCursor: null,
      })
    } finally {
      await handoffListApp.close()
    }

    const templateWork = await createWorkItemFixture(
      teamA,
      readyA,
      `Final SQL template token revoke ${randomUUID()}`,
    )
    const templateFixture = await createAgentFixture({
      slug: `final-sql-template-list-${randomUUID()}`,
      workItemId: templateWork.id,
      teamId: teamA,
      capabilities: ['work:read'],
    })
    const templateId = (await db.query<{ id: string }>(
      `INSERT INTO templates(
         workspace_id,team_id,kind,name,description,owner_actor_id,status
       ) VALUES($1,$2,'agent_run',$3,'Final SQL fixture',$4,'active')
       RETURNING id`,
      [
        workspaceId,
        teamA,
        `Final SQL template ${randomUUID()}`,
        admin.actorId,
      ],
    )).rows[0]!.id
    const templateVersionId = (await db.query<{ id: string }>(
      `INSERT INTO template_versions(
         template_id,version,body,change_summary,created_by_actor_id
       ) VALUES($1,1,'{}','Initial fixture',$2) RETURNING id`,
      [templateId, admin.actorId],
    )).rows[0]!.id
    await db.query(
      'UPDATE templates SET current_version_id=$2 WHERE id=$1',
      [templateId, templateVersionId],
    )
    const loopId = (await db.query<{ id: string }>(
      `INSERT INTO loops(
         workspace_id,team_id,name,owner_actor_id,agent_id,
         run_template_version_id,trigger,budget,visibility,
         failure_notification,state
       ) VALUES(
         $1,$2,$3,$4,$5,$6,'{}','{}','team','none','active'
       ) RETURNING id`,
      [
        workspaceId,
        teamA,
        `Final SQL loop ${randomUUID()}`,
        admin.actorId,
        templateFixture.agentId,
        templateVersionId,
      ],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO automation_runs(
         workspace_id,team_id,loop_id,session_id,status,max_attempts
       ) VALUES($1,$2,$3,$4,'running',1)`,
      [workspaceId, teamA, loopId, templateFixture.sessionId],
    )
    let templateTokenRevoked = false
    const templateListApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      features: loadFeatureConfig({ WORKMESH_BETA_TEMPLATES: 'true' }),
      beforePagedQuery: async route => {
        if (route !== '/api/v1/templates' || templateTokenRevoked) return
        templateTokenRevoked = true
        await db.query(
          `UPDATE agent_session_tokens
              SET revoked_at=now()
            WHERE session_id=$1 AND revoked_at IS NULL`,
          [templateFixture.sessionId],
        )
      },
    })
    try {
      const response = await templateListApp.inject({
        method: 'GET',
        url: '/api/v1/templates?limit=10',
        headers: {
          authorization: `Bearer ${templateFixture.token}`,
          'idempotency-key': randomUUID(),
        },
      }) as unknown as Response
      expect(templateTokenRevoked).toBe(true)
      expect(response.statusCode, response.body).toBe(200)
      expect(response.body).not.toContain(templateId)
      expect(response.json<Page<unknown>>()).toEqual({
        items: [],
        nextCursor: null,
      })
    } finally {
      await templateListApp.close()
    }
  })

  it('rechecks all remaining Agent-readable collection authority in final paged SQL', async () => {
    const createPagedAgent = async (label: string): Promise<AgentFixture> => {
      const work = await createWorkItemFixture(
        teamA,
        readyA,
        `Final SQL ${label} ${randomUUID()}`,
      )
      return createAgentFixture({
        slug: `final-sql-${label}-${randomUUID()}`,
        workItemId: work.id,
        teamId: teamA,
        capabilities: ['work:read'],
      })
    }

    const teamFixture = await createPagedAgent('teams')

    const projectFixture = await createPagedAgent('projects')
    const projectId = (await db.query<{ id: string }>(
      `INSERT INTO projects(workspace_id,team_id,name)
       VALUES($1,$2,$3) RETURNING id`,
      [workspaceId, teamA, `Final SQL remaining project ${randomUUID()}`],
    )).rows[0]!.id
    await db.query(
      'UPDATE work_items SET project_id=$2 WHERE id=$1',
      [projectFixture.workItemId, projectId],
    )

    const viewFixture = await createPagedAgent('views')

    const cycleFixture = await createPagedAgent('cycles')
    const cycleStartsAt = new Date(Date.now() + 31 * 86_400_000)
    const cycleEndsAt = new Date(cycleStartsAt.getTime() + 7 * 86_400_000)
    const cycleId = (await db.query<{ id: string }>(
      `INSERT INTO cycles(
         workspace_id,team_id,name,starts_at,ends_at,duration_weeks,created_by_actor_id
       ) VALUES($1,$2,$3,$4,$5,1,$6) RETURNING id`,
      [
        workspaceId,
        teamA,
        `Final SQL remaining cycle ${randomUUID()}`,
        cycleStartsAt,
        cycleEndsAt,
        admin.actorId,
      ],
    )).rows[0]!.id

    const initiativeFixture = await createPagedAgent('initiatives')
    const initiativeProjectId = (await db.query<{ id: string }>(
      `INSERT INTO projects(workspace_id,team_id,name)
       VALUES($1,$2,$3) RETURNING id`,
      [workspaceId, teamA, `Final SQL initiative project ${randomUUID()}`],
    )).rows[0]!.id
    await db.query(
      'UPDATE work_items SET project_id=$2 WHERE id=$1',
      [initiativeFixture.workItemId, initiativeProjectId],
    )
    const initiativeId = (await db.query<{ id: string }>(
      `INSERT INTO initiatives(
         workspace_id,name,owner_actor_id,status,priority,health
       ) VALUES($1,$2,$3,'planned','none','unknown') RETURNING id`,
      [
        workspaceId,
        `Final SQL remaining initiative ${randomUUID()}`,
        admin.actorId,
      ],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO initiative_projects(workspace_id,initiative_id,project_id)
       VALUES($1,$2,$3)`,
      [workspaceId, initiativeId, initiativeProjectId],
    )

    const advancedViewFixture = await createPagedAgent('advanced-view')
    const advancedViewId = (await db.query<{ id: string }>(
      `INSERT INTO advanced_saved_views(
         workspace_id,owner_actor_id,name,entity_type,filters,ordering,
         visible_fields,layout,scope
       ) VALUES($1,$2,$3,'issue','{}','[]','{}','list','workspace')
       RETURNING id`,
      [
        workspaceId,
        admin.actorId,
        `Final SQL remaining advanced view ${randomUUID()}`,
      ],
    )).rows[0]!.id

    const ruleFixture = await createPagedAgent('automation-rule')
    const ruleId = (await db.query<{ id: string }>(
      `INSERT INTO automation_rules(workspace_id,team_id,name,created_by_actor_id)
       VALUES($1,$2,$3,$4) RETURNING id`,
      [
        workspaceId,
        teamA,
        `Final SQL remaining automation rule ${randomUUID()}`,
        admin.actorId,
      ],
    )).rows[0]!.id
    const ruleVersionId = (await db.query<{ id: string }>(
      `INSERT INTO automation_rule_versions(
         rule_id,version,trigger,actions,max_attempts,created_by_actor_id
       ) VALUES($1,1,$2,$3,3,$4) RETURNING id`,
      [
        ruleId,
        { type: 'manual' },
        JSON.stringify([{ type: 'notify', parameters: {} }]),
        admin.actorId,
      ],
    )).rows[0]!.id
    await db.query(
      'UPDATE automation_rules SET current_version_id=$2 WHERE id=$1',
      [ruleId, ruleVersionId],
    )

    const runFixture = await createPagedAgent('automation-run')
    const runId = (await db.query<{ id: string }>(
      `INSERT INTO automation_runs(
         workspace_id,team_id,session_id,status,max_attempts
       ) VALUES($1,$2,$3,'running',1) RETURNING id`,
      [workspaceId, teamA, runFixture.sessionId],
    )).rows[0]!.id

    const loopFixture = await createPagedAgent('loops')
    const loopTemplateId = (await db.query<{ id: string }>(
      `INSERT INTO templates(
         workspace_id,team_id,kind,name,description,owner_actor_id,status
       ) VALUES($1,$2,'agent_run',$3,'Final SQL fixture',$4,'active')
       RETURNING id`,
      [
        workspaceId,
        teamA,
        `Final SQL remaining loop template ${randomUUID()}`,
        admin.actorId,
      ],
    )).rows[0]!.id
    const loopTemplateVersionId = (await db.query<{ id: string }>(
      `INSERT INTO template_versions(
         template_id,version,body,change_summary,created_by_actor_id
       ) VALUES($1,1,'{}','Initial fixture',$2) RETURNING id`,
      [loopTemplateId, admin.actorId],
    )).rows[0]!.id
    await db.query(
      'UPDATE templates SET current_version_id=$2 WHERE id=$1',
      [loopTemplateId, loopTemplateVersionId],
    )
    const loopId = (await db.query<{ id: string }>(
      `INSERT INTO loops(
         workspace_id,team_id,name,owner_actor_id,agent_id,
         run_template_version_id,trigger,budget,visibility,
         failure_notification,state
       ) VALUES(
         $1,$2,$3,$4,$5,$6,'{}','{}','workspace','none','active'
       ) RETURNING id`,
      [
        workspaceId,
        teamA,
        `Final SQL remaining loop ${randomUUID()}`,
        admin.actorId,
        loopFixture.agentId,
        loopTemplateVersionId,
      ],
    )).rows[0]!.id

    type RevocationKind = 'token' | 'delegation' | 'team-grant'
    type CollectionRevocation = {
      route: string
      url: string
      fixture: AgentFixture
      kind: RevocationKind
      protectedNeedle: string
    }
    const revocations: CollectionRevocation[] = [
      {
        route: '/api/v1/teams',
        url: '/api/v1/teams?limit=10',
        fixture: teamFixture,
        kind: 'token',
        protectedNeedle: teamA,
      },
      {
        route: '/api/v1/projects',
        url: '/api/v1/projects?limit=10',
        fixture: projectFixture,
        kind: 'delegation',
        protectedNeedle: projectId,
      },
      {
        route: '/api/v1/views',
        url: '/api/v1/views?limit=10',
        fixture: viewFixture,
        kind: 'team-grant',
        protectedNeedle: 'builtin:',
      },
      {
        route: '/api/v1/cycles',
        url: '/api/v1/cycles?limit=10',
        fixture: cycleFixture,
        kind: 'token',
        protectedNeedle: cycleId,
      },
      {
        route: '/api/v1/initiatives',
        url: '/api/v1/initiatives?limit=10',
        fixture: initiativeFixture,
        kind: 'delegation',
        protectedNeedle: initiativeId,
      },
      {
        route: '/api/v1/advanced-views',
        url: '/api/v1/advanced-views?limit=10',
        fixture: advancedViewFixture,
        kind: 'team-grant',
        protectedNeedle: advancedViewId,
      },
      {
        route: '/api/v1/automation-rules',
        url: '/api/v1/automation-rules?limit=10',
        fixture: ruleFixture,
        kind: 'token',
        protectedNeedle: ruleId,
      },
      {
        route: '/api/v1/automation-runs',
        url: '/api/v1/automation-runs?limit=10',
        fixture: runFixture,
        kind: 'delegation',
        protectedNeedle: runId,
      },
      {
        route: '/api/v1/loops',
        url: '/api/v1/loops?limit=10',
        fixture: loopFixture,
        kind: 'team-grant',
        protectedNeedle: loopId,
      },
    ]
    const byRoute = new Map(revocations.map(revocation => [
      revocation.route,
      revocation,
    ]))
    const revokedRoutes = new Set<string>()
    const remainingCollectionsApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      features: loadFeatureConfig({
        WORKMESH_BETA_PLANNING: 'true',
        WORKMESH_EXPERIMENTAL_AUTOMATION: 'true',
        WORKMESH_EXPERIMENTAL_AGENT_LOOPS: 'true',
      }),
      beforePagedQuery: async route => {
        const revocation = byRoute.get(route)
        if (!revocation || revokedRoutes.has(route)) return
        revokedRoutes.add(route)
        if (revocation.kind === 'token') {
          await db.query(
            `UPDATE agent_session_tokens
                SET revoked_at=now()
              WHERE session_id=$1 AND revoked_at IS NULL`,
            [revocation.fixture.sessionId],
          )
          return
        }
        if (revocation.kind === 'delegation') {
          await db.query(
            `UPDATE delegations
                SET status='revoked',revoked_at=now(),revoked_by_actor_id=$2
              WHERE id=$1 AND status='active'`,
            [revocation.fixture.delegationId, admin.actorId],
          )
          return
        }
        await db.query(
          `UPDATE agent_team_access
              SET revoked_at=now()
            WHERE agent_id=$1 AND team_id=$2 AND revoked_at IS NULL`,
          [revocation.fixture.agentId, teamA],
        )
      },
    })
    try {
      for (const revocation of revocations) {
        const response = await remainingCollectionsApp.inject({
          method: 'GET',
          url: revocation.url,
          headers: {
            authorization: `Bearer ${revocation.fixture.token}`,
            'idempotency-key': randomUUID(),
          },
        }) as unknown as Response
        expect(
          revokedRoutes.has(revocation.route),
          `${revocation.route} must reach beforePagedQuery`,
        ).toBe(true)
        expect(
          response.statusCode,
          `${revocation.route}: ${response.body}`,
        ).toBe(200)
        expect(response.body).not.toContain(revocation.protectedNeedle)
        expect(response.json<Page<unknown>>()).toEqual({
          items: [],
          nextCursor: null,
        })
      }
    } finally {
      await remainingCollectionsApp.close()
    }
  })

  it('rechecks the six parameterized Agent collection routes in final paged SQL', async () => {
    const createParameterizedAgent = async (label: string): Promise<AgentFixture> => {
      const work = await createWorkItemFixture(
        teamA,
        readyA,
        `Final SQL parameterized ${label} ${randomUUID()}`,
      )
      return createAgentFixture({
        slug: `final-sql-parameterized-${label}-${randomUUID()}`,
        workItemId: work.id,
        teamId: teamA,
        capabilities: ['work:read'],
      })
    }

    const stateFixture = await createParameterizedAgent('states')

    const commentFixture = await createParameterizedAgent('comments')
    const commentBody = `PRIVATE PARAMETERIZED COMMENT ${randomUUID()}`
    const createdComment = await humanCall(
      admin,
      'POST',
      `/api/v1/work-items/${commentFixture.workItemId}/comments`,
      { body: commentBody },
    )
    expect(createdComment.statusCode, createdComment.body).toBe(200)
    const commentId = createdComment.json<{ id: string }>().id

    const activityFixture = await createParameterizedAgent('activities')
    const activitySummary = `PRIVATE PARAMETERIZED ACTIVITY ${randomUUID()}`
    const activitySequence = Number((await db.query<{ sequence: string }>(
      'SELECT coalesce(max(sequence),0)::text AS sequence FROM agent_activities WHERE session_id=$1',
      [activityFixture.sessionId],
    )).rows[0]!.sequence) + 1
    await db.query(
      `INSERT INTO agent_activities(session_id,actor_id,sequence,kind,summary)
       VALUES($1,$2,$3,'message',$4)`,
      [
        activityFixture.sessionId,
        activityFixture.actorId,
        activitySequence,
        activitySummary,
      ],
    )

    const planFixture = await createParameterizedAgent('plans')
    const planId = (await db.query<{ id: string }>(
      `INSERT INTO agent_plan_versions(
         session_id,revision,change_summary,author_actor_id
       ) VALUES($1,1,$2,$3) RETURNING id`,
      [
        planFixture.sessionId,
        `PRIVATE PARAMETERIZED PLAN ${randomUUID()}`,
        planFixture.actorId,
      ],
    )).rows[0]!.id

    const viewResultFixture = await createParameterizedAgent('view-results')
    const advancedViewId = (await db.query<{ id: string }>(
      `INSERT INTO advanced_saved_views(
         workspace_id,owner_actor_id,name,entity_type,filters,ordering,
         visible_fields,layout,scope
       ) VALUES($1,$2,$3,'issue','{}','[]','{}','list','workspace')
       RETURNING id`,
      [
        workspaceId,
        admin.actorId,
        `Final SQL parameterized view ${randomUUID()}`,
      ],
    )).rows[0]!.id

    const healthWork = await createWorkItemFixture(
      teamA,
      readyA,
      `Final SQL parameterized health ${randomUUID()}`,
    )
    const projectId = (await db.query<{ id: string }>(
      `INSERT INTO projects(workspace_id,team_id,name)
       VALUES($1,$2,$3) RETURNING id`,
      [workspaceId, teamA, `Final SQL parameterized project ${randomUUID()}`],
    )).rows[0]!.id
    await db.query(
      'UPDATE work_items SET project_id=$2 WHERE id=$1',
      [healthWork.id, projectId],
    )
    const healthFixture = await createAgentFixture({
      slug: `final-sql-parameterized-health-${randomUUID()}`,
      workItemId: healthWork.id,
      teamId: teamA,
      capabilities: ['work:read'],
      projectIds: [projectId],
    })
    const healthId = (await db.query<{ id: string }>(
      `INSERT INTO project_health_updates(
         workspace_id,project_id,author_actor_id,source,health,summary,
         confidence,uncertainty,status,published_at
       ) VALUES($1,$2,$3,'human','on_track',$4,1,'none','published',now())
       RETURNING id`,
      [
        workspaceId,
        projectId,
        admin.actorId,
        `PRIVATE PARAMETERIZED HEALTH ${randomUUID()}`,
      ],
    )).rows[0]!.id

    type ParameterizedRevocation = {
      route: string
      url: string
      fixture: AgentFixture
      kind: 'token' | 'delegation' | 'team-grant'
      protectedNeedle: string
    }
    const revocations: ParameterizedRevocation[] = [
      {
        route: '/api/v1/teams/:id/states',
        url: `/api/v1/teams/${teamA}/states?limit=10`,
        fixture: stateFixture,
        kind: 'token',
        protectedNeedle: readyA,
      },
      {
        route: '/api/v1/work-items/:id/comments',
        url: `/api/v1/work-items/${commentFixture.workItemId}/comments?limit=10`,
        fixture: commentFixture,
        kind: 'delegation',
        protectedNeedle: commentId,
      },
      {
        route: '/api/v1/agent-sessions/:id/activities',
        url: `/api/v1/agent-sessions/${activityFixture.sessionId}/activities?limit=10`,
        fixture: activityFixture,
        kind: 'team-grant',
        protectedNeedle: activitySummary,
      },
      {
        route: '/api/v1/agent-sessions/:id/plans',
        url: `/api/v1/agent-sessions/${planFixture.sessionId}/plans?limit=10`,
        fixture: planFixture,
        kind: 'token',
        protectedNeedle: planId,
      },
      {
        route: '/api/v1/advanced-views/:id/results',
        url: `/api/v1/advanced-views/${advancedViewId}/results?limit=10`,
        fixture: viewResultFixture,
        kind: 'delegation',
        protectedNeedle: viewResultFixture.workItemId,
      },
      {
        route: '/api/v1/projects/:id/health',
        url: `/api/v1/projects/${projectId}/health?limit=10`,
        fixture: healthFixture,
        kind: 'team-grant',
        protectedNeedle: healthId,
      },
    ]

    const features = loadFeatureConfig({ WORKMESH_BETA_PLANNING: 'true' })
    const baselineApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      features,
    })
    try {
      for (const revocation of revocations) {
        const response = await baselineApp.inject({
          method: 'GET',
          url: revocation.url,
          headers: {
            authorization: `Bearer ${revocation.fixture.token}`,
            'idempotency-key': randomUUID(),
          },
        }) as unknown as Response
        expect(
          response.statusCode,
          `${revocation.route}: ${response.body}`,
        ).toBe(200)
        expect(
          response.body,
          `${revocation.route} must expose its authorized baseline row`,
        ).toContain(revocation.protectedNeedle)
      }
    } finally {
      await baselineApp.close()
    }

    const byRoute = new Map(revocations.map(revocation => [
      revocation.route,
      revocation,
    ]))
    const revokedRoutes = new Set<string>()
    const revocationApp = buildApp({
      logger: false,
      authRateLimitStore: new AllowRateLimitStore(),
      features,
      beforePagedQuery: async route => {
        const revocation = byRoute.get(route)
        if (!revocation || revokedRoutes.has(route)) return
        revokedRoutes.add(route)
        if (revocation.kind === 'token') {
          await db.query(
            `UPDATE agent_session_tokens
                SET revoked_at=now()
              WHERE session_id=$1 AND revoked_at IS NULL`,
            [revocation.fixture.sessionId],
          )
          return
        }
        if (revocation.kind === 'delegation') {
          await db.query(
            `UPDATE delegations
                SET status='revoked',revoked_at=now(),revoked_by_actor_id=$2
              WHERE id=$1 AND status='active'`,
            [revocation.fixture.delegationId, admin.actorId],
          )
          return
        }
        await db.query(
          `UPDATE agent_team_access
              SET revoked_at=now()
            WHERE agent_id=$1 AND team_id=$2 AND revoked_at IS NULL`,
          [revocation.fixture.agentId, teamA],
        )
      },
    })
    try {
      for (const revocation of revocations) {
        const response = await revocationApp.inject({
          method: 'GET',
          url: revocation.url,
          headers: {
            authorization: `Bearer ${revocation.fixture.token}`,
            'idempotency-key': randomUUID(),
          },
        }) as unknown as Response
        expect(
          revokedRoutes.has(revocation.route),
          `${revocation.route} must reach beforePagedQuery`,
        ).toBe(true)
        expect(response.statusCode, response.body).toBe(200)
        expect(response.body).not.toContain(revocation.protectedNeedle)
        expect(response.json<Page<unknown>>()).toEqual({
          items: [],
          nextCursor: null,
        })
      }
    } finally {
      await revocationApp.close()
    }
  })

  it('conceals and deduplicates explicit unresolved Team targets without breaking body-owned collection writes', async () => {
    const member = await createHuman('Explicit Target Member', teamA)
    const scopedWork = await humanCall(admin, 'POST', '/api/v1/work-items', {
      teamId: teamA,
      title: 'Isolated explicit target authorization',
      statusId: readyA,
      responsibleHumanActorId: admin.actorId,
    })
    expect(scopedWork.statusCode, scopedWork.body).toBe(200)
    const scopedAgent = await createAgentFixture({
      slug: `route-policy-explicit-target-${randomUUID()}`,
      workItemId: scopedWork.json<{ id: string }>().id,
      teamId: teamA,
      capabilities: ['work:read', 'work:write'],
    })
    const foreignWorkspaceId = (await db.query<{ id: string }>(
      `INSERT INTO workspaces(name,slug)
       VALUES('Foreign explicit target',$1)
       RETURNING id`,
      [`foreign-explicit-${randomUUID()}`],
    )).rows[0]!.id
    const foreignTeamId = (await db.query<{ id: string }>(
      `INSERT INTO teams(workspace_id,name,key)
       VALUES($1,'Foreign explicit target','FOREIGN')
       RETURNING id`,
      [foreignWorkspaceId],
    )).rows[0]!.id
    const deletedTeamId = (await db.query<{ id: string }>(
      `INSERT INTO teams(workspace_id,name,key,deleted_at)
       VALUES($1,'Deleted explicit target',$2,now())
       RETURNING id`,
      [workspaceId, `DELETED-${randomUUID()}`],
    )).rows[0]!.id
    const targets = [foreignTeamId, deletedTeamId, randomUUID()]
    const principals = [
      {
        actorId: member.actorId,
        secret: member.cookie,
        call: (teamId: string) => humanCall(member, 'GET', `/api/v1/teams/${teamId}/states?teamId=${teamA}`),
      },
      {
        actorId: scopedAgent.actorId,
        secret: scopedAgent.token,
        call: (teamId: string) => agentCall(scopedAgent.token, 'GET', `/api/v1/teams/${teamId}/states?teamId=${teamA}`),
      },
    ]

    for (const target of targets) {
      for (const principal of principals) {
        const before = Number((await db.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM authorization_denials
           WHERE principal_actor_id=$1 AND policy_id='route.listWorkflowStates'
             AND reason_code='NOT_FOUND'`,
          [principal.actorId],
        )).rows[0]!.count)
        const first = await principal.call(target)
        const duplicate = await principal.call(target)
        for (const denied of [first, duplicate]) {
          expect(denied.statusCode, denied.body).toBe(404)
          expect(errorCode(denied)).toBe('NOT_FOUND')
          expect(denied.body).not.toContain(target)
          expect(denied.body).not.toContain(principal.secret)
        }
        const audits = await db.query<{
          authorization_stage: string
          resource_fingerprint: string
          dedupe_key: string
          serialized: string
        }>(
          `SELECT authorization_stage,resource_fingerprint,dedupe_key,
                  to_jsonb(authorization_denials)::text AS serialized
           FROM authorization_denials
           WHERE principal_actor_id=$1 AND policy_id='route.listWorkflowStates'
             AND reason_code='NOT_FOUND'
           ORDER BY occurred_at`,
          [principal.actorId],
        )
        expect(audits.rowCount).toBe(before + 1)
        const audit = audits.rows.at(-1)!
        expect(audit).toMatchObject({ authorization_stage: 'resource_scope' })
        expect(audit.resource_fingerprint).toMatch(/^[0-9a-f]{64}$/)
        expect(audit.dedupe_key).toMatch(/^[0-9a-f]{64}$/)
        expect(audit.serialized).not.toContain(target)
        expect(audit.serialized).not.toContain(principal.secret)
      }
    }

    const collectionWrite = await humanCall(member, 'POST', '/api/v1/work-items', {
      teamId: teamA,
      title: 'Body-owned Team remains transactionally authorized',
      statusId: readyA,
      responsibleHumanActorId: member.actorId,
    })
    expect(collectionWrite.statusCode, collectionWrite.body).toBe(200)
  })

  it('serializes delegation and Team-grant revocation with mutation authority', async () => {
    const delegationWorkItem = await createWorkItemFixture(
      teamA,
      readyA,
      `Delegation revocation lock ${randomUUID()}`,
    )
    const delegationFixture = await createAgentFixture({
      slug: `route-policy-delegation-lock-${randomUUID()}`,
      workItemId: delegationWorkItem.id,
      teamId: teamA,
      capabilities: ['work:read', 'work:write'],
    })
    await proveRevocationSerialization(delegationFixture, 'delegation')

    const teamGrantWorkItem = await createWorkItemFixture(
      teamA,
      readyA,
      `Team grant revocation lock ${randomUUID()}`,
    )
    const teamGrantFixture = await createAgentFixture({
      slug: `route-policy-team-lock-${randomUUID()}`,
      workItemId: teamGrantWorkItem.id,
      teamId: teamA,
      capabilities: ['work:read', 'work:write'],
    })
    await proveRevocationSerialization(teamGrantFixture, 'team_grant')
  })
})
