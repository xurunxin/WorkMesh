import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, opaqueToken, tokenHash } from '@workmesh/db'
import { loadFeatureConfig } from '@workmesh/config'
import { buildApp } from '../src/server.js'
import { createAgentConnectionLifecycleWorker } from '../../worker/src/agent-connections.js'
import { createWorkMeshMcpHttpServer } from '../../mcp/src/http.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 5 integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 5 integration requires a dedicated *test* database.')
const db = createDb(databaseUrl)
const features = loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'true' })
let app = buildApp({ features })
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
    expect(pairingAsCredential.json<{ error: { message: string } }>().error.message).toContain('cannot authenticate')
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
    app = buildApp({ features })
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
    const revoked = await human('DELETE', `/api/v1/agent-connections/${envelope.connection.id}`, undefined, confirmed.json<{ revision: number }>().revision); expect(revoked.statusCode, revoked.body).toBe(204)
    const denied = await coordinator(nextToken, 'GET', '/api/v1/projects'); expect(denied.statusCode).toBe(401)
  })

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
    app = buildApp({ features })
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
    const target = await human('POST', '/api/v1/agents/register', { slug: `target-${suffix}`, name: 'Target executor', provider: 'fake', version: '1.0.0', supportedProtocols: ['native_http'], requestedCapabilities: ['work:read'], approvedCapabilities: ['work:read'], outputArtifactTypes: [], maxConcurrency: 1 })
    expect(target.statusCode, target.body).toBe(200)
    const targetId = target.json<{ id: string }>().id
    expect((await human('PUT', `/api/v1/agents/${targetId}/team-access/${teamId}`, { approvedCapabilities: ['work:read'] })).statusCode).toBe(200)
    const created = await human('POST', '/api/v1/agent-connections', { name: 'Delegating coordinator', agentSlug: `delegate-${suffix}`, clientType: 'generic_mcp', teamId, principalHumanActorId: actorId, requestedCapabilities: ['work:read','work:write','agent:delegate'], grantAgentDelegate: true })
    expect(created.statusCode, created.body).toBe(201)
    const envelope = created.json<{ connect_url: string }>()
    const redeemed = await app.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem', payload: { pairingCode: new URL(envelope.connect_url).hash.slice(1), agentSlug: `delegate-${suffix}`, client: { type: 'generic_mcp', version: '1.0.0' } }, headers: { 'idempotency-key': randomUUID() } })
    expect(redeemed.statusCode, redeemed.body).toBe(200)
    const token = redeemed.json<{ installation_token: string }>().installation_token
    const work = await coordinator(token, 'POST', '/api/v1/work-items', { teamId, title: 'Delegated by coordinator', statusId: readyId, priority: 'medium', labels: [] })
    expect(work.statusCode, work.body).toBe(200)
    const item = work.json<{ id: string; revision: number }>()
    const started = await coordinator(token, 'POST', `/api/v1/work-items/${item.id}/agent-session`, { agentId: targetId, principalHumanActorId: actorId, role: 'executor', requestedCapabilities: ['work:read'], initialPrompt: 'Execute this issue.', budget: {} }, item.revision)
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
    const durableExpiry = await db.query<{ event_type: string; outbox_id: string }>(
      `SELECT event.event_type,outbox.id AS outbox_id
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE event.aggregate_type='agent_session' AND event.aggregate_id=$1
          AND event.event_type='agent.session.state_changed'`,
      [principalState.session_id],
    )
    expect(durableExpiry.rows).toHaveLength(1)
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
