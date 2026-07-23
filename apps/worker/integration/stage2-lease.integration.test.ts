import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, type Db } from '@workmesh/db'
import { createSessionLifecycleWorker } from '../src/session-lifecycle.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 2 worker integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 2 worker integration requires a dedicated *test* database.')

const db = createDb(databaseUrl)
type Fixture = { workspaceId: string; systemActorId: string; sessionId: string; workItemId: string }

async function fixture(database: Db): Promise<Fixture> {
  const workspace = await database.query<{ id: string }>("INSERT INTO workspaces(name,slug) VALUES('Stage 2 worker','stage-2-worker') RETURNING id")
  const workspaceId = workspace.rows[0]!.id
  const system = await database.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','System') RETURNING id", [workspaceId])
  const human = await database.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','admin','worker-stage2@example.test','Admin','unused') RETURNING id", [workspaceId])
  const agentActor = await database.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Lease holder') RETURNING id", [workspaceId])
  await database.query('INSERT INTO platform_installation(singleton,workspace_id,system_actor_id) VALUES(true,$1,$2)', [workspaceId, system.rows[0]!.id])
  const team = await database.query<{ id: string }>("INSERT INTO teams(workspace_id,name,key) VALUES($1,'Stage','S2W') RETURNING id", [workspaceId])
  const state = await database.query<{ id: string }>("INSERT INTO workflow_states(workspace_id,team_id,name,category) VALUES($1,$2,'Ready','backlog') RETURNING id", [workspaceId, team.rows[0]!.id])
  const item = await database.query<{ id: string }>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) VALUES($1,$2,1,'Expire lease',$3,$4) RETURNING id", [workspaceId, team.rows[0]!.id, state.rows[0]!.id, human.rows[0]!.id])
  const agent = await database.query<{ id: string }>("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,supported_protocols,requested_capabilities,approved_capabilities) VALUES($1,$2,'lease-holder','Lease holder',ARRAY['native_http']::agent_protocol[],ARRAY['work:read','work:write'],ARRAY['work:read','work:write']) RETURNING id", [workspaceId, agentActor.rows[0]!.id])
  const delegation = await database.query<{ id: string }>("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id,permissions_snapshot) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,ARRAY['work:read','work:write']) RETURNING id", [workspaceId, team.rows[0]!.id, agent.rows[0]!.id, agentActor.rows[0]!.id, human.rows[0]!.id, item.rows[0]!.id])
  const session = await database.query<{ id: string }>("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state) VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id", [workspaceId, team.rows[0]!.id, agent.rows[0]!.id, agentActor.rows[0]!.id, delegation.rows[0]!.id, item.rows[0]!.id])
  return { workspaceId, systemActorId: system.rows[0]!.id, sessionId: session.rows[0]!.id, workItemId: item.rows[0]!.id }
}

describe('Stage 2 lease expiry worker', () => {
  beforeAll(async () => { await applyMigrations(db) }, 120_000)
  beforeEach(async () => { await db.query('TRUNCATE workspaces CASCADE') })
  afterAll(async () => { await db.end() })

  it('expires durable leases, appends an outbox-backed event, and permits reacquisition after expiry', async () => {
    const data = await fixture(db)
    const lease = await db.query<{ id: string }>("INSERT INTO leases(workspace_id,session_id,resource_type,resource_id,kind,reason,expires_at) VALUES($1,$2,'work_item',$3,'exclusive','short lived',now()+interval '30 seconds') RETURNING id", [data.workspaceId, data.sessionId, data.workItemId])
    await db.query("UPDATE leases SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 second' WHERE id=$1", [lease.rows[0]!.id])
    const worker = createSessionLifecycleWorker({ db, workerId: 'stage2-lease-test' })
    expect(await worker.expireLeases()).toBe(1)
    expect((await db.query<{ status: string; audit_reason: string }>('SELECT status,audit_reason FROM leases WHERE id=$1', [lease.rows[0]!.id])).rows[0]).toEqual({ status: 'expired', audit_reason: 'worker expiry' })
    const durable = await db.query<{ actor_id: string; outbox_count: number }>("SELECT e.actor_id,(SELECT count(*)::int FROM outbox_events o WHERE o.domain_event_id=e.id) AS outbox_count FROM domain_events e WHERE e.event_type='lease.expired' AND e.aggregate_id=$1", [lease.rows[0]!.id])
    expect(durable.rows[0]).toEqual({ actor_id: data.systemActorId, outbox_count: 1 })
    const reacquired = await db.query<{ id: string; status: string }>("INSERT INTO leases(workspace_id,session_id,resource_type,resource_id,kind,reason,expires_at) VALUES($1,$2,'work_item',$3,'exclusive','reacquired',now()+interval '30 seconds') RETURNING id,status", [data.workspaceId, data.sessionId, data.workItemId])
    expect(reacquired.rows[0]!.status).toBe('active')
  })
})
