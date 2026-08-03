import { spawn } from 'node:child_process'
import { createDecipheriv, createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { Pool, type PoolClient } from 'pg'
import type { RecoveryCount, RecoveryLedgerEntry, RestoreObjectMapping } from './types.js'

const recoveryLockId = 70472654
const countTables = [
  'workspaces',
  'artifacts',
  'artifact_upload_intents',
  'event_archive_segments',
  'provider_connections',
  'agent_webhook_secrets',
  'domain_events',
] as const

export type RecoveryDatabase = Readonly<{
  pool: Pool
  client: PoolClient
  release: () => Promise<void>
}>

export const openRecoveryDatabase = async (databaseUrl: string): Promise<RecoveryDatabase> => {
  const pool = new Pool({ connectionString: databaseUrl, application_name: 'workmesh-recovery' })
  let client: PoolClient | undefined
  try {
    client = await pool.connect()
    const locked = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [recoveryLockId])
    if (!locked.rows[0]?.locked) throw new Error('RECOVERY_DATABASE_LOCKED')
  } catch (error) {
    client?.release()
    await pool.end().catch(() => undefined)
    throw error
  }
  return {
    pool,
    client,
    release: async () => {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [recoveryLockId])
      } finally {
        client.release()
        await pool.end()
      }
    },
  }
}

export const assertMaintenanceWindow = async (client: PoolClient): Promise<void> => {
  if (process.env.WORKMESH_MAINTENANCE_CONFIRMED !== '1') {
    throw new Error('RECOVERY_MAINTENANCE_CONFIRMATION_REQUIRED')
  }
  const others = await client.query<{ pid: number; state: string | null; applicationName: string }>(`
    SELECT pid,state,application_name AS "applicationName"
      FROM pg_stat_activity
     WHERE datname=current_database()
       AND backend_type='client backend'
       AND pid<>pg_backend_pid()
  `)
  if (others.rowCount !== 0) {
    const summary = others.rows.map(row => `${row.pid}:${row.applicationName || 'unknown'}:${row.state ?? 'unknown'}`).join(',')
    throw new Error(`RECOVERY_DATABASE_CLIENTS_ACTIVE:${summary}`)
  }
}

export const readSchemaLedger = async (client: PoolClient): Promise<readonly RecoveryLedgerEntry[]> => (
  await client.query<{
    version: string
    checksumSha256: string
    appliedAt: Date
    executionMode: string
  }>(`
    SELECT version,checksum_sha256 AS "checksumSha256",applied_at AS "appliedAt",
           execution_mode AS "executionMode"
      FROM schema_migrations
     ORDER BY version
  `)
).rows.map(row => ({ ...row, appliedAt: row.appliedAt.toISOString() }))

