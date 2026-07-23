import { createWorkMeshMcpServer } from './index.js'
import { WorkMeshClient } from '@workmesh/agent-sdk'

const server = createWorkMeshMcpServer({ client: new WorkMeshClient({ baseUrl: 'http://127.0.0.1:3001', sessionToken: 'smoke-token' }), mode: 'read-only' })
if (!server) throw new Error('MCP server was not constructed')
process.stdout.write('MCP smoke: server constructed in read-only mode\n')
