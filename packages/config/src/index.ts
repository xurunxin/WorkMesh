import { z } from 'zod'
import net from 'node:net'
import { randomBytes } from 'node:crypto'
import { featureDefinitions, releaseMetadata, type FeatureKey } from '@workmesh/contracts'
import {
  decodeCanonicalBase64Url,
  isRepeatedSecretMaterial,
  runtimeSecretEnvironmentNames,
  runtimeSecretValue,
  secretMaterialCandidates,
} from './runtime-secrets.mjs'

const loopbackHosts = new Set(['127.0.0.1', '::1'])

const boundedInt = (minimum: number, maximum: number, fallback: number) =>
  z.coerce.number().int().min(minimum).max(maximum).default(fallback)
const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
)
const redisKeyPrefix = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[A-Za-z0-9:_-]+$/)
  .default('authrl')
const realtimeRedisMaxLen = boundedInt(100, 10_000_000, 100_000)
const proxyCidrs = z
  .string()
  .default('')
  .transform((value, context) => {
    const entries = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    if (entries.length > 32) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At most 32 trusted proxy CIDRs are allowed',
      })
      return z.NEVER
    }
    for (const entry of entries) {
      const [address, rawPrefix, ...rest] = entry.split('/')
      const family = address ? net.isIP(address) : 0
      const prefix = rawPrefix === undefined ? undefined : Number(rawPrefix)
      if (
        rest.length ||
        family === 0 ||
        (prefix !== undefined &&
          (!Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid trusted proxy CIDR: ${entry}`,
        })
      }
    }
    return entries
  })

function secretReusesBootstrapMaterial(
  bootstrapToken: string,
  bootstrapMaterial: Buffer,
  env: NodeJS.ProcessEnv,
): boolean {
  if (
    runtimeSecretEnvironmentNames.some(
      (name) =>
        name !== 'WORKMESH_BOOTSTRAP_TOKEN' && runtimeSecretValue(env, name) === bootstrapToken,
    )
  )
    return true

  const masterKey = env.WORKMESH_MASTER_KEY
  if (
    masterKey &&
    /^[0-9a-fA-F]{64}$/.test(masterKey) &&
    Buffer.from(masterKey, 'hex').equals(bootstrapMaterial)
  )
    return true

  return false
}

function bootstrapTokenIssue(
  value: string,
  decoded: Buffer | undefined,
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (!decoded)
    return 'WORKMESH_BOOTSTRAP_TOKEN must be canonical unpadded base64url encoding of 32 to 256 random bytes'
  const decodedText = decoded.toString('utf8')
  if (
    /change[_-]?me|replace[_-]?me|placeholder|example|workmesh[_-]?bootstrap/i.test(value) ||
    /change[_-]?me|replace[_-]?me|placeholder|example|workmesh[_-]?bootstrap/i.test(decodedText)
  )
    return 'WORKMESH_BOOTSTRAP_TOKEN must not be a placeholder'
  if (isRepeatedSecretMaterial(decoded))
    return 'WORKMESH_BOOTSTRAP_TOKEN must not be a repeated or low-diversity value'
  if (secretReusesBootstrapMaterial(value, decoded, env))
    return 'WORKMESH_BOOTSTRAP_TOKEN must not reuse another configured secret'
  return undefined
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32),
    API_HOST: z.string().trim().min(1).max(255).default('0.0.0.0'),
    WORKMESH_BOOTSTRAP_TOKEN: optionalString,
    WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK: z.enum(['true', 'false']).default('false'),
    AUTH_RATE_LIMIT_HMAC_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(32).optional(),
    ),
    AUTH_RATE_LIMIT_REDIS_PREFIX: redisKeyPrefix,
    AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS: proxyCidrs,
    AUTH_RATE_LIMIT_ENDPOINT_BURST: boundedInt(1, 10_000, 30),
    AUTH_RATE_LIMIT_SOCKET_BURST: boundedInt(1, 10_000, 60),
    AUTH_RATE_LIMIT_CLIENT_IP_BURST: boundedInt(1, 10_000, 40),
    AUTH_RATE_LIMIT_SUBJECT_BURST: boundedInt(1, 1_000, 8),
    AUTH_RATE_LIMIT_INSTALL_BURST: boundedInt(1, 100, 5),
    AUTH_RATE_LIMIT_REFILL_MS: boundedInt(10, 3_600_000, 2_000),
    AUTH_RATE_LIMIT_BACKOFF_BASE_MS: boundedInt(10, 60_000, 500),
    AUTH_RATE_LIMIT_BACKOFF_MAX_MS: boundedInt(100, 3_600_000, 60_000),
    AUTH_RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS: boundedInt(50, 30_000, 500),
    AUTH_RATE_LIMIT_REDIS_COMMAND_TIMEOUT_MS: boundedInt(50, 30_000, 750),
    AUTH_RATE_LIMIT_SUMMARY_INTERVAL_MS: boundedInt(1_000, 3_600_000, 60_000),
    REALTIME_HEALTHY_RECONCILE_MS: boundedInt(1_000, 300_000, 15_000),
    REALTIME_FALLBACK_RECONCILE_MS: boundedInt(250, 30_000, 1_000),
    REALTIME_BATCH_LIMIT: boundedInt(1, 500, 100),
    REALTIME_HEARTBEAT_MS: boundedInt(1_000, 120_000, 15_000),
    REALTIME_BACKPRESSURE_TIMEOUT_MS: boundedInt(100, 30_000, 5_000),
    REALTIME_MAX_CLIENTS: boundedInt(1, 100_000, 1_000),
    WORKMESH_REALTIME_REDIS_MAXLEN: realtimeRedisMaxLen,
    PAGINATION_CURSOR_KEYS: optionalString,
    PAGINATION_CURSOR_ACTIVE_KID: optionalString,
    PAGINATION_CURSOR_TTL_SECONDS: boundedInt(60, 86_400, 900),
    SESSION_COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
    PUBLIC_MCP_ORIGIN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().url().optional(),
    ),
    API_PORT: z.coerce.number().int().positive().default(3001),
  })
  .superRefine((value, context) => {
    if (value.AUTH_RATE_LIMIT_BACKOFF_BASE_MS > value.AUTH_RATE_LIMIT_BACKOFF_MAX_MS)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_RATE_LIMIT_BACKOFF_BASE_MS'],
        message: 'Backoff base must not exceed backoff maximum',
      })
    if (value.REALTIME_FALLBACK_RECONCILE_MS > value.REALTIME_HEALTHY_RECONCILE_MS)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REALTIME_FALLBACK_RECONCILE_MS'],
        message: 'Realtime fallback reconciliation must not be slower than healthy reconciliation',
      })
  })
export type Config = z.infer<typeof envSchema> & {
  sessionCookieSecure: boolean
  bootstrapAllowLoopback: boolean
  paginationCursorKeys: ReadonlyMap<string, Buffer>
  paginationCursorActiveKid: string
}

export type RealtimeRedisHintConfig = Readonly<{
  redisUrl: string
  maxLen: number
}>

export type RetentionConfig = Readonly<{
  genericReplayHours: number
  genericConflictDays: number
  eventOnlineDays: number
  archiveRetainDays: number
  cleanupRetainDays: number
  batchSize: number
  leaseSeconds: number
  intervalSeconds: number
  ioTimeoutSeconds: number
  progressStaleSeconds: number
  cleanupEnabled: boolean
  archiveEnabled: boolean
  eventPruneEnabled: boolean
  archivePrefix: string
}>

const retentionEnvironmentSchema = z.object({
  WORKMESH_IDEMPOTENCY_REPLAY_HOURS: boundedInt(24, 24 * 30, 24),
  WORKMESH_IDEMPOTENCY_CONFLICT_DAYS: boundedInt(30, 3650, 30),
  WORKMESH_EVENT_ONLINE_DAYS: boundedInt(90, 3650, 90),
  WORKMESH_EVENT_ARCHIVE_RETAIN_DAYS: boundedInt(365, 36500, 365),
  WORKMESH_RETENTION_CLEANUP_DAYS: boundedInt(30, 3650, 30),
  WORKMESH_RETENTION_BATCH_SIZE: boundedInt(1, 1000, 100),
  WORKMESH_RETENTION_LEASE_SECONDS: boundedInt(15, 3600, 120),
  WORKMESH_RETENTION_INTERVAL_SECONDS: boundedInt(60, 86_400, 3600),
  WORKMESH_RETENTION_IO_TIMEOUT_SECONDS: boundedInt(5, 3600, 300),
  WORKMESH_RETENTION_PROGRESS_STALE_SECONDS: boundedInt(60, 604_800, 7200),
  WORKMESH_RETENTION_CLEANUP_ENABLED: z.enum(['true', 'false']).default('false'),
  WORKMESH_RETENTION_ARCHIVE_ENABLED: z.enum(['true', 'false']).default('true'),
  WORKMESH_EVENT_PRUNE_ENABLED: z.enum(['true', 'false']).default('false'),
  WORKMESH_RETENTION_ARCHIVE_PREFIX: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9/_-]+$/)
    .default('retention/events'),
})

export const loadRetentionConfig = (env: NodeJS.ProcessEnv = process.env): RetentionConfig => {
  const value = retentionEnvironmentSchema.parse(env)
  return Object.freeze({
    genericReplayHours: value.WORKMESH_IDEMPOTENCY_REPLAY_HOURS,
    genericConflictDays: value.WORKMESH_IDEMPOTENCY_CONFLICT_DAYS,
    eventOnlineDays: value.WORKMESH_EVENT_ONLINE_DAYS,
    archiveRetainDays: value.WORKMESH_EVENT_ARCHIVE_RETAIN_DAYS,
    cleanupRetainDays: value.WORKMESH_RETENTION_CLEANUP_DAYS,
    batchSize: value.WORKMESH_RETENTION_BATCH_SIZE,
    leaseSeconds: value.WORKMESH_RETENTION_LEASE_SECONDS,
    intervalSeconds: value.WORKMESH_RETENTION_INTERVAL_SECONDS,
    ioTimeoutSeconds: value.WORKMESH_RETENTION_IO_TIMEOUT_SECONDS,
    progressStaleSeconds: value.WORKMESH_RETENTION_PROGRESS_STALE_SECONDS,
    cleanupEnabled: value.WORKMESH_RETENTION_CLEANUP_ENABLED === 'true',
    archiveEnabled: value.WORKMESH_RETENTION_ARCHIVE_ENABLED === 'true',
    eventPruneEnabled: value.WORKMESH_EVENT_PRUNE_ENABLED === 'true',
    archivePrefix: value.WORKMESH_RETENTION_ARCHIVE_PREFIX,
  })
}

export const loadRealtimeRedisHintConfig = (
  env: NodeJS.ProcessEnv = process.env,
): RealtimeRedisHintConfig => ({
  redisUrl: z.string().url().parse(env.REDIS_URL),
  maxLen: realtimeRedisMaxLen.parse(env.WORKMESH_REALTIME_REDIS_MAXLEN),
})

function parsePaginationCursorKeys(
  raw: string | undefined,
  activeKid: string | undefined,
  env: NodeJS.ProcessEnv,
  production: boolean,
): { keys: ReadonlyMap<string, Buffer>; activeKid: string } {
  if (!raw) {
    if (production)
      throw new Error(
        'PAGINATION_CURSOR_KEYS and PAGINATION_CURSOR_ACTIVE_KID are required in production',
      )
    if (activeKid) throw new Error('PAGINATION_CURSOR_ACTIVE_KID requires PAGINATION_CURSOR_KEYS')
    return {
      keys: new Map([['dev-ephemeral', randomBytes(32)]]),
      activeKid: 'dev-ephemeral',
    }
  }
  if (!activeKid)
    throw new Error(
      'PAGINATION_CURSOR_ACTIVE_KID is required when PAGINATION_CURSOR_KEYS is configured',
    )
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(activeKid))
    throw new Error('PAGINATION_CURSOR_ACTIVE_KID must be a safe key identifier')

  const keys = new Map<string, Buffer>()
  for (const entry of raw.split(',')) {
    const separator = entry.indexOf(':')
    if (separator <= 0 || separator === entry.length - 1)
      throw new Error('PAGINATION_CURSOR_KEYS must use kid:canonical-base64url entries')
    const kid = entry.slice(0, separator)
    const encoded = entry.slice(separator + 1)
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(kid) || keys.has(kid))
      throw new Error('PAGINATION_CURSOR_KEYS contains an invalid or duplicate key identifier')
    const material = decodeCanonicalBase64Url(encoded)
    if (!material)
      throw new Error(
        'Each pagination cursor key must be canonical base64url encoding of 32 to 256 random bytes',
      )
    const decodedText = material.toString('utf8')
    if (
      /change[_-]?me|replace[_-]?me|placeholder|example|pagination[_-]?cursor/i.test(encoded) ||
      /change[_-]?me|replace[_-]?me|placeholder|example|pagination[_-]?cursor/i.test(decodedText)
    )
      throw new Error('Pagination cursor keys must not use placeholder material')
    if (isRepeatedSecretMaterial(material))
      throw new Error('Pagination cursor keys must not use repeated or low-diversity material')
    if ([...keys.values()].some((existing) => existing.equals(material)))
      throw new Error('Pagination cursor keys must use distinct material')
    const reused = runtimeSecretEnvironmentNames
      .filter((name) => name !== 'PAGINATION_CURSOR_KEYS')
      .flatMap((name) => secretMaterialCandidates(runtimeSecretValue(env, name)))
      .some((candidate) => candidate.equals(material))
    if (reused) throw new Error('Pagination cursor keys must not reuse another configured secret')
    keys.set(kid, material)
  }
  if (!keys.has(activeKid))
    throw new Error('PAGINATION_CURSOR_ACTIVE_KID must identify a configured pagination cursor key')
  return { keys, activeKid }
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const value = envSchema.parse(env)
  const bootstrapMaterial = value.WORKMESH_BOOTSTRAP_TOKEN
    ? decodeCanonicalBase64Url(value.WORKMESH_BOOTSTRAP_TOKEN)
    : undefined
  const bootstrapIssue = value.WORKMESH_BOOTSTRAP_TOKEN
    ? bootstrapTokenIssue(value.WORKMESH_BOOTSTRAP_TOKEN, bootstrapMaterial, env)
    : undefined
  if (bootstrapIssue) throw new Error(bootstrapIssue)

  const allowLoopback = value.WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK === 'true'
  if (value.NODE_ENV === 'production' && allowLoopback)
    throw new Error('WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK is forbidden in production')
  if (value.NODE_ENV === 'production' && !value.WORKMESH_BOOTSTRAP_TOKEN)
    throw new Error('WORKMESH_BOOTSTRAP_TOKEN is required in production')
  if (!value.WORKMESH_BOOTSTRAP_TOKEN) {
    if (!allowLoopback)
      throw new Error(
        'WORKMESH_BOOTSTRAP_TOKEN is required unless the explicit non-production loopback bootstrap mode is enabled',
      )
    if (!loopbackHosts.has(value.API_HOST))
      throw new Error('Tokenless bootstrap requires API_HOST to be exactly 127.0.0.1 or ::1')
    if (value.AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS.length)
      throw new Error('Tokenless bootstrap forbids trusted proxy CIDRs')
  }
  const pagination = parsePaginationCursorKeys(
    value.PAGINATION_CURSOR_KEYS,
    value.PAGINATION_CURSOR_ACTIVE_KID,
    env,
    value.NODE_ENV === 'production',
  )

  return {
    ...value,
    sessionCookieSecure: value.SESSION_COOKIE_SECURE === 'true',
    bootstrapAllowLoopback: allowLoopback,
    paginationCursorKeys: pagination.keys,
    paginationCursorActiveKid: pagination.activeKid,
  }
}

const booleanFlagSchema = z.enum(['true', 'false']).default('false')
const featureEnvironmentSchema = z.object(
  Object.fromEntries(
    featureDefinitions.map((feature) => [feature.key, booleanFlagSchema]),
  ) as Record<FeatureKey, typeof booleanFlagSchema>,
)

export type FeatureConfig = Readonly<Record<FeatureKey, boolean>>

export const loadFeatureConfig = (env: NodeJS.ProcessEnv = process.env): FeatureConfig => {
  const parsed = featureEnvironmentSchema.parse(env)
  return Object.freeze(
    Object.fromEntries(
      featureDefinitions.map((feature) => [feature.key, parsed[feature.key] === 'true']),
    ) as Record<FeatureKey, boolean>,
  )
}

const buildShaSchema = z
  .string()
  .trim()
  .min(7)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/)

export const loadReleaseInfo = (env: NodeJS.ProcessEnv = process.env) => ({
  ...releaseMetadata,
  buildSha: buildShaSchema.safeParse(env.WORKMESH_BUILD_SHA).data ?? 'unknown',
})
