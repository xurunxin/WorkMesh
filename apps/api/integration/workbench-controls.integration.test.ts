// W13 Phase B integration evidence: context-pin edits, steering a running turn, and
// follow-up/retry lineage. These drive the routes added for the workbench controls
// and pin the invariants the contracts declare: terminal turns stay immutable, a
// retry is a new turn, steering never cancels the running attempt, and pins can only
// reference the conversation's own bound scope.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, tokenHash } from '@workmesh/db'
import { buildApp } from '../src/server.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Workbench controls integration requires a dedicated *test* database and RUN_INTEGRATION=1')
const db = createDb(databaseUrl)
const app = buildApp({ logger: { level: 'error' } })
type Reply = { statusCode: number; headers: Record<string, string | string[] | number | undefined>; json: <T>() => T; body: string }
let cookie = '', csrf = ''
const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: object, headers: Record<string, string> = {}): Promise<Reply> =>
  app.inject({ method, url, payload, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...headers } }) as unknown as Promise<Reply>

let connectionId = '', modelId = '', conversationId = '', workItemId = ''
// Every mutation moves the conversation revision, so assertions read the live
// revision instead of hardcoding one.
const currentRevision = async (): Promise<number> =>
  (await call('GET', `/api/v1/workbench/conversations/${conversationId}`)).json<{ revision: number }>().revision

