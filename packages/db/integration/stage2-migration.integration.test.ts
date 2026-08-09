import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, installWorkspace } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 2 migration integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 2 migration integration requires a dedicated *test* database.')

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

describe('Stage 2 migration chain and PostgreSQL constraints', () => {
  afterAll(async () => { await db.end() }, 300_000)

  it('upgrades an applied 0032 receipt trigger through 0035 with actor-, Session-, and source-bound replies', async () => {
    await migrateFrom0001(32)
    expect((await db.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')).rows[0]!.version).toBe('0032_agent_inbox_receipts')
    const installed = await installWorkspace(db, { workspaceName: 'Receipt upgrade', workspaceSlug: 'receipt-upgrade', adminName: 'Upgrade Admin', email: 'receipt-upgrade@example.test', password: 'password-acceptance' })
    const state = await db.query<{ id: string }>("SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog'", [installed.teamId])
    const item = await db.query<{ id: string }>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) VALUES($1,$2,1,'Receipt upgrade',$3,$4) RETURNING id", [installed.workspaceId, installed.teamId, state.rows[0]!.id, installed.actorId])
    const recipientActor = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Receipt recipient') RETURNING id", [installed.workspaceId])
    const recipientAgent = await db.query<{ id: string }>("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,supported_protocols) VALUES($1,$2,'receipt-recipient','Receipt recipient',ARRAY['native_http']::agent_protocol[]) RETURNING id", [installed.workspaceId, recipientActor.rows[0]!.id])
    const recipientDelegation = await db.query<{ id: string }>("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6) RETURNING id", [installed.workspaceId, installed.teamId, recipientAgent.rows[0]!.id, recipientActor.rows[0]!.id, installed.actorId, item.rows[0]!.id])
    const recipientSession = await db.query<{ id: string }>("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state) VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id", [installed.workspaceId, installed.teamId, recipientAgent.rows[0]!.id, recipientActor.rows[0]!.id, recipientDelegation.rows[0]!.id, item.rows[0]!.id])
    const foreignActor = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Foreign reply author') RETURNING id", [installed.workspaceId])
    const foreignAgent = await db.query<{ id: string }>("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,supported_protocols) VALUES($1,$2,'foreign-reply-author','Foreign reply author',ARRAY['native_http']::agent_protocol[]) RETURNING id", [installed.workspaceId, foreignActor.rows[0]!.id])
    const foreignDelegation = await db.query<{ id: string }>("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id) VALUES($1,$2,$3,$4,$5,$6,'reviewer','work_item',$6) RETURNING id", [installed.workspaceId, installed.teamId, foreignAgent.rows[0]!.id, foreignActor.rows[0]!.id, installed.actorId, item.rows[0]!.id])
    const foreignSession = await db.query<{ id: string }>("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state) VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id", [installed.workspaceId, installed.teamId, foreignAgent.rows[0]!.id, foreignActor.rows[0]!.id, foreignDelegation.rows[0]!.id, item.rows[0]!.id])
    const channel = await db.query<{ id: string }>("INSERT INTO work_room_channels(workspace_id,subject_kind,subject_id,team_id) VALUES($1,'work_item',$2,$3) RETURNING id", [installed.workspaceId, item.rows[0]!.id, installed.teamId])
    const sourceMessage = await db.query<{ id: string }>("INSERT INTO room_messages(channel_id,workspace_id,author_actor_id,intent,recipient_actor_id,body,requires_response) VALUES($1,$2,$3,'ask',$4,'Upgrade source',true) RETURNING id", [channel.rows[0]!.id, installed.workspaceId, installed.actorId, recipientActor.rows[0]!.id])
    const inboxItem = await db.query<{ id: string }>("INSERT INTO inbox_items(workspace_id,recipient_actor_id,recipient_session_id,team_id,kind,source_type,source_id,source_room_message_id,requires_response) VALUES($1,$2,$3,$4,'mention','room_message',$5,$5,true) RETURNING id", [installed.workspaceId, recipientActor.rows[0]!.id, recipientSession.rows[0]!.id, installed.teamId, sourceMessage.rows[0]!.id])
    const legacyHuman = await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','member','legacy-recipient@example.test','Legacy recipient','unused') RETURNING id",
      [installed.workspaceId],
    )
    await db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'member')", [installed.workspaceId, installed.teamId, legacyHuman.rows[0]!.id])
    const legacyActivity = await db.query<{ id: string }>(
      `INSERT INTO inbox_items(
         workspace_id,recipient_human_actor_id,session_id,kind,source_type,
         source_id,payload
       ) VALUES($1,$2,$3,'waiting_input','activity',$4,$5)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [installed.workspaceId, legacyHuman.rows[0]!.id, recipientSession.rows[0]!.id, crypto.randomUUID(), { summary: 'Pre-0032 activity producer' }],
    )
    const legacyRoomMessage = await db.query<{ id: string }>(
      `INSERT INTO inbox_items(
         workspace_id,recipient_human_actor_id,session_id,kind,source_type,
         source_id,payload
       ) VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(workspace_id,recipient_human_actor_id,kind,source_type,source_id)
       DO NOTHING
       RETURNING id`,
      [installed.workspaceId, legacyHuman.rows[0]!.id, null, 'waiting_input', 'room_message', sourceMessage.rows[0]!.id, { summary: 'Pre-0032 room producer' }],
    )
    const acceptedBy0032 = await db.query<{ id: string }>("INSERT INTO room_messages(channel_id,workspace_id,author_actor_id,session_id,intent,reply_to_message_id,body) VALUES($1,$2,$3,$4,'inform',$5,'Accepted only by old 0032 scope') RETURNING id", [channel.rows[0]!.id, installed.workspaceId, foreignActor.rows[0]!.id, foreignSession.rows[0]!.id, sourceMessage.rows[0]!.id])
    await expect(db.query("INSERT INTO inbox_item_receipts(inbox_item_id,workspace_id,actor_id,session_id,kind,reply_message_id,correlation_id,idempotency_key) VALUES($1,$2,$3,$4,'replied',$5,'old-0032','old-0032')", [inboxItem.rows[0]!.id, installed.workspaceId, recipientActor.rows[0]!.id, recipientSession.rows[0]!.id, acceptedBy0032.rows[0]!.id])).resolves.toBeDefined()

    await applyMigrations(db, { through: 35 })
    expect((await db.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')).rows[0]!.version).toBe('0035_decision_session_provenance')
    expect((await db.query<{
      id: string
      recipient_actor_id: string
      team_id: string
      source_room_message_id: string | null
    }>(
      `SELECT id,recipient_actor_id,team_id,source_room_message_id
         FROM inbox_items
        WHERE id=ANY($1::uuid[])
        ORDER BY id`,
      [[legacyActivity.rows[0]!.id, legacyRoomMessage.rows[0]!.id]],
    )).rows).toEqual([
      {
        id: legacyActivity.rows[0]!.id,
        recipient_actor_id: legacyHuman.rows[0]!.id,
        team_id: installed.teamId,
        source_room_message_id: null,
      },
      {
        id: legacyRoomMessage.rows[0]!.id,
        recipient_actor_id: legacyHuman.rows[0]!.id,
        team_id: installed.teamId,
        source_room_message_id: sourceMessage.rows[0]!.id,
      },
    ].sort((left, right) => left.id.localeCompare(right.id)))

    const foreignReply = await db.query<{ id: string }>("INSERT INTO room_messages(channel_id,workspace_id,author_actor_id,session_id,intent,reply_to_message_id,body) VALUES($1,$2,$3,$4,'inform',$5,'Rejected foreign reply after 0028') RETURNING id", [channel.rows[0]!.id, installed.workspaceId, foreignActor.rows[0]!.id, foreignSession.rows[0]!.id, sourceMessage.rows[0]!.id])
    await expect(db.query("INSERT INTO inbox_item_receipts(inbox_item_id,workspace_id,actor_id,session_id,kind,reply_message_id,correlation_id,idempotency_key) VALUES($1,$2,$3,$4,'replied',$5,'new-foreign','new-foreign')", [inboxItem.rows[0]!.id, installed.workspaceId, recipientActor.rows[0]!.id, recipientSession.rows[0]!.id, foreignReply.rows[0]!.id])).rejects.toThrow(/INBOX_REPLY_MESSAGE_SCOPE_MISMATCH/)
    const unrelatedReply = await db.query<{ id: string }>("INSERT INTO room_messages(channel_id,workspace_id,author_actor_id,session_id,intent,body) VALUES($1,$2,$3,$4,'inform','Unrelated recipient message') RETURNING id", [channel.rows[0]!.id, installed.workspaceId, recipientActor.rows[0]!.id, recipientSession.rows[0]!.id])
    await expect(db.query("INSERT INTO inbox_item_receipts(inbox_item_id,workspace_id,actor_id,session_id,kind,reply_message_id,correlation_id,idempotency_key) VALUES($1,$2,$3,$4,'replied',$5,'new-unrelated','new-unrelated')", [inboxItem.rows[0]!.id, installed.workspaceId, recipientActor.rows[0]!.id, recipientSession.rows[0]!.id, unrelatedReply.rows[0]!.id])).rejects.toThrow(/INBOX_REPLY_MESSAGE_SCOPE_MISMATCH/)
    const validReply = await db.query<{ id: string }>("INSERT INTO room_messages(channel_id,workspace_id,author_actor_id,session_id,intent,reply_to_message_id,body) VALUES($1,$2,$3,$4,'inform',$5,'Valid recipient reply') RETURNING id", [channel.rows[0]!.id, installed.workspaceId, recipientActor.rows[0]!.id, recipientSession.rows[0]!.id, sourceMessage.rows[0]!.id])
    await expect(db.query("INSERT INTO inbox_item_receipts(inbox_item_id,workspace_id,actor_id,session_id,kind,reply_message_id,correlation_id,idempotency_key) VALUES($1,$2,$3,$4,'replied',$5,'new-valid','new-valid')", [inboxItem.rows[0]!.id, installed.workspaceId, recipientActor.rows[0]!.id, recipientSession.rows[0]!.id, validReply.rows[0]!.id])).resolves.toBeDefined()
  }, 300_000)

  it('upgrades real 0026 Inbox rows through 0030, accepts legacy producers, and enforces collaboration constraints', async () => {
    await migrateFrom0001(26)
    const legacy = await installWorkspace(db, { workspaceName: 'Legacy Inbox', workspaceSlug: 'legacy-inbox', adminName: 'Legacy Admin', email: 'legacy-inbox@example.test', password: 'password-acceptance' })
    const legacySourceId = crypto.randomUUID()
    const legacyRow = await db.query<{ id: string }>(
      `INSERT INTO inbox_items(
         workspace_id,recipient_human_actor_id,kind,source_type,source_id,payload
       ) VALUES($1,$2,'waiting_input','activity',$3,'{}'::jsonb)
       RETURNING id`,
      [legacy.workspaceId, legacy.actorId, legacySourceId],
    )

    await applyMigrations(db, { through: 35 })

    expect((await db.query<{ recipient_actor_id: string }>(
      'SELECT recipient_actor_id FROM inbox_items WHERE id=$1',
      [legacyRow.rows[0]!.id],
    )).rows[0]?.recipient_actor_id).toBe(legacy.actorId)
    const rollingInsert = await db.query<{
      recipient_actor_id: string
      recipient_human_actor_id: string
    }>(
      `INSERT INTO inbox_items(
         workspace_id,recipient_human_actor_id,kind,source_type,source_id,payload
       ) VALUES($1,$2,'waiting_input','activity',$3,'{}'::jsonb)
       RETURNING recipient_actor_id,recipient_human_actor_id`,
      [legacy.workspaceId, legacy.actorId, crypto.randomUUID()],
    )
    expect(rollingInsert.rows[0]).toEqual({
      recipient_actor_id: legacy.actorId,
      recipient_human_actor_id: legacy.actorId,
    })
    const versions = await db.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version')
    expect(versions.rows.map(row => row.version)).toEqual([
      '0001_stage0', '0002_stage0_integrity_delivery', '0003_stage1_agent_identity_delegation', '0004_stage1_session_execution', '0005_stage1_tokens_webhooks_events', '0006_stage1_review_fixes', '0007_stage2_work_rooms_leases_handoffs', '0008_stage3_delivery_control_plane', '0009_stage3_production_adapters', '0010_stage3_provider_projection_provenance', '0011_stage3_provider_review_projection', '0012_stage3_regate_fencing_and_decisions', '0013_stage3_audit_closure', '0014_provider_action_kinds', '0015_stage4_planning_views_templates', '0016_stage4_usage_notifications', '0017_stage4_automation_control_plane', '0018_stage4_loops_health_a2a', '0019_stage4_gitea', '0020_stage4_review_hardening', '0021_stage4_a2a_direction_and_prompt_identity', '0022_route_policy_authorization_denials', '0023_auth_idempotency_records', '0024_cursor_pagination_indexes', '0025_realtime_event_envelope', '0026_retention_archive_and_heartbeat_health', '0027_worker_runtime_identity', '0028_worker_identity_conflict_count', '0029_exact_archive_membership', '0030_durable_archive_upload_intents', '0031_agent_session_external_urls_shape', '0032_agent_inbox_receipts', '0033_inbox_receipt_reply_binding', '0034_legacy_inbox_scope_derivation', '0035_decision_session_provenance',
    ])
    const tables = await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('work_room_channels','room_messages','leases','handoffs','routing_attempts','routing_records','context_deltas','decision_transition_consumptions') ORDER BY table_name")
    expect(tables.rows.map(row => row.table_name)).toEqual(['context_deltas', 'decision_transition_consumptions', 'handoffs', 'leases', 'room_messages', 'routing_attempts', 'routing_records', 'work_room_channels'])
    const installed = legacy
    const state = await db.query<{ id: string }>("SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog'", [installed.teamId])
    const item = await db.query<{ id: string }>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) VALUES($1,$2,1,'Migration constraints',$3,$4) RETURNING id", [installed.workspaceId, installed.teamId, state.rows[0]!.id, installed.actorId])
    const agentActor = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Migration agent') RETURNING id", [installed.workspaceId])
    const agent = await db.query<{ id: string }>("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,supported_protocols) VALUES($1,$2,'migration-agent','Migration agent',ARRAY['native_http']::agent_protocol[]) RETURNING id", [installed.workspaceId, agentActor.rows[0]!.id])
    const delegation = await db.query<{ id: string }>("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6) RETURNING id", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, installed.actorId, item.rows[0]!.id])
    const session = await db.query<{ id: string }>("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state) VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, delegation.rows[0]!.id, item.rows[0]!.id])

    const sourceChannel = await db.query<{ id: string }>("INSERT INTO work_room_channels(workspace_id,subject_kind,subject_id,team_id) VALUES($1,'work_item',$2,$3) RETURNING id", [installed.workspaceId, item.rows[0]!.id, installed.teamId])
    const sourceMessage = await db.query<{ id: string }>("INSERT INTO room_messages(channel_id,workspace_id,author_actor_id,intent,recipient_actor_id,body,requires_response) VALUES($1,$2,$3,'ask',$4,'Cross-workspace guard source',true) RETURNING id", [sourceChannel.rows[0]!.id, installed.workspaceId, installed.actorId, agentActor.rows[0]!.id])
    const inboxItem = await db.query<{ id: string }>("INSERT INTO inbox_items(workspace_id,recipient_actor_id,recipient_session_id,team_id,kind,source_type,source_id,source_room_message_id,requires_response) VALUES($1,$2,$3,$4,'mention','room_message',$5,$5,true) RETURNING id", [installed.workspaceId, agentActor.rows[0]!.id, session.rows[0]!.id, installed.teamId, sourceMessage.rows[0]!.id])
    const otherWorkspace = await db.query<{ id: string }>("INSERT INTO workspaces(name,slug) VALUES('Other migration workspace','stage-2-migration-other') RETURNING id")

    await expect(db.query("INSERT INTO room_message_session_recipients(message_id,workspace_id,session_id,actor_id) VALUES($1,$2,$3,$4)", [sourceMessage.rows[0]!.id, otherWorkspace.rows[0]!.id, session.rows[0]!.id, agentActor.rows[0]!.id])).rejects.toThrow()
    await expect(db.query("INSERT INTO inbox_item_receipts(inbox_item_id,workspace_id,actor_id,session_id,kind,correlation_id,idempotency_key) VALUES($1,$2,$3,$4,'read','cross-workspace','cross-workspace')", [inboxItem.rows[0]!.id, otherWorkspace.rows[0]!.id, agentActor.rows[0]!.id, session.rows[0]!.id])).rejects.toThrow()
    const sibling = await db.query<{ id: string }>("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state) VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id", [installed.workspaceId, installed.teamId, agent.rows[0]!.id, agentActor.rows[0]!.id, delegation.rows[0]!.id, item.rows[0]!.id])
    await expect(db.query(
      "INSERT INTO inbox_item_receipts(inbox_item_id,workspace_id,actor_id,session_id,kind,correlation_id,idempotency_key) VALUES($1,$2,$3,$4,'read','sibling','sibling')",
      [inboxItem.rows[0]!.id, installed.workspaceId, agentActor.rows[0]!.id, sibling.rows[0]!.id],
    )).rejects.toThrow(/INBOX_RECEIPT_RECIPIENT_MISMATCH/)
    const foreignAgentActor = await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Foreign receipt agent') RETURNING id", [installed.workspaceId])
    const foreignAgent = await db.query<{ id: string }>("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,supported_protocols) VALUES($1,$2,'foreign-receipt-agent','Foreign receipt agent',ARRAY['native_http']::agent_protocol[]) RETURNING id", [installed.workspaceId, foreignAgentActor.rows[0]!.id])
    const foreignDelegation = await db.query<{ id: string }>("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id) VALUES($1,$2,$3,$4,$5,$6,'reviewer','work_item',$6) RETURNING id", [installed.workspaceId, installed.teamId, foreignAgent.rows[0]!.id, foreignAgentActor.rows[0]!.id, installed.actorId, item.rows[0]!.id])
    const foreignSession = await db.query<{ id: string }>("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state) VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id", [installed.workspaceId, installed.teamId, foreignAgent.rows[0]!.id, foreignAgentActor.rows[0]!.id, foreignDelegation.rows[0]!.id, item.rows[0]!.id])
    await expect(db.query(
      "INSERT INTO inbox_item_receipts(inbox_item_id,workspace_id,actor_id,session_id,kind,correlation_id,idempotency_key) VALUES($1,$2,$3,$4,'read','foreign-actor','foreign-actor')",
      [inboxItem.rows[0]!.id, installed.workspaceId, foreignAgentActor.rows[0]!.id, foreignSession.rows[0]!.id],
    )).rejects.toThrow(/INBOX_RECEIPT_RECIPIENT_MISMATCH/)

    const otherItem = await db.query<{ id: string }>("INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) VALUES($1,$2,2,'Other room',$3,$4) RETURNING id", [installed.workspaceId, installed.teamId, state.rows[0]!.id, installed.actorId])
    const otherChannel = await db.query<{ id: string }>("INSERT INTO work_room_channels(workspace_id,subject_kind,subject_id,team_id) VALUES($1,'work_item',$2,$3) RETURNING id", [installed.workspaceId, otherItem.rows[0]!.id, installed.teamId])
    const wrongRoomReply = await db.query<{ id: string }>("INSERT INTO room_messages(channel_id,workspace_id,author_actor_id,session_id,intent,body) VALUES($1,$2,$3,$4,'inform','Wrong room reply') RETURNING id", [otherChannel.rows[0]!.id, installed.workspaceId, agentActor.rows[0]!.id, session.rows[0]!.id])
    await expect(db.query("INSERT INTO inbox_item_receipts(inbox_item_id,workspace_id,actor_id,session_id,kind,reply_message_id,correlation_id,idempotency_key) VALUES($1,$2,$3,$4,'replied',$5,'wrong-room','wrong-room')", [inboxItem.rows[0]!.id, installed.workspaceId, agentActor.rows[0]!.id, session.rows[0]!.id, wrongRoomReply.rows[0]!.id])).rejects.toThrow(/INBOX_REPLY_MESSAGE_SCOPE_MISMATCH/)
    const foreignAuthorReply = await db.query<{ id: string }>("INSERT INTO room_messages(channel_id,workspace_id,author_actor_id,session_id,intent,reply_to_message_id,body) VALUES($1,$2,$3,$4,'inform',$5,'Foreign author same-room reply') RETURNING id", [sourceChannel.rows[0]!.id, installed.workspaceId, foreignAgentActor.rows[0]!.id, foreignSession.rows[0]!.id, sourceMessage.rows[0]!.id])
    await expect(db.query("INSERT INTO inbox_item_receipts(inbox_item_id,workspace_id,actor_id,session_id,kind,reply_message_id,correlation_id,idempotency_key) VALUES($1,$2,$3,$4,'replied',$5,'foreign-author','foreign-author')", [inboxItem.rows[0]!.id, installed.workspaceId, agentActor.rows[0]!.id, session.rows[0]!.id, foreignAuthorReply.rows[0]!.id])).rejects.toThrow(/INBOX_REPLY_MESSAGE_SCOPE_MISMATCH/)
    const unrelatedReply = await db.query<{ id: string }>("INSERT INTO room_messages(channel_id,workspace_id,author_actor_id,session_id,intent,body) VALUES($1,$2,$3,$4,'inform','Correct author unrelated same-room message') RETURNING id", [sourceChannel.rows[0]!.id, installed.workspaceId, agentActor.rows[0]!.id, session.rows[0]!.id])
    await expect(db.query("INSERT INTO inbox_item_receipts(inbox_item_id,workspace_id,actor_id,session_id,kind,reply_message_id,correlation_id,idempotency_key) VALUES($1,$2,$3,$4,'replied',$5,'unrelated-message','unrelated-message')", [inboxItem.rows[0]!.id, installed.workspaceId, agentActor.rows[0]!.id, session.rows[0]!.id, unrelatedReply.rows[0]!.id])).rejects.toThrow(/INBOX_REPLY_MESSAGE_SCOPE_MISMATCH/)
    const validReply = await db.query<{ id: string }>("INSERT INTO room_messages(channel_id,workspace_id,author_actor_id,session_id,intent,reply_to_message_id,body) VALUES($1,$2,$3,$4,'inform',$5,'Valid source-linked reply') RETURNING id", [sourceChannel.rows[0]!.id, installed.workspaceId, agentActor.rows[0]!.id, session.rows[0]!.id, sourceMessage.rows[0]!.id])
    await expect(db.query("INSERT INTO inbox_item_receipts(inbox_item_id,workspace_id,actor_id,session_id,kind,reply_message_id,correlation_id,idempotency_key) VALUES($1,$2,$3,$4,'replied',$5,'source-linked','source-linked')", [inboxItem.rows[0]!.id, installed.workspaceId, agentActor.rows[0]!.id, session.rows[0]!.id, validReply.rows[0]!.id])).resolves.toBeDefined()

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
