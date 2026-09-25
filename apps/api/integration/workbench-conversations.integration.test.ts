import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, opaqueToken, tokenHash } from '@workmesh/db'
import { buildApp } from '../src/server.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Workbench conversation integration requires a dedicated *test* database and RUN_INTEGRATION=1')
const db = createDb(databaseUrl)
const app = buildApp({ logger: { level: 'error' } })
type Reply = { statusCode: number; headers: Record<string, string | string[] | number | undefined>; json: <T>() => T; body: string }
let cookie = '', csrf = '', workspaceId = ''
const call = (method: 'GET' | 'POST', url: string, payload?: object, headers: Record<string, string> = {}): Promise<Reply> =>
  app.inject({ method, url, payload, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...headers } }) as unknown as Promise<Reply>

describe('durable workbench conversation admission', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
    const installed = await app.inject({ method: 'POST', url: '/api/v1/auth/install',
      payload: { name: 'Conversation Test', slug: `conversation-${randomUUID().slice(0, 8)}`, adminName: 'Admin',
        email: `${randomUUID()}@conversation.test`, password: 'conversation-test-password' },
      headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! },
    }) as unknown as Reply
    expect(installed.statusCode, installed.body).toBe(200)
    const rawCookie = Array.isArray(installed.headers['set-cookie']) ? installed.headers['set-cookie'][0] : installed.headers['set-cookie']
    cookie = String(rawCookie ?? '').split(';')[0] ?? ''
    csrf = installed.json<{ csrfToken: string }>().csrfToken
    workspaceId = (await db.query<{ id: string }>('SELECT id FROM workspaces LIMIT 1')).rows[0]!.id
  }, 300_000)
  afterAll(async () => { await app.close(); await db.end() })

  it('atomically persists a message, queued turn, and outbox intents; handles replay and stop', async () => {
    const connection = await call('POST', '/api/v1/workbench/llm-connections', {
      scope: 'personal', name: 'Test Model', apiType: 'openai-completions',
      baseUrl: 'https://api.minimax.cn/v1', secretMaterial: 'fixture-only-key',
    })
    expect(connection.statusCode, connection.body).toBe(201)
    const connectionId = connection.json<{ id: string }>().id
    const model = await call('POST', `/api/v1/workbench/llm-connections/${connectionId}/models`, {
      externalModelId: 'MiniMax-M3', displayName: 'M3', enabled: true,
      capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: true,
        contextWindowTokens: 1000000, maxOutputTokens: 8192 },
    }, { 'if-match': '"revision-1"' })
    expect(model.statusCode, model.body).toBe(201)
    const modelId = model.json<{ id: string }>().id
    const created = await call('POST', '/api/v1/workbench/conversations', {
      title: 'Durable task', llmConnectionId: connectionId, llmModelId: modelId,
    })
    expect(created.statusCode, created.body).toBe(201)
    const conversationId = created.json<{ id: string; revision: number }>().id
    const endpoint = `/api/v1/workbench/conversations/${conversationId}/turns`
    const body = { messageMarkdown: 'Read the current project status.' }
    const key = randomUUID()
    const first = await call('POST', endpoint, body, { 'if-match': '"revision-1"', 'idempotency-key': key })
    expect(first.statusCode, first.body).toBe(201)
    const admitted = first.json<{ message: { id: string; sequence: number }; turn: { id: string; sequence: number; status: string }; conversationRevision: number }>()
    expect(admitted).toMatchObject({ message: { sequence: 1 }, turn: { sequence: 1, status: 'queued' }, conversationRevision: 2 })
    const replay = await call('POST', endpoint, body, { 'if-match': '"revision-1"', 'idempotency-key': key })
    expect(replay.statusCode).toBe(201)
    expect(replay.json()).toEqual(first.json())
    expect((await call('POST', endpoint, { messageMarkdown: 'Different body' },
      { 'if-match': '"revision-1"', 'idempotency-key': key })).statusCode).toBe(409)
    expect((await call('POST', endpoint, body, { 'if-match': '"revision-1"' })).statusCode).toBe(409)
    const messages = await call('GET', `/api/v1/workbench/conversations/${conversationId}/messages?limit=1`)
    expect(messages.statusCode, messages.body).toBe(200)
    expect(messages.json<{ items: Array<{ id: string }> }>().items[0]?.id).toBe(admitted.message.id)
    const events = await db.query<{ event_type: string }>(
      `SELECT event_type FROM domain_events WHERE aggregate_id IN ($1,$2) ORDER BY cursor`,
      [admitted.message.id, admitted.turn.id])
    expect(events.rows.map(row => row.event_type)).toEqual(['workbench.message.appended', 'workbench.turn.queued'])
    const outbox = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM outbox_events outbox JOIN domain_events event
       ON event.id=outbox.domain_event_id WHERE event.aggregate_id IN ($1,$2)`,
      [admitted.message.id, admitted.turn.id])
    expect(outbox.rows[0]?.count).toBe(2)
    const stopped = await call('POST', `${endpoint}/${admitted.turn.id}/stop`,
      { reason: 'Cancel queued turn', stopMode: 'immediate' }, { 'if-match': '"revision-2"' })
    expect(stopped.statusCode, stopped.body).toBe(200)
    expect(stopped.json<{ turn: { status: string } }>().turn.status).toBe('stopped')
    const archived = await call('POST', `/api/v1/workbench/conversations/${conversationId}/archive`,
      {}, { 'if-match': '"revision-3"' })
    expect(archived.statusCode, archived.body).toBe(200)
    expect(archived.json<{ status: string; revision: number }>()).toMatchObject({ status: 'archived', revision: 4 })
    expect((await call('POST', endpoint, body, { 'if-match': '"revision-4"' })).statusCode).toBe(400)
    expect((await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM workbench_messages WHERE conversation_id=$1',
      [conversationId])).rows[0]?.count).toBe(1)
  })

  it('keeps personal conversations private, including from another workspace admin', async () => {
    const created = await call('POST', '/api/v1/workbench/conversations', { title: 'Private conversation' })
    expect(created.statusCode, created.body).toBe(201)
    const conversationId = created.json<{ id: string }>().id
    const otherId = (await db.query<{ id: string }>(
      `INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash)
       VALUES($1,'human','admin',$2,'Other Admin','unused') RETURNING id`,
      [workspaceId, `${randomUUID()}@conversation.test`])).rows[0]!.id
    const token = opaqueToken(), otherCsrf = opaqueToken()
    await db.query(`INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at)
      VALUES($1,$2,$3,now()+interval '1 hour')`, [otherId, tokenHash(token), otherCsrf])
    const other = { cookie: `workmesh_session=${token}`, 'x-csrf-token': otherCsrf }
    expect((await call('GET', `/api/v1/workbench/conversations/${conversationId}`, undefined, other)).statusCode).toBe(404)
    const list = await call('GET', '/api/v1/workbench/conversations', undefined, other)
    expect(list.statusCode, list.body).toBe(200)
    expect(list.json<{ items: Array<{ id: string }> }>().items.some(item => item.id === conversationId)).toBe(false)
    expect((await call('GET', `/api/v1/workbench/conversations/${conversationId}/messages`, undefined, other)).statusCode).toBe(404)
  })

  it('serializes concurrent sends and rolls back all facts when outbox insertion fails', async () => {
    const connection = (await db.query<{ id: string }>(
      "SELECT id FROM workbench_llm_connections WHERE status='active' LIMIT 1")).rows[0]!
    const model = (await db.query<{ id: string }>(
      'SELECT id FROM workbench_llm_models WHERE connection_id=$1 LIMIT 1', [connection.id])).rows[0]!
    const created = await call('POST', '/api/v1/workbench/conversations', {
      title: 'Concurrent turns', llmConnectionId: connection.id, llmModelId: model.id,
    })
    expect(created.statusCode, created.body).toBe(201)
    const conversationId = created.json<{ id: string }>().id
    const endpoint = `/api/v1/workbench/conversations/${conversationId}/turns`
    const [left, right] = await Promise.all([
      call('POST', endpoint, { messageMarkdown: 'First' }, { 'if-match': '"revision-1"' }),
      call('POST', endpoint, { messageMarkdown: 'Second' }, { 'if-match': '"revision-1"' }),
    ])
    expect([left.statusCode, right.statusCode].sort()).toEqual([201, 409])
    expect((await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM workbench_turns WHERE conversation_id=$1', [conversationId])).rows[0]?.count).toBe(1)
    await db.query(`CREATE FUNCTION workbench_test_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.topic='workbench.turn.queued' THEN RAISE EXCEPTION 'test outbox failure'; END IF;
      RETURN NEW; END $$`)
    await db.query(`CREATE TRIGGER workbench_test_fail_outbox_trigger BEFORE INSERT ON outbox_events
      FOR EACH ROW EXECUTE FUNCTION workbench_test_fail_outbox()`)
    try {
      const failed = await call('POST', endpoint, { messageMarkdown: 'Must roll back' },
        { 'if-match': '"revision-2"' })
      expect(failed.statusCode).toBe(500)
      expect((await db.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM workbench_turns WHERE conversation_id=$1', [conversationId])).rows[0]?.count).toBe(1)
      expect((await db.query<{ revision: number }>(
        'SELECT revision FROM workbench_conversations WHERE id=$1', [conversationId])).rows[0]?.revision).toBe(2)
    } finally {
      await db.query('DROP TRIGGER workbench_test_fail_outbox_trigger ON outbox_events')
      await db.query('DROP FUNCTION workbench_test_fail_outbox()')
    }
  })
})
