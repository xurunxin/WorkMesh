import { randomUUID } from 'node:crypto'
import { createClient, type RedisClientType } from 'redis'
import { createDb, type Db, withTx } from '@workmesh/db'
import { createAgentWebhookWorker } from './agent-webhook.js'
import { createSessionLifecycleWorker } from './session-lifecycle.js'

export { createAgentWebhookWorker, decryptWebhookSecret, masterKeyFromEnvironment, retryDelaySeconds, signWebhook } from './agent-webhook.js'
export { classifyHeartbeatLiveness, createSessionLifecycleWorker } from './session-lifecycle.js'

const STREAM_KEY = 'workmesh:domain-events'
const MAX_ATTEMPTS = 8

export type ClaimedEvent = {
  id: string
  eventId: string
  cursor: string
  workspaceId: string
  topic: string
  scope: string
  payload: unknown
  attemptCount: number
}

export type DeliverySink = {
  deliver: (event: ClaimedEvent) => Promise<void>
  close?: () => Promise<void>
}

export type OutboxWorker = {
  claimOutbox: (limit?: number, lockTimeoutSeconds?: number) => Promise<ClaimedEvent[]>
  deliver: (event: ClaimedEvent) => Promise<void>
  fail: (event: ClaimedEvent, error: unknown) => Promise<void>
  tick: () => Promise<void>
  close: () => Promise<void>
}

type RedisClient = RedisClientType

/**
 * Redis is a delivery transport only. PostgreSQL remains the source for SSE
 * and the durable recovery point if this write succeeds before the DB confirm.
 */
export class RedisStreamSink implements DeliverySink {
  readonly #client: RedisClient
  #connecting: Promise<unknown> | undefined

  constructor(redisUrl = process.env.REDIS_URL) {
    if (!redisUrl) throw new Error('REDIS_URL is required for outbox delivery')
    this.#client = createClient({ url: redisUrl })
  }

  async deliver(event: ClaimedEvent): Promise<void> {
    if (!this.#client.isOpen) {
      this.#connecting ??= this.#client.connect()
      try {
        await this.#connecting
      } catch (error) {
        this.#connecting = undefined
        throw error
      }
    }
    await this.#client.xAdd(STREAM_KEY, '*', {
      outboxId: event.id,
      eventId: event.eventId,
      cursor: event.cursor,
      workspaceId: event.workspaceId,
      topic: event.topic,
      payload: JSON.stringify(event.payload),
    })
  }

  async close(): Promise<void> {
    if (this.#client.isOpen) await this.#client.quit()
  }
}

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

export function createOutboxWorker({
  db,
  workerId = `worker-${randomUUID()}`,
  sink,
}: {
  db?: Db
  workerId?: string
  sink?: DeliverySink
} = {}): OutboxWorker {
  const ownsDb = !db
  const activeDb = db ?? createDb()
  const activeSink = sink ?? new RedisStreamSink()

  const claimOutbox = async (limit = 25, lockTimeoutSeconds = 60): Promise<ClaimedEvent[]> => withTx(activeDb, async tx => {
    const result = await tx.query<ClaimedEvent>(`
      WITH candidates AS (
        SELECT o.id
        FROM outbox_events o
        WHERE o.attempt_count < $3
          AND (
            (o.status = 'pending' AND o.available_at <= now())
            OR (o.status = 'delivering' AND o.locked_at < now() - ($2::text || ' seconds')::interval)
          )
        ORDER BY o.available_at, o.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      UPDATE outbox_events o
      SET status = 'delivering', locked_at = now(), locked_by = $4, attempt_count = o.attempt_count + 1
      FROM candidates, domain_events e
      WHERE o.id = candidates.id AND e.id = o.domain_event_id
      RETURNING o.id, e.id AS "eventId", e.cursor::text AS cursor, e.workspace_id AS "workspaceId",
                o.topic, o.partition_key AS scope, e.payload, o.attempt_count AS "attemptCount"
    `, [limit, lockTimeoutSeconds, MAX_ATTEMPTS, workerId])
    return result.rows
  })

  const markDelivered = async (event: ClaimedEvent): Promise<void> => {
    const result = await activeDb.query(
      "UPDATE outbox_events SET status='delivered', delivered_at=now(), locked_at=NULL, locked_by=NULL WHERE id=$1 AND locked_by=$2 AND status='delivering'",
      [event.id, workerId],
    )
    if (result.rowCount !== 1) throw new Error('OUTBOX_CLAIM_LOST')
  }

  const deliver = async (event: ClaimedEvent): Promise<void> => {
    await activeSink.deliver(event)
    await markDelivered(event)
  }

  const fail = async (event: ClaimedEvent, error: unknown): Promise<void> => {
    const terminal = event.attemptCount >= MAX_ATTEMPTS
    await activeDb.query(`
      UPDATE outbox_events
      SET status = $2,
          available_at = now() + (LEAST(300, 5 * POWER(2, GREATEST(0, $3 - 1)))::text || ' seconds')::interval,
          locked_at = NULL,
          locked_by = NULL,
          last_error = $4
      WHERE id = $1 AND locked_by = $5 AND status = 'delivering'
    `, [event.id, terminal ? 'dead' : 'pending', event.attemptCount, errorText(error).slice(0, 1000), workerId])
  }

  const tick = async (): Promise<void> => {
    for (const event of await claimOutbox()) {
      try {
        await deliver(event)
      } catch (error) {
        await fail(event, error)
      }
    }
  }

  const close = async (): Promise<void> => {
    await activeSink.close?.()
    if (ownsDb) await activeDb.end()
  }

  return { claimOutbox, deliver, fail, tick, close }
}

const startWorkerProcess = (): void => {
  const db = createDb()
  const outboxWorker = createOutboxWorker({ db })
  const agentWebhookWorker = createAgentWebhookWorker({ db })
  const sessionLifecycleWorker = createSessionLifecycleWorker({ db })
  let stopping = false
  let timer: NodeJS.Timeout | undefined

  const run = async (): Promise<void> => {
    try {
      await outboxWorker.tick()
      await agentWebhookWorker.tick()
      await sessionLifecycleWorker.tick()
    } catch (error) {
      console.error('outbox worker tick failed', error)
    }
    if (!stopping) timer = setTimeout(() => { void run() }, 1000)
  }
  const stop = (): void => {
    if (stopping) return
    stopping = true
    if (timer) clearTimeout(timer)
    void outboxWorker.close().then(() => db.end()).then(() => process.exit(0)).catch(error => {
      console.error('outbox worker shutdown failed', error)
      process.exit(1)
    })
  }

  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  void run()
}

if (process.env.NODE_ENV !== 'test') startWorkerProcess()
