import { createWorkMeshMcpHttpServer } from 'file:///G:/Projects/MetronX/worktrees/workmesh-human-experience-v31-checkpoint/apps/mcp/src/http.ts'

const baseUrl = process.env.WORKMESH_API_URL
if (!baseUrl) throw new Error('WORKMESH_API_URL is required')
const browserOrigin = process.env.WORKMESH_BROWSER_ORIGIN
if (!browserOrigin) throw new Error('WORKMESH_BROWSER_ORIGIN is required')

const server = await createWorkMeshMcpHttpServer({
  baseUrl,
  browserOrigin,
  coordination: true,
  mode: process.env.WORKMESH_MCP_MODE === 'read-only' ? 'read-only' : 'read-write',
})
const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 3302)
server.listen(port, host, () => console.log(`WorkMesh MCP listening on ${host}:${port}`))

let stopping = false
const stop = (): void => {
  if (stopping) return
  stopping = true
  server.workmeshRuntime.accepting = false
  server.closeAllConnections()
  server.close(() => process.exit(0))
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)
