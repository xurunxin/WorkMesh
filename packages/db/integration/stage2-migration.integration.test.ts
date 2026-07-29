import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, installWorkspace } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 2 migration integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 2 migration integration requires a dedicated *test* database.')

const db = createDb(databaseUrl)
const migrationPath = (file: string) => join(import.meta.dirname, '../migrations', file)

async function migrateFrom0001(): Promise<void> {
  await db.query('DROP SCHEMA public CASCADE')
  await db.query('CREATE SCHEMA public')
  await db.query(await readFile(migrationPath('0001_stage0.sql'), 'utf8'))
  await db.query('CREATE TABLE schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  await db.query("INSERT INTO schema_migrations(version) VALUES('0001_stage0')")
  await applyMigrations(db)
}

describe('Stage 2 migration chain and PostgreSQL constraints', () => {
  afterAll(async () => { await db.end() }, 300_000)

  it('upgrades a 0001 database through the current chain and enforces handoff and active-exclusive lease constraints', async () => {
    await migrateFrom0001()
    const versions = await db.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version')
    expect(versions.rows.map(row => row.version)).toEqual([
      '0001_stage0', '0002_stage0_integrity_delivery', '0003_stage1_agent_identity_delegation', '0004_stage1_session_execution', '0005_stage1_tokens_webhooks_events', '0006_stage1_review_fixes', '0007_stage2_work_rooms_leases_handoffs', '0008_stage3_delivery_control_plane', '0009_stage3_production_adapters', '0010_stage3_provider_projection_provenance', '0011_stage3_provider_review_projection', '0012_stage3_regate_fencing_and_decisions', '0013_stage3_audit_closure', '0014_provider_action_kinds', '0015_stage4_planning_views_templates', '0016_stage4_usage_notifications', '0017_stage4_automation_control_plane', '0018_stage4_loops_health_a2a', '0019_stage4_gitea', '0020_stage4_review_hardening', '0021_stage4_a2a_direction_and_prompt_identity', '0022_route_policy_authorization_denials', '0023_auth_idempotency_records', '0024_cursor_pagination_indexes', '0025_realtime_event_envelope', '0026_retention_archive_and_heartbeat_health', '0027_worker_runtime_identity', '0028_worker_identity_conflict_count', '0029_exact_archive_membership', '0030_durable_archive_upload_intents', '0031_agent_session_external_urls_shape',
    ])
    const tables = await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('work_room_channels','room_messages','leases','handoffs','routing_attempts','routing_records','context_deltas','decision_transition_consumptions') ORDER BY table_name")
    expect(tables.rows.map(row => row.table_name)).toEqual(['context_deltas', 'decision_transition_consumptions', 'handoffs', 'leases', 'room_messages', 'routing_attempts', 'routing_records', 'work_room_channels'])
    const installed = await installWorkspace(db, { workspaceName: 'Stage 2 migration', workspaceSlug: 'stage-2-migration', adminName: 'Admin', email: 'stage2-migration@example.test', password: 'password-acceptance' })
    const state = await db.query<{ id: string }>("SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog'", [installed.teamId])
    const item = await db.query<{ id: string }>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) VALUES($1,$2,1,'Migration constraints',$3,$4) RETURNING id", [installed.workspaceId, installed.teamId, state.rows[0]!.id, installed.actorId])
    const agentActor = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Migration agent') RETURNING id", [installed.workspaceId])
    const agent = await db.query<{ id: string }>("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,supported_protocols) VALUES($1,$2,'migration-agent','Migration agent',ARRAY['native_http']::agent_protocol[]) RETURNING id", [installed.workspaceId, agentActor.rows[0]!.id])
    const delegation = await db.query<{ id: string }>("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6) RETURNING id", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, installed.actorId, item.rows[0]!.id])
    const session = await db.query<{ id: string }>("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state) VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, delegation.rows[0]!.id, item.rows[0]!.id])

    await expect(db.query("INSERT INTO handoffs(workspace_id,from_session_id,summary,target_skill,target_agent_id) VALUES($1,$2,'invalid',NULL,NULL)", [installed.workspaceId, session.rows[0]!.id])).rejects.toThrow()
    await expect(db.query("INSERT INTO handoffs(workspace_id,from_session_id,summary,target_skill,target_agent_id) VALUES($1,$2,'invalid','skill',$3)", [installed.workspaceId, session.rows[0]!.id, agent.rows[0]!.id])).rejects.toThrow()
    const handoff = await db.query<{ id: string }>("INSERT INTO handoffs(workspace_id,from_session_id,summary,target_skill) VALUES($1,$2,'valid','review') RETURNING id", [installed.workspaceId, session.rows[0]!.id])
    await db.query("INSERT INTO routing_attempts(workspace_id,handoff_id,source_session_id,attempt_key,requested_skill,candidate_count,outcome,failure_code,rationale) VALUES($1,$2,$3,'attempt-1','review',0,'no_candidate','ROUTING_TARGET_REQUIRED',$4)", [installed.workspaceId, handoff.rows[0]!.id, session.rows[0]!.id, { filters: ['skill', 'capability', 'access', 'concurrency'] }])
    await expect(db.query("INSERT INTO routing_attempts(workspace_id,handoff_id,source_session_id,attempt_key,candidate_count,outcome) VALUES($1,$2,$3,'attempt-1',0,'no_candidate')", [installed.workspaceId, handoff.rows[0]!.id, session.rows[0]!.id])).rejects.toThrow()
    await expect(db.query("UPDATE routing_attempts SET failure_code='CHANGED' WHERE handoff_id=$1", [handoff.rows[0]!.id])).rejects.toThrow(/IMMUTABLE_STAGE2_FACT/)
    const proposedDecision = await db.query<{ id: string }>("INSERT INTO decisions(workspace_id,work_item_id,proposed_by_actor_id,title,rationale,status) VALUES($1,$2,$3,'Proposal','Initial rationale','proposed') RETURNING id", [installed.workspaceId, item.rows[0]!.id, agentActor.rows[0]!.id])
    const derivedDecision = await db.query<{ id: string }>("INSERT INTO decisions(workspace_id,work_item_id,proposed_by_actor_id,finalized_by_actor_id,title,rationale,status,finalized_at) VALUES($1,$2,$3,$4,'Final','Final rationale','final',now()) RETURNING id", [installed.workspaceId, item.rows[0]!.id, installed.actorId, installed.actorId])
    await db.query("INSERT INTO decision_transition_consumptions(target_decision_id,transition_type,derived_decision_id,consumed_by_actor_id) VALUES($1,'finalize',$2,$3)", [proposedDecision.rows[0]!.id, derivedDecision.rows[0]!.id, installed.actorId])
    const alternateDerived = await db.query<{ id: string }>("INSERT INTO decisions(workspace_id,work_item_id,proposed_by_actor_id,finalized_by_actor_id,title,rationale,status,finalized_at) VALUES($1,$2,$3,$4,'Alternate','Alternate rationale','final',now()) RETURNING id", [installed.workspaceId, item.rows[0]!.id, installed.actorId, installed.actorId])
    await expect(db.query("INSERT INTO decision_transition_consumptions(target_decision_id,transition_type,derived_decision_id,consumed_by_actor_id) VALUES($1,'reverse',$2,$3)", [proposedDecision.rows[0]!.id, alternateDerived.rows[0]!.id, installed.actorId])).rejects.toThrow()
    await expect(db.query("UPDATE decision_transition_consumptions SET transition_type='reverse' WHERE target_decision_id=$1", [proposedDecision.rows[0]!.id])).rejects.toThrow(/IMMUTABLE_STAGE2_FACT/)

    const resourceId = crypto.randomUUID()
    await db.query("INSERT INTO leases(workspace_id,session_id,resource_type,resource_id,kind,reason,expires_at) VALUES($1,$2,'plan_step',$3,'exclusive','first',now()+interval '1 minute')", [installed.workspaceId, session.rows[0]!.id, resourceId])
    await expect(db.query("INSERT INTO leases(workspace_id,session_id,resource_type,resource_id,kind,reason,expires_at) VALUES($1,$2,'plan_step',$3,'exclusive','duplicate',now()+interval '1 minute')", [installed.workspaceId, session.rows[0]!.id, resourceId])).rejects.toThrow()
    await db.query("UPDATE leases SET status='released',released_at=now() WHERE workspace_id=$1 AND resource_id=$2", [installed.workspaceId, resourceId])
    await expect(db.query("INSERT INTO leases(workspace_id,session_id,resource_type,resource_id,kind,reason,expires_at) VALUES($1,$2,'plan_step',$3,'exclusive','reacquired',now()+interval '1 minute')", [installed.workspaceId, session.rows[0]!.id, resourceId])).resolves.toBeDefined()
    const partialIndex = await db.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='leases_active_exclusive_resource'")
    expect(partialIndex.rows[0]!.indexdef).toContain("WHERE ((status = 'active'::lease_status) AND (kind = 'exclusive'::lease_kind))")
  }, 300_000)
})
