import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Pool, PoolClient } from 'pg'
import {
  legacyMigrationManifest,
  legacyUpgradeBundleManifest,
  type MigrationManifestEntry,
  v1MigrationManifest,
} from './migration-manifest.js'

export type MigrationFailurePhase = 'before_sql' | 'after_sql' | 'after_registration' | 'after_commit'
export type MigrationFailureInjector = (
  phase: MigrationFailurePhase,
  migration: Readonly<{ version: string; executionMode: 'applied' | 'adopted' }>,
) => void | Promise<void>

export type ApplyMigrationsOptions = Readonly<{
  /** Builds an immutable pre-v1 fixture for migration integration tests. */
  through?: number
  /** Deterministic crash injection for migration integration tests. */
  failureInjector?: MigrationFailureInjector
}>

type LedgerRow = Readonly<{
  version: string
  checksum_sha256: string | null
  execution_mode: 'applied' | 'adopted' | 'legacy' | null
}>

const migrationsDirectory = join(import.meta.dirname, '../migrations')
const advisoryLockId = 70472653
const checksumPattern = /^[0-9a-f]{64}$/
const transactionControlPattern = /^\s*(?:BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION)\s*;\s*$/i

const fail = (code: string, message: string): never => {
  throw new Error(`${code}: ${message}`)
}

const canonicalize = (source: string): string => source.replace(/\r\n?/g, '\n')
const checksum = (source: string): string => createHash('sha256').update(canonicalize(source)).digest('hex')
const stripLegacyTransactionControl = (source: string): string => canonicalize(source)
  .split('\n')
  .filter(line => !transactionControlPattern.test(line))
  .join('\n')
  .trim()

const atomicLegacySource = (entry: MigrationManifestEntry, source: string): string => {
  const withoutTransactions = stripLegacyTransactionControl(source)
  if (entry.file !== '0019_stage4_gitea.sql') return withoutTransactions
  return withoutTransactions.replace(
    "ALTER TYPE provider_kind ADD VALUE IF NOT EXISTS 'gitea';",
    [
      'ALTER TABLE provider_connections DROP CONSTRAINT IF EXISTS provider_connections_check;',
      'ALTER TABLE provider_connections DROP CONSTRAINT IF EXISTS provider_connections_github_credentials_check;',
      'ALTER TABLE provider_connections ALTER COLUMN provider TYPE text USING provider::text;',
      'DROP TYPE provider_kind;',
      "CREATE TYPE provider_kind AS ENUM ('fake','github','gitea');",
      'ALTER TABLE provider_connections ALTER COLUMN provider TYPE provider_kind USING provider::provider_kind;',
      "ALTER TABLE provider_connections ADD CONSTRAINT provider_connections_check CHECK(provider<>'github' OR credentials_ciphertext IS NOT NULL);",
      "ALTER TABLE provider_connections ADD CONSTRAINT provider_connections_github_credentials_check CHECK(provider<>'github' OR credentials_ciphertext IS NOT NULL);",
    ].join('\n'),
  )
}

const assertRunnerOwnedTransaction = (version: string, source: string): void => {
  const transactionLine = canonicalize(source).split('\n').find(line => transactionControlPattern.test(line))
  if (transactionLine !== undefined) {
    fail('MIGRATION_INTERNAL_TRANSACTION_CONTROL', `${version} contains ${transactionLine.trim()}`)
  }
}

const loadManifestEntry = async (entry: MigrationManifestEntry): Promise<string> => {
  const source = canonicalize(await readFile(join(migrationsDirectory, entry.file), 'utf8'))
  const actual = checksum(source)
  if (!checksumPattern.test(entry.checksumSha256) || actual !== entry.checksumSha256) {
    fail(
      'MIGRATION_SOURCE_CHECKSUM_MISMATCH',
      `${entry.version} expected ${entry.checksumSha256} but found ${actual}`,
    )
  }
  return source
}

const runTransaction = async <T>(client: PoolClient, work: () => Promise<T>): Promise<T> => {
  await client.query('BEGIN')
  try {
    const result = await work()
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Preserve the migration error; a disconnected client is discarded by pg.
    }
    throw error
  }
}

const ensureLedgerShape = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      checksum_sha256 text,
      applied_at timestamptz NOT NULL DEFAULT now(),
      execution_mode text
    )
  `)
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum_sha256 text')
  await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS execution_mode text')
}

const finalizeLedgerConstraints = async (client: PoolClient): Promise<void> => {
  await client.query('ALTER TABLE schema_migrations ALTER COLUMN checksum_sha256 SET NOT NULL')
  await client.query('ALTER TABLE schema_migrations ALTER COLUMN execution_mode SET NOT NULL')
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'schema_migrations'::regclass
          AND conname = 'schema_migrations_checksum_sha256_check'
      ) THEN
        ALTER TABLE schema_migrations
          ADD CONSTRAINT schema_migrations_checksum_sha256_check
          CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$');
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'schema_migrations'::regclass
          AND conname = 'schema_migrations_execution_mode_check'
      ) THEN
        ALTER TABLE schema_migrations
          ADD CONSTRAINT schema_migrations_execution_mode_check
          CHECK (execution_mode IN ('applied','adopted','legacy'));
      END IF;
    END
    $$
  `)
}

