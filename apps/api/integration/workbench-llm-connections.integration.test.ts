import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, opaqueToken, tokenHash } from '@workmesh/db'
import { buildApp } from '../src/server.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Workbench LLM integration requires a dedicated *test* database and RUN_INTEGRATION=1')

const db = createDb(databaseUrl)
const app = buildApp({ logger: { level: 'error' } })
type Reply = { statusCode: number; headers: Record<string, string | string[] | number | undefined>; json: <T>() => T; body: string }
let cookie = '', csrf = ''
let workspaceId = ''
const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object, headers: Record<string, string> = {}): Promise<Reply> =>
  app.inject({ method, url, payload, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...headers } }) as unknown as Promise<Reply>

describe('Workbench LLM connection settings', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
    const installed = await app.inject({ method: 'POST', url: '/api/v1/auth/install',
      payload: { name: 'Workbench Test', slug: `workbench-${randomUUID().slice(0, 8)}`, adminName: 'Admin', email: `${randomUUID()}@workbench.test`, password: 'workbench-test-password' },
      headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! },
    }) as unknown as Reply
    expect(installed.statusCode, installed.body).toBe(200)
    const rawCookie = Array.isArray(installed.headers['set-cookie']) ? installed.headers['set-cookie'][0] : installed.headers['set-cookie']
    cookie = String(rawCookie ?? '').split(';')[0] ?? ''
    csrf = installed.json<{ csrfToken: string }>().csrfToken
    workspaceId = (await db.query<{ id: string }>('SELECT id FROM workspaces LIMIT 1')).rows[0]!.id
  }, 300_000)
  afterAll(async () => { await app.close(); await db.end() })

  it('stores encrypted secrets, guards revisions, replays idempotently, and revokes', async () => {
    const endpoint = '/api/v1/workbench/llm-connections'
    const secret = `test-${randomUUID()}`
    const payload = { scope: 'personal', name: 'MiniMax China', apiType: 'openai-completions', baseUrl: 'https://api.minimax.cn/v1/', secretMaterial: secret }
    const key = randomUUID()
    const created = await call('POST', endpoint, payload, { 'idempotency-key': key })
    expect(created.statusCode, created.body).toBe(201)
    const connection = created.json<{ id: string; revision: number; base_url: string; secret_status: string }>()
    expect(connection).toMatchObject({ revision: 1, base_url: 'https://api.minimax.cn/v1', secret_status: 'configured' })
    expect(created.body).not.toContain(secret)
    const replay = await call('POST', endpoint, payload, { 'idempotency-key': key })
    expect(replay.statusCode).toBe(201)
    expect(replay.json()).toEqual(created.json())
    const encrypted = (await db.query<{ ciphertext: Buffer; plaintext: string }>(
      'SELECT secret_ciphertext AS ciphertext,pgp_sym_decrypt(secret_ciphertext,$2) AS plaintext FROM workbench_llm_connections WHERE id=$1',
      [connection.id, process.env.WORKMESH_MASTER_KEY],
    )).rows[0]!
    expect(encrypted.plaintext).toBe(secret)
    expect(encrypted.ciphertext.toString('utf8')).not.toContain(secret)
    const model = await call('POST', `${endpoint}/${connection.id}/models`, {
      externalModelId: 'MiniMax-M3', displayName: 'MiniMax M3', enabled: true,
      capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: true, contextWindowTokens: 1000000, maxOutputTokens: 8192 },
    }, { 'if-match': '"revision-1"' })
    expect(model.statusCode, model.body).toBe(201)
    const detail = await call('GET', `${endpoint}/${connection.id}`)
    expect(detail.statusCode, detail.body).toBe(200)
    expect(detail.json<{ models: Array<{ external_model_id: string }> }>().models[0]?.external_model_id).toBe('MiniMax-M3')
    const stale = await call('PATCH', `${endpoint}/${connection.id}`, { name: 'Changed' }, { 'if-match': '"revision-1"' })
    expect(stale.statusCode).toBe(409)
    const updated = await call('PATCH', `${endpoint}/${connection.id}`, { name: 'Changed' }, { 'if-match': '"revision-2"' })
    expect(updated.statusCode, updated.body).toBe(200)
    expect(updated.json<{ revision: number }>().revision).toBe(3)
    const revoked = await call('DELETE', `${endpoint}/${connection.id}`, undefined, { 'if-match': '"revision-3"' })
    expect(revoked.statusCode).toBe(204)
    const wiped = (await db.query<{ plaintext: string }>(
      'SELECT pgp_sym_decrypt(secret_ciphertext,$2) AS plaintext FROM workbench_llm_connections WHERE id=$1',
      [connection.id, process.env.WORKMESH_MASTER_KEY],
    )).rows[0]!
    expect(wiped.plaintext).toBe('')
    expect((await call('PATCH', `${endpoint}/${connection.id}`, { name: 'Resurrect' }, { 'if-match': '"revision-4"' })).statusCode).toBe(400)
    const events = await db.query<{ event_type: string }>(
      `SELECT event_type FROM domain_events WHERE aggregate_id=$1 ORDER BY cursor`, [connection.id],
    )
    expect(events.rows.map(row => row.event_type)).toEqual([
      'workbench.llm_connection.created', 'workbench.llm_connection.updated',
      'workbench.llm_connection.updated', 'workbench.llm_connection.revoked',
    ])
    expect((await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM outbox_events outbox JOIN domain_events event ON event.id=outbox.domain_event_id WHERE event.aggregate_id=$1`,
      [connection.id],
    )).rows[0]?.count).toBe(4)
  })

  it('rejects unauthenticated access and unsafe personal URLs', async () => {
    const denied = await app.inject({ method: 'GET', url: '/api/v1/workbench/llm-connections' })
    expect(denied.statusCode).toBe(401)
    const unsafe = await call('POST', '/api/v1/workbench/llm-connections', {
      scope: 'personal', name: 'Bad URL', apiType: 'openai-completions',
      baseUrl: 'http://localhost:8080/v1', secretMaterial: 'test-only-secret',
    })
    expect(unsafe.statusCode).toBe(400)
  })

  it('keeps personal connections private even from workspace admins and grants team members read-only access', async () => {
    const endpoint = '/api/v1/workbench/llm-connections'
    const secret = `authorization-${randomUUID()}`
    const personal = await call('POST', endpoint, {
      scope: 'personal', name: `Personal-${randomUUID()}`, apiType: 'openai-responses',
      baseUrl: 'https://api.minimax.cn/v1', secretMaterial: secret,
    })
    expect(personal.statusCode, personal.body).toBe(201)
    const personalId = personal.json<{ id: string }>().id
    const otherAdminId = (await db.query<{ id: string }>(
      `INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash)
       VALUES($1,'human','admin',$2,'Other Admin','unused') RETURNING id`,
      [workspaceId, `${randomUUID()}@workbench.test`],
    )).rows[0]!.id
    const otherAdminToken = opaqueToken(), otherAdminCsrf = opaqueToken()
    await db.query(`INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at)
      VALUES($1,$2,$3,now()+interval '1 hour')`, [otherAdminId, tokenHash(otherAdminToken), otherAdminCsrf])
    const otherAdminHeaders = { cookie: `workmesh_session=${otherAdminToken}`, 'x-csrf-token': otherAdminCsrf }
    expect((await call('GET', `${endpoint}/${personalId}`, undefined, otherAdminHeaders)).statusCode).toBe(404)
    const otherAdminList = await call('GET', endpoint, undefined, otherAdminHeaders)
    expect(otherAdminList.statusCode, otherAdminList.body).toBe(200)
    expect(otherAdminList.json<{ items: Array<{ id: string }> }>().items.some(item => item.id === personalId)).toBe(false)

    const teamId = (await db.query<{ id: string }>(
      `INSERT INTO teams(workspace_id,name,key) VALUES($1,'Model Team',$2) RETURNING id`,
      [workspaceId, `M${randomUUID().slice(0, 6).toUpperCase()}`],
    )).rows[0]!.id
    const memberId = (await db.query<{ id: string }>(
      `INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash)
       VALUES($1,'human','member',$2,'Team Member','unused') RETURNING id`,
      [workspaceId, `${randomUUID()}@workbench.test`],
    )).rows[0]!.id
    await db.query(`INSERT INTO memberships(workspace_id,team_id,actor_id,role)
      VALUES($1,$2,$3,'member')`, [workspaceId, teamId, memberId])
    const memberToken = opaqueToken(), memberCsrf = opaqueToken()
    await db.query(`INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at)
      VALUES($1,$2,$3,now()+interval '1 hour')`, [memberId, tokenHash(memberToken), memberCsrf])
    const memberHeaders = { cookie: `workmesh_session=${memberToken}`, 'x-csrf-token': memberCsrf }
    const team = await call('POST', endpoint, {
      scope: 'team', teamId, name: `Shared-${randomUUID()}`, apiType: 'openai-completions',
      baseUrl: 'https://api.minimax.cn/v1', secretMaterial: secret,
    })
    expect(team.statusCode, team.body).toBe(201)
    const teamIdForConnection = team.json<{ id: string }>().id
    const visible = await call('GET', `${endpoint}/${teamIdForConnection}`, undefined, memberHeaders)
    expect(visible.statusCode, visible.body).toBe(200)
    expect(visible.json<{ can_manage: boolean }>().can_manage).toBe(false)
    expect((await call('PATCH', `${endpoint}/${teamIdForConnection}`, { name: 'Hijacked' }, {
      ...memberHeaders, 'if-match': '"revision-1"',
    })).statusCode).toBe(403)
    expect((await call('GET', `${endpoint}/${personalId}`, undefined, memberHeaders)).statusCode).toBe(404)
    const personalAudience = (await db.query<{ audience_actor_id: string }>(
      `SELECT audience_actor_id FROM domain_events WHERE aggregate_id=$1 AND event_type='workbench.llm_connection.created'`,
      [personalId],
    )).rows[0]
    expect(personalAudience?.audience_actor_id).toBeTruthy()
    expect(personalAudience?.audience_actor_id).not.toBe(memberId)
  })
})
