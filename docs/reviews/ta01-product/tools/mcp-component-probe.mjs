import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { Session } from 'node:inspector'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// 只测合成身份和回环 fixture，不连接实际 API／数据库，也不改生产实现。
assert.equal(process.version, 'v22.19.0')
const root = path.resolve(process.argv[2])
const require = createRequire(path.join(root, 'package.json'))
const started = performance.now()
const { createWorkMeshMcpHttpServer } = await import(pathToFileURL(path.join(root, 'dist/http.js')))
const { createWorkMeshMcpServer } = await import(pathToFileURL(path.join(root, 'dist/index.js')))
const { WorkMeshClient } = await import(pathToFileURL(require.resolve('@workmesh/agent-sdk')))
const { McpServer } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/server/mcp.js')))
const { createAgentCapabilityManifest, qualifyAgentCapabilityManifest, capabilitySchema, featureKeySchema } =
  await import(pathToFileURL(require.resolve('@workmesh/contracts')))
const importMilliseconds = performance.now() - started
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const itemId = id(2), teamId = id(8), workspaceId = id(7), sessionId = id(1)
const actors = [id(6), id(9)]
const tokens = ['ta01-isolated-fixture-a', 'ta01-isolated-fixture-b']
const features = Object.fromEntries(featureKeySchema.options.map(key => [key, true]))
const workReadFixture = process.argv.includes('--work-read-fixture')
const fixtureCapabilities = workReadFixture ? ['work:read'] : capabilitySchema.options
const manifests = actors.map(actorId => qualifyAgentCapabilityManifest(createAgentCapabilityManifest({
  actorId, sessionId, sessionState: 'executing', sessionRevision: 1,
  effectiveCapabilities: fixtureCapabilities,
  capabilityScope: { workspaceId, teamIds: [teamId], projectIds: [], workItemIds: [], repositoryIds: [], capabilities: fixtureCapabilities },
  supportedProtocols: ['mcp'], pushConfigured: false, features,
}), { identity: { actorId, sessionId, credentialMode: 'coordination_connection', sessionKind: 'coordination',
  delegationRole: 'coordinator', delegationScopeType: 'team' }, features, workItemId: null, projectId: null }))
