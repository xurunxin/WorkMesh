import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'
import { createWorkMeshMcpServer } from './index.js'
import type { WorkMeshClient } from '@workmesh/agent-sdk'

const sessionId = '00000000-0000-4000-8000-000000000001'

async function connected(mode: 'read-only' | 'read-write', client: WorkMeshClient) {
  const server = createWorkMeshMcpServer({ client, mode })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const protocol = new Client({ name: 'mcp-test-client', version: '1.0.0' })
  await protocol.connect(clientTransport)
  return { server, protocol }
}

describe('WorkMesh MCP adapter', () => {
  it('omits mutation tools in read-only mode', async () => {
    const api = { listWorkItems: vi.fn(), getWorkItem: vi.fn() } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api)
    try {
      const names = (await protocol.listTools()).tools.map(tool => tool.name)
      expect(names).toContain('list_work_items')
      expect(names).toContain('get_work_item')
      expect(names).not.toContain('send_message')
      expect(names).not.toContain('ack_agent_session')
    } finally { await protocol.close(); await server.close() }
  })

  it('routes an MCP message tool call to the upstream SDK', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: sessionId, revision: 2 })
    const api = { sendMessage, listWorkItems: vi.fn(), getWorkItem: vi.fn() } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api)
    try {
      const result = await protocol.callTool({ name: 'send_message', arguments: { sessionId, bodyMarkdown: 'Please verify the test evidence.' } })
      expect(result.isError).not.toBe(true)
      expect(sendMessage).toHaveBeenCalledWith(sessionId, 'Please verify the test evidence.', { idempotencyKey: undefined })
    } finally { await protocol.close(); await server.close() }
  })
})
