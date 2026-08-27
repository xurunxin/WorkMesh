import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, type Db } from '@workmesh/db'
import { createAgentWebhookWorker, encryptWebhookSecretForTest } from '../src/agent-webhook.js'
import { createSessionLifecycleWorker } from '../src/session-lifecycle.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Worker integration tests require RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Worker integration tests require DATABASE_URL to name a dedicated test database.')

const db = createDb(databaseUrl)
const restoreSessionSubjectConstraint = async (): Promise<void> => {
  const exists = await db.query(
    `SELECT 1 FROM pg_constraint
      WHERE conname='agent_sessions_scope_kind_check'
        AND conrelid='agent_sessions'::regclass`,
  )
  await db.query(
    'ALTER TABLE agent_sessions DROP CONSTRAINT IF EXISTS agent_sessions_subject_container_check',
  )
  if (exists.rowCount) return
  await db.query(
    'UPDATE agent_sessions SET project_id=NULL WHERE work_item_id IS NOT NULL',
  )
  await db.query(`
    ALTER TABLE agent_sessions
      ADD CONSTRAINT agent_sessions_scope_kind_check CHECK (
        (session_kind='coordination' AND automation_run_id IS NULL AND parent_session_id IS NULL
          AND num_nonnulls(work_item_id,project_id,plan_step_id)=0)
        OR (session_kind='execution' AND (
          (automation_run_id IS NOT NULL AND parent_session_id IS NULL
            AND num_nonnulls(work_item_id,project_id,plan_step_id)=0)
          OR (automation_run_id IS NULL AND (
            (parent_session_id IS NULL AND num_nonnulls(work_item_id,project_id,plan_step_id)=1)
            OR (parent_session_id IS NOT NULL AND num_nonnulls(work_item_id,project_id)=1)
          ))
        ))
      )`)
}
const key = Buffer.alloc(32, 9)
const publicDns = async () => [{ address: '8.8.8.8', family: 4 as const }]

type Fixture = { workspaceId: string; teamId: string; serviceActorId: string; humanActorId: string; agentActorId: string; agentId: string; endpointId: string; workItemId: string; delegationId: string }

const fixture = async (): Promise<Fixture> => {
  const workspace = await db.query<{ id: string }>("INSERT INTO workspaces(name,slug) VALUES('Worker Stage 1','worker-stage-1') RETURNING id")
  const workspaceId = workspace.rows[0]!.id
  const service = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','System') RETURNING id", [workspaceId])
  const human = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','admin','worker@example.test','Owner','unused') RETURNING id", [workspaceId])
  const agentActor = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Webhook Agent') RETURNING id", [workspaceId])
  await db.query('INSERT INTO platform_installation(singleton,workspace_id,system_actor_id) VALUES(true,$1,$2)', [workspaceId, service.rows[0]!.id])
  const team = await db.query<{ id: string }>("INSERT INTO teams(workspace_id,name,key) VALUES($1,'Stage','STG') RETURNING id", [workspaceId])
  const state = await db.query<{ id: string }>("INSERT INTO workflow_states(workspace_id,team_id,name,category) VALUES($1,$2,'Todo','backlog') RETURNING id", [workspaceId, team.rows[0]!.id])
  const workItem = await db.query<{ id: string }>('INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) VALUES($1,$2,1,$3,$4,$5) RETURNING id', [workspaceId, team.rows[0]!.id, 'Verify worker', state.rows[0]!.id, human.rows[0]!.id])
  const agent = await db.query<{ id: string }>("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,supported_protocols) VALUES($1,$2,'worker-agent','Worker agent',ARRAY['native_http']::agent_protocol[]) RETURNING id", [workspaceId, agentActor.rows[0]!.id])
  const endpoint = await db.query<{ id: string }>("INSERT INTO agent_webhook_endpoints(agent_id,url) VALUES($1,'https://agent.example.test/events') RETURNING id", [agent.rows[0]!.id])
  const encrypted = encryptWebhookSecretForTest(Buffer.from('integration-secret'), key)
  await db.query('INSERT INTO agent_webhook_secrets(endpoint_id,version,secret_ciphertext,iv,auth_tag,key_version,status,created_by_actor_id) VALUES($1,1,$2,$3,$4,$5,$6,$7)', [endpoint.rows[0]!.id, Buffer.from(encrypted.ciphertext, 'base64'), Buffer.from(encrypted.iv, 'base64'), Buffer.from(encrypted.authTag, 'base64'), '1', 'active', service.rows[0]!.id])
  const delegation = await db.query<{ id: string }>("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id,permissions_snapshot) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,ARRAY['work:read']) RETURNING id", [workspaceId, team.rows[0]!.id, agent.rows[0]!.id, agentActor.rows[0]!.id, human.rows[0]!.id, workItem.rows[0]!.id])
  return { workspaceId, teamId: team.rows[0]!.id, serviceActorId: service.rows[0]!.id, humanActorId: human.rows[0]!.id, agentActorId: agentActor.rows[0]!.id, agentId: agent.rows[0]!.id, endpointId: endpoint.rows[0]!.id, workItemId: workItem.rows[0]!.id, delegationId: delegation.rows[0]!.id }
}

