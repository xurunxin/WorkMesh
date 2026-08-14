import { describe, expect, it } from 'vitest'
import { aggregateSeedSql, authoritySql, remapSqlParameters } from './event-resources.js'

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

  it('binds Human upload events to the Work Item when no Agent Session exists', () => {
    expect(aggregateSeedSql.artifact_upload_intent).toContain(
      "CASE WHEN intent.session_id IS NULL THEN 'work_item' ELSE 'session' END",
    )
    expect(aggregateSeedSql.artifact_upload_intent).toContain(
      'COALESCE(intent.session_id,intent.work_item_id)',
    )
  })

  it('derives Human artifact authority from the linked Work Item', () => {
    expect(authoritySql.artifact).toContain('LEFT JOIN agent_sessions')
    expect(authoritySql.artifact).toContain('COALESCE(session.team_id,item.team_id)')
  })
})
