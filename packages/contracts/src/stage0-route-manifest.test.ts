import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  DURABLE_EVENT_CURSOR_PATTERN,
  durableEventCursorSchema,
  errorResponseSchema,
  eventEnvelopeSchema,
  RUN_EXPLANATION_OPAQUE_CURSOR_PATTERN,
  runExplanationCursorPayloadSchema,
  runExplanationCursorSchema,
  stage0RouteManifest,
} from './index.js'

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
      cursor: '9007199254740993',
      id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
      event_type: 'comment.updated',
      event_version: 2,
      workspace_id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
      team_id: null,
      audience_actor_id: null,
      audience: {
        visibility: 'workspace',
        workspaceId: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
        teamId: null,
        actorId: null,
      },
      scopes: [
        {
          type: 'workspace',
          id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
        },
        {
          type: 'team',
          id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
        },
        {
          type: 'project',
          id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
        },
        {
          type: 'work_item',
          id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
        },
      ],
      invalidates: [
        {
          type: 'team',
          id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
        },
        {
          type: 'project',
          id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
        },
        {
          type: 'work_item',
          id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
        },
      ],
      aggregate_type: 'comment',
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
    expect(event.cursor).toBe('9007199254740993')
    expect(event.invalidates.map(resource => resource.type)).toEqual([
      'team',
      'project',
      'work_item',
    ])
  })

  it('keeps parsed OpenAPI cursor boundaries in parity with runtime', async () => {
    const source = await readFile(
      new URL('../../../OPENAPI.yaml', import.meta.url),
      'utf8',
    )
    const document = parse(source) as {
      components?: {
        schemas?: {
          DurableEventCursor?: { pattern?: unknown }
        }
      }
    }
    const documentedPattern =
      document.components?.schemas?.DurableEventCursor?.pattern
    expect(documentedPattern).toBe(DURABLE_EVENT_CURSOR_PATTERN.source)
    const documentedSchema = new RegExp(String(documentedPattern))
    const boundaries = [
      ['0', true],
      ['1', true],
      ['999999999999999999', true],
      ['9223372036854775806', true],
      ['9223372036854775807', true],
      ['9223372036854775808', false],
      ['9999999999999999999', false],
      ['10000000000000000000', false],
      ['01', false],
      ['+1', false],
      ['-1', false],
      [' 1', false],
      ['1 ', false],
      ['1.0', false],
      ['', false],
    ] as const
    for (const [value, accepted] of boundaries) {
      expect(documentedSchema.test(value), `OpenAPI cursor ${value}`)
        .toBe(accepted)
      expect(
        durableEventCursorSchema.safeParse(value).success,
        `runtime cursor ${value}`,
      ).toBe(accepted)
    }
  })

  it('documents and validates the backward-compatible Run Explanation keyset cursor', async () => {
    const source = await readFile(
      new URL('../../../OPENAPI.yaml', import.meta.url),
      'utf8',
    )
    const document = parse(source) as {
      components?: {
        parameters?: {
          RunSequenceCursor?: { schema?: { $ref?: unknown } }
        }
        schemas?: {
          RunExplanationOpaqueCursor?: { pattern?: unknown; maxLength?: unknown }
        }
      }
    }
    expect(document.components?.parameters?.RunSequenceCursor?.schema?.$ref)
      .toBe('#/components/schemas/RunExplanationCursor')
    expect(document.components?.schemas?.RunExplanationOpaqueCursor?.pattern)
      .toBe(RUN_EXPLANATION_OPAQUE_CURSOR_PATTERN.source)
    expect(document.components?.schemas?.RunExplanationOpaqueCursor?.maxLength)
      .toBe(8_192)

    const opaque = `r1.${Buffer.from(JSON.stringify({
      v: 1,
      sequence: '1',
      at: '2026-08-26T00:00:00.000Z',
      source: 'approval',
      id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
    }), 'utf8').toString('base64url')}`
    expect(runExplanationCursorSchema.parse('42')).toBe('42')
    expect(runExplanationCursorSchema.parse(opaque)).toBe(opaque)
    expect(runExplanationCursorPayloadSchema.safeParse({
      v: 1,
      sequence: '1',
      at: '2026-08-26T00:00:00.000Z',
      source: 'approval',
      id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
      extra: 'rejected',
    }).success).toBe(false)
    expect(runExplanationCursorPayloadSchema.safeParse({
      v: 1,
      sequence: '0',
      at: '2026-08-26T00:00:00.000Z',
      source: 'approval',
      id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
    }).success).toBe(false)
    expect(runExplanationCursorSchema.safeParse(`r1.${'a'.repeat(8_190)}`).success).toBe(false)
    expect(runExplanationCursorSchema.safeParse('r1.bad+alphabet').success).toBe(false)
  })

  it('represents normalized multi-resource audiences without claiming Workspace visibility', () => {
    const parsed = eventEnvelopeSchema.parse({
      cursor: '1',
      id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
      event_type: 'initiative.updated',
      event_version: 2,
      workspace_id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
      team_id: null,
      audience_actor_id: null,
      audience: {
        visibility: 'resource',
        workspaceId: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
        teamId: null,
        actorId: null,
      },
      scopes: [
        {
          type: 'workspace',
          id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
        },
        {
          type: 'team',
          id: '00000000-0000-4000-8000-000000000001',
        },
        {
          type: 'team',
          id: '00000000-0000-4000-8000-000000000002',
        },
      ],
      invalidates: [],
      aggregate_type: 'initiative',
      aggregate_id: '00000000-0000-4000-8000-000000000003',
      aggregate_revision: 2,
      actor_id: '00000000-0000-4000-8000-000000000004',
      correlation_id: 'resource-audience-test',
      idempotency_key: null,
      payload: {},
      occurred_at: '2026-07-28T00:00:00.000Z',
    })
    expect(parsed.audience.visibility).toBe('resource')
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
