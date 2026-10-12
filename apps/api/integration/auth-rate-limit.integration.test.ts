import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, applyMigrations, tokenHash } from '@workmesh/db';
import { agentConnectionErrorResponseSchema, agentConnectionSupportedClients } from '@workmesh/contracts';
import { loadFeatureConfig } from '@workmesh/config';
import { buildApp } from '../src/server.js';
import { AuthRateLimiter, type AuthRateLimitAdmission } from '../src/auth-rate-limit/limiter.js';
import type { AuthRateLimitStore } from '../src/auth-rate-limit/redis-store.js';
import Fastify from "fastify";
import { loadConfig } from "@workmesh/config";
import {
  AuthRateLimitedError,
} from "../src/auth-rate-limit/limiter.js";
import { installAuthRateLimit } from "../src/auth-rate-limit/plugin.js";
import { RedisAuthRateLimitStore } from "../src/auth-rate-limit/redis-store.js";

if (process.env.RUN_INTEGRATION !== "1" || !process.env.REDIS_URL) {
  throw new Error(
    "Authentication rate-limit integration requires RUN_INTEGRATION=1 and REDIS_URL.",
  );
}

const unique = `${process.pid}-${Date.now()}`;
const config = loadConfig({
  DATABASE_URL: process.env.DATABASE_URL!,
  REDIS_URL: process.env.REDIS_URL,
  SESSION_SECRET: `auth-rate-limit-integration-${unique}-secret-padding`,
  WORKMESH_BOOTSTRAP_TOKEN: process.env.WORKMESH_BOOTSTRAP_TOKEN ?? randomBytes(32).toString("base64url"),
  AUTH_RATE_LIMIT_HMAC_KEY: `auth-rate-limit-integration-${unique}-hmac-padding`,
  AUTH_RATE_LIMIT_REDIS_PREFIX: `authrl:test:auth-rate-limit:${unique}`,
  AUTH_RATE_LIMIT_ENDPOINT_BURST: "5",
  AUTH_RATE_LIMIT_SOCKET_BURST: "5",
  AUTH_RATE_LIMIT_CLIENT_IP_BURST: "5",
  AUTH_RATE_LIMIT_SUBJECT_BURST: "5",
  AUTH_RATE_LIMIT_REFILL_MS: "60000",
  AUTH_RATE_LIMIT_BACKOFF_BASE_MS: "250",
  AUTH_RATE_LIMIT_BACKOFF_MAX_MS: "800",
});
const firstStore = new RedisAuthRateLimitStore(config.REDIS_URL, 1_000, 1_000);
const secondStore = new RedisAuthRateLimitStore(config.REDIS_URL, 1_000, 1_000);
const firstApp = Fastify({ logger: false });
const secondApp = Fastify({ logger: false });
const first = installAuthRateLimit(firstApp, config, firstStore).limiter;
const second = installAuthRateLimit(secondApp, config, secondStore).limiter;
for (const app of [firstApp, secondApp]) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthRateLimitedError) {
      const retryAfter = Math.max(1, Math.ceil(error.retryAfterMs / 1_000));
      return reply
        .header("Retry-After", String(retryAfter))
        .code(429)
        .send({ error: { code: "AUTH_RATE_LIMITED" } });
    }
    throw error;
  });
  app.post("/api/v1/auth/login", async () => ({ authenticated: true }));
}
const base = {
  endpointClass: "login" as const,
  operationId: `login-${unique}`,
  socketPeer: `192.0.2.${(process.pid % 200) + 1}`,
  clientIp: `198.51.100.${(process.pid % 200) + 1}`,
  subject: `user-${unique}@example.test`,
};

afterAll(async () => {
  await Promise.all([firstApp.close(), secondApp.close()]);
});

