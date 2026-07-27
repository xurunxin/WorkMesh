import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '@workmesh/db'

const databaseUrl = process.env.DATABASE_URL
const bootstrapToken = process.env.WORKMESH_BOOTSTRAP_TOKEN
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl)
  throw new Error('Bootstrap integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Bootstrap integration requires a dedicated test database.')
if (!bootstrapToken)
  throw new Error('Bootstrap integration requires an explicit WORKMESH_BOOTSTRAP_TOKEN.')

const testEnvironment = {
  NODE_ENV: 'test',
  WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
  AUTH_RATE_LIMIT_REDIS_PREFIX:
    `authrl:test:bootstrap:${process.pid}:${randomUUID()}`,
  AUTH_RATE_LIMIT_ENDPOINT_BURST: '10000',
  AUTH_RATE_LIMIT_SOCKET_BURST: '10000',
  AUTH_RATE_LIMIT_CLIENT_IP_BURST: '10000',
  AUTH_RATE_LIMIT_SUBJECT_BURST: '1000',
  AUTH_RATE_LIMIT_INSTALL_BURST: '100',
  AUTH_RATE_LIMIT_BACKOFF_BASE_MS: '60000',
  AUTH_RATE_LIMIT_BACKOFF_MAX_MS: '60000',
} as const
const previousEnvironment = new Map(
  Object.keys(testEnvironment).map(name => [name, process.env[name]]),
)
for (const [name, value] of Object.entries(testEnvironment))
  process.env[name] = value

const { buildApp } = await import('../src/server.js')
const db = createDb(databaseUrl)
const logs: string[] = []
const runId = randomUUID()
const suiteSlugPrefix = `bootstrap-${runId}`
let authIdempotencyBaseline = new Set<string>()
let bootstrapDenialBaseline = new Set<string>()
const app = buildApp({
  logger: {
    level: 'info',
    stream: { write: (message: string) => logs.push(message) },
  },
})

type InstallPayload = {
  name: string
  slug: string
  adminName: string
  email: string
  password: string
}

const basePayload = (suffix: string): InstallPayload => ({
  name: `Bootstrap ${suffix}`,
  slug: `${suiteSlugPrefix}-${suffix}`,
  adminName: 'Bootstrap Admin',
  email: `${suiteSlugPrefix}-${suffix}@example.test`,
  password: `bootstrap-${suffix}-password`,
})

const install = (
  payload: InstallPayload,
  idempotencyKey: string,
  token: string | null = bootstrapToken,
  remoteAddress = '198.51.100.10',
) => app.inject({
  method: 'POST',
  url: '/api/v1/auth/install',
  remoteAddress,
  headers: {
    'idempotency-key': `${runId}:${idempotencyKey}`,
    origin: 'https://workmesh.example.test',
    'user-agent': 'workmesh-bootstrap-integration',
    ...(token === null
      ? {}
      : { 'x-workmesh-bootstrap-token': token }),
  },
  payload,
})

const cookieFrom = (
  response: { headers: Record<string, string | string[] | number | undefined> },
): string => {
  const raw = response.headers['set-cookie']
  const value = Array.isArray(raw) ? raw[0] : raw
  return String(value ?? '').split(';')[0] ?? ''
}

const suiteWorkspacePattern = `${suiteSlugPrefix}-%`
const authIdempotencyRecords = async () =>
  (await db.query<Record<string, unknown> & { id: string }>(
    `SELECT * FROM auth_idempotency_records
     WHERE operation='installWorkspace' ORDER BY id`,
  )).rows
const bootstrapDenials = async () =>
  (await db.query<Record<string, unknown> & { id: string }>(
    `SELECT * FROM authorization_denials
     WHERE operation_id='installWorkspace'
        OR policy_id='route.installWorkspace'
     ORDER BY id`,
  )).rows
