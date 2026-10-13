// Dedicated source-side controller. The guest runs only installed release commands.
import { createServer, request, type Server } from 'node:http'
import { once } from 'node:events'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { applyMigrations, createDb } from '../../../packages/db/src/index.js'
import { loadFeatureConfig } from '../../../packages/config/src/index.js'
import { workmeshSkillManifest, agentConnectionResponseSchema, type AgentConnectionCreateResponse } from '@workmesh/contracts'
import { expectationSchema, type Expectation } from '../src/config.js'
import { AUTH_REPLAY_WINDOW_MS } from '../../api/src/auth-idempotency.js'
import { createWorkMeshMcpHttpServer } from '../../mcp/src/http.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl || new URL(databaseUrl).pathname !== '/workmesh_connector_install_test') throw new Error('Dedicated connector install test database required')
const evidence = resolve(process.env.WORKMESH_CONNECTOR_EVIDENCE ?? 'ci-logs/connector-install')
await mkdir(evidence, { recursive: true })
for (const name of ['SESSION_SECRET', 'WORKMESH_BOOTSTRAP_TOKEN', 'AUTH_RATE_LIMIT_HMAC_KEY']) process.env[name] = randomBytes(32).toString('base64url')
process.env.WORKMESH_MASTER_KEY = randomBytes(32).toString('hex')
process.env.NODE_ENV = 'test'; process.env.WEB_ORIGIN = 'http://127.0.0.1:18081'; process.env.PUBLIC_MCP_ORIGIN = process.env.WEB_ORIGIN
const origin = process.env.WEB_ORIGIN, { buildApp } = await import('../../api/src/server.js')
const features = loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'true' }), db = createDb(databaseUrl)
await applyMigrations(db)
let app = buildApp({ features, logger: false }), mcp: Server, apiBase: string, mcpBase: string
async function listen(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Listener missing')
  return `http://127.0.0.1:${address.port}`
}
async function services(): Promise<void> {
  apiBase = await app.listen({ port: 0, host: '127.0.0.1' })
  mcp = await createWorkMeshMcpHttpServer({ baseUrl: apiBase, coordination: true, mode: 'read-write', readinessProbe: async () => {} })
  mcpBase = await listen(mcp)
}
await services()
const install = await app.inject({ method: 'POST', url: '/api/v1/auth/install', payload: { name: 'Connector release acceptance', slug: 'connector-install',
  adminName: 'fixture admin', email: 'connector-install@example.test', password: 'connector-install-test-only-password' },
  headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! } })
if (install.statusCode !== 200) throw new Error(`Fixture install ${install.statusCode}`)
const cookies = install.headers['set-cookie'], cookie = (Array.isArray(cookies) ? cookies[0] : cookies)?.split(';')[0] ?? ''
const csrf = install.json<{ csrfToken: string }>().csrfToken
const human = (method: 'POST' | 'GET' | 'DELETE', path: string, payload?: object, revision?: number) => app.inject({ method, url: path, payload,
  headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...(revision ? { 'if-match': `"revision-${revision}"` } : {}) } })
