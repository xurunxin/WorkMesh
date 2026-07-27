import { z } from 'zod'
import net from 'node:net'
import {
  featureDefinitions,
  releaseMetadata,
  type FeatureKey,
} from '@workmesh/contracts'

const boundedInt = (minimum: number, maximum: number, fallback: number) =>
  z.coerce.number().int().min(minimum).max(maximum).default(fallback)
const redisKeyPrefix = z.string().trim().min(1).max(96).regex(/^[A-Za-z0-9:_-]+$/).default('authrl')
const proxyCidrs = z.string().default('').transform((value, context) => {
  const entries = value.split(',').map(entry => entry.trim()).filter(Boolean)
  if (entries.length > 32) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'At most 32 trusted proxy CIDRs are allowed' })
    return z.NEVER
  }
  for (const entry of entries) {
    const [address, rawPrefix, ...rest] = entry.split('/')
    const family = address ? net.isIP(address) : 0
    const prefix = rawPrefix === undefined ? undefined : Number(rawPrefix)
    if (rest.length || family === 0 || (prefix !== undefined && (!Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid trusted proxy CIDR: ${entry}` })
    }
  }
  return entries
})
const envSchema = z.object({
  DATABASE_URL: z.string().url(), REDIS_URL: z.string().url(), SESSION_SECRET: z.string().min(32),
  AUTH_RATE_LIMIT_HMAC_KEY: z.preprocess(value => value === '' ? undefined : value, z.string().min(32).optional()),
  AUTH_RATE_LIMIT_REDIS_PREFIX: redisKeyPrefix,
  AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS: proxyCidrs,
  AUTH_RATE_LIMIT_ENDPOINT_BURST: boundedInt(1, 10_000, 30), AUTH_RATE_LIMIT_SOCKET_BURST: boundedInt(1, 10_000, 60),
  AUTH_RATE_LIMIT_CLIENT_IP_BURST: boundedInt(1, 10_000, 40), AUTH_RATE_LIMIT_SUBJECT_BURST: boundedInt(1, 1_000, 8),
  AUTH_RATE_LIMIT_INSTALL_BURST: boundedInt(1, 100, 5), AUTH_RATE_LIMIT_REFILL_MS: boundedInt(10, 3_600_000, 2_000),
  AUTH_RATE_LIMIT_BACKOFF_BASE_MS: boundedInt(10, 60_000, 500), AUTH_RATE_LIMIT_BACKOFF_MAX_MS: boundedInt(100, 3_600_000, 60_000),
  AUTH_RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS: boundedInt(50, 30_000, 500), AUTH_RATE_LIMIT_REDIS_COMMAND_TIMEOUT_MS: boundedInt(50, 30_000, 750),
  AUTH_RATE_LIMIT_SUMMARY_INTERVAL_MS: boundedInt(1_000, 3_600_000, 60_000),
  SESSION_COOKIE_SECURE: z.enum(['true', 'false']).default('false'), WEB_ORIGIN: z.string().url().default('http://localhost:3000'), API_PORT: z.coerce.number().int().positive().default(3001),
}).superRefine((value, context) => {
  if (value.AUTH_RATE_LIMIT_BACKOFF_BASE_MS > value.AUTH_RATE_LIMIT_BACKOFF_MAX_MS)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['AUTH_RATE_LIMIT_BACKOFF_BASE_MS'], message: 'Backoff base must not exceed backoff maximum' })
})
export type Config = z.infer<typeof envSchema> & { sessionCookieSecure: boolean }
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => { const value = envSchema.parse(env); return { ...value, sessionCookieSecure: value.SESSION_COOKIE_SECURE === 'true' } }

const booleanFlagSchema = z.enum(['true', 'false']).default('false')
const featureEnvironmentSchema = z.object(Object.fromEntries(
  featureDefinitions.map(feature => [feature.key, booleanFlagSchema]),
) as Record<FeatureKey, typeof booleanFlagSchema>)

export type FeatureConfig = Readonly<Record<FeatureKey, boolean>>

export const loadFeatureConfig = (env: NodeJS.ProcessEnv = process.env): FeatureConfig => {
  const parsed = featureEnvironmentSchema.parse(env)
  return Object.freeze(Object.fromEntries(
    featureDefinitions.map(feature => [feature.key, parsed[feature.key] === 'true']),
  ) as Record<FeatureKey, boolean>)
}

const buildShaSchema = z.string().trim().min(7).max(128).regex(/^[A-Za-z0-9._-]+$/)

export const loadReleaseInfo = (env: NodeJS.ProcessEnv = process.env) => ({
  ...releaseMetadata,
  buildSha: buildShaSchema.safeParse(env.WORKMESH_BUILD_SHA).data ?? 'unknown',
})
