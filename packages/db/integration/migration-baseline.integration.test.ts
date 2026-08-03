import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '../src/index.js'
import { legacyMigrationManifest, supportedLegacyUpgradeEndpoints } from '../src/migration-manifest.js'
import { migrationTestSupport } from '../src/migrations.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) {
  throw new Error('Migration baseline integration tests require RUN_INTEGRATION=1 and DATABASE_URL.')
}
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Migration baseline integration tests require a dedicated test database.')
}

const db = createDb(databaseUrl)
type SchemaInventory = Readonly<{
  tables: readonly string[]
  columns: readonly string[]
  constraints: readonly string[]
  indexes: readonly string[]
  enums: readonly string[]
}>
let cleanSchemaInventory: SchemaInventory | undefined

const recreatePublicSchema = async (): Promise<void> => {
  await db.query('DROP SCHEMA public CASCADE')
  await db.query('CREATE SCHEMA public')
}

const readSchemaInventory = async (): Promise<SchemaInventory> => (
  await db.query<SchemaInventory>(`
    SELECT
      ARRAY(
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r'
        ORDER BY c.relname
      ) AS tables,
      ARRAY(
        SELECT concat_ws('|',table_name,ordinal_position::text,column_name,data_type,udt_name,is_nullable,coalesce(column_default,''))
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name<>'schema_migrations'
        ORDER BY table_name,ordinal_position
      ) AS columns,
      ARRAY(
        SELECT concat_ws('|',con.conrelid::regclass::text,con.conname,con.contype::text,pg_get_constraintdef(con.oid,true))
        FROM pg_constraint con
        JOIN pg_namespace n ON n.oid=con.connamespace
        WHERE n.nspname='public'
        ORDER BY con.conrelid::regclass::text,con.conname
      ) AS constraints,
      ARRAY(
        SELECT concat_ws('|',tablename,indexname,indexdef)
        FROM pg_indexes
        WHERE schemaname='public'
        ORDER BY tablename,indexname
      ) AS indexes,
      ARRAY(
        SELECT concat_ws('|',t.typname,e.enumsortorder::text,e.enumlabel)
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid=t.oid
        JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname='public'
        ORDER BY t.typname,e.enumsortorder
      ) AS enums
  `)
).rows[0]!

const seedLegacyRows = async (): Promise<Readonly<{ workspaceId: string; actorId: string; itemId: string }>> => {
  const workspace = await db.query<{ id: string }>(
    "INSERT INTO workspaces(name,slug) VALUES('Legacy upgrade','legacy-upgrade') RETURNING id",
  )
  const workspaceId = workspace.rows[0]!.id
  const actor = await db.query<{ id: string }>(
    "INSERT INTO actors(workspace_id,kind,email,display_name,password_hash,workspace_role) VALUES($1,'human','legacy-upgrade@example.test','Legacy','hash','admin') RETURNING id",
    [workspaceId],
  )
  const team = await db.query<{ id: string }>(
    "INSERT INTO teams(workspace_id,name,key) VALUES($1,'Legacy','LEG') RETURNING id",
    [workspaceId],
  )
  await db.query(
    "INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'admin')",
    [workspaceId, team.rows[0]!.id, actor.rows[0]!.id],
  )
  const state = await db.query<{ id: string }>(
    "INSERT INTO workflow_states(workspace_id,team_id,name,category) VALUES($1,$2,'Todo','backlog') RETURNING id",
    [workspaceId, team.rows[0]!.id],
  )
  const item = await db.query<{ id: string }>(
    "INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) VALUES($1,$2,1,'Legacy row',$3,$4) RETURNING id",
    [workspaceId, team.rows[0]!.id, state.rows[0]!.id, actor.rows[0]!.id],
  )
  return { workspaceId, actorId: actor.rows[0]!.id, itemId: item.rows[0]!.id }
}

