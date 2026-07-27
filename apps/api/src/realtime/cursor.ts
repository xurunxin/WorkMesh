import { DomainError } from '@workmesh/domain'

export const maximumDurableCursor = 9_223_372_036_854_775_807n
const durableCursorPattern = /^(?:0|[1-9][0-9]{0,18})$/

export function parseDurableCursor(raw: unknown): string {
  if (typeof raw !== 'string')
    throw new DomainError(
      'VALIDATION_ERROR',
      'Cursor must be a canonical non-negative decimal string',
    )
  if (
    !durableCursorPattern.test(raw)
    || BigInt(raw) > maximumDurableCursor
  )
    throw new DomainError(
      'VALIDATION_ERROR',
      'Cursor must be a canonical non-negative decimal string within the PostgreSQL bigint range',
    )
  return raw
}

export const compareDurableCursors = (left: string, right: string): number => {
  const leftValue = BigInt(left)
  const rightValue = BigInt(right)
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
}
