import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

assert.equal(process.version, 'v22.19.0')
const root = path.resolve(process.argv[2])
const executableSha256 = createHash('sha256').update(readFileSync(process.execPath)).digest('hex')
if (process.argv.includes('--repeat')) {
  const startupRuns = []
  for (let iteration = 0; iteration < 12; iteration++) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), root], {
      encoding: 'utf8', timeout: 60_000, maxBuffer: 128 * 1024,
    })
    const row = { iteration, exitCode: child.status, signal: child.signal,
      stdoutSha256: createHash('sha256').update(child.stdout ?? '').digest('hex'),
      stderrSha256: createHash('sha256').update(child.stderr ?? '').digest('hex') }
    if (child.stdout?.trim()) {
      try { row.measurement = JSON.parse(child.stdout) } catch { /* 只保摘要，不导出原生私有转储。 */ }
    }
    startupRuns.push(row)
    if (child.status !== 0 || child.error) break
  }
  console.log(JSON.stringify({ executableSha256, mode: 'startup-only', fullProductAcceptance: false, startupRuns }))
  process.exit(startupRuns.length === 12 && startupRuns.every(row => row.exitCode === 0) ? 0 : 1)
}

// 每个子进程重新导入实际MCP图；不发送MCP POST、不请求资格、不强制GC或改变JIT。
const began = performance.now(), cpu = process.cpuUsage()
const { createWorkMeshMcpHttpServer } = await import(pathToFileURL(path.join(root, 'dist/http.js')))
const importMilliseconds = performance.now() - began
let apiReadinessRequests = 0, unknownRequests = 0
const fixture = createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/readyz') {
    unknownRequests++; response.writeHead(500).end(); return
  }
  apiReadinessRequests++
  response.writeHead(200, { 'content-type': 'application/json' }).end('{"status":"ok"}')
})
fixture.listen(0, '127.0.0.1')
await once(fixture, 'listening')
const mcp = await createWorkMeshMcpHttpServer({
  baseUrl: `http://127.0.0.1:${fixture.address().port}`, coordination: true,
})
mcp.listen(0, '127.0.0.1')
await once(mcp, 'listening')
let stage = 'readiness-1', readinessStatus
try {
  for (let i = 0; i < 2; i++) {
    stage = `readiness-${i + 1}`
    const response = await fetch(`http://127.0.0.1:${mcp.address().port}/readyz`, { signal: AbortSignal.timeout(2_000) })
    readinessStatus = response.status
    assert.equal(response.status, 200)
    await response.arrayBuffer()
  }
  await new Promise(resolve => setTimeout(resolve, 2_000))
  assert.equal(apiReadinessRequests, 2)
  assert.equal(unknownRequests, 0)
  console.log(JSON.stringify({ executableSha256, importMilliseconds,
    elapsedMilliseconds: performance.now() - began, cpu: process.cpuUsage(cpu),
    apiReadinessRequests, unknownRequests, mcpPosts: 0, qualifiedReads: 0 }))
} catch (error) {
  console.log(JSON.stringify({ executableSha256, importMilliseconds, stage, readinessStatus,
    errorType: ['AssertionError', 'TimeoutError', 'AbortError'].includes(error.name) ? error.name : 'OtherError',
    elapsedMilliseconds: performance.now() - began, apiReadinessRequests, unknownRequests, mcpPosts: 0, qualifiedReads: 0 }))
  process.exitCode = 1
} finally {
  mcp.closeAllConnections()
  fixture.closeAllConnections()
  await Promise.all([new Promise(resolve => mcp.close(resolve)), new Promise(resolve => fixture.close(resolve))])
}
