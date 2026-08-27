export const runtimeSecretEnvironmentNames = [
  'SESSION_SECRET',
  'WORKMESH_MASTER_KEY',
  'WORKMESH_BOOTSTRAP_TOKEN',
  'AUTH_RATE_LIMIT_HMAC_KEY',
  'PAGINATION_CURSOR_KEYS',
  'POSTGRES_PASSWORD',
  'S3_SECRET_ACCESS_KEY',
  'WORKMESH_SESSION_TOKEN',
  'WORKMESH_MCP_ACCESS_TOKEN',
  'WORKMESH_WEB_PUSH_PRIVATE_KEY',
]

/** @type {Record<string, readonly string[]>} */
const requiredByService = {
  api: [
    'DATABASE_URL',
    'REDIS_URL',
    'SESSION_SECRET',
    'WORKMESH_MASTER_KEY',
    'WORKMESH_BOOTSTRAP_TOKEN',
    'PAGINATION_CURSOR_KEYS',
    'PAGINATION_CURSOR_ACTIVE_KID',
    'AUTH_RATE_LIMIT_HMAC_KEY',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'WEB_ORIGIN',
  ],
  worker: [
    'DATABASE_URL',
    'REDIS_URL',
    'SESSION_SECRET',
    'WORKMESH_MASTER_KEY',
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ],
  mcp: ['WORKMESH_API_URL', 'WORKMESH_SESSION_TOKEN', 'WORKMESH_MCP_ACCESS_TOKEN'],
  web: ['NEXT_PUBLIC_API_URL'],
  migrate: ['DATABASE_URL'],
}

const minimumLengths = {
  SESSION_SECRET: 32,
  AUTH_RATE_LIMIT_HMAC_KEY: 32,
  POSTGRES_PASSWORD: 32,
  S3_SECRET_ACCESS_KEY: 32,
  WORKMESH_SESSION_TOKEN: 32,
  WORKMESH_MCP_ACCESS_TOKEN: 32,
  WORKMESH_WEB_PUSH_PRIVATE_KEY: 32,
}

const urlNames = [
  'DATABASE_URL',
  'REDIS_URL',
  'WEB_ORIGIN',
  'PUBLIC_MCP_ORIGIN',
  'WORKMESH_API_URL',
  'NEXT_PUBLIC_API_URL',
  'S3_ENDPOINT',
]

/**
 * @param {NodeJS.ProcessEnv} environment
 * @param {string} name
 */
export const runtimeSecretValue = (environment, name) => {
  if (name !== 'POSTGRES_PASSWORD' || environment.POSTGRES_PASSWORD) return environment[name]
  const databaseUrl = environment.DATABASE_URL
  if (!databaseUrl) return undefined
  try {
    const password = new URL(databaseUrl).password
    return password ? decodeURIComponent(password) : undefined
  } catch {
    return undefined
  }
}

/** @param {string} value */
export const decodeCanonicalBase64Url = (value) => {
  if (!/^[A-Za-z0-9_-]{43,342}$/.test(value)) return undefined
  try {
    const decoded = Buffer.from(value, 'base64url')
    if (decoded.length < 32 || decoded.length > 256 || decoded.toString('base64url') !== value)
      return undefined
    return decoded
  } catch {
    return undefined
  }
}

