import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) {
  throw new Error('Active executor integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
}
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('Active executor integration requires a dedicated test database.')
}

const db = createDb(databaseUrl)
const recreatePublicSchema = async (): Promise<void> => {
  await db.query('DROP SCHEMA public CASCADE')
  await db.query('CREATE SCHEMA public')
  await applyMigrations(db)
}

type Seed = Readonly<{
  workspaceId: string
  teamId: string
  workItemId: string
  humanActorId: string
}>
type AgentSeed = Readonly<{
  agentId: string
  actorId: string
  delegationId: string
  sessionId: string
}>

const seedWorkspace = async (): Promise<Seed> => {
  const workspaceId = (await db.query<{id:string}>("INSERT INTO workspaces(name,slug) VALUES('Executor projection','executor-projection') RETURNING id")).rows[0]!.id
  const humanActorId = (await db.query<{id:string}>("INSERT INTO actors(workspace_id,kind,email,display_name,password_hash,workspace_role) VALUES($1,'human','owner@example.test','Owner','hash','admin') RETURNING id",[workspaceId])).rows[0]!.id
  const teamId = (await db.query<{id:string}>("INSERT INTO teams(workspace_id,name,key) VALUES($1,'Executor','EXE') RETURNING id",[workspaceId])).rows[0]!.id
  await db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'admin')",[workspaceId,teamId,humanActorId])
  const stateId = (await db.query<{id:string}>("INSERT INTO workflow_states(workspace_id,team_id,name,category) VALUES($1,$2,'Started','started') RETURNING id",[workspaceId,teamId])).rows[0]!.id
  const workItemId = (await db.query<{id:string}>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) VALUES($1,$2,1,'Project active executor',$3,$4) RETURNING id",[workspaceId,teamId,stateId,humanActorId])).rows[0]!.id
  return { workspaceId,teamId,workItemId,humanActorId }
}

