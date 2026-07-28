import { z } from 'zod'
import {
  featureDefinitions,
  releaseMetadata,
  type FeatureKey,
} from '@workmesh/contracts'

const envSchema = z.object({ DATABASE_URL: z.string().url(), SESSION_SECRET: z.string().min(32), SESSION_COOKIE_SECURE: z.enum(['true', 'false']).default('false'), WEB_ORIGIN: z.string().url().default('http://localhost:3000'), API_PORT: z.coerce.number().int().positive().default(3001) })
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
