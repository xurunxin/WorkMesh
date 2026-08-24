import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PREFLIGHT_SCHEMA_VERSION = 1 as const
export const REQUIRED_PLAYWRIGHT_PORTS = [3100, 3101, 3200, 3201] as const

type GateStatus = 'pass' | 'blocked'

type CommandResult = Readonly<{
  ok: boolean
  exitCode: number | null
  stdout: string
}>

type RecoveryAction = Readonly<{
  action: 'docker-compose-up-postgres-redis'
  attempted: boolean
  result: 'pass' | 'failed' | 'not-applicable' | 'not-needed'
}>

export type WebUiFinalPreflight = Readonly<{
  schemaVersion: typeof PREFLIGHT_SCHEMA_VERSION
  kind: 'workmesh.web-ui-final-preflight'
  generatedAt: string
  repositoryRoot: string
  status: GateStatus
  recovery: {
    exhausted: boolean
    actions: RecoveryAction[]
  }
  checks: {
    integrationMode: { status: GateStatus; enabled: boolean }
    postgres: {
      status: GateStatus
      configured: boolean
      expectedDatabase: string | null
      actualDatabase: string | null
      dedicatedTestDatabase: boolean
      attempts: number
    }
    redis: {
      status: GateStatus
      configured: boolean
      pong: boolean
      attempts: number
    }
    bootstrapToken: { status: GateStatus; present: boolean }
    ports: {
      status: GateStatus
      entries: Array<{ port: number; available: boolean }>
    }
    compose: {
      status: GateStatus
      file: string
      interpolationComplete: boolean
      paginationCursorKeysPresent: boolean
      paginationCursorActiveKidPresent: boolean
    }
  }
  blockers: string[]
}>

type CliArguments = Readonly<{
  help: boolean
  output: string | null
}>

const HELP = `Usage: pnpm exec tsx scripts/verify-web-ui-final-preflight.mts --output <file>

Checks the disposable local prerequisites required by the final Web UI Playwright gates.
The command writes a versioned JSON result and exits non-zero while any required check is blocked.
`

const assertNeverFlag = (value: string): never => {
  throw new Error(`Unknown argument: ${value}`)
}

export const parsePreflightArguments = (values: readonly string[]): CliArguments => {
  let help = false
  let output: string | null = null
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--help' || value === '-h') {
      help = true
      continue
    }
    if (value === '--output') {
      const next = values[index + 1]
      if (!next || next.startsWith('--')) throw new Error('--output requires a file path')
      output = next
      index += 1
      continue
    }
    assertNeverFlag(value ?? '(missing)')
  }
  if (!help && !output) throw new Error('--output is required')
  return { help, output }
}

export const databaseNameFromUrl = (value: string | undefined): string | null => {
  if (!value) return null
  try {
    const parsed = new URL(value)
    const encodedName = parsed.pathname.replace(/^\//, '')
    return encodedName ? decodeURIComponent(encodedName) : null
  } catch {
    return null
  }
}

export const isDedicatedTestDatabase = (databaseName: string | null): boolean =>
  databaseName !== null && /(^|[_-])test(?:[_-]|$)/i.test(databaseName)

export const parseLastJsonObject = <T,>(output: string): T | null => {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index] ?? '') as T
    } catch {
      // A package runner may emit status lines before the child program's JSON.
    }
  }
  return null
}

const runCommand = async (
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }>,
): Promise<CommandResult> => new Promise(resolve => {
  execFile(
    command,
    [...args],
    {
      cwd: options.cwd,
      env: options.env ?? process.env,
      timeout: options.timeoutMs ?? 30_000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    },
    (error, stdout) => {
      const exitCode = typeof error?.code === 'number' ? error.code : error ? 1 : 0
      resolve({ ok: error === null, exitCode, stdout })
    },
  )
})

type PostgresPool = {
  query: (sql: string) => Promise<{ rows: Array<{ current_database?: unknown }> }>
  end: () => Promise<void>
}

type PostgresModule = {
  Pool: new (options: {
    connectionString: string
    max: number
    connectionTimeoutMillis: number
  }) => PostgresPool
}

type RedisClient = {
  connect: () => Promise<void>
  disconnect: () => void
  isOpen: boolean
  on: (event: 'error', listener: () => void) => unknown
  ping: () => Promise<string>
  quit: () => Promise<unknown>
}

type RedisModule = {
  createClient: (options: {
    url: string
    socket: { connectTimeout: number; reconnectStrategy: false }
  }) => RedisClient
}

