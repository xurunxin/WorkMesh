import { DomainError } from '@workmesh/domain'

export const externalCorrelationIdMaxLength = 200

const safeExternalCorrelationId =
  /^(?![Bb]earer[._:/-]|[Bb]asic[._:/-]|sk[-_]|gh[pousr]_|eyJ[A-Za-z0-9_-]*\.)[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/

export function validateExternalCorrelationId(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined
  if (
    value.length > externalCorrelationIdMaxLength
    || !safeExternalCorrelationId.test(value)
  ) {
    throw new DomainError(
      'VALIDATION_ERROR',
      'X-Correlation-Id must be a safe opaque value of at most 200 characters',
    )
  }
  return value
}
