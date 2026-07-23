import { z } from 'zod'

const envSchema = z.object({ DATABASE_URL: z.string().url(), SESSION_SECRET: z.string().min(32), SESSION_COOKIE_SECURE: z.enum(['true', 'false']).default('false'), WEB_ORIGIN: z.string().url().default('http://localhost:3000'), API_PORT: z.coerce.number().int().positive().default(3001) })
export type Config = z.infer<typeof envSchema> & { sessionCookieSecure: boolean }
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => { const value = envSchema.parse(env); return { ...value, sessionCookieSecure: value.SESSION_COOKIE_SECURE === 'true' } }
