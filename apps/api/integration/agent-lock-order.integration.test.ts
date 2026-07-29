import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '@workmesh/db'
import { buildApp } from '../src/server.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl)
  throw new Error('Agent lock-order integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Agent lock-order integration requires a dedicated *test* database.')

const db = createDb(databaseUrl)
const app = buildApp()
type Method = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
type Response = {
  statusCode: number
  headers: Record<string, string | string[] | number | undefined>
  json: <T>() => T
}
type Human = { cookie: string; csrf: string; actorId: string }
type Agent = {
  id: string
  actorId: string
  revision: number
  installationToken: string
}
type Session = {
  id: string
  revision: number
  exchangeToken: string
}
type Fixture = {
  human: Human
  workspaceId: string
  teamId: string
  readyId: string
  projectId: string
  projectRevision: number
  workItemId: string
  workItemRevision: number
  runner: Agent
  reviewer: Agent
  session: Session
  sessionToken: string
  delegationId: string
}

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

async function register(
  human: Human,
  teamId: string,
  slug: string,
): Promise<Agent> {
  const response = await humanCall(human, 'POST', '/api/v1/agents/register', {
    name: slug,
    slug,
    provider: 'fake',
    version: '1',
    supportedProtocols: ['native_http'],
    requestedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'],
    approvedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'],
    maxConcurrency: 20,
  })
  expect(response.statusCode, JSON.stringify(response.json())).toBe(200)
  const created = response.json<{
    id: string
    revision: number
    installation_token: string
  }>()
  const grant = await humanCall(
    human,
    'PUT',
    `/api/v1/agents/${created.id}/team-access/${teamId}`,
    {
      approvedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'],
    },
  )
  expect(grant.statusCode, JSON.stringify(grant.json())).toBe(200)
  const actor = await db.query<{ actor_id: string }>(
    'SELECT actor_id FROM agent_definitions WHERE id=$1',
    [created.id],
  )
  return {
    id: created.id,
    actorId: actor.rows[0]!.actor_id,
    revision: created.revision,
    installationToken: created.installation_token,
  }
}

async function createWork(
  fixture: Pick<Fixture, 'human' | 'teamId' | 'readyId' | 'projectId'>,
  title: string,
) {
  const response = await humanCall(fixture.human, 'POST', '/api/v1/work-items', {
    teamId: fixture.teamId,
    projectId: fixture.projectId,
    title,
    statusId: fixture.readyId,
    responsibleHumanActorId: fixture.human.actorId,
  })
  expect(response.statusCode, JSON.stringify(response.json())).toBe(200)
  return response.json<{ id: string; revision: number }>()
}

async function startAtomic(
  fixture: Pick<Fixture, 'human' | 'workspaceId' | 'teamId'>,
  agent: Agent,
  work: { id: string; revision: number },
) {
  const response = await humanCall(
    fixture.human,
    'POST',
    `/api/v1/work-items/${work.id}/agent-session`,
    {
      agentId: agent.id,
      principalHumanActorId: fixture.human.actorId,
      role: 'executor',
      requestedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'],
      initialPrompt: 'Lock order integration.',
      budget: {},
    },
    { 'if-match': `"revision-${work.revision}"` },
  )
  expect(response.statusCode, JSON.stringify(response.json())).toBe(200)
  return response.json<{ delegation: { id: string }; session: Session }>()
}

async function exchangeAndExecute(session: Session, agent: Agent): Promise<string> {
  const exchanged = await app.inject({
    method: 'POST',
    url: `/api/v1/agent-sessions/${session.id}/token/exchange`,
    payload: { exchangeToken: session.exchangeToken },
    headers: {
      authorization: `Bearer ${agent.installationToken}`,
      'idempotency-key': randomUUID(),
    },
  }) as unknown as Response
  expect(exchanged.statusCode, JSON.stringify(exchanged.json())).toBe(200)
  const token = exchanged.json<{ sessionToken: string }>().sessionToken
  const acknowledged = await agentCall(
    token,
    'POST',
    `/api/v1/agent-sessions/${session.id}/ack`,
    { summary: 'ready', externalUrls: [] },
  )
  expect(acknowledged.statusCode, JSON.stringify(acknowledged.json())).toBe(200)
  const executing = await agentCall(
    token,
    'POST',
    `/api/v1/agent-sessions/${session.id}/state`,
    { state: 'executing', reason: 'lock order integration' },
    {
      'if-match':
        `"revision-${acknowledged.json<{ revision: number }>().revision}"`,
    },
  )
  expect(executing.statusCode, JSON.stringify(executing.json())).toBe(200)
  return token
}

