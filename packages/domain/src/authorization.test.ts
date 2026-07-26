import { describe, expect, it } from 'vitest'
import { routePolicyManifest } from '@workmesh/contracts'
import { evaluateRouteAuthorization, type RouteAuthorizationFacts } from './authorization.js'

const policy = (operationId: string) =>
  routePolicyManifest.find(route => route.operationId === operationId)!

const agentFacts: RouteAuthorizationFacts = {
  principalKind: 'agent',
  sessionBound: true,
  sessionActive: true,
  delegationActive: true,
  liveCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write'],
  resourceInScope: true,
  approvalValid: true,
  leaseValid: true,
  revisionPresent: true,
  idempotencyPresent: true,
}

describe('route authorization policy', () => {
  it('evaluates Agent authority in the required fail-closed order', () => {
    const route = policy('updateWorkItem')
    expect(evaluateRouteAuthorization(route, {
      ...agentFacts,
      sessionActive: false,
      delegationActive: false,
      liveCapabilities: [],
      resourceInScope: false,
    })).toMatchObject({ allowed: false, stage: 'session' })
    expect(evaluateRouteAuthorization(route, {
      ...agentFacts,
      delegationActive: false,
      liveCapabilities: [],
      resourceInScope: false,
    })).toMatchObject({ allowed: false, stage: 'delegation' })
    expect(evaluateRouteAuthorization(route, {
      ...agentFacts,
      liveCapabilities: [],
      resourceInScope: false,
    })).toMatchObject({ allowed: false, stage: 'capability' })
    expect(evaluateRouteAuthorization(route, {
      ...agentFacts,
      resourceInScope: false,
    })).toMatchObject({ allowed: false, stage: 'resource_scope' })
  })

  it('does not let a Lease substitute for capability or resource authority', () => {
    const route = policy('requestProviderAction')
    expect(evaluateRouteAuthorization(route, {
      ...agentFacts,
      liveCapabilities: [],
      resourceInScope: false,
      leaseValid: true,
    })).toMatchObject({ allowed: false, stage: 'capability' })
  })

  it('enforces Workspace and Team roles for humans', () => {
    expect(evaluateRouteAuthorization(policy('updateWorkspace'), {
      principalKind: 'human',
      workspaceRole: 'member',
      idempotencyPresent: true,
      revisionPresent: true,
    })).toMatchObject({ allowed: false, stage: 'human_role' })
    expect(evaluateRouteAuthorization(policy('createProject'), {
      principalKind: 'human',
      workspaceRole: 'member',
      teamRole: 'member',
      idempotencyPresent: true,
    })).toMatchObject({ allowed: false, stage: 'human_role' })
  })

  it('requires revision and idempotency independently', () => {
    const route = policy('updateWorkItem')
    expect(evaluateRouteAuthorization(route, {
      principalKind: 'human',
      workspaceRole: 'admin',
      revisionPresent: false,
      idempotencyPresent: true,
    })).toMatchObject({ allowed: false, stage: 'revision' })
    expect(evaluateRouteAuthorization(route, {
      principalKind: 'human',
      workspaceRole: 'admin',
      revisionPresent: true,
      idempotencyPresent: false,
    })).toMatchObject({ allowed: false, stage: 'idempotency' })
  })
})
