import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AuthRateLimitStore } from './auth-rate-limit/redis-store.js'

class FakeStore implements AuthRateLimitStore {
  async eval(): Promise<unknown> { return [] }
  async set(): Promise<string | null> { return 'OK' }
  async ping(): Promise<string> { return 'PONG' }
  async close(): Promise<void> {}
}

describe('API process health', () => {
  let app: FastifyInstance
  let dependencyReady = true

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://workmesh:test@127.0.0.1:5432/workmesh_test')
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6379')
    vi.stubEnv('SESSION_SECRET', 'api-health-test-session-secret-0001')
    vi.stubEnv('WORKMESH_BOOTSTRAP_TOKEN', randomBytes(32).toString('base64url'))
    vi.stubEnv('RUN_INTEGRATION', '1')
    const { buildApp } = await import('./server.js')
    app = buildApp({
      logger: false,
      authRateLimitStore: new FakeStore(),
      readinessProbe: async () => {
        if (!dependencyReady) throw new Error('dependency unavailable')
      },
    })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    vi.unstubAllEnvs()
  })

  it('keeps liveness independent from dependency readiness', async () => {
    dependencyReady = false
    expect((await app.inject({ method: 'GET', url: '/livez' })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(503)
    dependencyReady = true
    expect((await app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200)
  })

  it('withdraws readiness before graceful close', async () => {
    app.workmeshRuntime.accepting = false
    expect((await app.inject({ method: 'GET', url: '/livez' })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(503)
  })
})
