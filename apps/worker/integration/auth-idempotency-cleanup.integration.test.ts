import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '@workmesh/db'
import { createSessionLifecycleWorker } from '../src/session-lifecycle.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl)
  throw new Error('Worker integration tests require RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Worker integration tests require DATABASE_URL to name a dedicated test database.')

const db = createDb(databaseUrl)

describe('auth idempotency retention cleanup', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE auth_idempotency_records')
  })

  afterAll(async () => {
    await db.end()
  })

  it('wipes expired replay envelopes before bounded conflict deletion', async () => {
    const fingerprint = (character: string) => character.repeat(64)
    await db.query(
      `INSERT INTO auth_idempotency_records(
         key_fingerprint,subject_fingerprint,operation,request_fingerprint,
         client_context_fingerprint,state,response_status,replay_key_id,
         replay_key_fingerprint,replay_iv,replay_tag,replay_ciphertext,
         completed_at,replay_expires_at,conflict_expires_at
       ) VALUES
         ($1,$2,'wipe-one',$3,$4,'completed',200,'key-v1',$5,decode(repeat('01',12),'hex'),decode(repeat('02',16),'hex'),decode('03','hex'),now(),now()-interval '2 hours',now()+interval '22 hours'),
         ($6,$7,'wipe-two',$8,$9,'completed',200,'key-v1',$10,decode(repeat('01',12),'hex'),decode(repeat('02',16),'hex'),decode('03','hex'),now(),now()-interval '1 hour',now()+interval '23 hours'),
         ($11,$12,'retained',$13,$14,'completed',200,'key-v1',$15,decode(repeat('01',12),'hex'),decode(repeat('02',16),'hex'),decode('03','hex'),now(),now()+interval '1 hour',now()+interval '25 hours')`,
      [
        fingerprint('1'), fingerprint('2'), fingerprint('3'), fingerprint('4'), fingerprint('5'),
        fingerprint('6'), fingerprint('7'), fingerprint('8'), fingerprint('9'), fingerprint('a'),
        fingerprint('b'), fingerprint('c'), fingerprint('d'), fingerprint('e'), fingerprint('f'),
      ],
    )
    await db.query(
      `INSERT INTO auth_idempotency_records(
         key_fingerprint,subject_fingerprint,operation,request_fingerprint,
         client_context_fingerprint,replay_expires_at,conflict_expires_at
       ) VALUES
         ($1,$2,'claimed-expired',$3,$4,now()-interval '1 hour',now()+interval '23 hours'),
         ($5,$6,'delete-one',$7,$8,now()-interval '25 hours',now()-interval '2 hours'),
         ($9,$10,'delete-two',$11,$12,now()-interval '25 hours',now()-interval '1 hour')`,
      [
        fingerprint('0'), fingerprint('1'), fingerprint('2'), fingerprint('3'),
        fingerprint('4'), fingerprint('5'), fingerprint('6'), fingerprint('7'),
        fingerprint('8'), fingerprint('9'), fingerprint('a'), fingerprint('b'),
      ],
    )
    const worker = createSessionLifecycleWorker({ db, workerId: 'auth-cleanup-test' })

    await expect(worker.cleanupAuthIdempotency(1)).resolves.toEqual({ wiped: 1, deleted: 1 })
    expect((await db.query("SELECT 1 FROM auth_idempotency_records WHERE operation LIKE 'wipe-%' AND replay_wiped_at IS NULL")).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM auth_idempotency_records WHERE operation LIKE 'delete-%'")).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM auth_idempotency_records WHERE operation='claimed-expired' AND replay_wiped_at IS NULL")).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM auth_idempotency_records WHERE operation='retained'")).rowCount).toBe(1)

    await expect(worker.cleanupAuthIdempotency(100)).resolves.toEqual({ wiped: 1, deleted: 1 })
    const wiped = await db.query<Record<string, unknown>>(
      `SELECT response_status,replay_key_id,replay_key_fingerprint,replay_iv,
              replay_tag,replay_ciphertext,replay_wiped_at
         FROM auth_idempotency_records WHERE operation LIKE 'wipe-%'`,
    )
    expect(wiped.rowCount).toBe(2)
    for (const row of wiped.rows) {
      expect(row).toMatchObject({
        response_status: null,
        replay_key_id: null,
        replay_key_fingerprint: null,
        replay_iv: null,
        replay_tag: null,
        replay_ciphertext: null,
      })
      expect(row.replay_wiped_at).toBeInstanceOf(Date)
    }
    expect((await db.query("SELECT 1 FROM auth_idempotency_records WHERE operation LIKE 'delete-%'")).rowCount).toBe(0)
    expect((await db.query("SELECT 1 FROM auth_idempotency_records WHERE operation='retained'")).rowCount).toBe(1)

    await db.query("UPDATE auth_idempotency_records SET conflict_expires_at=now()-interval '1 second' WHERE operation='wipe-one'")
    await expect(worker.cleanupAuthIdempotency(100)).resolves.toEqual({ wiped: 0, deleted: 1 })
    expect((await db.query("SELECT 1 FROM auth_idempotency_records WHERE operation='wipe-one'")).rowCount).toBe(0)
    expect((await db.query("SELECT 1 FROM auth_idempotency_records WHERE operation='wipe-two'")).rowCount).toBe(1)
  })
})
