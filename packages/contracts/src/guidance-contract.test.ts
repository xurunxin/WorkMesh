import { describe, expect, it } from 'vitest'
import {
  guidanceHistoryResponseSchema,
  guidanceResponseSchema,
  publishGuidanceInputSchema,
} from './index.js'

const revisionId = '11111111-1111-4111-8111-111111111111'
const scopeId = '22222222-2222-4222-8222-222222222222'
const documentId = '33333333-3333-4333-8333-333333333333'
const actorId = '44444444-4444-4444-8444-444444444444'
const publishedAt = '2026-08-03T12:00:00.000Z'
const currentRevision = {
  id: revisionId,
  revisionNumber: 1,
  contentHash: `sha256:${'a'.repeat(64)}`,
  changeSummary: 'Initial operating guidance',
  authorActorId: actorId,
  authorDisplayName: 'Maintainer',
  publishedAt,
}

describe('versioned Guidance contracts', () => {
  it('represents explicit unpublished and active resources', () => {
    expect(guidanceResponseSchema.parse({
      scope: 'team', scopeId, documentId: null, status: 'unpublished', revision: 0,
      currentRevision: null, markdown: '', updatedAt: publishedAt,
    }).status).toBe('unpublished')
    expect(guidanceResponseSchema.parse({
      scope: 'team', scopeId, documentId, status: 'active', revision: 1,
      currentRevision, markdown: '# Team rules', updatedAt: publishedAt,
    }).currentRevision?.id).toBe(revisionId)
  })

  it('keeps publication and history DTOs concrete and strict', () => {
    expect(publishGuidanceInputSchema.parse({ markdown: '# Safe rules', changeSummary: 'Publish safe rules' })).toMatchObject({ markdown: '# Safe rules' })
    expect(() => publishGuidanceInputSchema.parse({ markdown: '# Rules', changeSummary: 'Publish', token: 'forbidden-extra-field' })).toThrow()
    expect(guidanceHistoryResponseSchema.parse({
      scope: 'team', scopeId, documentId, revision: 1, status: 'active', currentRevisionId: revisionId,
      revisions: [currentRevision], audit: [],
    }).revisions).toHaveLength(1)
  })
})
