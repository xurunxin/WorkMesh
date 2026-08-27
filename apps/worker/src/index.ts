import { randomUUID } from 'node:crypto'
import { createClient } from 'redis'
import {
  loadFeatureConfig,
  loadRealtimeRedisHintConfig,
  loadRetentionConfig,
} from '@workmesh/config'
import { createDb, type Db, withTx } from '@workmesh/db'
import { createAgentWebhookWorker } from './agent-webhook.js'
import { createSessionLifecycleWorker } from './session-lifecycle.js'
import { createProviderActionWorker, validateUploadedChecksum } from './provider-actions.js'
import { createArtifactUploadWorker } from './artifact-uploads.js'
import { artifactStorageFromEnvironment } from '@workmesh/artifact-storage'
import { FakeGitProvider, GiteaProvider, GitHubAppProvider, type GitProvider } from '@workmesh/git-provider'
import { createAutomationWorker } from './automation.js'
import { createRetentionWorker } from './retention.js'
import { createWorkerHealthServer, WorkerRuntime } from './runtime.js'
import { RetentionScheduler } from './retention-scheduler.js'
import { materializeWorkerRuntimeIdentity } from './worker-runtime-identity.js'
import { createAgentConnectionLifecycleWorker } from './agent-connections.js'

export { createAgentWebhookWorker, decryptWebhookSecret, masterKeyFromEnvironment, retryDelaySeconds, signWebhook } from './agent-webhook.js'
export { classifyHeartbeatLiveness, createSessionLifecycleWorker, rebuildWorkItemExecutorProjections } from './session-lifecycle.js'
export { createProviderActionWorker, validateUploadedChecksum } from './provider-actions.js'
export { createArtifactUploadWorker } from './artifact-uploads.js'
export { assertPublicWebhookTarget, createAutomationWorker, nextCronOccurrence } from './automation.js'
export { createRetentionWorker, ordinaryPrunableEventTypes } from './retention.js'
export { createAgentConnectionLifecycleWorker } from './agent-connections.js'

const STREAM_KEY = 'workmesh:domain-events'
const MAX_ATTEMPTS = 8
const REDIS_INITIAL_CONNECT_TIMEOUT_MS = 2_000

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
  probe: () => Promise<void>
  close: () => Promise<void>
}

export type RedisStreamTrimOptions = Readonly<{
  TRIM: Readonly<{
    strategy: 'MAXLEN'
    strategyModifier: '~'
    threshold: number
  }>
}>
export type RedisStreamClient = Readonly<{
  isOpen: boolean
  isReady: boolean
  on: (event: 'error' | 'ready', listener: (value?: unknown) => void) => unknown
  connect: () => Promise<unknown>
  xAdd: (
    key: string,
    id: string,
    message: Record<string, string>,
    options: RedisStreamTrimOptions,
  ) => Promise<unknown>
  ping: () => Promise<unknown>
  quit: () => Promise<unknown>
}>

export type RedisStreamSinkOptions = Readonly<{
  redisUrl?: string
  maxLen?: number
  client?: RedisStreamClient
  connectTimeoutMs?: number
  logConnectionError?: (entry: RedisConnectionErrorLog) => void
  now?: () => number
}>

export type RedisConnectionErrorLog = Readonly<{
  event: 'redis_hint_connection_error'
  errorName: string
  errorCode: string
  occurrence: 'transition' | 'rate_limited_repeat'
  suppressed: number
}>

const REDIS_ERROR_LOG_INTERVAL_MS = 10_000
const REDIS_RECONNECT_MAX_MS = 2_000

export const redisReconnectDelay = (retries: number): number =>
  Math.min(REDIS_RECONNECT_MAX_MS, 50 * 2 ** Math.min(6, Math.max(0, retries)))

const safeRedisErrorToken = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(value)
    ? value
    : fallback

const sanitizedRedisError = (
  error: unknown,
): Pick<RedisConnectionErrorLog, 'errorName' | 'errorCode'> => {
  const record =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : undefined
  return {
    errorName: safeRedisErrorToken(record?.name, 'RedisError'),
    errorCode: safeRedisErrorToken(record?.code, 'UNKNOWN'),
  }
}

