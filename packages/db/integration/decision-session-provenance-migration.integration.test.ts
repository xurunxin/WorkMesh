import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, installWorkspace } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) {
  throw new Error('Decision provenance migration integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
}
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Decision provenance migration integration requires a dedicated *test* database.')
}

const db = createDb(databaseUrl)
const migrationPath = (file: string) => join(import.meta.dirname, '../migrations', file)

async function migrateFrom0001(through?: number): Promise<void> {
  await db.query('DROP SCHEMA public CASCADE')
  await db.query('CREATE SCHEMA public')
  await db.query(await readFile(migrationPath('0001_stage0.sql'), 'utf8'))
  await db.query('CREATE TABLE schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  await db.query("INSERT INTO schema_migrations(version) VALUES('0001_stage0')")
  await applyMigrations(db, { through })
}

async function decisionFixture(slug: string): Promise<{
  workspaceId: string
  actorId: string
  workItemId: string
  projectId: string
  sessionId: string
}> {
  const installed = await installWorkspace(db, {
    workspaceName: `Decision provenance ${slug}`,
    workspaceSlug: `decision-provenance-${slug}`,
    adminName: 'Decision Admin',
    email: `decision-${slug}@example.test`,
    password: 'password-acceptance',
  })
  const state = (await db.query<{ id: string }>(
    "SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog'",
    [installed.teamId],
  )).rows[0]!
  const project = (await db.query<{ id: string }>(
    "INSERT INTO projects(workspace_id,team_id,name) VALUES($1,$2,'Decision Project') RETURNING id",
    [installed.workspaceId, installed.teamId],
  )).rows[0]!
  const workItem = (await db.query<{ id: string }>(
    `INSERT INTO work_items(
       workspace_id,team_id,number,title,status_id,
       responsible_human_actor_id,project_id
     ) VALUES($1,$2,1,'Decision Work Item',$3,$4,$5)
     RETURNING id`,
    [installed.workspaceId, installed.teamId, state.id, installed.actorId, project.id],
  )).rows[0]!
  const agentActor = (await db.query<{ id: string }>(
    "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Decision Agent') RETURNING id",
    [installed.workspaceId],
  )).rows[0]!
  const agent = (await db.query<{ id: string }>(
    `INSERT INTO agent_definitions(
       workspace_id,actor_id,slug,display_name,supported_protocols
     ) VALUES($1,$2,$3,'Decision Agent',ARRAY['native_http']::agent_protocol[])
     RETURNING id`,
    [installed.workspaceId, agentActor.id, `decision-agent-${slug}`],
  )).rows[0]!
  const delegation = (await db.query<{ id: string }>(
    `INSERT INTO delegations(
       workspace_id,team_id,agent_id,agent_actor_id,
       principal_human_actor_id,work_item_id,role,scope_type,scope_id
     ) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6)
     RETURNING id`,
    [
      installed.workspaceId,
      installed.teamId,
      agent.id,
      agentActor.id,
      installed.actorId,
      workItem.id,
    ],
  )).rows[0]!
  const session = (await db.query<{ id: string }>(
    `INSERT INTO agent_sessions(
       workspace_id,team_id,agent_id,agent_actor_id,
       delegation_id,work_item_id,state
     ) VALUES($1,$2,$3,$4,$5,$6,'executing')
     RETURNING id`,
    [
      installed.workspaceId,
      installed.teamId,
      agent.id,
      agentActor.id,
      delegation.id,
      workItem.id,
    ],
  )).rows[0]!
  return {
    workspaceId: installed.workspaceId,
    actorId: installed.actorId,
    workItemId: workItem.id,
    projectId: project.id,
    sessionId: session.id,
  }
}

async function expectDecisionSubjectConstraint(fixture: Awaited<ReturnType<typeof decisionFixture>>): Promise<void> {
  const constraint = (await db.query<{ definition: string }>(
    `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
      WHERE conrelid='decisions'::regclass
        AND conname='decisions_subject_check'`,
  )).rows[0]
  expect(constraint?.definition).toContain('num_nonnulls(work_item_id, project_id) <= 1')
  expect(constraint?.definition).toContain('num_nonnulls(work_item_id, project_id, session_id) >= 1')
  expect((await db.query(
    `SELECT 1
       FROM pg_constraint
      WHERE conrelid='decisions'::regclass
        AND conname='decisions_check'`,
  )).rowCount).toBe(0)

  await expect(db.query(
    `INSERT INTO decisions(
       workspace_id,work_item_id,session_id,proposed_by_actor_id,title,rationale
     ) VALUES($1,$2,$3,$4,'Work Item provenance','Agent Session provenance')`,
    [fixture.workspaceId, fixture.workItemId, fixture.sessionId, fixture.actorId],
  )).resolves.toBeDefined()
  await expect(db.query(
    `INSERT INTO decisions(
       workspace_id,project_id,session_id,proposed_by_actor_id,title,rationale
     ) VALUES($1,$2,$3,$4,'Project provenance','Agent Session provenance')`,
    [fixture.workspaceId, fixture.projectId, fixture.sessionId, fixture.actorId],
  )).resolves.toBeDefined()
  await expect(db.query(
    `INSERT INTO decisions(
       workspace_id,session_id,proposed_by_actor_id,title,rationale
     ) VALUES($1,$2,$3,'Session subject','Session-only subject')`,
    [fixture.workspaceId, fixture.sessionId, fixture.actorId],
  )).resolves.toBeDefined()
  await expect(db.query(
    `INSERT INTO decisions(
       workspace_id,work_item_id,proposed_by_actor_id,title,rationale
     ) VALUES($1,$2,$3,'Human Work Item subject','Optional Session provenance')`,
    [fixture.workspaceId, fixture.workItemId, fixture.actorId],
  )).resolves.toBeDefined()
  await expect(db.query(
    `INSERT INTO decisions(
       workspace_id,proposed_by_actor_id,title,rationale
     ) VALUES($1,$2,'Missing subject','Must fail')`,
    [fixture.workspaceId, fixture.actorId],
  )).rejects.toThrow(/decisions_subject_check/)
  await expect(db.query(
    `INSERT INTO decisions(
       workspace_id,work_item_id,project_id,session_id,
       proposed_by_actor_id,title,rationale
     ) VALUES($1,$2,$3,$4,$5,'Multiple resource subjects','Must fail')`,
    [
      fixture.workspaceId,
      fixture.workItemId,
      fixture.projectId,
      fixture.sessionId,
      fixture.actorId,
    ],
  )).rejects.toThrow(/decisions_subject_check/)
}

describe('Decision Session provenance migration', () => {
  afterAll(async () => { await db.end() }, 300_000)

  it('upgrades the previous 0029 constraint without rewriting existing Decisions', async () => {
    await migrateFrom0001(29)
    const fixture = await decisionFixture('upgrade')
    await expect(db.query(
      `INSERT INTO decisions(
         workspace_id,work_item_id,session_id,proposed_by_actor_id,title,rationale
       ) VALUES($1,$2,$3,$4,'Pre-upgrade provenance','Old constraint rejects this')`,
      [fixture.workspaceId, fixture.workItemId, fixture.sessionId, fixture.actorId],
    )).rejects.toThrow(/decisions_check/)

    await applyMigrations(db)

    expect((await db.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
    )).rows[0]!.version).toBe('0030_decision_session_provenance')
    await expectDecisionSubjectConstraint(fixture)
  }, 300_000)

  it('installs the same Decision subject constraint on a clean database', async () => {
    await migrateFrom0001()
    const fixture = await decisionFixture('clean')

    expect((await db.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
    )).rows[0]!.version).toBe('0030_decision_session_provenance')
    await expectDecisionSubjectConstraint(fixture)
  }, 300_000)
})