const newAuthIdempotencyRecords = async () =>
  (await authIdempotencyRecords())
    .filter(row => !authIdempotencyBaseline.has(row.id))
const newBootstrapDenials = async () =>
  (await bootstrapDenials())
    .filter(row => !bootstrapDenialBaseline.has(row.id))

const durableCounts = async () => ({
  workspaces: (await db.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM workspaces WHERE slug LIKE $1',
    [suiteWorkspacePattern],
  )).rows[0]!.count,
  humans: (await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM actors actor
     JOIN workspaces workspace ON workspace.id=actor.workspace_id
     WHERE actor.kind='human' AND workspace.slug LIKE $1`,
    [suiteWorkspacePattern],
  )).rows[0]!.count,
  sessions: (await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM sessions session
     JOIN actors actor ON actor.id=session.actor_id
     JOIN workspaces workspace ON workspace.id=actor.workspace_id
     WHERE workspace.slug LIKE $1`,
    [suiteWorkspacePattern],
  )).rows[0]!.count,
  events: (await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM domain_events event
     JOIN workspaces workspace ON workspace.id=event.workspace_id
     WHERE workspace.slug LIKE $1`,
    [suiteWorkspacePattern],
  )).rows[0]!.count,
  outbox: (await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM outbox_events outbox
     JOIN domain_events event ON event.id=outbox.domain_event_id
     JOIN workspaces workspace ON workspace.id=event.workspace_id
     WHERE workspace.slug LIKE $1`,
    [suiteWorkspacePattern],
  )).rows[0]!.count,
  authIdempotency: (await newAuthIdempotencyRecords()).length,
  denials: (await newBootstrapDenials()).length,
})

