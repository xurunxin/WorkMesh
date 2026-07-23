import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import { createWorkMeshMcpServer, type McpMode } from './index.js'

export async function createWorkMeshMcpHttpServer(options: { baseUrl: string; sessionToken: string; accessToken: string; mode?: McpMode }) {
  const mcp = createWorkMeshMcpServer({ client: new WorkMeshClient({ baseUrl: options.baseUrl, sessionToken: options.sessionToken }), mode: options.mode })
  // This is the current Streamable HTTP transport, not the deprecated HTTP+SSE transport.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await mcp.connect(transport)
  return createServer(async (request, response) => {
    if (request.url !== '/mcp') { response.writeHead(404).end(); return }
    if (!bearerMatches(request, options.accessToken)) { response.writeHead(401, { 'www-authenticate': 'Bearer' }).end(); return }
    await transport.handleRequest(request, response)
  })
}

function bearerMatches(request: IncomingMessage, expected: string): boolean {
  const value = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!value) return false
  const actual = Buffer.from(value), target = Buffer.from(expected)
  return actual.length === target.length && timingSafeEqual(actual, target)
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const baseUrl = process.env.WORKMESH_API_URL
  const sessionToken = process.env.WORKMESH_SESSION_TOKEN
  const accessToken = process.env.WORKMESH_MCP_ACCESS_TOKEN
  if (!baseUrl || !sessionToken || !accessToken) throw new Error('WORKMESH_API_URL, WORKMESH_SESSION_TOKEN, and WORKMESH_MCP_ACCESS_TOKEN are required')
  const server = await createWorkMeshMcpHttpServer({ baseUrl, sessionToken, accessToken, mode: process.env.WORKMESH_MCP_MODE === 'read-only' ? 'read-only' : 'read-write' })
  const host = process.env.HOST ?? '0.0.0.0'
  const port = Number(process.env.PORT ?? 3002)
  server.listen(port, host, () => console.log(`WorkMesh MCP listening on ${host}:${port}`))
}
