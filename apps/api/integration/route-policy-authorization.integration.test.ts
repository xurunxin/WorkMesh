import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  applyMigrations,
  createDb,
  opaqueToken,
  tokenHash,
} from '@workmesh/db'
import { authorizeCommandInTx } from '../src/agent/guard.js'
import type { ApiActor } from '../src/agent/types.js'
import { buildApp } from '../src/server.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl)
  throw new Error('Route policy integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Route policy integration requires a dedicated *test* database.')

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH'
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
const app = buildApp()
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
}): Promise<AgentFixture> {
  const registered = await humanCall(admin, 'POST', '/api/v1/agents/register', {
    name: input.slug,
    slug: input.slug,
    provider: 'fake',
    version: '1',
    supportedProtocols: ['native_http'],
    requestedCapabilities: input.capabilities,
    approvedCapabilities: input.capabilities,
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
    { approvedCapabilities: input.capabilities },
  )
  expect(grant.statusCode, grant.body).toBe(200)
  const delegated = await humanCall(
    admin,
    'POST',
    `/api/v1/work-items/${input.workItemId}/delegations`,
    {
      agentId: registration.id,
      principalHumanActorId: admin.actorId,
      role: 'executor',
      scopeType: 'work_item',
      scopeId: input.workItemId,
      permissionsSnapshot: input.capabilities,
      capabilityScope: {
        workspaceId,
        teamIds: [input.teamId],
        projectIds: [],
        workItemIds: [input.workItemId],
        repositoryIds: [],
        capabilities: input.capabilities,
      },
    },
  )
  expect(delegated.statusCode, delegated.body).toBe(200)
  const delegationId = delegated.json<{ id: string }>().id
  const started = await humanCall(admin, 'POST', '/api/v1/agent-sessions', {
    delegationId,
    workItemId: input.workItemId,
    initialPrompt: 'Exercise route policy authorization.',
    budget: {},
  })
  expect(started.statusCode, started.body).toBe(200)
  const session = started.json<{ id: string; exchangeToken: string }>()
  const exchanged = await app.inject({
    method: 'POST',
    url: `/api/v1/agent-sessions/${session.id}/token/exchange`,
    payload: { exchangeToken: session.exchangeToken },
    headers: {
      authorization: `Bearer ${registration.installation_token}`,
      'idempotency-key': randomUUID(),
    },
  }) as unknown as Response
  expect(exchanged.statusCode, exchanged.body).toBe(200)
  const token = exchanged.json<{ sessionToken: string }>().sessionToken
  if (input.capabilities.includes('work:write')) {
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
  teamId: string
  aggregateType: string
  aggregateId: string
  sessionId?: string
  audienceActorId?: string
  payload?: Record<string, unknown>
}): Promise<number> {
  return Number((await db.query<{ cursor: string }>(
    `INSERT INTO domain_events(
       workspace_id,team_id,audience_actor_id,event_type,aggregate_type,
       aggregate_id,actor_id,correlation_id,payload,session_id
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
     RETURNING cursor::text`,
    [
      workspaceId,
      input.teamId,
      input.audienceActorId ?? null,
      input.eventType,
      input.aggregateType,
      input.aggregateId,
      admin.actorId,
      `route-policy:${input.eventType}`,
      JSON.stringify(input.payload ?? {}),
      input.sessionId ?? null,
    ],
  )).rows[0]!.cursor)
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
    .json<Array<{ id: string }>>()[0]!.id
  const createdTeam = await humanCall(admin, 'POST', '/api/v1/teams', {
    name: 'Route Policy Other Team',
    key: `RP${randomUUID().slice(0, 6)}`.toUpperCase(),
  })
  expect(createdTeam.statusCode, createdTeam.body).toBe(200)
  teamB = createdTeam.json<{ id: string }>().id
  readyA = (await humanCall(admin, 'GET', `/api/v1/teams/${teamA}/states`))
    .json<Array<{ id: string; name: string }>>()
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

    const cursor = Number((await db.query<{ cursor: string }>(
      'SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor)
    await insertEvent({
      eventType: 'policy.current-session',
      teamId: teamA,
      aggregateType: 'agent_session',
      aggregateId: primary.sessionId,
      sessionId: primary.sessionId,
    })
    await insertEvent({
      eventType: 'policy.explicit-recipient',
      teamId: teamA,
      aggregateType: 'work_item',
      aggregateId: itemSameTeam.id,
      audienceActorId: primary.actorId,
    })
    await insertEvent({
      eventType: 'policy.scoped-work-item',
      teamId: teamA,
      aggregateType: 'work_item',
      aggregateId: itemA.id,
    })
    await insertEvent({
      eventType: 'policy.hidden-unrelated-session',
      teamId: teamA,
      aggregateType: 'agent_session',
      aggregateId: unrelated.sessionId,
      sessionId: unrelated.sessionId,
      payload: { title: 'PRIVATE UNRELATED SESSION EVENT' },
    })
    await insertEvent({
      eventType: 'policy.hidden-same-team-item',
      teamId: teamA,
      aggregateType: 'work_item',
      aggregateId: itemSameTeam.id,
      payload: { title: 'PRIVATE SAME TEAM EVENT' },
    })
    await insertEvent({
      eventType: 'policy.hidden-cross-team-item',
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
      'policy.current-session',
      'policy.explicit-recipient',
      'policy.scoped-work-item',
    ]))
    expect(eventTypes).not.toEqual(expect.arrayContaining([
      'policy.hidden-unrelated-session',
      'policy.hidden-same-team-item',
      'policy.hidden-cross-team-item',
    ]))
    expect(listed.body).not.toContain('PRIVATE UNRELATED SESSION EVENT')
    expect(listed.body).not.toContain('PRIVATE SAME TEAM EVENT')
    expect(listed.body).not.toContain('PRIVATE CROSS TEAM EVENT')

    const streamCursor = Number((await db.query<{ cursor: string }>(
      'SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor)
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
      eventType: 'policy.sse-visible',
      teamId: teamA,
      aggregateType: 'agent_session',
      aggregateId: primary.sessionId,
      sessionId: primary.sessionId,
    })
    expect(await readUntil(() => streamed.includes('policy.sse-visible'), 5_000))
      .toBe('matched')
    await db.query(
      `UPDATE delegations
       SET status='revoked',revoked_at=now(),revoked_by_actor_id=$2
       WHERE id=$1`,
      [primary.delegationId, admin.actorId],
    )
    await insertEvent({
      eventType: 'policy.sse-after-revoke',
      teamId: teamA,
      aggregateType: 'agent_session',
      aggregateId: primary.sessionId,
      sessionId: primary.sessionId,
      payload: { title: 'PRIVATE POST REVOCATION EVENT' },
    })
    expect(await readUntil(() => false, 5_000)).toBe('closed')
    expect(streamed).not.toContain('policy.sse-after-revoke')
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