describe('authenticated single-use installation bootstrap', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await app.ready()
  }, 120_000)

  beforeEach(async () => {
    logs.length = 0
    await db.query('DELETE FROM platform_installation')
    await db.query('DELETE FROM workspaces WHERE slug LIKE $1', [
      suiteWorkspacePattern,
    ])
    authIdempotencyBaseline = new Set(
      (await authIdempotencyRecords()).map(row => row.id),
    )
    bootstrapDenialBaseline = new Set(
      (await bootstrapDenials()).map(row => row.id),
    )
  })

  afterAll(async () => {
    await app.close()
    await db.query(
      `DELETE FROM platform_installation
       WHERE workspace_id IN (
         SELECT id FROM workspaces WHERE slug LIKE $1
       )`,
      [suiteWorkspacePattern],
    )
    await db.query('DELETE FROM workspaces WHERE slug LIKE $1', [
      suiteWorkspacePattern,
    ])
    await db.end()
    for (const [name, value] of previousEnvironment) {
      if (value === undefined)
        delete process.env[name]
      else
        process.env[name] = value
    }
  })

  it('rejects remote, proxied, malformed, and wrong credentials before durable side effects', async () => {
    const before = await durableCounts()
    const payload = basePayload('no-side-effects')
    const responses = await Promise.all([
      install(payload, 'missing-token', null, '198.51.100.11'),
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/install',
        remoteAddress: '127.0.0.1',
        headers: {
          'idempotency-key': 'forwarded-loopback',
          forwarded: 'for=198.51.100.12',
          'x-forwarded-for': '198.51.100.12',
        },
        payload,
      }),
      install(payload, 'malformed-token', 'not-base64url', '198.51.100.13'),
      install(
        payload,
        'wrong-token',
        'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo5ODc2NTQzMjE',
        '198.51.100.14',
      ),
    ])

    expect(responses.map(response => response.statusCode))
      .toEqual([401, 401, 401, 401])
    for (const response of responses)
      expect(response.json()).toMatchObject({
        error: {
          code: 'BOOTSTRAP_AUTH_FAILED',
          message: 'Bootstrap authentication failed',
        },
      })
    expect(await durableCounts()).toEqual(before)
  })

  it('installs once and exactly replays the encrypted cookie response only for the same credential, key, body, and client context', async () => {
    const payload = basePayload('exact-replay')
    const first = await install(payload, 'exact-replay')
    const replay = await install(payload, 'exact-replay')
    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(replay.json()).toEqual(first.json())
    expect(cookieFrom(replay)).toBe(cookieFrom(first))
    expect(cookieFrom(first)).toMatch(/^workmesh_session=/)

    const changedBody = await install(
      { ...payload, name: 'Changed Workspace Name' },
      'exact-replay',
    )
    expect(changedBody.statusCode).toBe(409)
    expect(changedBody.json()).toMatchObject({
      error: { code: 'IDEMPOTENCY_KEY_REUSED' },
    })

    const changedKey = await install(payload, 'rotated-key')
    expect(changedKey.statusCode).toBe(409)
    expect(changedKey.json()).toMatchObject({
      error: { code: 'INSTALLATION_ALREADY_COMPLETED' },
    })

    const changedToken = await install(
      payload,
      'exact-replay',
      'RGlmZmVyZW50X3JhbmRvbV9ib290c3RyYXBfdG9rZW5fMDAwMDE',
      '198.51.100.15',
    )
    expect(changedToken.statusCode).toBe(401)
    expect(changedToken.json()).toMatchObject({
      error: { code: 'BOOTSTRAP_AUTH_FAILED' },
    })
    expect(await durableCounts()).toMatchObject({
      workspaces: 1,
      humans: 1,
      sessions: 1,
      authIdempotency: 1,
      denials: 0,
    })
  })

  it('returns the same result to 20 concurrent callers sharing one key', async () => {
    const payload = basePayload('same-key-20')
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => install(payload, 'same-key-20')),
    )
    expect(responses.every(response => response.statusCode === 200)).toBe(true)
    expect(new Set(responses.map(response => response.body)).size).toBe(1)
    expect(new Set(responses.map(cookieFrom)).size).toBe(1)
    expect(await durableCounts()).toMatchObject({
      workspaces: 1,
      humans: 1,
      sessions: 1,
      authIdempotency: 1,
    })
  }, 120_000)

  it('allows exactly one of 20 concurrent distinct keys and permanently closes every loser', async () => {
    const payload = basePayload('different-keys-20')
    const responses = await Promise.all(
      Array.from(
        { length: 20 },
        (_, index) => install(payload, `different-key-${index}`),
      ),
    )
    expect(responses.filter(response => response.statusCode === 200))
      .toHaveLength(1)
    const conflicts = responses.filter(response => response.statusCode === 409)
    expect(conflicts).toHaveLength(19)
    expect(conflicts.every(response =>
      response.json<{ error: { code: string } }>().error.code
      === 'INSTALLATION_ALREADY_COMPLETED')).toBe(true)
    expect(await durableCounts()).toMatchObject({
      workspaces: 1,
      humans: 1,
      sessions: 1,
      authIdempotency: 1,
    })
  }, 120_000)

  it('rolls back the replay claim and partial installation writes, then permits the exact retry', async () => {
    await db.query(
      `CREATE OR REPLACE FUNCTION bootstrap_install_test_failure()
         RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.kind='human'
            AND NEW.email::text LIKE 'bootstrap-%-rollback@example.test'
         THEN RAISE EXCEPTION 'forced bootstrap integration rollback';
         END IF;
         RETURN NEW;
       END $$`,
    )
    await db.query(
      `CREATE TRIGGER bootstrap_install_test_failure
         BEFORE INSERT ON actors
         FOR EACH ROW EXECUTE FUNCTION bootstrap_install_test_failure()`,
    )
    const payload = {
      ...basePayload('rollback'),
    }

    let failed!: Awaited<ReturnType<typeof install>>
    try {
      failed = await install(payload, 'rollback-install')
    } finally {
      await db.query(
        'DROP TRIGGER IF EXISTS bootstrap_install_test_failure ON actors',
      )
      await db.query(
        'DROP FUNCTION IF EXISTS bootstrap_install_test_failure()',
      )
    }
    expect(failed.statusCode).toBe(500)
    expect((await db.query(
      'SELECT 1 FROM workspaces WHERE slug=$1',
      [payload.slug],
    )).rowCount).toBe(0)
    expect((await db.query(
      `SELECT 1 FROM actors actor
       JOIN workspaces workspace ON workspace.id=actor.workspace_id
       WHERE actor.display_name='WorkMesh System' AND workspace.slug LIKE $1`,
      [suiteWorkspacePattern],
    )).rowCount).toBe(0)
    expect((await durableCounts()).authIdempotency).toBe(0)

    const retry = await install(payload, 'rollback-install')
    expect(retry.statusCode).toBe(200)
    expect(await durableCounts()).toMatchObject({
      workspaces: 1,
      humans: 1,
      sessions: 1,
      authIdempotency: 1,
    })
  })

  it('turns repeated bootstrap guessing into a uniform 429 without PostgreSQL audit or idempotency writes', async () => {
    const payload = basePayload('brute-force')
    const remoteAddress = '198.51.100.91'
    const first = await install(
      payload,
      'brute-force-first',
      'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo5ODc2NTQzMjE',
      remoteAddress,
    )
    const second = await install(
      payload,
      'brute-force-second',
      'RkVEQ0JBOTg3NjU0MzIxMFpZWFdWVVRTUlFQT05NTEtKSUhH',
      remoteAddress,
    )
    expect(first.statusCode).toBe(401)
    expect(second.statusCode).toBe(429)
    expect(second.json()).toMatchObject({
      error: { code: 'AUTH_RATE_LIMITED' },
    })
    expect(Number(second.headers['retry-after'])).toBeGreaterThan(0)
    expect(await durableCounts()).toEqual({
      workspaces: 0,
      humans: 0,
      sessions: 0,
      events: 0,
      outbox: 0,
      authIdempotency: 0,
      denials: 0,
    })
  })

  it('does not leak bootstrap, password, client, cookie, or idempotency values through logs, errors, or durable facts', async () => {
    const password = 'bootstrap-password-leak-sentinel'
    const payload = {
      ...basePayload('leakage'),
      password,
    }
    const key = 'bootstrap-idempotency-leak-sentinel'
    const response = await install(payload, key)
    expect(response.statusCode).toBe(200)
    const cookie = cookieFrom(response)

    const durable = JSON.stringify({
      events: (await db.query(
        `SELECT event.* FROM domain_events event
         JOIN workspaces workspace ON workspace.id=event.workspace_id
         WHERE workspace.slug LIKE $1`,
        [suiteWorkspacePattern],
      )).rows,
      outbox: (await db.query(
        `SELECT outbox.* FROM outbox_events outbox
         JOIN domain_events event ON event.id=outbox.domain_event_id
         JOIN workspaces workspace ON workspace.id=event.workspace_id
         WHERE workspace.slug LIKE $1`,
        [suiteWorkspacePattern],
      )).rows,
      denials: await newBootstrapDenials(),
      replay: await newAuthIdempotencyRecords(),
    })
    const serializedLogs = logs.join('')
    for (const secret of [
      bootstrapToken,
      password,
      cookie,
    ]) {
      expect(response.body).not.toContain(secret)
      expect(serializedLogs).not.toContain(secret)
      expect(durable).not.toContain(secret)
    }
    expect(response.body).not.toContain(key)
    expect(serializedLogs).not.toContain(key)
    const bootstrapAudit = logs
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .filter(entry => String(entry.event ?? '').startsWith('bootstrap.'))
    const serializedAudit = JSON.stringify(bootstrapAudit)
    expect(serializedAudit).not.toContain('workmesh-bootstrap-integration')
    expect(serializedAudit).not.toContain('198.51.100.10')
  })
})