const probePostgres = async (repositoryRoot: string): Promise<{ ok: boolean; currentDatabase: string | null }> => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) return { ok: false, currentDatabase: null }
  let pool: PostgresPool | undefined
  try {
    const requireFromDb = createRequire(path.join(repositoryRoot, 'packages', 'db', 'package.json'))
    const { Pool } = requireFromDb('pg') as PostgresModule
    pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 })
    const result = await pool.query('select current_database() as current_database')
    const currentDatabase = result.rows[0]?.current_database
    return {
      ok: typeof currentDatabase === 'string',
      currentDatabase: typeof currentDatabase === 'string' ? currentDatabase : null,
    }
  } catch {
    return { ok: false, currentDatabase: null }
  } finally {
    await pool?.end().catch(() => undefined)
  }
}

const probeRedis = async (repositoryRoot: string): Promise<{ ok: boolean; pong: boolean }> => {
  const url = process.env.REDIS_URL
  if (!url) return { ok: false, pong: false }
  let client: RedisClient | undefined
  try {
    const requireFromApi = createRequire(path.join(repositoryRoot, 'apps', 'api', 'package.json'))
    const { createClient } = requireFromApi('redis') as RedisModule
    client = createClient({ url, socket: { connectTimeout: 5_000, reconnectStrategy: false } })
    client.on('error', () => undefined)
    await client.connect()
    const reply = await client.ping()
    return { ok: reply === 'PONG', pong: reply === 'PONG' }
  } catch {
    return { ok: false, pong: false }
  } finally {
    if (client?.isOpen) await client.quit().catch(() => client?.disconnect())
  }
}

const isLoopbackUrl = (value: string | undefined): boolean => {
  if (!value) return false
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
  } catch {
    return false
  }
}

const probePort = async (port: number): Promise<{ port: number; available: boolean }> =>
  new Promise(resolve => {
    const server = createServer()
    let settled = false
    const finish = (available: boolean): void => {
      if (settled) return
      settled = true
      resolve({ port, available })
    }
    server.once('error', () => finish(false))
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close(error => finish(error === undefined))
    })
  })

const composeConfigured = async (repositoryRoot: string): Promise<boolean> => {
  const result = await runCommand(
    'docker',
    ['compose', '-f', path.join(repositoryRoot, 'docker-compose.yml'), 'config', '--quiet'],
    { cwd: repositoryRoot, env: process.env, timeoutMs: 30_000 },
  )
  return result.ok
}

const attemptLocalRecovery = async (repositoryRoot: string): Promise<RecoveryAction> => {
  const locallyOwned = isLoopbackUrl(process.env.DATABASE_URL) && isLoopbackUrl(process.env.REDIS_URL)
  if (!locallyOwned) {
    return {
      action: 'docker-compose-up-postgres-redis',
      attempted: false,
      result: 'not-applicable',
    }
  }
  const result = await runCommand(
    'docker',
    ['compose', '-f', path.join(repositoryRoot, 'docker-compose.yml'), 'up', '-d', 'postgres', 'redis'],
    { cwd: repositoryRoot, env: process.env, timeoutMs: 120_000 },
  )
  return {
    action: 'docker-compose-up-postgres-redis',
    attempted: true,
    result: result.ok ? 'pass' : 'failed',
  }
}

const wait = async (milliseconds: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, milliseconds))