async function makeFixture(): Promise<Fixture> {
  const installed = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/install',
    payload: {
      name: 'Lock Order',
      slug: `lock-order-${randomUUID().slice(0, 8)}`,
      adminName: 'Admin',
      email: `${randomUUID()}@lock-order.test`,
      password: 'lock-order-password',
    },
    headers: {
      'idempotency-key': randomUUID(),
      'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN!,
    },
  }) as unknown as Response
  expect(installed.statusCode, JSON.stringify(installed.json())).toBe(200)
  const setCookie = Array.isArray(installed.headers['set-cookie'])
    ? installed.headers['set-cookie'][0]
    : installed.headers['set-cookie']
  const human: Human = {
    cookie: typeof setCookie === 'string' ? setCookie.split(';')[0] ?? '' : '',
    csrf: installed.json<{ csrfToken: string }>().csrfToken,
    actorId: '',
  }
  human.actorId = (await humanCall(human, 'GET', '/api/v1/auth/me'))
    .json<{ actor: { id: string } }>().actor.id
  const teamId = (await humanCall(human, 'GET', '/api/v1/teams'))
    .json<{ items: Array<{ id: string }> }>().items[0]!.id
  const readyId = (await humanCall(
    human,
    'GET',
    `/api/v1/teams/${teamId}/states`,
  )).json<{ items: Array<{ id: string; name: string }> }>()
    .items.find(state => state.name === 'Ready')!.id
  const projectResponse = await humanCall(human, 'POST', '/api/v1/projects', {
    teamId,
    name: 'Lock Order Project',
  })
  expect(projectResponse.statusCode, JSON.stringify(projectResponse.json())).toBe(200)
  const project = projectResponse.json<{ id: string; revision: number }>()
  const workspaceId = (await db.query<{ workspace_id: string }>(
    'SELECT workspace_id FROM projects WHERE id=$1',
    [project.id],
  )).rows[0]!.workspace_id
  const runner = await register(human, teamId, `runner-${randomUUID().slice(0, 8)}`)
  const reviewer = await register(human, teamId, `reviewer-${randomUUID().slice(0, 8)}`)
  const partial = {
    human,
    workspaceId,
    teamId,
    readyId,
    projectId: project.id,
  }
  const work = await createWork(partial, 'Lock order primary work')
  const started = await startAtomic(partial, runner, work)
  const sessionToken = await exchangeAndExecute(started.session, runner)
  return {
    ...partial,
    projectRevision: project.revision,
    workItemId: work.id,
    workItemRevision: work.revision,
    runner,
    reviewer,
    session: started.session,
    sessionToken,
    delegationId: started.delegation.id,
  }
}

async function beginGate(): Promise<{ client: PoolClient; pid: number }> {
  const client = await db.connect()
  await client.query('BEGIN')
  await client.query("SET LOCAL lock_timeout='8s'")
  await client.query("SET LOCAL statement_timeout='12s'")
  const pid = (await client.query<{ pid: number }>(
    'SELECT pg_backend_pid() AS pid',
  )).rows[0]!.pid
  return { client, pid }
}

async function closeGate(gate: { client: PoolClient }, commit = false) {
  try {
    await gate.client.query(commit ? 'COMMIT' : 'ROLLBACK')
  } finally {
    gate.client.release()
  }
}

async function waitForDirectWaiter(blockerPid: number): Promise<number> {
  const deadline = Date.now() + 6_000
  while (Date.now() < deadline) {
    const rows = (await db.query<{ pid: number; blockers: number[] }>(
      `SELECT pid,pg_blocking_pids(pid) AS blockers
         FROM pg_stat_activity
        WHERE datname=current_database()
          AND wait_event_type='Lock'
          AND pg_blocking_pids(pid)=$1::int[]`,
      [[blockerPid]],
    )).rows
    if (rows.length === 1) return rows[0]!.pid
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`No exact direct waiter behind ${blockerPid}`)
}

async function expectExactBlockers(waiterPid: number, blockers: number[]) {
  const row = (await db.query<{ blockers: number[] }>(
    'SELECT pg_blocking_pids($1) AS blockers',
    [waiterPid],
  )).rows[0]
  expect(row?.blockers).toEqual(blockers)
}

const usagePayload = (fixture: Fixture, dedupeKey = randomUUID()) => ({
  dedupeKey,
  agentId: fixture.runner.id,
  sessionId: fixture.session.id,
  projectId: fixture.projectId,
  occurredAt: new Date().toISOString(),
  costMinor: '1',
  currency: 'USD',
  costSource: 'provider_reported',
})