const expectAdoptedLedger = async (): Promise<void> => {
  const ledger = await db.query<{
    version: string
    checksum_sha256: string
    execution_mode: string
  }>('SELECT version,checksum_sha256,execution_mode FROM schema_migrations ORDER BY version')
  expect(ledger.rows).toHaveLength(legacyMigrationManifest.length + 1)
  expect(ledger.rows.find(row => row.version === '0001_v1_baseline')).toMatchObject({ execution_mode: 'adopted' })
  expect(ledger.rows.filter(row => row.execution_mode === 'legacy')).toHaveLength(legacyMigrationManifest.length)
  expect(ledger.rows.every(row => row.checksum_sha256.length === 64)).toBe(true)
}

describe.sequential('atomic checksummed v1 migration baseline', () => {
  beforeEach(recreatePublicSchema, 120_000)

  afterAll(async () => {
    await db.end()
  })

  it('installs only the v1 baseline and is restart-idempotent', async () => {
    await applyMigrations(db)
    await applyMigrations(db)
    const ledger = await db.query<{
      version: string
      checksum_sha256: string
      execution_mode: string
    }>('SELECT version,checksum_sha256,execution_mode FROM schema_migrations')
    expect(ledger.rows).toHaveLength(1)
    expect(ledger.rows[0]).toMatchObject({ version: '0001_v1_baseline', execution_mode: 'applied' })
    expect(ledger.rows[0]!.checksum_sha256).toMatch(/^[0-9a-f]{64}$/)
    expect((await db.query("SELECT to_regclass('public.agent_sessions') AS relation")).rows[0]!.relation)
      .toBe('agent_sessions')
    cleanSchemaInventory = await readSchemaInventory()
  }, 120_000)

  for (const endpoint of supportedLegacyUpgradeEndpoints) {
    it(`atomically upgrades the supported ${endpoint.slice(0, 4)} legacy endpoint without data loss`, async () => {
      await applyMigrations(db, { through: Number(endpoint.slice(0, 4)) })
      const seeded = await seedLegacyRows()
      await applyMigrations(db)
      await expectAdoptedLedger()
      const preserved = await db.query<{
        workspace_id: string
        actor_id: string
      }>(
        `SELECT wi.workspace_id,wi.responsible_human_actor_id AS actor_id
         FROM work_items wi
         JOIN actors a ON a.id=wi.responsible_human_actor_id
         WHERE wi.id=$1`,
        [seeded.itemId],
      )
      expect(preserved.rows[0]).toEqual({ workspace_id: seeded.workspaceId, actor_id: seeded.actorId })
      expect(await readSchemaInventory()).toEqual(cleanSchemaInventory)
    }, 180_000)
  }

  it('adopts a database already at the final pre-v1 migration', async () => {
    await applyMigrations(db, { through: 35 })
    const seeded = await seedLegacyRows()
    await applyMigrations(db)
    await expectAdoptedLedger()
    expect((await db.query('SELECT count(*)::int AS count FROM work_items WHERE id=$1', [seeded.itemId])).rows[0]!.count)
      .toBe(1)
    expect(await readSchemaInventory()).toEqual(cleanSchemaInventory)
  }, 180_000)

  it('serializes two concurrent runners with one baseline registration', async () => {
    const first = createDb(databaseUrl)
    const second = createDb(databaseUrl)
    try {
      await Promise.all([applyMigrations(first), applyMigrations(second)])
      const ledger = await db.query('SELECT version FROM schema_migrations')
      expect(ledger.rows).toEqual([{ version: '0001_v1_baseline' }])
    } finally {
      await first.end()
      await second.end()
    }
  }, 120_000)

  it('rejects an applied checksum mismatch with an actionable error', async () => {
    await applyMigrations(db)
    await db.query("UPDATE schema_migrations SET checksum_sha256=repeat('0',64)")
    await expect(applyMigrations(db)).rejects.toThrow('MIGRATION_APPLIED_CHECKSUM_MISMATCH')
  }, 120_000)

  it('rejects an unsupported but contiguous legacy endpoint without changing it', async () => {
    await applyMigrations(db, { through: 3 })
    await expect(applyMigrations(db)).rejects.toThrow('MIGRATION_LEGACY_ENDPOINT_UNSUPPORTED')
    expect((await db.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0]!.count).toBe(3)
    expect((await db.query("SELECT to_regclass('public.agent_sessions') AS relation")).rows[0]!.relation).toBeNull()
  }, 120_000)

  it('rejects unknown and non-contiguous legacy ledgers before applying SQL', async () => {
    await db.query('CREATE TABLE schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())')
    await db.query("INSERT INTO schema_migrations(version) VALUES('9999_unknown')")
    await expect(applyMigrations(db)).rejects.toThrow('MIGRATION_UNKNOWN_APPLIED_VERSION')
    expect((await db.query("SELECT to_regclass('public.workspaces') AS relation")).rows[0]!.relation).toBeNull()

    await recreatePublicSchema()
    await applyMigrations(db, { through: 2 })
    await db.query("DELETE FROM schema_migrations WHERE version='0001_stage0'")
    await expect(applyMigrations(db)).rejects.toThrow('MIGRATION_LEGACY_LEDGER_NOT_CONTIGUOUS')
    expect((await db.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0]!.count).toBe(1)
  }, 120_000)

  it('rolls back a real SQL failure in the middle of a runner-owned transaction', async () => {
    const client = await db.connect()
    try {
      await expect(migrationTestSupport.runTransaction(client, async () => {
        await client.query('CREATE TABLE migration_mid_sql_probe(id integer PRIMARY KEY)')
        await client.query('INSERT INTO migration_mid_sql_probe(id) VALUES(1)')
        await client.query('INSERT INTO migration_missing_relation(id) VALUES(1)')
      })).rejects.toThrow()
    } finally {
      client.release()
    }
    expect((await db.query("SELECT to_regclass('public.migration_mid_sql_probe') AS relation")).rows[0]!.relation)
      .toBeNull()
  }, 120_000)

  it('rolls back a supported legacy upgrade crash and preserves its original ledger and rows', async () => {
    await applyMigrations(db, { through: 2 })
    const seeded = await seedLegacyRows()
    await expect(applyMigrations(db, {
      failureInjector: phase => {
        if (phase === 'after_sql') throw new Error('SIMULATED_LEGACY_AFTER_SQL')
      },
    })).rejects.toThrow('SIMULATED_LEGACY_AFTER_SQL')
    expect((await db.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0]!.count).toBe(2)
    expect((await db.query("SELECT to_regclass('public.agent_sessions') AS relation")).rows[0]!.relation).toBeNull()
    expect((await db.query('SELECT count(*)::int AS count FROM work_items WHERE id=$1', [seeded.itemId])).rows[0]!.count)
      .toBe(1)
    await applyMigrations(db)
    await expectAdoptedLedger()
  }, 180_000)

  for (const phase of ['before_sql', 'after_sql', 'after_registration'] as const) {
    it(`rolls back a simulated ${phase} crash and restarts safely`, async () => {
      await expect(applyMigrations(db, {
        failureInjector: current => {
          if (current === phase) throw new Error(`SIMULATED_${phase}`)
        },
      })).rejects.toThrow(`SIMULATED_${phase}`)
      expect((await db.query("SELECT to_regclass('public.workspaces') AS relation")).rows[0]!.relation).toBeNull()
      await applyMigrations(db)
      expect((await db.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0]!.count).toBe(1)
    }, 120_000)
  }

  it('treats an after-commit crash as complete and restarts without replay', async () => {
    await expect(applyMigrations(db, {
      failureInjector: phase => {
        if (phase === 'after_commit') throw new Error('SIMULATED_AFTER_COMMIT')
      },
    })).rejects.toThrow('SIMULATED_AFTER_COMMIT')
    await applyMigrations(db)
    expect((await db.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0]!.count).toBe(1)
  }, 120_000)
})
