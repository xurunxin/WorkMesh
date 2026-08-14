import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) {
  throw new Error('Planning domain migration tests require RUN_INTEGRATION=1 and DATABASE_URL.')
}
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Planning domain migration tests require a dedicated test database.')
}

const db = createDb(databaseUrl)
let seedNumber = 0

const recreatePublicSchema = async (): Promise<void> => {
  await db.query('DROP SCHEMA public CASCADE')
  await db.query('CREATE SCHEMA public')
  await applyMigrations(db)
}

const seedPlanningScope = async () => {
  seedNumber += 1
  const workspace = await db.query<{ id: string }>(
    "INSERT INTO workspaces(name,slug) VALUES('Planning parity',$1) RETURNING id",
    [`planning-parity-${seedNumber}`],
  )
  const workspaceId = workspace.rows[0]!.id
  const teams = await db.query<{ id: string }>(
    "INSERT INTO teams(workspace_id,name,key) VALUES($1,'Alpha','ALP'),($1,'Beta','BET') RETURNING id",
    [workspaceId],
  )
  const states = await Promise.all(teams.rows.map((team, index) => db.query<{ id: string }>(
    "INSERT INTO workflow_states(workspace_id,team_id,name,category) VALUES($1,$2,$3,'backlog') RETURNING id",
    [workspaceId, team.id, `Todo ${index}`],
  )))
  const projects = await Promise.all(teams.rows.map((team, index) => db.query<{ id: string }>(
    'INSERT INTO projects(workspace_id,team_id,name) VALUES($1,$2,$3) RETURNING id',
    [workspaceId, team.id, `Project ${index}`],
  )))
  const otherProject = await db.query<{ id: string }>(
    "INSERT INTO projects(workspace_id,team_id,name) VALUES($1,$2,'Other Alpha') RETURNING id",
    [workspaceId, teams.rows[0]!.id],
  )

  let number = 0
  const createItem = async (teamIndex: number, projectId: string | null, title: string): Promise<string> => {
    number += 1
    const row = await db.query<{ id: string }>(
      `INSERT INTO work_items(workspace_id,team_id,number,title,status_id,project_id)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [workspaceId, teams.rows[teamIndex]!.id, number, title, states[teamIndex]!.rows[0]!.id, projectId],
    )
    return row.rows[0]!.id
  }

  return {
    workspaceId,
    alphaTeamId: teams.rows[0]!.id,
    betaTeamId: teams.rows[1]!.id,
    alphaProjectId: projects[0]!.rows[0]!.id,
    betaProjectId: projects[1]!.rows[0]!.id,
    otherAlphaProjectId: otherProject.rows[0]!.id,
    createItem,
  }
}

describe.sequential('planning domain parity migration', () => {
  beforeAll(recreatePublicSchema, 120_000)

  afterAll(async () => {
    await db.end()
  })

  it('enforces same-Team, same-Project acyclic work-item hierarchy', async () => {
    const scope = await seedPlanningScope()
    const parent = await scope.createItem(0, scope.alphaProjectId, 'Parent')
    const child = await scope.createItem(0, scope.alphaProjectId, 'Child')
    const otherProjectChild = await scope.createItem(0, scope.otherAlphaProjectId, 'Other project')
    const otherTeamChild = await scope.createItem(1, scope.betaProjectId, 'Other team')

    await db.query('UPDATE work_items SET parent_id=$1 WHERE id=$2', [parent, child])
    await expect(db.query('UPDATE work_items SET parent_id=id WHERE id=$1', [parent]))
      .rejects.toThrow('WORK_ITEM_PARENT_SELF')
    await expect(db.query('UPDATE work_items SET parent_id=$1 WHERE id=$2', [parent, otherProjectChild]))
      .rejects.toThrow('WORK_ITEM_PARENT_PROJECT_MISMATCH')
    await expect(db.query('UPDATE work_items SET parent_id=$1 WHERE id=$2', [parent, otherTeamChild]))
      .rejects.toThrow()
    await expect(db.query('UPDATE work_items SET parent_id=$1 WHERE id=$2', [child, parent]))
      .rejects.toThrow('WORK_ITEM_PARENT_CYCLE')
  })

  it('enforces canonical related links and acyclic directional blockers', async () => {
    const scope = await seedPlanningScope()
    const first = await scope.createItem(0, scope.alphaProjectId, 'First')
    const second = await scope.createItem(0, scope.alphaProjectId, 'Second')
    const third = await scope.createItem(0, scope.alphaProjectId, 'Third')
    const otherTeam = await scope.createItem(1, scope.betaProjectId, 'Other team')

    await db.query(
      `INSERT INTO work_item_relations(workspace_id,team_id,source_work_item_id,target_work_item_id,kind)
       VALUES($1,$2,$3,$4,'blocks'),($1,$2,$4,$5,'blocks')`,
      [scope.workspaceId, scope.alphaTeamId, first, second, third],
    )
    await expect(db.query(
      `INSERT INTO work_item_relations(workspace_id,team_id,source_work_item_id,target_work_item_id,kind)
       VALUES($1,$2,$3,$4,'blocks')`,
      [scope.workspaceId, scope.alphaTeamId, third, first],
    )).rejects.toThrow('WORK_ITEM_BLOCK_CYCLE')
    const [relatedSource, relatedTarget] = [first, second].sort()
    await db.query(
      `INSERT INTO work_item_relations(workspace_id,team_id,source_work_item_id,target_work_item_id,kind)
       VALUES($1,$2,$3,$4,'related')`,
      [scope.workspaceId, scope.alphaTeamId, relatedSource, relatedTarget],
    )
    await expect(db.query(
      `INSERT INTO work_item_relations(workspace_id,team_id,source_work_item_id,target_work_item_id,kind)
       VALUES($1,$2,$3,$4,'related')`,
      [scope.workspaceId, scope.alphaTeamId, relatedTarget, relatedSource],
    )).rejects.toThrow('WORK_ITEM_RELATED_ORDER')
    await expect(db.query(
      `INSERT INTO work_item_relations(workspace_id,team_id,source_work_item_id,target_work_item_id,kind)
       VALUES($1,$2,$3,$4,'blocks')`,
      [scope.workspaceId, scope.alphaTeamId, first, otherTeam],
    )).rejects.toThrow()
  })

  it('requires active links to be detached before a work item is soft-deleted', async () => {
    const scope = await seedPlanningScope()
    const parent = await scope.createItem(0, scope.alphaProjectId, 'Parent')
    const child = await scope.createItem(0, scope.alphaProjectId, 'Child')
    await db.query('UPDATE work_items SET parent_id=$1 WHERE id=$2', [parent, child])

    await expect(db.query('UPDATE work_items SET deleted_at=now() WHERE id=$1', [parent]))
      .rejects.toThrow('WORK_ITEM_HAS_ACTIVE_CHILDREN')
    await db.query('UPDATE work_items SET parent_id=NULL WHERE id=$1', [child])
    await db.query('UPDATE work_items SET deleted_at=now() WHERE id=$1', [parent])
    expect((await db.query<{ deleted: boolean }>('SELECT deleted_at IS NOT NULL AS deleted FROM work_items WHERE id=$1', [parent])).rows[0]!.deleted)
      .toBe(true)
  })

  it('rejects relations to deleted endpoints and protects active relation endpoints from deletion', async () => {
    const scope = await seedPlanningScope()
    const source = await scope.createItem(0, scope.alphaProjectId, 'Relation source')
    const target = await scope.createItem(0, scope.alphaProjectId, 'Relation target')
    const deletedTarget = await scope.createItem(0, scope.alphaProjectId, 'Already deleted target')
    await db.query('UPDATE work_items SET deleted_at=now() WHERE id=$1', [deletedTarget])

    await db.query(
      `INSERT INTO work_item_relations(workspace_id,team_id,source_work_item_id,target_work_item_id,kind)
       VALUES($1,$2,$3,$4,'blocks')`,
      [scope.workspaceId, scope.alphaTeamId, source, target],
    )
    await expect(db.query('UPDATE work_items SET deleted_at=now() WHERE id=$1', [target]))
      .rejects.toThrow('WORK_ITEM_HAS_ACTIVE_RELATIONS')
    await expect(db.query(
      `INSERT INTO work_item_relations(workspace_id,team_id,source_work_item_id,target_work_item_id,kind)
       VALUES($1,$2,$3,$4,'blocks')`,
      [scope.workspaceId, scope.alphaTeamId, source, deletedTarget],
    )).rejects.toThrow('WORK_ITEM_RELATION_ENDPOINT_DELETED')
  })

  it('requires active milestone links to be detached before either side is soft-deleted', async () => {
    const scope = await seedPlanningScope()
    const milestone = await db.query<{ id: string }>(
      `INSERT INTO project_milestones(workspace_id,project_id,name)
       VALUES($1,$2,'Active milestone') RETURNING id`,
      [scope.workspaceId, scope.alphaProjectId],
    )
    const item = await scope.createItem(0, scope.alphaProjectId, 'Milestone issue')
    const otherProjectItem = await scope.createItem(0, scope.otherAlphaProjectId, 'Other project issue')
    await expect(db.query('UPDATE work_items SET milestone_id=$1 WHERE id=$2', [milestone.rows[0]!.id, otherProjectItem]))
      .rejects.toThrow('WORK_ITEM_MILESTONE_PROJECT_MISMATCH')
    await db.query('UPDATE work_items SET milestone_id=$1 WHERE id=$2', [milestone.rows[0]!.id, item])

    await expect(db.query('UPDATE project_milestones SET deleted_at=now() WHERE id=$1', [milestone.rows[0]!.id]))
      .rejects.toThrow('MILESTONE_HAS_ACTIVE_WORK_ITEMS')
    await db.query('UPDATE work_items SET milestone_id=NULL WHERE id=$1', [item])
    await db.query('UPDATE project_milestones SET deleted_at=now() WHERE id=$1', [milestone.rows[0]!.id])
    await expect(db.query('UPDATE work_items SET milestone_id=$1 WHERE id=$2', [milestone.rows[0]!.id, item]))
      .rejects.toThrow('WORK_ITEM_MILESTONE_DELETED')
  })

  it('serializes concurrent parent writes so a two-node cycle cannot commit', async () => {
    const scope = await seedPlanningScope()
    const first = await scope.createItem(0, scope.alphaProjectId, 'Concurrent first')
    const second = await scope.createItem(0, scope.alphaProjectId, 'Concurrent second')
    const firstTx = await db.connect()
    const secondTx = await db.connect()
    try {
      await firstTx.query('BEGIN')
      await secondTx.query('BEGIN')
      await firstTx.query('UPDATE work_items SET parent_id=$1 WHERE id=$2', [second, first])
      const inverse = secondTx.query('UPDATE work_items SET parent_id=$1 WHERE id=$2', [first, second])
      await new Promise(resolve => setTimeout(resolve, 50))
      await firstTx.query('COMMIT')
      await expect(inverse).rejects.toThrow('WORK_ITEM_PARENT_CYCLE')
      await secondTx.query('ROLLBACK')
    } finally {
      firstTx.release()
      secondTx.release()
    }
  })

  it('serializes concurrent blocker writes so a two-node cycle cannot commit', async () => {
    const scope = await seedPlanningScope()
    const first = await scope.createItem(0, scope.alphaProjectId, 'Concurrent blocker first')
    const second = await scope.createItem(0, scope.alphaProjectId, 'Concurrent blocker second')
    const firstTx = await db.connect()
    const secondTx = await db.connect()
    try {
      await firstTx.query('BEGIN')
      await secondTx.query('BEGIN')
      await firstTx.query(
        `INSERT INTO work_item_relations(workspace_id,team_id,source_work_item_id,target_work_item_id,kind)
         VALUES($1,$2,$3,$4,'blocks')`,
        [scope.workspaceId, scope.alphaTeamId, first, second],
      )
      const inverse = secondTx.query(
        `INSERT INTO work_item_relations(workspace_id,team_id,source_work_item_id,target_work_item_id,kind)
         VALUES($1,$2,$3,$4,'blocks')`,
        [scope.workspaceId, scope.alphaTeamId, second, first],
      )
      await new Promise(resolve => setTimeout(resolve, 50))
      await firstTx.query('COMMIT')
      await expect(inverse).rejects.toThrow('WORK_ITEM_BLOCK_CYCLE')
      await secondTx.query('ROLLBACK')
    } finally {
      firstTx.release()
      secondTx.release()
    }
  })
})
