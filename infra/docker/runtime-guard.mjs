import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const requiredByService = {
  api: [
    'DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET', 'WORKMESH_MASTER_KEY',
    'WORKMESH_BOOTSTRAP_TOKEN', 'PAGINATION_CURSOR_KEYS',
    'PAGINATION_CURSOR_ACTIVE_KID', 'AUTH_RATE_LIMIT_HMAC_KEY', 'S3_BUCKET',
    'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'WEB_ORIGIN',
  ],
  worker: [
    'DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET', 'WORKMESH_MASTER_KEY',
    'S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY',
  ],
  mcp: ['WORKMESH_API_URL', 'WORKMESH_SESSION_TOKEN', 'WORKMESH_MCP_ACCESS_TOKEN'],
  web: ['NEXT_PUBLIC_API_URL'],
  migrate: ['DATABASE_URL'],
}

const minimumLengths = {
  SESSION_SECRET: 32,
  AUTH_RATE_LIMIT_HMAC_KEY: 32,
  S3_SECRET_ACCESS_KEY: 32,
  WORKMESH_SESSION_TOKEN: 32,
  WORKMESH_MCP_ACCESS_TOKEN: 32,
}

const secretNames = [
  'SESSION_SECRET', 'WORKMESH_MASTER_KEY', 'WORKMESH_BOOTSTRAP_TOKEN',
  'AUTH_RATE_LIMIT_HMAC_KEY', 'S3_SECRET_ACCESS_KEY',
  'WORKMESH_SESSION_TOKEN', 'WORKMESH_MCP_ACCESS_TOKEN',
]

const urlNames = [
  'DATABASE_URL', 'REDIS_URL', 'WEB_ORIGIN', 'WORKMESH_API_URL',
  'NEXT_PUBLIC_API_URL', 'S3_ENDPOINT',
]

export const validateRuntimeEnvironment = (
  environment,
  comparisonEnvironment = undefined,
) => {
  const service = environment.WORKMESH_SERVICE
  const placeholder = /change[_-]?me|replace[_-]?me|placeholder|example/i
  if (!(service in requiredByService))
    throw new Error('WORKMESH_SERVICE is invalid')
  if (environment.NODE_ENV !== 'production')
    throw new Error('NODE_ENV must be production')
  if (!/^[0-9a-f]{40}$/.test(environment.WORKMESH_BUILD_SHA ?? ''))
    throw new Error(
      'WORKMESH_BUILD_SHA must be the exact lowercase 40-character Git SHA',
    )

  for (const name of requiredByService[service]) {
    const value = environment[name]?.trim()
    if (!value) throw new Error(`${name} is required`)
    if (placeholder.test(value))
      throw new Error(`${name} must not contain placeholder material`)
  }

  for (const [name, minimum] of Object.entries(minimumLengths)) {
    const value = environment[name]
    if (value !== undefined && value.length < minimum)
      throw new Error(`${name} must contain at least ${minimum} characters`)
  }

  if (
    environment.WORKMESH_MASTER_KEY &&
    !/^[0-9a-fA-F]{64}$/.test(environment.WORKMESH_MASTER_KEY)
  )
    throw new Error(
      'WORKMESH_MASTER_KEY must contain exactly 32 bytes encoded as hexadecimal',
    )

  const seen = new Map()
  if (comparisonEnvironment) {
    for (const name of secretNames) {
      if (environment[name] !== undefined) continue
      const value = comparisonEnvironment[name]
      if (!value) continue
      const previous = seen.get(value)
      if (previous) throw new Error(`${name} must not reuse ${previous}`)
      seen.set(value, name)
    }
  }
  for (const name of secretNames) {
    const value = environment[name]
    if (!value) continue
    const previous = seen.get(value)
    if (previous) throw new Error(`${name} must not reuse ${previous}`)
    seen.set(value, name)
  }

  for (const name of urlNames) {
    const value = environment[name]
    if (!value) continue
    try {
      new URL(value)
    } catch {
      throw new Error(`${name} must be an absolute URL`)
    }
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) validateRuntimeEnvironment(process.env)
