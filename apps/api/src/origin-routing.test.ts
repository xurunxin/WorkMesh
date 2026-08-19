import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AuthRateLimitStore } from './auth-rate-limit/redis-store.js'
import { resolveAgentConnectionEndpointUrls } from './agent-connections.js'

class FakeStore implements AuthRateLimitStore {
  async eval(): Promise<unknown> { return [] }
  async set(): Promise<string | null> { return 'OK' }
  async ping(): Promise<string> { return 'PONG' }
  async close(): Promise<void> {}
}

describe('Browser CORS and public MCP origin routing', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://workmesh:test@127.0.0.1:5432/workmesh_test')
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6379')
    vi.stubEnv('SESSION_SECRET', 'origin-routing-test-session-secret-01')
    vi.stubEnv('WORKMESH_BOOTSTRAP_TOKEN', randomBytes(32).toString('base64url'))
    vi.stubEnv('WEB_ORIGIN', 'http://127.0.0.1:3300')
    vi.stubEnv('PUBLIC_MCP_ORIGIN', 'http://127.0.0.1:3301')
    vi.stubEnv('WORKMESH_BETA_COORDINATION_MCP', 'true')
    vi.stubEnv('RUN_INTEGRATION', '1')
    const { buildApp } = await import('./server.js')
    app = buildApp({
      logger: false,
      authRateLimitStore: new FakeStore(),
      readinessProbe: async () => {},
    })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    vi.unstubAllEnvs()
  })

  it('keeps credentialed Browser CORS on WEB_ORIGIN', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/me',
      headers: {
        origin: 'http://127.0.0.1:3300',
        'access-control-request-method': 'GET',
      },
    })

    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3300')
    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })

  it('derives public discovery URLs from PUBLIC_MCP_ORIGIN', async () => {
    const response = await app.inject({ method: 'GET', url: '/.well-known/workmesh-agent' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      mcpUrl: 'http://127.0.0.1:3301/mcp',
      wellKnownUrl: 'http://127.0.0.1:3301/.well-known/workmesh-agent',
    })
  })

  it('keeps Browser-delivered connect and Skill URLs on WEB_ORIGIN', () => {
    const urls = resolveAgentConnectionEndpointUrls({
      webOrigin: 'http://127.0.0.1:3300/',
      publicMcpOrigin: 'http://127.0.0.1:3301/',
    })

    expect(urls.connectUrl('pairing-code')).toBe('http://127.0.0.1:3300/connect#pairing-code')
    expect(urls.skillDownloadUrl).toBe('http://127.0.0.1:3300/skills/workmesh-1.1.0.md')
    expect(urls.mcpUrl).toBe('http://127.0.0.1:3301/mcp')
    expect(urls.wellKnownUrl).toBe('http://127.0.0.1:3301/.well-known/workmesh-agent')
  })
})