describe("shared Redis authentication rate limiter", () => {
  it("atomically admits one shared budget across two Fastify API instances under 20-way concurrency", async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 ? firstApp : secondApp).inject({
          method: "POST",
          url: "/api/v1/auth/login",
          remoteAddress: base.clientIp,
          payload: {
            email: base.subject,
            password: "not-evaluated-by-test-handler",
          },
        }),
      ),
    );
    expect(responses.filter((response) => response.statusCode === 200))
      .toHaveLength(5);
    const denied = responses.filter((response) => response.statusCode === 429);
    expect(denied).toHaveLength(15);
    expect(denied.every((response) =>
      response.json<{ error: { code: string } }>().error.code ===
        "AUTH_RATE_LIMITED")).toBe(true);
    expect(new Set(denied.map((response) => response.headers["retry-after"])))
      .toHaveLength(1);
  });

  it("applies progressive failure backoff and clears only the exact success state", async () => {
    const other = {
      ...base,
      operationId: `${base.operationId}-backoff`,
      socketPeer: "192.0.2.240",
      clientIp: "198.51.100.240",
      subject: `other-${base.subject}`,
    };
    const firstDelay = await first.credentialFailure(other);
    const secondDelay = await second.credentialFailure(other);
    expect(firstDelay).toBe(250);
    expect(secondDelay).toBe(500);
    await expect(first.admit(other)).rejects.toMatchObject({
      retryAfterMs: expect.any(Number),
    });
    await first.credentialSuccess(other);
    await expect(first.admit(other)).resolves.toBeUndefined();
  });

  it("admits naturally after the configured Redis failure backoff expires", async () => {
    const expiring = {
      ...base,
      operationId: `${base.operationId}-natural-expiry`,
      socketPeer: "192.0.2.241",
      clientIp: "198.51.100.241",
      subject: `natural-expiry-${base.subject}`,
    };
    const backoffMs = await first.credentialFailure(expiring);
    expect(backoffMs).toBe(250);

    const immediate = await first.admit(expiring).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(immediate).toBeInstanceOf(AuthRateLimitedError);
    expect((immediate as AuthRateLimitedError).retryAfterMs)
      .toBeGreaterThan(0);
    expect((immediate as AuthRateLimitedError).retryAfterMs)
      .toBeLessThanOrEqual(backoffMs);

    await new Promise((resolve) => setTimeout(resolve, backoffMs + 75));
    await expect(first.admit(expiring)).resolves.toBeUndefined();
  });
});


// 测试只替换 Redis TIME；所有预算与原子操作仍由真实 Redis 执行。
class B3ClockStore implements AuthRateLimitStore {
  now = 1_000_000
  offline = false
  readonly redis = new RedisAuthRateLimitStore(process.env.REDIS_URL!, 1_000, 1_000)
  async eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown> {
    if (this.offline) throw new Error('B3 owned store offline fixture')
    const marker = "local nowParts = redis.call('TIME')"
    const occurrences = script.split(marker).length - 1
    expect(occurrences).toBeLessThanOrEqual(1)
    if (script.includes('local now =')) expect(occurrences).toBe(1)
    return this.redis.eval(script.replace(marker, `local nowParts = {${Math.floor(this.now / 1000)}, ${(this.now % 1000) * 1000}}`), options)
  }
  set(key: string, value: string, options: { NX: true; EX: number }) { return this.redis.set(key, value, options) }
  close() { return this.redis.close() }
}

