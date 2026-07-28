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

  it('keeps liveness independent and withdraws readiness while draining', async () => {
    let dependencyReady = true
    const server = await createWorkMeshMcpHttpServer({
      baseUrl: 'http://127.0.0.1:3001',
      sessionToken: 'session-token',
      accessToken: 'mcp-token',
      mode: 'read-only',
      readinessProbe: async () => {
        if (!dependencyReady) throw new Error('dependency unavailable')
      },
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP listening address')
    try {
      dependencyReady = false
      expect((await fetch(`http://127.0.0.1:${address.port}/livez`)).status).toBe(200)
      expect((await fetch(`http://127.0.0.1:${address.port}/readyz`)).status).toBe(503)
      dependencyReady = true
      expect((await fetch(`http://127.0.0.1:${address.port}/readyz`)).status).toBe(200)
      server.workmeshRuntime.accepting = false
      expect((await fetch(`http://127.0.0.1:${address.port}/readyz`)).status).toBe(503)
      expect((await fetch(`http://127.0.0.1:${address.port}/mcp`, { method: 'POST' })).status).toBe(503)
    } finally {
      server.close()
      await once(server, 'close')
    }
  })
})