const readLedger = async (client: PoolClient): Promise<readonly LedgerRow[]> => (
  await client.query<LedgerRow>(
    'SELECT version,checksum_sha256,execution_mode FROM schema_migrations ORDER BY version',
  )
).rows

const assertAppliedV1Rows = (rows: readonly LedgerRow[]): void => {
  const expectedByVersion = new Map<string, MigrationManifestEntry>(
    v1MigrationManifest.map(entry => [entry.version, entry]),
  )
  const applied = rows.filter(row => expectedByVersion.has(row.version))
  for (const [index, row] of applied.entries()) {
    const expected = v1MigrationManifest[index]
    if (expected === undefined) throw new Error('MIGRATION_MANIFEST_EMPTY: missing applied v1 entry')
    if (row.version !== expected.version) {
      fail('MIGRATION_APPLIED_ORDER_INVALID', `unexpected v1 migration ${row.version}`)
    }
    if (row.checksum_sha256 !== expected.checksumSha256) {
      fail(
        'MIGRATION_APPLIED_CHECKSUM_MISMATCH',
        `${row.version} recorded ${row.checksum_sha256 ?? 'null'} but expected ${expected.checksumSha256}`,
      )
    }
    if (row.execution_mode !== 'applied' && row.execution_mode !== 'adopted') {
      fail('MIGRATION_EXECUTION_MODE_INVALID', `${row.version} recorded ${row.execution_mode ?? 'null'}`)
    }
  }
}

const legacyPrefixLength = (rows: readonly LedgerRow[]): number => {
  const legacyByVersion = new Map<string, MigrationManifestEntry>(
    legacyMigrationManifest.map(entry => [entry.version, entry]),
  )
  const legacyRows = rows.filter(row => legacyByVersion.has(row.version))
  for (const [index, row] of legacyRows.entries()) {
    const expected = legacyMigrationManifest[index]
    if (expected === undefined) throw new Error('MIGRATION_MANIFEST_EMPTY: missing legacy entry')
    if (row.version !== expected.version) {
      fail('MIGRATION_LEGACY_LEDGER_NOT_CONTIGUOUS', `unexpected legacy migration ${row.version}`)
    }
    if (row.checksum_sha256 !== null && row.checksum_sha256 !== expected.checksumSha256) {
      fail(
        'MIGRATION_APPLIED_CHECKSUM_MISMATCH',
        `${row.version} recorded ${row.checksum_sha256} but expected ${expected.checksumSha256}`,
      )
    }
  }
  return legacyRows.length
}

const assertKnownRows = (rows: readonly LedgerRow[]): void => {
  const known = new Set<string>([
    ...legacyMigrationManifest.map(entry => entry.version),
    ...v1MigrationManifest.map(entry => entry.version),
  ])
  const unknown = rows.find(row => !known.has(row.version))
  if (unknown !== undefined) fail('MIGRATION_UNKNOWN_APPLIED_VERSION', unknown.version)
}

const applyV1Entry = async (
  client: PoolClient,
  entry: MigrationManifestEntry,
  source: string,
  executionMode: 'applied' | 'adopted',
  failureInjector?: MigrationFailureInjector,
): Promise<void> => {
  assertRunnerOwnedTransaction(entry.version, source)
  const context = { version: entry.version, executionMode } as const
  await failureInjector?.('before_sql', context)
  if (executionMode === 'applied') await client.query(source)
  await failureInjector?.('after_sql', context)
  await client.query(
    'INSERT INTO schema_migrations(version,checksum_sha256,execution_mode) VALUES($1,$2,$3)',
    [entry.version, entry.checksumSha256, executionMode],
  )
  await failureInjector?.('after_registration', context)
}

