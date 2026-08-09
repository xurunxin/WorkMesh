import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  appendEvent,
  applyMigrations,
  budgetPolicies,
  createDb,
  usageRecords,
} from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 4 migration integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 4 migration integration requires a dedicated *test* database.')
const db = createDb(databaseUrl)

describe('Stage 4 planning and operations migrations', () => {
  beforeAll(async () => {
    await db.query('DROP SCHEMA public CASCADE')
    await db.query('CREATE SCHEMA public')
    await applyMigrations(db)
  })
  afterAll(async () => { await db.end() })

  it('installs every authoritative Stage 4 projection', async () => {
    const names = [
      'cycles', 'work_item_cycle_facts', 'initiatives', 'initiative_projects', 'advanced_saved_views',
      'templates', 'template_versions', 'usage_records', 'budget_policies', 'notification_preferences',
      'notifications', 'notification_deliveries', 'automation_rules', 'automation_rule_versions',
      'automation_occurrences', 'automation_runs', 'automation_effects', 'loops', 'loop_budget_reservations',
      'project_health_updates', 'project_health_sources', 'a2a_agent_bindings', 'a2a_task_bindings', 'a2a_deliveries',
      'automation_external_effect_intents',
    ]
    const result = await db.query<{ table_name: string }>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',
      [names],
    )
    expect(new Set(result.rows.map(row => row.table_name))).toEqual(new Set(names))
  })

  it('pins immutable versions and deduplicates occurrences, usage, and effects', async () => {
    const constraints = await db.query<{ constraint_name: string }>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_schema=current_schema() AND constraint_name IN (
         'automation_occurrences_rule_id_occurrence_key_key',
         'automation_runs_occurrence_id_key',
         'automation_effects_effect_key_key',
         'usage_records_workspace_id_dedupe_key_key',
         'a2a_deliveries_binding_id_delivery_id_key'
       )`,
    )
    expect(constraints.rowCount).toBe(5)
    const immutableTriggers = await db.query<{ trigger_name: string }>(
      `SELECT DISTINCT trigger_name FROM information_schema.triggers
       WHERE trigger_schema=current_schema() AND trigger_name IN (
         'automation_rule_versions_immutable','automation_occurrences_immutable',
         'template_versions_immutable','usage_records_immutable','project_health_sources_immutable'
       )`,
    )
    expect(immutableTriggers.rowCount).toBe(5)
  })

  it('extends Session scope for Loop runs without inventing a Work Item', async () => {
    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema=current_schema() AND table_name='agent_sessions'
         AND column_name='automation_run_id'`,
    )
    expect(columns.rowCount).toBe(1)
    const definition = await db.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE conrelid='agent_sessions'::regclass AND conname='agent_sessions_subject_container_check'`,
    )
    expect(definition.rows[0]?.definition).toContain('automation_run_id')
  })

  it('keeps unknown cost distinct and exposes Gitea through the existing provider enum', async () => {
    const check = await db.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE conrelid='usage_records'::regclass AND contype='c'
         AND pg_get_constraintdef(oid) LIKE '%cost_source%'`,
    )
    expect(check.rows.some(row => row.definition.includes('cost_minor IS NULL'))).toBe(true)
    const providers = await db.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum WHERE enumtypid='provider_kind'::regtype ORDER BY enumsortorder`,
    )
    expect(providers.rows.map(row => row.enumlabel)).toEqual(['fake', 'github', 'gitea'])
  })

  it('makes Loop overlap conditional and separates inbound/outbound A2A identities', async () => {
    const indexes = await db.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname,indexdef FROM pg_indexes
       WHERE schemaname=current_schema() AND indexname IN (
         'loops_one_active_run_when_enforced',
         'a2a_delivery_task_direction_sequence',
         'agent_session_prompts_a2a_external_message',
         'a2a_delivery_domain_event'
       ) ORDER BY indexname`,
    )
    expect(indexes.rows).toHaveLength(4)
    expect(indexes.rows.find(index => index.indexname === 'loops_one_active_run_when_enforced')?.indexdef)
      .toContain('enforce_no_overlap')
    const columns = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name,column_name FROM information_schema.columns
       WHERE table_schema=current_schema() AND (
         (table_name='automation_runs' AND column_name='enforce_no_overlap')
         OR (table_name='a2a_deliveries' AND column_name IN ('direction','sequence','session_id','domain_event_id'))
         OR (table_name='agent_session_prompts' AND column_name='a2a_external_message_id')
       )`,
    )
    expect(columns.rows).toHaveLength(6)
  })

  it('resolves human repository-context provider actions to their durable Work Item or Team scope', async () => {
    const suffix = randomUUID().replaceAll('-', '')
    const workspace = (await db.query<{ id: string }>(
      'INSERT INTO workspaces(name,slug) VALUES($1,$2) RETURNING id',
      [`Provider action ${suffix}`, `provider-action-${suffix}`],
    )).rows[0]!
    const human = (await db.query<{ id: string }>(
      `INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash)
       VALUES($1,'human','admin',$2,'Provider action owner','hash') RETURNING id`,
      [workspace.id, `${suffix}@example.test`],
    )).rows[0]!
    const service = (await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','Fake Git provider') RETURNING id",
      [workspace.id],
    )).rows[0]!
    const team = (await db.query<{ id: string }>(
      'INSERT INTO teams(workspace_id,name,key) VALUES($1,$2,$3) RETURNING id',
      [workspace.id, `Provider action ${suffix}`, `R${suffix.slice(0, 7)}`],
    )).rows[0]!
    const state = (await db.query<{ id: string }>(
      `INSERT INTO workflow_states(workspace_id,team_id,name,category,color,position)
       VALUES($1,$2,'Backlog','backlog','#000000',0) RETURNING id`,
      [workspace.id, team.id],
    )).rows[0]!
    const item = (await db.query<{ id: string }>(
      `INSERT INTO work_items(
         workspace_id,team_id,number,title,status_id,responsible_human_actor_id
       ) VALUES($1,$2,1,'Resolve repository context',$3,$4) RETURNING id`,
      [workspace.id, team.id, state.id, human.id],
    )).rows[0]!
    const connection = (await db.query<{ id: string }>(
      `INSERT INTO provider_connections(
         workspace_id,provider,external_account_id,display_name,
         service_actor_id,webhook_secret_ciphertext
       ) VALUES($1,'fake',$2,'Fake Git',$3,decode(repeat('00',32),'hex'))
       RETURNING id`,
      [workspace.id, `fake-${suffix}`, service.id],
    )).rows[0]!
    const repository = (await db.query<{ id: string }>(
      `INSERT INTO repositories(
         workspace_id,connection_id,team_id,external_id,full_name,default_branch
       ) VALUES($1,$2,$3,$4,$5,'main') RETURNING id`,
      [workspace.id, connection.id, team.id, `repo-${suffix}`, `workmesh/${suffix}`],
    )).rows[0]!
    const workItemAction = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,
         session_id,work_item_id,project_id,kind,intent_key,payload
       ) VALUES(
         $1,$2,$3,$4,NULL,$5,NULL,'resolve_repository_context',$6,'{}'::jsonb
       ) RETURNING id`,
      [workspace.id, connection.id, repository.id, human.id, item.id, `work-item-${suffix}`],
    )).rows[0]!
    const teamAction = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,
         session_id,work_item_id,project_id,kind,intent_key,payload
       ) VALUES(
         $1,$2,$3,$4,NULL,NULL,NULL,'resolve_repository_context',$5,'{}'::jsonb
       ) RETURNING id`,
      [workspace.id, connection.id, repository.id, human.id, `team-${suffix}`],
    )).rows[0]!

    const appendProviderActionEvent = async (actionId: string): Promise<string> =>
      await appendEvent(db, {
        workspaceId: workspace.id,
        actorId: human.id,
        correlationId: `provider-action-resource:${actionId}`,
        type: 'repository.context.resolution_requested',
        aggregateType: 'provider_action',
        aggregateId: actionId,
        payload: { repositoryId: repository.id },
      })
    const workItemEventId = await appendProviderActionEvent(workItemAction.id)
    const teamEventId = await appendProviderActionEvent(teamAction.id)

    const events = await db.query<{
      id: string
      workspace_id: string
      team_id: string
    }>(
      'SELECT id,workspace_id,team_id FROM domain_events WHERE id=ANY($1::uuid[]) ORDER BY id',
      [[workItemEventId, teamEventId]],
    )
    expect(events.rows).toHaveLength(2)
    expect(events.rows.every(event =>
      event.workspace_id === workspace.id && event.team_id === team.id,
    )).toBe(true)

    const resources = async (eventId: string) =>
      (await db.query<{
        relation: string
        resource_type: string
        resource_id: string
      }>(
        `SELECT relation,resource_type,resource_id
           FROM domain_event_resources
          WHERE domain_event_id=$1
          ORDER BY relation,resource_type,resource_id`,
        [eventId],
      )).rows
    await expect(resources(workItemEventId)).resolves.toEqual([
      { relation: 'invalidate', resource_type: 'team', resource_id: team.id },
      { relation: 'invalidate', resource_type: 'work_item', resource_id: item.id },
      { relation: 'scope', resource_type: 'team', resource_id: team.id },
      { relation: 'scope', resource_type: 'work_item', resource_id: item.id },
      { relation: 'scope', resource_type: 'workspace', resource_id: workspace.id },
    ])
    await expect(resources(teamEventId)).resolves.toEqual([
      { relation: 'invalidate', resource_type: 'team', resource_id: team.id },
      { relation: 'scope', resource_type: 'team', resource_id: team.id },
      { relation: 'scope', resource_type: 'workspace', resource_id: workspace.id },
    ])
  })

  it('round-trips monetary bigint columns through Drizzle without number coercion', async () => {
    const suffix = randomUUID().replaceAll('-', '')
    const workspace = (await db.query<{ id: string }>(
      'INSERT INTO workspaces(name,slug) VALUES($1,$2) RETURNING id',
      [`Precision ${suffix}`, `precision-${suffix}`],
    )).rows[0]!
    const human = (await db.query<{ id: string }>(
      `INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash)
       VALUES($1,'human','admin',$2,'Precision owner','hash') RETURNING id`,
      [workspace.id, `${suffix}@example.test`],
    )).rows[0]!
    const team = (await db.query<{ id: string }>(
      'INSERT INTO teams(workspace_id,name,key) VALUES($1,$2,$3) RETURNING id',
      [workspace.id, `Precision ${suffix}`, `P${suffix.slice(0, 7)}`],
    )).rows[0]!
    const state = (await db.query<{ id: string }>(
      `INSERT INTO workflow_states(workspace_id,team_id,name,category,color,position)
       VALUES($1,$2,'Backlog','backlog','#000000',0) RETURNING id`,
      [workspace.id, team.id],
    )).rows[0]!
    const item = (await db.query<{ id: string }>(
      `INSERT INTO work_items(
         workspace_id,team_id,number,title,status_id,responsible_human_actor_id
       ) VALUES($1,$2,1,'Precision work',$3,$4) RETURNING id`,
      [workspace.id, team.id, state.id, human.id],
    )).rows[0]!
    const agentActor = (await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Precision agent') RETURNING id",
      [workspace.id],
    )).rows[0]!
    const agent = (await db.query<{ id: string }>(
      `INSERT INTO agent_definitions(
         workspace_id,actor_id,slug,display_name,supported_protocols,max_concurrency
       ) VALUES($1,$2,$3,'Precision agent',ARRAY['native_http']::agent_protocol[],1) RETURNING id`,
      [workspace.id, agentActor.id, `precision-agent-${suffix}`],
    )).rows[0]!
    const delegation = (await db.query<{ id: string }>(
      `INSERT INTO delegations(
         workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,
         role,scope_type,scope_id
       ) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6) RETURNING id`,
      [workspace.id, team.id, agent.id, agentActor.id, human.id, item.id],
    )).rows[0]!
    const session = (await db.query<{ id: string }>(
      `INSERT INTO agent_sessions(
         workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id
       ) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [workspace.id, team.id, agent.id, agentActor.id, delegation.id, item.id],
    )).rows[0]!
    const a2aEventId = await appendEvent(db, {
      workspaceId: workspace.id,
      teamId: team.id,
      actorId: human.id,
      correlationId: `sparse-a2a-parameters:${suffix}`,
      type: 'a2a.task.accepted',
      aggregateType: 'a2a_task',
      aggregateId: randomUUID(),
      sessionId: session.id,
      payload: { sessionId: session.id },
    })
    const a2aEvent = (await db.query<{ team_id: string }>(
      'SELECT team_id FROM domain_events WHERE id=$1',
      [a2aEventId],
    )).rows[0]
    expect(a2aEvent?.team_id).toBe(team.id)
    const a2aResources = await db.query<{ resource_type: string; resource_id: string }>(
      `SELECT resource_type,resource_id
         FROM domain_event_resources
        WHERE domain_event_id=$1 AND relation='scope'
          AND resource_type IN ('team','session')
        ORDER BY resource_type`,
      [a2aEventId],
    )
    expect(a2aResources.rows).toEqual([
      { resource_type: 'session', resource_id: session.id },
      { resource_type: 'team', resource_id: team.id },
    ])

    const orm = drizzle({ client: db })
    const precise = 9_007_199_254_740_993n
    const usageId = randomUUID()
    const policyId = randomUUID()
    await orm.insert(usageRecords).values({
      id: usageId,
      workspaceId: workspace.id,
      dedupeKey: `precision-${suffix}`,
      agentId: agent.id,
      sessionId: session.id,
      occurredAt: new Date(),
      costMinor: precise,
      currency: 'USD',
      costSource: 'manual',
      metadata: {},
      recordedAt: new Date(),
    })
    await orm.insert(budgetPolicies).values({
      id: policyId,
      workspaceId: workspace.id,
      scopeType: 'session',
      scopeId: session.id,
      currency: 'USD',
      softCostMinor: precise,
      hardCostMinor: precise + 1n,
      revision: 1,
      createdByActorId: human.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const [usage] = await orm.select({ costMinor: usageRecords.costMinor })
      .from(usageRecords)
      .where(eq(usageRecords.id, usageId))
    const [policy] = await orm.select({
      softCostMinor: budgetPolicies.softCostMinor,
      hardCostMinor: budgetPolicies.hardCostMinor,
    }).from(budgetPolicies).where(eq(budgetPolicies.id, policyId))
    expect(usage?.costMinor).toBe(precise)
    expect(typeof usage?.costMinor).toBe('bigint')
    expect(policy).toEqual({ softCostMinor: precise, hardCostMinor: precise + 1n })
  })
})
