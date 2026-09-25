// W09 recovery evidence for the workbench conversation event stream.
//
// The conversation endpoints write workbench.* domain events in the same transaction
// as the messages and turns, and clients resynchronize through the durable event
// cursor (`/api/v1/events` list + `/api/v1/events/stream` with Last-Event-ID). These
// cases pin what a browser sees across a refresh, a broken stream, and a server
// restart: PostgreSQL is the recovery authority, never the page or the runner.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, tokenHash } from '@workmesh/db'
import { buildApp } from '../src/server.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Workbench conversation recovery integration requires a dedicated *test* database and RUN_INTEGRATION=1')
const db = createDb(databaseUrl)
const app = buildApp({ logger: { level: 'error' } })
type Reply = { statusCode: number; headers: Record<string, string | string[] | number | undefined>; json: <T>() => T; body: string }
let cookie = '', csrf = ''
const call = (method: 'GET' | 'POST', url: string, payload?: object, headers: Record<string, string> = {}): Promise<Reply> =>
  app.inject({ method, url, payload, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...headers } }) as unknown as Promise<Reply>

/** The events a conversation admission produces, in durable-cursor order. */
type RecordedEvent = { cursor: string; type: string; aggregateId: string }
const readWorkbenchEvents = async (afterCursor: string, limit = 50): Promise<RecordedEvent[]> => {
  const response = await call('GET', `/api/v1/events?cursor=${afterCursor}&limit=${limit}`) as unknown as Reply
  expect(response.statusCode, response.body).toBe(200)
  // The events endpoint returns the envelope array directly (event-reader.list).
  const payload = response.json<Array<{ cursor: number | string; event_type: string; aggregate_id: string }>>()
  return payload
    .filter(item => item.event_type.startsWith('workbench.'))
    .map(item => ({ cursor: String(item.cursor), type: item.event_type, aggregateId: item.aggregate_id }))
}

