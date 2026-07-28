import { afterEach, describe, expect, it } from 'vitest'
import { replayKeyFingerprintMatches } from './auth-idempotency.js'

const originalMasterKey = process.env.WORKMESH_MASTER_KEY

afterEach(() => {
  if (originalMasterKey === undefined) delete process.env.WORKMESH_MASTER_KEY
  else process.env.WORKMESH_MASTER_KEY = originalMasterKey
})

describe('authentication replay key fingerprint comparison', () => {
  it('rejects malformed and wrong fixed-length fingerprints without throwing', () => {
    process.env.WORKMESH_MASTER_KEY = '1'.repeat(64)
    expect(replayKeyFingerprintMatches(null)).toBe(false)
    expect(replayKeyFingerprintMatches('not-hex')).toBe(false)
    expect(replayKeyFingerprintMatches('0'.repeat(62))).toBe(false)
    expect(replayKeyFingerprintMatches('f'.repeat(64))).toBe(false)
  })
})
