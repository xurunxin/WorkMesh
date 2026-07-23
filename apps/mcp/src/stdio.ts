import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import { createWorkMeshMcpServer } from './index.js'

const baseUrl = process.env.WORKMESH_API_URL
const sessionToken = process.env.WORKMESH_SESSION_TOKEN
if (!baseUrl || !sessionToken) throw new Error('WORKMESH_API_URL and WORKMESH_SESSION_TOKEN are required')
const server = createWorkMeshMcpServer({ client: new WorkMeshClient({ baseUrl, sessionToken }), mode: process.env.WORKMESH_MCP_MODE === 'read-only' ? 'read-only' : 'read-write' })
await server.connect(new StdioServerTransport())
