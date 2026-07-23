import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, withTx } from '@workmesh/db'
import { createOutboxWorker, type ClaimedEvent, type DeliverySink } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) {
  throw new Error('Worker integration tests require RUN_INTEGRATION=1 and DATABASE_URL.')
}
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Worker integration tests require DATABASE_URL to name a dedicated test database.')
}

const db = createDb(databaseUrl)
let workspaceId = ''
let actorId = ''

const receiver = (received: ClaimedEvent[]): DeliverySink => ({
  deliver: async event => { received.push(event) },
})

const createCommittedEvent = async (type: string): Promise<string> => {
  const aggregateId = randomUUID()
  await withTx(db, async tx => {
    const event = await tx.query<{ id: string }>(
      'INSERT INTO domain_events(workspace_id,event_type,aggregate_type,aggregate_id,actor_id,correlation_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [workspaceId, type, 'acceptance', aggregateId, actorId, `worker-${type}`, { aggregateId }],
    )
    await tx.query('INSERT INTO outbox_events(domain_event_id,topic,partition_key) VALUES($1,$2,$3)', [event.rows[0]!.id, type, aggregateId])
  })
  const result = await db.query<{ id: string }>('SELECT o.id FROM outbox_events o JOIN domain_events e ON e.id=o.domain_event_id WHERE e.aggregate_id=$1', [aggregateId])
  return result.rows[0]!.id
}

describe('outbox delivery', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
    const workspace = await db.query<{ id: string }>("INSERT INTO workspaces(name,slug) VALUES('Worker acceptance','worker-acceptance') RETURNING id")
    workspaceId = workspace.rows[0]!.id
    const roleColumn = await db.query<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='actors' AND column_name='workspace_role') AS exists")
    const actor = roleColumn.rows[0]?.exists
      ? await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,email,display_name,password_hash,workspace_role) VALUES($1,'human','worker@example.test','Worker admin','not-used','admin') RETURNING id", [workspaceId])
      : await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,email,display_name,password_hash) VALUES($1,'human','worker@example.test','Worker admin','not-used') RETURNING id", [workspaceId])
    actorId = actor.rows[0]!.id
  })

  afterAll(async () => { await db.end() })

  it('delivers a committed event to the observable receiver before marking it delivered', async () => {
    const outboxId = await createCommittedEvent('worker.delivery.normal')
    const received: ClaimedEvent[] = []
    const worker = createOutboxWorker({ db, workerId: 'worker-normal', sink: receiver(received) })

    await worker.tick()

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ id: outboxId, workspaceId, topic: 'worker.delivery.normal', scope: expect.any(String) })
    const persisted = await db.query<{ status: string }>('SELECT status FROM outbox_events WHERE id=$1', [outboxId])
    expect(persisted.rows[0]?.status).toBe('delivered')
  })

  it('restarts after a committed claim and delivers the recovered event to the receiver', async () => {
    const outboxId = await createCommittedEvent('worker.delivery.recovery')
    const beforeCrash = createOutboxWorker({ db, workerId: 'worker-before-crash', sink: receiver([]) })
    expect(await beforeCrash.claimOutbox(1, 60)).toHaveLength(1)

    // The first process dies after committing its claim but before any receiver call.
    await db.query("UPDATE outbox_events SET locked_at=now()-interval '61 seconds' WHERE id=$1", [outboxId])
    const received: ClaimedEvent[] = []
    const afterRestart = createOutboxWorker({ db, workerId: 'worker-after-restart', sink: receiver(received) })
    await afterRestart.tick()

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ id: outboxId, attemptCount: 2, topic: 'worker.delivery.recovery' })
    const persisted = await db.query<{ status: string; attempt_count: number }>('SELECT status,attempt_count FROM outbox_events WHERE id=$1', [outboxId])
    expect(persisted.rows[0]).toMatchObject({ status: 'delivered', attempt_count: 2 })
  })

  it('retries a failed receiver delivery with a bounded backoff', async () => {
    const outboxId = await createCommittedEvent('worker.delivery.retry')
    const received: ClaimedEvent[] = []
    let shouldFail = true
    const sink: DeliverySink = { deliver: async event => { if (shouldFail) throw new Error('receiver unavailable'); received.push(event) } }
    const worker = createOutboxWorker({ db, workerId: 'worker-retry', sink })

    await worker.tick()
    const failed = await db.query<{ status: string; attempt_count: number; last_error: string; available_at: string }>('SELECT status,attempt_count,last_error,available_at FROM outbox_events WHERE id=$1', [outboxId])
    expect(failed.rows[0]).toMatchObject({ status: 'pending', attempt_count: 1, last_error: 'receiver unavailable' })
    await db.query('UPDATE outbox_events SET available_at=now() WHERE id=$1', [outboxId])
    shouldFail = false

    await worker.tick()
    expect(received).toHaveLength(1)
    const delivered = await db.query<{ status: string; attempt_count: number }>('SELECT status,attempt_count FROM outbox_events WHERE id=$1', [outboxId])
    expect(delivered.rows[0]).toMatchObject({ status: 'delivered', attempt_count: 2 })
  })

  it('marks an event dead after eight failed attempts and never claims it again', async () => {
    const outboxId = await createCommittedEvent('worker.delivery.dead')
    const sink: DeliverySink = { deliver: async () => { throw new Error('permanent receiver failure') } }
    const worker = createOutboxWorker({ db, workerId: 'worker-dead', sink })

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      await worker.tick()
      if (attempt < 8) await db.query('UPDATE outbox_events SET available_at=now() WHERE id=$1', [outboxId])
    }

    const dead = await db.query<{ status: string; attempt_count: number }>('SELECT status,attempt_count FROM outbox_events WHERE id=$1', [outboxId])
    expect(dead.rows[0]).toMatchObject({ status: 'dead', attempt_count: 8 })
    expect(await worker.claimOutbox(1)).toEqual([])
  })
})
