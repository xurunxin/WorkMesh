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

  it('exposes the expected unauthenticated 401 to the exact Browser origin', async () => {
    const browserOrigin = 'http://127.0.0.1:3300'
    const server = await createWorkMeshMcpHttpServer({
      baseUrl: 'http://127.0.0.1:3001',
      sessionToken: 'session-token',
      accessToken: 'mcp-token',
      browserOrigin,
      mode: 'read-only',
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP listening address')
    const url = `http://127.0.0.1:${address.port}/mcp`
    try {
      const readiness = await fetch(url, { headers: { origin: browserOrigin } })
      expect(readiness.status).toBe(401)
      expect(readiness.headers.get('access-control-allow-origin')).toBe(browserOrigin)
      expect(readiness.headers.get('vary')).toBe('Origin')

      const preflight = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          origin: browserOrigin,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'accept',
        },
      })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-origin')).toBe(browserOrigin)
      expect(preflight.headers.get('access-control-allow-methods')).toContain('GET')
    } finally {
      server.close()
      await once(server, 'close')
    }
  })

  it('does not grant MCP Browser CORS to a different origin', async () => {
    const server = await createWorkMeshMcpHttpServer({
      baseUrl: 'http://127.0.0.1:3001',
      sessionToken: 'session-token',
      accessToken: 'mcp-token',
      browserOrigin: 'http://127.0.0.1:3300',
      mode: 'read-only',
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP listening address')
    const url = `http://127.0.0.1:${address.port}/mcp`
    try {
      const readiness = await fetch(url, { headers: { origin: 'http://127.0.0.1:3301' } })
      expect(readiness.status).toBe(401)
      expect(readiness.headers.get('access-control-allow-origin')).toBeNull()
      const preflight = await fetch(url, { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:3301' } })
      expect(preflight.status).toBe(403)
    } finally {
      server.close()
      await once(server, 'close')
    }
  })

  it.each([
    'ftp://127.0.0.1:3300',
    'http://user:secret@127.0.0.1:3300',
    'http://127.0.0.1:3300/path',
    'http://127.0.0.1:3300?query=1',
    'http://127.0.0.1:3300#fragment',
  ])('rejects a non-origin Browser CORS value: %s', async (browserOrigin) => {
    await expect(createWorkMeshMcpHttpServer({
      baseUrl: 'http://127.0.0.1:3001',
      sessionToken: 'session-token',
      accessToken: 'mcp-token',
      browserOrigin,
      mode: 'read-only',
    })).rejects.toThrow('WORKMESH_BROWSER_ORIGIN must be an absolute HTTP origin')
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