const createSession = async (data: Fixture, state = 'queued'): Promise<string> => {
  const result = await db.query<{ id: string }>(`
    INSERT INTO agent_sessions(workspace_id,agent_id,agent_actor_id,delegation_id,work_item_id,state)
    SELECT $1,d.agent_id,d.agent_actor_id,d.id,$2,$3 FROM delegations d WHERE d.id=$4 RETURNING id
  `, [data.workspaceId, data.workItemId, state, data.delegationId])
  return result.rows[0]!.id
}

const createDelivery = async (data: Fixture, sessionId: string, deliveryId = `del_${randomUUID()}`): Promise<string> => {
  const event = await db.query<{ id: string }>("INSERT INTO domain_events(workspace_id,event_type,aggregate_type,aggregate_id,actor_id,correlation_id,payload) VALUES($1,'agent.session.created','agent_session',$2,$3,$4,$5) RETURNING id", [data.workspaceId, sessionId, data.serviceActorId, deliveryId, { sessionId }])
  const delivery = await db.query<{ id: string }>('INSERT INTO agent_webhook_deliveries(agent_id,endpoint_id,secret_version,event_id,delivery_id,event_type,session_id,payload) VALUES($1,$2,1,$3,$4,$5,$6,$7) RETURNING id', [data.agentId, data.endpointId, event.rows[0]!.id, deliveryId, 'agent.session.created', sessionId, { sessionId }])
  return delivery.rows[0]!.id
}

const expectEventTeamAuthority = async (
  aggregateId: string,
  eventType: string,
  teamId: string,
): Promise<void> => {
  const event = await db.query<{ id: string; teamId: string | null }>(
    `SELECT id,team_id AS "teamId"
      FROM domain_events
      WHERE aggregate_id=$1 AND event_type=$2
      ORDER BY occurred_at DESC
      LIMIT 1`,
    [aggregateId, eventType],
  )
  expect(event.rows[0]?.teamId).toBe(teamId)
  const resources = await db.query<{ relation: string }>(
    `SELECT relation
       FROM domain_event_resources
      WHERE domain_event_id=$1 AND resource_type='team' AND resource_id=$2
      ORDER BY relation`,
    [event.rows[0]!.id, teamId],
  )
  expect(resources.rows.map(row => row.relation)).toEqual(['invalidate', 'scope'])
}