async function projectionCounts() {
  return (await db.query<{
    usage: number
    health: number
    events: number
    outbox: number
  }>(`SELECT
    (SELECT count(*)::int FROM usage_records) AS usage,
    (SELECT count(*)::int FROM project_health_updates) AS health,
    (SELECT count(*)::int FROM domain_events) AS events,
    (SELECT count(*)::int FROM outbox_events) AS outbox`)).rows[0]!
}

describe('Agent authority total lock order', () => {
  beforeAll(async () => {
    await applyMigrations(db)
  }, 300_000)

  beforeEach(async () => {
    await db.query('TRUNCATE workspaces CASCADE')
  })

  afterAll(async () => {
    await app.close()
    await db.end()
  })

  it('forms the exact WorkItem gate -> guard -> revoke chain and denies the reparented write', async () => {
    const fixture = await makeFixture()
    const otherProject = await humanCall(fixture.human, 'POST', '/api/v1/projects', {
      teamId: fixture.teamId,
      name: 'Three-way WorkItem destination',
    })
    expect(otherProject.statusCode, JSON.stringify(otherProject.json())).toBe(200)
    const dedupeKey = randomUUID()
    const gate = await beginGate()
    let gateOpen = true
    const errors: unknown[] = []
    try {
      await gate.client.query(
        'UPDATE work_items SET project_id=$2,revision=revision+1 WHERE id=$1',
        [fixture.workItemId, otherProject.json<{ id: string }>().id],
      )
      const guarded = agentCall(
        fixture.sessionToken,
        'POST',
        '/api/v1/usage-records',
        usagePayload(fixture, dedupeKey),
      ).catch(error => {
        errors.push(error)
        throw error
      })
      const guardPid = await waitForDirectWaiter(gate.pid)
      const revoked = humanCall(
        fixture.human,
        'DELETE',
        `/api/v1/agents/${fixture.runner.id}/team-access/${fixture.teamId}`,
      ).catch(error => {
        errors.push(error)
        throw error
      })
      const revokePid = await waitForDirectWaiter(guardPid)
      await expectExactBlockers(guardPid, [gate.pid])
      await expectExactBlockers(revokePid, [guardPid])
      await closeGate(gate, true)
      gateOpen = false
      const [guardedResponse, revokedResponse] = await Promise.all([guarded, revoked])
      expect(guardedResponse.statusCode, JSON.stringify(guardedResponse.json())).toBe(409)
      expect(guardedResponse.json<{ error: { code: string } }>()).toMatchObject({
        error: { code: 'DELEGATION_NOT_ACTIVE' },
      })
      expect(revokedResponse.statusCode, JSON.stringify(revokedResponse.json())).toBe(200)
      expect((await db.query(
        'SELECT 1 FROM usage_records WHERE workspace_id=$1 AND dedupe_key=$2',
        [fixture.workspaceId, dedupeKey],
      )).rowCount).toBe(0)
      expect((await db.query(
        `SELECT 1 FROM domain_events
          WHERE event_type='usage.recorded'
            AND payload->>'sessionId'=$1`,
        [fixture.session.id],
      )).rowCount).toBe(0)
      expect(errors.some(error =>
        typeof error === 'object' && error !== null && 'code' in error
        && (error as { code: string }).code === '40P01',
      )).toBe(false)
    } finally {
      if (gateOpen) await closeGate(gate)
    }
  })

  it('forms the exact Project delete -> health guard -> revoke chain and leaves zero health projection', async () => {
    const fixture = await makeFixture()
    const gate = await beginGate()
    let gateOpen = true
    const errors: unknown[] = []
    const before = await projectionCounts()
    try {
      await gate.client.query(
        'UPDATE projects SET deleted_at=now(),revision=revision+1 WHERE id=$1',
        [fixture.projectId],
      )
      const health = agentCall(
        fixture.sessionToken,
        'POST',
        `/api/v1/projects/${fixture.projectId}/health`,
        {
          source: 'agent',
          health: 'on_track',
          summary: 'Authority-first project health draft.',
          confidence: 0.9,
          uncertainty: 'Concurrent authority validation.',
          sources: [{
            kind: 'work_item',
            id: fixture.workItemId,
            observedAt: new Date().toISOString(),
            value: { state: 'executing' },
          }],
          publish: false,
        },
        { 'if-match': `"revision-${fixture.projectRevision}"` },
      ).catch(error => {
        errors.push(error)
        throw error
      })
      const guardPid = await waitForDirectWaiter(gate.pid)
      const revoked = humanCall(
        fixture.human,
        'DELETE',
        `/api/v1/agents/${fixture.runner.id}/team-access/${fixture.teamId}`,
      ).catch(error => {
        errors.push(error)
        throw error
      })
      const revokePid = await waitForDirectWaiter(guardPid)
      await expectExactBlockers(guardPid, [gate.pid])
      await expectExactBlockers(revokePid, [guardPid])
      await closeGate(gate, true)
      gateOpen = false
      const [healthResponse, revokedResponse] = await Promise.all([health, revoked])
      expect(healthResponse.statusCode, JSON.stringify(healthResponse.json())).toBe(403)
      expect(healthResponse.json<{ error: { code: string } }>()).toMatchObject({
        error: { code: 'RESOURCE_SCOPE_DENIED' },
      })
      expect(revokedResponse.statusCode, JSON.stringify(revokedResponse.json())).toBe(200)
      const after = await projectionCounts()
      expect(after.health).toBe(before.health)
      expect((await db.query(
        `SELECT 1 FROM domain_events
          WHERE event_type IN ('project.health.drafted','project.health.published')
            AND payload->>'projectId'=$1`,
        [fixture.projectId],
      )).rowCount).toBe(0)
      expect(errors.some(error =>
        typeof error === 'object' && error !== null && 'code' in error
        && (error as { code: string }).code === '40P01',
      )).toBe(false)
    } finally {
      if (gateOpen) await closeGate(gate)
    }
  })

  it('waits at Definition before Session and WorkItem and denies Usage after reparent', async () => {
    const fixture = await makeFixture()
    const otherProject = await humanCall(fixture.human, 'POST', '/api/v1/projects', {
      teamId: fixture.teamId,
      name: 'Reparent destination',
    })
    expect(otherProject.statusCode, JSON.stringify(otherProject.json())).toBe(200)
    const otherProjectId = otherProject.json<{ id: string }>().id
    const gate = await beginGate()
    let gateOpen = true
    try {
      await gate.client.query(
        'SELECT id FROM agent_definitions WHERE id=$1 FOR UPDATE',
        [fixture.runner.id],
      )
      const before = await projectionCounts()
      const usage = agentCall(
        fixture.sessionToken,
        'POST',
        '/api/v1/usage-records',
        usagePayload(fixture),
      )
      await waitForDirectWaiter(gate.pid)
      const resourceWriter = await beginGate()
      try {
        expect((await resourceWriter.client.query(
          'SELECT id FROM agent_sessions WHERE id=$1 FOR UPDATE NOWAIT',
          [fixture.session.id],
        )).rowCount).toBe(1)
        expect((await resourceWriter.client.query(
          'SELECT id FROM work_items WHERE id=$1 FOR UPDATE NOWAIT',
          [fixture.workItemId],
        )).rowCount).toBe(1)
        expect((await resourceWriter.client.query(
          'UPDATE work_items SET project_id=$2,revision=revision+1 WHERE id=$1',
          [fixture.workItemId, otherProjectId],
        )).rowCount).toBe(1)
        await closeGate(resourceWriter, true)
      } catch (error) {
        await closeGate(resourceWriter)
        throw error
      }
      await closeGate(gate)
      gateOpen = false
      const response = await usage
      expect(response.statusCode, JSON.stringify(response.json())).toBe(409)
      expect(response.json<{ error: { code: string } }>()).toMatchObject({
        error: { code: 'DELEGATION_NOT_ACTIVE' },
      })
      expect(await projectionCounts()).toEqual(before)
    } finally {
      if (gateOpen) await closeGate(gate)
    }
  })

  it('lets WorkItem reparent win while createDelegation and delegateAndStart wait on Definition', async () => {
    const fixture = await makeFixture()
    const createTarget = await createWork(fixture, 'Create delegation lock probe')
    const startTarget = await createWork(fixture, 'Atomic start lock probe')
    for (const operation of ['createDelegation', 'delegateAndStart'] as const) {
      const work = operation === 'createDelegation' ? createTarget : startTarget
      const destination = await humanCall(
        fixture.human,
        'POST',
        '/api/v1/projects',
        { teamId: fixture.teamId, name: `${operation} destination` },
      )
      expect(destination.statusCode, JSON.stringify(destination.json())).toBe(200)
      const before = (await db.query<{
        delegations: number
        sessions: number
        tokens: number
        events: number
        outbox: number
      }>(`SELECT
          (SELECT count(*)::int FROM delegations WHERE work_item_id=$1) AS delegations,
          (SELECT count(*)::int FROM agent_sessions WHERE work_item_id=$1) AS sessions,
          (SELECT count(*)::int FROM agent_session_tokens token
             JOIN agent_sessions session ON session.id=token.session_id
            WHERE session.work_item_id=$1) AS tokens,
          (SELECT count(*)::int FROM domain_events) AS events,
          (SELECT count(*)::int FROM outbox_events) AS outbox`,
        [work.id],
      )).rows[0]!
      const gate = await beginGate()
      let gateOpen = true
      try {
        await gate.client.query(
          'SELECT id FROM agent_definitions WHERE id=$1 FOR UPDATE',
          [fixture.reviewer.id],
        )
        const request = operation === 'createDelegation'
          ? humanCall(
              fixture.human,
              'POST',
              `/api/v1/work-items/${work.id}/delegations`,
              {
                agentId: fixture.reviewer.id,
                principalHumanActorId: fixture.human.actorId,
                role: 'executor',
                scopeType: 'work_item',
                scopeId: work.id,
                permissionsSnapshot: ['work:read', 'work:write'],
                capabilityScope: {
                  workspaceId: fixture.workspaceId,
                  teamIds: [fixture.teamId],
                  projectIds: [fixture.projectId],
                  workItemIds: [work.id],
                  repositoryIds: [],
                  capabilities: ['work:read', 'work:write'],
                },
              },
            )
          : humanCall(
              fixture.human,
              'POST',
              `/api/v1/work-items/${work.id}/agent-session`,
              {
                agentId: fixture.reviewer.id,
                principalHumanActorId: fixture.human.actorId,
                role: 'executor',
                requestedCapabilities: ['work:read', 'work:write'],
                initialPrompt: 'Atomic start lock probe.',
                budget: {},
              },
              { 'if-match': `"revision-${work.revision}"` },
            )
        await waitForDirectWaiter(gate.pid)
        const writer = await beginGate()
        try {
          const locked = await writer.client.query(
            'SELECT id FROM work_items WHERE id=$1 FOR UPDATE NOWAIT',
            [work.id],
          )
          expect(locked.rowCount).toBe(1)
          await writer.client.query(
            'UPDATE work_items SET project_id=$2,revision=revision+1 WHERE id=$1',
            [work.id, destination.json<{ id: string }>().id],
          )
          await closeGate(writer, true)
        } catch (error) {
          await closeGate(writer)
          throw error
        }
        await closeGate(gate)
        gateOpen = false
        const response = await request
        expect(response.statusCode, JSON.stringify(response.json())).toBe(403)
        const after = (await db.query<typeof before>(
          `SELECT
            (SELECT count(*)::int FROM delegations WHERE work_item_id=$1) AS delegations,
            (SELECT count(*)::int FROM agent_sessions WHERE work_item_id=$1) AS sessions,
            (SELECT count(*)::int FROM agent_session_tokens token
               JOIN agent_sessions session ON session.id=token.session_id
              WHERE session.work_item_id=$1) AS tokens,
            (SELECT count(*)::int FROM domain_events) AS events,
            (SELECT count(*)::int FROM outbox_events) AS outbox`,
          [work.id],
        )).rows[0]!
        expect(after).toEqual(before)
      } finally {
        if (gateOpen) await closeGate(gate)
      }
    }
  })

  it('serializes createSession, retry, and revoke with no partial Session graph', async () => {
    const fixture = await makeFixture()
    await db.query(
      'UPDATE agent_definitions SET max_concurrency=1 WHERE id=$1',
      [fixture.runner.id],
    )
    const stale = (await db.query<{ revision: number }>(
      `UPDATE agent_sessions
          SET state='stale',revision=revision+1,updated_at=now()
        WHERE id=$1
        RETURNING revision`,
      [fixture.session.id],
    )).rows[0]!
    const before = (await db.query<{ sessions: number }>(
      `SELECT count(*)::int AS sessions
         FROM agent_sessions
        WHERE agent_id=$1`,
      [fixture.runner.id],
    )).rows[0]!
    const gate = await beginGate()
    let gateOpen = true
    try {
      await gate.client.query(
        'SELECT id FROM agent_definitions WHERE id=$1 FOR UPDATE',
        [fixture.runner.id],
      )
      const create = humanCall(
        fixture.human,
        'POST',
        '/api/v1/agent-sessions',
        {
          delegationId: fixture.delegationId,
          workItemId: fixture.workItemId,
          initialPrompt: 'Concurrent direct creation.',
          budget: {},
        },
      )
      const retry = humanCall(
        fixture.human,
        'POST',
        `/api/v1/agent-sessions/${fixture.session.id}/retry`,
        {
          reason: 'Concurrent retry.',
          reuseContext: true,
        },
        { 'if-match': `"revision-${stale.revision}"` },
      )
      const revoke = humanCall(
        fixture.human,
        'DELETE',
        `/api/v1/agents/${fixture.runner.id}/team-access/${fixture.teamId}`,
      )
      const firstWaiter = await waitForDirectWaiter(gate.pid)
      await expectExactBlockers(firstWaiter, [gate.pid])
      await closeGate(gate)
      gateOpen = false
      const settled = await Promise.all([create, retry, revoke])
      expect(settled[2]!.statusCode, JSON.stringify(settled[2]!.json())).toBe(200)
      expect(settled.slice(0, 2).filter(response => response.statusCode === 200).length)
        .toBeLessThanOrEqual(1)
      for (const response of settled) {
        expect(response.statusCode).not.toBe(500)
        expect(JSON.stringify(response.json())).not.toContain('40P01')
      }
      const created = (await db.query<{
        id: string
        tokens: number
        events: number
        outbox: number
      }>(
        `SELECT session.id,
                (SELECT count(*)::int FROM agent_session_tokens token
                  WHERE token.session_id=session.id) AS tokens,
                (SELECT count(*)::int FROM domain_events event
                  WHERE event.aggregate_id=session.id
                    AND event.event_type='agent.session.created') AS events,
                (SELECT count(*)::int
                   FROM outbox_events outbox
                   JOIN domain_events event ON event.id=outbox.domain_event_id
                  WHERE event.aggregate_id=session.id
                    AND event.event_type='agent.session.created') AS outbox
           FROM agent_sessions session
          WHERE session.agent_id=$1
          ORDER BY session.created_at,session.id
          OFFSET $2`,
        [fixture.runner.id, before.sessions],
      )).rows
      expect(created.length).toBeLessThanOrEqual(1)
      for (const row of created) {
        expect(row).toMatchObject({ tokens: 1, events: 1, outbox: 1 })
      }
      const after = (await db.query<{ active_tokens: number }>(
        `SELECT count(*)::int AS active_tokens
           FROM agent_session_tokens token
           JOIN agent_sessions session ON session.id=token.session_id
          WHERE session.agent_id=$1 AND token.revoked_at IS NULL`,
        [fixture.runner.id],
      )).rows[0]!
      expect(after.active_tokens).toBe(0)
    } finally {
      if (gateOpen) await closeGate(gate)
    }
  })

  it('locks SessionToken before InstallationToken for exchange and refresh', async () => {
    const fixture = await makeFixture()
    const work = await createWork(fixture, 'Credential suborder')
    const started = await startAtomic(fixture, fixture.reviewer, work)
    const installationId = (await db.query<{ id: string }>(
      `SELECT id FROM agent_installation_tokens
        WHERE agent_id=$1 AND token_hash IS NOT NULL
        ORDER BY created_at DESC,id
        LIMIT 1`,
      [fixture.reviewer.id],
    )).rows[0]!.id
    const tokenIds = (await db.query<{ id: string }>(
      'SELECT id FROM agent_session_tokens WHERE session_id=$1 ORDER BY id',
      [started.session.id],
    )).rows.map(row => row.id)
    const exchangeIdempotencyKey = randomUUID()
    const refreshIdempotencyKey = randomUUID()
    const exchange = () => app.inject({
        method: 'POST',
        url: `/api/v1/agent-sessions/${started.session.id}/token/exchange`,
        payload: { exchangeToken: started.session.exchangeToken },
        headers: {
          authorization: `Bearer ${fixture.reviewer.installationToken}`,
          'idempotency-key': exchangeIdempotencyKey,
        },
      }) as unknown as Promise<Response>
    const refresh = () => app.inject({
        method: 'POST',
        url: `/api/v1/agent-sessions/${started.session.id}/token/refresh`,
        payload: {},
        headers: {
          authorization: `Bearer ${fixture.reviewer.installationToken}`,
          'idempotency-key': refreshIdempotencyKey,
        },
      }) as unknown as Promise<Response>
    const gate = await beginGate()
    let gateOpen = true
    let exchanged!: Response
    let refreshed!: Response
    try {
      await gate.client.query(
        'SELECT id FROM agent_installation_tokens WHERE id=$1 FOR UPDATE',
        [installationId],
      )
      const pendingExchange = exchange()
      const exchangePid = await waitForDirectWaiter(gate.pid)
      await expectExactBlockers(exchangePid, [gate.pid])
      const pendingRefresh = refresh()
      const refreshPid = await waitForDirectWaiter(exchangePid)
      await expectExactBlockers(refreshPid, [exchangePid])
      const probe = await beginGate()
      try {
        let errorCode: string | undefined
        try {
          await probe.client.query(
            `SELECT id FROM agent_session_tokens
              WHERE id=ANY($1::uuid[])
              ORDER BY id
              FOR UPDATE NOWAIT`,
            [tokenIds],
          )
        } catch (error) {
          errorCode = (error as { code?: string }).code
        }
        expect(errorCode).toBe('55P03')
      } finally {
        await closeGate(probe)
      }
      await closeGate(gate)
      gateOpen = false
      ;[exchanged, refreshed] = await Promise.all([pendingExchange, pendingRefresh])
    } finally {
      if (gateOpen) await closeGate(gate)
    }
    for (const response of [exchanged, refreshed]) {
      expect(response.statusCode, JSON.stringify(response.json())).toBe(200)
      expect(JSON.stringify(response.json())).not.toContain('40P01')
      expect(response.json<{ sessionToken: string }>().sessionToken).toBeTruthy()
    }
    const exchangeReplay = await exchange()
    const refreshReplay = await refresh()
    expect(exchangeReplay.statusCode, JSON.stringify(exchangeReplay.json())).toBe(200)
    expect(refreshReplay.statusCode, JSON.stringify(refreshReplay.json())).toBe(200)
    expect(exchangeReplay.json()).toEqual(exchanged.json())
    expect(refreshReplay.json()).toEqual(refreshed.json())
    const liveTokens = (await db.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM agent_session_tokens
        WHERE session_id=$1 AND revoked_at IS NULL`,
      [started.session.id],
    )).rows[0]!.count
    expect(liveTokens).toBe(1)
  })

  it('completes reciprocal child, review, and handoff acquisition in sorted order', async () => {
    const fixture = await makeFixture()
    const otherWork = await createWork(fixture, 'Reciprocal peer')
    const otherStarted = await startAtomic(fixture, fixture.reviewer, otherWork)
    const otherToken = await exchangeAndExecute(otherStarted.session, fixture.reviewer)
    const publish = async (
      token: string,
      sessionId: string,
      title: string,
    ) => {
      const revision = (await db.query<{ revision: number }>(
        'SELECT revision FROM agent_sessions WHERE id=$1',
        [sessionId],
      )).rows[0]!.revision
      const childStep = randomUUID()
      const reviewStep = randomUUID()
      const response = await agentCall(
        token,
        'PUT',
        `/api/v1/agent-sessions/${sessionId}/plan`,
        {
          changeSummary: 'Reciprocal lock-order plan.',
          steps: [
            {
              id: childStep,
              title: `${title} child`,
              ordinal: 0,
              dependsOn: [],
              acceptanceCriteria: [],
              expectedArtifacts: [],
              status: 'pending',
            },
            {
              id: reviewStep,
              title: `${title} review`,
              ordinal: 1,
              dependsOn: [],
              acceptanceCriteria: [],
              expectedArtifacts: [],
              status: 'pending',
            },
          ],
        },
        { 'if-match': `"revision-${revision}"` },
      )
      expect(response.statusCode, JSON.stringify(response.json())).toBe(200)
      const planVersionId = (await db.query<{ current_plan_version_id: string }>(
        'SELECT current_plan_version_id FROM agent_sessions WHERE id=$1',
        [sessionId],
      )).rows[0]!.current_plan_version_id
      return { childStep, reviewStep, planVersionId }
    }
    const [leftPlan, rightPlan] = await Promise.all([
      publish(fixture.sessionToken, fixture.session.id, 'left'),
      publish(otherToken, otherStarted.session.id, 'right'),
    ])
    const boundedPair = async (
      left: Promise<Response>,
      right: Promise<Response>,
    ) => {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Reciprocal lock-order operation timed out')), 8_000)
      })
      const responses = await Promise.race([
        Promise.all([left, right]),
        timeout,
      ])
      for (const response of responses) {
        expect(response.statusCode, JSON.stringify(response.json())).toBe(200)
        expect(JSON.stringify(response.json())).not.toContain('40P01')
      }
      return responses
    }
    const definitionIds = [fixture.runner.id, fixture.reviewer.id].sort()
    const boundedDefinitionPair = async (
      left: () => Promise<Response>,
      right: () => Promise<Response>,
    ) => {
      const gate = await beginGate()
      let gateOpen = true
      try {
        await gate.client.query(
          'SELECT id FROM agent_definitions WHERE id=$1 FOR UPDATE',
          [definitionIds[0]],
        )
        const pendingLeft = left()
        const pendingRight = right()
        const firstWaiterPid = await waitForDirectWaiter(gate.pid)
        const secondWaiterPid = await waitForDirectWaiter(firstWaiterPid)
        await expectExactBlockers(firstWaiterPid, [gate.pid])
        await expectExactBlockers(secondWaiterPid, [firstWaiterPid])
        const probe = await beginGate()
        try {
          const higher = await probe.client.query(
            'SELECT id FROM agent_definitions WHERE id=$1 FOR UPDATE NOWAIT',
            [definitionIds[1]],
          )
          expect(higher.rowCount).toBe(1)
        } finally {
          await closeGate(probe)
        }
        await closeGate(gate)
        gateOpen = false
        return await boundedPair(pendingLeft, pendingRight)
      } finally {
        if (gateOpen) await closeGate(gate)
      }
    }
    await boundedDefinitionPair(
      () => agentCall(
        fixture.sessionToken,
        'POST',
        `/api/v1/agent-sessions/${fixture.session.id}/children`,
        {
          agentId: fixture.reviewer.id,
          planStepId: leftPlan.childStep,
          planVersionId: leftPlan.planVersionId,
          initialPrompt: 'left to right child',
          budget: {},
        },
      ),
      () => agentCall(
        otherToken,
        'POST',
        `/api/v1/agent-sessions/${otherStarted.session.id}/children`,
        {
          agentId: fixture.runner.id,
          planStepId: rightPlan.childStep,
          planVersionId: rightPlan.planVersionId,
          initialPrompt: 'right to left child',
          budget: {},
        },
      ),
    )
    await db.query(
      `UPDATE agent_sessions
          SET state='completed',ended_at=now(),updated_at=now()
        WHERE parent_session_id=ANY($1::uuid[])
          AND state NOT IN ('completed','failed','canceled')`,
      [[fixture.session.id, otherStarted.session.id]],
    )
    await db.query(
      `UPDATE delegations
          SET status='completed',updated_at=now()
        WHERE id IN (
          SELECT delegation_id
            FROM agent_sessions
           WHERE parent_session_id=ANY($1::uuid[])
        )
          AND status='active'`,
      [[fixture.session.id, otherStarted.session.id]],
    )
    await boundedDefinitionPair(
      () => agentCall(
        fixture.sessionToken,
        'POST',
        `/api/v1/agent-sessions/${fixture.session.id}/review-delegations`,
        {
          reviewerAgentId: fixture.reviewer.id,
          planStepId: leftPlan.reviewStep,
          planVersionId: leftPlan.planVersionId,
          initialPrompt: 'left to right review',
          ttlSeconds: 60,
        },
      ),
      () => agentCall(
        otherToken,
        'POST',
        `/api/v1/agent-sessions/${otherStarted.session.id}/review-delegations`,
        {
          reviewerAgentId: fixture.runner.id,
          planStepId: rightPlan.reviewStep,
          planVersionId: rightPlan.planVersionId,
          initialPrompt: 'right to left review',
          ttlSeconds: 60,
        },
      ),
    )
    const [leftOffer, rightOffer] = await boundedDefinitionPair(
      () => agentCall(
        fixture.sessionToken,
        'POST',
        '/api/v1/handoffs',
        {
          fromSessionId: fixture.session.id,
          targetAgentId: fixture.reviewer.id,
          summary: 'left to right handoff',
          openQuestions: [],
          artifactIds: [],
          requestedCapabilities: ['work:read', 'work:write'],
        },
      ),
      () => agentCall(
        otherToken,
        'POST',
        '/api/v1/handoffs',
        {
          fromSessionId: otherStarted.session.id,
          targetAgentId: fixture.runner.id,
          summary: 'right to left handoff',
          openQuestions: [],
          artifactIds: [],
          requestedCapabilities: ['work:read', 'work:write'],
        },
      ),
    )
    await boundedDefinitionPair(
      () => humanCall(
        fixture.human,
        'POST',
        `/api/v1/handoffs/${leftOffer.json<{ id: string }>().id}/accept`,
        { initialPrompt: 'accept left to right' },
      ),
      () => humanCall(
        fixture.human,
        'POST',
        `/api/v1/handoffs/${rightOffer.json<{ id: string }>().id}/accept`,
        { initialPrompt: 'accept right to left' },
      ),
    )
  })
})
