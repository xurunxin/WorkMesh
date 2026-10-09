import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, opaqueToken, tokenHash } from '@workmesh/db'
import { buildApp } from '../src/server.js'
import { seedAgentSessionBearer } from './agent-session-test-credentials.js'

const url = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !url || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(url).pathname.slice(1)))
  throw new Error('Execution result integration requires a dedicated test database')
const db = createDb(url)
const app = buildApp({ logger: { level: 'silent' } })
let cookie = '', csrf = '', humanId = '', teamId = '', readyId = '', agentId = '', installation = ''
const human = (method: 'GET' | 'POST' | 'PUT', path: string, body?: object, revision?: number) => app.inject({
  method, url: path, payload: body, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(),
    ...(revision ? { 'if-match': `"revision-${revision}"` } : {}) },
})
const agent = (token: string, method: 'GET' | 'POST' | 'PUT', path: string, body?: object, revision?: number, key = randomUUID()) => app.inject({
  method, url: path, payload: body, headers: { authorization: `Bearer ${token}`, 'idempotency-key': key,
    ...(revision ? { 'if-match': `"revision-${revision}"` } : {}) },
})
async function start() {
  const work = await human('POST', '/api/v1/work-items', { teamId, title: 'Exact result', statusId: readyId, responsibleHumanActorId: humanId })
  expect(work.statusCode).toBe(200)
  const item = work.json<{ id: string; revision: number }>()
  const started = await human('POST', `/api/v1/work-items/${item.id}/agent-session`, { agentId, principalHumanActorId: humanId, role: 'executor', requestedCapabilities: ['work:read','work:write','plan:write'], initialPrompt: 'Result test', budget: {} }, item.revision)
  expect(started.statusCode).toBe(200)
  const { session } = started.json<{ session: { id: string; revision: number } }>()
  const token = await seedAgentSessionBearer(db, session.id, agentId)
  const ack = await agent(token, 'POST', `/api/v1/agent-sessions/${session.id}/ack`, { summary: 'Accepted', externalUrls: [] })
  expect(ack.statusCode).toBe(200)
  const executed = await agent(token, 'POST', `/api/v1/agent-sessions/${session.id}/state`, { state: 'executing', reason: 'Execute' }, ack.json<{ revision: number }>().revision)
  expect(executed.statusCode).toBe(200)
  return { sessionId: session.id, workItemId: item.id, token, revision: executed.json<{ revision: number }>().revision }
}
const confirmation = (sessionId: string, key: string, action = 'complete') => `/api/v1/agent-sessions/${sessionId}/execution-result?action=${action}&operationKey=${encodeURIComponent(key)}`
const businessTables = ['agent_installation_tokens', 'agent_connection_credentials', 'agent_coordination_sessions', 'agent_session_tokens',
  'agent_sessions', 'delegations', 'agent_plan_versions', 'approvals', 'leases', 'agent_activities', 'api_idempotency_keys', 'auth_idempotency_records',
  'domain_events', 'outbox_events', 'workbench_turns', 'workbench_runner_attempts', 'workbench_execution_waits'] as const
async function fingerprint() {
  const result: Record<string, string> = {}
  for (const table of businessTables) result[table] = (await db.query<{ digest: string }>(
    `SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,',' ORDER BY to_jsonb(t)::text),'')) AS digest FROM ${table} t`,
  )).rows[0]!.digest
  return result
}
const completion = { summary: 'Complete', artifactIds: [], checks: [], limitations: [], noArtifactReason: 'Integration has no artifact' }

