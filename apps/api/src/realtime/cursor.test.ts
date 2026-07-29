import { describe, expect, it } from 'vitest'
import {
  compareDurableCursors,
  maximumDurableCursor,
  parseDurableCursor,
} from './cursor.js'

describe('durable event cursors', () => {
  it('preserves and compares values above the JavaScript safe integer limit', () => {
    expect(parseDurableCursor('9007199254740993'))
      .toBe('9007199254740993')
    expect(compareDurableCursors(
      '9007199254740993',
      '9007199254740992',
    )).toBe(1)
    expect(parseDurableCursor(maximumDurableCursor.toString()))
      .toBe('9223372036854775807')
  })

  it.each([
    9_007_199_254_740_993,
    1n,
    '01',
    '+1',
    '-1',
    '9223372036854775808',
  ])('rejects non-canonical or lossy input %s', value => {
    expect(() => parseDurableCursor(value)).toThrow()
  })
})