const narrowFixture = process.argv.includes('--narrow-fixture')
if (narrowFixture) {
  // 反事实只改变合成响应大小；不是上线方案，不改变实际发现/授权合同。
  for (const manifest of manifests) {
    manifest.operations = manifest.operations.filter(row => row.operationId === 'getWorkItem')
    manifest.discovery.operations = manifest.discovery.operations.filter(row => row.operationId === 'getWorkItem')
  }
}
let activeTrace = [], unknownRequests = 0
let clientSegments = []
if (process.argv.includes('--profile') || process.argv.includes('--segments')) {
  // 仅此隔离进程包裹实际SDK调用；不改请求、鉴权、返回值或生产文件。
  for (const [method, label] of [['getQualifiedAgentCapabilities', 'qualified'], ['getWorkItem', 'work-item']]) {
    const original = WorkMeshClient.prototype[method]
    WorkMeshClient.prototype[method] = async function (...args) {
      const begin = performance.now(), cpu = process.cpuUsage()
      try { return await Reflect.apply(original, this, args) }
      finally { clientSegments.push({ label, elapsedMilliseconds: performance.now() - begin, ...process.cpuUsage(cpu) }) }
    }
  }
}
const fixture = createServer((request, response) => {
  const actor = tokens.indexOf(request.headers['x-workmesh-installation-token'])
  let label, body
  if (actor >= 0 && request.method === 'GET' && request.url === '/api/v1/agent-capabilities?discovery=qualified') {
    label = 'qualified'; body = manifests[actor]
  } else if (actor >= 0 && request.method === 'GET' && request.url === `/api/v1/work-items/${itemId}`) {
    label = 'work-item'; body = { id: itemId, title: 'isolated fixture', probeActor: actors[actor] }
  } else {
    unknownRequests++; response.writeHead(500).end(); return
  }
  const row = { label, received: performance.now() }
  activeTrace.push(row)
  response.on('finish', () => { row.finished = performance.now() })
  response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))
})
fixture.listen(0, '127.0.0.1')
await once(fixture, 'listening')
const baseUrl = `http://127.0.0.1:${fixture.address().port}`
let mcp
const measure = async operation => {
  const begin = performance.now(), cpu = process.cpuUsage()
  await operation()
  const used = process.cpuUsage(cpu)
  return { elapsedMilliseconds: performance.now() - begin, userCpuMicroseconds: used.user, systemCpuMicroseconds: used.system }
}
try {
  const constructors = { sdkOnly: [], workmesh: [] }
  for (let i = 0; i < 12; i++) {
    constructors.sdkOnly.push(await measure(async () => { await new McpServer({ name: 'control', version: '1.0.0' }).close() }))
    constructors.workmesh.push(await measure(async () => {
      const client = new WorkMeshClient({ baseUrl, coordinationToken: tokens[i % 2], installationToken: tokens[i % 2] })
      await createWorkMeshMcpServer({ client, coordination: true, transport: 'http' }).close()
    }))
  }
  assert.equal(activeTrace.length, 0)
  mcp = await createWorkMeshMcpHttpServer({ baseUrl, coordination: true })
  mcp.listen(0, '127.0.0.1')
  await once(mcp, 'listening')
  const endpoint = `http://127.0.0.1:${mcp.address().port}/mcp`
  const profiler = process.argv.includes('--profile') ? new Session() : undefined
  const inspectorPost = (method, params = {}) => new Promise((resolve, reject) =>
    profiler.post(method, params, (error, result) => error ? reject(error) : resolve(result)))
  if (profiler) {
    profiler.connect()
    await inspectorPost('Profiler.enable')
    await inspectorPost('Profiler.setSamplingInterval', { interval: 1000 })
    await inspectorPost('Profiler.start')
  }
  const requests = []
  for (let i = 0; i < 12; i++) {
    for (const method of ['initialize', 'tools/call']) {
      activeTrace = []
      clientSegments = []
      const begin = performance.now()
      const measured = await measure(async () => {
        const response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(30_000), headers: {
          'content-type': 'application/json', accept: 'application/json, text/event-stream',
          'x-workmesh-installation-token': tokens[i % 2],
        }, body: JSON.stringify({ jsonrpc: '2.0', id: method === 'initialize' ? 1 : 2, method,
          params: method === 'initialize' ? { protocolVersion: '2024-11-05', capabilities: {},
            clientInfo: { name: 'isolated-component-probe', version: '1.0.0' } }
            : { name: 'get_work_item', arguments: { workItemId: itemId } } }) })
        assert.equal(response.status, 200)
        const text = await response.text()
        const reply = JSON.parse(response.headers.get('content-type').includes('text/event-stream')
          ? text.split(/\r?\n/).find(line => line.startsWith('data:')).slice(5) : text)
        assert.equal(reply.error, undefined)
        assert.notEqual(reply.result?.isError, true)
        if (method === 'tools/call') {
          const result = reply.result.structuredContent?.data ?? JSON.parse(reply.result.content.find(entry => entry.type === 'text').text)
          assert.equal(result.id, itemId)
          assert.equal(result.probeActor, actors[i % 2])
        }
      })
      assert.deepEqual(activeTrace.map(row => row.label), method === 'initialize' ? [] : ['qualified', 'work-item'])
      requests.push({ iteration: i, method, ...measured,
        clientSegments: [...clientSegments],
        fixtureCalls: activeTrace.map(row => ({ label: row.label,
          receivedMilliseconds: row.received - begin, finishedMilliseconds: row.finished - begin })) })
    }
  }
  assert.equal(unknownRequests, 0)
  let cpuProfile
  if (profiler) {
    const { profile } = await inspectorPost('Profiler.stop')
    profiler.disconnect()
    const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame]))
    const grouped = new Map()
    for (let i = 0; i < profile.samples.length; i++) {
      const frame = nodes.get(profile.samples[i])
      let module = 'runtime'
      const match = /\/pkgs\/(\d+)\//.exec(frame.url)
      if (match) module = JSON.parse(readFileSync(`/tmp/probe/pkgs/${match[1]}/package.json`, 'utf8')).name
      const functionName = ['(idle)', '(program)', '(garbage collector)'].includes(frame.functionName) ? frame.functionName
        : /^[A-Za-z0-9_.$<> :/-]{0,100}$/.test(frame.functionName) ? frame.functionName || '(anonymous)' : '(other)'
      const key = module + ':' + functionName
      const row = grouped.get(key) ?? { module, functionName, microseconds: 0, samples: 0 }
      row.microseconds += profile.timeDeltas[i]
      row.samples++
      grouped.set(key, row)
    }
    cpuProfile = { sampleCount: profile.samples.length, sampleTimeDeltasAreWallTime: true,
      top: [...grouped.values()].sort((a, b) => b.samples - a.samples).slice(0, 15) }
  }
  console.log(JSON.stringify({ explanation: '锁定Node的MCP组件合成回环测量；没有PG/Redis/S3、真实授权或完整guest。不把有限未崩溃样本记为排除原生故障。',
    node: process.version, architecture: process.arch, platform: process.platform, v8: process.versions.v8,
    openssl: process.versions.openssl, executableSha256: createHash('sha256').update(readFileSync(process.execPath)).digest('hex'),
    importMilliseconds, constructors, requests, cpuProfile, narrowFixture, workReadFixture, unknownRequests, identitiesChecked: actors.length,
    qualifiedResponseBytes: Buffer.byteLength(JSON.stringify(manifests[0])),
    qualifiedOperationCount: manifests[0].discovery.operations.length, rssBytes: process.memoryUsage().rss }))
} finally {
  if (mcp) { mcp.closeAllConnections(); await new Promise(resolve => mcp.close(resolve)) }
  fixture.closeAllConnections()
  await new Promise(resolve => fixture.close(resolve))
}
