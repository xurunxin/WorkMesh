import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDocument } from 'yaml'
import { recoveryActionSchema, recoveryConditionSchema } from './index.js'

describe('Recovery Center public contract', () => {
  it('keeps typed source conditions and current-state action policy strict', () => {
    expect(recoveryConditionSchema.options).toEqual(expect.arrayContaining([
      'missing_first_heartbeat', 'assignment_without_active_executor',
      'lease_lost', 'approval_expired', 'validation_attempts_exhausted',
    ]))
    expect(recoveryActionSchema.parse({
      id: 'retry', kind: 'retry', label: 'Preview and Retry', method: 'POST',
      path: '/api/v1/agent-sessions/00000000-0000-4000-8000-000000000001/retry',
      consequencePreviewPath: '/api/v1/agent-sessions/00000000-0000-4000-8000-000000000001/control-preview',
      dangerous: true, requiresCurrent: true, requiredCapabilities: ['work:write'],
      requiresApproval: false, requiresReason: true,
      tradeoff: 'Creates a distinct replacement Session.',
    })).toMatchObject({ dangerous: true, requiresCurrent: true })
    expect(recoveryActionSchema.safeParse({ id: 'repair', kind: 'local_repair' }).success).toBe(false)
  })

  it('publishes list/detail operations and resolvable Recovery schemas', () => {
    const source = readFileSync(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const document = parseDocument(source, { prettyErrors: true })
    expect(document.errors).toEqual([])
    const openapi = document.toJS() as { paths: Record<string, unknown>; components: { schemas: Record<string, unknown>; responses: Record<string, unknown> } }
    expect(openapi.paths).toHaveProperty('/api/v1/recovery-items')
    expect(openapi.paths).toHaveProperty('/api/v1/recovery-items/{id}')
    expect(openapi.components.schemas).toHaveProperty('RecoveryItem')
    expect(openapi.components.schemas).toHaveProperty('RecoveryAction')
    expect(openapi.components.responses).toHaveProperty('RecoveryItems')
  })
})
