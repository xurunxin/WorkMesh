import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import { createWorkMeshMcpServer, type McpMode } from './index.js'

export type WorkMeshMcpHttpServer = Server & {
  workmeshRuntime: {
    accepting: boolean
  }
}

export async function createWorkMeshMcpHttpServer(options: {
  baseUrl: string
  sessionToken?: string
  accessToken?: string
  coordination?: boolean
  mode?: McpMode
  browserOrigin?: string
  readinessProbe?: () => Promise<void>
}): Promise<WorkMeshMcpHttpServer> {
  if (!options.coordination && (!options.sessionToken || !options.accessToken))
    throw new Error('Static MCP mode requires sessionToken and accessToken')
  const runtime = { accepting: true }
  const browserOrigin = options.browserOrigin ? normalizeBrowserOrigin(options.browserOrigin) : undefined
  const readinessProbe = options.readinessProbe ?? (async () => {
    const response = await fetch(new URL('/readyz', options.baseUrl), {
      signal: AbortSignal.timeout(1_000),
    })
    if (!response.ok) throw new Error('MCP upstream API is not ready')
  })
  const server = createServer(async (request, response) => {
    if (request.url === '/livez') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'ok' }))
      return
    }
    if (request.url === '/readyz') {
      if (!runtime.accepting) {
        response.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'not_ready' }))
        return
      }
      try {
        await readinessProbe()
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'ok' }))
      } catch {
        response.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'not_ready' }))
      }
      return
    }
    if (request.url !== '/mcp') { response.writeHead(404).end(); return }
    const requestOrigin = headerValue(request, 'origin')
    const cors = requestOrigin && browserOrigin === requestOrigin
      ? {
          'access-control-allow-origin': browserOrigin,
          'access-control-expose-headers': 'mcp-session-id',
          vary: 'Origin',
        }
      : undefined
    if (request.method === 'OPTIONS') {
      if (!cors) { response.writeHead(403).end(); return }
      response.writeHead(204, {
        ...cors,
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
        'access-control-allow-headers': 'accept, content-type, last-event-id, mcp-session-id, x-workmesh-installation-token',
        'access-control-max-age': '600',
      }).end()
      return
    }
    if (cors) for (const [name, value] of Object.entries(cors)) response.setHeader(name, value)
    if (!runtime.accepting) { response.writeHead(503).end(); return }
    const coordinationToken = headerValue(request, 'x-workmesh-installation-token')
    const dynamic = options.coordination && coordinationToken
    if (!dynamic && (!options.accessToken || !bearerMatches(request, options.accessToken))) { response.writeHead(401, { 'www-authenticate': 'Bearer, X-WorkMesh-Installation-Token' }).end(); return }
    const client = new WorkMeshClient(dynamic
      ? { baseUrl: options.baseUrl, coordinationToken }
      : { baseUrl: options.baseUrl, sessionToken: options.sessionToken })
    const mcp = createWorkMeshMcpServer({ client, mode: options.mode, coordination: Boolean(dynamic) })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await mcp.connect(transport)
    await transport.handleRequest(request, response)
  }) as WorkMeshMcpHttpServer
  server.workmeshRuntime = runtime
  return server
}

function headerValue(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function bearerMatches(request: IncomingMessage, expected: string): boolean {
  const value = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!value) return false
  const actual = Buffer.from(value), target = Buffer.from(expected)
  return actual.length === target.length && timingSafeEqual(actual, target)
}

function normalizeBrowserOrigin(value: string): string {
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash)
    throw new Error('WORKMESH_BROWSER_ORIGIN must be an absolute HTTP origin without credentials, path, query, or fragment')
  return parsed.origin
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const baseUrl = process.env.WORKMESH_API_URL
  const sessionToken = process.env.WORKMESH_SESSION_TOKEN
  const accessToken = process.env.WORKMESH_MCP_ACCESS_TOKEN
  const browserOrigin = process.env.WORKMESH_BROWSER_ORIGIN
  const coordination = process.env.WORKMESH_BETA_COORDINATION_MCP === 'true'
  if (!baseUrl || (!coordination && (!sessionToken || !accessToken))) throw new Error('WORKMESH_API_URL and either Coordination MCP or static MCP credentials are required')
  const server = await createWorkMeshMcpHttpServer({ baseUrl, sessionToken, accessToken, coordination, browserOrigin, mode: process.env.WORKMESH_MCP_MODE === 'read-only' ? 'read-only' : 'read-write' })
  const host = process.env.HOST ?? '0.0.0.0'
  const port = Number(process.env.PORT ?? 3002)
  server.listen(port, host, () => console.log(`WorkMesh MCP listening on ${host}:${port}`))
  let stopping = false
  const stop = (): void => {
    if (stopping) return
    stopping = true
    server.workmeshRuntime.accepting = false
    const configured = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 30_000)
    const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : 30_000
    const timeout = setTimeout(() => {
      server.closeAllConnections()
      process.exit(1)
    }, timeoutMs)
    timeout.unref()
    server.close(error => {
      clearTimeout(timeout)
      if (error) {
        console.error('MCP graceful shutdown failed', error)
        process.exit(1)
      }
      process.exit(0)
    })
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}