export const runWebUiFinalPreflight = async (
  repositoryRoot: string,
  now = new Date(),
): Promise<WebUiFinalPreflight> => {
  const expectedDatabase = databaseNameFromUrl(process.env.DATABASE_URL)
  const databaseConfigured = expectedDatabase !== null
  const redisConfigured = Boolean(process.env.REDIS_URL)
  const integrationEnabled = process.env.RUN_INTEGRATION === '1'
  const bootstrapPresent = Boolean(process.env.WORKMESH_BOOTSTRAP_TOKEN)
  const paginationCursorKeysPresent = Boolean(process.env.PAGINATION_CURSOR_KEYS)
  const paginationCursorActiveKidPresent = Boolean(process.env.PAGINATION_CURSOR_ACTIVE_KID)

  let postgresAttempts = databaseConfigured ? 1 : 0
  let redisAttempts = redisConfigured ? 1 : 0
  let [postgres, redis] = await Promise.all([
    probePostgres(repositoryRoot),
    probeRedis(repositoryRoot),
  ])

  const recoveryActions: RecoveryAction[] = []
  if (
    (!postgres.ok || !redis.ok)
    && bootstrapPresent
    && paginationCursorKeysPresent
    && paginationCursorActiveKidPresent
  ) {
    const recovery = await attemptLocalRecovery(repositoryRoot)
    recoveryActions.push(recovery)
    if (recovery.result === 'pass') {
      for (let retry = 0; retry < 10 && (!postgres.ok || !redis.ok); retry += 1) {
        if (retry > 0) await wait(1_000)
        const [nextPostgres, nextRedis] = await Promise.all([
          !postgres.ok && databaseConfigured
            ? probePostgres(repositoryRoot)
            : Promise.resolve(postgres),
          !redis.ok && redisConfigured
            ? probeRedis(repositoryRoot)
            : Promise.resolve(redis),
        ])
        if (!postgres.ok && databaseConfigured) postgresAttempts += 1
        if (!redis.ok && redisConfigured) redisAttempts += 1
        postgres = nextPostgres
        redis = nextRedis
      }
    }
  } else {
    recoveryActions.push({
      action: 'docker-compose-up-postgres-redis',
      attempted: false,
      result: postgres.ok && redis.ok ? 'not-needed' : 'not-applicable',
    })
  }

  const portEntries: Array<{ port: number; available: boolean }> = []
  for (const port of REQUIRED_PLAYWRIGHT_PORTS) portEntries.push(await probePort(port))
  const interpolationComplete = await composeConfigured(repositoryRoot)

  const postgresMatches = postgres.ok
    && postgres.currentDatabase === expectedDatabase
    && isDedicatedTestDatabase(expectedDatabase)
  const redisPasses = redis.ok && redis.pong
  const portsPass = portEntries.every(entry => entry.available)
  const composePasses = interpolationComplete
    && paginationCursorKeysPresent
    && paginationCursorActiveKidPresent
  const recoveryAttempted = recoveryActions.some(action => action.attempted)

  const blockers: string[] = []
  if (!integrationEnabled) blockers.push('RUN_INTEGRATION_REQUIRED')
  if (!databaseConfigured) blockers.push('DATABASE_URL_REQUIRED')
  else if (!isDedicatedTestDatabase(expectedDatabase)) blockers.push('DEDICATED_TEST_DATABASE_REQUIRED')
  else if (!postgres.ok) blockers.push(recoveryAttempted ? 'POSTGRES_UNAVAILABLE_AFTER_RECOVERY' : 'POSTGRES_UNAVAILABLE')
  else if (postgres.currentDatabase !== expectedDatabase) blockers.push('POSTGRES_DATABASE_MISMATCH')
  if (!redisConfigured) blockers.push('REDIS_URL_REQUIRED')
  else if (!redisPasses) blockers.push(recoveryAttempted ? 'REDIS_UNAVAILABLE_AFTER_RECOVERY' : 'REDIS_UNAVAILABLE')
  if (!bootstrapPresent) blockers.push('WORKMESH_BOOTSTRAP_TOKEN_REQUIRED')
  if (!portsPass) blockers.push('PLAYWRIGHT_PORTS_UNAVAILABLE')
  if (!paginationCursorKeysPresent) blockers.push('PAGINATION_CURSOR_KEYS_REQUIRED')
  if (!paginationCursorActiveKidPresent) blockers.push('PAGINATION_CURSOR_ACTIVE_KID_REQUIRED')
  if (!interpolationComplete) blockers.push('DOCKER_COMPOSE_INTERPOLATION_INCOMPLETE')

  return {
    schemaVersion: PREFLIGHT_SCHEMA_VERSION,
    kind: 'workmesh.web-ui-final-preflight',
    generatedAt: now.toISOString(),
    repositoryRoot,
    status: blockers.length === 0 ? 'pass' : 'blocked',
    recovery: {
      exhausted: recoveryAttempted && blockers.some(blocker => blocker.endsWith('_AFTER_RECOVERY')),
      actions: recoveryActions,
    },
    checks: {
      integrationMode: { status: integrationEnabled ? 'pass' : 'blocked', enabled: integrationEnabled },
      postgres: {
        status: postgresMatches ? 'pass' : 'blocked',
        configured: databaseConfigured,
        expectedDatabase,
        actualDatabase: postgres.currentDatabase,
        dedicatedTestDatabase: isDedicatedTestDatabase(expectedDatabase),
        attempts: postgresAttempts,
      },
      redis: {
        status: redisPasses ? 'pass' : 'blocked',
        configured: redisConfigured,
        pong: redis.pong,
        attempts: redisAttempts,
      },
      bootstrapToken: { status: bootstrapPresent ? 'pass' : 'blocked', present: bootstrapPresent },
      ports: { status: portsPass ? 'pass' : 'blocked', entries: portEntries },
      compose: {
        status: composePasses ? 'pass' : 'blocked',
        file: path.join(repositoryRoot, 'docker-compose.yml'),
        interpolationComplete,
        paginationCursorKeysPresent,
        paginationCursorActiveKidPresent,
      },
    },
    blockers,
  }
}

const isDirectExecution = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false

if (isDirectExecution) {
  const args = parsePreflightArguments(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
  } else {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const output = path.resolve(args.output as string)
    const result = await runWebUiFinalPreflight(repositoryRoot)
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    process.stdout.write(`Web UI final preflight ${result.status}; result written to ${output}\n`)
    if (result.status !== 'pass') process.exitCode = 1
  }
}
