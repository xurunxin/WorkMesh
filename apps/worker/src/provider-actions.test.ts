import { describe, expect, it } from 'vitest'
import { validateUploadedChecksum } from './provider-actions.js'

describe('Stage 3 provider worker helpers', () => {
  it('accepts only the checksum bound by the upload intent', () => {
    expect(() => validateUploadedChecksum(`sha256:${'a'.repeat(64)}`, `sha256:${'a'.repeat(64)}`)).not.toThrow()
    expect(() => validateUploadedChecksum(`sha256:${'a'.repeat(64)}`, `sha256:${'b'.repeat(64)}`)).toThrow('ARTIFACT_CHECKSUM_MISMATCH')
  })
})
