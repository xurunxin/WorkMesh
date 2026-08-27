import crypto from 'node:crypto'
import argon2 from 'argon2'
import { Pool, types, type PoolClient, type QueryResultRow } from 'pg'
import { defaultStates } from '@workmesh/domain'
export * from './schema.js'
export * from './events.js'
export * from './event-resources.js'
export * from './agent-locks.js'
export * from './agent-concurrency.js'
export * from './agent-lock-order-manifest.js'
export * from './agent-lifecycle.js'
import { appendEvent } from './events.js'
export { applyMigrations } from './migrations.js'

// PostgreSQL DATE is a calendar value, not an instant. The pg default parser
// creates a local-midnight Date whose JSON form can move to the previous day.
types.setTypeParser(1082, value => value)

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

export async function installWorkspace(db: Db, input: { workspaceName: string; workspaceSlug: string; adminName: string; email: string; password: string }): Promise<{ workspaceId: string; actorId: string; teamId: string }> {
  assertPasswordPolicy(input)
  const passwordHash = await hashPassword(input.password)
  return withTx(db, tx => installWorkspaceInTx(tx, { ...input, passwordHash }))
}

export async function installWorkspaceInTx(tx: PoolClient, input: {
  workspaceName: string
  workspaceSlug: string
  adminName: string
  email: string
  passwordHash: string
  correlationId?: string
  idempotencyKey?: string
}): Promise<{ workspaceId: string; actorId: string; teamId: string }> {
  await tx.query('SELECT pg_advisory_xact_lock(70472654)')
  const existing = await tx.query('SELECT singleton FROM platform_installation LIMIT 1 FOR UPDATE')
  if (existing.rowCount) throw new Error('INSTALLATION_ALREADY_COMPLETED')
  const workspace = await tx.query<{ id: string }>('INSERT INTO workspaces(name,slug) VALUES($1,$2) RETURNING id', [input.workspaceName, input.workspaceSlug])
  const workspaceId = workspace.rows[0]!.id
  const systemActor = await tx.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','WorkMesh System') RETURNING id", [workspaceId])
  const actor = await tx.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','admin',$2,$3,$4) RETURNING id", [workspaceId, input.email, input.adminName, input.passwordHash])
  const autonomyPolicyTable = await tx.query<{ present: boolean }>(
    "SELECT to_regclass('public.approval_autonomy_policies') IS NOT NULL AS present",
  )
  if (autonomyPolicyTable.rows[0]?.present) {
    await tx.query(
      `INSERT INTO approval_autonomy_policies(workspace_id,mode,updated_by_actor_id)
       VALUES($1,'human_required',$2)`,
      [workspaceId, actor.rows[0]!.id],
    )
  }
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
    correlationId: input.correlationId ?? 'bootstrap',
    idempotencyKey: input.idempotencyKey,
    type: 'workspace.installed',
    aggregateType: 'workspace',
    aggregateId: workspaceId,
    revision: 1,
    payload: { teamId: team.rows[0]!.id, adminActorId: actor.rows[0]!.id },
  })
  return { workspaceId, actorId: actor.rows[0]!.id, teamId: team.rows[0]!.id }
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

export const rows = <T extends QueryResultRow>(result: { rows: T[] }) => result.rows

export * from './stage4.js'
