import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createAdmin, createDb, installWorkspace, type Db } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Database integration tests require RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Database integration tests require DATABASE_URL to name a dedicated test database.')

const db = createDb(databaseUrl)
const migrationPath = (file: string) => join(import.meta.dirname, '../migrations', file)

const recreatePublicSchema = async (): Promise<void> => {
  await db.query('DROP SCHEMA public CASCADE')
  await db.query('CREATE SCHEMA public')
}
const migrateClean = async (): Promise<void> => {
  await recreatePublicSchema()
  await applyMigrations(db)
}
const install = async () => await installWorkspace(db, { workspaceName: 'Acceptance', workspaceSlug: 'acceptance', adminName: 'Alice', email: 'alice@example.test', password: 'password-acceptance' })
const insertForeignWorkspace = async (db: Db) => {
  const workspace = await db.query<{ id: string }>("INSERT INTO workspaces(name,slug) VALUES('Other','other') RETURNING id")
  const workspaceId = workspace.rows[0]!.id
  const actor = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','member','other@example.test','Other','hash') RETURNING id", [workspaceId])
  const team = await db.query<{ id: string }>("INSERT INTO teams(workspace_id,name,key) VALUES($1,'Other','OTH') RETURNING id", [workspaceId])
  const state = await db.query<{ id: string }>("INSERT INTO workflow_states(workspace_id,team_id,name,category) VALUES($1,$2,'Todo','backlog') RETURNING id", [workspaceId, team.rows[0]!.id])
  return { workspaceId, actorId: actor.rows[0]!.id, teamId: team.rows[0]!.id, stateId: state.rows[0]!.id }
}

