import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl)
  throw new Error('Route policy migration integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Route policy migration integration requires a dedicated *test* database.')
const db = createDb(databaseUrl)

describe('route policy authorization migration', () => {
  beforeAll(async () => { await applyMigrations(db) })
  afterAll(async () => { await db.end() })

  it('installs sanitized append-only authorization denial facts', async () => {
    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema=current_schema() AND table_name='authorization_denials'`,
    )
    expect(new Set(columns.rows.map(row => row.column_name))).toEqual(new Set([
      'id',
      'occurred_at',
      'correlation_id',
      'policy_id',
      'operation_id',
      'transport',
      'principal_kind',
      'principal_actor_id',
      'principal_session_id',
      'workspace_id',
      'route_template',
      'reason_code',
      'authorization_stage',
      'resource_fingerprint',
      'dedupe_key',
    ]))
    const immutableTrigger = await db.query<{ trigger_name: string }>(
      `SELECT trigger_name FROM information_schema.triggers
       WHERE trigger_schema=current_schema()
         AND event_object_table='authorization_denials'
         AND trigger_name='authorization_denials_immutable'`,
    )
    expect(immutableTrigger.rowCount).toBe(2)
  })

  it('adds an optional Team scope without changing existing Template rows', async () => {
    const column = await db.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema=current_schema() AND table_name='templates' AND column_name='team_id'`,
    )
    expect(column.rows[0]?.is_nullable).toBe('YES')
    const constraints = await db.query<{ constraint_name: string }>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_schema=current_schema() AND table_name='templates'
         AND constraint_name='templates_workspace_team_fk'`,
    )
    expect(constraints.rowCount).toBe(1)
  })
})
