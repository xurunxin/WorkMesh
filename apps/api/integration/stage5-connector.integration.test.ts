import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, tokenHash } from '@workmesh/db'
import { loadFeatureConfig } from '@workmesh/config'
import { agentConnectionResponseSchema, workmeshSkillManifest, type AgentConnectionCreateResponse } from '@workmesh/contracts'
import { connect } from '@workmesh/connector'
import { parseJson, pendingSchema, type Expectation } from '../../connector/src/config.js'
import { readPrivate } from '../../connector/src/platform-security.js'
import { bootstrapMcp } from '../../connector/src/protocol.js'
import { MemoryStore } from '../../connector/test-support/fixture.js'
import { createWorkMeshMcpHttpServer } from '../../mcp/src/http.js'
import { createSessionLifecycleWorker } from '../../worker/src/session-lifecycle.js'

const url = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !url || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(url).pathname.slice(1))) throw new Error('专用测试数据库必需')
const db = createDb(url)
let app: ReturnType<typeof import('../src/server.js')['buildApp']>
let mcp: Server, gateway: Server, origin: string, apiBase: string, mcpBase: string
let cookie = '', csrf = '', teamId = '', principalId = ''
let temp: string
const priorWeb = process.env.WEB_ORIGIN, priorMcp = process.env.PUBLIC_MCP_ORIGIN
const human = (method: 'GET' | 'POST' | 'DELETE', path: string, payload?: object, revision?: number) => app.inject({ method, url: path, payload,
  headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...(revision ? { 'if-match': `"revision-${revision}"` } : {}) } })
