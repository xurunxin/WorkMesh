import { describe, expect, it } from 'vitest'
import { remapSqlParameters } from './event-resources.js'

describe('event resource SQL parameter binding', () => {
  it('remaps sparse, repeated, and out-of-order placeholders contiguously', () => {
    expect(remapSqlParameters(
      'SELECT $4 AS session_id,$2 AS workspace_id,$4 AS repeated_session',
      ['aggregate', 'workspace', 'team', 'session'],
    )).toEqual({
      sql: 'SELECT $1 AS session_id,$2 AS workspace_id,$1 AS repeated_session',
      values: ['session', 'workspace'],
    })
  })

  it('rejects placeholders without a source value', () => {
    expect(() => remapSqlParameters('SELECT $5', ['one']))
      .toThrow('DOMAIN_EVENT_SQL_PARAMETER_INVALID')
  })
})
