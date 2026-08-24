import type { FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { DomainError } from '@workmesh/domain'
import { recordAuthorizationDenial, sessionActiveForOperation } from './authorize.js'

describe('Agent Session route admission', () => {
  it('admits ACK recovery and same-key replay without broadening other inactive states', () => {
    expect(sessionActiveForOperation('queued', 'acknowledgeAgentSession')).toBe(true)
    expect(sessionActiveForOperation('stale', 'acknowledgeAgentSession')).toBe(true)
    expect(sessionActiveForOperation('acknowledged', 'acknowledgeAgentSession')).toBe(true)

    for (const state of ['executing', 'paused', 'stopping', 'completed', 'failed', 'canceled']) {
      expect(sessionActiveForOperation(state, 'acknowledgeAgentSession')).toBe(false)
    }
  })
})

describe('authorization denial audit', () => {
  it('persists only policy metadata and keyed resource fingerprints', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] })
    const request = {
      id: 'request-id',
      correlationId: 'CALLER_CORRELATION_MARKER',
      method: 'PATCH',
      params: { id: '8a30f6c2-fdf3-4380-a254-432c71490842' },
      query: { search: 'private query value' },
      body: { title: 'private title', prompt: 'private prompt' },
      routeOptions: {
        url: '/api/v1/work-items/:id',
        config: {
          workmeshPolicyId: 'route.updateWorkItem',
          workmeshOperationId: 'updateWorkItem',
        },
      },
      actor: {
        id: '47f68d4d-dda1-45ba-b8b8-812114275618',
        workspaceId: '35b2726d-9703-41b6-99f7-794aa187f6ad',
        displayName: 'Agent',
        workspaceRole: 'member',
        csrfToken: '',
        kind: 'agent',
        agentSessionId: '3b005084-c846-44f5-a3ba-8a79fe5ee95b',
      },
    } as unknown as FastifyRequest

    await recordAuthorizationDenial({
      db: { query } as unknown as Pool,
      request,
      error: new DomainError(
        'RESOURCE_SCOPE_DENIED',
        'Protected resource is outside scope',
        { authorizationStage: 'resource_scope' },
      ),
      auditSecret: 'authorization-audit-test-secret',
    })

    expect(query).toHaveBeenCalledOnce()
    const values = query.mock.calls[0]?.[1] as unknown[]
    expect(values).toContain('route.updateWorkItem')
    expect(values[0]).toBe('request-id')
    expect(values).toContain('/api/v1/work-items/{id}')
    expect(values).toContain('RESOURCE_SCOPE_DENIED')
    expect(values).toContain('resource_scope')
    expect(values.some(value =>
      typeof value === 'string' && /^[0-9a-f]{64}$/.test(value),
    )).toBe(true)
    const serialized = JSON.stringify(values)
    expect(serialized).not.toContain('private query value')
    expect(serialized).not.toContain('private title')
    expect(serialized).not.toContain('private prompt')
    expect(serialized).not.toContain('8a30f6c2-fdf3-4380-a254-432c71490842')
    expect(serialized).not.toContain('CALLER_CORRELATION_MARKER')
  })

  it('records a sanitized provider signature denial without request secrets', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] })
    const request = {
      id: 'provider-request-id',
      correlationId: 'provider-caller-marker',
      method: 'POST',
      params: { connectionId: '3ffddffd-20bc-4317-b771-0c9f731fe0f8' },
      query: { token: 'private-query-token' },
      body: { secret: 'private-body-secret' },
      rawBody: Buffer.from('private-raw-webhook-secret'),
      headers: {
        'x-hub-signature-256': 'sha256=private-signature-secret',
      },
      routeOptions: {
        url: '/api/v1/provider-webhooks/:connectionId/github',
        config: {
          workmeshPolicyId: 'route.receiveGitHubWebhook',
          workmeshOperationId: 'receiveGitHubWebhook',
        },
      },
    } as unknown as FastifyRequest

    await recordAuthorizationDenial({
      db: { query } as unknown as Pool,
      request,
      error: new DomainError(
        'PROVIDER_SIGNATURE_INVALID',
        'GitHub webhook signature is invalid',
      ),
      auditSecret: 'authorization-audit-test-secret',
    })

    expect(query).toHaveBeenCalledOnce()
    const values = query.mock.calls[0]?.[1] as unknown[]
    expect(values[0]).toBe('provider-request-id')
    expect(values).toContain('route.receiveGitHubWebhook')
    expect(values).toContain('PROVIDER_SIGNATURE_INVALID')
    expect(values.some(value =>
      typeof value === 'string' && /^[0-9a-f]{64}$/.test(value),
    )).toBe(true)
    const serialized = JSON.stringify(values)
    for (const secret of [
      'provider-caller-marker',
      '3ffddffd-20bc-4317-b771-0c9f731fe0f8',
      'private-query-token',
      'private-body-secret',
      'private-raw-webhook-secret',
      'private-signature-secret',
    ]) expect(serialized).not.toContain(secret)
  })

  it('records and deduplicates feature-disabled denials required by policy', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] })
    const request = {
      id: 'feature-request-id',
      correlationId: 'feature-caller-marker',
      method: 'GET',
      params: {},
      routeOptions: {
        url: '/api/v1/cycles',
        config: {
          workmeshPolicyId: 'route.listCycles',
          workmeshOperationId: 'listCycles',
        },
      },
      actor: {
        id: '47f68d4d-dda1-45ba-b8b8-812114275618',
        workspaceId: '35b2726d-9703-41b6-99f7-794aa187f6ad',
        displayName: 'Human',
        workspaceRole: 'admin',
        csrfToken: '',
        kind: 'human',
      },
    } as unknown as FastifyRequest

    await recordAuthorizationDenial({
      db: { query } as unknown as Pool,
      request,
      error: new DomainError('FEATURE_DISABLED', 'cycles is disabled'),
      auditSecret: 'authorization-audit-test-secret',
    })

    expect(query).toHaveBeenCalledOnce()
    const values = query.mock.calls[0]?.[1] as unknown[]
    expect(values[0]).toBe('feature-request-id')
    expect(values).toContain('FEATURE_DISABLED')
    expect(values[12]).toMatch(/^[0-9a-f]{64}$/)
  })
})
