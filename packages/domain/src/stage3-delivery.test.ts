import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  applicableAgentsPaths,
  assertAcyclicProjectDependencies,
  assertMergeReady,
  canonicalMergeApprovalPayload,
  milestoneProgress,
  normalizeProviderCheck,
} from './index.js'

describe('Stage 3 delivery policy', () => {
  it('binds merge approval to provider, repository, PR, exact head and method', () => {
    const canonical = canonicalMergeApprovalPayload({
      provider: 'github', connectionId: 'c', repositoryId: 'r',
      pullRequestId: '128', headSha: 'abc', method: 'squash',
    })
    expect(`sha256:${createHash('sha256').update(canonical).digest('hex')}`).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(canonical).toContain('"headSha":"abc"')
  })

  it('requires an independent current-head review and passed required checks', () => {
    expect(() => assertMergeReady({
      approvalHeadSha: 'h', currentHeadSha: 'h',
      producerActorId: 'producer',
      reviews: [{ reviewerActorId: 'reviewer', headSha: 'h', verdict: 'approved' }],
      findings: [],
      checks: [{ name: 'test', status: 'passed', required: true, headSha: 'h' }],
    })).not.toThrow()
    expect(() => assertMergeReady({
      approvalHeadSha: 'old', currentHeadSha: 'new',
      producerActorId: 'producer',
      reviews: [{ reviewerActorId: 'reviewer', headSha: 'old', verdict: 'approved' }],
      findings: [], checks: [],
    })).toThrow('current pull-request head')
    expect(() => assertMergeReady({
      approvalHeadSha: 'h', currentHeadSha: 'h',
      producerActorId: 'producer',
      reviews: [
        { reviewerActorId: 'reviewer-a', headSha: 'h', verdict: 'approved' },
        { reviewerActorId: 'reviewer-b', headSha: 'h', verdict: 'changes_requested' },
      ],
      findings: [], checks: [],
    })).toThrow('requests changes')
    expect(() => assertMergeReady({
      approvalHeadSha: 'h', currentHeadSha: 'h',
      producerActorId: 'producer',
      reviews: [{ reviewerActorId: 'reviewer', headSha: 'h', verdict: 'approved' }],
      findings: [{
        severity: 'high', file: 'src/index.ts', line: 12, summary: 'Unsafe behavior',
        evidence: 'The unsafe call is reachable.', recommendation: 'Add authorization.',
      }],
      checks: [],
    })).toThrow('Blocking or High')
  })

  it('normalizes checks, resolves root-to-leaf AGENTS paths and rejects cycles', () => {
    expect(normalizeProviderCheck('completed', 'success')).toBe('passed')
    expect(applicableAgentsPaths('apps/api/src/server.ts')).toEqual([
      'AGENTS.md', 'apps/AGENTS.md', 'apps/api/AGENTS.md', 'apps/api/src/AGENTS.md',
    ])
    expect(() => assertAcyclicProjectDependencies([
      { projectId: 'a', dependsOnProjectId: 'b' },
      { projectId: 'b', dependsOnProjectId: 'a' },
    ])).toThrow('acyclic')
    expect(milestoneProgress([{ statusCategory: 'completed' }, { statusCategory: 'started' }])).toEqual({ completed: 1, total: 2, percent: 50 })
  })
})