describe('workbench turn controls and context pins', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
    const installed = await app.inject({ method: 'POST', url: '/api/v1/auth/install',
      payload: { name: 'Controls Test', slug: `controls-${randomUUID().slice(0, 8)}`, adminName: 'Admin',
        email: `${randomUUID()}@controls.test`, password: 'controls-test-password' },
      headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! },
    }) as unknown as Reply
    expect(installed.statusCode, installed.body).toBe(200)
    const rawCookie = Array.isArray(installed.headers['set-cookie']) ? installed.headers['set-cookie'][0] : installed.headers['set-cookie']
    cookie = String(rawCookie ?? '').split(';')[0] ?? ''
    csrf = installed.json<{ csrfToken: string }>().csrfToken

    const connection = await call('POST', '/api/v1/workbench/llm-connections', {
      scope: 'personal', name: 'Controls Model', apiType: 'openai-completions',
      baseUrl: 'https://api.minimax.cn/v1', secretMaterial: 'fixture-only-key',
    })
    expect(connection.statusCode, connection.body).toBe(201)
    connectionId = connection.json<{ id: string }>().id
    const model = await call('POST', `/api/v1/workbench/llm-connections/${connectionId}/models`, {
      externalModelId: 'MiniMax-M3', displayName: 'M3', enabled: true,
      capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: true,
        contextWindowTokens: 1_000_000, maxOutputTokens: 8_192 },
    }, { 'if-match': '"revision-1"' })
    expect(model.statusCode, model.body).toBe(201)
    modelId = model.json<{ id: string }>().id

    // A conversation bound to a work item, so pin scope checks have a real target.
    const workspaceId = (await db.query<{ id: string }>('SELECT id FROM workspaces LIMIT 1')).rows[0]!.id
    const team = (await db.query<{ id: string }>('SELECT id FROM teams LIMIT 1')).rows[0]!.id
    const state = (await db.query<{ id: string }>('SELECT id FROM workflow_states LIMIT 1')).rows[0]!.id
    const humanActor = (await db.query<{ id: string }>("SELECT id FROM actors WHERE kind='human' LIMIT 1")).rows[0]!.id
    workItemId = (await db.query<{ id: string }>(
      `INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id)
       VALUES($1,$2,(SELECT COALESCE(max(number),0)+1 FROM work_items WHERE workspace_id=$1),'Controls target',$3,$4)
       RETURNING id`,
      [workspaceId, team, state, humanActor])).rows[0]!.id
    const created = await call('POST', '/api/v1/workbench/conversations', {
      title: 'Controls conversation', workItemId, llmConnectionId: connectionId, llmModelId: modelId,
    })
    expect(created.statusCode, created.body).toBe(201)
    conversationId = created.json<{ id: string }>().id
  }, 300_000)

  afterAll(async () => { await app.close(); await db.end() })

  it('replaces context pins and resolves each pin to its current revision', async () => {
    // revision: null pins the live head; the response reports what head resolved to.
    const pins = await call('PATCH', `/api/v1/workbench/conversations/${conversationId}/context-pins`, {
      pins: [{ kind: 'work_item', refId: workItemId, revision: null }],
    }, { 'if-match': `"revision-${await currentRevision()}"` })
    expect(pins.statusCode, pins.body).toBe(200)
    const updated = pins.json<{ context_pins: Array<{ kind: string; refId: string; resolvedRevision: number | null }>; revision: number }>()
    expect(updated.context_pins).toHaveLength(1)
    expect(updated.context_pins[0]).toMatchObject({ kind: 'work_item', refId: workItemId })
    expect(updated.context_pins[0]?.resolvedRevision).toBeGreaterThan(0)
  })

  it('rejects pins outside the conversation bound scope', async () => {
    const foreignWorkItem = randomUUID()
    const rejected = await call('PATCH', `/api/v1/workbench/conversations/${conversationId}/context-pins`, {
      pins: [{ kind: 'work_item', refId: foreignWorkItem, revision: null }],
    }, { 'if-match': `"revision-${await currentRevision()}"` })
    expect(rejected.statusCode).toBe(403)
  })

  it('enforces If-Match on pin edits', async () => {
    const stale = await call('PATCH', `/api/v1/workbench/conversations/${conversationId}/context-pins`, {
      pins: [],
    }, { 'if-match': '"revision-1"' })
    expect(stale.statusCode).toBe(409)
  })

  it('follows up a terminal turn with a new turn and records the lineage', async () => {
    const sent = await call('POST', `/api/v1/workbench/conversations/${conversationId}/turns`,
      { messageMarkdown: 'Original turn.' }, { 'if-match': `"revision-${await currentRevision()}"` })
    expect(sent.statusCode, sent.body).toBe(201)
    const original = sent.json<{ turn: { id: string; sequence: number; retry_of_turn_id: string | null }; conversationRevision: number }>()
    expect(original.turn.retry_of_turn_id).toBeNull()

    const stopped = await call('POST',
      `/api/v1/workbench/conversations/${conversationId}/turns/${original.turn.id}/stop`,
      { reason: 'Stop before follow-up', stopMode: 'graceful' },
      { 'if-match': `"revision-${original.conversationRevision}"` })
    expect(stopped.statusCode, stopped.body).toBe(200)

    const followup = await call('POST',
      `/api/v1/workbench/conversations/${conversationId}/turns/${original.turn.id}/followup`,
      { messageMarkdown: 'Follow-up with more detail.' }, { 'if-match': `"revision-${await currentRevision()}"` })
    expect(followup.statusCode, followup.body).toBe(201)
    const admitted = followup.json<{ turn: { id: string; sequence: number; status: string; retry_of_turn_id: string | null } }>()
    expect(admitted.turn.id).not.toBe(original.turn.id)
    expect(admitted.turn.sequence).toBe(original.turn.sequence + 1)
    expect(admitted.turn.status).toBe('queued')
    // Plain follow-up: a new fact, not a retry.
    expect(admitted.turn.retry_of_turn_id).toBeNull()

    // The original turn is untouched: terminal rows are immutable.
    const turns = await call('GET', `/api/v1/workbench/conversations/${conversationId}/turns`)
    const prior = turns.json<{ items: Array<{ id: string; status: string; sequence: number }> }>()
      .items.find(item => item.id === original.turn.id)
    expect(prior?.status).toBe('stopped')
    expect(prior?.sequence).toBe(original.turn.sequence)
  })

  it('rejects a followup against a non-terminal turn', async () => {
    const sent = await call('POST', `/api/v1/workbench/conversations/${conversationId}/turns`,
      { messageMarkdown: 'Still queued.' }, { 'if-match': `"revision-${await currentRevision()}"` })
    expect(sent.statusCode, sent.body).toBe(201)
    const turnId = sent.json<{ turn: { id: string } }>().turn.id
    const rejected = await call('POST',
      `/api/v1/workbench/conversations/${conversationId}/turns/${turnId}/followup`,
      { messageMarkdown: 'Too early.' }, { 'if-match': `"revision-${await currentRevision()}"` })
    expect(rejected.statusCode, rejected.body.slice(0,300)).toBe(400)
    expect(rejected.json<{ error?: { code?: string } }>().error?.code).toBe('INVALID_STATE')
  })

  it('rejects steering a turn that is not running', async () => {
    const turns = await call('GET', `/api/v1/workbench/conversations/${conversationId}/turns`)
    const queued = turns.json<{ items: Array<{ id: string; status: string }> }>().items.find(item => item.status === 'queued')
    expect(queued).toBeDefined()
    const rejected = await call('POST',
      `/api/v1/workbench/conversations/${conversationId}/turns/${queued!.id}/steer`,
      { messageMarkdown: 'Steer a queued turn' }, { 'if-match': `"revision-${await currentRevision()}"` })
    expect(rejected.statusCode, rejected.body.slice(0,300)).toBe(400)
    expect(rejected.json<{ error?: { code?: string } }>().error?.code).toBe('INVALID_STATE')
  })

  it('exposes the append-only tool invocation ledger shape from migration 0012', async () => {
    const table = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='workbench_tool_invocations' ORDER BY ordinal_position`)
    expect(table.rows.map(row => row.column_name)).toEqual(expect.arrayContaining([
      'workspace_id', 'turn_id', 'conversation_id', 'runner_attempt_id',
      'tool_name', 'call_count', 'sanitized_input_summary', 'usage', 'sequence',
    ]))
    // Ledger rows are written by the settle path (see workbench-runner suite); the
    // conversation API itself never upserts them, so the table starts empty here.
    const count = (await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM workbench_tool_invocations')).rows[0]?.count ?? 0
    expect(count).toBe(0)
  })
})
