import { loadFeatureConfig } from '@workmesh/config'
import { createWorkMeshMcpHttpServer } from '../../../apps/mcp/src/http.js'

// Test-only process. The caller owns its PID and dedicated database.
const port = Number(process.env.M5_SERVICE_PORT ?? 0)
let close: () => Promise<void>
if (['lifecycle', 'provider'].includes(process.env.M5_SERVICE_KIND ?? '')) {
  const { createDb } = await import('@workmesh/db')
  const db = createDb()
  const { createSessionLifecycleWorker } = await import('../../../apps/worker/src/session-lifecycle.js')
  const { createInterface } = await import('node:readline')
  const kind = process.env.M5_SERVICE_KIND!
  const worker = createSessionLifecycleWorker({ db, workerId: `m5-process-${process.pid}` })
  let tick: (() => Promise<void>) | undefined
  if (kind === 'provider') {
    const { createProviderActionWorker } = await import('../../../apps/worker/src/provider-actions.js')
    const { guardedGitProvider } = await import('@workmesh/git-provider')
    const { createFakeProviderRpc } = await import('./joint-clients.provider.fixture.js')
    const provider = createFakeProviderRpc(process.env.M5_PROVIDER_URL!, process.env.M5_PROVIDER_TOKEN!)
    const delivery = createProviderActionWorker({ db, workerId: `m5-provider-${process.pid}`,
      resolveProvider: (_kind, _connection, guard) => {
        if (!guard) throw new Error('M5_PROVIDER_MUTATION_GUARD_REQUIRED')
        return guardedGitProvider(provider, guard)
      } })
    tick = () => delivery.tick()
  }
  const input = createInterface({ input: process.stdin })
  input.on('line', line => { void (async () => {
    const request = JSON.parse(line) as { id: string; operation: string }
    if (request.operation !== (kind === 'provider' ? 'tick' : 'reconcileWorkbenchWaits')) throw new Error('M5_WORKER_OPERATION_NOT_ALLOWED')
    const count = tick ? (await tick(), 0) : await worker.reconcileWorkbenchWaits()
    console.log(JSON.stringify({ m5WorkerResult: true, pid: process.pid, id: request.id, count }))
  })().catch(error => { console.error(String(error)); process.exitCode = 1 }) })
  console.log(JSON.stringify({ m5Service: kind, pid: process.pid }))
  close = async () => { input.close(); await db.end() }
} else if (process.env.M5_SERVICE_KIND === 'mcp') {
  const server = await createWorkMeshMcpHttpServer({ baseUrl: process.env.M5_SERVICE_API_URL!, mode: 'read-write',
    ...(process.env.M5_SERVICE_SESSION_TOKEN ? { sessionToken: process.env.M5_SERVICE_SESSION_TOKEN, accessToken: process.env.M5_SERVICE_ACCESS_TOKEN! } : { coordination: true }) })
  await new Promise<void>(done => server.listen(port, '127.0.0.1', done))
  server.on('request', request => console.log(JSON.stringify({ m5Request: true, pid: process.pid, method: request.method, path: request.url })))
  console.log(JSON.stringify({ m5Service: 'mcp', url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, pid: process.pid }))
  close = async () => { server.workmeshRuntime.accepting = false; server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) }
} else {
  const { buildApp } = await import('../../../apps/api/src/server.js')
  const app = buildApp({ features: loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'true', WORKMESH_BETA_PLANNING: 'true' }), logger: { level: 'error' } })
  const url = await app.listen({ port, host: '127.0.0.1' })
  console.log(JSON.stringify({ m5Service: 'api', url, pid: process.pid }))
  close = () => app.close()
}
let closing = false
const stop = () => { if (!closing) { closing = true; void close().then(() => process.exit(0)) } }
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
// Owned stdio gives Windows a graceful exit without terminating a healthy job.
process.stdin.resume()
process.stdin.once('end', stop)
