import { z } from 'zod'
import net from 'node:net'
import {
  featureDefinitions,
  releaseMetadata,
  type FeatureKey,
} from '@workmesh/contracts'

const loopbackHosts = new Set(['127.0.0.1', '::1'])
const secretEnvironmentNames = [
  'SESSION_SECRET',
  'WORKMESH_MASTER_KEY',
  'AUTH_RATE_LIMIT_HMAC_KEY',
  'POSTGRES_PASSWORD',
  'S3_SECRET_ACCESS_KEY',
  'WORKMESH_MCP_ACCESS_TOKEN',
] as const

const boundedInt = (minimum: number, maximum: number, fallback: number) =>
  z.coerce.number().int().min(minimum).max(maximum).default(fallback)
const optionalString = z.preprocess(
  value => value === '' ? undefined : value,
  z.string().optional(),
)
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

function decodeCanonicalBase64Url(value: string): Buffer | undefined {
  if (!/^[A-Za-z0-9_-]{43,342}$/.test(value)) return undefined
  try {
    const decoded = Buffer.from(value, 'base64url')
    if (
      decoded.length < 32
      || decoded.length > 256
      || decoded.toString('base64url') !== value
    ) return undefined
    return decoded
  } catch {
    return undefined
  }
}

function isRepeatedBootstrapMaterial(value: Buffer): boolean {
  if (new Set(value).size < 8) return true
  for (let width = 1; width <= value.length / 2; width += 1) {
    if (value.length % width !== 0) continue
    let periodic = true
    for (let index = width; index < value.length; index += 1) {
      if (value[index] !== value[index % width]) {
        periodic = false
        break
      }
    }
    if (periodic) return true
  }
  return false
}

function secretReusesBootstrapMaterial(
  bootstrapToken: string,
  bootstrapMaterial: Buffer,
  env: NodeJS.ProcessEnv,
): boolean {
  if (secretEnvironmentNames.some(name => env[name] === bootstrapToken))
    return true

  const masterKey = env.WORKMESH_MASTER_KEY
  if (
    masterKey
    && /^[0-9a-fA-F]{64}$/.test(masterKey)
    && Buffer.from(masterKey, 'hex').equals(bootstrapMaterial)
  ) return true

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
  if (/change[_-]?me|replace[_-]?me|placeholder|example|workmesh[_-]?bootstrap/i.test(value)
    || /change[_-]?me|replace[_-]?me|placeholder|example|workmesh[_-]?bootstrap/i.test(decodedText))
    return 'WORKMESH_BOOTSTRAP_TOKEN must not be a placeholder'
  if (isRepeatedBootstrapMaterial(decoded))
    return 'WORKMESH_BOOTSTRAP_TOKEN must not be a repeated or low-diversity value'
  if (secretReusesBootstrapMaterial(value, decoded, env))
    return 'WORKMESH_BOOTSTRAP_TOKEN must not reuse another configured secret'
  return undefined
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(), REDIS_URL: z.string().url(), SESSION_SECRET: z.string().min(32),
  API_HOST: z.string().trim().min(1).max(255).default('0.0.0.0'),
  WORKMESH_BOOTSTRAP_TOKEN: optionalString,
  WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK: z.enum(['true', 'false']).default('false'),
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
export type Config = z.infer<typeof envSchema> & {
  sessionCookieSecure: boolean
  bootstrapAllowLoopback: boolean
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
      throw new Error('WORKMESH_BOOTSTRAP_TOKEN is required unless the explicit non-production loopback bootstrap mode is enabled')
    if (!loopbackHosts.has(value.API_HOST))
      throw new Error('Tokenless bootstrap requires API_HOST to be exactly 127.0.0.1 or ::1')
    if (value.AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS.length)
      throw new Error('Tokenless bootstrap forbids trusted proxy CIDRs')
  }

  return {
    ...value,
    sessionCookieSecure: value.SESSION_COOKIE_SECURE === 'true',
    bootstrapAllowLoopback: allowLoopback,
  }
}

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
