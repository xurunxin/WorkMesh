import { describe, expect, it } from 'vitest'
import { DomainError } from '@workmesh/domain'
import {
  externalCorrelationIdMaxLength,
  validateExternalCorrelationId,
} from './request-metadata.js'

describe('external correlation id validation', () => {
  it('accepts bounded opaque identifiers', () => {
    expect(validateExternalCorrelationId('trace:01JZ_abc-123.4/5'))
      .toBe('trace:01JZ_abc-123.4/5')
    expect(validateExternalCorrelationId(undefined)).toBeUndefined()
  })

  it.each([
    ['credential-like', 'sk-private-token-marker'],
    ['whitespace', 'trace private'],
    ['newline', 'trace\nprivate'],
    ['overlong', `t${'x'.repeat(externalCorrelationIdMaxLength)}`],
  ])('rejects %s values', (_case, value) => {
    expect(() => validateExternalCorrelationId(value))
      .toThrow(DomainError)
  })
})