export const createRedisConnectionObserver = ({
  log = (entry) => {
    console.warn('redis realtime hint unavailable', entry)
  },
  now = Date.now,
}: {
  log?: (entry: RedisConnectionErrorLog) => void
  now?: () => number
} = {}): {
  error: (error?: unknown) => void
  ready: () => void
} => {
  let unavailable = false
  let lastLoggedAt = Number.NEGATIVE_INFINITY
  let suppressed = 0

  return {
    error: (error?: unknown): void => {
      try {
        const sanitized = sanitizedRedisError(error)
        const observedAt = now()
        const transition = !unavailable
        if (
          transition ||
          observedAt - lastLoggedAt >= REDIS_ERROR_LOG_INTERVAL_MS
        ) {
          log({
            event: 'redis_hint_connection_error',
            ...sanitized,
            occurrence: transition ? 'transition' : 'rate_limited_repeat',
            suppressed,
          })
          unavailable = true
          lastLoggedAt = observedAt
          suppressed = 0
        } else {
          suppressed += 1
        }
      } catch {
        // EventEmitter error listeners must never throw into the Worker process.
      }
    },
    ready: (): void => {
      unavailable = false
      lastLoggedAt = Number.NEGATIVE_INFINITY
      suppressed = 0
    },
  }
}

/**
 * Redis is a delivery transport only. PostgreSQL remains the source for SSE
 * and the durable recovery point if this write succeeds before the DB confirm.
 */
export class RedisStreamSink implements DeliverySink {
  readonly #client: RedisStreamClient
  readonly #maxLen: number
  readonly #connectTimeoutMs: number
  #connecting: Promise<void> | undefined

