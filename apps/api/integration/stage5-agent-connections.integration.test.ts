import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, tokenHash } from '@workmesh/db'
import { loadFeatureConfig } from '@workmesh/config'
import { buildApp } from '../src/server.js'
import { createAgentConnectionLifecycleWorker } from '../../worker/src/agent-connections.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 5 integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 5 integration requires a dedicated *test* database.')
const db = createDb(databaseUrl)
const app = buildApp({ features: loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'true' }) })
let cookie = '', csrf = '', actorId = '', teamId = '', readyId = ''
type Reply = { statusCode: number; headers: Record<string, string|string[]|number|undefined>; json: <T>() => T; body: string }
const human = async (method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE', url: string, payload?: object, revision?: number): Promise<Reply> => app.inject({ method, url, payload, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...(revision ? { 'if-match': `"revision-${revision}"` } : {}) } }) as unknown as Reply
const coordinator = async (token: string, method: 'GET'|'POST'|'PATCH', url: string, payload?: object, revision?: number): Promise<Reply> => app.inject({ method, url, payload, headers: { 'x-workmesh-installation-token': token, 'idempotency-key': randomUUID(), ...(revision ? { 'if-match': `"revision-${revision}"` } : {}) } }) as unknown as Reply

beforeAll(async () => {
  await applyMigrations(db); await db.query('TRUNCATE auth_idempotency_records,workspaces CASCADE')
  const install = await app.inject({ method: 'POST', url: '/api/v1/auth/install', payload: { name: 'Coordination acceptance', slug: 'coordination-acceptance', adminName: 'Alice', email: 'alice-stage5@example.test', password: 'password-acceptance' }, headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! } })
  expect(install.statusCode, install.body).toBe(200)
  const setCookie = install.headers['set-cookie']; cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? ''; csrf = install.json<{ csrfToken: string }>().csrfToken
  const me = await human('GET', '/api/v1/auth/me'); actorId = me.json<{ actor: { id: string } }>().actor.id
  teamId = (await human('GET', '/api/v1/teams')).json<{ items: { id: string }[] }>().items[0]!.id
  const states = (await human('GET', `/api/v1/teams/${teamId}/states`)).json<{ items: { id: string; name: string }[] }>().items
  readyId = states.find(state => state.name === 'Ready')!.id
})
afterAll(async () => { await app.close(); await db.end() })

describe('Stage 5 Agent Connection lifecycle', () => {
  it('pairs once, replays safely, coordinates ordinary work, and revokes live authorization', async () => {
    const created = await human('POST', '/api/v1/agent-connections', { name: 'Codex coordinator', agentSlug: 'codex-coordinator', clientType: 'codex', teamId, principalHumanActorId: actorId, requestedCapabilities: ['work:read','work:write','comment:write','message:write','plan:write'], grantAgentDelegate: false })
    expect(created.statusCode, created.body).toBe(201)
    const envelope = created.json<{ connection: { id: string; revision: number }; connect_url: string; skill: { sha256: string; signature: string } }>()
    expect(envelope.connect_url).toMatch(/\/connect#[^/?#]+$/); expect(envelope.skill.sha256).toMatch(/^sha256:[a-f0-9]{64}$/); expect(envelope.skill.signature).toMatch(/^ed25519:/)
    const pairingCode = new URL(envelope.connect_url).hash.slice(1); const replayKey = randomUUID()
    const mismatch = await app.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem', payload: { pairingCode, agentSlug: 'wrong-agent', client: { type: 'codex', version: '1.0.0' } }, headers: { 'idempotency-key': randomUUID() } })
    expect(mismatch.statusCode, mismatch.body).toBe(400)
    expect((await db.query<{ attempts: number }>('SELECT attempts FROM agent_connection_pairings WHERE code_hash=$1', [tokenHash(pairingCode)])).rows[0]?.attempts).toBe(1)
    const redeem = () => app.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem', payload: { pairingCode, agentSlug: 'codex-coordinator', client: { type: 'codex', version: '1.0.0' } }, headers: { 'idempotency-key': replayKey } })
    const first = await redeem(); const replay = await redeem()
    expect(first.statusCode, first.body).toBe(200); expect(replay.statusCode, replay.body).toBe(200); expect(replay.body).toBe(first.body)
    const token = first.json<{ installation_token: string }>().installation_token
    const project = await coordinator(token, 'POST', '/api/v1/projects', { teamId, name: 'Agent-first delivery', summary: 'Created through Coordination MCP authority', status: 'planned' })
    expect(project.statusCode, project.body).toBe(200)
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
    const projectBody = project.json<{ id: string; revision: number }>()
    const issue = await coordinator(token, 'POST', '/api/v1/work-items', { teamId, projectId: projectBody.id, title: 'Prove coordination lifecycle', description: 'Created by the coordinator.', statusId: readyId, priority: 'medium', labels: [] })
    expect(issue.statusCode, issue.body).toBe(200)
    const issueBody = issue.json<{ id: string; revision: number }>(); const issueId = issueBody.id
    expect((await db.query<{ responsible_human_actor_id: string }>('SELECT responsible_human_actor_id FROM work_items WHERE id=$1', [issueId])).rows[0]?.responsible_human_actor_id).toBe(actorId)
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
})
