import { afterAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl)
  throw new Error('Database integration tests require RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Database integration tests require DATABASE_URL to name a dedicated test database.')

const db = createDb(databaseUrl)

describe('0023 auth idempotency migration', () => {
  afterAll(async () => {
    await db.end()
  })

  it('upgrades through 0023 with fingerprint, envelope, expiry, and session revocation columns', async () => {
    await db.query('DROP SCHEMA public CASCADE')
    await db.query('CREATE SCHEMA public')
    await applyMigrations(db, { through: 23 })

    const migration = await db.query("SELECT 1 FROM schema_migrations WHERE version='0023_auth_idempotency_records'")
    expect(migration.rowCount).toBe(1)
    const columns = await db.query<{ column_name: string; data_type: string }>(
      `SELECT column_name,data_type
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name='auth_idempotency_records'
        ORDER BY column_name`,
    )
    expect(columns.rows).toEqual(expect.arrayContaining([
      { column_name: 'key_fingerprint', data_type: 'text' },
      { column_name: 'subject_fingerprint', data_type: 'text' },
      { column_name: 'request_fingerprint', data_type: 'text' },
      { column_name: 'client_context_fingerprint', data_type: 'text' },
      { column_name: 'replay_ciphertext', data_type: 'bytea' },
      { column_name: 'replay_iv', data_type: 'bytea' },
      { column_name: 'replay_tag', data_type: 'bytea' },
      { column_name: 'replay_expires_at', data_type: 'timestamp with time zone' },
      { column_name: 'replay_wiped_at', data_type: 'timestamp with time zone' },
      { column_name: 'conflict_expires_at', data_type: 'timestamp with time zone' },
    ]))
    expect((await db.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='revoked_at'",
    )).rowCount).toBe(1)

    const fingerprint = 'a'.repeat(64)
    await db.query(
      `INSERT INTO auth_idempotency_records(
         key_fingerprint,subject_fingerprint,operation,request_fingerprint,
         client_context_fingerprint
       ) VALUES($1,$2,'one',$3,$4)`,
      [fingerprint, 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)],
    )
    await expect(db.query(
      `INSERT INTO auth_idempotency_records(
         key_fingerprint,subject_fingerprint,operation,request_fingerprint,
         client_context_fingerprint
       ) VALUES($1,$2,'two',$3,$4)`,
      [fingerprint, 'b'.repeat(64), 'e'.repeat(64), 'f'.repeat(64)],
    )).rejects.toThrow()
    await expect(db.query(
      `INSERT INTO auth_idempotency_records(
         key_fingerprint,subject_fingerprint,operation,request_fingerprint,
         client_context_fingerprint
       ) VALUES('plaintext-key','plaintext-subject','invalid','plaintext-request','plaintext-context')`,
    )).rejects.toThrow()

    const completed = await db.query<{ id: string }>(
      `INSERT INTO auth_idempotency_records(
         key_fingerprint,subject_fingerprint,operation,request_fingerprint,
         client_context_fingerprint,state,response_status,replay_key_id,
         replay_key_fingerprint,replay_iv,replay_tag,replay_ciphertext,completed_at
       ) VALUES($1,$2,'completed',$3,$4,'completed',200,'key-v1',$5,
                decode(repeat('01',12),'hex'),decode(repeat('02',16),'hex'),
                decode('03','hex'),now())
       RETURNING id`,
      ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64), '4'.repeat(64), '5'.repeat(64)],
    )
    await expect(db.query(
      `UPDATE auth_idempotency_records
          SET response_status=NULL,replay_key_id=NULL,replay_key_fingerprint=NULL,
              replay_iv=NULL,replay_tag=NULL,replay_ciphertext=NULL,replay_wiped_at=now()
        WHERE id=$1`,
      [completed.rows[0]!.id],
    )).resolves.toMatchObject({ rowCount: 1 })
    await expect(db.query(
      "UPDATE auth_idempotency_records SET replay_wiped_at=NULL WHERE id=$1",
      [completed.rows[0]!.id],
    )).rejects.toThrow()

    const indexes = await db.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='auth_idempotency_records'",
    )
    expect(indexes.rows.map(row => row.indexdef).join('\n'))
      .toContain("WHERE ((state = 'completed'::text) AND (replay_wiped_at IS NULL))")
  }, 120_000)
})
