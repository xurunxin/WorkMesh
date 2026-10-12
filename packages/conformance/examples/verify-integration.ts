import assert from 'node:assert/strict'
import { randomUUID, createHash, verify } from 'node:crypto'
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { createServer } from 'node:net'
import { createServer as createHttpsServer } from 'node:https'
import { request as requestHttp, type Server } from 'node:http'
import { once } from 'node:events'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import { agentWellKnownResponseSchema, agentConnectionCreateResponseSchema, agentConnectionRedeemResponseSchema } from '@workmesh/contracts'
import { applyMigrations, createDb } from '@workmesh/db'
import { loadFeatureConfig } from '@workmesh/config'
import { expectationSchema } from '../../../apps/connector/src/config.js'
import { createWorkMeshMcpHttpServer } from '../../../apps/mcp/src/http.js'
import { runAgent } from './integration-agent.js'

const databaseUrl = process.env.DATABASE_URL
assert.equal(process.env.RUN_INTEGRATION, '1')
assert.ok(databaseUrl && /^workmesh_docs_[a-f0-9]+_test$/.test(new URL(databaseUrl).pathname.slice(1)))
const freePort = async () => {
  const server = createServer().listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()))
  return address.port
}
const apiPort = await freePort(), mcpPort = await freePort(), apiTlsPort = await freePort(), mcpTlsPort = await freePort()
const origin = `https://127.0.0.1:${apiTlsPort}`, mcpOrigin = `https://127.0.0.1:${mcpTlsPort}`
const execute = promisify(execFile)
process.env.WEB_ORIGIN = origin
process.env.PUBLIC_MCP_ORIGIN = mcpOrigin
process.env.SESSION_COOKIE_SECURE = 'true'
const proxies: Server[] = []
const startProxy = async (port: number, target: number) => {
  const server = createHttpsServer({ key: readFileSync(new URL('../src/fixtures/model-test-key.pem', import.meta.url)),
    cert: readFileSync(new URL('../src/fixtures/model-test-ca.pem', import.meta.url)) }, (request, response) => {
    const upstream = requestHttp({ hostname: '127.0.0.1', port: target, path: request.url, method: request.method,
      headers: request.headers }, reply => { response.writeHead(reply.statusCode ?? 502, reply.headers); reply.pipe(response) })
    upstream.on('error', () => { response.writeHead(502).end() })
    request.pipe(upstream)
  })
  proxies.push(server); server.listen(port, '127.0.0.1'); await once(server, 'listening')
}
// API 配置在模块加载时冻结，先设独有地址，再加载真实入口。
const { buildApp } = await import('../../../apps/api/src/server.js')
const app = buildApp({ features: loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'true' }), logger: { level: 'silent' } })
const db = createDb(databaseUrl!)
const mcp = await createWorkMeshMcpHttpServer({ baseUrl: origin, coordination: true, mode: 'read-only' })
let cookie = '', csrf = ''
const call = async (method: string, path: string, body?: unknown, key = randomUUID(), revision?: number) => {
  const response = await fetch(origin + path, { method, redirect: 'error', headers: {
    origin, cookie, 'x-csrf-token': csrf, 'idempotency-key': key,
    'content-type': 'application/json', ...(revision ? { 'if-match': `"revision-${revision}"` } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { response, body: response.status === 204 ? undefined : await response.json() as unknown }
}
try {
  await applyMigrations(db)
  await app.listen({ port: apiPort, host: '127.0.0.1' })
  mcp.listen(mcpPort, '127.0.0.1'); await once(mcp, 'listening')
  await startProxy(apiTlsPort, apiPort); await startProxy(mcpTlsPort, mcpPort)
  assert.equal((await fetch(origin + '/readyz')).status, 200)
  const email = `docs-${randomUUID()}@workmesh.test`, password = randomUUID() + randomUUID()
  const installed = await fetch(origin + '/api/v1/auth/install', { method: 'POST', headers: {
    'content-type': 'application/json', 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN!,
  }, body: JSON.stringify({ name: '接入示例测试', slug: 'docs-test', adminName: 'Docs admin', email, password }) })
  assert.equal(installed.status, 200)
  cookie = installed.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  csrf = (await installed.json() as { csrfToken: string }).csrfToken
  const { runHuman } = await import('../../../docs/integration/examples/human.mjs')
  const humanResult = await runHuman({ origin, email, password })
  const humanCli = await execute(process.execPath, [resolve(import.meta.dirname, '../../../docs/integration/examples/human.mjs')], {
    env: { ...process.env, WORKMESH_API_URL: origin, WORKMESH_HUMAN_EMAIL: email, WORKMESH_HUMAN_PASSWORD: password },
  })
  assert.equal(JSON.parse(humanCli.stdout).actorId, humanResult.actorId)
  assert.equal(humanCli.stderr, '')
  const actorId = humanResult.actorId, teamId = humanResult.teamIds[0]
  assert.ok(teamId && humanResult.logout)

  const projectKey = randomUUID(), projectBody = { teamId, name: '接口接入测试' }
  const created = await call('POST', '/api/v1/projects', projectBody, projectKey)
  assert.equal(created.response.status, 200)
  const project = created.body as { id: string; revision: number }
  const replay = await call('POST', '/api/v1/projects', projectBody, projectKey)
  assert.equal((replay.body as { id: string }).id, project.id)
  const updated = await call('PATCH', `/api/v1/projects/${project.id}`, { name: '修改后的名称' }, randomUUID(), project.revision)
  assert.equal(updated.response.status, 200)
  const stale = await call('PATCH', `/api/v1/projects/${project.id}`, { name: '旧版本不得覆盖' }, randomUUID(), project.revision)
  assert.equal(stale.response.status, 409)
  const keyReused = await call('POST', '/api/v1/projects', { ...projectBody, name: '异正文' }, projectKey)
  assert.equal(keyReused.response.status, 409)
  assert.equal((await fetch(origin + '/api/v1/auth/me')).status, 401)

  const discovery = agentWellKnownResponseSchema.parse(await (await fetch(origin + '/.well-known/workmesh-agent')).json())
  assert.equal(discovery.mcpUrl, mcpOrigin + '/mcp')
  assert.equal('download_url' in discovery.skill, false)
  const slug = 'docs-reader'
  const paired = await call('POST', '/api/v1/agent-connections', { name: '接入文档读取测试', agentSlug: slug, teamId,
    principalHumanActorId: actorId, clientType: 'codex', requestedCapabilities: ['work:read'], grantAgentDelegate: false })
  assert.equal(paired.response.status, 201)
  const pairing = agentConnectionCreateResponseSchema.parse(paired.body)
  assert.equal(new URL(pairing.connect_url).pathname, '/api/v1/agent-connections/redeem')
  const pairingCode = new URL(pairing.connect_url).hash.slice(1)
  const redeemBody = JSON.stringify({ pairingCode, agentSlug: slug, client: { type: 'codex', version: '1.1.0' } })
  const redeemKey = randomUUID()
  const redeem = () => fetch(origin + '/api/v1/agent-connections/redeem', { method: 'POST', redirect: 'error',
    headers: { 'content-type': 'application/json', 'idempotency-key': redeemKey }, body: redeemBody })
  const redemption = await redeem(); assert.equal(redemption.status, 200)
  const raw = await redemption.text()
  assert.equal(await (await redeem()).text(), raw)
  const redeemed = agentConnectionRedeemResponseSchema.parse(JSON.parse(raw))
  const download = new URL(redeemed.skill.download_url)
  assert.equal(download.origin, origin)
  assert.equal(download.pathname, '/skills/workmesh-1.1.0.md')
  const bytes = Buffer.from(await (await fetch(download, { redirect: 'error' })).arrayBuffer())
  assert.deepEqual(bytes, readFileSync(new URL('../../../apps/api/assets/skills/workmesh-1.1.0.md', import.meta.url)))
  assert.equal(bytes.includes(13), false)
  assert.equal('sha256:' + createHash('sha256').update(bytes).digest('hex'), discovery.skill.sha256)
  assert.equal(verify(null, bytes, readFileSync(new URL('../../../skills/workmesh/public-key.pem', import.meta.url)), Buffer.from(discovery.skill.signature.slice(8), 'base64')), true)
  const expected = expectationSchema.parse({ deploymentUrl: origin, discoveryUrl: origin + '/.well-known/workmesh-agent',
    redeemUrl: origin + '/api/v1/agent-connections/redeem', mcpUrl: redeemed.mcp.url, skillUrl: download.href,
    workspaceId: redeemed.connection.workspace_id, connectionId: redeemed.connection.id, agentActorId: redeemed.connection.agent_actor_id,
    teamId, principalHumanActorId: actorId, agentSlug: slug, client: { type: 'codex', version: '1.1.0' }, profileVersion: '1.0',
    requestedCapabilities: ['work:read'], capabilities: ['work:read'], grantAgentDelegate: false, skill: discovery.skill })
  const agentResult = await runAgent({ expectation: expected, token: redeemed.installation_token })
  const directory = mkdtempSync(resolve(import.meta.dirname, '../../../.tmp/docs-expectation-'))
  const expectationFile = resolve(directory, 'expectation.json')
  try {
    writeFileSync(expectationFile, JSON.stringify(expected))
    const pnpm = process.env.npm_execpath
    assert.ok(pnpm)
    assert.ok(pnpm.endsWith('pnpm.cjs'))
    const agentCli = await execute(process.execPath, [pnpm, '-C', resolve(import.meta.dirname, '..'), 'exec', 'tsx', 'examples/integration-agent.ts'], {
      env: { ...process.env, WORKMESH_EXPECTATION_FILE: expectationFile, WORKMESH_INSTALLATION_TOKEN: redeemed.installation_token },
    })
    assert.equal(JSON.parse(agentCli.stdout).connectionId, expected.connectionId)
    assert.equal(agentCli.stderr, '')
  } finally { unlinkSync(expectationFile); rmdirSync(directory) }
  const denied = await fetch(mcpOrigin + '/mcp', { method: 'POST', headers: {
    authorization: 'Bearer wrong-static-mode', 'X-WorkMesh-Installation-Token': redeemed.installation_token,
  } })
  assert.equal(denied.status, 401)
  await assert.rejects(runAgent({ expectation: { ...expected, teamId: randomUUID() }, token: redeemed.installation_token }))
  const sdk = new WorkMeshClient({ baseUrl: origin, coordinationToken: redeemed.installation_token, installationToken: redeemed.installation_token })
  await assert.rejects(sdk.createProject({ teamId, name: '读取连接不得写入' }))
  console.log(JSON.stringify({ human: humanResult, agent: agentResult, projectIdempotency: true, revisionConflict: true,
    anonymousDenied: true, pairingReplayIdentical: true, signedSkillBytes: bytes.length, mixedCredentialDenied: true,
    wrongExpectationDenied: true, readCapabilityWriteDenied: true, humanCliVerified: true, agentCliVerified: true,
    trustedTlsVerified: true, distinctApiMcpOrigins: true, externalProviderCalls: 0 }))
} finally {
  for (const proxy of proxies.reverse()) {
    proxy.closeAllConnections()
    if (proxy.listening) await new Promise<void>((done, reject) => proxy.close(error => error ? reject(error) : done()))
  }
  mcp.closeAllConnections()
  if (mcp.listening) await new Promise<void>((done, reject) => mcp.close(error => error ? reject(error) : done()))
  await app.close(); await db.end()
  console.log(JSON.stringify({ ownedListenersClosed: !mcp.listening && proxies.every(proxy => !proxy.listening), apiClosed: true, dbPoolClosed: true }))
}