const seedAgent = async (
  seed: Seed,
  slug: string,
  role: 'executor' | 'reviewer',
  directWorkItemDelegation = false,
): Promise<AgentSeed> => {
  const actorId = (await db.query<{id:string}>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent',$2) RETURNING id",[seed.workspaceId,slug])).rows[0]!.id
  const agentId = (await db.query<{id:string}>("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,requested_capabilities,approved_capabilities) VALUES($1,$2,$3,$3,$4,$4) RETURNING id",[seed.workspaceId,actorId,slug,['work:read','work:write']])).rows[0]!.id
  await db.query("INSERT INTO agent_team_access(workspace_id,agent_id,team_id,granted_by_actor_id,approved_capabilities) VALUES($1,$2,$3,$4,$5)",[seed.workspaceId,agentId,seed.teamId,seed.humanActorId,['work:read','work:write']])
  const scopeId = directWorkItemDelegation ? seed.workItemId : randomUUID()
  const delegationId = (await db.query<{id:string}>(
    `INSERT INTO delegations(
       workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,
       work_item_id,role,scope_type,scope_id,permissions_snapshot
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [seed.workspaceId,seed.teamId,agentId,actorId,seed.humanActorId,directWorkItemDelegation?seed.workItemId:null,role,directWorkItemDelegation?'work_item':'plan_step',scopeId,['work:read','work:write']],
  )).rows[0]!.id
  const sessionId = (await db.query<{id:string}>(
    "INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state,last_heartbeat_at) VALUES($1,$2,$3,$4,$5,$6,'executing',now()) RETURNING id",
    [seed.workspaceId,seed.teamId,agentId,actorId,delegationId,seed.workItemId],
  )).rows[0]!.id
  return { agentId,actorId,delegationId,sessionId }
}

const acquire = async (
  seed: Seed,
  agent: AgentSeed,
  kind: 'exclusive' | 'review_shared',
  resourceId: string = randomUUID(),
  resourceType: 'work_item' | 'plan_step' = 'plan_step',
): Promise<string> => (await db.query<{id:string}>(
  "INSERT INTO leases(workspace_id,session_id,resource_type,resource_id,kind,reason,expires_at) VALUES($1,$2,$3,$4,$5,'integration projection',now()+interval '10 minutes') RETURNING id",
  [seed.workspaceId,agent.sessionId,resourceType,resourceId,kind],
)).rows[0]!.id

describe.sequential('transactional Work Item active executor projection', () => {
  beforeAll(recreatePublicSchema,120_000)
  afterAll(async () => db.end(),120_000)

  it('keeps Human responsibility, primary execution, reviewers, conflicts, expiry, and rebuild deterministic', async () => {
    const seed = await seedWorkspace()
    const primary = await seedAgent(seed,'primary-agent','executor',true)
    const reviewer = await seedAgent(seed,'review-agent','reviewer')
    const parallelA = await seedAgent(seed,'parallel-a','executor')
    const parallelB = await seedAgent(seed,'parallel-b','executor')
    const contenderA = await seedAgent(seed,'contender-a','executor')
    const contenderB = await seedAgent(seed,'contender-b','executor')

    const primaryLeaseId = await acquire(seed,primary,'exclusive',seed.workItemId,'work_item')
    const reviewLeaseId = await acquire(seed,reviewer,'review_shared')
    const initial = await db.query<{projection_role:string;session_id:string;lease_id:string;execution_state:string}>(
      'SELECT projection_role,session_id,lease_id,execution_state FROM work_item_executor_projections WHERE work_item_id=$1 ORDER BY projection_role',
      [seed.workItemId],
    )
    expect(initial.rows).toEqual([
      { projection_role: 'primary', session_id: primary.sessionId, lease_id: primaryLeaseId, execution_state: 'executing' },
      { projection_role: 'reviewer', session_id: reviewer.sessionId, lease_id: reviewLeaseId, execution_state: 'executing' },
    ])
    expect((await db.query('SELECT responsible_human_actor_id FROM work_items WHERE id=$1',[seed.workItemId])).rows[0]!.responsible_human_actor_id).toBe(seed.humanActorId)

    await db.query("UPDATE agent_sessions SET state='awaiting_approval',last_heartbeat_at=now()+interval '1 second' WHERE id=$1",[primary.sessionId])
    await db.query("UPDATE leases SET heartbeat_at=now()+interval '1 second',expires_at=now()+interval '20 minutes' WHERE id=$1",[primaryLeaseId])
    expect((await db.query<{execution_state:string;renewed:boolean}>("SELECT execution_state,lease_expires_at>now()+interval '15 minutes' AS renewed FROM work_item_executor_projections WHERE lease_id=$1",[primaryLeaseId])).rows[0]).toEqual({ execution_state: 'awaiting_approval', renewed: true })
    await db.query("UPDATE agent_sessions SET state='stopping' WHERE id=$1",[primary.sessionId])
    expect((await db.query('SELECT execution_state FROM work_item_executor_projections WHERE lease_id=$1',[primaryLeaseId])).rows[0]!.execution_state).toBe('stopping')

    await db.query("UPDATE leases SET status='released',released_at=now() WHERE id=$1",[primaryLeaseId])
    expect((await db.query("SELECT count(*)::int AS count FROM work_item_executor_projections WHERE work_item_id=$1 AND projection_role='primary'",[seed.workItemId])).rows[0]!.count).toBe(0)

    const parallelLeaseA = await acquire(seed,parallelA,'exclusive')
    const parallelLeaseB = await acquire(seed,parallelB,'exclusive')
    expect((await db.query<{session_id:string;lease_id:string}>("SELECT session_id,lease_id FROM work_item_executor_projections WHERE work_item_id=$1 AND projection_role='primary'",[seed.workItemId])).rows[0]).toEqual({ session_id: parallelA.sessionId, lease_id: parallelLeaseA })
    await db.query("UPDATE leases SET status='released',released_at=now() WHERE id=ANY($1::uuid[])",[[parallelLeaseA,parallelLeaseB]])

    const raced = await Promise.allSettled([
      acquire(seed,contenderA,'exclusive',seed.workItemId,'work_item'),
      acquire(seed,contenderB,'exclusive',seed.workItemId,'work_item'),
    ])
    expect(raced.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(raced.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect((raced.find(result => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: '23505' })
    const winner = (await db.query<{session_id:string;lease_id:string}>("SELECT session_id,lease_id FROM work_item_executor_projections WHERE work_item_id=$1 AND projection_role='primary'",[seed.workItemId])).rows[0]!
    expect([contenderA.sessionId,contenderB.sessionId]).toContain(winner.session_id)

    await db.query("UPDATE agent_sessions SET state='failed',ended_at=now(),error_code='INTEGRATION_FAILURE',error_summary='projection failure transition' WHERE id=$1",[winner.session_id])
    expect((await db.query("SELECT count(*)::int AS count FROM work_item_executor_projections WHERE work_item_id=$1 AND projection_role='primary'",[seed.workItemId])).rows[0]!.count).toBe(0)
    await db.query("UPDATE leases SET status='expired',audit_reason='failed Session cleanup' WHERE id=$1",[winner.lease_id])
    const remainingContender = winner.session_id === contenderA.sessionId ? contenderB : contenderA
    await acquire(seed,remainingContender,'exclusive',seed.workItemId,'work_item')
    await db.query("UPDATE agent_sessions SET state='stale' WHERE id=$1",[remainingContender.sessionId])
    expect((await db.query("SELECT count(*)::int AS count FROM work_item_executor_projections WHERE work_item_id=$1 AND projection_role='primary'",[seed.workItemId])).rows[0]!.count).toBe(0)

    await db.query('DELETE FROM work_item_executor_projections WHERE work_item_id=$1',[seed.workItemId])
    expect((await db.query<{rebuilt:number}>('SELECT rebuild_work_item_executor_projections($1,$2) AS rebuilt',[seed.workspaceId,seed.workItemId])).rows[0]!.rebuilt).toBe(1)
    const rebuilt = await db.query<{projection_role:string;lease_id:string}>('SELECT projection_role,lease_id FROM work_item_executor_projections WHERE work_item_id=$1',[seed.workItemId])
    expect(rebuilt.rows).toEqual([{ projection_role: 'reviewer', lease_id: reviewLeaseId }])

    await db.query("UPDATE leases SET status='expired',expires_at=created_at+interval '1 millisecond',audit_reason='expiry sweep' WHERE id=$1",[reviewLeaseId])
    expect((await db.query('SELECT count(*)::int AS count FROM work_item_executor_projections WHERE work_item_id=$1',[seed.workItemId])).rows[0]!.count).toBe(0)

    const delegatedReviewer = await seedAgent(seed,'delegated-reviewer','reviewer')
    await acquire(seed,delegatedReviewer,'review_shared')
    await db.query("UPDATE delegations SET status='completed' WHERE id=$1",[delegatedReviewer.delegationId])
    expect((await db.query('SELECT count(*)::int AS count FROM work_item_executor_projections WHERE work_item_id=$1',[seed.workItemId])).rows[0]!.count).toBe(0)
  },120_000)
})
