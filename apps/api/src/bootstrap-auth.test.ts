import crypto from 'node:crypto'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { loadConfig, type Config } from '@workmesh/config'
import { DomainError } from '@workmesh/domain'
import {
  installBootstrapAuthentication,
  verifyBootstrapRequest,
} from './bootstrap-auth.js'

const bootstrapToken = crypto.randomBytes(32).toString('base64url')
const baseEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://workmesh:workmesh@localhost/workmesh',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: 'bootstrap-auth-test-session-secret-0001',
  WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
} as const

async function buildVerifier(config: Config) {
  const app = Fastify({ logger: false })
  installBootstrapAuthentication(app, config)
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError)
      return reply.code(401).send({ error: { code: error.code, message: error.message } })
    throw error
  })
  app.post('/api/v1/auth/install', request => ({
    binding: verifyBootstrapRequest(request, config).credentialBinding,
  }))
  await app.ready()
  return app
}

describe('bootstrap request authentication', () => {
  it('accepts only the exact explicit bootstrap header and returns an irreversible stable binding', async () => {
    const app = await buildVerifier(loadConfig(baseEnvironment))
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      headers: { 'x-workmesh-bootstrap-token': bootstrapToken },
    })
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      headers: { 'x-workmesh-bootstrap-token': bootstrapToken },
    })
    expect(first.statusCode).toBe(200)
    expect(first.json()).toEqual(second.json())
    expect(first.body).not.toContain(bootstrapToken)
    await app.close()
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['malformed', 'not-base64url'],
    ['padded', `${bootstrapToken}=`],
    ['wrong', 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo5ODc2NTQzMjE'],
    ['comma joined', `${bootstrapToken},${bootstrapToken}`],
  ])('returns one uniform failure for a %s credential', async (_label, supplied) => {
    const app = await buildVerifier(loadConfig(baseEnvironment))
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      headers: supplied === undefined
        ? {}
        : { 'x-workmesh-bootstrap-token': supplied },
    })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: {
        code: 'BOOTSTRAP_AUTH_FAILED',
        message: 'Bootstrap authentication failed',
      },
    })
    await app.close()
  })

  it.each([
    ['missing', undefined],
    ['malformed', 'not-base64url'],
    ['wrong', 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo5ODc2NTQzMjE'],
    ['multivalue', `${bootstrapToken},${bootstrapToken}`],
  ])('always performs one fixed-length timing-safe comparison for %s input', async (_label, supplied) => {
    const comparison = vi.spyOn(crypto, 'timingSafeEqual')
    const app = await buildVerifier(loadConfig(baseEnvironment))
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      headers: supplied === undefined
        ? {}
        : { 'x-workmesh-bootstrap-token': supplied },
    })
    expect(response.statusCode).toBe(401)
    expect(comparison).toHaveBeenCalledTimes(1)
    const [left, right] = comparison.mock.calls[0]!
    expect(left).toHaveLength(32)
    expect(right).toHaveLength(32)
    comparison.mockRestore()
    await app.close()
  })

  it('rejects duplicated bootstrap header fields with the same uniform failure', async () => {
    const app = await buildVerifier(loadConfig(baseEnvironment))
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      headers: {
        'x-workmesh-bootstrap-token': [bootstrapToken, bootstrapToken],
      },
    })
    expect(response.statusCode).toBe(401)
    expect(response.json().error).toEqual({
      code: 'BOOTSTRAP_AUTH_FAILED',
      message: 'Bootstrap authentication failed',
    })
    await app.close()
  })

  it('allows token omission only from an unforwarded loopback peer in explicit bypass mode', async () => {
    const config = loadConfig({
      ...baseEnvironment,
      API_HOST: '127.0.0.1',
      WORKMESH_BOOTSTRAP_TOKEN: undefined,
      WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK: 'true',
    })
    const app = await buildVerifier(config)
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      remoteAddress: '127.0.0.1',
    })
    expect(accepted.statusCode).toBe(200)

    const addressHeaders: Array<[string, string]> = [
      ['forwarded', 'for=127.0.0.1'],
      ['x-forwarded-for', '127.0.0.1'],
      ['true-client-ip', '127.0.0.1'],
      ['fastly-client-ip', '127.0.0.1'],
      ['x-envoy-external-address', '127.0.0.1'],
    ]
    for (const [name, value] of addressHeaders) {
      const forwarded = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/install',
        remoteAddress: '127.0.0.1',
        headers: { [name]: value },
      })
      expect(forwarded.statusCode, name).toBe(401)
    }

    const remote = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      remoteAddress: '192.0.2.10',
    })
    expect(remote.statusCode).toBe(401)
    await app.close()
  })

  it('samples bounded audit fields without logging credentials or request metadata', async () => {
    const logs: string[] = []
    const app = Fastify({
      logger: {
        level: 'info',
        stream: { write: (message: string) => logs.push(message) },
      },
    })
    const config = loadConfig(baseEnvironment)
    installBootstrapAuthentication(app, config)
    app.setErrorHandler((error, _request, reply) =>
      reply.code(401).send({
        error: {
          message: error instanceof Error ? error.message : 'Rejected',
        },
      }))
    app.post('/api/v1/auth/install', request => {
      const authorization = verifyBootstrapRequest(request, config)
      app.auditBootstrapSuccess(request, authorization.mode)
      return { ok: true }
    })

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      headers: {
        'x-workmesh-bootstrap-token': 'wrong-bootstrap-token-sentinel',
        'user-agent': 'bootstrap-user-agent-sentinel',
      },
    })
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      headers: { 'x-workmesh-bootstrap-token': 'another-wrong-token-sentinel' },
    })
    for (let index = 0; index < 2; index += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/install',
        headers: { 'x-workmesh-bootstrap-token': bootstrapToken },
      })
    }

    const audited = logs
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .filter(entry => String(entry.event ?? '').startsWith('bootstrap.'))
    expect(audited).toHaveLength(2)
    expect(audited.map(entry => entry.outcome).sort())
      .toEqual(['accepted', 'rejected'])
    const serialized = JSON.stringify(audited)
    expect(serialized).not.toContain(bootstrapToken)
    expect(serialized).not.toContain('sentinel')
    await app.close()
  })
})
