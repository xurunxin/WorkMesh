import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '../src/index.js'
import { legacyMigrationManifest, supportedLegacyUpgradeEndpoints, v1MigrationManifest } from '../src/migration-manifest.js'
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

const installDeployedV1Through0007 = async (through = '0007_active_milestone_name_uniqueness'): Promise<void> => {
  await db.query(`
    CREATE TABLE schema_migrations(
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      checksum_sha256 text NOT NULL CHECK(checksum_sha256 ~ '^[0-9a-f]{64}$'),
      execution_mode text NOT NULL CHECK(execution_mode IN ('applied','adopted','legacy'))
    )
  `)
  const client = await db.connect()
  try {
    for (const entry of v1MigrationManifest.filter(({ version }) => version <= through)) {
      const source = await readFile(join(import.meta.dirname, '../migrations', entry.file), 'utf8')
      await migrationTestSupport.runTransaction(client, async () => {
        await client.query(source)
        await client.query(
          'INSERT INTO schema_migrations(version,checksum_sha256,execution_mode) VALUES($1,$2,$3)',
          [entry.version, entry.checksumSha256, 'applied'],
        )
      })
    }
  } finally {
    client.release()
  }
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
  expect(ledger.rows).toHaveLength(legacyMigrationManifest.length + v1MigrationManifest.length)
  expect(ledger.rows.find(row => row.version === '0001_v1_baseline')).toMatchObject({ execution_mode: 'adopted' })
  expect(ledger.rows.find(row => row.version === '0002_active_executor_projection')).toMatchObject({ execution_mode: 'applied' })
  expect(ledger.rows.filter(row => row.execution_mode === 'legacy')).toHaveLength(legacyMigrationManifest.length)
  expect(ledger.rows.every(row => row.checksum_sha256.length === 64)).toBe(true)
}

