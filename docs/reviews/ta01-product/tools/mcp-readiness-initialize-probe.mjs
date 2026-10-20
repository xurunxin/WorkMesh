import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// 仅隔离合成小测：真实 MCP 健康读取与 initialize 重叠，不接实际业务服务。
assert.equal(process.version, 'v22.19.0')
const executableSha256 = createHash('sha256').update(readFileSync(process.execPath)).digest('hex')
assert.equal(executableSha256, '638c77326270093b1251a5e72b4335c94c74856a210460341c73d6f3da647328')
const root = path.resolve(process.argv[2])
const { createWorkMeshMcpHttpServer } = await import(pathToFileURL(path.join(root, 'dist/http.js')))
let currentMode, entered, readinessReads = 0, unknownRequests = 0
const fixture = createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/readyz') {
    unknownRequests++; response.writeHead(500).end(); return
  }
  readinessReads++
  const delay = currentMode === 'abort' ? 2_000 : 0
  const timer = setTimeout(() => {
    response.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}')
  }, delay)
  response.once('close', () => clearTimeout(timer))
  entered?.()
})
fixture.listen(0, '127.0.0.1')
await once(fixture, 'listening')
const mcp = await createWorkMeshMcpHttpServer({
  baseUrl: `http://127.0.0.1:${fixture.address().port}`, coordination: true,
})
mcp.listen(0, '127.0.0.1')
await once(mcp, 'listening')
const origin = `http://127.0.0.1:${mcp.address().port}`
const requests = []
let stage = 'begin'
try {
  for (let iteration = 0; iteration < 12; iteration++) {
    for (const mode of ['healthy', 'abort']) {
      stage = `${mode}-${iteration}`
      currentMode = mode
      const start = performance.now(), cpu = process.cpuUsage()
      const arrived = new Promise(resolve => { entered = resolve })
      const health = fetch(`${origin}/readyz`, { signal: AbortSignal.timeout(30_000) })
      // 健康上游已进入合成夹具后，才发送原 initialize 形状；不假定 CPU 调度重叠。
      await Promise.race([arrived, health.then(() => { throw new Error('Readiness completed before fixture entry') })])
      const initializeStart = performance.now()
      const response = await fetch(`${origin}/mcp`, { method: 'POST', signal: AbortSignal.timeout(30_000),
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
          'x-workmesh-installation-token': 'ta01-isolated-no-business-fixture' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
          protocolVersion: '2024-11-05', capabilities: {},
          clientInfo: { name: 'workmesh-installer', version: '1.0.0' },
        } }) })
      assert.equal(response.status, 200)
      const text = await response.text()
      const reply = JSON.parse(response.headers.get('content-type').includes('text/event-stream')
        ? text.split(/\r?\n/).find(line => line.startsWith('data:')).slice(5) : text)
      assert.equal(reply.id, 1)
      assert.equal(reply.error, undefined)
      assert.equal(reply.result.serverInfo.name, 'workmesh-mcp')
      const initializeMilliseconds = performance.now() - initializeStart
      const healthResponse = await health
      await healthResponse.arrayBuffer()
      assert.equal(healthResponse.status, mode === 'abort' ? 503 : 200)
      requests.push({ iteration, mode, initializeMilliseconds, healthStatus: healthResponse.status,
        elapsedMilliseconds: performance.now() - start, cpu: process.cpuUsage(cpu) })
      assert.equal(unknownRequests, 0)
      // 每10秒至多一次健康发起；原服务自身的1秒上游期限保持。
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 10_000 - (performance.now() - start))))
    }
  }
  assert.equal(readinessReads, 24)
  console.log(JSON.stringify({ mode: 'readiness-initialize-overlap', fullProductAcceptance: false,
    executableSha256, architecture: process.arch, platform: process.platform, requests,
    readinessReads, qualifiedReads: 0, workItemReads: 0, unknownRequests }))
} catch (error) {
  console.log(JSON.stringify({ mode: 'readiness-initialize-overlap', fullProductAcceptance: false,
    executableSha256, stage, completedRequests: requests.length,
    errorType: ['AssertionError', 'TimeoutError', 'AbortError'].includes(error.name) ? error.name : 'OtherError',
    readinessReads, unknownRequests }))
  process.exitCode = 1
} finally {
  mcp.closeAllConnections()
  fixture.closeAllConnections()
  await Promise.all([new Promise(resolve => mcp.close(resolve)), new Promise(resolve => fixture.close(resolve))])
}
