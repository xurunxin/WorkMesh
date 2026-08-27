import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  MINOR_UNIT_DECIMAL_PATTERN,
  advancedViewInputSchema,
  budgetPolicyInputSchema,
  cycleInputSchema,
  loopInputSchema,
  minorUnitDecimalSchema,
  projectHealthInputSchema,
  notificationListResponseSchema,
  notificationPreferenceResponseSchema,
  providerConnectionInputSchema,
  stage4RouteManifest,
  usageInputSchema,
} from './index.js'

const id = '00000000-0000-4000-8000-000000000001'
const escaped = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('Stage 4 contracts', () => {
  it('exposes redacted Human notification projections', () => {
    expect(notificationPreferenceResponseSchema.parse({
      channels: ['in_app'], digest: 'immediate', minimum_priority: 'update',
      muted_kinds: [], webhook_configured: false, revision: 0, updated_at: null,
    })).not.toHaveProperty('webhook_url')
    const page = notificationListResponseSchema.parse({ items: [{
      id, priority: 'approval', kind: 'approval.ready', title: 'Approve', body: '',
      source_type: 'work_item', source_id: id, read_at: null,
      created_at: '2026-08-13T00:00:00Z', deliveries: [{
        channel: 'in_app', status: 'failed', attempt_count: 2,
        available_at: '2026-08-13T00:00:00Z', claimed_at: null,
        effect_completed_at: null, delivered_at: null,
        created_at: '2026-08-13T00:00:00Z', last_error_present: true,
      }],
    }], nextCursor: null })
    expect(page.items[0]?.deliveries[0]).toEqual(expect.objectContaining({
      status: 'failed', last_error_present: true,
    }))
  })

  it('bounds Cycle duration and preserves explicit unknown cost', () => {
    expect(cycleInputSchema.parse({
      name: 'Cycle 12',
      startsAt: '2026-07-27T00:00:00Z',
      durationWeeks: 8,
    }).durationWeeks).toBe(8)
    expect(() => cycleInputSchema.parse({
      name: 'Too long',
      startsAt: '2026-07-27T00:00:00Z',
      durationWeeks: 9,
    })).toThrow()
    expect(usageInputSchema.parse({
      dedupeKey: 'usage-1',
      agentId: id,
      sessionId: id,
      occurredAt: '2026-07-26T00:00:00Z',
      currency: 'USD',
      costSource: 'unknown',
    }).costMinor).toBeUndefined()
    expect(() => usageInputSchema.parse({
      dedupeKey: 'usage-2',
      agentId: id,
      sessionId: id,
      occurredAt: '2026-07-26T00:00:00Z',
      currency: 'USD',
      costSource: 'unknown',
      costMinor: '0',
    })).toThrow()
  })

  it('requires approval for an agent health publication', () => {
    const health = {
      health: 'at_risk',
      summary: 'One dependency remains.',
      confidence: 0.7,
      uncertainty: 'The provider queue may change.',
      sources: [{ kind: 'work_item', id, observedAt: '2026-07-26T00:00:00Z' }],
      source: 'agent',
      publish: true,
    }
    expect(() => projectHealthInputSchema.parse(health)).toThrow()
    expect(projectHealthInputSchema.parse({ ...health, approvalId: id }).approvalId).toBe(id)
  })

  it('accepts the typed Gitea credential variant', () => {
    expect(providerConnectionInputSchema.parse({
      provider: 'gitea',
      externalAccountId: 'installation-1',
      displayName: 'Private Gitea',
      webhookSecret: 'a-secure-webhook-secret',
      baseUrl: 'https://gitea.example.test',
      accessToken: 'a-secure-access-token',
    }).provider).toBe('gitea')
  })

  it('rejects unknown Advanced View filters and normalizes an explicit cost currency', () => {
    const view = {
      name: 'USD sessions',
      entityType: 'session',
      layout: 'timeline',
      scope: 'private',
    }
    expect(() => advancedViewInputSchema.parse({
      ...view,
      filters: { unsupportedFutureFilter: true },
    })).toThrow()
    expect(advancedViewInputSchema.parse({
      ...view,
      filters: { cost: { currency: 'usd', minMinor: '1' } },
    }).filters.cost?.currency).toBe('USD')
  })

  it('preserves minor-unit decimal strings beyond the JavaScript safe-integer range', () => {
    const amount = '9007199254740993'
    expect(usageInputSchema.parse({
      dedupeKey: 'usage-large',
      agentId: id,
      sessionId: id,
      occurredAt: '2026-07-26T00:00:00Z',
      currency: 'USD',
      costSource: 'provider_reported',
      costMinor: amount,
    }).costMinor).toBe(amount)
    expect(advancedViewInputSchema.parse({
      name: 'Large costs',
      entityType: 'session',
      layout: 'timeline',
      scope: 'private',
      filters: { cost: { currency: 'USD', minMinor: amount } },
    }).filters.cost?.minMinor).toBe(amount)
    expect(loopInputSchema.parse({
      name: 'Large budget loop',
      ownerActorId: id,
      agentId: id,
      runTemplateVersionId: id,
      trigger: { type: 'schedule', cron: '* * * * *' },
      budget: { maxCostMinor: amount, currency: 'USD' },
    }).budget.maxCostMinor).toBe(amount)
    expect(budgetPolicyInputSchema.parse({
      scopeType: 'loop',
      scopeId: id,
      currency: 'USD',
      softCostMinor: amount,
      hardCostMinor: '9007199254740994',
    }).softCostMinor).toBe(amount)
    expect(() => usageInputSchema.parse({
      dedupeKey: 'unsafe-number',
      agentId: id,
      sessionId: id,
      occurredAt: '2026-07-26T00:00:00Z',
      currency: 'USD',
      costSource: 'provider_reported',
      costMinor: Number(amount),
    })).toThrow()
  })

  it('keeps the OpenAPI and runtime minor-unit upper bound exact', async () => {
    const maximum = '9223372036854775807'
    const overflow = '9223372036854775808'
    expect(minorUnitDecimalSchema.safeParse(maximum).success).toBe(true)
    expect(minorUnitDecimalSchema.safeParse(overflow).success).toBe(false)

    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const documentedPattern = openapi.match(
      /    MinorUnitDecimal:\r?\n\s+\{ type: string, pattern: "([^"]+)"/,
    )?.[1]
    expect(documentedPattern).toBe(MINOR_UNIT_DECIMAL_PATTERN.source)
    const schemaPattern = new RegExp(documentedPattern!)
    expect(schemaPattern.test(maximum)).toBe(true)
    expect(schemaPattern.test(overflow)).toBe(false)
  })

  it('documents every Stage 4 route with mutation and revision headers', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const operations = new Set(stage4RouteManifest.map(route => `${route.method} ${route.path}`))
    expect(operations.size).toBe(stage4RouteManifest.length)
    for (const route of stage4RouteManifest) {
      const pathPattern = new RegExp(`^  ${escaped(route.path)}:$`, 'm')
      const pathStart = openapi.search(pathPattern)
      expect(pathStart, route.path).toBeGreaterThanOrEqual(0)
      const nextPath = openapi.slice(pathStart + 1).search(/^  \/[^\n]+:$/m)
      const block = openapi.slice(pathStart, nextPath === -1 ? undefined : pathStart + 1 + nextPath)
      expect(block).toMatch(new RegExp(`^    ${route.method.toLowerCase()}:`, 'm'))
      const operation = block.split(/\r?\n/)
        .find(line => line.startsWith(`    ${route.method.toLowerCase()}:`))
      const stableNotificationRoute = route.path === '/api/v1/notifications'
        || route.path === '/api/v1/notification-preferences'
      if (!stableNotificationRoute) expect(operation, `${route.method} ${route.path}`).toContain(
        '"403": { $ref: "#/components/responses/FeatureDisabled" }',
      )
      if ('mutation' in route && route.mutation)
        expect(block).toMatch(/\$ref:\s*["']#\/components\/parameters\/IdempotencyKey["']/)
      if ('revisioned' in route && route.revisioned)
        expect(block).toMatch(/\$ref:\s*["']#\/components\/parameters\/IfMatch["']/)
    }
  })
})