describe('exact execution confirmation', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
    const install = await app.inject({ method: 'POST', url: '/api/v1/auth/install',
      payload: { name: 'Exact Result', slug: 'exact-result', adminName: 'Admin', email: 'result@example.test', password: 'execution-result-password' },
      headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! } })
    expect(install.statusCode).toBe(200)
    cookie = String(install.headers['set-cookie']).split(';')[0]!
    csrf = install.json<{ csrfToken: string }>().csrfToken
    humanId = (await human('GET', '/api/v1/auth/me')).json<{ actor: { id: string } }>().actor.id
    teamId = (await human('GET', '/api/v1/teams')).json<{ items: { id: string }[] }>().items[0]!.id
    readyId = (await human('GET', `/api/v1/teams/${teamId}/states`)).json<{ items: { id: string; name: string }[] }>().items.find(x => x.name === 'Ready')!.id
    const registered = await human('POST', '/api/v1/agents/register', { name: 'Result Agent', slug: 'result-agent', provider: 'fake', version: '1',
      supportedProtocols: ['native_http'], requestedCapabilities: ['work:read', 'work:write', 'plan:write'], approvedCapabilities: ['work:read', 'work:write', 'plan:write'], maxConcurrency: 16 })
    expect(registered.statusCode).toBe(200)
    const definition = registered.json<{ id: string; installation_token: string }>()
    agentId = definition.id; installation = definition.installation_token
    expect((await human('PUT', `/api/v1/agents/${agentId}/team-access/${teamId}`, { approvedCapabilities: ['work:read', 'work:write', 'plan:write'] })).statusCode).toBe(200)
  })
  afterAll(async () => { await app.close(); await db.end() })

  it('confirms a committed direct completion after lost response; terminal E and wrong origin stay closed, without business writes', async () => {
    const execution = await start(), key = randomUUID()
    expect((await agent(execution.token, 'POST', `/api/v1/agent-sessions/${execution.sessionId}/complete`, completion, execution.revision, key)).statusCode).toBe(200)
    const before = await fingerprint()
    const result = await agent(installation, 'GET', confirmation(execution.sessionId, key))
    expect(result.statusCode, result.body).toBe(200)
    expect(result.json()).toMatchObject({ action: { confirmation: 'confirmed' }, originalResult: { sessionId: execution.sessionId, state: 'completed' } })
    expect((await agent(execution.token, 'GET', confirmation(execution.sessionId, key))).statusCode).toBe(401)
    expect((await agent(execution.token, 'GET', `/api/v1/agent-sessions/${execution.sessionId}`)).statusCode).toBe(409)
    expect((await agent(execution.token, 'POST', `/api/v1/agent-sessions/${execution.sessionId}/complete`, completion, execution.revision, key)).statusCode).toBe(409)
    expect((await agent(installation, 'GET', confirmation(execution.sessionId, key, 'stop_ack'))).statusCode).toBe(404)
    expect((await agent(installation, 'GET', confirmation(randomUUID(), key))).statusCode).toBe(404)
    expect(await fingerprint()).toEqual(before)
    const second = opaqueToken()
    await db.query("INSERT INTO agent_installation_tokens(agent_id,token_hash,origin_kind) VALUES($1,$2,'native')", [agentId, tokenHash(second)])
    const proof = await fingerprint()
    expect((await agent(second, 'GET', confirmation(execution.sessionId, key))).statusCode).toBe(404)
    expect(await fingerprint()).toEqual(proof)
  })

  it('confirms only the exact Stop cleanup, and rechecks live authority after token retention changes', async () => {
    const execution = await start(), key = randomUUID()
    // The latest native credential belongs to a different installation. Restore the original fixture binding explicitly.
    await db.query(`UPDATE agent_session_tokens SET installation_token_id=(SELECT id FROM agent_installation_tokens WHERE token_hash=$2)
      WHERE token_hash=$1`, [tokenHash(execution.token), tokenHash(installation)])
    const stopping = await human('POST', `/api/v1/agent-sessions/${execution.sessionId}/signals`, { signal: 'stop', reason: 'Stop test' }, execution.revision)
    expect(stopping.statusCode).toBe(200)
    expect((await agent(execution.token, 'POST', `/api/v1/agent-sessions/${execution.sessionId}/stop-ack`,
      { cleanupSummary: 'Owned resources cleared', residualRisks: ['External process unavailable'] }, stopping.json<{ revision: number }>().revision, key)).statusCode).toBe(200)
    await db.query('DELETE FROM agent_session_tokens WHERE token_hash=$1', [tokenHash(execution.token)])
    const before = await fingerprint()
    const result = await agent(installation, 'GET', confirmation(execution.sessionId, key, 'stop_ack'))
    expect(result.statusCode, result.body).toBe(200)
    expect(result.json()).toMatchObject({ action: { confirmation: 'confirmed' }, cleanup: { cleanupSummary: 'Owned resources cleared', residualRisks: ['External process unavailable'] } })
    expect(await fingerprint()).toEqual(before)
    await db.query('UPDATE api_idempotency_keys SET replay_expires_at=created_at+interval \'1 microsecond\' WHERE idempotency_key=$1', [key])
    expect((await agent(installation, 'GET', confirmation(execution.sessionId, key, 'stop_ack'))).json()).toMatchObject({ action: { confirmation: 'unavailable', unavailableReason: 'receipt_expired' } })
    await db.query(`UPDATE api_idempotency_keys SET execution_source_kind=NULL,execution_session_id=NULL,execution_session_token_id=NULL,
      execution_installation_token_id=NULL,execution_connection_id=NULL WHERE idempotency_key=$1`, [key])
    expect((await agent(installation, 'GET', confirmation(execution.sessionId, key, 'stop_ack'))).statusCode).toBe(404)
    expect((await human('GET', confirmation(execution.sessionId, key, 'stop_ack'))).statusCode).toBe(200)
  })

  it('rolls back state and all execution facts when provenance persistence fails', async () => {
    const execution = await start(), key = randomUUID(), before = await fingerprint()
    await db.query(`CREATE FUNCTION m1_reject_origin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'M1_ORIGIN_WRITE_FAILURE'; END $$;
      CREATE TRIGGER m1_origin_failure BEFORE UPDATE OF execution_source_kind ON api_idempotency_keys
      FOR EACH ROW EXECUTE FUNCTION m1_reject_origin()`)
    try {
      expect((await agent(execution.token, 'POST', `/api/v1/agent-sessions/${execution.sessionId}/complete`, completion, execution.revision, key)).statusCode).toBe(500)
      expect(await fingerprint()).toEqual(before)
    } finally { await db.query('DROP TRIGGER m1_origin_failure ON api_idempotency_keys; DROP FUNCTION m1_reject_origin()') }
  })

  it.each(['plan', 'lease', 'approval', 'complete', 'stop_ack'] as const)(
    'rolls back %s state, receipt, event and outbox on each durable boundary failure', async operation => {
      const execution = await start()
      let revision = execution.revision
      if (operation === 'stop_ack') {
        const stopped = await human('POST', `/api/v1/agent-sessions/${execution.sessionId}/signals`,
          { signal: 'stop', reason: 'Atomic Stop acknowledgement' }, revision)
        expect(stopped.statusCode, stopped.body).toBe(200)
        revision = stopped.json<{ revision: number }>().revision
      }
      const payload = { action: 'Atomic approval request' }
      const method = operation === 'plan' ? 'PUT' : 'POST'
      const path = operation === 'plan' ? `/api/v1/agent-sessions/${execution.sessionId}/plan`
        : operation === 'lease' ? '/api/v1/leases' : operation === 'approval' ? '/api/v1/approvals'
        : `/api/v1/agent-sessions/${execution.sessionId}/${operation === 'stop_ack' ? 'stop-ack' : 'complete'}`
      const body = operation === 'plan' ? { changeSummary: 'Atomic plan', steps: [{ id: randomUUID(), title: 'Atomic step',
        status: 'pending', ordinal: 0, dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [] }] }
        : operation === 'lease' ? { sessionId: execution.sessionId, resourceType: 'work_item',
          resourceId: execution.workItemId, ttlSeconds: 300, reason: 'Atomic lease' }
        : operation === 'approval' ? { sessionId: execution.sessionId, approvalType: 'manual_gate', actionName: 'atomic',
          actionPayloadSanitized: payload, actionPayloadHash: `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
          riskLevel: 'low', rationaleSummary: 'Atomic approval', expiresAt: new Date(Date.now()+600_000).toISOString() }
        : operation === 'stop_ack' ? { cleanupSummary: 'Owned resources cleared', residualRisks: [] } : completion
      for (const table of ['domain_events', 'outbox_events'] as const) {
        const before = await fingerprint(), name = `m1_atomic_${randomUUID().replaceAll('-', '')}`
        await db.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          RAISE EXCEPTION 'M1_ATOMIC_BOUNDARY_FAILURE'; END $$`)
        await db.query(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`)
        try {
          const failed = await agent(execution.token, method, path, body, revision)
          expect(failed.statusCode, failed.body).toBe(500)
          expect(await fingerprint()).toEqual(before)
        } finally {
          await db.query(`DROP TRIGGER ${name} ON ${table}; DROP FUNCTION ${name}()`)
        }
      }
      // A successful control proves the injected errors reached an otherwise valid command.
      const accepted = await agent(execution.token, method, path, body, revision)
      expect(accepted.statusCode, accepted.body).toBe(200)
    }, 120_000,
  )

  it('rechecks principal, grant, exact scope and installation on every confirmation, with concurrent reads producing zero facts', async () => {
    const execution = await start(), key = randomUUID()
    await db.query(`UPDATE agent_session_tokens SET installation_token_id=(SELECT id FROM agent_installation_tokens WHERE token_hash=$2)
      WHERE token_hash=$1`, [tokenHash(execution.token), tokenHash(installation)])
    expect((await agent(execution.token, 'POST', `/api/v1/agent-sessions/${execution.sessionId}/complete`, completion, execution.revision, key)).statusCode).toBe(200)
    const path = confirmation(execution.sessionId, key), before = await fingerprint()
    const reads = await Promise.all(Array.from({ length: 4 }, () => agent(installation, 'GET', path)))
    expect(reads.map(x => x.statusCode)).toEqual([200, 200, 200, 200])
    expect(await fingerprint()).toEqual(before)
    const delegation = (await db.query<{ id: string; capability_scope: unknown }>(`SELECT d.id,d.capability_scope FROM delegations d
      JOIN agent_sessions s ON s.delegation_id=d.id WHERE s.id=$1`, [execution.sessionId])).rows[0]!
    const rejectWithoutWrites = async (expected: number) => {
      const baseline = await fingerprint()
      expect((await agent(installation, 'GET', path)).statusCode).toBe(expected)
      expect(await fingerprint()).toEqual(baseline)
    }
    await db.query("UPDATE delegations SET capability_scope=jsonb_set(capability_scope,'{workItemIds}','[]'::jsonb) WHERE id=$1", [delegation.id])
    try { await rejectWithoutWrites(404) }
    finally { await db.query('UPDATE delegations SET capability_scope=$2::jsonb WHERE id=$1', [delegation.id, JSON.stringify(delegation.capability_scope)]) }
    await db.query('UPDATE agent_team_access SET revoked_at=now() WHERE agent_id=$1 AND team_id=$2', [agentId, teamId])
    try { await rejectWithoutWrites(404) }
    finally { await db.query('UPDATE agent_team_access SET revoked_at=NULL WHERE agent_id=$1 AND team_id=$2', [agentId, teamId]) }
    await db.query('UPDATE actors SET is_active=false WHERE id=$1', [humanId])
    try { await rejectWithoutWrites(404) }
    finally { await db.query('UPDATE actors SET is_active=true WHERE id=$1', [humanId]) }
    await db.query('UPDATE agent_installation_tokens SET revoked_at=now() WHERE token_hash=$1', [tokenHash(installation)])
    try { await rejectWithoutWrites(401) }
    finally { await db.query('UPDATE agent_installation_tokens SET revoked_at=NULL WHERE token_hash=$1', [tokenHash(installation)]) }
    const restored = await agent(installation, 'GET', path)
    expect(restored.statusCode).toBe(200)
    expect(restored.json()).toEqual(reads[0]!.json())
  })

  it('clears retained provenance when a rolling old producer reoccupies an expired key, while ordinary response updates keep proof', async () => {
    const execution = await start(), key = randomUUID()
    await db.query(`UPDATE agent_session_tokens SET installation_token_id=(SELECT id FROM agent_installation_tokens WHERE token_hash=$2)
      WHERE token_hash=$1`, [tokenHash(execution.token), tokenHash(installation)])
    expect((await agent(execution.token, 'POST', `/api/v1/agent-sessions/${execution.sessionId}/complete`, completion, execution.revision, key)).statusCode).toBe(200)
    const path = confirmation(execution.sessionId, key)
    expect((await agent(installation, 'GET', path)).statusCode).toBe(200)
    await db.query('UPDATE api_idempotency_keys SET response_body=response_body WHERE idempotency_key=$1', [key])
    expect((await agent(installation, 'GET', path)).statusCode).toBe(200)
    // This is the old producer's reservation shape: it knows no new source columns.
    await db.query(`UPDATE api_idempotency_keys SET created_at=now()-interval '2 days',
      replay_expires_at=now()-interval '1 day',conflict_expires_at=now()-interval '1 hour'
      WHERE idempotency_key=$1`, [key])
    await db.query(`UPDATE api_idempotency_keys SET operation='POST /legacy/new-action',request_hash='new-logical-request',
      created_at=now(),replay_expires_at=now()+interval '1 day',conflict_expires_at=now()+interval '30 days',
      response_status=NULL,response_body=NULL WHERE idempotency_key=$1`, [key])
    expect((await db.query(`SELECT execution_source_kind,execution_session_id,execution_session_token_id,
      execution_installation_token_id,execution_connection_id FROM api_idempotency_keys WHERE idempotency_key=$1`, [key])).rows[0])
      .toEqual({ execution_source_kind: null, execution_session_id: null, execution_session_token_id: null,
        execution_installation_token_id: null, execution_connection_id: null })
    const baseline = await fingerprint()
    expect((await agent(installation, 'GET', path)).statusCode).toBe(404)
    expect(await fingerprint()).toEqual(baseline)
  })
})
