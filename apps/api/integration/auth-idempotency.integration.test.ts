import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  applyMigrations,
  createDb,
  tokenHash,
} from '@workmesh/db'
import { authIdempotentTransaction } from '../src/auth-idempotency.js'
import { seedAgentSessionExchangeToken } from './agent-session-test-credentials.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl)
  throw new Error('API integration tests require RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('API integration tests require DATABASE_URL to name a dedicated test database.')

const authRateLimitTestEnvironment = {
  WORKMESH_BOOTSTRAP_TOKEN: randomBytes(32).toString('base64url'),
  AUTH_RATE_LIMIT_REDIS_PREFIX: `authrl:test:auth-idempotency:${process.pid}:${randomUUID()}`,
  AUTH_RATE_LIMIT_ENDPOINT_BURST: '10000',
  AUTH_RATE_LIMIT_SOCKET_BURST: '10000',
  AUTH_RATE_LIMIT_CLIENT_IP_BURST: '10000',
  AUTH_RATE_LIMIT_SUBJECT_BURST: '1000',
  AUTH_RATE_LIMIT_INSTALL_BURST: '100',
  AUTH_RATE_LIMIT_BACKOFF_BASE_MS: '60000',
  AUTH_RATE_LIMIT_BACKOFF_MAX_MS: '60000',
} as const
const previousAuthRateLimitEnvironment = new Map(
  Object.keys(authRateLimitTestEnvironment).map(name => [name, process.env[name]]),
)
for (const [name, value] of Object.entries(authRateLimitTestEnvironment))
  process.env[name] = value
const { buildApp } = await import('../src/server.js')
const db = createDb(databaseUrl)
const capturedLogs: string[] = []
const app = buildApp({
  logger: {
    level: 'info',
    stream: { write: (message: string) => capturedLogs.push(message) },
  },
})
const password = 'auth-idempotency-password-sentinel'
const defaultClient = {
  origin: 'https://workmesh.example.test',
  'user-agent': 'workmesh-auth-idempotency-test',
}

const idempotencyHeaders = (key: string, extra: Record<string, string> = {}) => ({
  'idempotency-key': key,
  ...defaultClient,
  ...extra,
})
const cookieFrom = (response: { headers: Record<string, string | string[] | number | undefined> }): string => {
  const raw = response.headers['set-cookie']
  const value = Array.isArray(raw) ? raw[0] : raw
  return String(value ?? '').split(';')[0] ?? ''
}

let workspaceId = ''
let actorId = ''
let teamId = ''
let loginCookie = ''
let loginCsrf = ''
let agentSessionId = ''
let exchangeToken = ''
let installationToken = ''
let issuedSessionToken = ''
let refreshedSessionToken = ''
let registeredInstallationToken = ''
let rotatedWebhookSecret = ''
let appUrl = ''

describe('secret-aware authentication idempotency', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE auth_idempotency_records,workspaces CASCADE')
    appUrl = await app.listen({ port: 0, host: '127.0.0.1' })
  }, 300_000)

  afterAll(async () => {
    await app.close()
    await db.end()
    for (const [name, value] of previousAuthRateLimitEnvironment) {
      if (value === undefined)
        delete process.env[name]
      else
        process.env[name] = value
    }
  })

  it('atomically installs once under concurrent duplicate requests and replays the same cookie', async () => {
    const payload = {
      name: 'Auth acceptance',
      slug: 'auth-acceptance',
      adminName: 'Alice',
      email: 'Alice@Example.Test',
      password,
    }
    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/auth/install', payload, headers: idempotencyHeaders('install-once', { 'x-workmesh-bootstrap-token': authRateLimitTestEnvironment.WORKMESH_BOOTSTRAP_TOKEN }) }),
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/install',
        payload: { ...payload, email: payload.email.toLowerCase() },
        headers: idempotencyHeaders('install-once', { 'x-workmesh-bootstrap-token': authRateLimitTestEnvironment.WORKMESH_BOOTSTRAP_TOKEN }),
      }),
    ])

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(first.json()).toEqual(second.json())
    expect(cookieFrom(first)).toBe(cookieFrom(second))
    expect((await db.query('SELECT 1 FROM workspaces')).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM actors WHERE kind='human'")).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM domain_events WHERE event_type='workspace.installed'")).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM domain_events WHERE event_type='auth.session.created'")).rowCount).toBe(1)
    expect((await db.query('SELECT 1 FROM sessions')).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM api_idempotency_keys WHERE response_body::text ILIKE '%csrf%'")).rowCount).toBe(0)

    const installation = (await db.query<{ workspace_id: string }>('SELECT workspace_id FROM platform_installation')).rows[0]!
    workspaceId = installation.workspace_id
    actorId = (await db.query<{ id: string }>("SELECT id FROM actors WHERE kind='human'")).rows[0]!.id
    teamId = (await db.query<{ id: string }>('SELECT id FROM teams WHERE workspace_id=$1', [workspaceId])).rows[0]!.id
    const record = (await db.query<Record<string, unknown>>('SELECT * FROM auth_idempotency_records WHERE operation=$1', ['installWorkspace'])).rows[0]!
    expect(record.key_fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(record.subject_fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(record.request_fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(record.client_context_fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(record).not.toHaveProperty('response_body')
  })

  it('binds one authentication Idempotency-Key to exactly one subject, including concurrent claims', async () => {
    const invoke = (key: string, subject: string) => authIdempotentTransaction(db, {
      idempotencyKey: key,
      subject,
      operation: 'authSubjectBindingAcceptance',
      request: { subject },
      clientContext: { client: 'integration' },
    }, async () => ({ status: 200, body: { token: `secret-for-${subject}` } }))

    const sequentialKey = `subject-sequential-${randomUUID()}`
    await expect(invoke(sequentialKey, 'subject-a')).resolves.toMatchObject({ status: 200 })
    await expect(invoke(sequentialKey, 'subject-b')).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })

    const concurrentKey = `subject-concurrent-${randomUUID()}`
    const concurrent = await Promise.allSettled([
      invoke(concurrentKey, 'subject-c'),
      invoke(concurrentKey, 'subject-d'),
    ])
    expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = concurrent.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
  })

  it('replays login exactly and conflicts on a changed client context without another session', async () => {
    const payload = { email: 'ALICE@example.test', password }
    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload, headers: idempotencyHeaders('login-replay') })
    const second = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload, headers: idempotencyHeaders('login-replay') })
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(first.json()).toEqual(second.json())
    expect(cookieFrom(first)).toBe(cookieFrom(second))
    loginCookie = cookieFrom(first)
    loginCsrf = first.json<{ csrfToken: string }>().csrfToken

    const before = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM sessions')).rows[0]!.count
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload,
      headers: idempotencyHeaders('login-replay', { origin: 'https://other-client.example.test' }),
    })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json<{ error: { code: string } }>().error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM sessions')).rows[0]!.count).toBe(before)
  })
  it('makes unknown-email and wrong-password failures indistinguishable and side-effect free', async () => {
    const before = {
      sessions: (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM sessions')).rows[0]!.count,
      events: (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM domain_events')).rows[0]!.count,
      outbox: (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM outbox_events')).rows[0]!.count,
      authIdempotency: (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM auth_idempotency_records')).rows[0]!.count,
      denials: (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM authorization_denials')).rows[0]!.count,
    }
    const failedCredentialRemoteAddress = '198.51.100.253'
    const wrong = await app.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress: failedCredentialRemoteAddress, payload: { email: 'alice@example.test', password: 'definitely-wrong-password' }, headers: idempotencyHeaders('wrong-password') })
    const unknown = await app.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress: failedCredentialRemoteAddress, payload: { email: 'unknown@example.test', password: 'definitely-wrong-password' }, headers: idempotencyHeaders('unknown-email') })
    expect(unknown.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(wrong.statusCode)
    expect(unknown.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } })
    expect(wrong.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } })
    expect(unknown.headers['retry-after']).toBe(wrong.headers['retry-after'])
    expect({
      sessions: (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM sessions')).rows[0]!.count,
      events: (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM domain_events')).rows[0]!.count,
      outbox: (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM outbox_events')).rows[0]!.count,
      authIdempotency: (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM auth_idempotency_records')).rows[0]!.count,
      denials: (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM authorization_denials')).rows[0]!.count,
    }).toEqual(before)
  })

  it('rolls back a precommit claim and business writes, then permits the retry', async () => {
    const beforeRecords = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM auth_idempotency_records')).rows[0]!.count
    const beforeSessions = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM sessions')).rows[0]!.count
    const input = {
      idempotencyKey: 'rollback-claim',
      subject: `human-session:rollback-${actorId}`,
      operation: 'testRollback',
      request: { action: 'create-session' },
      clientContext: defaultClient,
    }
    await expect(authIdempotentTransaction(db, input, async tx => {
      await tx.query("INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at) VALUES($1,$2,'rollback-csrf',now()+interval '1 hour')", [actorId, tokenHash(randomUUID())])
      throw new Error('forced-precommit-failure')
    })).rejects.toThrow('forced-precommit-failure')
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM auth_idempotency_records')).rows[0]!.count).toBe(beforeRecords)
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM sessions')).rows[0]!.count).toBe(beforeSessions)

    await expect(authIdempotentTransaction(db, input, async () => ({ status: 200, body: { ok: true } })))
      .resolves.toMatchObject({ body: { ok: true } })
  })

  it('replays Agent registration and webhook-secret rotation without generic plaintext replay', async () => {
    const registration = {
      name: 'Registered Secret Agent',
      slug: `registered-secret-${randomUUID()}`,
      provider: 'acceptance',
      version: '1.0.0',
      supportedProtocols: ['native_http'],
      requestedCapabilities: ['work:read'],
      approvedCapabilities: ['work:read'],
      outputArtifactTypes: [],
      maxConcurrency: 1,
      heartbeatIntervalSeconds: 30,
    }
    const registerHeaders = idempotencyHeaders('register-agent-secret', {
      cookie: loginCookie,
      'x-csrf-token': loginCsrf,
    })
    const [firstRegistration, secondRegistration] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/agents/register', payload: registration, headers: registerHeaders }),
      app.inject({ method: 'POST', url: '/api/v1/agents/register', payload: registration, headers: registerHeaders }),
    ])
    expect(firstRegistration.statusCode).toBe(200)
    expect(secondRegistration.statusCode).toBe(200)
    expect(firstRegistration.json()).toEqual(secondRegistration.json())
    const registered = firstRegistration.json<{ id: string; installation_token: string }>()
    registeredInstallationToken = registered.installation_token
    expect((await db.query('SELECT 1 FROM agent_definitions WHERE id=$1', [registered.id])).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM api_idempotency_keys WHERE idempotency_key='register-agent-secret'")).rowCount).toBe(0)

    const changedRegistration = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/register',
      payload: { ...registration, name: 'Changed Agent Name' },
      headers: registerHeaders,
    })
    expect(changedRegistration.statusCode).toBe(409)
    expect(changedRegistration.json<{ error: { code: string } }>().error.code).toBe('IDEMPOTENCY_KEY_REUSED')

    process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS = 'true'
    let endpointId = ''
    try {
      const endpoint = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${registered.id}/webhook-endpoints`,
        payload: { url: 'http://127.0.0.2:9999/secret-replay' },
        headers: idempotencyHeaders('create-secret-endpoint', {
          cookie: loginCookie,
          'x-csrf-token': loginCsrf,
        }),
      })
      expect(endpoint.statusCode).toBe(200)
      endpointId = endpoint.json<{ id: string }>().id
    } finally {
      delete process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS
    }
    const revision = (await db.query<{ revision: number }>(
      'SELECT revision FROM agent_definitions WHERE id=$1',
      [registered.id],
    )).rows[0]!.revision
    const rotateHeaders = idempotencyHeaders('rotate-webhook-secret', {
      cookie: loginCookie,
      'x-csrf-token': loginCsrf,
      'if-match': `"revision-${revision}"`,
    })
    const rotateUrl = `/api/v1/agents/${registered.id}/webhook-endpoints/${endpointId}/rotate-secret`
    const [firstRotation, secondRotation] = await Promise.all([
      app.inject({ method: 'POST', url: rotateUrl, payload: {}, headers: rotateHeaders }),
      app.inject({ method: 'POST', url: rotateUrl, payload: {}, headers: rotateHeaders }),
    ])
    expect(firstRotation.statusCode).toBe(200)
    expect(secondRotation.statusCode).toBe(200)
    expect(firstRotation.json()).toEqual(secondRotation.json())
    rotatedWebhookSecret = firstRotation.json<{ secret: string }>().secret
    expect((await db.query('SELECT 1 FROM agent_webhook_secrets WHERE endpoint_id=$1', [endpointId])).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM api_idempotency_keys WHERE idempotency_key='rotate-webhook-secret'")).rowCount).toBe(0)

    const changedRotation = await app.inject({
      method: 'POST',
      url: rotateUrl,
      payload: {},
      headers: { ...rotateHeaders, 'if-match': `"revision-${revision + 1}"` },
    })
    expect(changedRotation.statusCode).toBe(409)
    expect(changedRotation.json<{ error: { code: string } }>().error.code).toBe('IDEMPOTENCY_KEY_REUSED')
  })

  it('replays atomic assignment without exposing bootstrap credentials or using the generic replay table', async () => {
    const stateId = (await db.query<{ id: string }>("SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog' LIMIT 1", [teamId])).rows[0]!.id
    const workItem = (await db.query<{ id: string; revision: number }>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) VALUES($1,$2,900,'Secret session',$3,$4) RETURNING id,revision", [workspaceId, teamId, stateId, actorId])).rows[0]!
    const itemId = workItem.id
    const agentActorId = (await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Secret Agent') RETURNING id", [workspaceId])).rows[0]!.id
    const agentId = (await db.query<{ id: string }>("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,supported_protocols,requested_capabilities,approved_capabilities,max_concurrency) VALUES($1,$2,'secret-agent','Secret Agent',ARRAY['native_http']::agent_protocol[],ARRAY['work:read','work:write'],ARRAY['work:read','work:write'],2) RETURNING id", [workspaceId, agentActorId])).rows[0]!.id
    await db.query("INSERT INTO agent_team_access(workspace_id,agent_id,team_id,granted_by_actor_id,approved_capabilities) VALUES($1,$2,$3,$4,ARRAY['work:read','work:write'])", [workspaceId, agentId, teamId, actorId])
    installationToken = `installation-${randomUUID()}-sentinel`
    const installationId = (await db.query<{ id: string }>('INSERT INTO agent_installation_tokens(agent_id,token_hash,created_by_actor_id) VALUES($1,$2,$3) RETURNING id', [agentId, tokenHash(installationToken), actorId])).rows[0]!.id
    expect(installationId).toBeTruthy()

    const payload = {
      agentId,
      principalHumanActorId: actorId,
      role: 'executor',
      requestedCapabilities: ['work:read', 'work:write'],
      initialPrompt: 'Run secret-safe acceptance.',
      budget: {},
    }
    const headers = idempotencyHeaders('create-agent-session-secret', {
      cookie: loginCookie,
      'x-csrf-token': loginCsrf,
      'if-match': `"revision-${workItem.revision}"`,
    })
    const url = `/api/v1/work-items/${itemId}/agent-session`
    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url, payload, headers }),
      app.inject({ method: 'POST', url, payload, headers }),
    ])
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(first.json()).toEqual(second.json())
    const response = first.json<{ delegation: { id: string }; session: { id: string } }>()
    agentSessionId = response.session.id
    exchangeToken = await seedAgentSessionExchangeToken(db, agentSessionId, agentId)
    expect(exchangeToken.length).toBeGreaterThan(30)
    expect((await db.query('SELECT 1 FROM agent_sessions WHERE delegation_id=$1', [response.delegation.id])).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM delegations WHERE work_item_id=$1 AND role='executor' AND revoked_at IS NULL", [itemId])).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM api_idempotency_keys WHERE idempotency_key='create-agent-session-secret'")).rowCount).toBe(0)

    const conflict = await app.inject({
      method: 'POST',
      url,
      payload: { ...payload, initialPrompt: 'A different canonical request.' },
      headers,
    })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json<{ error: { code: string } }>().error.code).toBe('IDEMPOTENCY_KEY_REUSED')
  })

  it('replays exchange and refresh tokens without exchanging or rotating twice', async () => {
    const exchangeHeaders = idempotencyHeaders('exchange-once', {
      authorization: `Bearer ${installationToken}`,
    })
    const exchangePayload = { exchangeToken }
    const firstExchange = await app.inject({ method: 'POST', url: `/api/v1/agent-sessions/${agentSessionId}/token/exchange`, payload: exchangePayload, headers: exchangeHeaders })
    const secondExchange = await app.inject({ method: 'POST', url: `/api/v1/agent-sessions/${agentSessionId}/token/exchange`, payload: exchangePayload, headers: exchangeHeaders })
    expect(firstExchange.statusCode).toBe(200)
    expect(secondExchange.statusCode).toBe(200)
    expect(firstExchange.json()).toEqual(secondExchange.json())
    issuedSessionToken = firstExchange.json<{ sessionToken: string }>().sessionToken

    const beforeRefresh = (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM agent_session_tokens WHERE session_id=$1', [agentSessionId])).rows[0]!.count
    const refreshHeaders = idempotencyHeaders('refresh-once', {
      authorization: `Bearer ${installationToken}`,
    })
    const firstRefresh = await app.inject({ method: 'POST', url: `/api/v1/agent-sessions/${agentSessionId}/token/refresh`, payload: {}, headers: refreshHeaders })
    const secondRefresh = await app.inject({ method: 'POST', url: `/api/v1/agent-sessions/${agentSessionId}/token/refresh`, payload: {}, headers: refreshHeaders })
    expect(firstRefresh.statusCode).toBe(200)
    expect(secondRefresh.statusCode).toBe(200)
    expect(firstRefresh.json()).toEqual(secondRefresh.json())
    refreshedSessionToken = firstRefresh.json<{ sessionToken: string }>().sessionToken
    expect(refreshedSessionToken).not.toBe(issuedSessionToken)
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM agent_session_tokens WHERE session_id=$1', [agentSessionId])).rows[0]!.count).toBe(beforeRefresh + 1)
    expect((await db.query("SELECT 1 FROM agent_session_tokens WHERE session_id=$1 AND revoked_at IS NULL", [agentSessionId])).rowCount).toBe(2)
  })

  it('fails closed for expired, tampered, and wrong-key replay without new sessions', async () => {
    const invokeLogin = (key: string) => app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'alice@example.test', password },
      headers: idempotencyHeaders(key),
    })

    const expiredFirst = await invokeLogin('login-expired')
    expect(expiredFirst.statusCode).toBe(200)
    const expiredRecord = (await db.query<{ id: string }>("SELECT id FROM auth_idempotency_records WHERE operation='login' ORDER BY created_at DESC LIMIT 1")).rows[0]!.id
    const sessionsBeforeWipeReplay = (await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM sessions',
    )).rows[0]!.count
    await db.query(
      `UPDATE auth_idempotency_records
          SET replay_expires_at=now()-interval '1 second',response_status=NULL,
              replay_key_id=NULL,replay_key_fingerprint=NULL,replay_iv=NULL,
              replay_tag=NULL,replay_ciphertext=NULL,replay_wiped_at=now()
        WHERE id=$1`,
      [expiredRecord],
    )
    const expired = await invokeLogin('login-expired')
    expect(expired.statusCode).toBe(409)
    expect(expired.json<{ error: { code: string } }>().error.code).toBe('IDEMPOTENCY_REPLAY_EXPIRED')
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM sessions')).rows[0]!.count)
      .toBe(sessionsBeforeWipeReplay)
    expect((await db.query(
      'SELECT 1 FROM auth_idempotency_records WHERE id=$1 AND replay_wiped_at IS NOT NULL AND replay_ciphertext IS NULL',
      [expiredRecord],
    )).rowCount).toBe(1)

    const tamperFirst = await invokeLogin('login-tamper')
    expect(tamperFirst.statusCode).toBe(200)
    const tamperRecord = (await db.query<{ id: string }>("SELECT id FROM auth_idempotency_records WHERE operation='login' ORDER BY created_at DESC LIMIT 1")).rows[0]!.id
    await db.query("UPDATE auth_idempotency_records SET replay_tag=decode(repeat('00',16),'hex') WHERE id=$1", [tamperRecord])
    const tampered = await invokeLogin('login-tamper')
    expect(tampered.statusCode).toBe(409)
    expect(tampered.json<{ error: { code: string } }>().error.code).toBe('IDEMPOTENCY_REPLAY_UNAVAILABLE')

    const wrongKeyFirst = await invokeLogin('login-wrong-key')
    expect(wrongKeyFirst.statusCode).toBe(200)
    const originalMasterKey = process.env.WORKMESH_MASTER_KEY
    process.env.WORKMESH_MASTER_KEY = 'f'.repeat(64)
    try {
      const wrongKey = await invokeLogin('login-wrong-key')
      expect(wrongKey.statusCode).toBe(409)
      expect(wrongKey.json<{ error: { code: string } }>().error.code).toBe('IDEMPOTENCY_REPLAY_UNAVAILABLE')
    } finally {
      process.env.WORKMESH_MASTER_KEY = originalMasterKey
    }
  })

  it('returns pre-header and live CURSOR_EXPIRED controls with exact bigint cursors', async () => {
    const currentCursor = (await db.query<{ cursor: string }>(
      'SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const minimumExactCursor = 9_007_199_254_740_993n
    const seededCursor = (
      BigInt(currentCursor) >= minimumExactCursor
        ? BigInt(currentCursor) + 1n
        : minimumExactCursor
    ).toString()
    await db.query(
      `SELECT setval(
         'domain_events_cursor_seq',
         $1::bigint,
         false
       )`,
      [seededCursor],
    )
    await db.query(
      `INSERT INTO domain_events(
         workspace_id,team_id,event_type,event_version,aggregate_type,
         aggregate_id,aggregate_revision,actor_id,correlation_id,payload
       ) VALUES(
         $1,$2,'realtime.cursor.seeded',2,'team',
         $2,1,$3,$4,'{}'::jsonb
       )`,
      [workspaceId, teamId, actorId, randomUUID()],
    )
    const cursor = (await db.query<{ cursor: string }>(
      'SELECT max(cursor)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    expect(cursor).toBe(seededCursor)
    expect(BigInt(cursor)).toBeGreaterThan(9_007_199_254_740_992n)
    await db.query(
      `UPDATE event_retention_state
       SET pruned_through_cursor=$2,updated_at=now()
       WHERE workspace_id=$1`,
      [workspaceId, cursor],
    )

    try {
      const expired = await fetch(
        `${appUrl}/api/v1/events/stream?cursor=${BigInt(cursor) - 1n}`,
        { headers: { cookie: loginCookie } },
      )
      expect(expired.status).toBe(409)
      await expect(expired.json()).resolves.toMatchObject({
        error: {
          code: 'CURSOR_EXPIRED',
          details: {
            minimumCursor: cursor,
            resyncCursor: cursor,
            resyncRequired: true,
          },
        },
      })

      const controller = new AbortController()
      const stream = await fetch(
        `${appUrl}/api/v1/events/stream?cursor=${cursor}`,
        {
          headers: {
            cookie: loginCookie,
            'last-event-id': cursor,
          },
          signal: controller.signal,
        },
      )
      expect(stream.status).toBe(200)
      const reader = stream.body?.getReader()
      if (!reader) throw new Error('SSE response did not expose a reader')
      const liveFloor = (BigInt(cursor) + 1n).toString()
      await db.query(
        `UPDATE event_retention_state
         SET pruned_through_cursor=$2,updated_at=now()
         WHERE workspace_id=$1`,
        [workspaceId, liveFloor],
      )

      const decoder = new TextDecoder()
      let body = ''
      const expiresAt = Date.now() + 5_000
      while (!body.includes('cursor.expired')) {
        const remaining = expiresAt - Date.now()
        if (remaining <= 0)
          throw new Error('Timed out waiting for cursor.expired control')
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => setTimeout(
            () => reject(
              new Error('Timed out waiting for cursor.expired control'),
            ),
            remaining,
          )),
        ])
        if (chunk.done) break
        body += decoder.decode(chunk.value, { stream: true })
      }
      expect(body).toContain('event: control')
      expect(body).toContain('cursor.expired')
      expect(body).toContain(`"minimumCursor":"${liveFloor}"`)
      await expect(reader.read()).resolves.toMatchObject({ done: true })
      controller.abort()
    } finally {
      await db.query(
        `UPDATE event_retention_state
         SET pruned_through_cursor=0,updated_at=now()
         WHERE workspace_id=$1`,
        [workspaceId],
      )
    }
  }, 30_000)

  it('keeps retention reads read-only under concurrency and rejects partial limits', async () => {
    const stableUpdatedAt = '2001-02-03T04:05:06.000Z'
    await db.query(
      `UPDATE event_retention_state
       SET updated_at=$2::timestamptz
       WHERE workspace_id=$1`,
      [workspaceId, stableUpdatedAt],
    )
    const cursor = (await db.query<{ cursor: string }>(
      `SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events`,
    )).rows[0]!.cursor
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => app.inject({
        method: 'GET',
        url: `/api/v1/events?cursor=${cursor}&limit=1`,
        headers: { cookie: loginCookie },
      })),
    )
    expect(responses.every(response => response.statusCode === 200)).toBe(true)
    const retention = (await db.query<{ updated_at: Date }>(
      `SELECT updated_at FROM event_retention_state WHERE workspace_id=$1`,
      [workspaceId],
    )).rows[0]!
    expect(retention.updated_at.toISOString()).toBe(stableUpdatedAt)

    for (const limit of ['1junk', '1.5'])
      expect((await app.inject({
        method: 'GET',
        url: `/api/v1/events?cursor=${cursor}&limit=${limit}`,
        headers: { cookie: loginCookie },
      })).statusCode).toBe(400)
  })

  it('reclaims only after 24 hours and replays logout after the session is revoked', async () => {
    const loginKey = 'login-reclaim'
    const payload = { email: 'alice@example.test', password }
    const first = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload, headers: idempotencyHeaders(loginKey) })
    expect(first.statusCode).toBe(200)
    const originalRecord = (await db.query<{ id: string }>("SELECT id FROM auth_idempotency_records WHERE operation='login' ORDER BY created_at DESC LIMIT 1")).rows[0]!.id
    await db.query("UPDATE auth_idempotency_records SET replay_expires_at=now()-interval '1 hour',conflict_expires_at=now()-interval '1 second' WHERE id=$1", [originalRecord])
    const reclaimed = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload, headers: idempotencyHeaders(loginKey) })
    expect(reclaimed.statusCode).toBe(200)
    expect(cookieFrom(reclaimed)).not.toBe(cookieFrom(first))
    expect((await db.query('SELECT 1 FROM auth_idempotency_records WHERE id=$1', [originalRecord])).rowCount).toBe(0)

    const logoutHeaders = idempotencyHeaders('logout-replay', {
      cookie: loginCookie,
      'x-csrf-token': loginCsrf,
    })
    const streamCursor = (await db.query<{ cursor: string }>(
      'SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events',
    )).rows[0]!.cursor
    const controller = new AbortController()
    const stream = await fetch(`${appUrl}/api/v1/events/stream?cursor=${streamCursor}`, {
      headers: { cookie: loginCookie },
      signal: controller.signal,
    })
    expect(stream.status).toBe(200)
    const reader = stream.body?.getReader()
    if (!reader) throw new Error('SSE response did not expose a reader')
    const decoder = new TextDecoder()
    let streamed = ''
    const readChunk = (timeoutMs: number): Promise<ReadableStreamReadResult<Uint8Array>> =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for SSE chunk')),
          timeoutMs,
        )
        void reader.read().then(
          chunk => {
            clearTimeout(timeout)
            resolve(chunk)
          },
          error => {
            clearTimeout(timeout)
            reject(error)
          },
        )
      })
    const readUntil = async (
      predicate: () => boolean,
      timeoutMs: number,
    ): Promise<'matched' | 'closed'> => {
      const expiresAt = Date.now() + timeoutMs
      while (!predicate()) {
        const remaining = expiresAt - Date.now()
        if (remaining <= 0) throw new Error('Timed out waiting for SSE evidence')
        const chunk = await readChunk(remaining)
        if (chunk.done) return 'closed'
        streamed += decoder.decode(chunk.value, { stream: true })
      }
      return 'matched'
    }
    const insertProtectedEvent = async (eventType: string, title: string): Promise<void> => {
      await db.query(
        `INSERT INTO domain_events(
           workspace_id,team_id,event_type,aggregate_type,aggregate_id,
           aggregate_revision,actor_id,correlation_id,payload
         ) VALUES($1,$2,$3,'team',$2,1,$4,$5,$6)`,
        [workspaceId, teamId, eventType, actorId, randomUUID(), { title }],
      )
    }
    await insertProtectedEvent('auth.sse.before-logout', 'VISIBLE BEFORE LOGOUT')
    expect(await readUntil(() => streamed.includes('auth.sse.before-logout'), 5_000))
      .toBe('matched')

    const firstLogout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', payload: {}, headers: logoutHeaders })
    expect(firstLogout.statusCode).toBe(200)
    await insertProtectedEvent('auth.sse.after-logout', 'PRIVATE AFTER LOGOUT')
    expect(await readUntil(() => false, 5_000)).toBe('closed')
    expect(streamed).not.toContain('auth.sse.after-logout')
    expect(streamed).not.toContain('PRIVATE AFTER LOGOUT')
    controller.abort()
    await reader.cancel().catch(() => undefined)

    const secondLogout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', payload: {}, headers: logoutHeaders })
    expect(secondLogout.statusCode).toBe(200)
    expect(firstLogout.json()).toEqual({ ok: true })
    expect(secondLogout.json()).toEqual({ ok: true })
    expect((await db.query("SELECT 1 FROM domain_events WHERE event_type='auth.session.deleted'")).rowCount).toBe(1)
    const streamAudit = await db.query<{ reason_code: string; transport: string }>(
      `SELECT reason_code,transport FROM authorization_denials
       WHERE operation_id='streamEvents' ORDER BY occurred_at DESC LIMIT 1`,
    )
    expect(streamAudit.rows[0]).toEqual({
      reason_code: 'UNAUTHENTICATED',
      transport: 'sse',
    })
  })

  it('does not persist plaintext credentials outside the intentional webhook boundary', async () => {
    const sentinels = [
      password,
      installationToken,
      registeredInstallationToken,
      rotatedWebhookSecret,
      exchangeToken,
      issuedSessionToken,
      refreshedSessionToken,
    ]
    const generic = JSON.stringify((await db.query('SELECT operation,request_hash,response_body FROM api_idempotency_keys')).rows)
    const authRecords = JSON.stringify((await db.query("SELECT id,key_fingerprint,subject_fingerprint,operation,request_fingerprint,client_context_fingerprint,replay_key_id,replay_key_fingerprint,encode(replay_iv,'hex') AS iv,encode(replay_tag,'hex') AS tag,encode(replay_ciphertext,'hex') AS ciphertext FROM auth_idempotency_records")).rows)
    const events = JSON.stringify((await db.query('SELECT event_type,correlation_id,idempotency_key,payload FROM domain_events')).rows)
    const outbox = JSON.stringify((await db.query('SELECT topic,partition_key,last_error FROM outbox_events')).rows)
    const logs = capturedLogs.join('')
    for (const sentinel of sentinels) {
      expect(generic).not.toContain(sentinel)
      expect(authRecords).not.toContain(sentinel)
      expect(events).not.toContain(sentinel)
      expect(outbox).not.toContain(sentinel)
      expect(logs).not.toContain(sentinel)
    }
  })
})
