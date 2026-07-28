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
    vi.stubEnv('SESSION_SECRET', 'route-policy-test-session-secret-32')
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
})
