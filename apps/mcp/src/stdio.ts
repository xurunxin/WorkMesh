import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import { createWorkMeshMcpServer } from './index.js'

const baseUrl = process.env.WORKMESH_API_URL
const sessionToken = process.env.WORKMESH_SESSION_TOKEN
const coordinationToken = process.env.WORKMESH_INSTALLATION_TOKEN
if (!baseUrl || (!sessionToken && !coordinationToken)) throw new Error('WORKMESH_API_URL and either WORKMESH_SESSION_TOKEN or WORKMESH_INSTALLATION_TOKEN are required')
const server = createWorkMeshMcpServer({
  client: new WorkMeshClient(coordinationToken ? { baseUrl, coordinationToken } : { baseUrl, sessionToken: sessionToken! }),
  mode: process.env.WORKMESH_MCP_MODE === 'read-only' ? 'read-only' : 'read-write',
  coordination: Boolean(coordinationToken),
})
await server.connect(new StdioServerTransport())