describe.sequential('atomic checksummed v1 migration baseline', () => {
  beforeEach(recreatePublicSchema, 120_000)

  afterAll(async () => {
    await db.end()
  })

  it('installs the v1 baseline and ordered subsequent migrations restart-idempotently', async () => {
    await applyMigrations(db)
    await applyMigrations(db)
    const ledger = await db.query<{
      version: string
      checksum_sha256: string
      execution_mode: string
    }>('SELECT version,checksum_sha256,execution_mode FROM schema_migrations')
    expect(ledger.rows).toHaveLength(v1MigrationManifest.length)
    expect(ledger.rows.map(row => row.version).sort()).toEqual(v1MigrationManifest.map(entry => entry.version))
    expect(ledger.rows.find(row => row.version === '0001_v1_baseline')).toMatchObject({ execution_mode: 'applied' })
    expect(ledger.rows.every(row => /^[0-9a-f]{64}$/.test(row.checksum_sha256))).toBe(true)
    expect((await db.query("SELECT to_regclass('public.agent_sessions') AS relation")).rows[0]!.relation)
      .toBe('agent_sessions')
    cleanSchemaInventory = await readSchemaInventory()
  }, 120_000)

  it('upgrades an already-deployed v1 database through 0007 without baseline checksum drift', async () => {
    await installDeployedV1Through0007()
    await applyMigrations(db)
    expect((await db.query(
      "SELECT checksum_sha256,execution_mode FROM schema_migrations WHERE version='0001_v1_baseline'",
    )).rows[0]).toEqual({
      checksum_sha256: '1fc1297ef9b4600d56368c6734b318b41b48776de82d5d9fe307d09427ce3f83',
      execution_mode: 'applied',
    })
    expect((await db.query(
      "SELECT count(*)::int AS count FROM schema_migrations WHERE version='0008_autonomous_control_push_enrollment'",
    )).rows[0]!.count).toBe(1)
  }, 120_000)

  it('upgrades the immediately previous stage without replaying existing deliveries and rolls back a channel migration failure', async () => {
    const previous=v1MigrationManifest.find(entry=>entry.version==='0013_work_item_board_rank')!
    await installDeployedV1Through0007(previous.version)
    const seeded=await seedLegacyRows()
    const notification=(await db.query<{id:string}>(`INSERT INTO notifications(workspace_id,recipient_actor_id,priority,kind,title,body,source_type,source_id,dedupe_key) VALUES($1,$2,'update','migration','old notification','old body','work_item',$3,'c1-upgrade') RETURNING id`,[seeded.workspaceId,seeded.actorId,seeded.itemId])).rows[0]!
    const delivery=(await db.query<{id:string}>(`INSERT INTO notification_deliveries(notification_id,channel,status,effect_key) VALUES($1,'in_app','delivered','c1-upgrade-effect') RETURNING id`,[notification.id])).rows[0]!
    await expect(applyMigrations(db,{failureInjector:(phase,context)=>{if(context.version==='0014_channel_delivery_contract'&&phase==='after_sql')throw new Error('C1_MIGRATION_COMMIT_CRASH')}})).rejects.toThrow('C1_MIGRATION_COMMIT_CRASH')
    expect((await db.query(`SELECT to_regclass('public.notification_intents') AS relation`)).rows[0]!.relation).toBeNull()
    await applyMigrations(db);await applyMigrations(db)
    expect((await db.query('SELECT status,notification_id,intent_id,claim_fence,effect_key FROM notification_deliveries WHERE id=$1',[delivery.id])).rows[0]).toEqual({status:'delivered',notification_id:notification.id,intent_id:null,claim_fence:0,effect_key:'c1-upgrade-effect'})
    expect((await db.query('SELECT 1 FROM notification_intents')).rowCount).toBe(0)
    expect(await readSchemaInventory()).toEqual(cleanSchemaInventory)
  },180_000)

  it('upgrades channel kinds from the previous stage atomically, retaining uncertain attempts and legacy deliveries',async()=>{
    await installDeployedV1Through0007('0014_channel_delivery_contract')
    const seeded=await seedLegacyRows()
    const target=(await db.query<{id:string}>(`INSERT INTO notification_channel_targets(workspace_id,owner_actor_id,provider,name,secret_ciphertext,endpoint_fingerprint) VALUES($1,$2,'wecom','migration kind',decode('00','hex'),'hmac:'||repeat('a',64)) RETURNING id`,[seeded.workspaceId,seeded.actorId])).rows[0]!
    // Provenance must survive source-event retention; no event FK or new intent is needed.
    const intent=(await db.query<{id:string}>(`INSERT INTO notification_intents(workspace_id,source_event_id,source_cursor,source_type,source_id,source_revision,recipient_actor_id,intent_hash,target_snapshot) VALUES($1,gen_random_uuid(),1,'approval',gen_random_uuid(),1,$2,repeat('a',64),'[]') RETURNING id`,[seeded.workspaceId,seeded.actorId])).rows[0]!
    const delivery=(await db.query<{id:string}>(`INSERT INTO notification_deliveries(workspace_id,intent_id,channel_target_id,recipient_actor_id,target_revision,channel,effect_key,status,outcome,attempt_count,claim_fence) VALUES($1,$2,$3,$4,1,'webhook','c1-kind-upgrade','failed','uncertain',3,4) RETURNING id`,[seeded.workspaceId,intent.id,target.id,seeded.actorId])).rows[0]!
    await expect(applyMigrations(db,{failureInjector:(phase,context)=>{if(context.version==='0015_channel_notification_kind'&&phase==='after_sql')throw new Error('KIND_MIGRATION_CRASH')}})).rejects.toThrow('KIND_MIGRATION_CRASH')
    expect((await db.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_deliveries' AND column_name='notification_kind'`)).rowCount).toBe(0)
    await applyMigrations(db);await applyMigrations(db)
    expect((await db.query(`SELECT notification_kind,status,outcome,attempt_count,claim_fence,effect_key FROM notification_deliveries WHERE id=$1`,[delivery.id])).rows[0]).toEqual({notification_kind:'approval.requested',status:'failed',outcome:'uncertain',attempt_count:3,claim_fence:4,effect_key:'c1-kind-upgrade'})
    expect((await db.query('SELECT 1 FROM notification_intents')).rowCount).toBe(1)
    expect(await readSchemaInventory()).toEqual(cleanSchemaInventory)
  },180_000)

  it('normalizes pending quorum Approval kinds without replaying an uncertain attempt and rolls back on failure',async()=>{
    await installDeployedV1Through0007('0015_channel_notification_kind')
    const seeded=await seedLegacyRows()
    const target=(await db.query<{id:string}>(`INSERT INTO notification_channel_targets(workspace_id,owner_actor_id,provider,name,secret_ciphertext,endpoint_fingerprint) VALUES($1,$2,'wecom','quorum kind',decode('00','hex'),'hmac:'||repeat('a',64)) RETURNING id`,[seeded.workspaceId,seeded.actorId])).rows[0]!
    const intent=(await db.query<{id:string}>(`INSERT INTO notification_intents(workspace_id,source_event_id,source_cursor,source_type,source_id,source_revision,recipient_actor_id,intent_hash,target_snapshot) VALUES($1,gen_random_uuid(),1,'approval',gen_random_uuid(),1,$2,repeat('a',64),'[]') RETURNING id`,[seeded.workspaceId,seeded.actorId])).rows[0]!
    const delivery=(await db.query<{id:string}>(`INSERT INTO notification_deliveries(workspace_id,intent_id,channel_target_id,recipient_actor_id,target_revision,channel,effect_key,status,outcome,attempt_count,claim_fence,notification_kind) VALUES($1,$2,$3,$4,1,'webhook','c1-quorum-upgrade','failed','uncertain',3,4,'approval.decision.recorded') RETURNING id`,[seeded.workspaceId,intent.id,target.id,seeded.actorId])).rows[0]!
    await expect(applyMigrations(db,{failureInjector:(phase,context)=>{if(context.version==='0016_approval_notification_kind'&&phase==='after_sql')throw new Error('QUORUM_KIND_MIGRATION_CRASH')}})).rejects.toThrow('QUORUM_KIND_MIGRATION_CRASH')
    expect((await db.query('SELECT notification_kind FROM notification_deliveries WHERE id=$1',[delivery.id])).rows[0]!.notification_kind).toBe('approval.decision.recorded')
    await applyMigrations(db);await applyMigrations(db)
    expect((await db.query(`SELECT notification_kind,status,outcome,attempt_count,claim_fence,effect_key FROM notification_deliveries WHERE id=$1`,[delivery.id])).rows[0]).toEqual({notification_kind:'approval.requested',status:'failed',outcome:'uncertain',attempt_count:3,claim_fence:4,effect_key:'c1-quorum-upgrade'})
    expect((await db.query('SELECT 1 FROM notification_intents')).rowCount).toBe(1)
    expect(await readSchemaInventory()).toEqual(cleanSchemaInventory)
  },180_000)

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
      expect(ledger.rows).toEqual(v1MigrationManifest.map(entry => ({ version: entry.version })))
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
      expect((await db.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0]!.count).toBe(v1MigrationManifest.length)
    }, 180_000)
  }

  it('treats an after-commit crash as complete and restarts without replay', async () => {
    await expect(applyMigrations(db, {
      failureInjector: phase => {
        if (phase === 'after_commit') throw new Error('SIMULATED_AFTER_COMMIT')
      },
    })).rejects.toThrow('SIMULATED_AFTER_COMMIT')
    await applyMigrations(db)
    expect((await db.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0]!.count).toBe(v1MigrationManifest.length)
  }, 120_000)
})