describe('B3 固定时钟与接入恢复', () => {
  const stores: B3ClockStore[] = []
  const store = () => { const result = new B3ClockStore(); stores.push(result); return result }
  const pair = (dimension?: 'ENDPOINT' | 'SUBJECT' | 'CLIENT_IP' | 'SOCKET') => {
    const clock = store()
    const other = store()
    const settings = loadConfig({ ...process.env, AUTH_RATE_LIMIT_REDIS_PREFIX: `authrl:test:b3:${randomUUID()}`,
      AUTH_RATE_LIMIT_ENDPOINT_BURST: dimension === 'ENDPOINT' ? '5' : '100',
      AUTH_RATE_LIMIT_SUBJECT_BURST: dimension === 'SUBJECT' ? '5' : '100',
      AUTH_RATE_LIMIT_CLIENT_IP_BURST: dimension === 'CLIENT_IP' ? '1' : '100',
      AUTH_RATE_LIMIT_SOCKET_BURST: dimension === 'SOCKET' ? '1' : '100',
      AUTH_RATE_LIMIT_REFILL_MS: '60000', AUTH_RATE_LIMIT_BACKOFF_BASE_MS: '250', AUTH_RATE_LIMIT_BACKOFF_MAX_MS: '800',
    })
    const a: AuthRateLimitAdmission = { endpointClass: 'pairing', operationId: 'redeemAgentConnection', socketPeer: '192.0.2.61', clientIp: '198.51.100.61', subject: 'same-subject' }
    const b = { ...a, operationId: 'redeemAgentEnrollment' }
    return { clock, other, first: new AuthRateLimiter(clock, settings), second: new AuthRateLimiter(other, settings), a, b }
  }
  const db = createDb(process.env.DATABASE_URL!)
  const apiStore = store()
  const app = buildApp({ features: loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'true' }), logger: false, authRateLimitStore: apiStore })
  let cookie = '', csrf = '', teamId = ''
  const human = (url: string, payload: object) => app.inject({ method: 'POST', url, payload, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID() } })
  const createPairing = async () => {
    const slug = `b3-${randomUUID()}`
    const result = await human('/api/v1/agent-connections', { name: 'B3 配对夹具', agentSlug: slug, clientType: 'codex', teamId, requestedCapabilities: ['work:read'], grantAgentDelegate: false })
    expect(result.statusCode).toBe(201)
    const created = result.json<{ connection: { id: string }; connect_url: string }>()
    const code = new URL(created.connect_url).hash.slice(1)
    return { id: created.connection.id, code, body: { pairingCode: code, agentSlug: slug, client: { type: 'codex', version: 'test' } } }
  }
  const redeem = (body: object, key = randomUUID()) => app.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem', payload: body, headers: { 'idempotency-key': key } })
  const attempts = async (code: string) => (await db.query<{ attempts: number }>('SELECT attempts FROM agent_connection_pairings WHERE code_hash=$1', [tokenHash(code)])).rows[0]!.attempts
  const assertError = (response: { statusCode: number; json: () => unknown; body: string }, code: string, forbidden: string[] = []) => {
    const parsed = agentConnectionErrorResponseSchema.parse(response.json())
    expect(parsed.error.code).toBe(code)
    expect(forbidden.some(secret => response.body.includes(secret))).toBe(false)
    return parsed.error
  }
  beforeAll(async () => {
    if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(process.env.DATABASE_URL!).pathname.slice(1))) throw new Error('B3 requires dedicated test database')
    await applyMigrations(db); await db.query('TRUNCATE auth_idempotency_records,workspaces CASCADE')
    const installed = await app.inject({ method: 'POST', url: '/api/v1/auth/install', headers: { 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN!, 'idempotency-key': randomUUID() }, payload: { name: 'B3 接入恢复', slug: 'b3-ingress', adminName: 'B3 Human', email: 'b3@example.test', password: 'b3-integration-password' } })
    expect(installed.statusCode).toBe(200)
    const setCookie = installed.headers['set-cookie']; cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0] ?? ''
    csrf = installed.json<{ csrfToken: string }>().csrfToken
    teamId = (await app.inject({ method: 'GET', url: '/api/v1/teams', headers: { cookie } })).json<{ items: Array<{ id: string }> }>().items[0]!.id
  })
  afterAll(async () => { await app.close(); await Promise.all(stores.map(value => value.close())); await db.end() })

  it.each(['ENDPOINT', 'SUBJECT'] as const)('B3 %s 桶按 operationId 隔离', async dimension => {
    const { first, second, a, b } = pair(dimension)
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).admit(a).then(() => true, () => false)))
    expect(results.filter(Boolean)).toHaveLength(5)
    await expect(first.admit(a)).rejects.toBeInstanceOf(AuthRateLimitedError)
    await expect(second.admit(b)).resolves.toBeUndefined()
  })
  it('B3 失败退避按 operationId 隔离', async () => {
    const { first, second, a, b, clock, other } = pair()
    expect(await first.credentialFailure(a)).toBe(250)
    await expect(second.admit(a)).rejects.toBeInstanceOf(AuthRateLimitedError)
    await expect(second.admit(b)).resolves.toBeUndefined()
    expect(await second.credentialFailure(b)).toBe(250)
    await first.credentialSuccess(a)
    await expect(first.admit(a)).resolves.toBeUndefined()
    await expect(first.admit(b)).rejects.toBeInstanceOf(AuthRateLimitedError)
    clock.now += 250; other.now += 250
    await expect(second.admit(b)).resolves.toBeUndefined()
  })
  it.each(['CLIENT_IP', 'SOCKET'] as const)('B3 %s 桶同时限制两种兑换', async dimension => {
    const { first, second, a, b } = pair(dimension)
    if (dimension === 'CLIENT_IP') b.socketPeer = '192.0.2.62'
    else b.clientIp = '198.51.100.62'
    const results = await Promise.all([first.admit(a), second.admit(b)].map(attempt => attempt.then(() => true, () => false)))
    expect(results.filter(Boolean)).toHaveLength(1)
    await expect(second.admit(b)).rejects.toBeInstanceOf(AuthRateLimitedError)
    await expect(first.admit(a)).rejects.toBeInstanceOf(AuthRateLimitedError)
  })
  it.each(['wrong code', 'wrong slug', 'known wrong type', 'invalid enum'] as const)('B3 %s 分别核 attempts', async variant => {
    const fixture = await createPairing()
    const body = { ...fixture.body, client: { ...fixture.body.client } }
    if (variant === 'wrong code') body.pairingCode = 'wmp_' + 'z'.repeat(43)
    if (variant === 'wrong slug') body.agentSlug = 'known-wrong-slug'
    if (variant === 'known wrong type') body.client.type = 'pi'
    if (variant === 'invalid enum') body.client.type = 'wmi_' + 'x'.repeat(43)
    const result = await redeem(body)
    const error = assertError(result, variant === 'wrong code' ? 'AGENT_CONNECTION_PAIRING_INVALID' : variant === 'invalid enum' ? 'VALIDATION_ERROR' : 'AGENT_CONNECTION_CLIENT_TYPE_MISMATCH', [fixture.code, body.client.type.startsWith('wmi_') ? body.client.type : fixture.code])
    expect(await attempts(fixture.code)).toBe(['wrong slug', 'known wrong type'].includes(variant) ? 1 : 0)
    if (variant === 'wrong slug') expect(error.next_action).toContain('不能修复')
    if (variant === 'known wrong type') expect(error.supported_clients).toEqual(agentConnectionSupportedClients)
  })
  it('B3 第八次身份猜测后锁定，后续拒绝不再增加 attempts', async () => {
    const fixture = await createPairing()
    for (let count = 1; count <= 8; count++) {
      assertError(await redeem({ ...fixture.body, agentSlug: 'known-wrong-slug' }), 'AGENT_CONNECTION_CLIENT_TYPE_MISMATCH')
      expect(await attempts(fixture.code)).toBe(count)
    }
    expect((await redeem(fixture.body)).statusCode).toBe(423)
    assertError(await redeem(fixture.body), 'AGENT_CONNECTION_PAIRING_LOCKED')
    expect(await attempts(fixture.code)).toBe(8)
  })
  it('B3 同时猜错 slug 和类型先报告 slug 且只增加一次 attempts', async () => {
    const fixture = await createPairing()
    const error = assertError(await redeem({ ...fixture.body, agentSlug: 'known-wrong-slug', client: { type: 'pi', version: 'test' } }), 'AGENT_CONNECTION_CLIENT_TYPE_MISMATCH', [fixture.code])
    expect(error.details).toEqual({ reason: 'agent_slug_mismatch' })
    expect(error.next_action).toContain('supported_clients 不能修复它')
    expect(error.supported_clients).toEqual(agentConnectionSupportedClients)
    expect(await attempts(fixture.code)).toBe(1)
  })
  it('B3 接入错误逐码提供双恢复指令', async () => {
    const fixture = await createPairing()
    assertError(await app.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem', payload: fixture.body }), 'IDEMPOTENCY_KEY_REQUIRED')
    assertError(await app.inject({ method: 'GET', url: '/api/v1/agent-connections/current-identity' }), 'UNAUTHENTICATED')
    await db.query("UPDATE agent_connection_pairings SET expires_at=now()-interval '1 second' WHERE code_hash=$1", [tokenHash(fixture.code)])
    expect((await redeem(fixture.body)).statusCode).toBe(410)
    assertError(await redeem(fixture.body), 'AGENT_CONNECTION_PAIRING_EXPIRED', [fixture.code])
    const consumed = await createPairing(); const key = randomUUID()
    expect((await redeem(consumed.body, key)).statusCode).toBe(200)
    assertError(await redeem(consumed.body), 'AGENT_CONNECTION_PAIRING_CONSUMED', [consumed.code])
    assertError(await redeem({ ...consumed.body, agentSlug: 'wrong-slug' }, key), 'IDEMPOTENCY_KEY_REUSED')
    const revoked = await createPairing()
    await db.query("UPDATE agent_connections SET status='revoked',revoked_at=now() WHERE id=$1", [revoked.id])
    assertError(await redeem(revoked.body), 'AGENT_CONNECTION_REVOKED')
    const disabled = buildApp({ logger: false, features: loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'false' }), authRateLimitStore: store() })
    try { assertError(await disabled.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem', payload: fixture.body, headers: { 'idempotency-key': randomUUID() } }), 'FEATURE_DISABLED') }
    finally { await disabled.close() }
    const policy = await human('/api/v1/agent-enrollment-policies', { name: 'B3 policy', teamId, allowedClientTypes: ['codex'], capabilityCeiling: ['work:read'], grantAgentDelegate: false, expiresAt: new Date(Date.now()+60_000).toISOString(), maxUses: 2 })
    expect(policy.statusCode).toBe(201)
    const enrollment = policy.json<{ policy: { id: string }; enrollment_token: string }>()
    const body = { enrollmentToken: enrollment.enrollment_token, name: 'B3 enrollment', slug: `b3-enroll-${randomUUID()}`, client: { type: 'pi', version: 'test' }, manifest: {}, requestedCapabilities: ['work:read'] }
    const enroll = (payload: object) => app.inject({ method: 'POST', url: '/api/v1/agent-enrollments/redeem', payload, headers: { 'idempotency-key': randomUUID() } })
    const mismatch = assertError(await enroll(body), 'AGENT_CONNECTION_CLIENT_TYPE_MISMATCH', [enrollment.enrollment_token])
    expect(mismatch.next_action).toContain('不表示当前 policy 允许')
    assertError(await enroll({ ...body, enrollmentToken: 'wme_'+'z'.repeat(43) }), 'AGENT_ENROLLMENT_POLICY_INVALID')
    assertError(await enroll({ ...body, client: { type: 'codex', version: 'test' }, requestedCapabilities: ['work:write'] }), 'CAPABILITY_DENIED')
    for (const [sql, code] of [
      ["UPDATE agent_enrollment_policies SET redemption_count=max_redemptions WHERE id=$1", 'AGENT_ENROLLMENT_POLICY_EXHAUSTED'],
      ["UPDATE agent_enrollment_policies SET redemption_count=0,expires_at=now()-interval '1 second' WHERE id=$1", 'AGENT_ENROLLMENT_POLICY_EXPIRED'],
      ["UPDATE agent_enrollment_policies SET status='revoked',revoked_at=now() WHERE id=$1", 'AGENT_ENROLLMENT_POLICY_REVOKED'],
    ]) { await db.query(sql!, [enrollment.policy.id]); assertError(await enroll(body), code!) }
  })
  it('B3 429 保留 Retry-After 与恢复指令，store 故障失败关闭且无兑换副作用', async () => {
    const fixture = await createPairing()
    const facts = async () => (await db.query('SELECT (SELECT count(*) FROM auth_idempotency_records) AS receipts,(SELECT count(*) FROM agent_connection_credentials) AS credentials,(SELECT count(*) FROM domain_events) AS events,(SELECT count(*) FROM outbox_events) AS outbox')).rows[0]
    const before = await facts()
    const settings = loadConfig({ ...process.env })
    const seeder = new AuthRateLimiter(apiStore, { ...settings, AUTH_RATE_LIMIT_ENDPOINT_BURST: 1 })
    await seeder.admit({ endpointClass: 'pairing', operationId: 'redeemAgentConnection', socketPeer: '192.0.2.99', clientIp: '198.51.100.99', subject: 'owned-seed' })
    const limited = await redeem(fixture.body)
    expect(limited.statusCode).toBe(429)
    const seconds = String(Math.ceil(settings.AUTH_RATE_LIMIT_REFILL_MS/1000))
    expect(limited.headers['retry-after']).toBe(seconds)
    expect(limited.headers['ratelimit-reset']).toBe(seconds)
    expect(limited.headers['ratelimit-remaining']).toBe('0')
    assertError(limited, 'AUTH_RATE_LIMITED', [fixture.code])
    expect(await facts()).toEqual(before)
    apiStore.now += settings.AUTH_RATE_LIMIT_REFILL_MS
    apiStore.offline = true
    try {
      const unavailable = await redeem(fixture.body)
      expect(unavailable.statusCode).toBe(503); expect(unavailable.headers['retry-after']).toBe('1')
      assertError(unavailable, 'AUTH_RATE_LIMIT_UNAVAILABLE', [fixture.code])
      expect(await facts()).toEqual(before); expect(await attempts(fixture.code)).toBe(0)
    } finally { apiStore.offline = false }
  })
})
