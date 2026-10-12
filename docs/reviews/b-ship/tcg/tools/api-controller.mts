// 研究夹具：只在独有测试库上执行真实 API 兑换与加密回执重放。
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { applyMigrations, createDb } from '../../../../../packages/db/src/index.js'
import { loadFeatureConfig } from '../../../../../packages/config/src/index.js'
import { AUTH_REPLAY_WINDOW_MS } from '../../../../../apps/api/src/auth-idempotency.js'

const url = process.env.DATABASE_URL
if (!url || new URL(url).pathname !== '/workmesh_tcg_test') throw new Error('private test database required')
for (const name of ['SESSION_SECRET', 'WORKMESH_BOOTSTRAP_TOKEN', 'AUTH_RATE_LIMIT_HMAC_KEY'])
  process.env[name] = randomBytes(32).toString('base64url')
process.env.WORKMESH_MASTER_KEY = randomBytes(32).toString('hex')
process.env.NODE_ENV = 'test'
process.env.WEB_ORIGIN = 'http://127.0.0.1:18081'
process.env.PUBLIC_MCP_ORIGIN = process.env.WEB_ORIGIN
const { buildApp } = await import('../../../../../apps/api/src/server.js')
const db = createDb(url)
await applyMigrations(db)
const app = buildApp({ features: loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'true' }), logger: false })
const install = await app.inject({ method: 'POST', url: '/api/v1/auth/install', payload: {
  name: 'TCG isolated research', slug: 'tcg-research', adminName: 'research fixture',
  email: 'tcg@example.test', password: 'tcg-test-fixture-only-password',
}, headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! } })
if (install.statusCode !== 200) throw new Error(`install status ${install.statusCode}`)
const cookies = install.headers['set-cookie']
const cookie = (Array.isArray(cookies) ? cookies[0] : cookies)?.split(';')[0] ?? ''
const csrf = install.json<{ csrfToken: string }>().csrfToken
const human = (path: string, payload?: object) => app.inject({ method: payload ? 'POST' : 'GET', url: path, payload,
  headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID() } })
const principalId = (await human('/api/v1/auth/me')).json<{ actor: { id: string } }>().actor.id
const teamId = (await human('/api/v1/teams')).json<{ items: { id: string }[] }>().items[0]!.id
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
type ReplayRequest = { key: string; body: string; origin: string; userAgent: string }
let saved: ReplayRequest | undefined
let firstResponse = ''
let replayId = ''
let firstUtc = ''
let windowSeconds = 0
const redeem = (request: ReplayRequest) => app.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem',
  payload: request.body, headers: { 'content-type': 'application/json', 'idempotency-key': request.key,
    origin: request.origin, 'user-agent': request.userAgent } })
const safeResults: object[] = []
const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.method !== 'POST') throw new Error('method rejected')
    let raw = ''
    for await (const chunk of incoming) { raw += String(chunk); if (raw.length > 32768) throw new Error('body too large') }
    if (incoming.url === '/start') {
      if (saved) throw new Error('already started')
      const agentSlug = 'tcg-' + randomUUID().slice(0, 8)
      const connection = await human('/api/v1/agent-connections', { name: 'TCG research', agentSlug,
        clientType: 'codex', teamId, principalHumanActorId: principalId,
        requestedCapabilities: ['work:read', 'work:write'], grantAgentDelegate: false })
      if (connection.statusCode !== 201) throw new Error(`connection status ${connection.statusCode}`)
      const created = connection.json<{ connect_url: string; connection: { id: string } }>()
      saved = { key: randomUUID(), body: JSON.stringify({ pairingCode: new URL(created.connect_url).hash.slice(1), agentSlug,
        client: { type: 'codex', version: 'tcg-research' } }), origin: process.env.WEB_ORIGIN!, userAgent: 'workmesh-tcg-research' }
      const response = await redeem(saved)
      if (response.statusCode !== 200) throw new Error(`first redeem status ${response.statusCode}`)
      firstResponse = response.body
      const row = (await db.query<{ id: string; created_at: Date; seconds: number; encrypted: boolean }>(
        "SELECT id,created_at,extract(epoch from replay_expires_at-created_at)::float AS seconds,replay_ciphertext IS NOT NULL AS encrypted FROM auth_idempotency_records WHERE operation='redeemAgentConnection' ORDER BY created_at DESC LIMIT 1")).rows[0]!
      if (!row.encrypted || AUTH_REPLAY_WINDOW_MS !== 900_000) throw new Error('original encrypted replay window mismatch')
      replayId = row.id; firstUtc = row.created_at.toISOString(); windowSeconds = AUTH_REPLAY_WINDOW_MS / 1000
      safeResults.push({ phase: 'first-redeem', status: 200, encrypted: true, windowSeconds, utc: firstUtc,
        observedRowWindowSeconds: row.seconds,
        requestDigest: hash(JSON.stringify(saved)), responseDigest: hash(firstResponse) })
      outgoing.setHeader('content-type', 'application/json')
      outgoing.end(JSON.stringify({ request: saved, firstResponseDigest: hash(firstResponse) }))
      return
    }
    if (incoming.url === '/replay') {
      const request = JSON.parse(raw) as ReplayRequest
      if (!saved || JSON.stringify(request) !== JSON.stringify(saved)) throw new Error('exact identity mismatch')
      const response = await redeem(request)
      const matches = response.statusCode === 200 && response.body === firstResponse
      const remaining = (await db.query<{ seconds: number }>(
        'SELECT extract(epoch from replay_expires_at-clock_timestamp())::float AS seconds FROM auth_idempotency_records WHERE id=$1', [replayId])).rows[0]!.seconds
      if (!matches || remaining <= 0) throw new Error('within-window replay failed')
      // 与既有 stage5 集成负例相同，确定性设置过期；不冒自然等待十五分钟。
      await db.query("UPDATE auth_idempotency_records SET replay_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [replayId])
      const expired = await redeem(request)
      if (expired.statusCode !== 409 || expired.body.includes('wmi_')) throw new Error('expired replay rejection failed')
      const value = { exactRequestMatches: true, replayResponseMatches: true, replayStatus: 200,
        expiredStatus: 409, expiryMethod: 'dedicated-test-row-expired', remainingSeconds: remaining,
        originalWindowSeconds: windowSeconds, firstRedeemUtc: firstUtc }
      safeResults.push({ phase: 'after-guest-reboot', ...value, utc: new Date().toISOString() })
      writeFileSync('ci-tcg/api-receipt.json', JSON.stringify(safeResults, null, 2) + '\n')
      outgoing.setHeader('content-type', 'application/json')
      outgoing.end(JSON.stringify(value))
      return
    }
    throw new Error('unknown path')
  } catch (error) {
    outgoing.statusCode = 500
    outgoing.end(JSON.stringify({ errorType: error instanceof Error ? error.name : 'UnknownError' }))
  }
})
server.listen(18081, '127.0.0.1', () => writeFileSync('ci-tcg/api-ready', 'ready\n'))
async function finish() {
  writeFileSync('ci-tcg/api-receipt.json', JSON.stringify(safeResults, null, 2) + '\n')
  server.closeAllConnections(); server.close()
  await app.close(); await db.end()
}
process.once('SIGTERM', () => { void finish() })
process.once('SIGINT', () => { void finish() })