/** @param {Buffer} value */
export const isRepeatedSecretMaterial = (value) => {
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

/** @param {string | undefined} value */
export const secretMaterialCandidates = (value) => {
  if (!value) return []
  const candidates = [Buffer.from(value, 'utf8')]
  if (/^[0-9a-fA-F]{64,512}$/.test(value) && value.length % 2 === 0)
    candidates.push(Buffer.from(value, 'hex'))
  const decoded = decodeCanonicalBase64Url(value)
  if (decoded) candidates.push(decoded)
  return candidates
}

/**
 * @param {string} name
 * @param {string | undefined} value
 */
const namedCandidates = (name, value) => {
  if (!value) return []
  if (name !== 'PAGINATION_CURSOR_KEYS') return secretMaterialCandidates(value)
  return [
    Buffer.from(value, 'utf8'),
    ...value.split(',').flatMap((entry) => {
      const separator = entry.indexOf(':')
      const decoded =
        separator > 0 ? decodeCanonicalBase64Url(entry.slice(separator + 1)) : undefined
      return decoded ? [decoded] : []
    }),
  ]
}

/**
 * @param {NodeJS.ProcessEnv} environment
 * @param {NodeJS.ProcessEnv | undefined} comparisonEnvironment
 */
export const assertRuntimeSecretSeparation = (environment, comparisonEnvironment = undefined) => {
  const seen = new Map()
  if (comparisonEnvironment) {
    for (const name of runtimeSecretEnvironmentNames) {
      if (runtimeSecretValue(environment, name) !== undefined) continue
      for (const candidate of namedCandidates(
        name,
        runtimeSecretValue(comparisonEnvironment, name),
      ))
        if (!seen.has(candidate.toString('hex'))) seen.set(candidate.toString('hex'), name)
    }
  }
  /** @param {NodeJS.ProcessEnv} source */
  const inspect = (source) => {
    for (const name of runtimeSecretEnvironmentNames) {
      const own = new Set()
      for (const candidate of namedCandidates(name, runtimeSecretValue(source, name))) {
        const fingerprint = candidate.toString('hex')
        if (own.has(fingerprint)) continue
        own.add(fingerprint)
        const previous = seen.get(fingerprint)
        if (previous && previous !== name) throw new Error(`${name} must not reuse ${previous}`)
        seen.set(fingerprint, name)
      }
    }
  }
  inspect(environment)
}

/**
 * @param {NodeJS.ProcessEnv} environment
 * @param {NodeJS.ProcessEnv | undefined} comparisonEnvironment
 */
export const validateRuntimeEnvironment = (environment, comparisonEnvironment = undefined) => {
  const service = environment.WORKMESH_SERVICE
  const requiredNames = service ? requiredByService[service] : undefined
  const placeholder = /change[_-]?me|replace[_-]?me|placeholder|example/i
  if (!requiredNames) throw new Error('WORKMESH_SERVICE is invalid')
  if (environment.NODE_ENV !== 'production') throw new Error('NODE_ENV must be production')
  if (!/^[0-9a-f]{40}$/.test(environment.WORKMESH_BUILD_SHA ?? ''))
    throw new Error('WORKMESH_BUILD_SHA must be the exact lowercase 40-character Git SHA')

  for (const name of requiredNames) {
    const value = environment[name]?.trim()
    if (!value) throw new Error(`${name} is required`)
    if (placeholder.test(value)) throw new Error(`${name} must not contain placeholder material`)
  }

  for (const name of runtimeSecretEnvironmentNames) {
    const value = runtimeSecretValue(environment, name)
    if (value && placeholder.test(value))
      throw new Error(`${name} must not contain placeholder material`)
  }

  for (const [name, minimum] of Object.entries(minimumLengths)) {
    const value = runtimeSecretValue(environment, name)
    if (value && value.length < minimum)
      throw new Error(`${name} must contain at least ${minimum} characters`)
  }

  if (
    ['api', 'worker', 'migrate'].includes(service) &&
    !runtimeSecretValue(environment, 'POSTGRES_PASSWORD')
  )
    throw new Error('POSTGRES_PASSWORD is required')

  if (environment.WORKMESH_MASTER_KEY && !/^[0-9a-fA-F]{64}$/.test(environment.WORKMESH_MASTER_KEY))
    throw new Error('WORKMESH_MASTER_KEY must contain exactly 32 bytes encoded as hexadecimal')

  assertRuntimeSecretSeparation(environment, comparisonEnvironment)

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
