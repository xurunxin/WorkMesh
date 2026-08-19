import { randomBytes } from 'node:crypto'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import type { RoutePolicyManifestEntry } from '@workmesh/contracts'
import { installRoutePolicyInventory } from './route-policy.js'

const route = (overrides: Partial<RoutePolicyManifestEntry> = {}): RoutePolicyManifestEntry => ({
  method: 'GET',
  path: '/declared/{id}',
  operationId: 'getDeclared',
  policyId: 'route.getDeclared',
  authentication: 'human_session',
  actorKinds: ['human'],
  human: {
    workspaceRoles: ['admin', 'member'],
    teamRoles: ['admin', 'maintainer', 'member'],
    membership: 'resolved_team',
    ownerMayManage: false,
  },
  agent: {
    capabilities: [],
    sessionBinding: 'none',
    requireActiveSession: false,
    requireActiveDelegation: false,
    requireLiveGrantIntersection: false,
    resourceScope: 'resolved_resource',
  },
  resourceResolverId: 'work_item',
  approval: { required: false, bindsActionFingerprint: false },
  lease: { required: false, grantsAuthorization: false },
  revision: 'none',
  idempotency: 'none',
  secretReplay: 'none',
  credentialRateLimit: 'none',
  feature: { key: null, tier: 'stable', disabledBehavior: 'available' },
  audit: { denial: 'required', heartbeatAmplification: 'suppress_repeated' },
  bindings: {
    rest: { method: 'GET', path: '/declared/{id}' },
    sse: false,
    sdkOperationId: 'getDeclared',
    mcpOperationId: 'getDeclared',
  },
  ...overrides,
})

describe('Fastify route policy inventory', () => {
  it('registers the complete production route surface', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://workmesh:workmesh@localhost:5432/workmesh')
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')
    vi.stubEnv('SESSION_SECRET', 'route-policy-test-session-secret-32')
    vi.stubEnv('WORKMESH_BOOTSTRAP_TOKEN', randomBytes(32).toString('base64url'))
    vi.stubEnv('RUN_INTEGRATION', '1')
    const { buildApp } = await import('../server.js')
    const app = buildApp()
    await app.ready()
    await app.close()
    vi.unstubAllEnvs()
  }, 15_000)

  it('binds declared routes and accepts Fastify automatic HEAD', async () => {
    const app = Fastify()
    const inventory = installRoutePolicyInventory(app, [route()])
    app.get('/declared/:id', async () => ({ ok: true }))

    await app.ready()
    expect(inventory.registeredRoutes()).toEqual(['GET /declared/{id}'])
    await app.close()
  })

  it('rejects an undeclared route during registration', () => {
    const app = Fastify()
    installRoutePolicyInventory(app, [route()])

    expect(() => app.post('/undeclared', async () => ({ ok: true })))
      .toThrow(/Undeclared route: POST \/undeclared/)
  })

  it('rejects an explicit mismatched policy binding', () => {
    const app = Fastify()
    installRoutePolicyInventory(app, [route()])

    expect(() => app.get('/declared/:id', {
      config: { workmeshPolicyId: 'route.someOtherPolicy' },
    }, async () => ({ ok: true }))).toThrow(/Route policy mismatch/)
  })

  it('fails readiness when a declared route is missing', async () => {
    const app = Fastify()
    installRoutePolicyInventory(app, [route()])

    await expect(app.ready()).rejects.toThrow(/Missing route registrations: GET \/declared\/{id}/)
  })

  it('rejects duplicate manifest declarations before routes can register', () => {
    const app = Fastify()
    expect(() => installRoutePolicyInventory(app, [route(), route()]))
      .toThrow(/Duplicate route policy declaration/)
  })

  it('drops integration-only operations from the expected set when RUN_INTEGRATION is off', async () => {
    const previous = process.env.RUN_INTEGRATION
    process.env.RUN_INTEGRATION = '0'
    try {
      const app = Fastify()
      const inventory = installRoutePolicyInventory(app, [route({
        method: 'POST',
        path: '/api/v1/test/reset-install',
        operationId: 'resetInstall',
      })])
      // The reset-install handler would itself be skipped in this mode, so
      // the inventory must not require it; the onReady hook must pass.
      await app.ready()
      expect(inventory.registeredRoutes()).toEqual([])
      await app.close()
    } finally {
      if (previous === undefined) delete process.env.RUN_INTEGRATION
      else process.env.RUN_INTEGRATION = previous
    }
  })

  it('keeps integration-only operations in the expected set when RUN_INTEGRATION=1', async () => {
    const previous = process.env.RUN_INTEGRATION
    process.env.RUN_INTEGRATION = '1'
    try {
      const app = Fastify()
      const inventory = installRoutePolicyInventory(app, [route({
        method: 'POST',
        path: '/api/v1/test/reset-install',
        operationId: 'resetInstall',
      })])
      app.post('/api/v1/test/reset-install', async () => ({ ok: true }))
      await app.ready()
      expect(inventory.registeredRoutes()).toEqual(['POST /api/v1/test/reset-install'])
      await app.close()
    } finally {
      if (previous === undefined) delete process.env.RUN_INTEGRATION
      else process.env.RUN_INTEGRATION = previous
    }
  })
})
