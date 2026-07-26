import crypto from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, parse } from 'node:path'
import argon2 from 'argon2'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import { defaultStates } from '@workmesh/domain'
export * from './schema.js'

export type Db = Pool
export type PasswordInput = { password: string }
export const createDb = (connectionString = process.env.DATABASE_URL): Db => new Pool({ connectionString })
export const withTx = async <T>(db: Db, fn: (tx: PoolClient) => Promise<T>): Promise<T> => {
  const tx = await db.connect()
  try {
    await tx.query('BEGIN')
    const result = await fn(tx)
    await tx.query('COMMIT')
    return result
  } catch (error) {
    await tx.query('ROLLBACK')
    throw error
  } finally {
    tx.release()
  }
}
export const assertPasswordPolicy = ({ password }: PasswordInput): void => {
  if (password.length < 12) throw new Error('PASSWORD_TOO_SHORT')
}
export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id })
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password)
export const opaqueToken = () => crypto.randomBytes(32).toString('base64url')
export const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

const migrationFilePattern = /^(\d+)_.*\.sql$/
export const applyMigrations = async (db: Db): Promise<void> => {
  const client = await db.connect()
  let locked = false
  try {
    await client.query('SELECT pg_advisory_lock(70472653)')
    locked = true
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const migrationsDirectory = join(import.meta.dirname, '../migrations')
    const migrations = (await readdir(migrationsDirectory))
      .filter(file => migrationFilePattern.test(file))
      .sort((left, right) => {
        const leftNumber = Number(migrationFilePattern.exec(left)?.[1])
        const rightNumber = Number(migrationFilePattern.exec(right)?.[1])
        return leftNumber - rightNumber || left.localeCompare(right)
      })
    const applied = await client.query<{ version: string }>('SELECT version FROM schema_migrations')
    const appliedVersions = new Set(applied.rows.map(row => row.version))
    for (const file of migrations) {
      const version = parse(file).name
      if (appliedVersions.has(version)) continue
      await client.query(await readFile(join(migrationsDirectory, file), 'utf8'))
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version])
    }
  } catch (error) {
    // A migration file owns its transaction. Roll it back before releasing the
    // session advisory lock so a cleanup error cannot hide the SQL failure.
    try {
      await client.query('ROLLBACK')
    } catch {
      // There may be no open transaction; preserve the migration error.
    }
    throw error
  } finally {
    if (locked) {
      try {
        await client.query('SELECT pg_advisory_unlock(70472653)')
      } catch {
        // The original migration failure, if any, is the actionable error.
      }
    }
    client.release()
  }
}

export async function installWorkspace(db: Db, input: { workspaceName: string; workspaceSlug: string; adminName: string; email: string; password: string }): Promise<{ workspaceId: string; actorId: string; teamId: string }> {
  assertPasswordPolicy(input)
  const passwordHash = await hashPassword(input.password)
  return withTx(db, async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(70472654)')
    const existing = await tx.query('SELECT singleton FROM platform_installation LIMIT 1 FOR UPDATE')
    if (existing.rowCount) throw new Error('INSTALLATION_ALREADY_COMPLETED')
    const workspace = await tx.query<{ id: string }>('INSERT INTO workspaces(name,slug) VALUES($1,$2) RETURNING id', [input.workspaceName, input.workspaceSlug])
    const workspaceId = workspace.rows[0]!.id
    const systemActor = await tx.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','WorkMesh System') RETURNING id", [workspaceId])
    const actor = await tx.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','admin',$2,$3,$4) RETURNING id", [workspaceId, input.email, input.adminName, passwordHash])
    const team = await tx.query<{ id: string }>("INSERT INTO teams(workspace_id,name,key) VALUES($1,'General','GEN') RETURNING id", [workspaceId])
    await tx.query('INSERT INTO platform_installation(singleton,workspace_id,system_actor_id) VALUES(true,$1,$2)', [workspaceId, systemActor.rows[0]!.id])
    await tx.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'admin')", [workspaceId, team.rows[0]!.id, actor.rows[0]!.id])
    for (const state of defaultStates) {
      await tx.query('INSERT INTO workflow_states(workspace_id,team_id,name,category,color,position) VALUES($1,$2,$3,$4,$5,$6)', [workspaceId, team.rows[0]!.id, state.name, state.category, state.color, state.position])
    }
    await appendEvent(tx, {
      workspaceId,
      teamId: team.rows[0]!.id,
      actorId: systemActor.rows[0]!.id,
      correlationId: 'bootstrap',
      type: 'workspace.installed',
      aggregateType: 'workspace',
      aggregateId: workspaceId,
      revision: 1,
      payload: { teamId: team.rows[0]!.id, adminActorId: actor.rows[0]!.id },
    })
    return { workspaceId, actorId: actor.rows[0]!.id, teamId: team.rows[0]!.id }
  })
}

export async function createAdmin(db: Db, input: { email: string; password: string; displayName: string }): Promise<{ actorId: string; workspaceId: string }> {
  assertPasswordPolicy(input)
  const passwordHash = await hashPassword(input.password)
  return withTx(db, async tx => {
    const installation = await tx.query<{ workspace_id: string; system_actor_id: string }>('SELECT workspace_id,system_actor_id FROM platform_installation WHERE singleton=true FOR UPDATE')
    if (!installation.rowCount) throw new Error('INSTALLATION_REQUIRED')
    const { workspace_id: workspaceId, system_actor_id: systemActorId } = installation.rows[0]!
    const actor = await tx.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','admin',$2,$3,$4) RETURNING id", [workspaceId, input.email, input.displayName, passwordHash])
    const actorId = actor.rows[0]!.id
    await tx.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) SELECT $1,id,$2,'admin' FROM teams WHERE workspace_id=$1 AND deleted_at IS NULL", [workspaceId, actorId])
    await appendEvent(tx, {
      workspaceId,
      actorId: systemActorId,
      correlationId: `create-admin:${actorId}`,
      type: 'workspace.admin_created',
      aggregateType: 'actor',
      aggregateId: actorId,
      revision: 1,
      audienceActorId: actorId,
      payload: { displayName: input.displayName },
    })
    return { actorId, workspaceId }
  })
}

export async function appendEvent(tx: PoolClient, input: { workspaceId: string; teamId?: string; audienceActorId?: string; actorId: string; correlationId: string; idempotencyKey?: string; type: string; aggregateType: string; aggregateId: string; revision?: number; payload?: Record<string, unknown> }): Promise<string> {
  const event = await tx.query<{ id: string }>('INSERT INTO domain_events(workspace_id,team_id,audience_actor_id,event_type,aggregate_type,aggregate_id,aggregate_revision,actor_id,correlation_id,idempotency_key,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id', [input.workspaceId, input.teamId ?? null, input.audienceActorId ?? null, input.type, input.aggregateType, input.aggregateId, input.revision ?? null, input.actorId, input.correlationId, input.idempotencyKey ?? null, input.payload ?? {}])
  await tx.query('INSERT INTO outbox_events(domain_event_id,topic,partition_key) VALUES($1,$2,$3)', [event.rows[0]!.id, input.type, input.aggregateId])
  return event.rows[0]!.id
}
export const rows = <T extends QueryResultRow>(result: { rows: T[] }) => result.rows

export * from './stage4.js'
