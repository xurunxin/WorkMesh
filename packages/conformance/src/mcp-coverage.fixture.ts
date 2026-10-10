import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer as createModelServer } from 'node:https'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Server } from 'node:http'
import type { Capability } from '@workmesh/contracts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import { applyMigrations, createDb } from '@workmesh/db'
import { loadFeatureConfig } from '@workmesh/config'
import { buildApp } from '../../../apps/api/src/server.js'
import { createWorkMeshMcpHttpServer } from '../../../apps/mcp/src/http.js'
import { createWorkMeshMcpServer } from '../../../apps/mcp/src/index.js'

const execFileAsync = promisify(execFile)
export const evidenceRoot = resolve(import.meta.dirname, '../../../ci-logs/mcp-coverage')
export const saveEvidence = (name: string, value: unknown): void => {
  mkdirSync(evidenceRoot, { recursive: true })
  writeFileSync(resolve(evidenceRoot, name), JSON.stringify(value, null, 2) + '\n')
}
const safeBody = (value: string): string => value.replace(/wm[ips]_[A-Za-z0-9_-]+/g, '[credential]')
export type Execution = { sessionId: string; workItemId: string; token: string; client: WorkMeshClient }

/** 独有监听端口；数据库必须是已核定test库，根入口先串行reset。 */
export async function createMcpCoverageFixture(options:{capabilities?:Capability[];features?:Parameters<typeof loadFeatureConfig>[0]}={}) {
  const databaseUrl = process.env.DATABASE_URL
  if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
    throw new Error('MCP conformance requires RUN_INTEGRATION=1 and a dedicated test database')
  if (!process.env.WORKMESH_RUNNER_SERVICE_TOKEN || !process.env.WORKMESH_BOOTSTRAP_TOKEN)
    throw new Error('MCP/Pi conformance credentials are required; no skip fallback')
  const db = createDb(databaseUrl)
  const features = loadFeatureConfig({ ...options.features, WORKMESH_BETA_COORDINATION_MCP: 'true' })
  let app = buildApp({ features, logger: { level: options.capabilities?.includes('repo:read')?'error':'silent' } })
  const servers: Server[] = []
  const clients: Client[] = []
  const embedded: Array<ReturnType<typeof createWorkMeshMcpServer>> = []
  const events: Array<Record<string, unknown>> = []
  let baseUrl = '', cookie = '', csrf = '', teamId = '', humanActorId = '', readyId = '', connectionToken = '', connectionId = ''
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    const results = await Promise.allSettled(clients.map(client => client.close()))
    for (const server of servers.reverse()) {
      server.closeAllConnections()
      if (server.listening) await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()))
    }
    for (const server of embedded) await server.close()
    await app.close()
    await db.end()
    saveEvidence('resources.json', { events, cleanup: results.map(result => result.status), ownedListenersClosed: servers.every(server => !server.listening), database: new URL(databaseUrl).pathname, databasePreserved: true })
  }
  const human = async <T>(method: string, path: string, body?: unknown, revision?: number): Promise<T> => {
    const response = await fetch(baseUrl + path, { method, headers: { cookie, 'x-csrf-token': csrf,
      'idempotency-key': randomUUID(), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(revision ? { 'if-match': `"revision-${revision}"` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await response.text()
    if (!response.ok) throw new Error(`Human fixture ${method} ${path}: ${response.status} ${safeBody(text)}`)
    return (text ? JSON.parse(text) : undefined) as T
  }
  const connect = async (mode: 'read-only' | 'read-write', execution?: Execution, installationToken = connectionToken): Promise<Client> => {
    const accessToken = randomUUID()
    const server = await createWorkMeshMcpHttpServer({ baseUrl, mode,
      ...(execution ? { sessionToken: execution.token, accessToken } : { coordination: true }) })
    servers.push(server)
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('MCP listener missing')
    const url = `http://127.0.0.1:${address.port}`
    const ready = await fetch(url + '/readyz')
    if (!ready.ok) throw new Error('MCP upstream not ready')
    events.push({ kind: 'mcp', mode, url, executionSessionId: execution?.sessionId ?? null })
    const client = new Client({ name: 'workmesh-m0-real-client', version: '1.0.0' })
    clients.push(client)
    await client.connect(new StreamableHTTPClientTransport(new URL(url + '/mcp'), {
      requestInit: { headers: execution ? { authorization: `Bearer ${accessToken}` } : { 'x-workmesh-installation-token': installationToken } },
    }))
    return client
  }
  const createExecution = async (title = 'M0 execution', queued = false, budget?: Record<string, number>, projectId?:string): Promise<Execution> => {
    const work = await human<{ id: string; revision: number }>('POST', '/api/v1/work-items', {
      teamId, title, statusId: readyId, responsibleHumanActorId: humanActorId,...(projectId?{projectId}:{}),
    })
    const coordination = new WorkMeshClient({ baseUrl, coordinationToken: connectionToken, installationToken: connectionToken })
    const claim = await coordination.claimWorkItem(work.id, budget ? { budget } : {}, { ifMatch: work.revision, idempotencyKey: randomUUID() })
    const exchanged = await coordination.exchangeClaimedSessionToken(claim.session.id, claim.exchangeToken, { idempotencyKey: randomUUID() })
    if (queued) return { sessionId: claim.session.id, workItemId: work.id, token: exchanged.sessionToken, client: new WorkMeshClient({ baseUrl, sessionToken: exchanged.sessionToken }) }
    await coordination.acknowledge(claim.session.id, { summary: 'M0 fixture ready', externalUrls: [] }, { idempotencyKey: randomUUID() })
    const refreshed = await fetch(`${baseUrl}/api/v1/agent-sessions/${claim.session.id}/token/refresh`, {
      method: 'POST', headers: { authorization: `Bearer ${connectionToken}`, 'idempotency-key': randomUUID(), 'content-type': 'application/json' }, body: '{}',
    })
    if (!refreshed.ok) throw new Error(`Exact target refresh failed: ${refreshed.status}`)
    const token = (await refreshed.json() as { sessionToken: string }).sessionToken
    const client = new WorkMeshClient({ baseUrl, sessionToken: token })
    const session = await client.getSession<{ revision: number }>(claim.session.id)
    await client.transitionState(claim.session.id, 'executing', 'M0 conformance', { ifMatch: session.revision, idempotencyKey: randomUUID() })
    return { sessionId: claim.session.id, workItemId: work.id, token, client }
  }
  const connectSdk = async (sdk: WorkMeshClient) => {
    const server = createWorkMeshMcpServer({ client: sdk, mode: 'read-write' })
    embedded.push(server)
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(a)
    const client = new Client({ name: 'm0-loss-client', version: '1.0.0' })
    clients.push(client)
    await client.connect(b)
    events.push({ kind: 'mcp', mode: 'read-write', transport: 'in-memory SDK transport to real HTTP API' })
    return client
  }
  const restart = async () => {
    const port = Number(new URL(baseUrl).port)
    await app.close()
    app = buildApp({ features, logger: { level: 'silent' } })
    await app.listen({ port, host: '127.0.0.1' })
    events.push({ kind: 'api-restart', port })
  }
  const pairTarget = async (capabilities: Capability[] = ['work:read', 'work:write']) => {
    const agentSlug = `m0-target-${randomUUID().slice(0, 8)}`
    const paired = await human<{ connection: { id: string }; connect_url: string }>('POST', '/api/v1/agent-connections', {
      name: 'M0 exact handoff target', agentSlug, clientType: 'codex', teamId, principalHumanActorId: humanActorId,
      requestedCapabilities: capabilities, grantAgentDelegate: false,
    })
    const redeemed = await fetch(baseUrl + '/api/v1/agent-connections/redeem', {
      method: 'POST', headers: { 'idempotency-key': randomUUID(), 'content-type': 'application/json' },
      body: JSON.stringify({ pairingCode: new URL(paired.connect_url).hash.slice(1), agentSlug, client: { type: 'codex', version: '1.0.0' } }),
    })
    if (!redeemed.ok) throw new Error(`Target pairing fixture failed: ${redeemed.status}`)
    const token = (await redeemed.json() as { installation_token: string }).installation_token
    const agentId = (await db.query<{ agent_id: string }>('SELECT agent_id FROM agent_connections WHERE id=$1', [paired.connection.id])).rows[0]!.agent_id
    return { agentId, token }
  }
  try {
    await applyMigrations(db)
    await db.query('TRUNCATE auth_idempotency_records,workspaces CASCADE')
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' })
    events.push({ kind: 'api', url: baseUrl, ready: (await fetch(baseUrl + '/readyz')).status })
    const installed = await fetch(baseUrl + '/api/v1/auth/install', {
      method: 'POST', headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN!, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'M0 conformance', slug: `m0-${randomUUID().slice(0, 8)}`, adminName: 'M0 admin', email: `${randomUUID()}@m0.test`, password: 'm0-fixture-password' }),
    })
    if (!installed.ok) throw new Error(`Install fixture failed: ${installed.status} ${safeBody(await installed.text())}`)
    cookie = installed.headers.get('set-cookie')!.split(';')[0]!
    csrf = (await installed.json() as { csrfToken: string }).csrfToken
    humanActorId = (await human<{ actor: { id: string } }>('GET', '/api/v1/auth/me')).actor.id
    teamId = (await human<{ items: Array<{ id: string }> }>('GET', '/api/v1/teams')).items[0]!.id
    readyId = (await human<{ items: Array<{ id: string; name: string }> }>('GET', `/api/v1/teams/${teamId}/states`)).items.find(state => state.name === 'Ready')!.id
    const agentSlug = `m0-${randomUUID().slice(0, 8)}`
    const paired = await human<{ connection: { id: string }; connect_url: string }>('POST', '/api/v1/agent-connections', {
      name: 'M0 conformance', agentSlug, clientType: 'codex', teamId, principalHumanActorId: humanActorId,
      requestedCapabilities: options.capabilities??['work:read', 'work:write', 'plan:write', 'artifact:write', 'message:write', 'comment:write'], grantAgentDelegate: false,
    })
    connectionId = paired.connection.id
    const redeemed = await fetch(baseUrl + '/api/v1/agent-connections/redeem', {
      method: 'POST', headers: { 'idempotency-key': randomUUID(), 'content-type': 'application/json' },
      body: JSON.stringify({ pairingCode: new URL(paired.connect_url).hash.slice(1), agentSlug, client: { type: 'codex', version: '1.0.0' } }),
    })
    if (!redeemed.ok) throw new Error(`Pairing fixture failed: ${redeemed.status}`)
    connectionToken = (await redeemed.json() as { installation_token: string }).installation_token
    const definition = (await db.query<{ agent_id: string; revision: number }>('SELECT connection.agent_id,definition.revision FROM agent_connections connection JOIN agent_definitions definition ON definition.id=connection.agent_id WHERE connection.id=$1', [connectionId])).rows[0]!
    // 仅提高管理员已预授权测试Agent的并发夹具容量，不更改任何角色/能力。
    await human('PATCH', `/api/v1/agents/${definition.agent_id}`, { maxConcurrency: 16 }, definition.revision)
    const coordination = new WorkMeshClient({ baseUrl, coordinationToken: connectionToken, installationToken: connectionToken })
    return { db, human, connect, connectSdk, close, restart, createExecution, coordination, pairTarget, agentId: definition.agent_id,
      get baseUrl() { return baseUrl }, get connectionToken() { return connectionToken }, teamId, humanActorId, connectionId,
      runPi: async (execution: Execution) => {
        const captures: Array<{ tools: string[]; returnedToolCalls: string[]; receivedToolResults: number; toolResults: string[] }> = []
        const model = createModelServer({ key: readFileSync(new URL('./fixtures/model-test-key.pem', import.meta.url)), cert: readFileSync(new URL('./fixtures/model-test-ca.pem', import.meta.url)) }, async (request, response) => {
          let body = ''; for await (const chunk of request) body += String(chunk)
          const input = JSON.parse(body) as { tools: Array<{ function: { name: string } }>; messages: Array<{ role: string; content?: unknown }> }
          const index = captures.length
          const name = index === 0 ? 'workmesh_create_document' : index === 1 ? 'workmesh_get_document' : index === 2 ? 'workmesh_get_work_item' : null
          captures.push({ tools: input.tools.map(tool => tool.function.name), returnedToolCalls: name ? [name] : [], receivedToolResults: input.messages.filter(message => message.role === 'tool').length, toolResults: input.messages.filter(message => message.role === 'tool').map(message => JSON.stringify(message.content)) })
          response.writeHead(200, { 'content-type': 'text/event-stream' })
          const delta = name ? { role: 'assistant', tool_calls: [{ index: 0, id: `m0-call-${index}`, type: 'function', function: { name, arguments: JSON.stringify(index === 0 ? { ownerType: 'work_item', ownerId: execution.workItemId, title: 'M0 Pi fact', markdown: 'M0 deterministic model evidence' } : index === 1 ? { documentId: randomUUID() } : { workItemId: execution.workItemId }) } }] } : { role: 'assistant', content: 'M0 Pi verified its own tools and exact Work Item.' }
          for (const [part, finish] of [[delta, null], [{}, name ? 'tool_calls' : 'stop']] as const)
            response.write(`data: ${JSON.stringify({ id: `m0-${index}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'm0-model', choices: [{ index: 0, delta: part, finish_reason: finish }] })}\n\n`)
          response.end('data: [DONE]\n\n')
        })
        servers.push(model); model.listen(0, '127.0.0.1'); await once(model, 'listening')
        const address = model.address(); if (!address || typeof address === 'string') throw new Error('Model listener missing')
        const previousAllowlist = process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST
        process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST = '127.0.0.1'
        try {
          const connection = await human<{ id: string }>('POST', '/api/v1/workbench/llm-connections', { scope: 'workspace', name: 'M0 local fake model', apiType: 'openai-completions', baseUrl: `https://127.0.0.1:${address.port}/v1`, secretMaterial: 'm0-public-fixture-model-key' })
          const selected = await human<{ id: string }>('POST', `/api/v1/workbench/llm-connections/${connection.id}/models`, { externalModelId: 'm0-model', displayName: 'M0 fake model', enabled: true, capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false, contextWindowTokens: 32768, maxOutputTokens: 2048 } }, 1)
          const conversation = await human<{ id: string }>('POST', '/api/v1/workbench/conversations', { title: 'M0 Pi', workItemId: execution.workItemId, agentSessionId: execution.sessionId, llmConnectionId: connection.id, llmModelId: selected.id })
          const queued = await human<{ turn: { id: string } }>('POST', `/api/v1/workbench/conversations/${conversation.id}/turns`, { messageMarkdown: 'Create a document, handle a missing document error, read your exact Work Item, then answer.' }, 1)
          const runnerRoot = resolve(import.meta.dirname, '../../../apps/agent-runner')
          const env: NodeJS.ProcessEnv = { ...process.env, WORKMESH_API_URL: baseUrl, WORKMESH_AGENT_INSTALLATION_TOKEN: connectionToken, WORKMESH_AGENT_SESSION_ID: execution.sessionId, NODE_EXTRA_CA_CERTS: resolve(import.meta.dirname, 'fixtures/model-test-ca.pem') }
          delete env.DATABASE_URL; delete env.WORKMESH_MASTER_KEY; delete env.WORKMESH_BOOTSTRAP_TOKEN
          events.push({ kind: 'model', port: address.port, transport: 'https', externalConnections: false })
          const result = await execFileAsync(process.execPath, [resolve(runnerRoot, 'node_modules/tsx/dist/cli.mjs'), resolve(runnerRoot, 'src/run-session.ts'), '--once'], { cwd: runnerRoot, env, timeout: 60_000, maxBuffer: 1_000_000 })
          saveEvidence('pi-tools-and-turn.json', { captures, stdout: safeBody(result.stdout), stderr: safeBody(result.stderr), turnId: queued.turn.id, sessionId: execution.sessionId })
          return { captures, ...result, turnId: queued.turn.id, conversationId: conversation.id }
        } finally {
          if (previousAllowlist === undefined) delete process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST
          else process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST = previousAllowlist
          saveEvidence('model-captures.json', captures)
        }
      },
    }
  } catch (error) { await close(); throw error }
}
