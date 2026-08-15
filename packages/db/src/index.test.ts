import { describe, expect, it } from 'vitest'
import { types } from 'pg'
import './index.js'

describe('database transport types', () => {
  it('preserves PostgreSQL date-only values without a timezone conversion', () => {
    const parseDate = types.getTypeParser(1082, 'text')
    expect(parseDate('2026-08-20')).toBe('2026-08-20')
  })
})