const adoptLegacyDatabase = async (
  client: PoolClient,
  rows: readonly LedgerRow[],
  failureInjector?: MigrationFailureInjector,
): Promise<void> => {
  const prefixLength = legacyPrefixLength(rows)
  if (prefixLength === 0) fail('MIGRATION_LEGACY_LEDGER_EMPTY', 'legacy adoption requires an applied prefix')
  const endpoint = legacyMigrationManifest[prefixLength - 1]
  if (endpoint === undefined) throw new Error('MIGRATION_LEGACY_LEDGER_NOT_CONTIGUOUS: legacy endpoint is missing')

  const officialBundle = legacyUpgradeBundleManifest.find(bundle => bundle.fromVersion === endpoint.version)
  let upgradeSql = ''
  if (prefixLength < legacyMigrationManifest.length) {
    const selectedBundle = officialBundle ?? fail('MIGRATION_LEGACY_ENDPOINT_UNSUPPORTED', endpoint.version)
    const bundleEntry: MigrationManifestEntry = {
      version: `upgrade:${selectedBundle.fromVersion}`,
      file: selectedBundle.file,
      checksumSha256: selectedBundle.checksumSha256,
    }
    upgradeSql = await loadManifestEntry(bundleEntry)
    assertRunnerOwnedTransaction(`upgrade:${endpoint.version}`, upgradeSql)
  }

  const baseline = v1MigrationManifest[0]
  if (baseline === undefined) fail('MIGRATION_MANIFEST_EMPTY', 'v1 baseline is missing')
  const context = { version: baseline.version, executionMode: 'adopted' } as const
  await failureInjector?.('before_sql', context)
  if (upgradeSql.length > 0) await client.query(upgradeSql)
  await failureInjector?.('after_sql', context)

  for (const entry of legacyMigrationManifest) {
    await client.query(
      `INSERT INTO schema_migrations(version,checksum_sha256,execution_mode)
       VALUES($1,$2,'legacy')
       ON CONFLICT(version) DO UPDATE
       SET checksum_sha256=EXCLUDED.checksum_sha256,execution_mode=EXCLUDED.execution_mode`,
      [entry.version, entry.checksumSha256],
    )
  }
  await client.query(
    'INSERT INTO schema_migrations(version,checksum_sha256,execution_mode) VALUES($1,$2,$3)',
    [baseline.version, baseline.checksumSha256, 'adopted'],
  )
  await failureInjector?.('after_registration', context)
}

const applyLegacyFixture = async (client: PoolClient, through: number): Promise<void> => {
  const selected = legacyMigrationManifest.filter(entry => Number(entry.version.slice(0, 4)) <= through)
  if (selected.length === 0) fail('MIGRATION_LEGACY_FIXTURE_INVALID', `through=${through}`)
  await client.query('SELECT pg_advisory_lock($1)', [advisoryLockId])
  try {
    for (const entry of selected) {
      const source = atomicLegacySource(entry, await loadManifestEntry(entry))
      await runTransaction(client, async () => {
        await client.query(`
          CREATE TABLE IF NOT EXISTS schema_migrations(
            version text PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
          )
        `)
        const exists = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [entry.version])
        if (exists.rowCount !== 0) return
        await client.query(source)
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [entry.version])
      })
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [advisoryLockId])
  }
}

export const applyMigrations = async (db: Pool, options: ApplyMigrationsOptions = {}): Promise<void> => {
  const client = await db.connect()
  try {
    if (options.through !== undefined) {
      await applyLegacyFixture(client, options.through)
      return
    }

    for (const entry of legacyMigrationManifest) await loadManifestEntry(entry)
    const v1Sources = new Map<string, string>()
    for (const entry of v1MigrationManifest) v1Sources.set(entry.version, await loadManifestEntry(entry))

    await client.query('SELECT pg_advisory_lock($1)', [advisoryLockId])
    try {
      let committedContext: Readonly<{ version: string; executionMode: 'applied' | 'adopted' }> | undefined
      await runTransaction(client, async () => {
        await ensureLedgerShape(client)
        const rows = await readLedger(client)
        assertKnownRows(rows)
        const legacyCount = legacyPrefixLength(rows)
        const v1Rows = rows.filter(row => v1MigrationManifest.some(entry => entry.version === row.version))

        if (legacyCount > 0 && v1Rows.length === 0) {
          await adoptLegacyDatabase(client, rows, options.failureInjector)
          committedContext = { version: v1MigrationManifest[0]!.version, executionMode: 'adopted' }
        } else if (rows.length === 0) {
          const baseline = v1MigrationManifest[0]
          if (baseline === undefined) fail('MIGRATION_MANIFEST_EMPTY', 'v1 baseline is missing')
          await applyV1Entry(client, baseline, v1Sources.get(baseline.version)!, 'applied', options.failureInjector)
          committedContext = { version: baseline.version, executionMode: 'applied' }
        } else {
          assertAppliedV1Rows(rows)
          for (const row of rows.filter(row => row.execution_mode === 'legacy')) {
            const entry = legacyMigrationManifest.find(candidate => candidate.version === row.version)
            if (entry === undefined || row.checksum_sha256 !== entry.checksumSha256) {
              fail('MIGRATION_APPLIED_CHECKSUM_MISMATCH', row.version)
            }
          }
        }
        await finalizeLedgerConstraints(client)
      })
      if (committedContext !== undefined) await options.failureInjector?.('after_commit', committedContext)

      const appliedRows = await readLedger(client)
      for (const entry of v1MigrationManifest) {
        if (appliedRows.some(row => row.version === entry.version)) continue
        await runTransaction(client, async () => {
          await applyV1Entry(client, entry, v1Sources.get(entry.version)!, 'applied', options.failureInjector)
        })
        await options.failureInjector?.('after_commit', { version: entry.version, executionMode: 'applied' })
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [advisoryLockId])
    }
  } finally {
    client.release()
  }
}

export const migrationTestSupport = {
  assertRunnerOwnedTransaction,
  checksum,
  runTransaction,
} as const