export const readDatabaseCounts = async (client: PoolClient): Promise<readonly RecoveryCount[]> => {
  const counts: RecoveryCount[] = []
  for (const table of countTables) {
    const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`)
    counts.push({ name: table, count: Number(result.rows[0]?.count ?? '0') })
  }
  return counts
}

const asBuffer = (value: Buffer | string): Buffer => Buffer.isBuffer(value) ? value : Buffer.from(value)

const decryptWebhook = (row: { ciphertext: Buffer; iv: Buffer; authTag: Buffer }, key: Buffer): void => {
  const decipher = createDecipheriv('aes-256-gcm', key, asBuffer(row.iv))
  decipher.setAuthTag(asBuffer(row.authTag))
  Buffer.concat([decipher.update(asBuffer(row.ciphertext)), decipher.final()])
}

export const verifyDatabaseSecrets = async (
  client: PoolClient,
  masterKeyText: string,
  masterKey: Buffer,
): Promise<Readonly<{ providerRows: number; webhookRows: number; webhookKeyVersions: readonly string[] }>> => {
  const providers = await client.query<{ count: string }>(`
    SELECT count(*)::text AS count
      FROM provider_connections
     WHERE length(pgp_sym_decrypt(webhook_secret_ciphertext,$1))>=0
       AND (credentials_ciphertext IS NULL OR length(pgp_sym_decrypt(credentials_ciphertext,$1))>=0)
  `, [masterKeyText])
  const webhooks = await client.query<{
    ciphertext: Buffer
    iv: Buffer
    authTag: Buffer
    keyVersion: string
  }>(`
    SELECT secret_ciphertext AS ciphertext,iv,auth_tag AS "authTag",key_version AS "keyVersion"
      FROM agent_webhook_secrets
     ORDER BY endpoint_id,version
  `)
  for (const row of webhooks.rows) decryptWebhook(row, masterKey)
  return {
    providerRows: Number(providers.rows[0]?.count ?? '0'),
    webhookRows: webhooks.rowCount ?? 0,
    webhookKeyVersions: [...new Set(webhooks.rows.map(row => row.keyVersion))].sort(),
  }
}

export const postgresServerVersion = async (client: PoolClient): Promise<string> => (
  await client.query<{ version: string }>('SHOW server_version')
).rows[0]?.version ?? 'unknown'

const toolDatabaseConnection = (databaseUrl: string): Readonly<{ databaseUrl: string; password?: string }> => {
  const url = new URL(databaseUrl)
  if (process.env.WORKMESH_POSTGRES_TOOL_CONTAINER) {
    url.hostname = process.env.WORKMESH_POSTGRES_TOOL_HOST ?? '127.0.0.1'
    url.port = process.env.WORKMESH_POSTGRES_TOOL_PORT ?? '5432'
  }
  const password = url.password ? decodeURIComponent(url.password) : undefined
  url.password = ''
  return { databaseUrl: url.toString(), password }
}

const runPostgresTool = async (
  command: string,
  args: readonly string[],
  options: Readonly<{ stdinPath?: string; stdoutPath?: string; password?: string }> = {},
): Promise<void> => new Promise((resolve, reject) => {
  const container = process.env.WORKMESH_POSTGRES_TOOL_CONTAINER
  const executable = container ? 'docker' : command
  const actualArgs = container
    ? ['exec', ...(options.stdinPath ? ['-i'] : []), ...(options.password ? ['--env', 'PGPASSWORD'] : []), container, command, ...args]
    : [...args]
  const child = spawn(executable, actualArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: options.password ? { ...process.env, PGPASSWORD: options.password } : process.env,
  })
  let stderr = ''
  const input = options.stdinPath ? createReadStream(options.stdinPath) : undefined
  const output = options.stdoutPath ? createWriteStream(options.stdoutPath, { flags: 'wx', mode: 0o600 }) : undefined
  if (input) input.pipe(child.stdin)
  else child.stdin.end()
  if (output) child.stdout.pipe(output)
  else child.stdout.resume()
  child.stderr.on('data', chunk => {
    if (stderr.length < 64_000) stderr += String(chunk)
  })
  let settled = false
  const fail = (error: Error, terminate = false): void => {
    if (settled) return
    settled = true
    if (terminate && child.exitCode === null && child.signalCode === null) child.kill()
    reject(error)
  }
  input?.once('error', error => fail(new Error(`RECOVERY_POSTGRES_TOOL_INPUT_FAILED:${error.message}`), true))
  output?.once('error', error => fail(new Error(`RECOVERY_POSTGRES_TOOL_OUTPUT_FAILED:${error.message}`), true))
  child.once('error', error => fail(new Error(`RECOVERY_POSTGRES_TOOL_START_FAILED:${command}:${error.message}`)))
  child.once('exit', (code, signal) => {
    if (settled) return
    if (code !== 0) {
      fail(new Error(`RECOVERY_POSTGRES_TOOL_FAILED:${command}:${code ?? signal ?? 'unknown'}:${stderr.trim()}`))
      return
    }
    const complete = (): void => {
      if (settled) return
      settled = true
      resolve()
    }
    if (output && !output.closed) output.once('close', complete)
    else complete()
  })
})

export const createCustomDump = async (databaseUrl: string, destination: string): Promise<void> => {
  const connection = toolDatabaseConnection(databaseUrl)
  await runPostgresTool(process.env.WORKMESH_PG_DUMP_BINARY ?? 'pg_dump', [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--serializable-deferrable',
    connection.databaseUrl,
  ], { stdoutPath: destination, password: connection.password })
  await runPostgresTool(process.env.WORKMESH_PG_RESTORE_BINARY ?? 'pg_restore', ['--list'], { stdinPath: destination })
}

export const assertEmptyTargetDatabase = async (client: PoolClient): Promise<void> => {
  const result = await client.query<{ count: string }>(`
    SELECT count(*)::text AS count
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
     WHERE namespace.nspname='public' AND relation.relkind IN ('r','p','v','m','S','f')
  `)
  if (Number(result.rows[0]?.count ?? '0') !== 0) throw new Error('RECOVERY_TARGET_DATABASE_NOT_EMPTY')
}

export const restoreCustomDump = async (databaseUrl: string, source: string): Promise<void> => {
  const connection = toolDatabaseConnection(databaseUrl)
  await runPostgresTool(process.env.WORKMESH_PG_RESTORE_BINARY ?? 'pg_restore', [
    '--dbname', connection.databaseUrl,
    '--exit-on-error',
    '--single-transaction',
    '--no-owner',
    '--no-privileges',
  ], { stdinPath: source, password: connection.password })
}

export const remapArchiveVersions = async (
  client: PoolClient,
  mappings: readonly RestoreObjectMapping[],
): Promise<number> => {
  const archived = await client.query<{ id: string; objectKey: string; objectVersionId: string }>(`
    SELECT id,object_key AS "objectKey",object_version_id AS "objectVersionId"
      FROM event_archive_segments
     WHERE object_version_id IS NOT NULL
     ORDER BY id
  `)
  await client.query('BEGIN')
  try {
    for (const segment of archived.rows) {
      const mapping = mappings.find(candidate => (
        candidate.sourceKey === segment.objectKey && candidate.sourceVersionId === segment.objectVersionId
      ))
        ?? mappings.find(candidate => (
          candidate.sourceKey === segment.objectKey && candidate.targetVersionId === segment.objectVersionId
        ))
      if (!mapping) throw new Error(`RECOVERY_ARCHIVE_VERSION_MAPPING_MISSING:${segment.id}`)
      if (mapping.targetVersionId === segment.objectVersionId) continue
      await client.query('UPDATE event_archive_segments SET object_version_id=$2 WHERE id=$1', [segment.id, mapping.targetVersionId])
    }
    await client.query('COMMIT')
    return archived.rowCount ?? 0
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

export const targetFingerprint = (databaseUrl: string, bucket: string): string => {
  const url = new URL(databaseUrl)
  url.username = ''
  url.password = ''
  return createHash('sha256').update(`${url.toString()}\u0000${bucket}`).digest('hex')
}