  constructor(options: RedisStreamSinkOptions = {}) {
    const runtime = options.redisUrl && options.maxLen
      ? { redisUrl: options.redisUrl, maxLen: options.maxLen }
      : loadRealtimeRedisHintConfig()
    this.#maxLen = options.maxLen ?? runtime.maxLen
    this.#client =
      options.client ??
      (createClient({
        url: options.redisUrl ?? runtime.redisUrl,
        disableOfflineQueue: true,
        socket: {
          reconnectStrategy: redisReconnectDelay,
        },
      }) as unknown as RedisStreamClient)
    this.#connectTimeoutMs = Math.min(
      REDIS_INITIAL_CONNECT_TIMEOUT_MS,
      Math.max(1, options.connectTimeoutMs ?? REDIS_INITIAL_CONNECT_TIMEOUT_MS),
    )
    const observer = createRedisConnectionObserver({
      log: options.logConnectionError,
      now: options.now,
    })
    this.#client.on('error', observer.error)
    this.#client.on('ready', observer.ready)
  }

  #startConnecting(): Promise<void> | undefined {
    if (this.#connecting) return this.#connecting
    if (this.#client.isOpen) return undefined

    const connecting = Promise.resolve()
      .then(() => this.#client.connect())
      .then(
        () => undefined,
        () => {
          throw new Error('REDIS_STREAM_CONNECT_FAILED')
        },
      )
      .finally(() => {
        if (this.#connecting === connecting) this.#connecting = undefined
      })
    this.#connecting = connecting
    void connecting.catch(() => undefined)
    return connecting
  }

  async #waitForConnecting(connecting: Promise<void>): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        connecting,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            reject(new Error('REDIS_STREAM_CONNECT_TIMEOUT'))
          }, this.#connectTimeoutMs)
        }),
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  async deliver(event: ClaimedEvent): Promise<void> {
    if (!this.#client.isReady) {
      void this.#startConnecting()
      throw new Error('REDIS_STREAM_NOT_READY')
    }
    await this.#client.xAdd(STREAM_KEY, '*', {
      cursor: event.cursor,
      workspaceId: event.workspaceId,
    }, {
      TRIM: {
        strategy: 'MAXLEN',
        strategyModifier: '~',
        threshold: this.#maxLen,
      },
    })
  }

  async close(): Promise<void> {
    if (this.#client.isOpen) await this.#client.quit()
  }

  async probe(): Promise<void> {
    if (!this.#client.isReady) {
      const connecting = this.#startConnecting()
      if (!connecting) throw new Error('REDIS_STREAM_NOT_READY')
      await this.#waitForConnecting(connecting)
      if (!this.#client.isReady) throw new Error('REDIS_STREAM_NOT_READY')
    }
    await this.#client.ping()
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

  const probe = async (): Promise<void> => {
    await activeDb.query('SELECT 1')
    if (activeSink instanceof RedisStreamSink) await activeSink.probe()
  }

  const close = async (): Promise<void> => {
    await activeSink.close?.()
    if (ownsDb) await activeDb.end()
  }

  return { claimOutbox, deliver, fail, tick, probe, close }
}

const startWorkerProcess = async (): Promise<void> => {
  const runtimeIdentity = await materializeWorkerRuntimeIdentity()
  const db = createDb()
  const features = loadFeatureConfig()
  const outboxWorker = createOutboxWorker({ db })
  const agentWebhookWorker = createAgentWebhookWorker({ db })
  const sessionLifecycleWorker = createSessionLifecycleWorker({ db })
  const fakeProvider = new FakeGitProvider()
  const githubProviders = new Map<string, GitProvider>()
  const giteaProviders = new Map<string, GitProvider>()
  const providerActionWorker = createProviderActionWorker({
    db,
    allowedProviders: features.WORKMESH_BETA_GITEA
      ? ['fake', 'github', 'gitea']
      : ['fake', 'github'],
    resolveProvider: async (provider, connectionId) => {
      if (provider === 'fake') return fakeProvider
      if (provider === 'gitea') {
        if (!features.WORKMESH_BETA_GITEA) throw new Error('FEATURE_DISABLED:WORKMESH_BETA_GITEA')
        const cached = giteaProviders.get(connectionId)
        if (cached) return cached
        const masterKey = process.env.WORKMESH_MASTER_KEY
        if (!masterKey) throw new Error('WORKMESH_MASTER_KEY is required for Gitea credentials')
        const row = (await db.query<{ installation_id: string; credentials: string }>(
          `SELECT installation_id,pgp_sym_decrypt(credentials_ciphertext,$2) AS credentials
             FROM provider_connections
            WHERE id=$1 AND provider='gitea' AND active`,
          [connectionId, masterKey],
        )).rows[0]
        if (!row?.installation_id) throw new Error('GITEA_CONNECTION_NOT_FOUND')
        const credentials = JSON.parse(row.credentials) as { accessToken?: unknown }
        if (typeof credentials.accessToken !== 'string') throw new Error('GITEA_CREDENTIALS_INVALID')
        const gitea = new GiteaProvider({
          baseUrl: row.installation_id,
          accessToken: credentials.accessToken,
        })
        giteaProviders.set(connectionId, gitea)
        return gitea
      }
      const cached = githubProviders.get(connectionId)
      if (cached) return cached
      const masterKey = process.env.WORKMESH_MASTER_KEY
      if (!masterKey) throw new Error('WORKMESH_MASTER_KEY is required for GitHub App credentials')
      const row = (await db.query<{ installation_id: string; credentials: string }>(
        `SELECT installation_id,pgp_sym_decrypt(credentials_ciphertext,$2) AS credentials
           FROM provider_connections
          WHERE id=$1 AND provider='github' AND active`,
        [connectionId, masterKey],
      )).rows[0]
      if (!row?.installation_id) throw new Error('GITHUB_APP_CONNECTION_NOT_FOUND')
      const credentials = JSON.parse(row.credentials) as { appId?: unknown; privateKey?: unknown }
      if (typeof credentials.appId !== 'string' || typeof credentials.privateKey !== 'string')
        throw new Error('GITHUB_APP_CREDENTIALS_INVALID')
      const github = new GitHubAppProvider({
        appId: credentials.appId,
        privateKey: credentials.privateKey,
        installationId: row.installation_id,
        apiBaseUrl: process.env.GITHUB_API_URL,
      })
      githubProviders.set(connectionId, github)
      return github
    },
  })
  const artifactStorage = artifactStorageFromEnvironment()
  const artifactUploadWorker = createArtifactUploadWorker({ db, storage: artifactStorage })
  const automationWorker = createAutomationWorker({ db, features })
  const agentConnectionWorker = createAgentConnectionLifecycleWorker({ db })
  const retentionConfig = loadRetentionConfig()
  const retentionWorker = createRetentionWorker({
    db,
    config: retentionConfig,
    storage: artifactStorage,
    runtimeIdentity,
  })
  const retentionScheduler = new RetentionScheduler({
    tick: retentionWorker.tick,
    close: retentionWorker.close,
    intervalMs: retentionConfig.intervalSeconds * 1_000,
    ioTimeoutMs: retentionConfig.ioTimeoutSeconds * 1_000,
    progressStaleMs: retentionConfig.progressStaleSeconds * 1_000,
    onError: entry => console.error('retention worker tick failed', {
      component: 'retention_scheduler',
      safeErrorCode: entry.safeErrorCode,
    }),
  })
  let admissionOpen = true
  const tick = async (): Promise<void> => {
    const jobs = [
      () => outboxWorker.tick(),
      () => agentWebhookWorker.tick(),
      () => sessionLifecycleWorker.tick(),
      () => providerActionWorker.tick(),
      () => artifactUploadWorker.tick(),
      () => automationWorker.tick(),
      () => agentConnectionWorker.tick(),
    ]
    for (const job of jobs) {
      if (!admissionOpen) return
      await job()
    }
  }
  const closeWorkerDependencies = async (): Promise<void> => {
    const results = await Promise.allSettled([
      outboxWorker.close(),
      retentionScheduler.stop(),
    ])
    const errors = results.flatMap(result =>
      result.status === 'rejected' ? [result.reason] : [],
    )
    try {
      await db.end()
    } catch (error) {
      errors.push(error)
    }
    if (errors.length > 0)
      throw new AggregateError(errors, 'WORKER_DEPENDENCY_CLOSE_FAILED')
  }
  const runtime = new WorkerRuntime({
    tick,
    probe: async () => {
      await outboxWorker.probe()
      await artifactStorage.probe()
    },
    readiness: () => retentionScheduler.assertReady(),
    stopAdmission: () => {
      admissionOpen = false
      retentionScheduler.stopAdmission()
    },
    close: closeWorkerDependencies,
    onError: () => console.error('worker tick failed', {
      component: 'worker_runtime',
      safeErrorCode: 'WORKER_JOB_FAILED',
    }),
  })
  const healthServer = createWorkerHealthServer(runtime)
  const healthHost = process.env.WORKER_HEALTH_HOST ?? '0.0.0.0'
  const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? 3003)
  healthServer.listen(healthPort, healthHost, () => {
    retentionScheduler.start()
    void runtime.start().catch(() => {
      console.error('worker readiness failed at startup', {
        component: 'worker_runtime',
        safeErrorCode: 'WORKER_STARTUP_FAILED',
      })
      process.exit(1)
    })
  })
  let stopping = false
  const stop = (): void => {
    if (stopping) return
    stopping = true
    admissionOpen = false
    retentionScheduler.stopAdmission()
    const configured = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 30_000)
    const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : 30_000
    void runtime.stop(timeoutMs)
      .then(() => new Promise<void>((resolve, reject) => {
        healthServer.close(error => error ? reject(error) : resolve())
      }))
      .then(() => process.exit(0))
      .catch(() => {
        console.error('worker shutdown failed', {
          component: 'worker_runtime',
          safeErrorCode: 'WORKER_SHUTDOWN_FAILED',
        })
        healthServer.closeAllConnections()
        process.exit(1)
      })
  }

  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}

if (process.env.NODE_ENV !== 'test')
  void startWorkerProcess().catch(() => {
    console.error('worker identity initialization failed', {
      component: 'worker_runtime',
      safeErrorCode: 'WORKER_IDENTITY_INITIALIZATION_FAILED',
    })
    process.exit(1)
  })
