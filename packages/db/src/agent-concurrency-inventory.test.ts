import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../../..')
const source = (path: string): Promise<string> => readFile(join(root, path), 'utf8')
const occurrences = (value: string, pattern: RegExp): number => value.match(pattern)?.length ?? 0

describe('Agent execution-capacity admission inventory', () => {
  it('routes every Session-producing subsystem through the locked shared assertion', async () => {
    const [commands, collaboration, operations, stage4] = await Promise.all([
      source('apps/api/src/agent/commands.ts'),
      source('apps/api/src/collaboration/routes.ts'),
      source('apps/api/src/operations/routes.ts'),
      source('packages/db/src/stage4.ts'),
    ])
    // The retired public two-step Session creator no longer contributes a
    // fourth admission site. The remaining three are forced assignment,
    // autonomous claim, and retry, each behind the shared locked predicate.
    expect(occurrences(commands, /assertAgentExecutionCapacityAfterLock\(/g)).toBe(3)
    expect(occurrences(collaboration, /assertAgentExecutionCapacityAfterLock\(/g)).toBe(3)
    expect(occurrences(operations, /assertAgentExecutionCapacityAfterLock\(/g)).toBe(1)
    expect(occurrences(stage4, /assertAgentExecutionCapacityAfterLock\(/g)).toBe(2)
    for (const text of [commands, collaboration, operations, stage4])
      expect(text).toContain('agentExecutionCapacitySqlPredicate')
  })

  it('keeps A2A existing updates and terminal imports outside new-run admission', async () => {
    const operations = await source('apps/api/src/operations/routes.ts')
    const existingBranch = operations.indexOf('if (existing) {')
    const capacityAssertion = operations.indexOf('assertAgentExecutionCapacityAfterLock', existingBranch)
    const delegationInsert = operations.indexOf('INSERT INTO delegations(', capacityAssertion)
    expect(existingBranch).toBeGreaterThanOrEqual(0)
    expect(capacityAssertion).toBeGreaterThan(existingBranch)
    expect(operations.slice(existingBranch, capacityAssertion)).toContain('} else {')
    expect(operations.slice(existingBranch, capacityAssertion)).toContain('if (!terminal)')
    expect(delegationInsert).toBeGreaterThan(capacityAssertion)
  })

  it('persists and resumes only scheduled Loop capacity deferrals', async () => {
    const [stage4, worker] = await Promise.all([
      source('packages/db/src/stage4.ts'),
      source('apps/worker/src/automation.ts'),
    ])
    expect(stage4).toContain("error.code !== 'AGENT_CONCURRENCY_LIMIT'")
    expect(stage4).toContain("input.authorization.kind !== 'trusted_worker'")
    expect(stage4).toContain("deferredReason: error.code")
    expect(stage4).toContain("status='failed'")
    expect(stage4).toContain("status='pending'")
    expect(worker).toContain('if (admission.deferred) return')
  })
})
