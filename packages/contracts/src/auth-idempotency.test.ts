import { describe, expect, it } from 'vitest'
import {
  authIdempotencyErrorCodeSchema,
  authIdempotencyPolicy,
  apiErrorCodeSchema,
  errorResponseSchema,
  routePolicyManifest,
} from './index.js'
import {
  secretReplayOperationIds,
} from './route-policy.js'

describe('authentication idempotency contract', () => {
  it('publishes stable conflict codes and retention windows', () => {
    expect(authIdempotencyPolicy).toEqual({
      replayWindowSeconds: 900,
      conflictRetentionSeconds: 86_400,
    })
    expect(authIdempotencyErrorCodeSchema.options).toContain('IDEMPOTENCY_KEY_REUSED')
    expect(authIdempotencyErrorCodeSchema.options).toContain('IDEMPOTENCY_REPLAY_EXPIRED')
    expect(authIdempotencyErrorCodeSchema.options).toContain('IDEMPOTENCY_REPLAY_UNAVAILABLE')
    for (const code of authIdempotencyErrorCodeSchema.options)
      expect(apiErrorCodeSchema.options).toContain(code)
    expect(errorResponseSchema.safeParse({
      error: {
        code: 'IDEMPOTENCY_REPLAY_EXPIRED',
        message: 'Replay expired',
        correlationId: 'correlation-id',
      },
    }).success).toBe(true)
  })

  it('marks every secret-response mutation for encrypted replay', () => {
    expect(secretReplayOperationIds).toHaveLength(9)
    const marked = routePolicyManifest
      .filter(route => route.secretReplay === 'encrypted_auth')
      .map(route => route.operationId)
      .sort()
    expect(marked).toEqual([...secretReplayOperationIds].sort())
    for (const operationId of secretReplayOperationIds) {
      const route = routePolicyManifest.find(candidate => candidate.operationId === operationId)
      expect(route).toMatchObject({ idempotency: 'required', secretReplay: 'encrypted_auth' })
    }
    expect(routePolicyManifest.find(route => route.operationId === 'retryAgentSession'))
      .toMatchObject({ secretReplay: 'none' })
  })
})