const principalId = (await human('GET', '/api/v1/auth/me')).json<{ actor: { id: string } }>().actor.id
const teamId = (await human('GET', '/api/v1/teams')).json<{ items: { id: string }[] }>().items[0]!.id
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const records = new Map<string, { expectation: Expectation; pairingCode: string; mode: string; requests: string[]; responses: string[]; rowId?: string }>()
const receipts: object[] = []
async function save(): Promise<void> { await writeFile(join(evidence, 'server-receipt.json'), JSON.stringify(receipts, null, 2) + '\n') }
const gateway = createServer(async (incoming, outgoing) => {
  try {
    let body = ''; for await (const bytes of incoming) { body += String(bytes); if (body.length > 100000) throw new Error('Body size') }
    if (incoming.url?.startsWith('/fixture/')) {
      if (incoming.method !== 'POST') throw new Error('Fixture method')
      const input = JSON.parse(body) as { mode?: string; connectionId?: string }
      if (incoming.url === '/fixture/create') {
        const slug = 'installed-' + randomUUID().slice(0, 8)
        const response = await human('POST', '/api/v1/agent-connections', { name: 'Installed connector', agentSlug: slug, clientType: 'codex', teamId,
          principalHumanActorId: principalId, requestedCapabilities: ['work:read', 'work:write'], grantAgentDelegate: false })
        if (response.statusCode !== 201) throw new Error('Envelope failed')
        const created = response.json<AgentConnectionCreateResponse>(), c = agentConnectionResponseSchema.parse(created.connection)
        const expectation = expectationSchema.parse({ deploymentUrl: origin, discoveryUrl: origin + '/.well-known/workmesh-agent',
          redeemUrl: origin + '/api/v1/agent-connections/redeem', mcpUrl: origin + '/mcp', skillUrl: origin + '/skills/workmesh-1.1.0.md',
          workspaceId: c.workspace_id, connectionId: c.id, agentActorId: c.agent_actor_id, teamId, principalHumanActorId: principalId, agentSlug: slug,
          client: { type: 'codex', version: '1.1.0' }, profileVersion: '1.0', capabilities: c.requested_capabilities,
          requestedCapabilities: c.requested_capabilities, grantAgentDelegate: false, skill: { ...workmeshSkillManifest } })
        const pairingCode = new URL(created.connect_url).hash.slice(1)
        records.set(c.id, { expectation, pairingCode, mode: input.mode ?? 'normal', requests: [], responses: [] })
        outgoing.setHeader('content-type', 'application/json'); outgoing.end(JSON.stringify({ expectation, pairingCode })); return
      }
      const record = records.get(input.connectionId ?? '')
      if (!record) throw new Error('Unknown fixture')
      if (incoming.url === '/fixture/status') {
        const rows = await db.query<{ seconds: number; remaining: number; encrypted: boolean; created: Date }>(
          "SELECT extract(epoch from replay_expires_at-created_at)::float seconds,extract(epoch from replay_expires_at-clock_timestamp())::float remaining,replay_ciphertext IS NOT NULL encrypted,created_at created FROM auth_idempotency_records WHERE operation='redeemAgentConnection' AND id=$1", [record.rowId ?? randomUUID()])
        const status = { originalWindowSeconds: AUTH_REPLAY_WINDOW_MS / 1000, requestCount: record.requests.length, exactRequestMatches: record.requests.length >= 2 && record.requests.every(r => r === record.requests[0]),
          sameResponse: record.responses.length >= 2 && record.responses.every(r => r === record.responses[0]), requestDigests: record.requests.map(hash), responseDigests: record.responses.map(hash), replay: rows.rows[0] ?? null }
        receipts.push({ connectionId: input.connectionId, ...status }); await save()
        outgoing.setHeader('content-type', 'application/json'); outgoing.end(JSON.stringify(status)); return
      }
      if (incoming.url === '/fixture/expire') {
        await db.query("UPDATE auth_idempotency_records SET replay_expires_at=clock_timestamp()-interval '1 second' WHERE operation='redeemAgentConnection'")
      } else if (incoming.url === '/fixture/revoke') {
        const current = await human('GET', `/api/v1/agent-connections/${input.connectionId}`)
        const c = agentConnectionResponseSchema.parse(current.json())
        const revoked = await human('DELETE', `/api/v1/agent-connections/${input.connectionId}`, undefined, c.revision)
        if (revoked.statusCode !== 204) throw new Error('Revoke failed')
      } else if (incoming.url === '/fixture/restart') {
        mcp.closeAllConnections(); await new Promise<void>(done => mcp.close(() => done())); await app.close()
        app = buildApp({ features, logger: false }); await services()
        receipts.push({ apiAndMcpRestarted: true, utc: new Date().toISOString() }); await save()
      } else throw new Error('Unknown fixture route')
      record.mode = 'normal'; outgoing.end('{}'); return
    }
    const target = new URL(incoming.url!, incoming.url?.startsWith('/mcp') ? mcpBase : apiBase)
    const upstream = request(target, { method: incoming.method, headers: incoming.headers }, response => {
      if (incoming.url === '/api/v1/agent-connections/redeem') {
        const pairing = (JSON.parse(body) as { pairingCode: string }).pairingCode
        const record = [...records.values()].find(r => r.pairingCode === pairing)
        if (!record) { outgoing.writeHead(response.statusCode ?? 500, response.headers); response.pipe(outgoing); return }
        let text = ''; response.on('data', b => { text += String(b) }); response.on('end', () => { void (async () => {
          record.requests.push(JSON.stringify({ key: incoming.headers['idempotency-key'], body, origin: incoming.headers.origin, userAgent: incoming.headers['user-agent'] }))
          record.responses.push(text)
          if (!record.rowId && response.statusCode === 200) record.rowId = (await db.query<{ id: string }>("SELECT id FROM auth_idempotency_records WHERE operation='redeemAgentConnection' AND state='completed' ORDER BY created_at DESC LIMIT 1")).rows[0]!.id
          if (record.mode === 'lost' && record.requests.length === 1) { outgoing.destroy(); return }
          let bytes = text
          if (record.mode === 'fingerprint' && response.statusCode === 200) {
            const tampered = JSON.parse(text) as { connection: { credential_fingerprint_prefix: string } }; tampered.connection.credential_fingerprint_prefix = '000000000000'; bytes = JSON.stringify(tampered)
          }
          outgoing.writeHead(response.statusCode ?? 500, { 'content-type': 'application/json' }); outgoing.end(bytes)
        })().catch(() => { outgoing.destroy() }) })
      } else { outgoing.writeHead(response.statusCode ?? 500, response.headers); response.pipe(outgoing) }
    })
    upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end() }); upstream.end(body)
  } catch { outgoing.writeHead(500, { 'content-type': 'application/json' }); outgoing.end('{"error":"INSTALL_FIXTURE_FAILED"}') }
})
gateway.listen(18081, '127.0.0.1'); await once(gateway, 'listening'); await writeFile(join(evidence, 'server-ready'), 'ready\n')
async function finish(): Promise<void> {
  await save(); gateway.closeAllConnections(); gateway.close(); mcp.closeAllConnections(); mcp.close(); await app.close(); await db.end()
}
process.once('SIGTERM', () => { void finish() }); process.once('SIGINT', () => { void finish() })