const listen = async (server: Server) => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); const a = server.address(); if (!a || typeof a === 'string') throw new Error('测试地址无效'); return `http://127.0.0.1:${a.port}` }
const close = async (server: Server) => { server.close(); server.closeAllConnections(); await once(server, 'close') }
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), 'workmesh-b1-b2-api-'))
  const skill = await readFile(new URL('../../web/public/skills/workmesh-1.1.0.md', import.meta.url))
  gateway = createServer((incoming, outgoing) => {
    if (incoming.url === '/skills/workmesh-1.1.0.md') { outgoing.writeHead(200, { 'Content-Type': 'text/markdown' }); outgoing.end(skill); return }
    const target = new URL(incoming.url!, incoming.url?.startsWith('/mcp') ? mcpBase : apiBase)
    const upstream = httpRequest(target, { method: incoming.method, headers: incoming.headers }, response => {
      outgoing.writeHead(response.statusCode ?? 500, response.headers); response.pipe(outgoing)
    })
    upstream.on('error', () => { outgoing.writeHead(502); outgoing.end() }); incoming.pipe(upstream)
  })
  origin = await listen(gateway)
  process.env.WEB_ORIGIN = origin; process.env.PUBLIC_MCP_ORIGIN = origin
  const { buildApp } = await import('../src/server.js')
  app = buildApp({ features: loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'true' }), logger: false })
  await applyMigrations(db); await db.query('TRUNCATE auth_idempotency_records,workspaces CASCADE')
  await app.listen({ host: '127.0.0.1', port: 0 }); const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('测试地址无效')
  apiBase = `http://127.0.0.1:${address.port}`
  mcp = await createWorkMeshMcpHttpServer({ baseUrl: apiBase, coordination: true, mode: 'read-write', readinessProbe: async () => {} })
  mcpBase = await listen(mcp)
  const install = await app.inject({ method: 'POST', url: '/api/v1/auth/install', payload: {
    name: '连接器验收', slug: 'connector-acceptance', adminName: '管理员', email: 'connector@example.test', password: 'connector-test-only-password',
  }, headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! } })
  expect(install.statusCode).toBe(200)
  const cookies = install.headers['set-cookie']; cookie = (Array.isArray(cookies) ? cookies[0] : cookies)?.split(';')[0] ?? ''
  csrf = install.json<{ csrfToken: string }>().csrfToken
  principalId = (await human('GET', '/api/v1/auth/me')).json<{ actor: { id: string } }>().actor.id
  teamId = (await human('GET', '/api/v1/teams')).json<{ items: { id: string }[] }>().items[0]!.id
}, 300_000)
afterAll(async () => {
  if (gateway) await close(gateway)
  if (mcp) await close(mcp)
  if (app) await app.close()
  await db.end()
  if (temp) await rm(temp, { recursive: true, force: true })
  if (priorWeb === undefined) delete process.env.WEB_ORIGIN; else process.env.WEB_ORIGIN = priorWeb
  if (priorMcp === undefined) delete process.env.PUBLIC_MCP_ORIGIN; else process.env.PUBLIC_MCP_ORIGIN = priorMcp
})
async function envelope() {
  const slug = `connector-${randomUUID().slice(0, 8)}`
  const response = await human('POST', '/api/v1/agent-connections', {
    name: '连接器验收', agentSlug: slug, clientType: 'codex', teamId, principalHumanActorId: principalId,
    requestedCapabilities: ['work:read', 'work:write'], grantAgentDelegate: false,
  })
  expect(response.statusCode).toBe(201)
  // 此 HTTP loopback 夹具不生成正式 HTTPS handoff；连接器只接收原始配对码。
  const created = response.json<AgentConnectionCreateResponse>()
  const c = agentConnectionResponseSchema.parse(created.connection)
  const e: Expectation = {
    deploymentUrl: origin, discoveryUrl: origin + '/.well-known/workmesh-agent', redeemUrl: origin + '/api/v1/agent-connections/redeem',
    mcpUrl: origin + '/mcp', skillUrl: origin + '/skills/workmesh-1.1.0.md', workspaceId: c.workspace_id, connectionId: c.id,
    agentActorId: c.agent_actor_id, teamId, principalHumanActorId: principalId, agentSlug: slug, client: { type: 'codex', version: '1.1.0' }, profileVersion: '1.0',
    capabilities: c.requested_capabilities, requestedCapabilities: c.requested_capabilities, grantAgentDelegate: false, skill: { ...workmeshSkillManifest },
  }
  return { e, pairingCode: new URL(created.connect_url).hash.slice(1), dir: join(temp, randomUUID()), store: new MemoryStore() }
}
describe('真实 API / MCP / Skill HTTP 的连接器纵向验收', () => {
  it('丢响应后 API 和 MCP 重启，同 pending 获得同凭据并完成完整协议', async () => {
    const f = await envelope(); const requests: Array<{ key: string | null; body: unknown; origin: string | null; ua: string | null }> = []
    let lost = true; let firstBody = ''
    const fetcher: typeof fetch = async (input, init) => {
      const response = await fetch(input, init)
      if (String(input) === f.e.redeemUrl) {
        requests.push({ key: new Headers(init?.headers).get('idempotency-key'), body: init?.body, origin: new Headers(init?.headers).get('origin'), ua: new Headers(init?.headers).get('user-agent') })
        const body = await response.clone().text()
        if (lost) { lost = false; firstBody = body; throw new Error('丢响应') }
        expect(body === firstBody).toBe(true)
      }
      return response
    }
    await expect(connect({ directory: f.dir, expectation: f.e, pairingCode: f.pairingCode, store: f.store, protocol: { fetch: fetcher, bootstrap: bootstrapMcp } })).rejects.toThrow()
    await close(mcp); await app.close()
    const { buildApp } = await import('../src/server.js')
    app = buildApp({ features: loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'true' }), logger: false })
    await app.listen({ host: '127.0.0.1', port: 0 }); const a = app.server.address()
    if (!a || typeof a === 'string') throw new Error('测试地址无效')
    apiBase = `http://127.0.0.1:${a.port}`
    mcp = await createWorkMeshMcpHttpServer({ baseUrl: apiBase, coordination: true, mode: 'read-write', readinessProbe: async () => {} }); mcpBase = await listen(mcp)
    const config = await connect({ directory: f.dir, expectation: f.e, pairingCode: f.pairingCode, store: f.store, protocol: { fetch: fetcher, bootstrap: bootstrapMcp } })
    expect(requests.length).toBe(2); expect(JSON.stringify(requests[0]) === JSON.stringify(requests[1])).toBe(true)
    const raw = (await readFile(join(f.dir, 'config.json'))).toString()
    const token = await f.store.get(config.secretReference)
    expect(Boolean(token) && !raw.includes(token!) && !raw.includes(f.pairingCode)).toBe(true)
  })
  it('同 key 异体、新 key 和陌生 claimant 拒绝；擦除/窗口外拒绝', async () => {
    const f = await envelope(); let pendingRaw = ''
    await expect(connect({ directory: f.dir, expectation: f.e, pairingCode: f.pairingCode, store: f.store,
      checkpoint: async stage => { if (stage === 'verified') { pendingRaw = (await readFile(join(f.dir, 'pending.json'))).toString(); throw new Error('发送后中断') } },
    })).rejects.toThrow()
    const pending = parseJson(pendingSchema, pendingRaw)
    const redeem = (key: string, body: string) => fetch(pending.target, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, Origin: pending.origin, 'User-Agent': pending.userAgent }, body })
    const same = await redeem(pending.key, pending.body); expect(same.status).toBe(200)
    const changed = await redeem(pending.key, JSON.stringify({ ...JSON.parse(pending.body), client: { type: 'codex', version: '2.0' } }))
    expect(changed.status).toBe(409); expect((await changed.json() as { error: { code: string } }).error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    const stranger = await redeem(randomUUID(), pending.body)
    expect(stranger.status).toBe(409)
    expect((await stranger.text()).includes('wmi_')).toBe(false)
    const replayRow = (await db.query<{ id: string }>("SELECT id FROM auth_idempotency_records WHERE operation='redeemAgentConnection' ORDER BY created_at DESC LIMIT 1")).rows[0]!
    expect((await db.query("UPDATE auth_idempotency_records SET replay_expires_at=now()-interval '1 second' WHERE id=$1", [replayRow.id])).rowCount).toBe(1)
    const expired = await redeem(pending.key, pending.body)
    expect(expired.status).toBe(409)
    expect((await createSessionLifecycleWorker({ db }).cleanupAuthIdempotency()).wiped).toBeGreaterThan(0)
    expect((await createSessionLifecycleWorker({ db }).cleanupAuthIdempotency()).wiped).toBe(0)
    expect((await db.query<{ replay_ciphertext: Buffer | null }>('SELECT replay_ciphertext FROM auth_idempotency_records WHERE id=$1', [replayRow.id])).rows[0]!.replay_ciphertext).toBeNull()
    const wiped = await redeem(pending.key, pending.body)
    expect(wiped.status).toBe(409); expect((await wiped.text()).includes('wmi_')).toBe(false)
    expect(await readPrivate(join(f.dir, 'config.json'))).toBeNull()
  })
  it('兑换事务失败不消耗 pairing；同 pending 重试完整成功', async () => {
    const f = await envelope()
    await db.query(`CREATE FUNCTION connector_redeem_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.connection_id='${f.e.connectionId}'::uuid THEN RAISE EXCEPTION 'connector fixture'; END IF; RETURN NEW; END $$`)
    await db.query('CREATE TRIGGER connector_redeem_failure BEFORE INSERT ON agent_connection_credentials FOR EACH ROW EXECUTE FUNCTION connector_redeem_failure()')
    let pending: Buffer
    try {
      await expect(connect({ directory: f.dir, expectation: f.e, pairingCode: f.pairingCode, store: f.store })).rejects.toThrow()
      pending = await readFile(join(f.dir, 'pending.json'))
      expect((await db.query<{ consumed_at: Date | null }>('SELECT consumed_at FROM agent_connection_pairings WHERE connection_id=$1', [f.e.connectionId])).rows[0]!.consumed_at).toBeNull()
      expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM agent_connection_credentials WHERE connection_id=$1', [f.e.connectionId])).rows[0]!.count).toBe(0)
      expect(f.store.values.size).toBe(0)
    } finally {
      await db.query('DROP TRIGGER connector_redeem_failure ON agent_connection_credentials')
      await db.query('DROP FUNCTION connector_redeem_failure()')
    }
    const saved = parseJson(pendingSchema, pending!.toString())
    const config = await connect({ directory: f.dir, expectation: f.e, pairingCode: f.pairingCode, store: f.store })
    expect(config.completion.key).toBe(saved.key)
  })
  it.each(['revoked', 'expired', 'overlap'] as const)('重放仍返回旧令牌，但 %s 当前验证拒绝且零正式写入', async mode => {
    const f = await envelope()
    await expect(connect({ directory: f.dir, expectation: f.e, pairingCode: f.pairingCode, store: f.store,
      checkpoint: async stage => { if (stage === 'verified') throw new Error('中断') },
    })).rejects.toThrow()
    if (mode === 'revoked') {
      const detail = await human('GET', `/api/v1/agent-connections/${f.e.connectionId}`)
      const revision = detail.json<{ revision: number }>().revision
      expect((await human('DELETE', `/api/v1/agent-connections/${f.e.connectionId}`, undefined, revision)).statusCode).toBe(204)
    } else if (mode === 'expired') {
      // 冻结生命周期的凭据到期为 overlap deadline；execution 安装投影不是协调身份权威。
      await db.query("UPDATE agent_connection_credentials SET status='overlap',overlap_until=now()-interval '1 second' WHERE connection_id=$1", [f.e.connectionId])
    } else {
      // 保留公开 Connection 当前指纹，测试只能由 authenticated_credential 拒绝的旧 overlap。
      await db.query("UPDATE agent_connection_credentials SET status='overlap',overlap_until=now()+interval '15 minutes' WHERE connection_id=$1", [f.e.connectionId])
    }
    await expect(connect({ directory: f.dir, expectation: f.e, pairingCode: f.pairingCode, store: f.store })).rejects.toThrow()
    expect(f.store.values.size).toBe(0)
    expect(await readPrivate(join(f.dir, 'config.json'))).toBeNull()
    expect(await readPrivate(join(f.dir, 'pending.json')) !== null).toBe(true)
  })
})