describe('stage 1 worker durability', () => {
  beforeAll(async () => { await applyMigrations(db) }, 120_000)
  beforeEach(async () => { await db.query('TRUNCATE workspaces CASCADE') })
  afterEach(restoreSessionSubjectConstraint)
  afterAll(async () => { await db.end() })

  it('treats receiver 409 as delivered and the durable ledger rejects duplicate delivery ids', async () => {
    const data = await fixture()
    const sessionId = await createSession(data)
    const deliveryId = `del_${randomUUID()}`
    const delivery = await createDelivery(data, sessionId, deliveryId)
    const worker = createAgentWebhookWorker({ db, masterKey: key, dnsLookup: publicDns, fetcher: async () => ({ status: 409 }) })
    await worker.tick()
    expect((await db.query<{ status: string }>('SELECT status FROM agent_webhook_deliveries WHERE id=$1', [delivery])).rows[0]?.status).toBe('delivered')
    await expect(createDelivery(data, sessionId, deliveryId)).rejects.toThrow()
  })

  it('reconciles existing pending approvals under YOLO exactly once across worker restarts', async () => {
    const data = await fixture()
    await db.query(
      "UPDATE agent_definitions SET requested_capabilities=ARRAY['work:write'],approved_capabilities=ARRAY['work:write'] WHERE id=$1",
      [data.agentId],
    )
    await db.query(
      "UPDATE delegations SET permissions_snapshot=ARRAY['work:write'] WHERE id=$1",
      [data.delegationId],
    )
    await db.query(
      `INSERT INTO agent_team_access(
         workspace_id,agent_id,team_id,granted_by_actor_id,approved_capabilities
       ) VALUES($1,$2,$3,$4,ARRAY['work:write'])`,
      [data.workspaceId, data.agentId, data.teamId, data.humanActorId],
    )
    const sessionId = await createSession(data, 'acknowledged')
    const approval = (await db.query<{ id: string }>(
      `INSERT INTO approvals(
         workspace_id,session_id,requested_by_actor_id,approval_type,action_name,
         action_payload_sanitized,action_payload_hash,risk_level,rationale_summary,
         required_approvals,expires_at
       ) VALUES(
         $1,$2,$3,'protected_action','worker.reconcile','{}',
         $4,'critical','Reconcile existing pending approval',4,now()+interval '1 hour'
       ) RETURNING id`,
      [data.workspaceId, sessionId, data.agentActorId, `sha256:${'a'.repeat(64)}`],
    )).rows[0]!
    await db.query(
      `INSERT INTO inbox_items(
         workspace_id,recipient_human_actor_id,recipient_actor_id,session_id,team_id,
         kind,source_type,source_id,payload
       ) VALUES($1,$2,$2,$3,$4,'approval','approval',$5,'{}')`,
      [data.workspaceId, data.humanActorId, sessionId, data.teamId, approval.id],
    )
    await db.query(
      `INSERT INTO approval_autonomy_policies(workspace_id,mode,revision,updated_by_actor_id)
       VALUES($1,'yolo',1,$2)`,
      [data.workspaceId, data.humanActorId],
    )
    const reconciliation = (await db.query<{ id: string }>(
      `INSERT INTO approval_policy_reconciliations(workspace_id,policy_revision,status)
       VALUES($1,1,'pending') RETURNING id`,
      [data.workspaceId],
    )).rows[0]!
    await db.query(
      `INSERT INTO approval_policy_reconciliation_items(reconciliation_id,approval_id)
       VALUES($1,$2)`,
      [reconciliation.id, approval.id],
    )

    const firstWorker = createSessionLifecycleWorker({ db, workerId: 'approval-policy-worker-1' })
    expect(await firstWorker.reconcileApprovalAutonomy()).toBe(1)
    const secondWorker = createSessionLifecycleWorker({ db, workerId: 'approval-policy-worker-2' })
    expect(await secondWorker.reconcileApprovalAutonomy()).toBe(0)
    expect((await db.query<{ status: string; revision: number }>(
      'SELECT status,revision FROM approvals WHERE id=$1',
      [approval.id],
    )).rows[0]).toMatchObject({ status: 'approved', revision: 2 })
    expect((await db.query<{ source: string; policy_revision: number }>(
      'SELECT source,policy_revision FROM approval_decisions WHERE approval_id=$1',
      [approval.id],
    )).rows).toEqual([{ source: 'workspace_policy', policy_revision: 1 }])
    expect((await db.query<{ status: string }>(
      'SELECT status FROM inbox_items WHERE source_type=\'approval\' AND source_id=$1',
      [approval.id],
    )).rows[0]?.status).toBe('resolved')
    expect((await db.query<{ status: string; approved_count: number; skipped_count: number }>(
      'SELECT status,approved_count,skipped_count FROM approval_policy_reconciliations WHERE id=$1',
      [reconciliation.id],
    )).rows[0]).toEqual({ status: 'completed', approved_count: 1, skipped_count: 0 })
    expect((await db.query(
      "SELECT 1 FROM domain_events WHERE aggregate_id=$1 AND event_type='approval.auto_approved'",
      [approval.id],
    )).rowCount).toBe(1)
  })

  it('retries, reclaims after a crash, and dead-letters bounded failures without persisting receiver errors', async () => {
    const data = await fixture()
    const sessionId = await createSession(data)
    const retryId = await createDelivery(data, sessionId)
    let online = false
    const retryWorker = createAgentWebhookWorker({ db, masterKey: key, dnsLookup: publicDns, fetcher: async () => { if (!online) throw new Error('secret must not appear'); return { status: 204 } } })
    await retryWorker.tick()
    expect((await db.query<{ status: string; last_error: string }>('SELECT status,last_error FROM agent_webhook_deliveries WHERE id=$1', [retryId])).rows[0]).toMatchObject({ status: 'pending', last_error: 'NETWORK_ERROR' })
    await db.query('UPDATE agent_webhook_deliveries SET available_at=now() WHERE id=$1', [retryId]); online = true; await retryWorker.tick()
    expect((await db.query<{ status: string }>('SELECT status FROM agent_webhook_deliveries WHERE id=$1', [retryId])).rows[0]?.status).toBe('delivered')

    const reclaimId = await createDelivery(data, sessionId)
    const beforeCrash = createAgentWebhookWorker({ db, workerId: 'before-crash', masterKey: key, dnsLookup: publicDns, fetcher: async () => ({ status: 204 }) })
    expect(await beforeCrash.claimDeliveries(1, 60)).toHaveLength(1)
    await db.query("UPDATE agent_webhook_deliveries SET locked_at=now()-interval '61 seconds' WHERE id=$1", [reclaimId])
    await createAgentWebhookWorker({ db, workerId: 'after-crash', masterKey: key, dnsLookup: publicDns, fetcher: async () => ({ status: 204 }) }).tick()
    expect((await db.query<{ status: string; attempt_count: number }>('SELECT status,attempt_count FROM agent_webhook_deliveries WHERE id=$1', [reclaimId])).rows[0]).toMatchObject({ status: 'delivered', attempt_count: 2 })

    const deadId = await createDelivery(data, sessionId)
    const deadWorker = createAgentWebhookWorker({ db, masterKey: key, maxAttempts: 2, dnsLookup: publicDns, fetcher: async () => ({ status: 503 }) })
    await deadWorker.tick(); await db.query('UPDATE agent_webhook_deliveries SET available_at=now() WHERE id=$1', [deadId]); await deadWorker.tick()
    expect((await db.query<{ status: string; dead_lettered_at: Date | null }>('SELECT status,dead_lettered_at FROM agent_webhook_deliveries WHERE id=$1', [deadId])).rows[0]).toMatchObject({ status: 'dead', dead_lettered_at: expect.any(Date) })
  })

  it('dead-letters a private target without sending and permits the explicit private-network override', async () => {
    const data = await fixture()
    const sessionId = await createSession(data)
    await db.query("UPDATE agent_webhook_endpoints SET url='http://agent.internal/events' WHERE id=$1", [data.endpointId])
    const rejectedId = await createDelivery(data, sessionId)
    let requests = 0
    const privateDns = async () => [{ address: '10.20.30.40', family: 4 as const }]
    await createAgentWebhookWorker({
      db,
      masterKey: key,
      dnsLookup: privateDns,
      fetcher: async () => { requests += 1; return { status: 204 } },
    }).tick()
    expect(requests).toBe(0)
    expect((await db.query<{ status: string; attempt_count: number; last_error: string }>(
      'SELECT status,attempt_count,last_error FROM agent_webhook_deliveries WHERE id=$1',
      [rejectedId],
    )).rows[0]).toMatchObject({ status: 'dead', attempt_count: 1, last_error: 'UNSAFE_WEBHOOK_TARGET' })

    const allowedId = await createDelivery(data, sessionId)
    await createAgentWebhookWorker({
      db,
      masterKey: key,
      dnsLookup: privateDns,
      allowPrivateAgentWebhooks: true,
      fetcher: async () => { requests += 1; return { status: 204 } },
    }).tick()
    expect(requests).toBe(1)
    expect((await db.query<{ status: string }>('SELECT status FROM agent_webhook_deliveries WHERE id=$1', [allowedId])).rows[0]?.status).toBe('delivered')
  })

  it('normalizes Work Item and project-only room targets before delivery or suppression', async () => {
    const data = await fixture()
    const projectId = (await db.query<{ id: string }>(
      "INSERT INTO projects(workspace_id,team_id,name) VALUES($1,$2,'Worker project scope') RETURNING id",
      [data.workspaceId, data.teamId],
    )).rows[0]!.id
    const reparentedProjectId = (await db.query<{ id: string }>(
      "INSERT INTO projects(workspace_id,team_id,name) VALUES($1,$2,'Worker reparented scope') RETURNING id",
      [data.workspaceId, data.teamId],
    )).rows[0]!.id
    const staleProjectId = (await db.query<{ id: string }>(
      "INSERT INTO projects(workspace_id,team_id,name) VALUES($1,$2,'Worker stale hybrid scope') RETURNING id",
      [data.workspaceId, data.teamId],
    )).rows[0]!.id
    await db.query('UPDATE work_items SET project_id=$2 WHERE id=$1', [
      data.workItemId,
      projectId,
    ])
    await db.query(
      `UPDATE agent_definitions
          SET requested_capabilities=ARRAY['work:read'],
              approved_capabilities=ARRAY['work:read']
        WHERE id=$1`,
      [data.agentId],
    )
    await db.query(
      `INSERT INTO agent_team_access(
         workspace_id,team_id,agent_id,approved_capabilities,granted_by_actor_id
       ) VALUES($1,$2,$3,ARRAY['work:read'],$4)`,
      [data.workspaceId, data.teamId, data.agentId, data.humanActorId],
    )
    await db.query(
      `UPDATE delegations
          SET permissions_snapshot=ARRAY['work:read'],
              capability_scope=jsonb_build_object(
                'teamIds',jsonb_build_array($2::text),
                'workItemIds',jsonb_build_array($3::text),
                'projectIds','[]'::jsonb
              )
        WHERE id=$1`,
      [data.delegationId, data.teamId, data.workItemId],
    )
    const sessionId = (await db.query<{ id: string }>(
      `INSERT INTO agent_sessions(
         workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state
       ) VALUES($1,$2,$3,$4,$5,$6,'executing')
       RETURNING id`,
      [
        data.workspaceId,
        data.teamId,
        data.agentId,
        data.agentActorId,
        data.delegationId,
        data.workItemId,
      ],
    )).rows[0]!.id
    const channelId = (await db.query<{ id: string }>(
      `INSERT INTO work_room_channels(
         workspace_id,subject_kind,subject_id,team_id
       ) VALUES($1,'project',$2,$3)
       RETURNING id`,
      [data.workspaceId, projectId, data.teamId],
    )).rows[0]!.id
    const workItemChannelId = (await db.query<{ id: string }>(
      `INSERT INTO work_room_channels(
         workspace_id,subject_kind,subject_id,team_id
       ) VALUES($1,'work_item',$2,$3)
       RETURNING id`,
      [data.workspaceId, data.workItemId, data.teamId],
    )).rows[0]!.id
    const reparentedChannelId = (await db.query<{ id: string }>(
      `INSERT INTO work_room_channels(
         workspace_id,subject_kind,subject_id,team_id
       ) VALUES($1,'project',$2,$3)
       RETURNING id`,
      [data.workspaceId, reparentedProjectId, data.teamId],
    )).rows[0]!.id
    const staleChannelId = (await db.query<{ id: string }>(
      `INSERT INTO work_room_channels(
         workspace_id,subject_kind,subject_id,team_id
       ) VALUES($1,'project',$2,$3)
       RETURNING id`,
      [data.workspaceId, staleProjectId, data.teamId],
    )).rows[0]!.id
    // Fault-inject a legacy/corrupt hybrid row; production constraints still
    // prevent creating this state through normal writes.
    await db.query('ALTER TABLE agent_sessions DROP CONSTRAINT IF EXISTS agent_sessions_subject_container_check')
    await db.query('ALTER TABLE agent_sessions DROP CONSTRAINT IF EXISTS agent_sessions_scope_kind_check')
    await db.query('UPDATE agent_sessions SET project_id=$2 WHERE id=$1', [
      sessionId,
      staleProjectId,
    ])
    await db.query(
      `UPDATE delegations
          SET capability_scope=jsonb_set(
            capability_scope,'{projectIds}',jsonb_build_array($2::text)
          )
        WHERE id=$1`,
      [data.delegationId, staleProjectId],
    )
    const siblingWorkItemId = (await db.query<{ id: string }>(
      `INSERT INTO work_items(
         workspace_id,team_id,number,title,status_id,
         responsible_human_actor_id,project_id
       )
       SELECT workspace_id,team_id,number+1,'Sibling worker scope',status_id,
              responsible_human_actor_id,project_id
         FROM work_items WHERE id=$1
       RETURNING id`,
      [data.workItemId],
    )).rows[0]!.id
    const siblingChannelId = (await db.query<{ id: string }>(
      `INSERT INTO work_room_channels(
         workspace_id,subject_kind,subject_id,team_id
       ) VALUES($1,'work_item',$2,$3)
       RETURNING id`,
      [data.workspaceId, siblingWorkItemId, data.teamId],
    )).rows[0]!.id
    const enqueue = async (marker: string, targetChannelId = channelId): Promise<string> => {
      const messageId = (await db.query<{ id: string }>(
        `INSERT INTO room_messages(
           channel_id,workspace_id,author_actor_id,intent,recipient_actor_id,body
         ) VALUES($1,$2,$3,'inform',$4,'Targeted worker delivery')
         RETURNING id`,
        [targetChannelId, data.workspaceId, data.humanActorId, data.agentActorId],
      )).rows[0]!.id
      const eventId = (await db.query<{ id: string }>(
        `INSERT INTO domain_events(
           workspace_id,team_id,audience_actor_id,event_type,aggregate_type,
           aggregate_id,actor_id,correlation_id,session_id,payload
         ) VALUES(
           $1,$2,$3,'room.message.posted','room_message',$4,$5,$6,$7,$8
         ) RETURNING id`,
        [
          data.workspaceId,
          data.teamId,
          data.agentActorId,
          messageId,
          data.humanActorId,
          randomUUID(),
          sessionId,
          { marker },
        ],
      )).rows[0]!.id
      return (await db.query<{ id: string }>(
        `INSERT INTO agent_webhook_deliveries(
           agent_id,endpoint_id,secret_version,event_id,delivery_id,event_type,
           session_id,payload
         ) VALUES($1,$2,1,$3,$4,'room.message.posted',$5,$6)
         RETURNING id`,
        [
          data.agentId,
          data.endpointId,
          eventId,
          `direct-${randomUUID()}`,
          sessionId,
          { marker },
        ],
      )).rows[0]!.id
    }
    let requests = 0
    const worker = createAgentWebhookWorker({
      db,
      masterKey: key,
      dnsLookup: publicDns,
      fetcher: async () => { requests += 1; return { status: 204 } },
    })

    const authorizedDeliveryId = await enqueue('authorized-project-linked-work-item')
    await worker.tick()
    expect(requests).toBe(1)
    expect((await db.query<{ status: string }>(
      'SELECT status FROM agent_webhook_deliveries WHERE id=$1',
      [authorizedDeliveryId],
    )).rows[0]).toEqual({ status: 'delivered' })

    await db.query('UPDATE projects SET deleted_at=now() WHERE id=$1', [projectId])
    const deletedProjectDeliveryId = await enqueue('must-revoke-deleted-project')
    await worker.tick()
    expect(requests).toBe(1)
    expect((await db.query<{ status: string; last_error: string }>(
      'SELECT status,last_error FROM agent_webhook_deliveries WHERE id=$1',
      [deletedProjectDeliveryId],
    )).rows[0]).toEqual({
      status: 'dead',
      last_error: 'WEBHOOK_TARGET_REVOKED',
    })
    const liveWorkItemDeliveryId = await enqueue(
      'live-work-item-survives-parent-project-delete',
      workItemChannelId,
    )
    await worker.tick()
    expect(requests).toBe(2)
    expect((await db.query<{ status: string }>(
      'SELECT status FROM agent_webhook_deliveries WHERE id=$1',
      [liveWorkItemDeliveryId],
    )).rows[0]).toEqual({ status: 'delivered' })
    await db.query('UPDATE projects SET deleted_at=NULL WHERE id=$1', [projectId])

    const staleHybridDeliveryId = await enqueue(
      'must-ignore-stale-hybrid-project',
      staleChannelId,
    )
    await worker.tick()
    expect(requests).toBe(2)
    expect((await db.query<{ status: string; last_error: string }>(
      'SELECT status,last_error FROM agent_webhook_deliveries WHERE id=$1',
      [staleHybridDeliveryId],
    )).rows[0]).toEqual({
      status: 'dead',
      last_error: 'WEBHOOK_TARGET_REVOKED',
    })

    const siblingDeliveryId = await enqueue(
      'must-not-enter-sibling-work-item',
      siblingChannelId,
    )
    await worker.tick()
    expect(requests).toBe(2)
    expect((await db.query<{ status: string; last_error: string }>(
      'SELECT status,last_error FROM agent_webhook_deliveries WHERE id=$1',
      [siblingDeliveryId],
    )).rows[0]).toEqual({
      status: 'dead',
      last_error: 'WEBHOOK_TARGET_REVOKED',
    })

    await db.query('UPDATE work_items SET project_id=$2 WHERE id=$1', [
      data.workItemId,
      reparentedProjectId,
    ])
    const previousProjectDeliveryId = await enqueue('must-revoke-previous-project')
    await worker.tick()
    expect(requests).toBe(2)
    expect((await db.query<{ status: string; last_error: string }>(
      'SELECT status,last_error FROM agent_webhook_deliveries WHERE id=$1',
      [previousProjectDeliveryId],
    )).rows[0]).toEqual({
      status: 'dead',
      last_error: 'WEBHOOK_TARGET_REVOKED',
    })
    const reparentedDeliveryId = await enqueue(
      'must-follow-current-work-item-project',
      reparentedChannelId,
    )
    await worker.tick()
    expect(requests).toBe(3)
    expect((await db.query<{ status: string }>(
      'SELECT status FROM agent_webhook_deliveries WHERE id=$1',
      [reparentedDeliveryId],
    )).rows[0]).toEqual({ status: 'delivered' })

    await db.query('UPDATE work_items SET deleted_at=now() WHERE id=$1', [
      data.workItemId,
    ])
    const deletedWorkItemDeliveryId = await enqueue(
      'must-revoke-deleted-work-item-project',
      reparentedChannelId,
    )
    await worker.tick()
    expect(requests).toBe(3)
    expect((await db.query<{ status: string; last_error: string }>(
      'SELECT status,last_error FROM agent_webhook_deliveries WHERE id=$1',
      [deletedWorkItemDeliveryId],
    )).rows[0]).toEqual({
      status: 'dead',
      last_error: 'WEBHOOK_TARGET_REVOKED',
    })

    await db.query(
      'UPDATE agent_sessions SET work_item_id=NULL,project_id=$2 WHERE id=$1',
      [sessionId, projectId],
    )
    await db.query(
      `UPDATE delegations
          SET capability_scope=jsonb_build_object(
            'teamIds',jsonb_build_array($2::text),
            'workItemIds','[]'::jsonb,
            'projectIds','[]'::jsonb
          )
        WHERE id=$1`,
      [data.delegationId, data.teamId],
    )
    const missingProjectScopeId = await enqueue('missing-projectIds')
    await worker.tick()
    expect(requests).toBe(3)
    expect((await db.query<{ status: string; last_error: string }>(
      'SELECT status,last_error FROM agent_webhook_deliveries WHERE id=$1',
      [missingProjectScopeId],
    )).rows[0]).toEqual({
      status: 'dead',
      last_error: 'WEBHOOK_TARGET_REVOKED',
    })

    await db.query(
      `UPDATE delegations
          SET capability_scope=jsonb_set(
            capability_scope,'{projectIds}',jsonb_build_array($2::text)
          )
        WHERE id=$1`,
      [data.delegationId, projectId],
    )
    const matchingProjectScopeId = await enqueue('matching-projectIds')
    await worker.tick()
    expect(requests).toBe(4)
    expect((await db.query<{ status: string }>(
      'SELECT status FROM agent_webhook_deliveries WHERE id=$1',
      [matchingProjectScopeId],
    )).rows[0]).toEqual({ status: 'delivered' })

    await db.query('UPDATE projects SET deleted_at=now() WHERE id=$1', [projectId])
    const deletedProjectOnlyDeliveryId = await enqueue(
      'must-revoke-deleted-project-only-scope',
    )
    await worker.tick()
    expect(requests).toBe(4)
    expect((await db.query<{ status: string; last_error: string }>(
      'SELECT status,last_error FROM agent_webhook_deliveries WHERE id=$1',
      [deletedProjectOnlyDeliveryId],
    )).rows[0]).toEqual({
      status: 'dead',
      last_error: 'WEBHOOK_TARGET_REVOKED',
    })

    const revokedMarker = 'must-not-leave-after-revocation'
    const revokedDeliveryId = await enqueue(revokedMarker)
    await db.query(
      "UPDATE delegations SET status='revoked',revoked_at=now() WHERE id=$1",
      [data.delegationId],
    )
    await worker.tick()
    expect(requests).toBe(4)
    const revokedAudit = (await db.query<{
      status: string
      last_error: string
      payload_text: string
    }>(
      `SELECT status,last_error,payload::text AS payload_text
         FROM agent_webhook_deliveries WHERE id=$1`,
      [revokedDeliveryId],
    )).rows[0]!
    expect(revokedAudit).toMatchObject({
      status: 'dead',
      last_error: 'WEBHOOK_TARGET_REVOKED',
    })
    expect(revokedAudit.last_error).not.toContain(revokedMarker)

    await db.query(
      "UPDATE delegations SET status='active',revoked_at=NULL WHERE id=$1",
      [data.delegationId],
    )
    const stoppedMarker = 'must-not-leave-after-stop'
    const stoppedDeliveryId = await enqueue(stoppedMarker)
    await db.query("UPDATE agent_sessions SET state='stopping' WHERE id=$1", [sessionId])
    await worker.tick()
    expect(requests).toBe(4)
    const stoppedAudit = (await db.query<{ status: string; last_error: string }>(
      'SELECT status,last_error FROM agent_webhook_deliveries WHERE id=$1',
      [stoppedDeliveryId],
    )).rows[0]!
    expect(stoppedAudit).toEqual({
      status: 'dead',
      last_error: 'WEBHOOK_TARGET_REVOKED',
    })
    expect(stoppedAudit.last_error).not.toContain(stoppedMarker)
  })

  it("handles ACK timeout/late ACK, heartbeat stale, stop grace, and approval expiry in durable transactions", async () => {
    const data = await fixture();
    const queued = await createSession(data);
    const lifecycle = createSessionLifecycleWorker({
      db,
      ackTimeoutSeconds: 1,
      heartbeatStaleAfterSeconds: 1,
      stopGraceSeconds: 1,
    });
    expect(
      (
        await db.query<{ teamId: string | null }>(
          'SELECT team_id AS "teamId" FROM agent_sessions WHERE id=$1',
          [queued],
        )
      ).rows[0]?.teamId,
    ).toBeNull();
    await db.query(
      "UPDATE agent_sessions SET created_at=now()-interval '10 minutes' WHERE id=$1",
      [queued],
    );
    expect(await lifecycle.expireAckDeadlines()).toBe(1);
    expect(
      (
        await db.query<{ state: string }>(
          "SELECT state FROM agent_sessions WHERE id=$1",
          [queued],
        )
      ).rows[0]?.state,
    ).toBe("stale");
    await expectEventTeamAuthority(queued, "agent.session.stale", data.teamId);
    expect((await db.query<{
      recipientActorId: string
      recipientHumanActorId: string
      teamId: string
    }>(
      `SELECT recipient_actor_id AS "recipientActorId",
              recipient_human_actor_id AS "recipientHumanActorId",
              team_id AS "teamId"
         FROM inbox_items
        WHERE source_type='agent_session' AND source_id=$1 AND kind='session_stale'`,
      [queued],
    )).rows[0]).toEqual({
      recipientActorId: data.humanActorId,
      recipientHumanActorId: data.humanActorId,
      teamId: data.teamId,
    })
    await db.query(
      "UPDATE agent_sessions SET state='acknowledged', acknowledged_at=now(), last_heartbeat_at=now(), revision=revision+1 WHERE id=$1 AND state='stale'",
      [queued],
    );
    expect(
      (
        await db.query<{ state: string }>(
          "SELECT state FROM agent_sessions WHERE id=$1",
          [queued],
        )
      ).rows[0]?.state,
    ).toBe("acknowledged");

    const active = await createSession(data, "executing");
    await db.query(
      "UPDATE agent_sessions SET last_heartbeat_at=now()-interval '10 minutes' WHERE id=$1",
      [active],
    );
    expect(await lifecycle.reconcileHeartbeatLiveness()).toBe(2);
    expect(
      (
        await db.query<{ heartbeatHealth: string }>(
          'SELECT heartbeat_health AS "heartbeatHealth" FROM agent_sessions WHERE id=$1',
          [queued],
        )
      ).rows[0]?.heartbeatHealth,
    ).toBe("healthy");
    await expectEventTeamAuthority(
      queued,
      "agent.session.health_changed",
      data.teamId,
    );
    expect(
      (
        await db.query<{ state: string }>(
          "SELECT state FROM agent_sessions WHERE id=$1",
          [active],
        )
      ).rows[0]?.state,
    ).toBe("stale");
    expect(
      (
        await db.query<{ count: string }>(
          "SELECT count(*) FROM agent_activities WHERE session_id=$1",
          [active],
        )
      ).rows[0]?.count,
    ).toBe("0");
    await expectEventTeamAuthority(active, "agent.session.stale", data.teamId);
    expect((await db.query<{ recipientActorId: string; teamId: string }>(
      `SELECT recipient_actor_id AS "recipientActorId",team_id AS "teamId"
         FROM inbox_items
        WHERE source_type='agent_session' AND source_id=$1 AND kind='session_stale'`,
      [active],
    )).rows[0]).toEqual({
      recipientActorId: data.humanActorId,
      teamId: data.teamId,
    })

    const stopping = await createSession(data, "stopping");
    await db.query(
      "UPDATE agent_sessions SET stop_requested_at=now()-interval '10 minutes' WHERE id=$1",
      [stopping],
    );
    expect(await lifecycle.expireStopGrace()).toBe(1);
    expect(
      (
        await db.query<{ state: string; ended_at: Date | null }>(
          "SELECT state,ended_at FROM agent_sessions WHERE id=$1",
          [stopping],
        )
      ).rows[0],
    ).toMatchObject({ state: "canceled", ended_at: expect.any(Date) });
    await expectEventTeamAuthority(
      stopping,
      "agent.session.state_changed",
      data.teamId,
    );

    const approval = await db.query<{ id: string }>(
      "INSERT INTO approvals(workspace_id,session_id,requested_by_actor_id,approval_type,action_name,action_payload_sanitized,action_payload_hash,risk_level,rationale_summary,created_at,expires_at) VALUES($1,$2,$3,'merge','git.merge','{}','sha256:abc','high','Needs approval',now()-interval '2 minutes',now()-interval '1 minute') RETURNING id",
      [data.workspaceId, queued, data.humanActorId],
    );
    expect(await lifecycle.expireApprovals()).toBe(1);
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM approvals WHERE id=$1",
          [approval.rows[0]!.id],
        )
      ).rows[0]?.status,
    ).toBe("expired");
    await expectEventTeamAuthority(
      approval.rows[0]!.id,
      "approval.expired",
      data.teamId,
    );

    const lease = await db.query<{ id: string }>(
      `INSERT INTO leases(
         workspace_id,session_id,resource_type,resource_id,kind,reason,created_at,expires_at
       ) VALUES(
         $1,$2,'work_item',$3,'exclusive','Lifecycle expiry',
         now()-interval '2 minutes',now()-interval '1 minute'
       ) RETURNING id`,
      [data.workspaceId, queued, data.workItemId],
    );
    expect(await lifecycle.expireLeases()).toBe(1);
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM leases WHERE id=$1",
          [lease.rows[0]!.id],
        )
      ).rows[0]?.status,
    ).toBe("expired");
    await expectEventTeamAuthority(
      lease.rows[0]!.id,
      "lease.expired",
      data.teamId,
    );
  });
})
