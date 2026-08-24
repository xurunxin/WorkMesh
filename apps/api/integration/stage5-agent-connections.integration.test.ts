import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Writable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, opaqueToken, tokenHash } from '@workmesh/db'
import { loadFeatureConfig } from '@workmesh/config'
import { buildApp } from '../src/server.js'
import { createAgentConnectionLifecycleWorker } from '../../worker/src/agent-connections.js'
import { createWorkMeshMcpHttpServer } from '../../mcp/src/http.js'
import { seedAgentSessionBearer } from './agent-session-test-credentials.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 5 integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 5 integration requires a dedicated *test* database.')
const db = createDb(databaseUrl)
const features = loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'true' })
let app = buildApp({ features, logger: { level: 'error' } })
let cookie = '', csrf = '', actorId = '', teamId = '', teamKey = '', otherTeamId = '', readyId = '', apiBaseUrl = ''
type Reply = { statusCode: number; headers: Record<string, string|string[]|number|undefined>; json: <T>() => T; body: string }
const human = async (method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE', url: string, payload?: object, revision?: number): Promise<Reply> => app.inject({ method, url, payload, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...(revision ? { 'if-match': `"revision-${revision}"` } : {}) } }) as unknown as Reply
const coordinator = async (token: string, method: 'GET'|'POST'|'PATCH'|'DELETE', url: string, payload?: object, revision?: number): Promise<Reply> => app.inject({ method, url, payload, headers: { 'x-workmesh-installation-token': token, 'idempotency-key': randomUUID(), ...(revision ? { 'if-match': `"revision-${revision}"` } : {}) } }) as unknown as Reply
let mcpRequestId = 0
const mcpRequest = async (url: string, token: string, method: string, params: object) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-03-26',
      'x-workmesh-installation-token': token,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++mcpRequestId, method, params }),
  })
  const body = await response.text()
  expect(response.status, body).toBe(200)
  const payload = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split(/\r?\n/).find(line => line.startsWith('data: '))?.slice(6)
    : body
  if (!payload) throw new Error(`MCP response did not contain a JSON-RPC payload: ${body}`)
  return JSON.parse(payload) as { error?: unknown; result?: { isError?: boolean; structuredContent?: { data?: unknown }; content?: unknown[] } }
}
const mcpTool = async (url: string, token: string, name: string, args: object) => {
  const response = await mcpRequest(url, token, 'tools/call', { name, arguments: args })
  expect(response.error).toBeUndefined()
  expect(response.result?.isError, JSON.stringify(response.result?.content)).not.toBe(true)
  return response.result!
}
const listenApi = async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('Expected API TCP listening address')
  apiBaseUrl = `http://127.0.0.1:${address.port}`
}
const pairConnection = async (
  agentSlug: string,
  requestedCapabilities = ['work:read', 'work:write'],
) => {
  const created = await human('POST', '/api/v1/agent-connections', {
    name: `Connection ${agentSlug}`,
    agentSlug,
    clientType: 'codex',
    teamId,
    principalHumanActorId: actorId,
    requestedCapabilities,
    grantAgentDelegate: false,
  })
  expect(created.statusCode, created.body).toBe(201)
  const envelope = created.json<{
    connection: { id: string; agent_actor_id: string; revision: number }
    connect_url: string
  }>()
  const redeemed = await app.inject({
    method: 'POST',
    url: '/api/v1/agent-connections/redeem',
    payload: {
      pairingCode: new URL(envelope.connect_url).hash.slice(1),
      agentSlug,
      client: { type: 'codex', version: '1.1.0' },
    },
    headers: { 'idempotency-key': randomUUID() },
  })
  expect(redeemed.statusCode, redeemed.body).toBe(200)
  return {
    connection: envelope.connection,
    token: redeemed.json<{ installation_token: string }>().installation_token,
  }
}
type StaleSelfClaimFixture = {
  workspaceId: string
  paired: Awaited<ReturnType<typeof pairConnection>>
  agentId: string
  agentActorId: string
  workItem: { id: string; revision: number }
  delegationId: string
  staleSessionId: string
  leaseId: string
  inboxId: string
}
const createReadyWorkItem = async (title: string, projectId?: string) => {
  const created = await human('POST', '/api/v1/work-items', {
    teamId,
    ...(projectId ? { projectId } : {}),
    title,
    statusId: readyId,
    priority: 'high',
    labels: [],
    responsibleHumanActorId: actorId,
  })
  expect(created.statusCode, created.body).toBe(200)
  return created.json<{ id: string; revision: number }>()
}
const prepareStaleSelfClaimFixture = async (slug: string, projectId?: string): Promise<StaleSelfClaimFixture> => {
  const paired = await pairConnection(slug)
  const workspaceId = (await db.query<{ workspace_id: string }>(
    'SELECT workspace_id FROM actors WHERE id=$1',
    [actorId],
  )).rows[0]!.workspace_id
  const agent = (await db.query<{ agent_id: string; agent_actor_id: string }>(
    'SELECT agent_id,agent_actor_id FROM agent_connections WHERE id=$1',
    [paired.connection.id],
  )).rows[0]!
  const workItem = await createReadyWorkItem(`Stale self-claim recovery ${slug}`, projectId)
  const claimed = await coordinator(
    paired.token,
    'POST',
    `/api/v1/work-items/${workItem.id}/claim`,
    {},
    workItem.revision,
  )
  expect(claimed.statusCode, claimed.body).toBe(200)
  const claim = claimed.json<{ delegation: { id: string }; session: { id: string } }>()
  await db.query(
    `UPDATE agent_sessions
        SET state='stale',state_reason='heartbeat timeout fixture',
            last_heartbeat_at=now()-interval '1 hour',revision=revision+1,updated_at=now()
      WHERE id=$1 AND session_kind='execution'`,
    [claim.session.id],
  )
  const lease = (await db.query<{ id: string }>(
    `INSERT INTO leases(
       workspace_id,session_id,holder_actor_id,resource_type,resource_id,
       kind,status,reason,expires_at,heartbeat_at,version
     ) VALUES($1,$2,$3,'work_item',$4,'exclusive','active',
       'stale recovery fixture',now()+interval '1 hour',now(),1)
     RETURNING id`,
    [workspaceId, claim.session.id, agent.agent_actor_id, workItem.id],
  )).rows[0]!
  const inbox = (await db.query<{ id: string }>(
    `INSERT INTO inbox_items(
       workspace_id,recipient_human_actor_id,session_id,kind,source_type,source_id,payload
     ) VALUES($1,$2,$3,'session_stale','agent_session',$3,'{}'::jsonb)
     RETURNING id`,
    [workspaceId, actorId, claim.session.id],
  )).rows[0]!
  expect((await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM agent_session_tokens
      WHERE session_id=$1 AND revoked_at IS NULL`,
    [claim.session.id],
  )).rows[0]?.count).toBeGreaterThan(0)
  return {
    workspaceId,
    paired,
    agentId: agent.agent_id,
    agentActorId: agent.agent_actor_id,
    workItem,
    delegationId: claim.delegation.id,
    staleSessionId: claim.session.id,
    leaseId: lease.id,
    inboxId: inbox.id,
  }
}
const expectExactScopeClaimRejected = async (fixture: StaleSelfClaimFixture) => {
  const snapshot = async () => ({
    delegation: (await db.query<{
      status: string
      revision: number
      capability_scope: string
    }>(
      'SELECT status,revision,capability_scope::text FROM delegations WHERE id=$1',
      [fixture.delegationId],
    )).rows[0],
    session: (await db.query<{
      state: string
      revision: number
      retry_of_session_id: string | null
    }>(
      'SELECT state,revision,retry_of_session_id FROM agent_sessions WHERE id=$1',
      [fixture.staleSessionId],
    )).rows[0],
    liveTokenCount: (await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM agent_session_tokens WHERE session_id=$1 AND revoked_at IS NULL',
      [fixture.staleSessionId],
    )).rows[0]?.count,
    lease: (await db.query<{ status: string; released_at: Date | null }>(
      'SELECT status,released_at FROM leases WHERE id=$1',
      [fixture.leaseId],
    )).rows[0],
    inbox: (await db.query<{ status: string; resolved_at: Date | null }>(
      'SELECT status,resolved_at FROM inbox_items WHERE id=$1',
      [fixture.inboxId],
    )).rows[0],
    executionCount: (await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM agent_sessions
        WHERE delegation_id=$1 AND session_kind='execution'`,
      [fixture.delegationId],
    )).rows[0]?.count,
  })
  const before = await snapshot()
  const cursorBefore = (await db.query<{ cursor: string }>(
    'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
  )).rows[0]!.cursor
  const claimable = await coordinator(
    fixture.paired.token,
    'GET',
    '/api/v1/work-items?claimable=true&limit=200',
  )
  expect(claimable.statusCode, claimable.body).toBe(200)
  expect(claimable.json<{ items: Array<{ id: string }> }>().items.map(item => item.id))
    .not.toContain(fixture.workItem.id)
  const rejected = await coordinator(
    fixture.paired.token,
    'POST',
    `/api/v1/work-items/${fixture.workItem.id}/claim`,
    {},
    fixture.workItem.revision,
  )
  expect(rejected.statusCode, rejected.body).toBe(409)
  expect(rejected.json<{ error: { code: string } }>().error.code)
    .toBe('WORK_ITEM_ALREADY_ASSIGNED')
  expect(await snapshot()).toEqual(before)
  expect((await db.query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM domain_events event
       JOIN outbox_events outbox ON outbox.domain_event_id=event.id
      WHERE event.cursor>$1::bigint`,
    [cursorBefore],
  )).rows[0]?.count).toBe(0)
}
beforeAll(async () => {
  await applyMigrations(db); await db.query('TRUNCATE auth_idempotency_records,workspaces CASCADE')
  await listenApi()
  const install = await app.inject({ method: 'POST', url: '/api/v1/auth/install', payload: { name: 'Coordination acceptance', slug: 'coordination-acceptance', adminName: 'Alice', email: 'alice-stage5@example.test', password: 'password-acceptance' }, headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! } })
  expect(install.statusCode, install.body).toBe(200)
  const setCookie = install.headers['set-cookie']; cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? ''; csrf = install.json<{ csrfToken: string }>().csrfToken
  const me = await human('GET', '/api/v1/auth/me'); actorId = me.json<{ actor: { id: string } }>().actor.id
  const defaultTeam = (await human('GET', '/api/v1/teams')).json<{ items: { id: string; key: string }[] }>().items[0]!
  teamId = defaultTeam.id
  teamKey = defaultTeam.key
  const otherTeam = await human('POST', '/api/v1/teams', {
    name: 'Coordination scope control',
    key: `C${randomUUID().replaceAll('-', '').slice(0, 5).toUpperCase()}`,
  })
  expect(otherTeam.statusCode, otherTeam.body).toBe(200)
  otherTeamId = otherTeam.json<{ id: string }>().id
  const states = (await human('GET', `/api/v1/teams/${teamId}/states`)).json<{ items: { id: string; name: string }[] }>().items
  readyId = states.find(state => state.name === 'Ready')!.id
}, 240_000)
afterAll(async () => { await app.close(); await db.end() })

describe('Stage 5 Agent Connection lifecycle', () => {
  it('pairs once, replays safely, coordinates ordinary work, and revokes live authorization', async () => {
    const created = await human('POST', '/api/v1/agent-connections', { name: 'Codex coordinator', agentSlug: 'codex-coordinator', clientType: 'codex', teamId, principalHumanActorId: actorId, requestedCapabilities: ['work:read','work:write','comment:write','message:write','plan:write'], grantAgentDelegate: false })
    expect(created.statusCode, created.body).toBe(201)
    const envelope = created.json<{ connection: { id: string; revision: number }; connect_url: string; skill: { sha256: string; signature: string } }>()
    expect(envelope.connect_url).toMatch(/\/connect#wmp_[A-Za-z0-9_-]{43}$/); expect(envelope.skill.sha256).toMatch(/^sha256:[a-f0-9]{64}$/); expect(envelope.skill.signature).toMatch(/^ed25519:/)
    const pairingCode = new URL(envelope.connect_url).hash.slice(1); const replayKey = randomUUID()
    expect(pairingCode).toMatch(/^wmp_[A-Za-z0-9_-]{43}$/)
    const mismatch = await app.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem', payload: { pairingCode, agentSlug: 'wrong-agent', client: { type: 'codex', version: '1.0.0' } }, headers: { 'idempotency-key': randomUUID() } })
    expect(mismatch.statusCode, mismatch.body).toBe(400)
    expect((await db.query<{ attempts: number }>('SELECT attempts FROM agent_connection_pairings WHERE code_hash=$1', [tokenHash(pairingCode)])).rows[0]?.attempts).toBe(1)
    const redeem = () => app.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem', payload: { pairingCode, agentSlug: 'codex-coordinator', client: { type: 'codex', version: '1.0.0' } }, headers: { 'idempotency-key': replayKey } })
    const first = await redeem(); const replay = await redeem()
    expect(first.statusCode, first.body).toBe(200); expect(replay.statusCode, replay.body).toBe(200); expect(replay.body).toBe(first.body)
    const redeemed = first.json<{ installation_token: string; connection: { credential_fingerprint_prefix: string } }>()
    const token = redeemed.installation_token
    expect(token).toMatch(/^wmi_[A-Za-z0-9_-]{43}$/)
    expect(redeemed.connection.credential_fingerprint_prefix).toBe(tokenHash(token).slice(0, 12))
    const pairingAsCredential = await coordinator(pairingCode, 'GET', '/api/v1/agent-capabilities')
    expect(pairingAsCredential.statusCode).toBe(401)
    expect(pairingAsCredential.json<{ error: { code: string; message: string } }>().error).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Installation Token is invalid or inactive',
    })
    const visibleTeams = await coordinator(token, 'GET', '/api/v1/teams')
    expect(visibleTeams.statusCode, visibleTeams.body).toBe(200)
    expect(visibleTeams.json<{ items: { id: string }[] }>().items.map(team => team.id)).toEqual([teamId])
    const visibleStates = await coordinator(token, 'GET', `/api/v1/teams/${teamId}/states`)
    expect(visibleStates.statusCode, visibleStates.body).toBe(200)
    expect(visibleStates.json<{ items: { id: string }[] }>().items.map(state => state.id)).toContain(readyId)
    const hiddenStates = await coordinator(token, 'GET', `/api/v1/teams/${otherTeamId}/states`)
    expect(hiddenStates.statusCode, hiddenStates.body).toBe(403)
    expect(hiddenStates.json<{ error: { code: string } }>().error.code).toBe('RESOURCE_SCOPE_DENIED')
    const capabilities = await coordinator(token, 'GET', '/api/v1/agent-capabilities')
    expect(capabilities.statusCode, capabilities.body).toBe(200)
    const coordinationSessionId = capabilities.json<{ agent: { sessionId: string } }>().agent.sessionId
    const heartbeat = await coordinator(token, 'POST', `/api/v1/agent-sessions/${coordinationSessionId}/heartbeat`, {
      usage: { runtimeSeconds: 1, toolCalls: 1 },
    })
    expect(heartbeat.statusCode, heartbeat.body).toBe(200)
    const events = await coordinator(token, 'GET', '/api/v1/events?cursor=0&limit=50')
    expect(events.statusCode, events.body).toBe(200)
    expect(events.json<{ aggregate_id: string }[]>().map(event => event.aggregate_id)).not.toContain(otherTeamId)
    await db.query(
      "UPDATE agent_coordination_sessions SET expires_at=now()+interval '1 minute',refreshed_at=NULL WHERE agent_session_id=$1",
      [coordinationSessionId],
    )
    const renewedStates = await coordinator(token, 'GET', `/api/v1/teams/${teamId}/states`)
    expect(renewedStates.statusCode, renewedStates.body).toBe(200)
    expect((await db.query<{ refreshed_at: Date | null }>(
      'SELECT refreshed_at FROM agent_coordination_sessions WHERE agent_session_id=$1',
      [coordinationSessionId],
    )).rows[0]?.refreshed_at).not.toBeNull()
    const mcp = await createWorkMeshMcpHttpServer({
      baseUrl: apiBaseUrl,
      coordination: true,
      mode: 'read-write',
      readinessProbe: async () => undefined,
    })
    mcp.listen(0, '127.0.0.1')
    await once(mcp, 'listening')
    const mcpAddress = mcp.address()
    if (!mcpAddress || typeof mcpAddress === 'string') throw new Error('Expected MCP TCP listening address')
    const mcpUrl = `http://127.0.0.1:${mcpAddress.port}/mcp`
    try {
      const initialized = await mcpRequest(mcpUrl, token, 'initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'workmesh-stage5-acceptance', version: '1.0.0' },
      })
      expect(initialized.error).toBeUndefined()
      expect(initialized.result).toBeDefined()
      const verified = await mcpTool(mcpUrl, token, 'verify_connection', {})
      expect((verified.structuredContent?.data as { manifest: { agent: { sessionId: string } } }).manifest.agent.sessionId).toBe(coordinationSessionId)
      const mcpTeams = await mcpTool(mcpUrl, token, 'list_teams', {})
      expect((mcpTeams.structuredContent?.data as { items: { id: string }[] }).items.map(team => team.id)).toContain(teamId)
      const mcpStates = await mcpTool(mcpUrl, token, 'list_workflow_states', { teamId })
      expect((mcpStates.structuredContent?.data as { items: { id: string }[] }).items.map(state => state.id)).toContain(readyId)
      const claimCandidate = await mcpTool(mcpUrl, token, 'create_work_item', {
        teamId,
        title: 'Remote MCP self-claim lifecycle',
        description: 'Prove claim through completion without replacing the configured Connection credential.',
        statusId: readyId,
      })
      const candidate = claimCandidate.structuredContent?.data as { id: string; revision: number }
      const claimable = await mcpTool(mcpUrl, token, 'list_claimable_work_items', { limit: 200 })
      expect((claimable.structuredContent?.data as { items: { id: string }[] }).items.map(item => item.id)).toContain(candidate.id)
      const claimed = await mcpTool(mcpUrl, token, 'claim_work_item', {
        workItemId: candidate.id,
        revision: candidate.revision,
        initialPrompt: 'Execute the remote MCP lifecycle acceptance fixture.',
        idempotencyKey: `claim:${candidate.id}`,
      })
      const claimedData = claimed.structuredContent?.data as {
        session: { id: string; revision: number }
        executionAuth: { mode: string; sessionId: string; expiresAt?: string }
      }
      expect(claimedData.executionAuth).toMatchObject({
        mode: 'connection_session_bridge',
        sessionId: claimedData.session.id,
      })
      expect(JSON.stringify(claimedData)).not.toContain('sessionToken')
      expect(JSON.stringify(claimedData)).not.toContain('exchangeToken')
      await db.query(
        `UPDATE agent_sessions
            SET state='stale',state_reason='production recovery simulation',
                revision=revision+1,updated_at=now()
          WHERE id=$1`,
        [claimedData.session.id],
      )
      const acknowledgementKey = `stale-ack:${claimedData.session.id}`
      const acknowledgementInput = {
        sessionId: claimedData.session.id,
        summary: 'Accepted through the unchanged Connection configuration.',
        idempotencyKey: acknowledgementKey,
      }
      const acknowledged = await mcpTool(mcpUrl, token, 'ack_agent_session', acknowledgementInput)
      const acknowledgedData = acknowledged.structuredContent?.data as {
        id: string
        state: string
        revision: number
      }
      expect(acknowledgedData).toMatchObject({
        id: claimedData.session.id,
        state: 'acknowledged',
      })
      const acknowledgementReplay = await mcpTool(
        mcpUrl,
        token,
        'ack_agent_session',
        acknowledgementInput,
      )
      expect(acknowledgementReplay.structuredContent?.data).toEqual(acknowledgedData)
      const differentKey = await mcpRequest(mcpUrl, token, 'tools/call', {
        name: 'ack_agent_session',
        arguments: {
          ...acknowledgementInput,
          idempotencyKey: `different-stale-ack:${claimedData.session.id}`,
        },
      })
      expect(differentKey.result?.isError).toBe(true)
      expect(differentKey.result?.structuredContent).toMatchObject({
        error: { code: 'SESSION_NOT_ACTIVE' },
      })
      expect((await db.query<{ state: string; revision: number }>(
        'SELECT state,revision FROM agent_sessions WHERE id=$1',
        [claimedData.session.id],
      )).rows[0]).toEqual({
        state: 'acknowledged',
        revision: acknowledgedData.revision,
      })
      await mcpTool(mcpUrl, token, 'transition_agent_session_state', {
        sessionId: claimedData.session.id,
        state: 'executing',
        reason: 'Remote MCP bridge acceptance',
        revision: acknowledgedData.revision,
      })
      await Promise.all([
        mcpTool(mcpUrl, token, 'append_activity', {
          sessionId: claimedData.session.id,
          kind: 'evidence',
          summary: 'First parallel request-local exact Session refresh succeeded.',
        }),
        mcpTool(mcpUrl, token, 'append_activity', {
          sessionId: claimedData.session.id,
          kind: 'evidence',
          summary: 'Second parallel request-local exact Session refresh succeeded.',
        }),
      ])
      const completionRevision = (await db.query<{ revision: number }>(
        'SELECT revision FROM agent_sessions WHERE id=$1',
        [claimedData.session.id],
      )).rows[0]!.revision
      const completed = await mcpTool(mcpUrl, token, 'complete_session', {
        sessionId: claimedData.session.id,
        revision: completionRevision,
        summary: 'Remote MCP self-claim lifecycle completed.',
        noArtifactReason: 'Protocol acceptance produces no repository artifact.',
      })
      expect(completed.structuredContent?.data).toMatchObject({
        id: claimedData.session.id,
        state: 'completed',
      })
      const mcpProject = await mcpTool(mcpUrl, token, 'create_project', {
        teamId,
        name: 'MCP transport acceptance',
        summary: 'Created through the real Streamable HTTP MCP boundary.',
      })
      const mcpProjectId = (mcpProject.structuredContent?.data as { id: string }).id
      expect((await mcpTool(mcpUrl, token, 'get_project', { projectId: mcpProjectId })).structuredContent?.data).toMatchObject({ id: mcpProjectId })
      const mcpProjects = await mcpTool(mcpUrl, token, 'list_projects', { teamId })
      expect((mcpProjects.structuredContent?.data as { items: { id: string }[] }).items.map(project => project.id)).toContain(mcpProjectId)
      await mcpTool(mcpUrl, token, 'heartbeat', {
        sessionId: coordinationSessionId,
        usage: { runtimeSeconds: 2, toolCalls: 2 },
      })
      const mcpEvents = await mcpTool(mcpUrl, token, 'list_events', { cursor: '0', limit: 50 })
      const eventAggregateIds = (mcpEvents.structuredContent?.data as { aggregate_id: string }[]).map(event => event.aggregate_id)
      expect(eventAggregateIds).toContain(mcpProjectId)
      expect(eventAggregateIds).not.toContain(otherTeamId)
    } finally {
      mcp.close()
      await once(mcp, 'close')
    }
    await app.close()
    app = buildApp({ features, logger: { level: 'error' } })
    await listenApi()
    const restartedMcp = await createWorkMeshMcpHttpServer({
      baseUrl: apiBaseUrl,
      coordination: true,
      mode: 'read-write',
      readinessProbe: async () => undefined,
    })
    restartedMcp.listen(0, '127.0.0.1')
    await once(restartedMcp, 'listening')
    const restartedMcpAddress = restartedMcp.address()
    if (!restartedMcpAddress || typeof restartedMcpAddress === 'string') throw new Error('Expected restarted MCP TCP listening address')
    const restartedMcpUrl = `http://127.0.0.1:${restartedMcpAddress.port}/mcp`
    try {
      const initialized = await mcpRequest(restartedMcpUrl, token, 'initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'workmesh-stage5-restart-acceptance', version: '1.0.0' },
      })
      expect(initialized.error).toBeUndefined()
      const verified = await mcpTool(restartedMcpUrl, token, 'verify_connection', {})
      expect((verified.structuredContent?.data as { manifest: { agent: { sessionId: string } } }).manifest.agent.sessionId).toBe(coordinationSessionId)
    } finally {
      restartedMcp.close()
      await once(restartedMcp, 'close')
    }
    const project = await coordinator(token, 'POST', '/api/v1/projects', { teamId, name: 'Agent-first delivery', summary: 'Created through Coordination MCP authority', status: 'planned' })
    expect(project.statusCode, project.body).toBe(200)
    const projectBody = project.json<{ id: string; revision: number }>()
    const visibleProjects = await coordinator(token, 'GET', `/api/v1/projects?teamId=${teamId}`)
    expect(visibleProjects.statusCode, visibleProjects.body).toBe(200)
    expect(visibleProjects.json<{ items: { id: string }[] }>().items.map(item => item.id)).toContain(projectBody.id)
    const coordinationSession = (await db.query<{ id: string }>('SELECT agent_session_id AS id FROM agent_coordination_sessions WHERE connection_id=$1 AND status=\'active\'', [envelope.connection.id])).rows[0]
    expect(coordinationSession?.id).toMatch(/^[0-9a-f-]{36}$/)
    const durableSessionEvent = await db.query<{ event_type: string; outbox_id: string }>(
      `SELECT event.event_type,outbox.id AS outbox_id
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE event.aggregate_type='agent_session' AND event.aggregate_id=$1
          AND event.event_type='agent.session.created'`,
      [coordinationSession!.id],
    )
    expect(durableSessionEvent.rows).toHaveLength(1)
    const issue = await coordinator(token, 'POST', '/api/v1/work-items', { teamId, projectId: projectBody.id, title: 'Prove coordination lifecycle', description: 'Created by the coordinator.', statusId: readyId, priority: 'medium', labels: [] })
    expect(issue.statusCode, issue.body).toBe(200)
    const issueBody = issue.json<{ id: string; revision: number }>(); const issueId = issueBody.id
    expect((await db.query<{ responsible_human_actor_id: string }>('SELECT responsible_human_actor_id FROM work_items WHERE id=$1', [issueId])).rows[0]?.responsible_human_actor_id).toBe(actorId)
    const milestoneReplayKey = randomUUID()
    const createMilestone = () => app.inject({
      method: 'POST', url: `/api/v1/projects/${projectBody.id}/milestones`,
      payload: { name: 'Structured planning parity', targetDate: '2026-09-01' },
      headers: { 'x-workmesh-installation-token': token, 'idempotency-key': milestoneReplayKey },
    }) as unknown as Promise<Reply>
    const milestone = await createMilestone()
    expect(milestone.statusCode, milestone.body).toBe(200)
    const milestoneReplay = await createMilestone()
    expect(milestoneReplay.statusCode, milestoneReplay.body).toBe(200)
    expect(milestoneReplay.json<Record<string, unknown>>()).toEqual(milestone.json<Record<string, unknown>>())
    const milestoneBody = milestone.json<{ id: string; revision: number }>()
    expect((await db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM project_milestones WHERE id=$1',
      [milestoneBody.id],
    )).rows[0]?.count).toBe('1')
    const updatedMilestone = await coordinator(token, 'PATCH', `/api/v1/milestones/${milestoneBody.id}`, { description: 'Managed through the coordination connection.' }, milestoneBody.revision)
    expect(updatedMilestone.statusCode, updatedMilestone.body).toBe(200)
    const child = await coordinator(token, 'POST', '/api/v1/work-items', { teamId, projectId: projectBody.id, milestoneId: milestoneBody.id, parentId: issueId, title: 'Structured child issue', statusId: readyId, priority: 'medium', labels: [] })
    expect(child.statusCode, child.body).toBe(200)
    const childBody = child.json<{ id: string; revision: number }>()
    const otherProject = await coordinator(token, 'POST', '/api/v1/projects', { teamId, name: 'Other planning project', status: 'planned' })
    expect(otherProject.statusCode, otherProject.body).toBe(200)
    const otherProjectBody = otherProject.json<{ id: string }>()
    const otherMilestone = await coordinator(token, 'POST', `/api/v1/projects/${otherProjectBody.id}/milestones`, { name: 'Other project milestone' })
    expect(otherMilestone.statusCode, otherMilestone.body).toBe(200)
    const crossProjectMilestone = await coordinator(token, 'POST', '/api/v1/work-items', {
      teamId, projectId: projectBody.id, milestoneId: otherMilestone.json<{ id: string }>().id,
      title: 'Invalid cross-project milestone', statusId: readyId, priority: 'medium', labels: [],
    })
    expect(crossProjectMilestone.statusCode, crossProjectMilestone.body).toBe(409)
    expect(crossProjectMilestone.json<{ error: { code: string } }>().error.code).toBe('WORK_ITEM_MILESTONE_PROJECT_MISMATCH')
    const relation = await coordinator(token, 'POST', `/api/v1/work-items/${issueId}/relations`, { targetWorkItemId: childBody.id, kind: 'blocks' })
    expect(relation.statusCode, relation.body).toBe(200)
    const relationBody = relation.json<{ id: string; revision: number }>()
    const blockerCycle = await coordinator(token, 'POST', `/api/v1/work-items/${childBody.id}/relations`, { targetWorkItemId: issueId, kind: 'blocks' })
    expect(blockerCycle.statusCode, blockerCycle.body).toBe(409)
    expect(blockerCycle.json<{ error: { code: string } }>().error.code).toBe('WORK_ITEM_BLOCK_CYCLE')
    expect((await coordinator(token, 'GET', `/api/v1/projects/${projectBody.id}/milestones?limit=1`)).json<{ items: unknown[] }>().items).toHaveLength(1)
    expect((await coordinator(token, 'GET', `/api/v1/work-items/${issueId}/relations?limit=1`)).json<{ items: unknown[] }>().items).toHaveLength(1)
    const removedRelation = await coordinator(token, 'DELETE', `/api/v1/work-items/${issueId}/relations/${relationBody.id}`, undefined, relationBody.revision)
    expect(removedRelation.statusCode, removedRelation.body).toBe(200)
    expect(removedRelation.json<{ id: string; revision: number }>()).toEqual({ id: relationBody.id, revision: relationBody.revision + 1 })
    const detached = await coordinator(token, 'PATCH', `/api/v1/work-items/${childBody.id}`, { parentId: null, milestoneId: null }, childBody.revision)
    expect(detached.statusCode, detached.body).toBe(200)
    const deletedMilestone = await coordinator(token, 'DELETE', `/api/v1/milestones/${milestoneBody.id}`, undefined, updatedMilestone.json<{ revision: number }>().revision)
    expect(deletedMilestone.statusCode, deletedMilestone.body).toBe(200)
    expect(deletedMilestone.json<{ id: string; revision: number }>()).toEqual({ id: milestoneBody.id, revision: updatedMilestone.json<{ revision: number }>().revision + 1 })
    const delegateDenied = await coordinator(token, 'POST', `/api/v1/work-items/${issueId}/agent-session`, { agentId: randomUUID(), principalHumanActorId: actorId, role: 'executor', requestedCapabilities: ['work:read'], initialPrompt: 'Must be denied without agent:delegate.', budget: {} }, issueBody.revision)
    expect(delegateDenied.statusCode).toBe(403); expect(delegateDenied.json<{ error: { code: string } }>().error.code).toBe('CAPABILITY_DENIED')
    const detail = await human('GET', `/api/v1/agent-connections/${envelope.connection.id}`); expect(detail.statusCode).toBe(200); expect(detail.headers.etag).toBeDefined()
    const rotated = await human('POST', `/api/v1/agent-connections/${envelope.connection.id}/rotate`, {}, detail.json<{ revision: number }>().revision)
    expect(rotated.statusCode, rotated.body).toBe(201)
    const rotation = rotated.json<{ connection: { revision: number }; connect_url: string }>(); const rotationCode = new URL(rotation.connect_url).hash.slice(1)
    const prematureConfirmation = await human('POST', `/api/v1/agent-connections/${envelope.connection.id}/rotate-confirm`, {}, rotation.connection.revision)
    expect(prematureConfirmation.statusCode, prematureConfirmation.body).toBe(400)
    expect(prematureConfirmation.json<{ error: { code: string } }>().error.code).toBe('INVALID_STATE_TRANSITION')
    expect((await coordinator(token, 'GET', '/api/v1/projects')).statusCode).toBe(200)
    const second = await app.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem', payload: { pairingCode: rotationCode, agentSlug: 'codex-coordinator', client: { type: 'codex', version: '1.0.1' } }, headers: { 'idempotency-key': randomUUID() } })
    expect(second.statusCode, second.body).toBe(200); const nextToken = second.json<{ installation_token: string; connection: { revision: number } }>().installation_token
    expect((await coordinator(token, 'GET', '/api/v1/projects')).statusCode).toBe(200); expect((await coordinator(nextToken, 'GET', '/api/v1/projects')).statusCode).toBe(200)
    const confirmed = await human('POST', `/api/v1/agent-connections/${envelope.connection.id}/rotate-confirm`, {}, second.json<{ connection: { revision: number } }>().connection.revision)
    expect(confirmed.statusCode, confirmed.body).toBe(200); expect((await coordinator(token, 'GET', '/api/v1/projects')).statusCode).toBe(401); expect((await coordinator(nextToken, 'GET', '/api/v1/projects')).statusCode).toBe(200)
    await db.query(
      `UPDATE agent_sessions
          SET session_kind='execution',coordination_connection_id=NULL,work_item_id=$2
        WHERE id=$1`,
      [coordinationSessionId, issueId],
    )
    const revokeCursor = (await db.query<{ cursor: string }>(
      'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const revoked = await human('DELETE', `/api/v1/agent-connections/${envelope.connection.id}`, undefined, confirmed.json<{ revision: number }>().revision); expect(revoked.statusCode, revoked.body).toBe(204)
    expect((await db.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM agent_installation_tokens WHERE token_hash=$1',
      [tokenHash(nextToken)],
    )).rows[0]?.revoked_at).toEqual(expect.any(Date))
    expect((await db.query<{ state: string }>(
      'SELECT state FROM agent_sessions WHERE id=$1',
      [coordinationSessionId],
    )).rows[0]?.state).toBe('canceled')
    const revokeEvents = (await db.query<{ event_type: string }>(
      `SELECT event_type FROM domain_events
        WHERE cursor>$1::bigint
          AND (aggregate_id=$2 OR aggregate_id=$3)
        ORDER BY cursor`,
      [revokeCursor, coordinationSessionId, envelope.connection.id],
    )).rows.map(event => event.event_type)
    expect(revokeEvents).toEqual([
      'agent.coordination_session.closed',
      'agent.session.state_changed',
      'agent.connection.revoked',
    ])
    const denied = await coordinator(nextToken, 'GET', '/api/v1/projects'); expect(denied.statusCode).toBe(401)
    expect((await coordinator(
      nextToken,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )).statusCode).toBe(401)
  })

  it('lazily reconciles existing Connection credentials and admits exactly one concurrent self-claim', async () => {
    const oldAgentSlug = `legacy-claim-${randomUUID().slice(0, 8)}`
    const oldConnection = await pairConnection(oldAgentSlug)
    const oldAgent = (await db.query<{ agent_id: string }>(
      'SELECT agent_id FROM agent_connections WHERE id=$1',
      [oldConnection.connection.id],
    )).rows[0]!
    await db.query(
      'DELETE FROM agent_installation_tokens WHERE token_hash=$1',
      [tokenHash(oldConnection.token)],
    )
    const legacyIssue = await human('POST', '/api/v1/work-items', {
      teamId,
      title: `Legacy Connection claim ${randomUUID()}`,
      statusId: readyId,
      priority: 'medium',
      labels: [],
      responsibleHumanActorId: actorId,
    })
    expect(legacyIssue.statusCode, legacyIssue.body).toBe(200)
    const legacyItem = legacyIssue.json<{ id: string; revision: number }>()
    const replayKey = randomUUID()
    const claimLegacy = () => app.inject({
      method: 'POST',
      url: `/api/v1/work-items/${legacyItem.id}/claim`,
      payload: {},
      headers: {
        'x-workmesh-installation-token': oldConnection.token,
        'idempotency-key': replayKey,
        'if-match': `"revision-${legacyItem.revision}"`,
      },
    }) as unknown as Promise<Reply>
    const first = await claimLegacy()
    expect(first.statusCode, first.body).toBe(200)
    const replay = await claimLegacy()
    expect(replay.statusCode, replay.body).toBe(200)
    expect(replay.body).toBe(first.body)
    const firstBody = first.json<{
      delegation: { id: string }
      session: { id: string }
      exchangeToken: string
    }>()
    expect(firstBody.exchangeToken).toHaveLength(43)
    const reconciled = (await db.query<{
      id: string
      agent_id: string
      revoked_at: Date | null
      expires_at: Date | null
    }>(
      `SELECT id,agent_id,revoked_at,expires_at
         FROM agent_installation_tokens WHERE token_hash=$1`,
      [tokenHash(oldConnection.token)],
    )).rows
    expect(reconciled).toEqual([expect.objectContaining({
      agent_id: oldAgent.agent_id,
      revoked_at: null,
      expires_at: null,
    })])
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM delegations
        WHERE work_item_id=$1 AND role='executor' AND status='active'`,
      [legacyItem.id],
    )).rows[0]?.count).toBe(1)
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM agent_sessions
        WHERE work_item_id=$1 AND session_kind='execution'
          AND state NOT IN ('completed','failed','canceled')`,
      [legacyItem.id],
    )).rows[0]?.count).toBe(1)

    const refreshKey = randomUUID()
    const refresh = () => app.inject({
      method: 'POST',
      url: `/api/v1/agent-sessions/${firstBody.session.id}/token/refresh`,
      payload: {},
      headers: {
        authorization: `Bearer ${oldConnection.token}`,
        'idempotency-key': refreshKey,
      },
    })
    const firstRefresh = await refresh()
    expect(firstRefresh.statusCode, firstRefresh.body).toBe(200)
    const replayedRefresh = await refresh()
    expect(replayedRefresh.statusCode, replayedRefresh.body).toBe(200)
    expect(replayedRefresh.body).toBe(firstRefresh.body)
    const parallelRefreshes = await Promise.all([0, 1].map(() => app.inject({
      method: 'POST',
      url: `/api/v1/agent-sessions/${firstBody.session.id}/token/refresh`,
      payload: {},
      headers: {
        authorization: `Bearer ${oldConnection.token}`,
        'idempotency-key': randomUUID(),
      },
    })))
    expect(parallelRefreshes.every(response => response.statusCode === 200)).toBe(true)
    const parallelTokens = parallelRefreshes.map(response =>
      response.json<{ sessionToken: string }>().sessionToken)
    const acknowledged = await app.inject({
      method: 'POST',
      url: `/api/v1/agent-sessions/${firstBody.session.id}/ack`,
      payload: { summary: 'First overlapping refresh remains usable.', externalUrls: [] },
      headers: {
        authorization: `Bearer ${parallelTokens[0]}`,
        'idempotency-key': randomUUID(),
      },
    })
    expect(acknowledged.statusCode, acknowledged.body).toBe(200)
    const appended = await app.inject({
      method: 'POST',
      url: `/api/v1/agent-sessions/${firstBody.session.id}/activities`,
      payload: {
        kind: 'evidence',
        summary: 'Second overlapping refresh remains usable.',
        artifactIds: [],
        references: [],
        visibility: 'team',
        ephemeral: false,
      },
      headers: {
        authorization: `Bearer ${parallelTokens[1]}`,
        'idempotency-key': randomUUID(),
      },
    })
    expect(appended.statusCode, appended.body).toBe(200)

    const crossTeamCreated = await human('POST', '/api/v1/agent-connections', {
      name: 'Same Agent other Team',
      agentSlug: oldAgentSlug,
      clientType: 'codex',
      teamId: otherTeamId,
      principalHumanActorId: actorId,
      requestedCapabilities: ['work:read', 'work:write'],
      grantAgentDelegate: false,
    })
    expect(crossTeamCreated.statusCode, crossTeamCreated.body).toBe(201)
    const crossTeamEnvelope = crossTeamCreated.json<{ connect_url: string }>()
    const crossTeamRedeemed = await app.inject({
      method: 'POST',
      url: '/api/v1/agent-connections/redeem',
      payload: {
        pairingCode: new URL(crossTeamEnvelope.connect_url).hash.slice(1),
        agentSlug: oldAgentSlug,
        client: { type: 'codex', version: '1.1.0' },
      },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(crossTeamRedeemed.statusCode, crossTeamRedeemed.body).toBe(200)
    const crossTeamToken = crossTeamRedeemed.json<{ installation_token: string }>().installation_token
    const crossTeamRefresh = await app.inject({
      method: 'POST',
      url: `/api/v1/agent-sessions/${firstBody.session.id}/token/refresh`,
      payload: {},
      headers: {
        authorization: `Bearer ${crossTeamToken}`,
        'idempotency-key': randomUUID(),
      },
    })
    expect(crossTeamRefresh.statusCode, crossTeamRefresh.body).toBe(401)

    const partialConnection = await pairConnection(`partial-claim-${randomUUID().slice(0, 8)}`)
    await db.query(
      `UPDATE agent_installation_tokens SET revoked_at=now()
        WHERE token_hash=$1`,
      [tokenHash(partialConnection.token)],
    )
    const partialIssue = await human('POST', '/api/v1/work-items', {
      teamId,
      title: `Partial mirror claim ${randomUUID()}`,
      statusId: readyId,
      priority: 'medium',
      labels: [],
      responsibleHumanActorId: actorId,
    })
    const partialItem = partialIssue.json<{ id: string; revision: number }>()
    const partialClaim = await coordinator(
      partialConnection.token,
      'POST',
      `/api/v1/work-items/${partialItem.id}/claim`,
      {},
      partialItem.revision,
    )
    expect(partialClaim.statusCode, partialClaim.body).toBe(200)
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM agent_installation_tokens
        WHERE token_hash=$1 AND revoked_at IS NULL`,
      [tokenHash(partialConnection.token)],
    )).rows[0]?.count).toBe(1)

    const contenders = await Promise.all([
      pairConnection(`claim-a-${randomUUID().slice(0, 8)}`),
      pairConnection(`claim-b-${randomUUID().slice(0, 8)}`),
    ])
    const contestedIssue = await human('POST', '/api/v1/work-items', {
      teamId,
      title: `Contested self-claim ${randomUUID()}`,
      statusId: readyId,
      priority: 'high',
      labels: [],
      responsibleHumanActorId: actorId,
    })
    const contested = contestedIssue.json<{ id: string; revision: number }>()
    const attempts = await Promise.all(Array.from({ length: 16 }, (_, index) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/work-items/${contested.id}/claim`,
        payload: {},
        headers: {
          'x-workmesh-installation-token': contenders[index % contenders.length]!.token,
          'idempotency-key': randomUUID(),
          'if-match': `"revision-${contested.revision}"`,
        },
      })))
    expect(attempts.filter(attempt => attempt.statusCode === 200)).toHaveLength(1)
    expect(attempts.filter(attempt => attempt.statusCode === 409)).toHaveLength(15)
    const assignment = (await db.query<{ delegation_id: string; session_id: string }>(
      `SELECT delegation.id AS delegation_id,session.id AS session_id
         FROM delegations delegation
         JOIN agent_sessions session ON session.delegation_id=delegation.id
        WHERE delegation.work_item_id=$1
          AND delegation.role='executor' AND delegation.status='active'
          AND session.session_kind='execution'
          AND session.state NOT IN ('completed','failed','canceled')`,
      [contested.id],
    )).rows
    expect(assignment).toHaveLength(1)
    const projectedResponse = await human('GET', `/api/v1/work-items/${contested.id}`)
    expect(projectedResponse.statusCode, projectedResponse.body).toBe(200)
    expect(projectedResponse.json<{
      active_assignment: {
        delegation_id: string
        session_id: string | null
        session_state: string | null
      } | null
      active_executor: unknown | null
    }>()).toMatchObject({
      active_assignment: {
        delegation_id: assignment[0]!.delegation_id,
        session_id: assignment[0]!.session_id,
        session_state: 'queued',
      },
      active_executor: null,
    })
    const eventRows = (await db.query<{ event_type: string; outbox_id: string }>(
      `SELECT event.event_type,outbox.id AS outbox_id
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE (event.aggregate_id=$1 OR event.aggregate_id=$2)
          AND event.event_type IN ('agent.delegation.created','agent.session.created')
        ORDER BY event.cursor`,
      [assignment[0]!.delegation_id, assignment[0]!.session_id],
    )).rows
    expect(eventRows.map(row => row.event_type)).toEqual([
      'agent.delegation.created',
      'agent.session.created',
    ])
    expect(eventRows.every(row => Boolean(row.outbox_id))).toBe(true)
  })

  it('does not advertise claimable Issues when the live Connection lacks work:write', async () => {
    const readOnly = await pairConnection(
      `claim-read-only-${randomUUID().slice(0, 8)}`,
      ['work:read'],
    )
    const issue = await human('POST', '/api/v1/work-items', {
      teamId,
      title: `Read-only claim candidate ${randomUUID()}`,
      statusId: readyId,
      priority: 'medium',
      labels: [],
      responsibleHumanActorId: actorId,
    })
    expect(issue.statusCode, issue.body).toBe(200)
    const candidate = issue.json<{ id: string; revision: number }>()

    const listed = await coordinator(
      readOnly.token,
      'GET',
      '/api/v1/work-items?claimable=true&limit=200',
    )
    expect(listed.statusCode, listed.body).toBe(200)
    expect(listed.json<{ items: Array<{ id: string }> }>().items).toEqual([])

    const rejected = await coordinator(
      readOnly.token,
      'POST',
      `/api/v1/work-items/${candidate.id}/claim`,
      {},
      candidate.revision,
    )
    expect(rejected.statusCode, rejected.body).toBe(403)
    expect(rejected.json<{ error: { code: string } }>().error.code).toBe('CAPABILITY_DENIED')
  })

  it('keeps Human forced assignment authoritative before, during, and after self-claim and rolls back replacement failures', async () => {
    const [claimingConnection, forcedConnection] = await Promise.all([
      pairConnection(`claim-race-${randomUUID().slice(0, 8)}`),
      pairConnection(`force-race-${randomUUID().slice(0, 8)}`),
    ])
    const connectionAgents = (await db.query<{ id: string; agent_id: string }>(
      'SELECT id,agent_id FROM agent_connections WHERE id=ANY($1::uuid[])',
      [[claimingConnection.connection.id, forcedConnection.connection.id]],
    )).rows
    const claimingAgentId = connectionAgents.find(row => row.id === claimingConnection.connection.id)!.agent_id
    const forcedAgentId = connectionAgents.find(row => row.id === forcedConnection.connection.id)!.agent_id
    await db.query(
      'UPDATE agent_definitions SET max_concurrency=8 WHERE id=ANY($1::uuid[])',
      [[claimingAgentId, forcedAgentId]],
    )

    const createItem = async (suffix: string) => {
      const response = await human('POST', '/api/v1/work-items', {
        teamId,
        title: `Forced assignment ${suffix} ${randomUUID()}`,
        statusId: readyId,
        priority: 'high',
        labels: [],
        responsibleHumanActorId: actorId,
      })
      expect(response.statusCode, response.body).toBe(200)
      return response.json<{ id: string; revision: number }>()
    }
    const forceAssign = (item: { id: string; revision: number }) => human(
      'POST',
      `/api/v1/work-items/${item.id}/agent-session`,
      {
        agentId: forcedAgentId,
        principalHumanActorId: actorId,
        role: 'executor',
        requestedCapabilities: ['work:read', 'work:write'],
        initialPrompt: 'Human forced assignment wins.',
        budget: {},
      },
      item.revision,
    )
    const selfClaim = (item: { id: string; revision: number }) => coordinator(
      claimingConnection.token,
      'POST',
      `/api/v1/work-items/${item.id}/claim`,
      {},
      item.revision,
    )
    const activeAssignments = async (workItemId: string) => (await db.query<{
      delegation_id: string
      session_id: string
      agent_id: string
      delegation_status: string
      session_state: string
    }>(
      `SELECT delegation.id AS delegation_id,session.id AS session_id,
              delegation.agent_id,delegation.status AS delegation_status,
              session.state AS session_state
         FROM delegations delegation
         JOIN agent_sessions session ON session.delegation_id=delegation.id
        WHERE delegation.work_item_id=$1
          AND delegation.role='executor' AND delegation.status='active'
          AND session.session_kind='execution'
          AND session.state NOT IN ('completed','failed','canceled')
        ORDER BY delegation.id,session.id`,
      [workItemId],
    )).rows
    const expectForcedWinner = async (workItemId: string) => {
      expect(await activeAssignments(workItemId)).toEqual([
        expect.objectContaining({ agent_id: forcedAgentId, delegation_status: 'active' }),
      ])
    }

    const before = await createItem('before claim')
    const forcedBefore = await forceAssign(before)
    expect(forcedBefore.statusCode, forcedBefore.body).toBe(200)
    const rejectedClaim = await selfClaim(before)
    expect(rejectedClaim.statusCode, rejectedClaim.body).toBe(409)
    expect(rejectedClaim.json<{ error: { code: string } }>().error.code).toBe('WORK_ITEM_ALREADY_ASSIGNED')
    await expectForcedWinner(before.id)
    expect((await db.query(
      'SELECT 1 FROM delegations WHERE work_item_id=$1 AND agent_id=$2',
      [before.id, claimingAgentId],
    )).rowCount).toBe(0)

    const after = await createItem('after claim')
    const claimedAfter = await selfClaim(after)
    expect(claimedAfter.statusCode, claimedAfter.body).toBe(200)
    const claimedAfterBody = claimedAfter.json<{ delegation: { id: string }; session: { id: string } }>()
    const forcedAfter = await forceAssign(after)
    expect(forcedAfter.statusCode, forcedAfter.body).toBe(200)
    await expectForcedWinner(after.id)
    expect((await db.query<{ status: string; state: string; state_reason: string }>(
      `SELECT delegation.status,session.state,session.state_reason
         FROM delegations delegation
         JOIN agent_sessions session ON session.delegation_id=delegation.id
        WHERE delegation.id=$1 AND session.id=$2`,
      [claimedAfterBody.delegation.id, claimedAfterBody.session.id],
    )).rows[0]).toEqual({
      status: 'revoked',
      state: 'canceled',
      state_reason: 'replaced by Human forced assignment',
    })
    expect((await db.query(
      'SELECT 1 FROM agent_session_tokens WHERE session_id=$1 AND revoked_at IS NULL',
      [claimedAfterBody.session.id],
    )).rowCount).toBe(0)

    const during = await createItem('during claim')
    const advisoryKey = 754781
    const gate = await db.connect()
    await db.query('DROP TRIGGER IF EXISTS stage5_pause_self_claim ON delegations')
    await db.query('DROP FUNCTION IF EXISTS stage5_pause_self_claim()')
    await db.query(`CREATE FUNCTION stage5_pause_self_claim() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.work_item_id='${during.id}'::uuid AND NEW.agent_id='${claimingAgentId}'::uuid THEN
          PERFORM pg_advisory_xact_lock(${advisoryKey});
        END IF;
        RETURN NEW;
      END
      $$`)
    await db.query(`CREATE TRIGGER stage5_pause_self_claim
      BEFORE INSERT ON delegations FOR EACH ROW EXECUTE FUNCTION stage5_pause_self_claim()`)
    let gateOpen = false
    try {
      await gate.query('BEGIN')
      gateOpen = true
      await gate.query('SELECT pg_advisory_xact_lock($1)', [advisoryKey])
      const claimDuring = selfClaim(during)
      let claimReachedInsert = false
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting = (await db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM pg_locks WHERE locktype='advisory' AND granted=false",
        )).rows[0]!.count
        if (waiting > 0) {
          claimReachedInsert = true
          break
        }
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      expect(claimReachedInsert).toBe(true)
      const forceDuring = forceAssign(during)
      await new Promise(resolve => setTimeout(resolve, 20))
      await gate.query('COMMIT')
      gateOpen = false
      const [claimed, forced] = await Promise.all([claimDuring, forceDuring])
      expect(claimed.statusCode, claimed.body).toBe(200)
      expect(forced.statusCode, forced.body).toBe(200)
      await expectForcedWinner(during.id)
      const claimBody = claimed.json<{ delegation: { id: string }; session: { id: string } }>()
      expect((await db.query<{ status: string; state: string }>(
        `SELECT delegation.status,session.state
           FROM delegations delegation
           JOIN agent_sessions session ON session.delegation_id=delegation.id
          WHERE delegation.id=$1 AND session.id=$2`,
        [claimBody.delegation.id, claimBody.session.id],
      )).rows[0]).toEqual({ status: 'revoked', state: 'canceled' })
    } finally {
      if (gateOpen) await gate.query('ROLLBACK')
      gate.release()
      await db.query('DROP TRIGGER IF EXISTS stage5_pause_self_claim ON delegations')
      await db.query('DROP FUNCTION IF EXISTS stage5_pause_self_claim()')
    }

    const rollback = await createItem('rollback')
    const claimedRollback = await selfClaim(rollback)
    expect(claimedRollback.statusCode, claimedRollback.body).toBe(200)
    const rollbackClaim = claimedRollback.json<{ delegation: { id: string }; session: { id: string } }>()
    const beforeRollback = (await db.query<{
      status: string
      state: string
      revision: number
      token_count: number
    }>(
      `SELECT delegation.status,session.state,session.revision,
              (SELECT count(*)::int FROM agent_session_tokens token
                WHERE token.session_id=session.id AND token.revoked_at IS NULL) AS token_count
         FROM delegations delegation
         JOIN agent_sessions session ON session.delegation_id=delegation.id
        WHERE delegation.id=$1 AND session.id=$2`,
      [rollbackClaim.delegation.id, rollbackClaim.session.id],
    )).rows[0]!
    const cursorBefore = (await db.query<{ cursor: string }>(
      'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    await db.query('DROP TRIGGER IF EXISTS stage5_fail_forced_assignment ON delegations')
    await db.query('DROP FUNCTION IF EXISTS stage5_fail_forced_assignment()')
    await db.query(`CREATE FUNCTION stage5_fail_forced_assignment() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.work_item_id='${rollback.id}'::uuid AND NEW.agent_id='${forcedAgentId}'::uuid THEN
          RAISE EXCEPTION 'forced assignment rollback fixture';
        END IF;
        RETURN NEW;
      END
      $$`)
    await db.query(`CREATE TRIGGER stage5_fail_forced_assignment
      BEFORE INSERT ON delegations FOR EACH ROW EXECUTE FUNCTION stage5_fail_forced_assignment()`)
    try {
      const failed = await forceAssign(rollback)
      expect(failed.statusCode, failed.body).toBe(500)
    } finally {
      await db.query('DROP TRIGGER IF EXISTS stage5_fail_forced_assignment ON delegations')
      await db.query('DROP FUNCTION IF EXISTS stage5_fail_forced_assignment()')
    }
    expect((await db.query<{
      status: string
      state: string
      revision: number
      token_count: number
    }>(
      `SELECT delegation.status,session.state,session.revision,
              (SELECT count(*)::int FROM agent_session_tokens token
                WHERE token.session_id=session.id AND token.revoked_at IS NULL) AS token_count
         FROM delegations delegation
         JOIN agent_sessions session ON session.delegation_id=delegation.id
        WHERE delegation.id=$1 AND session.id=$2`,
      [rollbackClaim.delegation.id, rollbackClaim.session.id],
    )).rows[0]).toEqual(beforeRollback)
    expect((await db.query(
      'SELECT 1 FROM delegations WHERE work_item_id=$1 AND agent_id=$2',
      [rollback.id, forcedAgentId],
    )).rowCount).toBe(0)
    expect((await db.query<{ events: number; outbox: number }>(
      `SELECT
         (SELECT count(*)::int FROM domain_events event
           WHERE event.cursor>$1::bigint) AS events,
         (SELECT count(*)::int FROM outbox_events outbox
           JOIN domain_events event ON event.id=outbox.domain_event_id
          WHERE event.cursor>$1::bigint) AS outbox`,
      [cursorBefore],
    )).rows[0]).toEqual({ events: 0, outbox: 0 })
    const retry = await forceAssign(rollback)
    expect(retry.statusCode, retry.body).toBe(200)
    await expectForcedWinner(rollback.id)
  }, 120_000)

  it('rolls back every self-claim write boundary and allows a clean retry', async () => {
    const connection = await pairConnection(`claim-boundary-${randomUUID().slice(0, 8)}`)
    const agentId = (await db.query<{ agent_id: string }>(
      'SELECT agent_id FROM agent_connections WHERE id=$1',
      [connection.connection.id],
    )).rows[0]!.agent_id
    await db.query('UPDATE agent_definitions SET max_concurrency=16 WHERE id=$1', [agentId])

    const createItem = async (boundary: string) => {
      const response = await human('POST', '/api/v1/work-items', {
        teamId,
        title: `Self-claim ${boundary} rollback ${randomUUID()}`,
        description: 'Failure injection fixture for atomic self-claim recovery.',
        statusId: readyId,
        priority: 'high',
        labels: [],
        responsibleHumanActorId: actorId,
      })
      expect(response.statusCode, response.body).toBe(200)
      return response.json<{ id: string; revision: number }>()
    }

    const rollbackBoundaries = [
      { name: 'delegation', table: 'delegations' },
      { name: 'session', table: 'agent_sessions' },
      { name: 'session_credential', table: 'agent_session_tokens' },
      { name: 'prompt', table: 'agent_session_prompts' },
      { name: 'event', table: 'domain_events' },
      { name: 'outbox', table: 'outbox_events' },
    ] as const

    for (const boundary of rollbackBoundaries) {
      const item = await createItem(boundary.name)
      const triggerName = `stage5_claim_boundary_failure_${boundary.name}`
      const functionName = `${triggerName}_fn`
      await db.query(`DROP TRIGGER IF EXISTS ${triggerName} ON ${boundary.table}`)
      await db.query(`DROP FUNCTION IF EXISTS ${functionName}()`)

      switch (boundary.name) {
        case 'delegation':
          await db.query(`CREATE FUNCTION ${functionName}() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
              IF NEW.work_item_id='${item.id}'::uuid AND NEW.agent_id='${agentId}'::uuid THEN
                RAISE EXCEPTION 'stage5 self-claim delegation boundary failure';
              END IF;
              RETURN NEW;
            END
            $$`)
          break
        case 'session':
          await db.query(`CREATE FUNCTION ${functionName}() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
              IF NEW.work_item_id='${item.id}'::uuid AND NEW.agent_id='${agentId}'::uuid THEN
                RAISE EXCEPTION 'stage5 self-claim session boundary failure';
              END IF;
              RETURN NEW;
            END
            $$`)
          break
        case 'session_credential':
          await db.query(`CREATE FUNCTION ${functionName}() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
              IF NEW.agent_id='${agentId}'::uuid AND EXISTS(
                SELECT 1 FROM agent_sessions session
                 WHERE session.id=NEW.session_id
                   AND session.work_item_id='${item.id}'::uuid
              ) THEN
                RAISE EXCEPTION 'stage5 self-claim session credential boundary failure';
              END IF;
              RETURN NEW;
            END
            $$`)
          break
        case 'prompt':
          await db.query(`CREATE FUNCTION ${functionName}() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
              IF EXISTS(
                SELECT 1 FROM agent_sessions session
                 WHERE session.id=NEW.session_id
                   AND session.work_item_id='${item.id}'::uuid
                   AND session.agent_id='${agentId}'::uuid
              ) THEN
                RAISE EXCEPTION 'stage5 self-claim prompt boundary failure';
              END IF;
              RETURN NEW;
            END
            $$`)
          break
        case 'event':
          await db.query(`CREATE FUNCTION ${functionName}() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
              IF NEW.event_type='agent.session.created'
                 AND NEW.payload->>'workItemId'='${item.id}' THEN
                RAISE EXCEPTION 'stage5 self-claim event boundary failure';
              END IF;
              RETURN NEW;
            END
            $$`)
          break
        case 'outbox':
          await db.query(`CREATE FUNCTION ${functionName}() RETURNS trigger
            LANGUAGE plpgsql AS $$
            BEGIN
              IF NEW.topic='agent.session.created' AND EXISTS(
                SELECT 1 FROM domain_events event
                 WHERE event.id=NEW.domain_event_id
                   AND event.payload->>'workItemId'='${item.id}'
              ) THEN
                RAISE EXCEPTION 'stage5 self-claim outbox boundary failure';
              END IF;
              RETURN NEW;
            END
            $$`)
          break
      }
      await db.query(`CREATE TRIGGER ${triggerName}
        BEFORE INSERT ON ${boundary.table}
        FOR EACH ROW EXECUTE FUNCTION ${functionName}()`)

      const cursorBefore = (await db.query<{ cursor: string }>(
        'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
      )).rows[0]!.cursor
      try {
        const failed = await coordinator(
          connection.token,
          'POST',
          `/api/v1/work-items/${item.id}/claim`,
          {},
          item.revision,
        )
        expect(failed.statusCode, failed.body).toBe(500)
      } finally {
        await db.query(`DROP TRIGGER IF EXISTS ${triggerName} ON ${boundary.table}`)
        await db.query(`DROP FUNCTION IF EXISTS ${functionName}()`)
      }

      const residue = (await db.query<{
        delegations: number
        sessions: number
        session_credentials: number
        prompts: number
        context_snapshots: number
        channels: number
        events: number
        outbox: number
        webhook_deliveries: number
      }>(
        `SELECT
           (SELECT count(*)::int FROM delegations
             WHERE work_item_id=$1 AND agent_id=$2 AND role='executor') AS delegations,
           (SELECT count(*)::int FROM agent_sessions
             WHERE work_item_id=$1 AND agent_id=$2 AND session_kind='execution') AS sessions,
           (SELECT count(*)::int FROM agent_session_tokens token
             JOIN agent_sessions session ON session.id=token.session_id
            WHERE session.work_item_id=$1 AND session.agent_id=$2) AS session_credentials,
           (SELECT count(*)::int FROM agent_session_prompts prompt
             JOIN agent_sessions session ON session.id=prompt.session_id
            WHERE session.work_item_id=$1 AND session.agent_id=$2) AS prompts,
           (SELECT count(*)::int FROM context_snapshots
             WHERE work_item_id=$1 AND created_by_actor_id=$4) AS context_snapshots,
           (SELECT count(*)::int FROM work_room_channels channel
             JOIN agent_sessions session ON session.id=channel.session_id
            WHERE channel.subject_kind='session'
              AND session.work_item_id=$1 AND session.agent_id=$2) AS channels,
           (SELECT count(*)::int FROM domain_events event
            WHERE event.cursor>$3::bigint AND event.payload->>'workItemId'=$1::text) AS events,
           (SELECT count(*)::int FROM outbox_events outbox
             JOIN domain_events event ON event.id=outbox.domain_event_id
            WHERE event.cursor>$3::bigint AND event.payload->>'workItemId'=$1::text) AS outbox,
           (SELECT count(*)::int FROM agent_webhook_deliveries delivery
             JOIN domain_events event ON event.id=delivery.event_id
            WHERE event.cursor>$3::bigint AND event.payload->>'workItemId'=$1::text) AS webhook_deliveries`,
        [item.id, agentId, cursorBefore, actorId],
      )).rows[0]
      expect(residue).toEqual({
        delegations: 0,
        sessions: 0,
        session_credentials: 0,
        prompts: 0,
        context_snapshots: 0,
        channels: 0,
        events: 0,
        outbox: 0,
        webhook_deliveries: 0,
      })

      const retry = await coordinator(
        connection.token,
        'POST',
        `/api/v1/work-items/${item.id}/claim`,
        {},
        item.revision,
      )
      expect(retry.statusCode, retry.body).toBe(200)
      const assignment = (await db.query<{ delegation_id: string; session_id: string }>(
        `SELECT delegation.id AS delegation_id,session.id AS session_id
           FROM delegations delegation
           JOIN agent_sessions session ON session.delegation_id=delegation.id
          WHERE delegation.work_item_id=$1
            AND delegation.agent_id=$2
            AND delegation.status='active'
            AND session.session_kind='execution'
            AND session.state NOT IN ('completed','failed','canceled')`,
        [item.id, agentId],
      )).rows
      expect(assignment).toHaveLength(1)
    }
  }, 120_000)

  it('imports a prepared Project once and reconstructs the full mapping after API and MCP restart', async () => {
    const unique = randomUUID().replaceAll('-', '').slice(0, 10)
    const agentSlug = `import-coordinator-${unique}`
    const created = await human('POST', '/api/v1/agent-connections', {
      name: `Import coordinator ${unique}`,
      agentSlug,
      clientType: 'codex',
      teamId,
      principalHumanActorId: actorId,
      requestedCapabilities: ['work:read', 'work:write'],
      grantAgentDelegate: false,
    })
    expect(created.statusCode, created.body).toBe(201)
    const connectUrl = created.json<{ connect_url: string }>().connect_url
    const redeemed = await app.inject({
      method: 'POST',
      url: '/api/v1/agent-connections/redeem',
      payload: {
        pairingCode: new URL(connectUrl).hash.slice(1),
        agentSlug,
        client: { type: 'codex', version: '1.0.0' },
      },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(redeemed.statusCode, redeemed.body).toBe(200)
    const token = redeemed.json<{ installation_token: string }>().installation_token
    const projectName = `Kaneo import replay ${unique}`
    const source = {
      teamRef: teamKey,
      defaultStatus: 'Ready',
      project: {
        sourceId: `linear-project-${unique}`,
        name: projectName,
        summary: 'Prepared and applied through the real MCP transport.',
        provenance: {
          provider: 'linear',
          sourceUrl: `https://linear.app/workmesh/project/${unique}`,
          sourceIdentifier: `linear-project-${unique}`,
        },
      },
      milestones: [
        { sourceId: 'm1', name: 'Human foundation' },
        { sourceId: 'm2', name: 'Agent ergonomics' },
      ],
      workItems: [
        { sourceId: 'issue-1', title: 'Build project surface', milestoneSourceId: 'm1', priority: 'high', labels: ['roadmap:post-ga'] },
        { sourceId: 'issue-2', title: 'Build issue surface', milestoneSourceId: 'm1', parentSourceId: 'issue-1' },
        { sourceId: 'issue-3', title: 'Dogfood project import', milestoneSourceId: 'm2', priority: 'urgent' },
      ],
      relations: [
        { sourceId: 'relation-1', sourceWorkItemId: 'issue-2', targetWorkItemId: 'issue-3', kind: 'blocks' },
      ],
    }
    const startMcp = async () => {
      const server = await createWorkMeshMcpHttpServer({
        baseUrl: apiBaseUrl,
        coordination: true,
        mode: 'read-write',
        readinessProbe: async () => undefined,
      })
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Expected MCP TCP listening address')
      const url = `http://127.0.0.1:${address.port}/mcp`
      const initialized = await mcpRequest(url, token, 'initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'workmesh-import-replay-acceptance', version: '1.0.0' },
      })
      expect(initialized.error).toBeUndefined()
      return { server, url }
    }

    const firstMcp = await startMcp()
    let firstData: {
      contentHash: string
      reportHash: string
      complete: boolean
      mapping: {
        project: { targetId: string }
        milestones: { sourceId: string; targetId: string }[]
        workItems: { sourceId: string; targetId: string; targetRef: string }[]
        relations: { sourceId: string; targetId: string }[]
      }
    }
    let preparation: { contentHash: string; plan: object }
    try {
      const context = await mcpTool(firstMcp.url, token, 'get_workmesh_context', {})
      expect((context.structuredContent?.data as { team: { id: string }; eventCursor: { cursor: string } }).team.id).toBe(teamId)
      const before = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM projects WHERE name=$1 AND deleted_at IS NULL', [projectName])
      expect(before.rows[0]?.count).toBe('0')
      const prepared = await mcpTool(firstMcp.url, token, 'prepare_project_import', source)
      preparation = prepared.structuredContent?.data as typeof preparation
      expect(preparation.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      const afterPrepare = await db.query<{ count: string }>('SELECT count(*)::text AS count FROM projects WHERE name=$1 AND deleted_at IS NULL', [projectName])
      expect(afterPrepare.rows[0]?.count).toBe('0')
      const applied = await mcpTool(firstMcp.url, token, 'apply_project_import', preparation)
      firstData = applied.structuredContent?.data as typeof firstData
      expect(firstData).toMatchObject({
        contentHash: preparation.contentHash,
        complete: true,
        mapping: {
          milestones: [{ sourceId: 'm1' }, { sourceId: 'm2' }],
          workItems: [{ sourceId: 'issue-1' }, { sourceId: 'issue-2' }, { sourceId: 'issue-3' }],
          relations: [{ sourceId: 'relation-1' }],
        },
      })
    } finally {
      firstMcp.server.close()
      await once(firstMcp.server, 'close')
    }

    await app.close()
    app = buildApp({ features, logger: { level: 'error' } })
    await listenApi()
    const replayMcp = await startMcp()
    try {
      const replayed = await mcpTool(replayMcp.url, token, 'apply_project_import', preparation!)
      expect(replayed.structuredContent?.data).toEqual(firstData!)
      const visibleItems = await mcpTool(replayMcp.url, token, 'list_work_items', { teamId, limit: 200 })
      const visibleIds = (visibleItems.structuredContent?.data as { items: { id: string }[] }).items.map(item => item.id)
      expect(visibleIds).toEqual(expect.arrayContaining(firstData!.mapping.workItems.map(item => item.targetId)))
      for (const item of firstData!.mapping.workItems) {
        const detail = await mcpTool(replayMcp.url, token, 'get_work_item', { workItemId: item.targetId })
        expect((detail.structuredContent?.data as { id: string }).id).toBe(item.targetId)
      }
      const hiddenItems = await mcpRequest(replayMcp.url, token, 'tools/call', {
        name: 'list_work_items',
        arguments: { teamId: otherTeamId, limit: 200 },
      })
      expect(hiddenItems.result?.isError).toBe(true)
      expect(hiddenItems.result?.structuredContent).toMatchObject({
        error: { code: 'RESOURCE_SCOPE_DENIED' },
      })
    } finally {
      replayMcp.server.close()
      await once(replayMcp.server, 'close')
    }

    expect((await db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM projects WHERE id=$1 AND name=$2 AND deleted_at IS NULL',
      [firstData!.mapping.project.targetId, projectName],
    )).rows[0]?.count).toBe('1')
    expect((await db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM project_milestones WHERE project_id=$1 AND deleted_at IS NULL',
      [firstData!.mapping.project.targetId],
    )).rows[0]?.count).toBe('2')
    expect((await db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM work_items WHERE project_id=$1 AND deleted_at IS NULL',
      [firstData!.mapping.project.targetId],
    )).rows[0]?.count).toBe('3')
    expect((await db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM work_item_relations WHERE id=$1 AND deleted_at IS NULL',
      [firstData!.mapping.relations[0]!.targetId],
    )).rows[0]?.count).toBe('1')
  }, 240_000)

  it('keeps the old credential active when a rotation pairing is abandoned', async () => {
    const slug = `abandoned-${randomUUID().slice(0, 8)}`
    const created = await human('POST', '/api/v1/agent-connections', { name: 'Abandoned rotation', agentSlug: slug, clientType: 'generic_mcp', teamId, principalHumanActorId: actorId, requestedCapabilities: ['work:read'], grantAgentDelegate: false })
    expect(created.statusCode, created.body).toBe(201)
    const envelope = created.json<{ connection: { id: string }; connect_url: string }>()
    const redeemed = await app.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem', payload: { pairingCode: new URL(envelope.connect_url).hash.slice(1), agentSlug: slug, client: { type: 'generic_mcp', version: '1.0.0' } }, headers: { 'idempotency-key': randomUUID() } })
    expect(redeemed.statusCode, redeemed.body).toBe(200)
    const token = redeemed.json<{ installation_token: string }>().installation_token
    const detail = await human('GET', `/api/v1/agent-connections/${envelope.connection.id}`)
    const rotated = await human('POST', `/api/v1/agent-connections/${envelope.connection.id}/rotate`, {}, detail.json<{ revision: number }>().revision)
    expect(rotated.statusCode, rotated.body).toBe(201)
    expect((await coordinator(token, 'GET', '/api/v1/projects')).statusCode).toBe(200)
    const rotationCode = new URL(rotated.json<{ connect_url: string }>().connect_url).hash.slice(1)
    await db.query("UPDATE agent_connection_pairings SET expires_at=now()-interval '1 second' WHERE code_hash=$1", [tokenHash(rotationCode)])
    await createAgentConnectionLifecycleWorker({ db }).tick()
    const restored = await human('GET', `/api/v1/agent-connections/${envelope.connection.id}`)
    expect(restored.statusCode, restored.body).toBe(200)
    expect(restored.json<{ status: string }>().status).toBe('active')
    expect((await coordinator(token, 'GET', '/api/v1/projects')).statusCode).toBe(200)
  })

  it('allows an explicitly privileged coordinator to delegate an issue', async () => {
    const suffix = randomUUID().slice(0, 8)
    const target = await human('POST', '/api/v1/agents/register', { slug: `target-${suffix}`, name: 'Target executor', provider: 'fake', version: '1.0.0', supportedProtocols: ['native_http'], requestedCapabilities: ['work:read','work:write'], approvedCapabilities: ['work:read','work:write'], outputArtifactTypes: [], maxConcurrency: 1 })
    expect(target.statusCode, target.body).toBe(200)
    const targetId = target.json<{ id: string }>().id
    expect((await human('PUT', `/api/v1/agents/${targetId}/team-access/${teamId}`, { approvedCapabilities: ['work:read','work:write'] })).statusCode).toBe(200)
    const created = await human('POST', '/api/v1/agent-connections', { name: 'Delegating coordinator', agentSlug: `delegate-${suffix}`, clientType: 'generic_mcp', teamId, principalHumanActorId: actorId, requestedCapabilities: ['work:read','work:write','agent:delegate'], grantAgentDelegate: true })
    expect(created.statusCode, created.body).toBe(201)
    const envelope = created.json<{ connect_url: string }>()
    const redeemed = await app.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem', payload: { pairingCode: new URL(envelope.connect_url).hash.slice(1), agentSlug: `delegate-${suffix}`, client: { type: 'generic_mcp', version: '1.0.0' } }, headers: { 'idempotency-key': randomUUID() } })
    expect(redeemed.statusCode, redeemed.body).toBe(200)
    const token = redeemed.json<{ installation_token: string }>().installation_token
    const work = await coordinator(token, 'POST', '/api/v1/work-items', { teamId, title: 'Delegated by coordinator', statusId: readyId, priority: 'medium', labels: [] })
    expect(work.statusCode, work.body).toBe(200)
    const item = work.json<{ id: string; revision: number }>()
    const started = await coordinator(token, 'POST', `/api/v1/work-items/${item.id}/agent-session`, { agentId: targetId, principalHumanActorId: actorId, role: 'executor', requestedCapabilities: ['work:read','work:write'], initialPrompt: 'Execute this issue.', budget: {} }, item.revision)
    expect(started.statusCode, started.body).toBe(200)
    expect(started.json<{ session: { id: string } }>().session.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('preserves an existing Agent Team grant when creating a narrower Connection', async () => {
    const slug = `shared-grant-${randomUUID().slice(0, 8)}`
    const registered = await human('POST', '/api/v1/agents/register', {
      slug, name: 'Shared grant agent', provider: 'fake', version: '1.0.0',
      supportedProtocols: ['native_http'], requestedCapabilities: ['work:read','work:write'],
      approvedCapabilities: ['work:read','work:write'], outputArtifactTypes: [], maxConcurrency: 1,
    })
    expect(registered.statusCode, registered.body).toBe(200)
    const agentId = registered.json<{ id: string }>().id
    expect((await human('PUT', `/api/v1/agents/${agentId}/team-access/${teamId}`, {
      approvedCapabilities: ['work:read','work:write'],
    })).statusCode).toBe(200)

    const created = await human('POST', '/api/v1/agent-connections', {
      name: 'Read-only Connection', agentSlug: slug, clientType: 'generic_mcp', teamId,
      principalHumanActorId: actorId, requestedCapabilities: ['work:read'], grantAgentDelegate: false,
    })
    expect(created.statusCode, created.body).toBe(201)
    const access = (await db.query<{ approved_capabilities: string[]; revoked_at: Date | null }>(
      'SELECT approved_capabilities,revoked_at FROM agent_team_access WHERE agent_id=$1 AND team_id=$2',
      [agentId, teamId],
    )).rows[0]
    expect(access?.approved_capabilities.sort()).toEqual(['work:read','work:write'])
    expect(access?.revoked_at).toBeNull()
  })

  it('rebinds the live coordination principal and durably records worker expiry', async () => {
    const slug = `rebind-${randomUUID().slice(0, 8)}`
    const created = await human('POST', '/api/v1/agent-connections', {
      name: 'Rebound Connection', agentSlug: slug, clientType: 'generic_mcp', teamId,
      principalHumanActorId: actorId, requestedCapabilities: ['work:read'], grantAgentDelegate: false,
    })
    expect(created.statusCode, created.body).toBe(201)
    const envelope = created.json<{ connection: { id: string }; connect_url: string }>()
    const redeemed = await app.inject({
      method: 'POST', url: '/api/v1/agent-connections/redeem',
      payload: { pairingCode: new URL(envelope.connect_url).hash.slice(1), agentSlug: slug, client: { type: 'generic_mcp', version: '1.0.0' } },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(redeemed.statusCode, redeemed.body).toBe(200)
    const token = redeemed.json<{ installation_token: string }>().installation_token
    expect((await coordinator(token, 'GET', '/api/v1/projects')).statusCode).toBe(200)

    const secondPrincipal = randomUUID()
    await db.query(
      `INSERT INTO actors(id,workspace_id,kind,workspace_role,email,display_name,password_hash)
       SELECT $1,workspace_id,'human','member',$2,'Second principal','unused' FROM actors WHERE id=$3`,
      [secondPrincipal, `${secondPrincipal}@example.test`, actorId],
    )
    await db.query(
      `INSERT INTO memberships(workspace_id,team_id,actor_id,role)
       SELECT workspace_id,$1,$2,'member' FROM actors WHERE id=$3`,
      [teamId, secondPrincipal, actorId],
    )
    const detail = await human('GET', `/api/v1/agent-connections/${envelope.connection.id}`)
    const patched = await human('PATCH', `/api/v1/agent-connections/${envelope.connection.id}`, {
      principalHumanActorId: secondPrincipal,
    }, detail.json<{ revision: number }>().revision)
    expect(patched.statusCode, patched.body).toBe(200)
    const principalState = (await db.query<{ delegation_principal: string; session_principal: string; session_id: string }>(
      `SELECT delegation.principal_human_actor_id AS delegation_principal,
              coordination.principal_human_actor_id AS session_principal,
              coordination.agent_session_id AS session_id
         FROM agent_connections connection
         JOIN delegations delegation ON delegation.id=connection.delegation_id
         JOIN agent_coordination_sessions coordination ON coordination.connection_id=connection.id AND coordination.status='active'
        WHERE connection.id=$1`,
      [envelope.connection.id],
    )).rows[0]!
    expect(principalState.delegation_principal).toBe(secondPrincipal)
    expect(principalState.session_principal).toBe(secondPrincipal)

    await db.query("UPDATE agent_coordination_sessions SET expires_at=now()-interval '1 second' WHERE agent_session_id=$1", [principalState.session_id])
    await createAgentConnectionLifecycleWorker({ db }).tick()
    expect((await db.query<{ state: string }>('SELECT state FROM agent_sessions WHERE id=$1', [principalState.session_id])).rows[0]?.state).toBe('canceled')
    const durableExpiry = await db.query<{
      event_type: string
      payload: Record<string, unknown>
      outbox_id: string
    }>(
      `SELECT event.event_type,event.payload,outbox.id AS outbox_id
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE (event.event_type='agent.coordination_session.closed'
               AND event.payload->>'sessionId'=$1::text)
           OR (event.event_type='agent.session.state_changed'
               AND event.aggregate_type='agent_session' AND event.aggregate_id=$1::uuid)
        ORDER BY event.cursor`,
      [principalState.session_id],
    )
    expect(durableExpiry.rows.map(event => event.event_type)).toEqual([
      'agent.coordination_session.closed',
      'agent.session.state_changed',
    ])
    expect(durableExpiry.rows.every(event => Boolean(event.outbox_id))).toBe(true)
    expect(durableExpiry.rows[0]?.payload).toMatchObject({
      connectionId: envelope.connection.id,
      sessionId: principalState.session_id,
      reason: 'expired',
    })
    expect(durableExpiry.rows[0]?.payload).not.toHaveProperty('sessionReferenceOmitted')

    const recovered = await coordinator(
      token,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )
    expect(recovered.statusCode, recovered.body).toBe(200)
    const terminalSessionId = recovered.json<{ coordination_session: { id: string } }>()
      .coordination_session.id
    await db.query(
      `UPDATE agent_sessions
          SET state='completed',state_reason='terminal expiry fixture',ended_at=now(),
              revision=revision+1,updated_at=now()
        WHERE id=$1`,
      [terminalSessionId],
    )
    await db.query(
      "UPDATE agent_coordination_sessions SET expires_at=now()-interval '1 second' WHERE agent_session_id=$1",
      [terminalSessionId],
    )
    const terminalCursor = (await db.query<{ cursor: string }>(
      'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    await createAgentConnectionLifecycleWorker({ db }).tick()
    expect((await db.query<{ state: string }>(
      'SELECT state FROM agent_sessions WHERE id=$1',
      [terminalSessionId],
    )).rows[0]?.state).toBe('completed')
    expect((await db.query<{ event_type: string }>(
      `SELECT event_type FROM domain_events
        WHERE cursor>$1::bigint
          AND (aggregate_id=$2::uuid OR payload->>'sessionId'=$2::text)
        ORDER BY cursor`,
      [terminalCursor, terminalSessionId],
    )).rows.map(event => event.event_type)).toEqual([
      'agent.coordination_session.closed',
    ])

    const scoped = await pairConnection(
      `worker-scope-${randomUUID().slice(0, 8)}`,
      ['work:read'],
    )
    const scopedIdentityResponse = await coordinator(
      scoped.token,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )
    expect(scopedIdentityResponse.statusCode, scopedIdentityResponse.body).toBe(200)
    const scopedSessionId = scopedIdentityResponse
      .json<{ coordination_session: { id: string } }>().coordination_session.id
    await db.query(
      'UPDATE agent_sessions SET team_id=$2 WHERE id=$1',
      [scopedSessionId, otherTeamId],
    )
    await db.query(
      "UPDATE agent_coordination_sessions SET expires_at=now()-interval '1 second' WHERE agent_session_id=$1",
      [scopedSessionId],
    )
    const scopedCursor = (await db.query<{ cursor: string }>(
      'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    await createAgentConnectionLifecycleWorker({ db }).tick()
    const scopedEvents = (await db.query<{
      event_type: string
      team_id: string | null
      actor_id: string
      correlation_id: string
      aggregate_type: string
      aggregate_id: string
      payload: Record<string, unknown>
      outbox_id: string
    }>(
      `SELECT event.event_type,event.team_id,event.actor_id,event.correlation_id,
              event.aggregate_type,event.aggregate_id,event.payload,outbox.id AS outbox_id
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE event.cursor>$1::bigint
        ORDER BY event.cursor`,
      [scopedCursor],
    )).rows
    expect(scopedEvents.map(event => event.event_type)).toEqual([
      'agent.coordination_session.closed',
      'agent.session.state_changed',
    ])
    expect(scopedEvents[0]).toMatchObject({
      team_id: teamId,
      aggregate_type: 'agent_connection',
      aggregate_id: scoped.connection.id,
      payload: {
        connectionId: scoped.connection.id,
        reason: 'expired',
        sessionReferenceOmitted: 'resource_scope_mismatch',
      },
    })
    expect(scopedEvents[0]?.payload).not.toHaveProperty('sessionId')
    expect(scopedEvents[1]).toMatchObject({
      team_id: otherTeamId,
      actor_id: scoped.connection.agent_actor_id,
      aggregate_type: 'agent_session',
      aggregate_id: scopedSessionId,
      payload: {
        state: 'canceled',
        reason: 'coordination session expired',
      },
    })
    expect(scopedEvents[1]?.correlation_id)
      .toBe(`worker:agent-session:${scopedSessionId}:expired`)
    expect(scopedEvents[1]?.payload).not.toHaveProperty('connectionId')
    expect(JSON.stringify(scopedEvents[1])).not.toContain(scoped.connection.id)
    expect(scopedEvents.every(event => Boolean(event.outbox_id))).toBe(true)
  })

  it('returns the exact active or overlap credential identity across rotation', async () => {
    const slug = `identity-${randomUUID().slice(0, 8)}`
    const paired = await pairConnection(slug, ['work:read'])
    const first = await coordinator(
      paired.token,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )
    expect(first.statusCode, first.body).toBe(200)
    const activeIdentity = first.json<{
      connection: { id: string }
      coordination_session: { id: string }
      agent_actor_id: string
      principal_human_actor_id: string
      team_id: string
      authenticated_credential: {
        fingerprint_prefix: string
        status: string
        overlap_until: string | null
      }
    }>()
    expect(activeIdentity).toMatchObject({
      connection: { id: paired.connection.id },
      agent_actor_id: paired.connection.agent_actor_id,
      principal_human_actor_id: actorId,
      team_id: teamId,
      authenticated_credential: {
        fingerprint_prefix: tokenHash(paired.token).slice(0, 12),
        status: 'active',
        overlap_until: null,
      },
    })
    expect((await db.query<{
      revoked_at: Date | null
      expires_at: Date | null
    }>(
      'SELECT revoked_at,expires_at FROM agent_installation_tokens WHERE token_hash=$1',
      [tokenHash(paired.token)],
    )).rows).toEqual([{ revoked_at: null, expires_at: null }])

    const detail = await human('GET', `/api/v1/agent-connections/${paired.connection.id}`)
    const rotated = await human(
      'POST',
      `/api/v1/agent-connections/${paired.connection.id}/rotate`,
      {},
      detail.json<{ revision: number }>().revision,
    )
    expect(rotated.statusCode, rotated.body).toBe(201)
    const rotation = rotated.json<{ connect_url: string }>()
    const next = await app.inject({
      method: 'POST',
      url: '/api/v1/agent-connections/redeem',
      payload: {
        pairingCode: new URL(rotation.connect_url).hash.slice(1),
        agentSlug: slug,
        client: { type: 'codex', version: '1.1.1' },
      },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(next.statusCode, next.body).toBe(200)
    const nextBody = next.json<{
      installation_token: string
      connection: { revision: number }
    }>()
    const mirroredRotation = (await db.query<{
      token_hash: string
      revoked_at: Date | null
      expires_at: Date | null
    }>(
      `SELECT token_hash,revoked_at,expires_at
         FROM agent_installation_tokens
        WHERE token_hash=ANY($1::text[])
        ORDER BY token_hash`,
      [[tokenHash(paired.token), tokenHash(nextBody.installation_token)]],
    )).rows
    expect(mirroredRotation).toHaveLength(2)
    expect(mirroredRotation.find(row => row.token_hash === tokenHash(paired.token))).toMatchObject({
      revoked_at: null,
      expires_at: expect.any(Date),
    })
    expect(mirroredRotation.find(row => row.token_hash === tokenHash(nextBody.installation_token))).toMatchObject({
      revoked_at: null,
      expires_at: null,
    })
    await db.query(
      `UPDATE agent_sessions
          SET state='paused',state_reason='overlap convergence fixture',
              revision=revision+1,updated_at=now()
        WHERE id=$1`,
      [activeIdentity.coordination_session.id],
    )
    const overlapResponses = await Promise.all(Array.from({ length: 16 }, (_, index) =>
      coordinator(
        index % 2 === 0 ? paired.token : nextBody.installation_token,
        'GET',
        '/api/v1/agent-connections/current-identity',
      )))
    expect(overlapResponses.every(response => response.statusCode === 200)).toBe(true)
    const overlapIdentities = overlapResponses.map(response =>
      response.json<typeof activeIdentity>())
    const oldIdentity = overlapIdentities[0]!
    const newIdentity = overlapIdentities[1]!
    expect(oldIdentity.authenticated_credential).toMatchObject({
      fingerprint_prefix: tokenHash(paired.token).slice(0, 12),
      status: 'overlap',
    })
    expect(oldIdentity.authenticated_credential.overlap_until).toEqual(expect.any(String))
    expect(newIdentity.authenticated_credential).toEqual({
      fingerprint_prefix: tokenHash(nextBody.installation_token).slice(0, 12),
      status: 'active',
      overlap_until: null,
    })
    expect(new Set(overlapIdentities.map(identity => identity.coordination_session.id)).size).toBe(1)
    expect(newIdentity.coordination_session.id).toBe(oldIdentity.coordination_session.id)
    expect(newIdentity.coordination_session.id).not.toBe(activeIdentity.coordination_session.id)
    expect((await db.query<{ coordination: number; backing: number }>(
      `SELECT
         (SELECT count(*)::int FROM agent_coordination_sessions
           WHERE connection_id=$1 AND status='active') AS coordination,
         (SELECT count(*)::int FROM agent_sessions
           WHERE coordination_connection_id=$1 AND session_kind='coordination'
             AND state NOT IN ('completed','failed','canceled')) AS backing`,
      [paired.connection.id],
    )).rows[0]).toEqual({ coordination: 1, backing: 1 })

    await db.query(
      `UPDATE agent_connection_credentials
          SET overlap_until=now()-interval '1 second'
        WHERE connection_id=$1 AND token_hash=$2 AND status='overlap'`,
      [paired.connection.id, tokenHash(paired.token)],
    )
    const expiredOverlap = await coordinator(
      paired.token,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )
    expect(expiredOverlap.statusCode, expiredOverlap.body).toBe(401)
    expect(expiredOverlap.json<{ error: { code: string; message: string } }>().error)
      .toMatchObject({
        code: 'UNAUTHENTICATED',
        message: 'Installation Token is invalid or inactive',
      })
    expect((await coordinator(
      nextBody.installation_token,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )).statusCode).toBe(200)

    const confirmed = await human(
      'POST',
      `/api/v1/agent-connections/${paired.connection.id}/rotate-confirm`,
      {},
      nextBody.connection.revision,
    )
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    expect((await coordinator(
      paired.token,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )).statusCode).toBe(401)
    expect((await coordinator(
      nextBody.installation_token,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )).statusCode).toBe(200)
    expect((await db.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM agent_installation_tokens WHERE token_hash=$1',
      [tokenHash(paired.token)],
    )).rows[0]?.revoked_at).toEqual(expect.any(Date))
  })

  it('rejects an existing Agent capability overgrant before creating durable pairing state', async () => {
    const slug = `approval-${randomUUID().slice(0, 8)}`
    const paired = await pairConnection(slug, ['work:read', 'work:write'])
    const agent = (await db.query<{ id: string }>(
      'SELECT agent_id AS id FROM agent_connections WHERE id=$1',
      [paired.connection.id],
    )).rows[0]!
    await db.query(
      `UPDATE agent_definitions
          SET approved_capabilities=ARRAY['work:read'],revision=revision+1,updated_at=now()
        WHERE id=$1`,
      [agent.id],
    )

    const denied = await human('POST', '/api/v1/agent-connections', {
      name: 'Rejected capability overgrant',
      agentSlug: slug,
      clientType: 'codex',
      teamId: otherTeamId,
      principalHumanActorId: actorId,
      requestedCapabilities: ['work:read', 'work:write'],
      grantAgentDelegate: false,
    })
    expect(denied.statusCode, denied.body).toBe(403)
    expect(denied.json<{ error: { code: string; message: string } }>().error)
      .toEqual(expect.objectContaining({
        code: 'CAPABILITY_DENIED',
        message: 'Connection capabilities require matching Agent definition approval',
      }))
    expect((await db.query<{
      connections: number
      pairings: number
      delegations: number
      team_access: number
    }>(
      `SELECT
         (SELECT count(*)::int FROM agent_connections
           WHERE agent_id=$1 AND team_id=$2) AS connections,
         (SELECT count(*)::int FROM agent_connection_pairings pairing
           JOIN agent_connections connection ON connection.id=pairing.connection_id
          WHERE connection.agent_id=$1 AND connection.team_id=$2) AS pairings,
         (SELECT count(*)::int FROM delegations
           WHERE agent_id=$1 AND team_id=$2 AND role='coordinator') AS delegations,
         (SELECT count(*)::int FROM agent_team_access
           WHERE agent_id=$1 AND team_id=$2) AS team_access`,
      [agent.id, otherTeamId],
    )).rows[0]).toEqual({
      connections: 0,
      pairings: 0,
      delegations: 0,
      team_access: 0,
    })
  })

  it('revokes a cross-Team backing without exposing Connection metadata to that Team', async () => {
    const paired = await pairConnection(
      `revoke-scope-${randomUUID().slice(0, 8)}`,
      ['work:read'],
    )
    const identityResponse = await coordinator(
      paired.token,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )
    expect(identityResponse.statusCode, identityResponse.body).toBe(200)
    const sessionId = identityResponse
      .json<{ coordination_session: { id: string } }>().coordination_session.id
    await db.query(
      'UPDATE agent_sessions SET team_id=$2 WHERE id=$1',
      [sessionId, otherTeamId],
    )
    const detail = await human('GET', `/api/v1/agent-connections/${paired.connection.id}`)
    const before = (await db.query<{ cursor: string }>(
      'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const revoked = await human(
      'DELETE',
      `/api/v1/agent-connections/${paired.connection.id}`,
      undefined,
      detail.json<{ revision: number }>().revision,
    )
    expect(revoked.statusCode, revoked.body).toBe(204)

    const events = (await db.query<{
      event_type: string
      team_id: string | null
      actor_id: string
      correlation_id: string
      aggregate_type: string
      aggregate_id: string
      payload: Record<string, unknown>
      outbox_id: string
    }>(
      `SELECT event.event_type,event.team_id,event.actor_id,event.correlation_id,
              event.aggregate_type,event.aggregate_id,event.payload,outbox.id AS outbox_id
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE event.cursor>$1::bigint
        ORDER BY event.cursor`,
      [before],
    )).rows
    expect(events.map(event => event.event_type)).toEqual([
      'agent.coordination_session.closed',
      'agent.session.state_changed',
      'agent.connection.revoked',
    ])
    expect(events[0]).toMatchObject({
      team_id: teamId,
      aggregate_type: 'agent_connection',
      aggregate_id: paired.connection.id,
      payload: {
        connectionId: paired.connection.id,
        reason: 'connection_revoked',
        sessionReferenceOmitted: 'resource_scope_mismatch',
      },
    })
    expect(events[0]?.payload).not.toHaveProperty('sessionId')
    expect(events[1]).toMatchObject({
      team_id: otherTeamId,
      actor_id: paired.connection.agent_actor_id,
      aggregate_type: 'agent_session',
      aggregate_id: sessionId,
      payload: {
        state: 'canceled',
        reason: 'coordination connection revoked',
      },
    })
    expect(events[1]?.correlation_id)
      .toBe(`agent-session:${sessionId}:connection-revoked`)
    expect(events[1]?.payload).not.toHaveProperty('connectionId')
    expect(JSON.stringify(events[1])).not.toContain(paired.connection.id)
    expect(events.every(event => Boolean(event.outbox_id))).toBe(true)
    expect((await db.query<{ state: string }>(
      'SELECT state FROM agent_sessions WHERE id=$1',
      [sessionId],
    )).rows[0]?.state).toBe('canceled')
  })

  it('recovers terminal, invalid, expired, and concurrent Coordination backings atomically', async () => {
    const paired = await pairConnection(
      `recover-${randomUUID().slice(0, 8)}`,
      ['work:read', 'work:write'],
    )
    const readIdentity = async () => {
      const response = await coordinator(
        paired.token,
        'GET',
        '/api/v1/agent-connections/current-identity',
      )
      expect(response.statusCode, response.body).toBe(200)
      return response.json<{ coordination_session: { id: string } }>()
    }
    const cursor = async () => (await db.query<{ cursor: string }>(
      'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const recoveryEvents = async (after: string) => (await db.query<{
      event_type: string
      workspace_id: string
      team_id: string | null
      actor_id: string
      correlation_id: string
      aggregate_type: string
      aggregate_id: string
      payload: Record<string, unknown> & { reason?: string }
      resources: Array<{ relation: string; type: string; id: string }>
      outbox_id: string
    }>(
      `SELECT event.event_type,event.workspace_id,event.team_id,event.actor_id,
              event.correlation_id,event.aggregate_type,event.aggregate_id,event.payload,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'relation',resource.relation,
                  'type',resource.resource_type,
                  'id',resource.resource_id
                ) ORDER BY resource.relation,resource.resource_type,resource.resource_id)
                  FROM domain_event_resources resource
                 WHERE resource.domain_event_id=event.id
              ),'[]'::jsonb) AS resources,
              outbox.id AS outbox_id
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE event.cursor>$1::bigint
        ORDER BY event.cursor`,
      [after],
    )).rows

    let currentSessionId = (await readIdentity()).coordination_session.id
    const bindingWork = await human('POST', '/api/v1/work-items', {
      teamId,
      title: `Binding recovery ${randomUUID().slice(0, 8)}`,
      statusId: readyId,
      priority: 'medium',
      labels: [],
      responsibleHumanActorId: actorId,
    })
    expect(bindingWork.statusCode, bindingWork.body).toBe(200)
    const bindingWorkItemId = bindingWork.json<{ id: string }>().id
    for (const terminalState of ['completed', 'failed', 'canceled']) {
      await db.query(
        `UPDATE agent_sessions
            SET state=$2::agent_session_state,state_reason=$2::text,
                ended_at=now(),revision=revision+1,updated_at=now()
          WHERE id=$1`,
        [currentSessionId, terminalState],
      )
      const before = await cursor()
      const responses = terminalState === 'completed'
        ? await Promise.all(Array.from({ length: 16 }, () => coordinator(
            paired.token,
            'GET',
            '/api/v1/agent-connections/current-identity',
          )))
        : [await coordinator(
            paired.token,
            'GET',
            '/api/v1/agent-connections/current-identity',
          )]
      expect(responses.every(response => response.statusCode === 200)).toBe(true)
      const nextSessionIds = responses.map(response =>
        response.json<{ coordination_session: { id: string } }>().coordination_session.id)
      expect(new Set(nextSessionIds).size).toBe(1)
      expect(nextSessionIds[0]).not.toBe(currentSessionId)
      expect((await db.query<{ state: string }>(
        'SELECT state FROM agent_sessions WHERE id=$1',
        [currentSessionId],
      )).rows[0]?.state).toBe(terminalState)
      const events = await recoveryEvents(before)
      expect(events.map(event => event.event_type)).toEqual([
        'agent.coordination_session.closed',
        'agent.session.created',
        'agent.coordination_session.opened',
      ])
      expect(events[0]?.payload.reason).toBe('terminal_backing')
      expect(events[0]?.payload).toMatchObject({
        connectionId: paired.connection.id,
        sessionId: currentSessionId,
      })
      expect(events[0]?.payload).not.toHaveProperty('sessionReferenceOmitted')
      expect(events[2]?.payload.reason).toBe('recovered_terminal_backing')
      expect(events.every(event => Boolean(event.outbox_id))).toBe(true)
      currentSessionId = nextSessionIds[0]!
    }

    for (const invalidState of ['queued', 'paused', 'stopping', 'stale']) {
      await db.query(
        `UPDATE agent_sessions
            SET state=$2::agent_session_state,state_reason=$2::text,
                ended_at=NULL,revision=revision+1,updated_at=now()
          WHERE id=$1`,
        [currentSessionId, invalidState],
      )
      const before = await cursor()
      const next = await readIdentity()
      expect(next.coordination_session.id).not.toBe(currentSessionId)
      expect((await db.query<{ state: string }>(
        'SELECT state FROM agent_sessions WHERE id=$1',
        [currentSessionId],
      )).rows[0]?.state).toBe('canceled')
      const events = await recoveryEvents(before)
      expect(events.map(event => event.event_type)).toEqual([
        'agent.coordination_session.closed',
        'agent.session.state_changed',
        'agent.session.created',
        'agent.coordination_session.opened',
      ])
      expect(events[0]?.payload.reason).toBe('invalid_backing')
      expect(events[0]?.payload).toMatchObject({
        connectionId: paired.connection.id,
        sessionId: currentSessionId,
      })
      expect(events[0]?.payload).not.toHaveProperty('sessionReferenceOmitted')
      expect(events[3]?.payload.reason).toBe('recovered_invalid_backing')
      currentSessionId = next.coordination_session.id
    }

    await db.query(
      "UPDATE agent_coordination_sessions SET granted_capabilities=ARRAY['work:read','work:read'] WHERE agent_session_id=$1",
      [currentSessionId],
    )
    const beforeDuplicateCapability = await cursor()
    const duplicateCapabilityRecovery = await readIdentity()
    expect(duplicateCapabilityRecovery.coordination_session.id).not.toBe(currentSessionId)
    const duplicateCapabilityEvents = await recoveryEvents(beforeDuplicateCapability)
    expect(duplicateCapabilityEvents.map(event => event.event_type)).toEqual([
      'agent.coordination_session.closed',
      'agent.session.state_changed',
      'agent.session.created',
      'agent.coordination_session.opened',
    ])
    expect(duplicateCapabilityEvents[0]?.payload.reason).toBe('invalid_binding')
    expect(duplicateCapabilityEvents[0]?.payload).toMatchObject({
      connectionId: paired.connection.id,
      sessionId: currentSessionId,
    })
    expect(duplicateCapabilityEvents[0]?.payload)
      .not.toHaveProperty('sessionReferenceOmitted')
    expect(duplicateCapabilityEvents[3]?.payload.reason).toBe('recovered_invalid_backing')
    currentSessionId = duplicateCapabilityRecovery.coordination_session.id

    for (const bindingMutation of [
      {
        sql: `UPDATE agent_sessions
                SET session_kind='execution',coordination_connection_id=NULL,work_item_id=$2
              WHERE id=$1`,
        values: [currentSessionId, bindingWorkItemId],
      },
      {
        sql: 'UPDATE agent_sessions SET coordination_connection_id=NULL WHERE id=$1',
        values: [currentSessionId],
      },
    ]) {
      bindingMutation.values[0] = currentSessionId
      await db.query(bindingMutation.sql, bindingMutation.values)
      const beforeBindingRecovery = await cursor()
      const bindingRecovery = await readIdentity()
      expect(bindingRecovery.coordination_session.id).not.toBe(currentSessionId)
      expect((await db.query<{ state: string }>(
        'SELECT state FROM agent_sessions WHERE id=$1',
        [currentSessionId],
      )).rows[0]?.state).toBe('canceled')
      const bindingEvents = await recoveryEvents(beforeBindingRecovery)
      expect(bindingEvents.map(event => event.event_type)).toEqual([
        'agent.coordination_session.closed',
        'agent.session.state_changed',
        'agent.session.created',
        'agent.coordination_session.opened',
      ])
      expect(bindingEvents[0]?.payload.reason).toBe('invalid_binding')
      expect(bindingEvents[0]?.payload).toMatchObject({
        connectionId: paired.connection.id,
        sessionId: currentSessionId,
      })
      expect(bindingEvents[0]?.payload).not.toHaveProperty('sessionReferenceOmitted')
      expect(bindingEvents[3]?.payload.reason).toBe('recovered_invalid_backing')
      currentSessionId = bindingRecovery.coordination_session.id
    }

    const foreignConnection = await human('POST', '/api/v1/agent-connections', {
      name: `Foreign Team ${randomUUID().slice(0, 8)}`,
      agentSlug: `foreign-team-${randomUUID().slice(0, 8)}`,
      clientType: 'codex',
      teamId: otherTeamId,
      principalHumanActorId: actorId,
      requestedCapabilities: ['work:read', 'work:write'],
      grantAgentDelegate: false,
    })
    expect(foreignConnection.statusCode, foreignConnection.body).toBe(201)
    const foreignConnectionId = foreignConnection.json<{ connection: { id: string } }>()
      .connection.id
    const foreignBinding = (await db.query<{
      agent_id: string
      agent_actor_id: string
      delegation_id: string
    }>(
      `SELECT agent_id,agent_actor_id,delegation_id
         FROM agent_connections WHERE id=$1`,
      [foreignConnectionId],
    )).rows[0]!
    const crossTeamSessionId = currentSessionId
    await db.query(
      `UPDATE agent_sessions
          SET team_id=$2,agent_id=$3,agent_actor_id=$4,delegation_id=$5
        WHERE id=$1`,
      [crossTeamSessionId, otherTeamId, foreignBinding.agent_id,
        foreignBinding.agent_actor_id, foreignBinding.delegation_id],
    )
    const beforeCrossTeam = await cursor()
    const rebound = await readIdentity()
    expect(rebound.coordination_session.id).not.toBe(crossTeamSessionId)
    const crossTeamEvents = await recoveryEvents(beforeCrossTeam)
    expect(crossTeamEvents.map(event => event.event_type)).toEqual([
      'agent.coordination_session.closed',
      'agent.session.state_changed',
      'agent.session.created',
      'agent.coordination_session.opened',
    ])
    const crossTeamClosed = crossTeamEvents[0]!
    expect(crossTeamClosed).toMatchObject({
      workspace_id: crossTeamEvents[2]!.workspace_id,
      team_id: teamId,
      actor_id: paired.connection.agent_actor_id,
      aggregate_type: 'agent_connection',
      aggregate_id: paired.connection.id,
      payload: {
        connectionId: paired.connection.id,
        reason: 'invalid_binding',
        sessionReferenceOmitted: 'resource_scope_mismatch',
      },
    })
    expect(crossTeamClosed.payload).not.toHaveProperty('sessionId')
    expect(crossTeamClosed.correlation_id).not.toContain(crossTeamSessionId)
    expect(crossTeamClosed.correlation_id).not.toContain(foreignConnectionId)
    expect(crossTeamClosed.resources.some(resource =>
      resource.id === otherTeamId || resource.id === crossTeamSessionId)).toBe(false)
    const crossTeamState = crossTeamEvents[1]!
    expect(crossTeamState).toMatchObject({
      team_id: otherTeamId,
      actor_id: foreignBinding.agent_actor_id,
      aggregate_type: 'agent_session',
      aggregate_id: crossTeamSessionId,
      payload: {
        state: 'canceled',
        reason: 'coordination backing session recovered',
      },
    })
    expect(crossTeamState.correlation_id)
      .toBe(`agent-session:${crossTeamSessionId}:coordination-recovered`)
    expect(crossTeamState.payload).not.toHaveProperty('connectionId')
    expect(JSON.stringify(crossTeamState)).not.toContain(paired.connection.id)
    expect(crossTeamState.resources.some(resource =>
      resource.type === 'team' && resource.id === otherTeamId)).toBe(true)
    expect(crossTeamState.resources.some(resource =>
      resource.type === 'team' && resource.id === teamId)).toBe(false)
    currentSessionId = rebound.coordination_session.id

    const foreignWorkspaceId = randomUUID()
    const foreignTeamId = randomUUID()
    const foreignHumanActorId = randomUUID()
    const foreignAgentActorId = randomUUID()
    const foreignAgentId = randomUUID()
    const foreignDelegationId = randomUUID()
    const foreignSessionId = randomUUID()
    await db.query(
      `INSERT INTO workspaces(id,name,slug)
       VALUES($1,'Foreign recovery scope',$2)`,
      [foreignWorkspaceId, `foreign-${randomUUID()}`],
    )
    await db.query(
      `INSERT INTO teams(id,workspace_id,name,key)
       VALUES($1,$2,'Foreign recovery team',$3)`,
      [foreignTeamId, foreignWorkspaceId,
        `F${randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase()}`],
    )
    await db.query(
      `INSERT INTO actors(
         id,workspace_id,kind,workspace_role,email,display_name,password_hash,is_active
       ) VALUES(
         $1,$2,'human','member',$3,'Foreign human','unused-test-password-hash',true
       ),(
         $4,$2,'agent',NULL,NULL,'Foreign agent',NULL,true
       )`,
      [foreignHumanActorId, foreignWorkspaceId,
        `foreign-${randomUUID()}@example.test`, foreignAgentActorId],
    )
    await db.query(
      `INSERT INTO agent_definitions(
         id,workspace_id,actor_id,slug,display_name,manifest,supported_protocols,
         skills,requested_capabilities,approved_capabilities,output_artifact_types,
         max_concurrency
       ) VALUES(
         $1,$2,$3,$4,'Foreign agent','{}',ARRAY['mcp']::agent_protocol[],
         ARRAY['workmesh'],ARRAY['work:read'],ARRAY['work:read'],'{}',1
       )`,
      [foreignAgentId, foreignWorkspaceId, foreignAgentActorId,
        `foreign-${randomUUID()}`],
    )
    await db.query(
      `INSERT INTO delegations(
         id,workspace_id,team_id,agent_id,agent_actor_id,
         principal_human_actor_id,role,scope_type,scope_id,
         permissions_snapshot,capability_scope,status
       ) VALUES(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,
         'coordinator','team',$3::uuid,
         ARRAY['work:read'],jsonb_build_object(
           'workspaceId',$2::uuid::text,
           'teamIds',jsonb_build_array($3::uuid::text),
           'projectIds','[]'::jsonb,'workItemIds','[]'::jsonb,
           'repositoryIds','[]'::jsonb,'capabilities',jsonb_build_array('work:read')
         ),'active'
       )`,
      [foreignDelegationId, foreignWorkspaceId, foreignTeamId, foreignAgentId,
        foreignAgentActorId, foreignHumanActorId],
    )
    await db.query(
      `INSERT INTO agent_sessions(
         id,workspace_id,team_id,agent_id,agent_actor_id,delegation_id,state,
         state_reason,acknowledged_at,last_heartbeat_at,session_kind
       ) VALUES(
         $1,$2,$3,$4,$5,$6,'executing','foreign binding fixture',now(),now(),
         'coordination'
       )`,
      [foreignSessionId, foreignWorkspaceId, foreignTeamId, foreignAgentId,
        foreignAgentActorId, foreignDelegationId],
    )
    await db.query(
      `UPDATE agent_coordination_sessions SET agent_session_id=$2
        WHERE connection_id=$1 AND status='active'`,
      [paired.connection.id, foreignSessionId],
    )
    const previousLocalSessionId = currentSessionId
    const beforeCrossWorkspace = await cursor()
    const crossWorkspaceRecovery = await readIdentity()
    expect(crossWorkspaceRecovery.coordination_session.id)
      .not.toBe(previousLocalSessionId)
    const crossWorkspaceEvents = await recoveryEvents(beforeCrossWorkspace)
    expect(crossWorkspaceEvents[0]?.event_type)
      .toBe('agent.coordination_session.closed')
    expect(crossWorkspaceEvents.slice(-2).map(event => event.event_type)).toEqual([
      'agent.session.created',
      'agent.coordination_session.opened',
    ])
    expect(crossWorkspaceEvents.slice(1, -2).map(event => event.event_type))
      .toEqual(['agent.session.state_changed', 'agent.session.state_changed'])
    const crossWorkspaceClosed = crossWorkspaceEvents[0]!
    expect(crossWorkspaceClosed).toMatchObject({
      team_id: teamId,
      aggregate_type: 'agent_connection',
      aggregate_id: paired.connection.id,
      payload: {
        connectionId: paired.connection.id,
        reason: 'invalid_binding',
        sessionReferenceOmitted: 'resource_scope_mismatch',
      },
    })
    expect(crossWorkspaceClosed.payload).not.toHaveProperty('sessionId')
    expect(crossWorkspaceClosed.correlation_id).not.toContain(foreignSessionId)
    expect(crossWorkspaceClosed.correlation_id).not.toContain(foreignWorkspaceId)
    expect(crossWorkspaceClosed.correlation_id).not.toContain(foreignTeamId)
    expect(crossWorkspaceClosed.correlation_id).not.toContain(foreignAgentActorId)
    expect(crossWorkspaceClosed.resources.some(resource =>
      resource.id === foreignWorkspaceId
      || resource.id === foreignTeamId
      || resource.id === foreignSessionId)).toBe(false)
    const foreignStateEvent = crossWorkspaceEvents.find(event =>
      event.aggregate_id === foreignSessionId)!
    expect(foreignStateEvent).toMatchObject({
      workspace_id: foreignWorkspaceId,
      team_id: foreignTeamId,
      actor_id: foreignAgentActorId,
      aggregate_type: 'agent_session',
      aggregate_id: foreignSessionId,
      payload: {
        state: 'canceled',
        reason: 'coordination backing session recovered',
      },
    })
    expect(foreignStateEvent.correlation_id)
      .toBe(`agent-session:${foreignSessionId}:coordination-recovered`)
    expect(foreignStateEvent.payload).not.toHaveProperty('connectionId')
    expect(JSON.stringify(foreignStateEvent)).not.toContain(paired.connection.id)
    expect(foreignStateEvent.resources.some(resource =>
      resource.type === 'workspace' && resource.id === foreignWorkspaceId)).toBe(true)
    expect(foreignStateEvent.resources.some(resource =>
      resource.type === 'team' && resource.id === teamId)).toBe(false)
    expect((await db.query<{ state: string }>(
      'SELECT state FROM agent_sessions WHERE id=$1',
      [foreignSessionId],
    )).rows[0]?.state).toBe('canceled')
    currentSessionId = crossWorkspaceRecovery.coordination_session.id

    await db.query(
      "UPDATE agent_coordination_sessions SET expires_at=now()-interval '1 second' WHERE agent_session_id=$1",
      [currentSessionId],
    )
    const beforeExpiry = await cursor()
    const renewed = await readIdentity()
    expect(renewed.coordination_session.id).not.toBe(currentSessionId)
    const expiryEvents = await recoveryEvents(beforeExpiry)
    expect(expiryEvents.map(event => event.event_type)).toEqual([
      'agent.coordination_session.closed',
      'agent.session.state_changed',
      'agent.session.created',
      'agent.coordination_session.opened',
    ])
    expect(expiryEvents[0]?.payload.reason).toBe('expired')
    expect(expiryEvents[0]?.payload).toMatchObject({
      connectionId: paired.connection.id,
      sessionId: currentSessionId,
    })
    expect(expiryEvents[0]?.payload).not.toHaveProperty('sessionReferenceOmitted')
    expect(expiryEvents[3]?.payload.reason).toBe('expired')
    const active = await db.query<{ coordination: number; backing: number }>(
      `SELECT
         (SELECT count(*)::int FROM agent_coordination_sessions
           WHERE connection_id=$1 AND status='active') AS coordination,
         (SELECT count(*)::int FROM agent_sessions
           WHERE coordination_connection_id=$1 AND session_kind='coordination'
             AND state NOT IN ('completed','failed','canceled')) AS backing`,
      [paired.connection.id],
    )
    expect(active.rows[0]).toEqual({ coordination: 1, backing: 1 })
  })

  it('rolls back close and event writes when Coordination recovery creation fails', async () => {
    const paired = await pairConnection(`rollback-${randomUUID().slice(0, 8)}`, ['work:read'])
    const initial = await coordinator(
      paired.token,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )
    expect(initial.statusCode, initial.body).toBe(200)
    const sessionId = initial.json<{ coordination_session: { id: string } }>()
      .coordination_session.id
    await db.query(
      `UPDATE agent_sessions
          SET state='completed',state_reason='forced terminal fixture',ended_at=now(),
              revision=revision+1,updated_at=now()
        WHERE id=$1`,
      [sessionId],
    )
    const cursorBefore = (await db.query<{ cursor: string }>(
      'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    await db.query('DROP TRIGGER IF EXISTS stage5_fail_coordination_recovery ON agent_sessions')
    await db.query('DROP FUNCTION IF EXISTS stage5_fail_coordination_recovery()')
    await db.query(`CREATE FUNCTION stage5_fail_coordination_recovery() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.session_kind='coordination' THEN
          RAISE EXCEPTION 'forced coordination recovery failure';
        END IF;
        RETURN NEW;
      END
      $$`)
    await db.query(`CREATE TRIGGER stage5_fail_coordination_recovery
      BEFORE INSERT ON agent_sessions FOR EACH ROW
      EXECUTE FUNCTION stage5_fail_coordination_recovery()`)
    try {
      const failed = await coordinator(
        paired.token,
        'GET',
        '/api/v1/agent-connections/current-identity',
      )
      expect(failed.statusCode, failed.body).toBe(500)
    } finally {
      await db.query('DROP TRIGGER IF EXISTS stage5_fail_coordination_recovery ON agent_sessions')
      await db.query('DROP FUNCTION IF EXISTS stage5_fail_coordination_recovery()')
    }

    expect((await db.query<{ status: string }>(
      'SELECT status FROM agent_coordination_sessions WHERE agent_session_id=$1',
      [sessionId],
    )).rows[0]?.status).toBe('active')
    expect((await db.query<{ state: string }>(
      'SELECT state FROM agent_sessions WHERE id=$1',
      [sessionId],
    )).rows[0]?.state).toBe('completed')
    expect((await db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM domain_events WHERE cursor>$1::bigint',
      [cursorBefore],
    )).rows[0]?.count).toBe('0')

    const recovered = await coordinator(
      paired.token,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )
    expect(recovered.statusCode, recovered.body).toBe(200)
    expect(recovered.json<{ coordination_session: { id: string } }>()
      .coordination_session.id).not.toBe(sessionId)
  })

  it('keeps unknown credential diagnostics uniform and keyed without logging credential bytes', async () => {
    const logLines: string[] = []
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logLines.push(chunk.toString())
        callback()
      },
    })
    const diagnosticApp = buildApp({
      features,
      logger: { level: 'warn', stream },
    })
    const unknownToken = `wmi_${opaqueToken()}`
    const pairingCode = `wmp_${opaqueToken()}`
    try {
      const responses = await Promise.all([
        { headers: { 'x-workmesh-installation-token': unknownToken } },
        { headers: { 'x-workmesh-installation-token': pairingCode } },
        { headers: {} },
        { headers: { 'x-workmesh-installation-token': '' } },
        { headers: { cookie } },
      ].map(options => diagnosticApp.inject({
          method: 'GET',
          url: '/api/v1/agent-connections/current-identity',
          headers: options.headers,
        })))
      expect(responses.map(response => response.statusCode))
        .toEqual([401, 401, 401, 401, 401])
      expect(responses.map(response => response.json<{ error: { code: string; message: string } }>().error))
        .toEqual(Array.from({ length: 5 }, () => ({
          code: 'UNAUTHENTICATED',
          message: 'Installation Token is invalid or inactive',
          correlationId: expect.any(String),
        })))
    } finally {
      await diagnosticApp.close()
    }
    const logs = logLines.join('')
    expect(logs).not.toContain(unknownToken)
    expect(logs).not.toContain(pairingCode)
    expect(logs).not.toContain(cookie)
    expect(logs).not.toContain(tokenHash(unknownToken))
    expect(logs).not.toContain(tokenHash(pairingCode))
    expect(logs).toMatch(/"credentialAuditFingerprint":"[a-f0-9]{24}"/)
    expect(logs).not.toContain('recognizedCredentialFingerprintPrefix')
  })

  it('rejects stale Connection grants after Agent definition capabilities shrink', async () => {
    const paired = await pairConnection(
      `definition-shrink-${randomUUID().slice(0, 8)}`,
      ['work:read', 'work:write'],
    )
    const agentId = (await db.query<{ agent_id: string }>(
      'SELECT agent_id FROM agent_connections WHERE id=$1',
      [paired.connection.id],
    )).rows[0]!.agent_id
    await db.query(
      "UPDATE agent_definitions SET approved_capabilities=ARRAY['work:read'],updated_at=now() WHERE id=$1",
      [agentId],
    )

    const denied = await coordinator(
      paired.token,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )
    expect(denied.statusCode, denied.body).toBe(401)
    expect(denied.json<{ error: { code: string; message: string } }>().error).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Installation Token is invalid or inactive',
    })
  })

  it('does not charge Coordination Sessions against execution admission capacity', async () => {
    const slug = `capacity-${randomUUID().slice(0, 8)}`
    const capabilities = ['work:read', 'work:write']
    const registration = await human('POST', '/api/v1/agents/register', {
      name: `Capacity ${slug}`,
      slug,
      provider: 'fake',
      version: '1',
      supportedProtocols: ['native_http'],
      requestedCapabilities: capabilities,
      approvedCapabilities: capabilities,
      maxConcurrency: 1,
    })
    expect(registration.statusCode, registration.body).toBe(200)
    const agentId = registration.json<{ id: string }>().id
    const teamGrant = await human(
      'PUT',
      `/api/v1/agents/${agentId}/team-access/${teamId}`,
      { approvedCapabilities: capabilities },
    )
    expect(teamGrant.statusCode, teamGrant.body).toBe(200)
    const paired = await pairConnection(slug, capabilities)
    const coordinationIdentity = await coordinator(
      paired.token,
      'GET',
      '/api/v1/agent-connections/current-identity',
    )
    expect(coordinationIdentity.statusCode, coordinationIdentity.body).toBe(200)
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM agent_sessions
        WHERE agent_id=$1 AND session_kind='coordination'
          AND state NOT IN ('completed','failed','canceled')`,
      [agentId],
    )).rows[0]?.count).toBe(1)

    const works = await Promise.all(['alpha', 'beta'].map(suffix => human(
      'POST',
      '/api/v1/work-items',
      {
        teamId,
        title: `Capacity race ${suffix} ${slug}`,
        statusId: readyId,
        priority: 'medium',
        labels: [],
        responsibleHumanActorId: actorId,
      },
    )))
    expect(works.every(work => work.statusCode === 200)).toBe(true)
    const workItems = works.map(work => work.json<{ id: string; revision: number }>())
    const cursorBefore = (await db.query<{ cursor: string }>(
      'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const starts = await Promise.all(workItems.map((workItem, index) => human(
      'POST',
      `/api/v1/work-items/${workItem.id}/agent-session`,
      {
        agentId,
        principalHumanActorId: actorId,
        role: 'executor',
        requestedCapabilities: capabilities,
        initialPrompt: `Capacity race ${index}`,
        budget: {},
      },
      workItem.revision,
    )))
    expect(starts.map(start => start.statusCode).sort()).toEqual([200, 409])
    const rejectedIndex = starts.findIndex(start => start.statusCode === 409)
    const rejected = starts[rejectedIndex]!
    expect(rejected.json<{
      error: {
        code: string
        details: {
          maxConcurrency: number
          activeExecutionSessionCount: number
          countedSessionKinds: string[]
          countedSessionStates: string[]
          activeExecutionSessionsByState: Record<string, number>
        }
      }
    }>().error).toMatchObject({
      code: 'AGENT_CONCURRENCY_LIMIT',
      details: {
        maxConcurrency: 1,
        activeExecutionSessionCount: 1,
        countedSessionKinds: ['execution'],
        countedSessionStates: [
          'queued',
          'acknowledged',
          'planning',
          'executing',
          'awaiting_input',
          'awaiting_approval',
          'blocked',
          'paused',
          'stopping',
          'stale',
        ],
        activeExecutionSessionsByState: { queued: 1 },
      },
    })
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM agent_sessions
        WHERE agent_id=$1 AND session_kind='execution'
          AND state NOT IN ('completed','failed','canceled')`,
      [agentId],
    )).rows[0]?.count).toBe(1)
    const rejectedWorkItemId = workItems[rejectedIndex]!.id
    expect((await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM delegations WHERE work_item_id=$1',
      [rejectedWorkItemId],
    )).rows[0]?.count).toBe(0)
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE event.cursor>$1::bigint AND event.payload->>'workItemId'=$2
          AND event.event_type LIKE 'agent.%'`,
      [cursorBefore, rejectedWorkItemId],
    )).rows[0]?.count).toBe(0)
    expect(paired.connection.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('recovers one stale self-claim assignment atomically and converges concurrent claims', async () => {
    const fixture = await prepareStaleSelfClaimFixture(`recover-${randomUUID().slice(0, 8)}`)
    const claimable = await coordinator(
      fixture.paired.token,
      'GET',
      '/api/v1/work-items?claimable=true&limit=200',
    )
    expect(claimable.statusCode, claimable.body).toBe(200)
    expect(claimable.json<{ items: Array<{ id: string }> }>().items.map(item => item.id))
      .toContain(fixture.workItem.id)

    const cursorBefore = (await db.query<{ cursor: string }>(
      'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const attempts = await Promise.all(Array.from({ length: 16 }, (_, index) => app.inject({
      method: 'POST',
      url: `/api/v1/work-items/${fixture.workItem.id}/claim`,
      payload: {},
      headers: {
        'x-workmesh-installation-token': fixture.paired.token,
        'idempotency-key': `stale-recovery-${fixture.workItem.id}-${index}`,
        'if-match': `"revision-${fixture.workItem.revision}"`,
      },
    })))
    expect(attempts.filter(attempt => attempt.statusCode === 200)).toHaveLength(1)
    expect(attempts.filter(attempt => attempt.statusCode === 409)).toHaveLength(15)
    expect(attempts.filter(attempt => ![200, 409].includes(attempt.statusCode))).toHaveLength(0)

    const successful = attempts.find(attempt => attempt.statusCode === 200)!
    const successfulBody = successful.json<{
      delegation: { id: string }
      session: { id: string }
    }>()
    expect(successfulBody.delegation.id).toBe(fixture.delegationId)
    expect(successfulBody.session.id).not.toBe(fixture.staleSessionId)

    const sessions = (await db.query<{
      delegation_id: string
      id: string
      state: string
      retry_of_session_id: string | null
    }>(
      `SELECT delegation_id,id,state,retry_of_session_id
         FROM agent_sessions
        WHERE delegation_id=$1 AND session_kind='execution'
          AND state NOT IN ('completed','failed','canceled')`,
      [fixture.delegationId],
    )).rows
    expect(sessions).toEqual([{
      delegation_id: fixture.delegationId,
      id: successfulBody.session.id,
      state: 'queued',
      retry_of_session_id: fixture.staleSessionId,
    }])
    expect((await db.query<{
      state: string
      state_reason: string
      ended_at: Date | null
    }>(
      'SELECT state,state_reason,ended_at FROM agent_sessions WHERE id=$1',
      [fixture.staleSessionId],
    )).rows[0]).toMatchObject({
      state: 'canceled',
      state_reason: 'replaced by stale self-claim recovery',
    })
    expect((await db.query<{ ended_at: Date | null }>(
      'SELECT ended_at FROM agent_sessions WHERE id=$1',
      [fixture.staleSessionId],
    )).rows[0]?.ended_at).not.toBeNull()
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM agent_session_tokens
        WHERE session_id=$1 AND revoked_at IS NULL`,
      [fixture.staleSessionId],
    )).rows[0]?.count).toBe(0)
    expect((await db.query<{ status: string; released_at: Date | null }>(
      'SELECT status,released_at FROM leases WHERE id=$1',
      [fixture.leaseId],
    )).rows[0]).toMatchObject({ status: 'released' })
    expect((await db.query<{ released_at: Date | null }>(
      'SELECT released_at FROM leases WHERE id=$1',
      [fixture.leaseId],
    )).rows[0]?.released_at).not.toBeNull()
    expect((await db.query<{ status: string; resolved_at: Date | null }>(
      'SELECT status,resolved_at FROM inbox_items WHERE id=$1',
      [fixture.inboxId],
    )).rows[0]).toMatchObject({ status: 'resolved' })
    expect((await db.query<{ resolved_at: Date | null }>(
      'SELECT resolved_at FROM inbox_items WHERE id=$1',
      [fixture.inboxId],
    )).rows[0]?.resolved_at).not.toBeNull()

    const recoveryEvents = (await db.query<{ event_type: string; outbox_id: string }>(
      `SELECT event.event_type,outbox.id AS outbox_id
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE event.cursor>$1::bigint
          AND event.event_type=ANY($2::text[])
        ORDER BY event.cursor`,
      [cursorBefore, ['agent.session.state_changed', 'lease.released', 'agent.session.created']],
    )).rows
    expect(recoveryEvents.map(event => event.event_type)).toEqual([
      'agent.session.state_changed',
      'lease.released',
      'agent.session.created',
    ])
    expect(recoveryEvents.every(event => Boolean(event.outbox_id))).toBe(true)
  })

  it('does not recover mixed stale and queued assignments or a stale assignment owned by another Agent', async () => {
    const mixed = await prepareStaleSelfClaimFixture(`mixed-${randomUUID().slice(0, 8)}`)
    await db.query(
      `INSERT INTO agent_sessions(
         workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state
       ) VALUES($1,$2,$3,$4,$5,$6,'queued')`,
      [mixed.workspaceId, teamId, mixed.agentId, mixed.agentActorId,
        mixed.delegationId, mixed.workItem.id],
    )
    const mixedBefore = (await db.query<{
      id: string
      state: string
      state_reason: string | null
      retry_of_session_id: string | null
    }>(
      `SELECT id,state,state_reason,retry_of_session_id
         FROM agent_sessions
        WHERE delegation_id=$1 AND session_kind='execution'
        ORDER BY id`,
      [mixed.delegationId],
    )).rows
    const mixedClaim = await coordinator(
      mixed.paired.token,
      'POST',
      `/api/v1/work-items/${mixed.workItem.id}/claim`,
      {},
      mixed.workItem.revision,
    )
    expect(mixedClaim.statusCode, mixedClaim.body).toBe(409)
    expect(mixedClaim.json<{ error: { code: string } }>().error.code)
      .toBe('WORK_ITEM_ALREADY_ASSIGNED')
    expect((await db.query<{
      id: string
      state: string
      state_reason: string | null
      retry_of_session_id: string | null
    }>(
      `SELECT id,state,state_reason,retry_of_session_id
         FROM agent_sessions
        WHERE delegation_id=$1 AND session_kind='execution'
        ORDER BY id`,
      [mixed.delegationId],
    )).rows).toEqual(mixedBefore)
    expect((await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM agent_session_tokens WHERE session_id=$1 AND revoked_at IS NULL',
      [mixed.staleSessionId],
    )).rows[0]?.count).toBeGreaterThan(0)
    expect((await db.query<{ status: string }>(
      'SELECT status FROM leases WHERE id=$1',
      [mixed.leaseId],
    )).rows[0]?.status).toBe('active')
    expect((await db.query<{ status: string }>(
      'SELECT status FROM inbox_items WHERE id=$1',
      [mixed.inboxId],
    )).rows[0]?.status).toBe('open')

    const foreign = await pairConnection(`foreign-stale-${randomUUID().slice(0, 8)}`)
    const foreignClaim = await coordinator(
      foreign.token,
      'POST',
      `/api/v1/work-items/${mixed.workItem.id}/claim`,
      {},
      mixed.workItem.revision,
    )
    expect(foreignClaim.statusCode, foreignClaim.body).toBe(409)
    expect(foreignClaim.json<{ error: { code: string } }>().error.code)
      .toBe('WORK_ITEM_ALREADY_ASSIGNED')
    const foreignClaimable = await coordinator(
      foreign.token,
      'GET',
      '/api/v1/work-items?claimable=true&limit=200',
    )
    expect(foreignClaimable.statusCode, foreignClaimable.body).toBe(200)
    expect(foreignClaimable.json<{ items: Array<{ id: string }> }>().items.map(item => item.id))
      .not.toContain(mixed.workItem.id)
  })

  it('rolls back stale recovery mutations when replacement Session admission fails', async () => {
    const fixture = await prepareStaleSelfClaimFixture(`rollback-${randomUUID().slice(0, 8)}`)
    const cursorBefore = (await db.query<{ cursor: string }>(
      'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    await db.query('DROP TRIGGER IF EXISTS stage5_fail_stale_recovery ON agent_sessions')
    await db.query('DROP FUNCTION IF EXISTS stage5_fail_stale_recovery()')
    await db.query(`CREATE FUNCTION stage5_fail_stale_recovery() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.work_item_id='${fixture.workItem.id}'::uuid
           AND NEW.session_kind='execution' AND NEW.state='queued' THEN
          RAISE EXCEPTION 'stale recovery rollback fixture';
        END IF;
        RETURN NEW;
      END
      $$`)
    await db.query(`CREATE TRIGGER stage5_fail_stale_recovery
      BEFORE INSERT ON agent_sessions FOR EACH ROW EXECUTE FUNCTION stage5_fail_stale_recovery()`)
    try {
      const failed = await coordinator(
        fixture.paired.token,
        'POST',
        `/api/v1/work-items/${fixture.workItem.id}/claim`,
        {},
        fixture.workItem.revision,
      )
      expect(failed.statusCode, failed.body).toBe(500)
    } finally {
      await db.query('DROP TRIGGER IF EXISTS stage5_fail_stale_recovery ON agent_sessions')
      await db.query('DROP FUNCTION IF EXISTS stage5_fail_stale_recovery()')
    }
    expect((await db.query<{
      state: string
      state_reason: string | null
      ended_at: Date | null
    }>(
      'SELECT state,state_reason,ended_at FROM agent_sessions WHERE id=$1',
      [fixture.staleSessionId],
    )).rows[0]).toMatchObject({
      state: 'stale',
      state_reason: 'heartbeat timeout fixture',
      ended_at: null,
    })
    expect((await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM agent_session_tokens WHERE session_id=$1 AND revoked_at IS NULL',
      [fixture.staleSessionId],
    )).rows[0]?.count).toBeGreaterThan(0)
    expect((await db.query<{ status: string; released_at: Date | null }>(
      'SELECT status,released_at FROM leases WHERE id=$1',
      [fixture.leaseId],
    )).rows[0]).toMatchObject({ status: 'active', released_at: null })
    expect((await db.query<{ status: string; resolved_at: Date | null }>(
      'SELECT status,resolved_at FROM inbox_items WHERE id=$1',
      [fixture.inboxId],
    )).rows[0]).toMatchObject({ status: 'open', resolved_at: null })
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM agent_sessions
        WHERE delegation_id=$1 AND session_kind='execution'`,
      [fixture.delegationId],
    )).rows[0]?.count).toBe(1)
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE event.cursor>$1::bigint
          AND event.event_type IN ('agent.session.state_changed','lease.released','agent.session.created')`,
      [cursorBefore],
    )).rows[0]?.count).toBe(0)
  })

  it('requires an exact self-claim capability scope and rejects broad assignment scopes', async () => {
    const fixture = await prepareStaleSelfClaimFixture(`broad-scope-${randomUUID().slice(0, 8)}`)
    await db.query(
      'UPDATE delegations SET capability_scope=$2::jsonb WHERE id=$1',
      [fixture.delegationId, JSON.stringify({
        workspaceId: fixture.workspaceId,
        teamIds: [teamId, randomUUID()],
        projectIds: [randomUUID()],
        workItemIds: [fixture.workItem.id, randomUUID()],
        repositoryIds: [randomUUID()],
        capabilities: ['work:read', 'work:write'],
      })],
    )
    await expectExactScopeClaimRejected(fixture)
  })

  it('rejects a stale self-claim when the assignment capability scope targets another Project', async () => {
    const project = await human('POST', '/api/v1/projects', {
      teamId,
      name: `Stale recovery project ${randomUUID().slice(0, 8)}`,
    })
    expect(project.statusCode, project.body).toBe(200)
    const projectId = project.json<{ id: string }>().id
    const otherProject = await human('POST', '/api/v1/projects', {
      teamId,
      name: `Stale recovery mismatch ${randomUUID().slice(0, 8)}`,
    })
    expect(otherProject.statusCode, otherProject.body).toBe(200)
    const otherProjectId = otherProject.json<{ id: string }>().id
    const fixture = await prepareStaleSelfClaimFixture(
      `project-scope-${randomUUID().slice(0, 8)}`,
      projectId,
    )
    const scope = (await db.query<{ capability_scope: Record<string, unknown> }>(
      'SELECT capability_scope FROM delegations WHERE id=$1',
      [fixture.delegationId],
    )).rows[0]!.capability_scope
    await db.query(
      'UPDATE delegations SET capability_scope=jsonb_set(capability_scope,\'{projectIds}\',$2::jsonb) WHERE id=$1',
      [fixture.delegationId, JSON.stringify([otherProjectId])],
    )
    expect(scope.projectIds).toEqual([projectId])
    await expectExactScopeClaimRejected(fixture)
  })

  it('keeps generic stale state transitions inactive while dedicated ACK recovers and resolves the stale inbox', async () => {
    const fixture = await prepareStaleSelfClaimFixture(`ack-${randomUUID().slice(0, 8)}`)
    const stale = (await db.query<{ revision: number }>(
      'SELECT revision FROM agent_sessions WHERE id=$1 AND state=\'stale\'',
      [fixture.staleSessionId],
    )).rows[0]!
    const bearer = await seedAgentSessionBearer(db, fixture.staleSessionId, fixture.agentId)
    const genericTransition = await app.inject({
      method: 'POST',
      url: `/api/v1/agent-sessions/${fixture.staleSessionId}/state`,
      payload: { state: 'acknowledged', reason: 'generic stale recovery attempt' },
      headers: {
        authorization: `Bearer ${bearer}`,
        'idempotency-key': randomUUID(),
        'if-match': `"revision-${stale.revision}"`,
      },
    })
    expect(genericTransition.statusCode, genericTransition.body).toBe(409)
    expect(genericTransition.json<{ error: { code: string } }>().error.code)
      .toBe('SESSION_NOT_ACTIVE')
    expect((await db.query<{ state: string; revision: number }>(
      'SELECT state,revision FROM agent_sessions WHERE id=$1',
      [fixture.staleSessionId],
    )).rows[0]).toEqual({ state: 'stale', revision: stale.revision })
    expect((await db.query<{ status: string }>(
      'SELECT status FROM inbox_items WHERE id=$1',
      [fixture.inboxId],
    )).rows[0]?.status).toBe('open')

    const acknowledged = await app.inject({
      method: 'POST',
      url: `/api/v1/agent-sessions/${fixture.staleSessionId}/ack`,
      payload: { summary: 'Dedicated stale acknowledgement recovery', externalUrls: [] },
      headers: {
        authorization: `Bearer ${bearer}`,
        'idempotency-key': randomUUID(),
      },
    })
    expect(acknowledged.statusCode, acknowledged.body).toBe(200)
    expect(acknowledged.json<{ id: string; state: string }>().state).toBe('acknowledged')
    expect((await db.query<{ state: string; state_reason: string }>(
      'SELECT state,state_reason FROM agent_sessions WHERE id=$1',
      [fixture.staleSessionId],
    )).rows[0]).toEqual({
      state: 'acknowledged',
      state_reason: 'Dedicated stale acknowledgement recovery',
    })
    expect((await db.query<{ status: string; resolved_at: Date | null; resolved_by_actor_id: string | null }>(
      'SELECT status,resolved_at,resolved_by_actor_id FROM inbox_items WHERE id=$1',
      [fixture.inboxId],
    )).rows[0]).toMatchObject({
      status: 'resolved',
      resolved_by_actor_id: fixture.agentActorId,
    })
    expect((await db.query<{ resolved_at: Date | null }>(
      'SELECT resolved_at FROM inbox_items WHERE id=$1',
      [fixture.inboxId],
    )).rows[0]?.resolved_at).not.toBeNull()
  })

  it('replays the same stale self-claim idempotency key with the same replacement Session and exchange token', async () => {
    const fixture = await prepareStaleSelfClaimFixture(`replay-${randomUUID().slice(0, 8)}`)
    const idempotencyKey = `stale-recovery-replay-${fixture.workItem.id}`
    const claim = () => app.inject({
      method: 'POST',
      url: `/api/v1/work-items/${fixture.workItem.id}/claim`,
      payload: {},
      headers: {
        'x-workmesh-installation-token': fixture.paired.token,
        'idempotency-key': idempotencyKey,
        'if-match': `"revision-${fixture.workItem.revision}"`,
      },
    })
    const first = await claim()
    const replay = await claim()
    expect(first.statusCode, first.body).toBe(200)
    expect(replay.statusCode, replay.body).toBe(200)
    expect(replay.body).toBe(first.body)
    const firstBody = first.json<{
      delegation: { id: string }
      session: { id: string }
      exchangeToken: string
    }>()
    const replayBody = replay.json<typeof firstBody>()
    expect(firstBody.delegation.id).toBe(fixture.delegationId)
    expect(firstBody.session.id).not.toBe(fixture.staleSessionId)
    expect(firstBody.exchangeToken).toEqual(expect.any(String))
    expect(replayBody).toEqual(firstBody)
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM agent_sessions
        WHERE delegation_id=$1 AND session_kind='execution'
          AND state NOT IN ('completed','failed','canceled')`,
      [fixture.delegationId],
    )).rows[0]?.count).toBe(1)
  })

  it('resolves stale inbox and releases its lease when Human forced assignment replaces the same Agent', async () => {
    const fixture = await prepareStaleSelfClaimFixture(`forced-stale-${randomUUID().slice(0, 8)}`)
    const cursorBefore = (await db.query<{ cursor: string }>(
      'SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const forced = await human(
      'POST',
      `/api/v1/work-items/${fixture.workItem.id}/agent-session`,
      {
        agentId: fixture.agentId,
        principalHumanActorId: actorId,
        role: 'executor',
        requestedCapabilities: ['work:read', 'work:write'],
        initialPrompt: 'Human forced replacement of stale self-claim.',
        budget: {},
      },
      fixture.workItem.revision,
    )
    expect(forced.statusCode, forced.body).toBe(200)
    expect((await db.query<{ state: string; state_reason: string; ended_at: Date | null }>(
      'SELECT state,state_reason,ended_at FROM agent_sessions WHERE id=$1',
      [fixture.staleSessionId],
    )).rows[0]).toMatchObject({
      state: 'canceled',
      state_reason: 'replaced by Human forced assignment',
    })
    expect((await db.query<{ ended_at: Date | null }>(
      'SELECT ended_at FROM agent_sessions WHERE id=$1',
      [fixture.staleSessionId],
    )).rows[0]?.ended_at).not.toBeNull()
    expect((await db.query<{ status: string; released_at: Date | null }>(
      'SELECT status,released_at FROM leases WHERE id=$1',
      [fixture.leaseId],
    )).rows[0]).toMatchObject({ status: 'released' })
    expect((await db.query<{ released_at: Date | null }>(
      'SELECT released_at FROM leases WHERE id=$1',
      [fixture.leaseId],
    )).rows[0]?.released_at).not.toBeNull()
    expect((await db.query<{ status: string; resolved_at: Date | null }>(
      'SELECT status,resolved_at FROM inbox_items WHERE id=$1',
      [fixture.inboxId],
    )).rows[0]).toMatchObject({ status: 'resolved' })
    expect((await db.query<{ resolved_at: Date | null }>(
      'SELECT resolved_at FROM inbox_items WHERE id=$1',
      [fixture.inboxId],
    )).rows[0]?.resolved_at).not.toBeNull()
    const leaseEvents = (await db.query<{ event_type: string; outbox_id: string }>(
      `SELECT event.event_type,outbox.id AS outbox_id
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE event.cursor>$1::bigint AND event.event_type='lease.released'
          AND event.aggregate_id=$2
        ORDER BY event.cursor`,
      [cursorBefore, fixture.leaseId],
    )).rows
    expect(leaseEvents).toHaveLength(1)
    expect(leaseEvents[0]?.outbox_id).toEqual(expect.any(String))
  })

  it('lists Connections for Workspace Admins with cursor pagination and no credential material', async () => {
    for (const name of ['Discovery alpha', 'Discovery beta']) {
      const suffix = randomUUID().replaceAll('-', '').slice(0, 8)
      const created = await human('POST', '/api/v1/agent-connections', {
        name,
        agentSlug: `discovery-${suffix}`,
        clientType: 'codex',
        teamId,
        principalHumanActorId: actorId,
        requestedCapabilities: ['work:read'],
        grantAgentDelegate: false,
      })
      expect(created.statusCode, created.body).toBe(201)
    }

    const first = await human('GET', '/api/v1/agent-connections?limit=1')
    expect(first.statusCode, first.body).toBe(200)
    const firstPage = first.json<{ items: Array<Record<string, unknown>>; nextCursor: string | null }>()
    expect(firstPage.items).toHaveLength(1)
    expect(firstPage.nextCursor).toEqual(expect.any(String))
    expect(firstPage.items[0]).toMatchObject({ redacted_token: true })
    expect(firstPage.items[0]).not.toHaveProperty('installation_token')
    expect(firstPage.items[0]).not.toHaveProperty('pairing_code')

    const second = await human('GET', `/api/v1/agent-connections?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`)
    expect(second.statusCode, second.body).toBe(200)
    const secondPage = second.json<{ items: Array<{ id: string }> }>()
    expect(secondPage.items).toHaveLength(1)
    expect(secondPage.items[0]!.id).not.toBe(firstPage.items[0]!.id)

    const memberId = randomUUID()
    const memberToken = opaqueToken()
    const memberCsrf = opaqueToken()
    await db.query(
      `INSERT INTO actors(id,workspace_id,kind,workspace_role,email,display_name,password_hash)
       SELECT $1,workspace_id,'human','member',$2,'Connection viewer','unused' FROM actors WHERE id=$3`,
      [memberId, `${memberId}@example.test`, actorId],
    )
    await db.query(
      `INSERT INTO memberships(workspace_id,team_id,actor_id,role)
       SELECT workspace_id,$1,$2,'member' FROM actors WHERE id=$3`,
      [teamId, memberId, actorId],
    )
    await db.query(
      "INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [memberId, tokenHash(memberToken), memberCsrf],
    )
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/agent-connections',
      headers: { cookie: `workmesh_session=${memberToken}` },
    })
    expect(forbidden.statusCode, forbidden.body).toBe(403)
  })
})
