import { describe, expect, it } from 'vitest'
import {
  humanAttentionItemSchema,
  humanAttentionKindSchema,
  humanAttentionListResponseSchema,
  humanAttentionStatusSchema,
} from './index.js'

const uuid = (suffix: number) =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`

const baseItem = (kind: string) => ({
  projectionVersion: 1,
  id: `v1:${kind}:${uuid(1)}`,
  kind,
  status: 'open',
  workspaceId: uuid(2),
  teamId: uuid(3),
  projectId: uuid(4),
  workItemId: uuid(5),
  sessionId: uuid(6),
  planVersionId: null,
  planStepId: null,
  title: `${kind} needs attention`,
  summary: 'A concise summary derived from authorized source facts.',
  summaryDerived: true,
  reasonCodes: [`${kind}.open`],
  severity: 'medium',
  urgency: 'soon',
  requestedBy: { id: uuid(7), kind: 'agent', displayName: 'Agent' },
  responsibleHuman: { id: uuid(8), kind: 'human', displayName: 'Human' },
  options: [{
    id: 'inspect',
    label: 'Inspect',
    command: 'inspectSource',
    method: 'POST',
    path: `/api/v1/agent-sessions/${uuid(6)}/prompt`,
    targetRevision: 2,
    requiredCapabilities: ['work:write'],
    requiredActorKinds: ['human'],
    requiresApproval: false,
  }],
  recommendedOptionId: 'inspect',
  audience: { relationship: 'assigned_to_me', canRespond: true },
  response: {
    workflow: kind,
    requiresReason: true,
    requiresMessage: false,
    choices: [],
    expectedStatus: 'decided',
  },
  bulk: {
    eligible: false,
    compatibilityKey: null,
    prohibitedReason: 'bulk.kind_not_supported',
    revalidateIndividually: true,
  },
  impactSummary: 'The current execution is waiting for an authorized response.',
  affectedResources: [{ type: 'work_item', id: uuid(5), label: 'WM-1' }],
  evidence: [{ type: 'artifact', id: uuid(9), title: 'Test report' }],
  expiresAt: null,
  sourceRevision: 2,
  source: { type: kind, id: uuid(1), status: 'pending' },
  freshness: {
    state: 'current',
    observedAt: '2026-08-26T00:00:00.000Z',
    sourceUpdatedAt: '2026-08-26T00:00:00.000Z',
  },
  correlationId: 'correlation-1',
  createdAt: '2026-08-26T00:00:00.000Z',
  updatedAt: '2026-08-26T00:00:00.000Z',
})

describe('Human Attention contract v1', () => {
  it('accepts every distinct typed attention kind in one adapter-neutral page', () => {
    const kinds = humanAttentionKindSchema.options
    const page = humanAttentionListResponseSchema.parse({
      items: kinds.map(baseItem),
      nextCursor: null,
    })
    expect(page.items.map(item => item.kind)).toEqual([
      'decision',
      'approval',
      'clarification',
      'conflict',
      'recovery',
      'completion_review',
    ])
    expect(new Set(page.items.map(item => item.id)).size).toBe(6)
    expect(humanAttentionStatusSchema.options).toEqual([
      'open',
      'seen',
      'decided',
      'applying',
      'verified',
      'failed',
      'expired',
      'superseded',
    ])
  })

  it('requires explicit provenance, freshness, risk and action preconditions', () => {
    const item = baseItem('approval')
    expect(() => humanAttentionItemSchema.parse({
      ...item,
      source: undefined,
      freshness: undefined,
      severity: undefined,
      options: [{ ...item.options[0], requiredCapabilities: undefined }],
    })).toThrow()
  })

  it('rejects unversioned or free-form kinds', () => {
    expect(() => humanAttentionItemSchema.parse({
      ...baseItem('approval'),
      projectionVersion: 2,
      kind: 'message_text_looks_urgent',
    })).toThrow()
  })
})
