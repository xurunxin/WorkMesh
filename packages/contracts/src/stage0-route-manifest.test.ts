import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { errorResponseSchema, eventEnvelopeSchema, stage0RouteManifest } from './index.js'

const escaped = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('Stage 0 transport contract manifest', () => {
  it('has a unique operation for every documented route', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const operations = new Set(stage0RouteManifest.map(route => `${route.method} ${route.path}`))

    expect(operations.size).toBe(stage0RouteManifest.length)
    for (const route of stage0RouteManifest) {
      const pathPattern = new RegExp(`^  ${escaped(route.path)}:$`, 'm')
      const operationPattern = new RegExp(`^    ${route.method.toLowerCase()}:`, 'm')
      expect(openapi).toMatch(pathPattern)
      const pathStart = openapi.search(pathPattern)
      const nextPath = openapi.slice(pathStart + 1).search(/^  \/[^\n]+:$/m)
      const pathBlock = openapi.slice(pathStart, nextPath === -1 ? undefined : pathStart + 1 + nextPath)
      expect(pathBlock).toMatch(operationPattern)
      if ('mutation' in route && route.mutation) expect(pathBlock).toMatch(/\$ref:\s*["']#\/components\/parameters\/IdempotencyKey["']/)
      if ('revisioned' in route && route.revisioned) expect(pathBlock).toMatch(/\$ref:\s*["']#\/components\/parameters\/IfMatch["']/)
    }
  })

  it('accepts forward-compatible event fields', () => {
    const event = eventEnvelopeSchema.parse({
      cursor: 42,
      id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
      event_type: 'work_item.created',
      event_version: 1,
      workspace_id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
      team_id: null,
      audience_actor_id: null,
      aggregate_type: 'work_item',
      aggregate_id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
      aggregate_revision: 1,
      actor_id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
      correlation_id: 'request-42',
      idempotency_key: null,
      payload: {},
      occurred_at: '2026-07-23T00:00:00.000Z',
      future_delivery_field: 'ignored by old consumers',
    })

    expect(event.future_delivery_field).toBe('ignored by old consumers')
  })

  it('accepts the sole-team deletion conflict error response', () => {
    const response = errorResponseSchema.parse({
      error: {
        code: 'LAST_ACTIVE_TEAM_CONFLICT',
        message: 'Cannot delete the last active team',
        correlationId: 'request-sole-team-delete',
      },
    })

    expect(response.error.code).toBe('LAST_ACTIVE_TEAM_CONFLICT')
    expect(response.error.correlationId).toBe('request-sole-team-delete')
  })
})