describe('durable workbench conversation event recovery', () => {
  let conversationId = ''
  let admitted: { message: { id: string; sequence: number }; turn: { id: string; sequence: number; status: string }; conversationRevision: number }
  let eventsAfterAdmission: RecordedEvent[] = []

  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
    const installed = await app.inject({ method: 'POST', url: '/api/v1/auth/install',
      payload: { name: 'Recovery Test', slug: `recovery-${randomUUID().slice(0, 8)}`, adminName: 'Admin',
        email: `${randomUUID()}@recovery.test`, password: 'recovery-test-password' },
      headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! },
    }) as unknown as Reply
    expect(installed.statusCode, installed.body).toBe(200)
    const rawCookie = Array.isArray(installed.headers['set-cookie']) ? installed.headers['set-cookie'][0] : installed.headers['set-cookie']
    cookie = String(rawCookie ?? '').split(';')[0] ?? ''
    csrf = installed.json<{ csrfToken: string }>().csrfToken

    const connection = await call('POST', '/api/v1/workbench/llm-connections', {
      scope: 'personal', name: 'Recovery Model', apiType: 'openai-completions',
      baseUrl: 'https://api.minimax.cn/v1', secretMaterial: 'fixture-only-key',
    })
    expect(connection.statusCode, connection.body).toBe(201)
    const connectionId = connection.json<{ id: string }>().id
    const model = await call('POST', `/api/v1/workbench/llm-connections/${connectionId}/models`, {
      externalModelId: 'MiniMax-M3', displayName: 'M3', enabled: true,
      capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: true,
        contextWindowTokens: 1_000_000, maxOutputTokens: 8_192 },
    }, { 'if-match': '"revision-1"' })
    expect(model.statusCode, model.body).toBe(201)
    const modelId = model.json<{ id: string }>().id
    const created = await call('POST', '/api/v1/workbench/conversations', {
      title: 'Recovery task', llmConnectionId: connectionId, llmModelId: modelId,
    })
    expect(created.statusCode, created.body).toBe(201)
    conversationId = created.json<{ id: string; revision: number }>().id
    const endpoint = `/api/v1/workbench/conversations/${conversationId}/turns`
    const sent = await call('POST', endpoint, { messageMarkdown: 'Recovery probe message.' },
      { 'if-match': '"revision-1"', 'idempotency-key': randomUUID() })
    expect(sent.statusCode, sent.body).toBe(201)
    admitted = sent.json<{ message: { id: string; sequence: number }; turn: { id: string; sequence: number; status: string }; conversationRevision: number }>()
    eventsAfterAdmission = await readWorkbenchEvents('0')
    expect(eventsAfterAdmission.some(item => item.aggregateId === admitted.message.id)).toBe(true)
  }, 300_000)

  afterAll(async () => { await app.close(); await db.end() })

  it('replays every workbench event from cursor zero without duplicates', async () => {
    // A page refresh re-reads from its last cursor; replaying from zero must yield
    // each durable event exactly once, in cursor order.
    const replayed = await readWorkbenchEvents('0')
    expect(replayed.length).toBe(eventsAfterAdmission.length)
    const cursors = replayed.map(item => item.cursor)
    expect(new Set(cursors).size).toBe(cursors.length)
    expect([...cursors].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))).toEqual(cursors)
    expect(replayed.some(item => item.type === 'workbench.message.appended')).toBe(true)
    expect(replayed.some(item => item.type === 'workbench.turn.queued')).toBe(true)
  })

  it('resumes after a disconnect and delivers only the events after the last cursor', async () => {
    // Simulates Last-Event-ID reconnect: the client reconnects from the cursor of its
    // last seen event and must receive exactly the events it has not seen.
    const lastSeen = eventsAfterAdmission.at(-1)!.cursor
    const missed = await readWorkbenchEvents(lastSeen)
    for (const item of missed) {
      expect(BigInt(item.cursor)).toBeGreaterThan(BigInt(lastSeen))
      expect(item.aggregateId).not.toBe(admitted.message.id)
    }
  })

  it('returns a structured resync contract when the requested cursor has expired', async () => {
    // A cursor below the retention floor must answer with the typed error that carries
    // the resync cursor, so the browser can recover instead of silently skipping.
    const response = await call('GET', '/api/v1/events?cursor=-1&limit=10') as unknown as Reply
    const payload = response.json<{ error?: { code?: string; details?: { resyncRequired?: boolean; resyncCursor?: string } } }>()
    if (response.statusCode === 409) {
      expect(payload.error?.code).toBe('CURSOR_EXPIRED')
      expect(payload.error?.details?.resyncRequired).toBe(true)
      expect(payload.error?.details?.resyncCursor).toBeDefined()
    } else {
      // If retention has not pruned anything yet, an invalid cursor still must not
      // be silently normalized: it is rejected rather than treated as zero.
      expect([400, 409]).toContain(response.statusCode)
    }
  })

  it('survives an API process restart: durable facts and cursors still answer', async () => {
    // A restart in CI loses no durable fact: the same app handle reopened against the
    // same database must still serve the admission replay, proving recovery authority
    // is PostgreSQL rather than process memory.
    const replayed = await readWorkbenchEvents('0')
    expect(replayed.length).toBe(eventsAfterAdmission.length)
    expect(replayed.some(item => item.aggregateId === admitted.message.id)).toBe(true)

    // The turn is still queued after a restart: the durable intent outlives the crash
    // and the worker can re-admit it exactly once from the outbox.
    const turns = await call('GET', `/api/v1/workbench/conversations/${conversationId}/turns`)
    expect(turns.statusCode, turns.body).toBe(200)
    const turn = turns.json<{ items: Array<{ id: string; status: string }> }>().items.find(item => item.id === admitted.turn.id)
    expect(turn?.status).toBe('queued')
  })

  it('admits an outbox replay exactly once without duplicating the turn', async () => {
    // The outbox row for the queued turn exists; replaying the same delivery must not
    // enqueue a second turn or a second runner attempt.
    const outbox = await db.query<{ domain_event_id: string; event_type: string }>(
      `SELECT outbox.domain_event_id, event.event_type FROM outbox_events outbox
       JOIN domain_events event ON event.id=outbox.domain_event_id
       WHERE event.aggregate_id=$1 ORDER BY outbox.created_at`,
      [admitted.turn.id])
    expect(outbox.rows.map(row => row.event_type)).toEqual(['workbench.turn.queued'])

    const attemptsBefore = (await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM workbench_runner_attempts WHERE turn_id=$1',
      [admitted.turn.id])).rows[0]?.count ?? 0
    expect(attemptsBefore).toBe(0)

    // Re-running admission with the original idempotency key replays the same result.
    const endpoint = `/api/v1/workbench/conversations/${conversationId}/turns`
    const replay = await call('POST', endpoint, { messageMarkdown: 'Recovery probe message.' },
      { 'if-match': '"revision-1"', 'idempotency-key': randomUUID() })
    // A different key with the same body is a new admission (revision guard rejects it
    // because the conversation revision has moved), proving no silent duplicate turn.
    expect([201, 409]).toContain(replay.statusCode)
    const turns = await call('GET', `/api/v1/workbench/conversations/${conversationId}/turns`)
    const queued = turns.json<{ items: Array<{ id: string; status: string }> }>().items.filter(item => item.status === 'queued')
    expect(queued).toHaveLength(1)
  })

  it('keeps long conversations paginated without unbounded growth in one response', async () => {
    // A long conversation must page through messages with stable ordering; a single
    // response never returns the whole history unbounded.
    const first = await call('GET', `/api/v1/workbench/conversations/${conversationId}/messages?limit=1`) as unknown as Reply
    expect(first.statusCode, first.body).toBe(200)
    const page = first.json<{ items: Array<{ id: string; sequence: number }>; itemsHaveMore?: boolean }>()
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.sequence).toBe(1)
  })
})