describe('Stage 0 PostgreSQL integrity and delivery acceptance', () => {
  beforeAll(async () => {
    await migrateClean()
  }, 120_000)

  afterAll(async () => {
    await db.end()
  }, 120_000)

  it('applies the numbered migration chain to a clean database', async () => {
    const versions = await db.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version')
    expect(versions.rows.map(row => row.version)).toEqual(['0001_stage0', '0002_stage0_integrity_delivery', '0003_stage1_agent_identity_delegation', '0004_stage1_session_execution', '0005_stage1_tokens_webhooks_events', '0006_stage1_review_fixes', '0007_stage2_work_rooms_leases_handoffs', '0008_stage3_delivery_control_plane', '0009_stage3_production_adapters', '0010_stage3_provider_projection_provenance', '0011_stage3_provider_review_projection', '0012_stage3_regate_fencing_and_decisions', '0013_stage3_audit_closure', '0014_provider_action_kinds', '0015_stage4_planning_views_templates', '0016_stage4_usage_notifications', '0017_stage4_automation_control_plane', '0018_stage4_loops_health_a2a', '0019_stage4_gitea', '0020_stage4_review_hardening', '0021_stage4_a2a_direction_and_prompt_identity', '0022_route_policy_authorization_denials', '0023_auth_idempotency_records', '0024_cursor_pagination_indexes', '0025_realtime_event_envelope', '0026_retention_archive_and_heartbeat_health', '0027_agent_inbox_receipts'])
    const tables = await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('agent_definitions','agent_sessions','agent_webhook_deliveries','approvals','context_snapshots','inbox_items') ORDER BY table_name")
    expect(tables.rows.map(table => table.table_name)).toEqual(['agent_definitions', 'agent_sessions', 'agent_webhook_deliveries', 'approvals', 'context_snapshots', 'inbox_items'])
  }, 120_000)

  it('upgrades 0005 data with workspace-scoped context hashes and retry links', async () => {
    await recreatePublicSchema()
    await db.query('CREATE TABLE schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const preReviewMigrations = [
      '0001_stage0.sql',
      '0002_stage0_integrity_delivery.sql',
      '0003_stage1_agent_identity_delegation.sql',
      '0004_stage1_session_execution.sql',
      '0005_stage1_tokens_webhooks_events.sql',
    ]
    for (const file of preReviewMigrations) {
      await db.query(await readFile(migrationPath(file), 'utf8'))
      await db.query('INSERT INTO schema_migrations(version) VALUES($1)', [file.replace(/\.sql$/, '')])
    }
    const firstWorkspace = await db.query<{ id: string }>("INSERT INTO workspaces(name,slug) VALUES('Hash One','hash-one') RETURNING id")
    const secondWorkspace = await db.query<{ id: string }>("INSERT INTO workspaces(name,slug) VALUES('Hash Two','hash-two') RETURNING id")
    await db.query("INSERT INTO context_snapshots(workspace_id,manifest,content_hash) VALUES($1,'{}','sha256:shared')", [firstWorkspace.rows[0]!.id])

    await applyMigrations(db)

    await expect(db.query("INSERT INTO context_snapshots(workspace_id,manifest,content_hash) VALUES($1,'{}','sha256:shared')", [secondWorkspace.rows[0]!.id])).resolves.toBeDefined()
    await expect(db.query("INSERT INTO context_snapshots(workspace_id,manifest,content_hash) VALUES($1,'{}','sha256:shared')", [firstWorkspace.rows[0]!.id])).rejects.toThrow()
    const installed = await install()
    const state = await db.query<{ id: string }>("SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog'", [installed.teamId])
    const item = await db.query<{ id: string }>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id) VALUES($1,$2,1,'Retry work',$3) RETURNING id", [installed.workspaceId, installed.teamId, state.rows[0]!.id])
    const agentActor = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Retry runner') RETURNING id", [installed.workspaceId])
    const agent = await db.query<{ id: string }>("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,supported_protocols,max_concurrency) VALUES($1,$2,'retry-runner','Retry runner',ARRAY['native_http']::agent_protocol[],1) RETURNING id", [installed.workspaceId, agentActor.rows[0]!.id])
    const delegation = await db.query<{ id: string }>("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6) RETURNING id", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, installed.actorId, item.rows[0]!.id])
    const original = await db.query<{ id: string }>("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, delegation.rows[0]!.id, item.rows[0]!.id])
    const retry = await db.query<{ retry_of_session_id: string; retry_reason: string; retry_count: number }>("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,retry_of_session_id,retry_reason,retry_count) VALUES($1,$2,$3,$4,$5,$6,$7,'transient failure',1) RETURNING retry_of_session_id,retry_reason,retry_count", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, delegation.rows[0]!.id, item.rows[0]!.id, original.rows[0]!.id])
    expect(retry.rows[0]).toEqual({ retry_of_session_id: original.rows[0]!.id, retry_reason: 'transient failure', retry_count: 1 })
    await expect(db.query("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,retry_count) VALUES($1,$2,$3,$4,$5,$6,-1)", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, delegation.rows[0]!.id, item.rows[0]!.id])).rejects.toThrow()
    const selfRetryId = crypto.randomUUID()
    await expect(db.query("INSERT INTO agent_sessions(id,workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,retry_of_session_id,retry_count) VALUES($1,$2,$3,$4,$5,$6,$7,$1,1)", [selfRetryId, installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, delegation.rows[0]!.id, item.rows[0]!.id])).rejects.toThrow()
  }, 120_000)

  it('upgrades representative 0001 data to workspace-scoped records and normalized mentions', async () => {
    await recreatePublicSchema()
    await db.query(await readFile(migrationPath('0001_stage0.sql'), 'utf8'))
    await db.query('CREATE TABLE schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    await db.query("INSERT INTO schema_migrations(version) VALUES('0001_stage0')")
    const workspace = await db.query<{ id: string }>("INSERT INTO workspaces(name,slug) VALUES('Legacy','legacy') RETURNING id")
    const workspaceId = workspace.rows[0]!.id
    const actor = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,email,display_name,password_hash) VALUES($1,'human','legacy@example.test','Legacy','hash') RETURNING id", [workspaceId])
    const team = await db.query<{ id: string }>("INSERT INTO teams(workspace_id,name,key) VALUES($1,'Legacy','LEG') RETURNING id", [workspaceId])
    await db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'admin')", [workspaceId, team.rows[0]!.id, actor.rows[0]!.id])
    const state = await db.query<{ id: string }>("INSERT INTO workflow_states(team_id,name,category) VALUES($1,'Todo','backlog') RETURNING id", [team.rows[0]!.id])
    const item = await db.query<{ id: string }>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id) VALUES($1,$2,1,'Legacy item',$3) RETURNING id", [workspaceId, team.rows[0]!.id, state.rows[0]!.id])
    const channel = await db.query<{ id: string }>('INSERT INTO channels(workspace_id,work_item_id) VALUES($1,$2) RETURNING id', [workspaceId, item.rows[0]!.id])
    const comment = await db.query<{ id: string }>('INSERT INTO comments(channel_id,author_actor_id,body,mentions) VALUES($1,$2,$3,$4) RETURNING id', [channel.rows[0]!.id, actor.rows[0]!.id, 'Legacy comment', [actor.rows[0]!.id]])
    await applyMigrations(db)
    const upgraded = await db.query<{ workspace_role: string; comment_workspace_id: string; mention_count: number; system_kind: string }>(`SELECT a.workspace_role,c.workspace_id AS comment_workspace_id,(SELECT count(*)::int FROM comment_mentions cm WHERE cm.comment_id=c.id) AS mention_count,s.kind AS system_kind FROM actors a JOIN comments c ON c.author_actor_id=a.id JOIN platform_installation p ON p.workspace_id=a.workspace_id JOIN actors s ON s.id=p.system_actor_id WHERE c.id=$1`, [comment.rows[0]!.id])
    expect(upgraded.rows[0]).toMatchObject({ workspace_role: 'admin', comment_workspace_id: workspaceId, mention_count: 1, system_kind: 'service' })
  }, 300_000)

  it('rejects cross-workspace references, agent mentions, and cross-channel comment threads', async () => {
    await migrateClean()
    const installed = await install()
    const other = await insertForeignWorkspace(db)
    await expect(db.query("INSERT INTO work_items(workspace_id,team_id,number,title,status_id) VALUES($1,$2,1,'Invalid',$3)", [installed.workspaceId, other.teamId, other.stateId])).rejects.toThrow()
    const item = await db.query<{ id: string }>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id) VALUES($1,$2,1,'Valid',$3) RETURNING id", [installed.workspaceId, installed.teamId, (await db.query<{ id: string }>("SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog'", [installed.teamId])).rows[0]!.id])
    const firstChannel = await db.query<{ id: string }>('INSERT INTO channels(workspace_id,work_item_id) VALUES($1,$2) RETURNING id', [installed.workspaceId, item.rows[0]!.id])
    const root = await db.query<{ id: string }>('INSERT INTO comments(workspace_id,channel_id,author_actor_id,body) VALUES($1,$2,$3,$4) RETURNING id', [installed.workspaceId, firstChannel.rows[0]!.id, installed.actorId, 'Root'])
    const otherItem = await db.query<{ id: string }>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id) VALUES($1,$2,2,'Second',$3) RETURNING id", [installed.workspaceId, installed.teamId, (await db.query<{ id: string }>("SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog'", [installed.teamId])).rows[0]!.id])
    const secondChannel = await db.query<{ id: string }>('INSERT INTO channels(workspace_id,work_item_id) VALUES($1,$2) RETURNING id', [installed.workspaceId, otherItem.rows[0]!.id])
    await expect(db.query('INSERT INTO comments(workspace_id,channel_id,author_actor_id,parent_comment_id,body) VALUES($1,$2,$3,$4,$5)', [installed.workspaceId, secondChannel.rows[0]!.id, installed.actorId, root.rows[0]!.id, 'Invalid thread'])).rejects.toThrow()
    const agent = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Agent') RETURNING id", [installed.workspaceId])
    await expect(db.query('INSERT INTO comment_mentions(workspace_id,comment_id,actor_id) VALUES($1,$2,$3)', [installed.workspaceId, root.rows[0]!.id, agent.rows[0]!.id])).rejects.toThrow('COMMENT_MENTION_REQUIRES_HUMAN_ACTOR')
    await expect(db.query('INSERT INTO comment_mentions(workspace_id,comment_id,actor_id) VALUES($1,$2,$3)', [installed.workspaceId, root.rows[0]!.id, installed.actorId])).resolves.toBeDefined()
  }, 120_000)

  it('allows only one concurrent installation and records bootstrap with the service actor', async () => {
    await migrateClean()
    const results = await Promise.allSettled([
      installWorkspace(db, { workspaceName: 'One', workspaceSlug: 'one', adminName: 'One', email: 'one@example.test', password: 'password-acceptance' }),
      installWorkspace(db, { workspaceName: 'Two', workspaceSlug: 'two', adminName: 'Two', email: 'two@example.test', password: 'password-acceptance' }),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    const installation = await db.query<{ system_actor_id: string; kind: string; event_actor_id: string }>('SELECT p.system_actor_id,a.kind,e.actor_id AS event_actor_id FROM platform_installation p JOIN actors a ON a.id=p.system_actor_id JOIN domain_events e ON e.workspace_id=p.workspace_id WHERE e.event_type=$1', ['workspace.installed'])
    expect(installation.rows[0]).toMatchObject({ kind: 'service', event_actor_id: installation.rows[0]!.system_actor_id })
  }, 120_000)

  it('creates an admin, event, and outbox atomically and rejects a duplicate without an extra event', async () => {
    await migrateClean()
    const installed = await install()
    const created = await createAdmin(db, { email: 'bob@example.test', password: 'password-acceptance', displayName: 'Bob' })
    const event = await db.query<{ actor_id: string; kind: string; outbox_count: number }>(`SELECT e.actor_id,a.kind,(SELECT count(*)::int FROM outbox_events o WHERE o.domain_event_id=e.id) AS outbox_count FROM domain_events e JOIN platform_installation p ON p.workspace_id=e.workspace_id JOIN actors a ON a.id=e.actor_id WHERE e.aggregate_id=$1 AND e.event_type='workspace.admin_created'`, [created.actorId])
    expect(event.rows[0]).toMatchObject({ kind: 'service', outbox_count: 1 })
    const before = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM domain_events WHERE event_type='workspace.admin_created'")
    await expect(createAdmin(db, { email: 'bob@example.test', password: 'password-acceptance', displayName: 'Duplicate' })).rejects.toThrow()
    const after = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM domain_events WHERE event_type='workspace.admin_created'")
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count)
    const membership = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM memberships WHERE workspace_id=$1 AND actor_id=$2', [installed.workspaceId, created.actorId])
    expect(membership.rows[0]!.count).toBeGreaterThan(0)
  }, 120_000)

  it('enforces the eight-attempt outbox ceiling', async () => {
    const outbox = await db.query<{ id: string }>('SELECT id FROM outbox_events LIMIT 1')
    await expect(db.query('UPDATE outbox_events SET attempt_count=9 WHERE id=$1', [outbox.rows[0]!.id])).rejects.toThrow()
  })

  it('enforces Stage 1 team scope, the active executor boundary, and immutable execution facts', async () => {
    await migrateClean()
    const installed = await install()
    const state = await db.query<{ id: string }>("SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog'", [installed.teamId])
    const item = await db.query<{ id: string }>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) VALUES($1,$2,1,'Agent work',$3,$4) RETURNING id", [installed.workspaceId, installed.teamId, state.rows[0]!.id, installed.actorId])
    const agentActor = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Runner') RETURNING id", [installed.workspaceId])
    const agent = await db.query<{ id: string }>("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,supported_protocols,requested_capabilities,approved_capabilities,max_concurrency) VALUES($1,$2,'runner','Runner',ARRAY['native_http']::agent_protocol[],ARRAY['work:read','work:write'],ARRAY['work:read','work:write'],1) RETURNING id", [installed.workspaceId, agentActor.rows[0]!.id])
    const otherTeam = await db.query<{ id: string }>("INSERT INTO teams(workspace_id,name,key) VALUES($1,'Other','OTH') RETURNING id", [installed.workspaceId])
    await expect(db.query("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6)", [installed.workspaceId, otherTeam.rows[0]!.id, agent.rows[0]!.id, agentActor.rows[0]!.id, installed.actorId, item.rows[0]!.id])).rejects.toThrow()
    const delegation = await db.query<{ id: string }>("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6) RETURNING id", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, installed.actorId, item.rows[0]!.id])
    await expect(db.query("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6)", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, installed.actorId, item.rows[0]!.id])).rejects.toThrow()
    const context = await db.query<{ id: string }>("INSERT INTO context_snapshots(workspace_id,work_item_id,manifest,content_hash,created_by_actor_id) VALUES($1,$2,'{}',$3,$4) RETURNING id", [installed.workspaceId, item.rows[0]!.id, `sha256:${crypto.randomUUID()}`, installed.actorId])
    await expect(db.query("UPDATE context_snapshots SET manifest='{\"changed\":true}' WHERE id=$1", [context.rows[0]!.id])).rejects.toThrow('IMMUTABLE_STAGE1_FACT')
    const session = await db.query<{ id: string }>("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,context_snapshot_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, delegation.rows[0]!.id, item.rows[0]!.id, context.rows[0]!.id])
    const plan = await db.query<{ id: string }>("INSERT INTO agent_plan_versions(session_id,revision,change_summary,author_actor_id) VALUES($1,1,'Initial',$2) RETURNING id", [session.rows[0]!.id, agentActor.rows[0]!.id])
    await db.query("INSERT INTO agent_plan_steps(plan_version_id,id,title,ordinal) VALUES($1,gen_random_uuid(),'Run checks',0)", [plan.rows[0]!.id])
    await expect(db.query("UPDATE agent_plan_versions SET change_summary='Mutated' WHERE id=$1", [plan.rows[0]!.id])).rejects.toThrow('IMMUTABLE_STAGE1_FACT')
    await db.query("INSERT INTO agent_activities(session_id,actor_id,sequence,kind,summary) VALUES($1,$2,1,'ack','Accepted')", [session.rows[0]!.id, agentActor.rows[0]!.id])
    await expect(db.query("INSERT INTO agent_activities(session_id,actor_id,sequence,kind,summary) VALUES($1,$2,1,'ack','Duplicate')", [session.rows[0]!.id, agentActor.rows[0]!.id])).rejects.toThrow()
  })

  it('enforces one-time token exchange and webhook replay deduplication', async () => {
    await migrateClean()
    const installed = await install()
    const state = await db.query<{ id: string }>("SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog'", [installed.teamId])
    const item = await db.query<{ id: string }>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id) VALUES($1,$2,1,'Token work',$3) RETURNING id", [installed.workspaceId, installed.teamId, state.rows[0]!.id])
    const agentActor = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Token runner') RETURNING id", [installed.workspaceId])
    const agent = await db.query<{ id: string }>("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,supported_protocols,max_concurrency) VALUES($1,$2,'token-runner','Token runner',ARRAY['native_http']::agent_protocol[],1) RETURNING id", [installed.workspaceId, agentActor.rows[0]!.id])
    const delegation = await db.query<{ id: string }>("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6) RETURNING id", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, installed.actorId, item.rows[0]!.id])
    const session = await db.query<{ id: string }>("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, delegation.rows[0]!.id, item.rows[0]!.id])
    const installationToken = await db.query<{ id: string }>("INSERT INTO agent_installation_tokens(agent_id,token_hash) VALUES($1,'installation-token') RETURNING id", [agent.rows[0]!.id])
    await db.query("INSERT INTO agent_session_tokens(session_id,agent_id,installation_token_id,token_hash,exchange_nonce_hash,expires_at) VALUES($1,$2,$3,'token-one','nonce-one',now()+interval '5 minutes')", [session.rows[0]!.id, agent.rows[0]!.id, installationToken.rows[0]!.id])
    await expect(db.query("INSERT INTO agent_session_tokens(session_id,agent_id,installation_token_id,token_hash,exchange_nonce_hash,expires_at) VALUES($1,$2,$3,'token-two','nonce-two',now()+interval '5 minutes')", [session.rows[0]!.id, agent.rows[0]!.id, installationToken.rows[0]!.id])).rejects.toThrow()
    const endpoint = await db.query<{ id: string }>("INSERT INTO agent_webhook_endpoints(agent_id,url) VALUES($1,'https://agent.example.test/webhook') RETURNING id", [agent.rows[0]!.id])
    await db.query("INSERT INTO agent_webhook_secrets(endpoint_id,version,secret_ciphertext,iv,auth_tag,key_version) VALUES($1,1,$2,$3,$4,'v1')", [endpoint.rows[0]!.id, Buffer.from('ciphertext'), Buffer.alloc(12), Buffer.alloc(16)])
    await db.query("INSERT INTO agent_webhook_deliveries(agent_id,endpoint_id,secret_version,delivery_id,event_type,session_id) VALUES($1,$2,1,'delivery-1','agent.session.created',$3)", [agent.rows[0]!.id, endpoint.rows[0]!.id, session.rows[0]!.id])
    await expect(db.query("INSERT INTO agent_webhook_deliveries(agent_id,endpoint_id,secret_version,delivery_id,event_type,session_id) VALUES($1,$2,1,'delivery-1','agent.session.created',$3)", [agent.rows[0]!.id, endpoint.rows[0]!.id, session.rows[0]!.id])).rejects.toThrow()
  })
})
