import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createWorkMeshMcpHttpServer } from './http.js'

describe('WorkMesh Streamable HTTP entry point', () => {
  it('requires the MCP boundary bearer token before invoking the transport', async () => {
    const server = await createWorkMeshMcpHttpServer({ baseUrl: 'http://127.0.0.1:3001', sessionToken: 'session-token', accessToken: 'mcp-token', mode: 'read-only' })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP listening address')
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, { method: 'POST' })
      expect(response.status).toBe(401)
    } finally {
      server.close()
      await once(server, 'close')
    }
  })
})
