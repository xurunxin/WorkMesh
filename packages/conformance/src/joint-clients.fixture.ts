import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import type { Execution } from './mcp-coverage.fixture.js'
import type { Capability } from '@workmesh/contracts'
import { hashPassword } from '@workmesh/db'
import { createPlanningCollaborationFixture } from './planning-collaboration.fixture.js'
import { fingerprint, saveJointEvidence } from './joint-clients.reporter.js'

export async function createJointClientsFixture(options: { capabilities?: Capability[] } = {}) {
  const fixture = await createPlanningCollaborationFixture({ capabilities: options.capabilities, features: { WORKMESH_BETA_PLANNING: 'true' } })
  const listeners: Server[] = []
  const processes: Array<{ pid: number | undefined; url: string; exited?: boolean }> = []
  const children: ReturnType<typeof spawn>[] = []
  const pairClient = async (clientType: 'opencode' | 'pi', capabilities: Capability[] = ['work:read', 'work:write', 'plan:write', 'message:write', 'artifact:write'], principalHumanActorId = fixture.humanActorId) => {
    const agentSlug = `m5-${clientType}-${randomUUID().slice(0, 8)}`
    const paired = await fixture.human<{ connection: { id: string }; connect_url: string }>('POST', '/api/v1/agent-connections', {
      name: `M5 actual ${clientType}`, agentSlug, clientType, teamId: fixture.teamId, principalHumanActorId,
      requestedCapabilities: capabilities, grantAgentDelegate: false,
    })
    const response = await fetch(fixture.baseUrl + '/api/v1/agent-connections/redeem', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ pairingCode: new URL(paired.connect_url).hash.slice(1), agentSlug, client: { type: clientType, version: clientType === 'pi' ? '0.87.1' : '2.0.26' } }) })
    if (!response.ok) throw new Error(`M5_PAIRING_FAILED:${response.status}`)
    const token = (await response.json() as { installation_token: string }).installation_token
    const agent = (await fixture.db.query<{ agent_id: string }>('SELECT agent_id FROM agent_connections WHERE id=$1', [paired.connection.id])).rows[0]!
    saveJointEvidence(`connection-${paired.connection.id}.json`, { clientType, agentId: agent.agent_id, connectionId: paired.connection.id, principal: principalHumanActorId, preparedByHuman: true })
    return { clientType, token, agentId: agent.agent_id, connectionId: paired.connection.id, principalHumanActorId }
  }
  const refreshExecution = async (connection: { token: string }, sessionId: string, workItemId: string): Promise<Execution> => {
    const response = await fetch(`${fixture.baseUrl}/api/v1/agent-sessions/${sessionId}/token/refresh`, { method: 'POST', headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: '{}' })
    if (!response.ok) throw new Error(`M5_EXACT_EXECUTION_REFRESH_FAILED:${response.status}`)
    const token = (await response.json() as { sessionToken: string }).sessionToken
    return { sessionId, workItemId, token, client: new WorkMeshClient({ baseUrl: fixture.baseUrl, sessionToken: token, installationToken: connection.token }) }
  }
  const createClientExecution = async (connection: { token: string; principalHumanActorId?: string }, title: string, projectId?: string) => {
    const states = await fixture.coordination.listWorkflowStates<{ id: string; name: string }>(fixture.teamId)
    const work = await fixture.human<{ id: string; revision: number }>('POST', '/api/v1/work-items', { teamId: fixture.teamId, title,
      statusId: states.items.find(row => row.name === 'Ready')!.id, responsibleHumanActorId: connection.principalHumanActorId ?? fixture.humanActorId, ...(projectId ? { projectId } : {}) })
    const coordination = new WorkMeshClient({ baseUrl: fixture.baseUrl, coordinationToken: connection.token, installationToken: connection.token })
    const claim = await coordination.claimWorkItem(work.id, {}, { ifMatch: work.revision })
    await coordination.exchangeClaimedSessionToken(claim.session.id, claim.exchangeToken)
    await coordination.acknowledge(claim.session.id, { summary: 'M5 protocol preparation, real Pi execution follows', externalUrls: [] })
    const execution = await refreshExecution(connection, claim.session.id, work.id)
    await execution.client.transitionState(execution.sessionId, 'executing', 'M5 prepared accurate E', { ifMatch: (await execution.client.getSession<{ revision: number }>(execution.sessionId)).revision })
    saveJointEvidence(`prepared-${execution.sessionId}.json`, { sessionId: execution.sessionId, workItemId: work.id, claimAck: 'SDK protocol preparation; not Pi model actions' })
    return execution
  }
  const secondHuman = async () => {
    const workspaceId = (await fixture.db.query<{ workspace_id: string }>('SELECT workspace_id FROM teams WHERE id=$1', [fixture.teamId])).rows[0]!.workspace_id
    const team2 = await fixture.human<{ id: string }>('POST', '/api/v1/teams', { name: 'M5 isolated second Team', key: `M5${randomUUID().slice(0, 6).toUpperCase()}` })
    const email = `${randomUUID()}@m5.test`, password = randomBytes(24).toString('hex')
    // Reuse execution-recovery's privileged membership preparation: there is no public membership endpoint.
    const id = (await fixture.db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name,email,password_hash,workspace_role) VALUES($1,'human','M5 H2',$2,$3,'member') RETURNING id", [workspaceId, email, await hashPassword(password)])).rows[0]!.id
    for (const teamId of [fixture.teamId, team2.id]) await fixture.db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'maintainer')", [workspaceId, teamId, id])
    const login = await fetch(fixture.baseUrl + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify({ email, password }) })
    if (!login.ok) throw new Error(`M5_H2_LOGIN:${login.status}`)
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!, csrf = (await login.json() as { csrfToken: string }).csrfToken
    const request = async <T>(method: string, path: string, body?: unknown, revision?: number): Promise<T> => {
      const response = await fetch(fixture.baseUrl + path, { method, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(revision ? { 'if-match': `"revision-${revision}"` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
      if (!response.ok) throw new Error(`M5_H2_REST:${response.status}:${await response.text()}`)
      return await response.json() as T
    }
    saveJointEvidence(`human-${id}.json`, { humanId: id, workspaceId, teams: [fixture.teamId, team2.id], role: 'member/Team maintainer', actorMembershipPreparation: 'privileged fixture', login: 'actual REST', cookieSentToAgent: false })
    return { id, team2: team2.id, request }
  }
  const startApi = async (port = 0) => {
    const child = spawn(process.execPath, [resolve(import.meta.dirname, '../../../node_modules/tsx/dist/cli.mjs'), resolve(import.meta.dirname, 'joint-clients.service.ts')],
      { env: { ...process.env, M5_SERVICE_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    children.push(child)
    const row = { pid: child.pid, url: '', exited: false }; processes.push(row)
    saveJointEvidence('owned-processes-running.json', { processes })
    child.stderr?.resume()
    const ready = await new Promise<string>((done, reject) => {
      let text = ''; const timer = setTimeout(() => reject(new Error('M5_API_PROCESS_READY_TIMEOUT')), 20_000)
      child.stdout!.on('data', chunk => { text += String(chunk); for (const line of text.split('\n')) {
        try { const value = JSON.parse(line) as { m5Service?: string; url?: string }; if (value.m5Service === 'api' && value.url) { clearTimeout(timer); done(value.url) } } catch { /* partial line */ }
      } })
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`M5_API_PROCESS_EXIT:${code}`)) })
    })
    row.url = ready
    child.once('exit', () => { row.exited = true })
    return { child, url: ready, stop: async () => { if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited } } }
  }
  const lossProxy = async (upstream: string, match: (path: string, method: string) => boolean, options: { losses?: number; lossMode?: 'socket' | 'timeout' | 'body'; serializeRecovery?: boolean; responseTransform?: (path: string, data: Buffer) => Promise<Buffer>; afterFirstCommit?: () => Promise<void>; afterResponse?: (path: string, status: number) => Promise<void> } = {}) => {
    const observed: Array<{ method: string; path: string; bodyHash: string; headersHash: string; key?: string; revision?: string; eHash: string; status: number; responseLost: boolean }> = []
    const transport: Array<{ method: string; path: string; key?: string; eHash: string; status: number }> = []
    const errors: string[] = []
    const proxyId = randomUUID()
    // Private original bytes support explicit test-side reconciliation only.
    // The proxy never sends a second request on behalf of a Runner tool.
    const originals: Array<{ path: string; method: string; headers: Record<string, string>; body: Buffer }> = []
    let recovering: Promise<void> | undefined
    const proxy = createServer(async (request, response) => {
      try {
        const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
        const body = Buffer.concat(chunks), headers: Record<string, string> = {}
        for (const [key, value] of Object.entries(request.headers)) if (value && !['host', 'connection', 'content-length'].includes(key)) headers[key] = Array.isArray(value) ? value.join(',') : value
        const path = request.url ?? '/', method = request.method ?? 'GET'
        if (recovering && options.serializeRecovery !== false) await recovering
        const result = await fetch(upstream + path, { method, headers, ...(['GET', 'HEAD'].includes(method) ? {} : { body }) })
        const original = Buffer.from(await result.arrayBuffer())
        const data = options.responseTransform ? await options.responseTransform(path, original) : original
        transport.push({ method, path, key: headers['idempotency-key'], eHash: fingerprint(headers.authorization ?? ''), status: result.status })
        await options.afterResponse?.(path, result.status)
        const matching = match(path, method), responseLost = matching && result.ok && observed.filter(row => row.responseLost).length < (options.losses ?? 1)
        if (matching) {
          originals.push({ path, method, headers, body })
          observed.push({ method, path, bodyHash: fingerprint(body), headersHash: fingerprint(JSON.stringify(Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)))), key: headers['idempotency-key'], revision: headers['if-match'], eHash: fingerprint(headers.authorization ?? ''), status: result.status, responseLost })
        }
        if (responseLost) {
          if (observed.length === 1 && options.afterFirstCommit) { recovering = options.afterFirstCommit(); await recovering; recovering = undefined }
          if (options.lossMode === 'timeout') return
          if (options.lossMode === 'body') { response.writeHead(result.status, { 'content-type': 'application/json', 'content-length': String(data.length) }); response.write(data.subarray(0, Math.max(1, Math.floor(data.length / 2)))); setTimeout(() => response.destroy(), 10); return }
          response.destroy(); return
        }
        response.writeHead(result.status, { 'content-type': result.headers.get('content-type') ?? 'application/json' }); response.end(data)
      } catch (error) { errors.push(String(error)); saveJointEvidence(`proxy-errors-${proxyId}.json`, { errors }); response.destroy() }
    })
    listeners.push(proxy); proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening')
    return { url: `http://127.0.0.1:${(proxy.address() as { port: number }).port}`, observed, transport, errors,
      reconcileOriginal: async (index: number, newKey?: string) => {
        const original = originals[index]
        if (!original) throw new Error('M5_ORIGINAL_REQUEST_NOT_CAPTURED')
        const result = await fetch(upstream + original.path, { method: original.method,
          headers: { ...original.headers, ...(newKey ? { 'idempotency-key': newKey } : {}) }, body: Uint8Array.from(original.body) })
        return { status: result.status, data: await result.json() as unknown, originalEHash: fingerprint(original.headers.authorization ?? '') }
      },
    }
  }
  return { ...fixture, startApi, lossProxy, pairClient, refreshExecution, createClientExecution, secondHuman, close: async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited }
    for (const server of listeners) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) }
    await fixture.close()
    saveJointEvidence('owned-processes.json', { processes, ownedProxyListenersClosed: listeners.every(server => !server.listening), recoveryPreserved: true })
  }, runId: randomUUID() }
}
