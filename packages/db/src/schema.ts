import { sql } from 'drizzle-orm'
import { bigint, boolean, check, customType, date, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

const binary = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' })

export const actorKind = pgEnum('actor_kind', ['human', 'agent', 'service'])
export const workspaceRole = pgEnum('workspace_role', ['admin', 'member'])
export const membershipRole = pgEnum('membership_role', ['admin', 'maintainer', 'member'])
export const statusCategory = pgEnum('status_category', ['backlog', 'planned', 'started', 'completed', 'canceled'])
export const outboxStatus = pgEnum('outbox_status', ['pending', 'delivering', 'delivered', 'dead'])
export const eventArchiveSegmentState = pgEnum('event_archive_segment_state', ['planned', 'uploaded', 'verified', 'pruned', 'failed'])
export const eventArchiveMembershipState = pgEnum('event_archive_membership_state', ['pending_exact', 'exact', 'legacy_unindexed'])
export const agentProtocol = pgEnum('agent_protocol', ['native_http', 'mcp', 'a2a'])
export const delegationRole = pgEnum('delegation_role', ['executor', 'reviewer', 'researcher', 'coordinator', 'triager'])
export const delegationScopeType = pgEnum('delegation_scope_type', ['work_item', 'plan_step', 'project', 'automation'])
export const delegationStatus = pgEnum('delegation_status', ['active', 'revoked', 'expired', 'completed'])
export const webhookSecretStatus = pgEnum('webhook_secret_status', ['active', 'retiring', 'revoked'])
export const agentSessionState = pgEnum('agent_session_state', ['queued', 'acknowledged', 'planning', 'executing', 'awaiting_input', 'awaiting_approval', 'blocked', 'paused', 'stopping', 'stale', 'completed', 'failed', 'canceled'])
export const planStepStatus = pgEnum('plan_step_status', ['pending', 'in_progress', 'blocked', 'completed', 'canceled'])
export const activityVisibility = pgEnum('activity_visibility', ['team', 'workspace', 'private'])
export const approvalStatus = pgEnum('approval_status', ['pending', 'approved', 'rejected', 'expired', 'consumed', 'canceled'])
export const approvalRiskLevel = pgEnum('approval_risk_level', ['low', 'medium', 'high', 'critical'])
export const webhookDeliveryStatus = pgEnum('webhook_delivery_status', ['pending', 'delivering', 'delivered', 'dead'])
export const inboxItemKind = pgEnum('inbox_item_kind', ['waiting_input', 'approval', 'session_stale', 'ask', 'review_request', 'blocker', 'handoff', 'mention'])
export const inboxItemStatus = pgEnum('inbox_item_status', ['open', 'resolved'])
export const inboxReceiptKind = pgEnum('inbox_receipt_kind', ['claimed', 'read', 'acknowledged', 'replied'])
export const roomSubjectKind = pgEnum('room_subject_kind', ['work_item', 'project', 'session'])
export const roomMessageIntent = pgEnum('room_message_intent', ['inform', 'ask', 'answer', 'propose', 'decide', 'claim', 'handoff', 'blocker', 'review_request', 'review_result', 'status'])
export const leaseKind = pgEnum('lease_kind', ['exclusive', 'review_shared'])
export const leaseStatus = pgEnum('lease_status', ['active', 'released', 'expired', 'revoked'])
export const handoffStatus = pgEnum('handoff_status', ['draft', 'requested', 'accepted', 'rejected', 'canceled', 'completed'])
export const budgetReservationStatus = pgEnum('budget_reservation_status', ['reserved', 'released', 'consumed'])
export const decisionRelationKind = pgEnum('decision_relation_kind', ['supersedes', 'reverses'])
export const routingOutcome = pgEnum('routing_outcome', ['candidate', 'rejected', 'selected'])
export const initiativeStatus = pgEnum('initiative_status', ['planned', 'active', 'paused', 'completed', 'canceled'])
export const initiativePriority = pgEnum('initiative_priority', ['none', 'low', 'medium', 'high', 'urgent'])
export const planningHealth = pgEnum('planning_health', ['on_track', 'at_risk', 'off_track', 'unknown'])
export const advancedViewEntity = pgEnum('advanced_view_entity', ['issue', 'project', 'session', 'initiative'])
export const advancedViewLayout = pgEnum('advanced_view_layout', ['list', 'board', 'timeline'])
export const advancedViewScope = pgEnum('advanced_view_scope', ['private', 'team', 'workspace'])
export const templateKind = pgEnum('template_kind', ['work_item', 'project', 'agent_run', 'handoff', 'automation'])
export const templateStatus = pgEnum('template_status', ['draft', 'active', 'archived'])
export const costSource = pgEnum('cost_source', ['provider_reported', 'rate_card', 'manual', 'unknown'])
export const budgetScope = pgEnum('budget_scope', ['workspace', 'team', 'project', 'agent', 'session', 'loop'])
export const notificationPriority = pgEnum('notification_priority', ['input', 'approval', 'agent_failure', 'mention', 'handoff', 'update'])
export const notificationChannel = pgEnum('notification_channel', ['in_app', 'browser', 'webhook'])
export const notificationDeliveryStatus = pgEnum('notification_delivery_status', ['pending', 'claimed', 'delivered', 'failed', 'dead', 'suppressed'])
export const automationRuleState = pgEnum('automation_rule_state', ['active', 'paused', 'disabled'])
export const automationRunStatus = pgEnum('automation_run_status', ['pending', 'claimed', 'running', 'succeeded', 'failed', 'dead', 'canceled', 'dry_run'])
export const automationEffectStatus = pgEnum('automation_effect_status', ['pending', 'claimed', 'completed', 'failed', 'dead', 'reconciled'])
export const loopState = pgEnum('loop_state', ['active', 'paused', 'disabled'])
export const healthUpdateSource = pgEnum('health_update_source', ['human', 'agent'])
export const healthUpdateStatus = pgEnum('health_update_status', ['draft', 'published'])
export const a2aDeliveryStatus = pgEnum('a2a_delivery_status', ['received', 'processed', 'dead'])
export const automationExternalIntentState = pgEnum('automation_external_intent_state', ['prepared', 'acknowledged', 'uncertain'])

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey(), name: text('name').notNull(), slug: text('slug').notNull(), revision: integer('revision').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const actors = pgTable('actors', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), kind: actorKind('kind').notNull(), workspaceRole: workspaceRole('workspace_role'),
  email: text('email'), displayName: text('display_name').notNull(), passwordHash: text('password_hash'), isActive: boolean('is_active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const platformInstallation = pgTable('platform_installation', {
  singleton: boolean('singleton').primaryKey(), workspaceId: uuid('workspace_id').notNull(), systemActorId: uuid('system_actor_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), name: text('name').notNull(), key: text('key').notNull(),
  nextWorkItemNumber: integer('next_work_item_number').notNull(), revision: integer('revision').notNull(), deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const memberships = pgTable('memberships', {
  workspaceId: uuid('workspace_id').notNull(), teamId: uuid('team_id').notNull(), actorId: uuid('actor_id').notNull(), role: membershipRole('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const workflowStates = pgTable('workflow_states', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), teamId: uuid('team_id').notNull(), name: text('name').notNull(),
  category: statusCategory('category').notNull(), color: text('color').notNull(), position: integer('position').notNull(), isArchived: boolean('is_archived').notNull(),
  revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), teamId: uuid('team_id').notNull(), name: text('name').notNull(),
  summary: text('summary'), description: text('description'), status: text('status').notNull(), leadActorId: uuid('lead_actor_id'), targetDate: date('target_date'),
  revision: integer('revision').notNull(), deletedAt: timestamp('deleted_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const workItems = pgTable('work_items', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), teamId: uuid('team_id').notNull(), number: integer('number').notNull(),
  title: text('title').notNull(), description: text('description'), statusId: uuid('status_id').notNull(), priority: text('priority').notNull(), dueDate: date('due_date'),
  responsibleHumanActorId: uuid('responsible_human_actor_id'), labels: text('labels').array().notNull(), projectId: uuid('project_id'), cycleId: uuid('cycle_id'), revision: integer('revision').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const channels = pgTable('channels', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), workItemId: uuid('work_item_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const comments = pgTable('comments', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), channelId: uuid('channel_id').notNull(), authorActorId: uuid('author_actor_id').notNull(),
  parentCommentId: uuid('parent_comment_id'), replyToCommentId: uuid('reply_to_comment_id'), body: text('body').notNull(), isResolved: boolean('is_resolved').notNull(), revision: integer('revision').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const commentMentions = pgTable('comment_mentions', {
  workspaceId: uuid('workspace_id').notNull(), commentId: uuid('comment_id').notNull(), actorId: uuid('actor_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const savedViews = pgTable('saved_views', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), ownerActorId: uuid('owner_actor_id').notNull(), teamId: uuid('team_id'), name: text('name').notNull(),
  filters: jsonb('filters').notNull(), layout: text('layout').notNull(), revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const cycles = pgTable('cycles', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), teamId: uuid('team_id'), name: text('name').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(), endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  durationWeeks: integer('duration_weeks').notNull(), revision: integer('revision').notNull(), createdByActorId: uuid('created_by_actor_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const workItemCycleFacts = pgTable('work_item_cycle_facts', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), workItemId: uuid('work_item_id').notNull(),
  fromCycleId: uuid('from_cycle_id'), toCycleId: uuid('to_cycle_id'), actorId: uuid('actor_id').notNull(), reason: text('reason').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
})
export const initiatives = pgTable('initiatives', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), parentInitiativeId: uuid('parent_initiative_id'),
  name: text('name').notNull(), summary: text('summary'), ownerActorId: uuid('owner_actor_id').notNull(),
  status: initiativeStatus('status').notNull(), priority: initiativePriority('priority').notNull(), health: planningHealth('health').notNull(),
  revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const initiativeProjects = pgTable('initiative_projects', {
  workspaceId: uuid('workspace_id').notNull(), initiativeId: uuid('initiative_id').notNull(), projectId: uuid('project_id').notNull(),
  sortOrder: integer('sort_order').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const advancedSavedViews = pgTable('advanced_saved_views', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), ownerActorId: uuid('owner_actor_id').notNull(), teamId: uuid('team_id'),
  name: text('name').notNull(), entityType: advancedViewEntity('entity_type').notNull(), filters: jsonb('filters').notNull(), grouping: text('grouping'),
  ordering: jsonb('ordering').notNull(), visibleFields: text('visible_fields').array().notNull(), layout: advancedViewLayout('layout').notNull(),
  scope: advancedViewScope('scope').notNull(), favorite: boolean('favorite').notNull(), isDefault: boolean('is_default').notNull(),
  revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const templates = pgTable('templates', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), kind: templateKind('kind').notNull(), name: text('name').notNull(),
  description: text('description').notNull(), ownerActorId: uuid('owner_actor_id').notNull(), teamId: uuid('team_id'), status: templateStatus('status').notNull(),
  currentVersionId: uuid('current_version_id'), revision: integer('revision').notNull(), importedAt: timestamp('imported_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const templateVersions = pgTable('template_versions', {
  id: uuid('id').primaryKey(), templateId: uuid('template_id').notNull(), version: integer('version').notNull(), body: jsonb('body').notNull(),
  changeSummary: text('change_summary').notNull(), createdByActorId: uuid('created_by_actor_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(), actorId: uuid('actor_id').notNull(), tokenHash: text('token_hash').notNull(), csrfToken: text('csrf_token').notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), revokedAt: timestamp('revoked_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const apiIdempotencyKeys = pgTable('api_idempotency_keys', {
  workspaceId: uuid('workspace_id').notNull(), actorId: uuid('actor_id').notNull(), idempotencyKey: text('idempotency_key').notNull(), operation: text('operation').notNull(), requestHash: text('request_hash').notNull(),
  responseStatus: integer('response_status'), responseBody: jsonb('response_body'), replayExpiresAt: timestamp('replay_expires_at', { withTimezone: true }).notNull(),
  conflictExpiresAt: timestamp('conflict_expires_at', { withTimezone: true }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const heartbeatIdempotencyKeys = pgTable('heartbeat_idempotency_keys', {
  resourceKind: text('resource_kind').notNull(), resourceId: uuid('resource_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(), requestHash: text('request_hash').notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
export const authIdempotencyRecords = pgTable('auth_idempotency_records', {
  id: uuid('id').primaryKey(),
  keyFingerprint: text('key_fingerprint').notNull(),
  subjectFingerprint: text('subject_fingerprint').notNull(),
  operation: text('operation').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  clientContextFingerprint: text('client_context_fingerprint').notNull(),
  state: text('state').notNull(),
  responseStatus: integer('response_status'),
  replayKeyId: text('replay_key_id'),
  replayKeyFingerprint: text('replay_key_fingerprint'),
  replayIv: binary('replay_iv'),
  replayTag: binary('replay_tag'),
  replayCiphertext: binary('replay_ciphertext'),
  replayExpiresAt: timestamp('replay_expires_at', { withTimezone: true }).notNull(),
  conflictExpiresAt: timestamp('conflict_expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  replayWipedAt: timestamp('replay_wiped_at', { withTimezone: true }),
})
export const domainEvents = pgTable('domain_events', {
  cursor: bigint('cursor', { mode: 'bigint' }).primaryKey(), id: uuid('id').notNull(), workspaceId: uuid('workspace_id').notNull(), teamId: uuid('team_id'), audienceActorId: uuid('audience_actor_id'),
  eventType: text('event_type').notNull(), eventVersion: integer('event_version').notNull(), aggregateType: text('aggregate_type').notNull(), aggregateId: uuid('aggregate_id').notNull(), aggregateRevision: integer('aggregate_revision'),
  actorId: uuid('actor_id').notNull(), correlationId: text('correlation_id').notNull(), idempotencyKey: text('idempotency_key'), sessionId: uuid('session_id'), sessionSequence: bigint('session_sequence', { mode: 'number' }), causationId: uuid('causation_id'), payload: jsonb('payload').notNull(), occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
})
export const domainEventResources = pgTable('domain_event_resources', {
  domainEventId: uuid('domain_event_id').notNull(), workspaceId: uuid('workspace_id').notNull(), relation: text('relation').notNull(),
  resourceType: text('resource_type').notNull(), resourceId: uuid('resource_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const eventRetentionState = pgTable('event_retention_state', {
  workspaceId: uuid('workspace_id').primaryKey(), prunedThroughCursor: bigint('pruned_through_cursor', { mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const eventArchiveSegments = pgTable('event_archive_segments', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(),
  startCursor: bigint('start_cursor', { mode: 'bigint' }).notNull(), endCursor: bigint('end_cursor', { mode: 'bigint' }).notNull(),
  fixedCutoffAt: timestamp('fixed_cutoff_at', { withTimezone: true }).notNull(), rowCount: integer('row_count').notNull(),
  objectKey: text('object_key').notNull(), objectVersionId: text('object_version_id'),
  objectSizeBytes: bigint('object_size_bytes', { mode: 'bigint' }).notNull(), objectSha256: text('object_sha256').notNull(),
  snapshotDigest: text('snapshot_digest').notNull(), metadata: jsonb('metadata').notNull(), state: eventArchiveSegmentState('state').notNull(),
  membershipState: eventArchiveMembershipState('membership_state').notNull(),
  retainUntil: timestamp('retain_until', { withTimezone: true }).notNull(), uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }), prunedAt: timestamp('pruned_at', { withTimezone: true }),
  uploadAttemptCount: integer('upload_attempt_count').notNull(), lastUploadAttemptAt: timestamp('last_upload_attempt_at', { withTimezone: true }),
  lastUploadFence: bigint('last_upload_fence', { mode: 'bigint' }), plannedFence: bigint('planned_fence', { mode: 'bigint' }),
  lastErrorCode: text('last_error_code'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const eventArchiveSegmentEvents = pgTable('event_archive_segment_events', {
  segmentId: uuid('segment_id').notNull(), workspaceId: uuid('workspace_id').notNull(), ordinal: integer('ordinal').notNull(),
  eventId: uuid('event_id').notNull(), eventCursor: bigint('event_cursor', { mode: 'bigint' }).notNull(),
  recordSha256: text('record_sha256').notNull(), flooredAt: timestamp('floored_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const retentionJobState = pgTable('retention_job_state', {
  jobName: text('job_name').notNull(), workspaceId: uuid('workspace_id').notNull(), leaseOwner: text('lease_owner'),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }), fence: bigint('fence', { mode: 'bigint' }).notNull(),
  fixedCutoffAt: timestamp('fixed_cutoff_at', { withTimezone: true }), watermarkCursor: bigint('watermark_cursor', { mode: 'bigint' }).notNull(),
  lastErrorCode: text('last_error_code'), counters: jsonb('counters').notNull(), lastStartedAt: timestamp('last_started_at', { withTimezone: true }),
  lastCompletedAt: timestamp('last_completed_at', { withTimezone: true }), workerMode: text('worker_mode'),
  workerSeenAt: timestamp('worker_seen_at', { withTimezone: true }), workerInstanceId: uuid('worker_instance_id'),
  workerBuildSha: text('worker_build_sha'), workerIdentityConflictCount: bigint('worker_identity_conflict_count', { mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const retentionPolicyInventory = pgTable('retention_policy_inventory', {
  recordClass: text('record_class').primaryKey(), onlineDays: integer('online_days').notNull(), conflictDays: integer('conflict_days'),
  archiveDays: integer('archive_days'), deleteAllowed: boolean('delete_allowed').notNull(), protectedReason: text('protected_reason'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const authorizationDenials = pgTable('authorization_denials', {
  id: uuid('id').primaryKey(), occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  correlationId: text('correlation_id').notNull(), policyId: text('policy_id').notNull(), operationId: text('operation_id').notNull(),
  transport: text('transport').notNull(), principalKind: actorKind('principal_kind'), principalActorId: uuid('principal_actor_id'),
  principalSessionId: uuid('principal_session_id'), workspaceId: uuid('workspace_id'), routeTemplate: text('route_template').notNull(),
  reasonCode: text('reason_code').notNull(), authorizationStage: text('authorization_stage').notNull(),
  resourceFingerprint: text('resource_fingerprint'), dedupeKey: text('dedupe_key'),
})
export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').primaryKey(), domainEventId: uuid('domain_event_id').notNull(), topic: text('topic').notNull(), partitionKey: text('partition_key').notNull(), status: outboxStatus('status').notNull(),
  attemptCount: integer('attempt_count').notNull(), availableAt: timestamp('available_at', { withTimezone: true }).notNull(), lockedAt: timestamp('locked_at', { withTimezone: true }), lockedBy: text('locked_by'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }), lastError: text('last_error'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const agentDefinitions = pgTable('agent_definitions', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), actorId: uuid('actor_id').notNull(), slug: text('slug').notNull(),
  displayName: text('display_name').notNull(), description: text('description'), endpointUrl: text('endpoint_url'), manifest: jsonb('manifest').notNull(),
  supportedProtocols: agentProtocol('supported_protocols').array().notNull(), skills: text('skills').array().notNull(), requestedCapabilities: text('requested_capabilities').array().notNull(),
  approvedCapabilities: text('approved_capabilities').array().notNull(), outputArtifactTypes: text('output_artifact_types').array().notNull(), maxConcurrency: integer('max_concurrency').notNull(),
  isActive: boolean('is_active').notNull(), revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const agentTeamAccess = pgTable('agent_team_access', {
  workspaceId: uuid('workspace_id').notNull(), agentId: uuid('agent_id').notNull(), teamId: uuid('team_id').notNull(), grantedByActorId: uuid('granted_by_actor_id').notNull(),
  approvedCapabilities: text('approved_capabilities').array().notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), revokedAt: timestamp('revoked_at', { withTimezone: true }),
})
export const agentWebhookEndpoints = pgTable('agent_webhook_endpoints', {
  id: uuid('id').primaryKey(), agentId: uuid('agent_id').notNull(), url: text('url').notNull(), isActive: boolean('is_active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const agentWebhookSecrets = pgTable('agent_webhook_secrets', {
  id: uuid('id').primaryKey(), endpointId: uuid('endpoint_id').notNull(), version: integer('version').notNull(), secretCiphertext: binary('secret_ciphertext').notNull(),
  iv: binary('iv').notNull(), authTag: binary('auth_tag').notNull(), keyVersion: text('key_version').notNull(), status: webhookSecretStatus('status').notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull(), validUntil: timestamp('valid_until', { withTimezone: true }), revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdByActorId: uuid('created_by_actor_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const agentInstallationTokens = pgTable('agent_installation_tokens', {
  id: uuid('id').primaryKey(), agentId: uuid('agent_id').notNull(), tokenHash: text('token_hash').notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }), lastUsedAt: timestamp('last_used_at', { withTimezone: true }), revokedAt: timestamp('revoked_at', { withTimezone: true }), createdByActorId: uuid('created_by_actor_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const delegations = pgTable('delegations', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), teamId: uuid('team_id').notNull(), agentId: uuid('agent_id').notNull(), agentActorId: uuid('agent_actor_id').notNull(),
  principalHumanActorId: uuid('principal_human_actor_id').notNull(), workItemId: uuid('work_item_id'), role: delegationRole('role').notNull(), scopeType: delegationScopeType('scope_type').notNull(),
  scopeId: uuid('scope_id').notNull(), permissionsSnapshot: text('permissions_snapshot').array().notNull(), capabilityScope: jsonb('capability_scope').notNull(), status: delegationStatus('status').notNull(),
  revision: integer('revision').notNull(), parentDelegationId: uuid('parent_delegation_id'), revokedAt: timestamp('revoked_at', { withTimezone: true }), revokedByActorId: uuid('revoked_by_actor_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const contextSnapshots = pgTable('context_snapshots', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), workItemId: uuid('work_item_id'), manifest: jsonb('manifest').notNull(), sources: jsonb('sources').notNull(),
  contentHash: text('content_hash').notNull(), tokenEstimate: integer('token_estimate').notNull(), truncation: jsonb('truncation').notNull(), createdByActorId: uuid('created_by_actor_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const agentSessions = pgTable('agent_sessions', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), teamId: uuid('team_id'), agentId: uuid('agent_id').notNull(), agentActorId: uuid('agent_actor_id').notNull(), delegationId: uuid('delegation_id').notNull(),
  parentSessionId: uuid('parent_session_id'), retryOfSessionId: uuid('retry_of_session_id'), retryReason: text('retry_reason'), retryCount: integer('retry_count').notNull(),
  workItemId: uuid('work_item_id'), projectId: uuid('project_id'), planStepId: uuid('plan_step_id'), state: agentSessionState('state').notNull(), stateReason: text('state_reason'),
  sequence: bigint('sequence', { mode: 'number' }).notNull(), revision: integer('revision').notNull(), currentPlanVersionId: uuid('current_plan_version_id'), contextSnapshotId: uuid('context_snapshot_id'),
  budget: jsonb('budget').notNull(), externalUrls: jsonb('external_urls').notNull(), acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }), lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  heartbeatHealth: text('heartbeat_health').notNull(), heartbeatHealthChangedAt: timestamp('heartbeat_health_changed_at', { withTimezone: true }).notNull(),
  heartbeatCheckedAt: timestamp('heartbeat_checked_at', { withTimezone: true }), heartbeatCurrentStepId: uuid('heartbeat_current_step_id'),
  heartbeatUsage: jsonb('heartbeat_usage').notNull(), heartbeatIdempotencyKey: text('heartbeat_idempotency_key'), heartbeatRequestHash: text('heartbeat_request_hash'),
  stopRequestedAt: timestamp('stop_requested_at', { withTimezone: true }), stopAcknowledgedAt: timestamp('stop_acknowledged_at', { withTimezone: true }), resultSummary: text('result_summary'), resultEvidence: jsonb('result_evidence').notNull(),
  noArtifactReason: text('no_artifact_reason'), errorCode: text('error_code'), errorSummary: text('error_summary'), endedAt: timestamp('ended_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  maxChildSessions: integer('max_child_sessions').notNull(), inheritedBudget: jsonb('inherited_budget').notNull(), requiredForParent: boolean('required_for_parent').notNull(), planStepVersionId: uuid('plan_step_version_id'), automationRunId: uuid('automation_run_id'),
})
export const agentPlanVersions = pgTable('agent_plan_versions', {
  id: uuid('id').primaryKey(), sessionId: uuid('session_id').notNull(), revision: integer('revision').notNull(), parentVersionId: uuid('parent_version_id'), changeSummary: text('change_summary').notNull(), authorActorId: uuid('author_actor_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const agentPlanSteps = pgTable('agent_plan_steps', {
  planVersionId: uuid('plan_version_id').notNull(), id: uuid('id').notNull(), title: text('title').notNull(), description: text('description'), status: planStepStatus('status').notNull(), ordinal: integer('ordinal').notNull(), ownerActorId: uuid('owner_actor_id'),
  acceptanceCriteria: jsonb('acceptance_criteria').notNull(), expectedArtifacts: text('expected_artifacts').array().notNull(), cancellationReason: text('cancellation_reason'), parentStepId: uuid('parent_step_id'), requiredForParent: boolean('required_for_parent').notNull(), budget: jsonb('budget').notNull(), maxChildSessions: integer('max_child_sessions').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const agentPlanStepIdentities = pgTable('agent_plan_step_identities', { sessionId: uuid('session_id').notNull(), stableStepId: uuid('stable_step_id').notNull(), firstPlanVersionId: uuid('first_plan_version_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull() })
export const sessionBudgetReservations = pgTable('session_budget_reservations', { id: uuid('id').primaryKey(), parentSessionId: uuid('parent_session_id').notNull(), childSessionId: uuid('child_session_id').notNull(), allocation: jsonb('allocation').notNull(), reserved: jsonb('reserved').notNull(), status: budgetReservationStatus('status').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), releasedAt: timestamp('released_at', { withTimezone: true }), reason: text('reason') })
export const agentPlanStepDependencies = pgTable('agent_plan_step_dependencies', {
  planVersionId: uuid('plan_version_id').notNull(), stepId: uuid('step_id').notNull(), dependsOnStepId: uuid('depends_on_step_id').notNull(),
})
export const agentActivities = pgTable('agent_activities', {
  id: uuid('id').primaryKey(), sessionId: uuid('session_id').notNull(), actorId: uuid('actor_id').notNull(), sequence: bigint('sequence', { mode: 'number' }).notNull(), kind: text('kind').notNull(), summary: text('summary').notNull(),
  detailsMarkdown: text('details_markdown'), toolInvocation: jsonb('tool_invocation'), artifactIds: uuid('artifact_ids').array().notNull(), referencesJson: jsonb('references_json').notNull(), visibility: activityVisibility('visibility').notNull(), ephemeral: boolean('ephemeral').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const agentSessionPrompts = pgTable('agent_session_prompts', {
  id: uuid('id').primaryKey(), sessionId: uuid('session_id').notNull(), authorActorId: uuid('author_actor_id').notNull(), bodyMarkdown: text('body_markdown').notNull(), planRevision: integer('plan_revision'), workItemRevision: integer('work_item_revision'), a2aExternalMessageId: text('a2a_external_message_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const workRoomChannels = pgTable('work_room_channels', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), subjectKind: roomSubjectKind('subject_kind').notNull(), subjectId: uuid('subject_id').notNull(), teamId: uuid('team_id'), workItemId: uuid('work_item_id'), projectId: uuid('project_id'), sessionId: uuid('session_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const roomMessages = pgTable('room_messages', {
  id: uuid('id').primaryKey(), channelId: uuid('channel_id').notNull(), workspaceId: uuid('workspace_id').notNull(), authorActorId: uuid('author_actor_id').notNull(), sessionId: uuid('session_id'), intent: roomMessageIntent('intent').notNull(), recipientActorId: uuid('recipient_actor_id'), replyToMessageId: uuid('reply_to_message_id'), threadId: uuid('thread_id'), body: text('body').notNull(), structuredPayload: jsonb('structured_payload').notNull(), requiresResponse: boolean('requires_response').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const roomMessageRecipients = pgTable('room_message_recipients', { messageId: uuid('message_id').notNull(), actorId: uuid('actor_id').notNull() })
export const roomMessageSessionRecipients = pgTable('room_message_session_recipients', { messageId: uuid('message_id').notNull(), workspaceId: uuid('workspace_id').notNull(), sessionId: uuid('session_id').notNull(), actorId: uuid('actor_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull() })
export const roomMessageResponseResolutions = pgTable('room_message_response_resolutions', { id: uuid('id').primaryKey(), messageId: uuid('message_id').notNull(), resolvedByActorId: uuid('resolved_by_actor_id').notNull(), resolution: text('resolution'), createdAt: timestamp('created_at', { withTimezone: true }).notNull() })
export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), workItemId: uuid('work_item_id'), projectId: uuid('project_id'), sessionId: uuid('session_id'), proposedByActorId: uuid('proposed_by_actor_id').notNull(), finalizedByActorId: uuid('finalized_by_actor_id'), title: text('title').notNull(), rationale: text('rationale').notNull(), options: jsonb('options').notNull(), selectedOption: text('selected_option'), evidence: jsonb('evidence').notNull(), status: text('status').notNull(), revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), finalizedAt: timestamp('finalized_at', { withTimezone: true }),
}, table => [
  check(
    'decisions_subject_check',
    sql`num_nonnulls(${table.workItemId},${table.projectId}) <= 1
      AND num_nonnulls(${table.workItemId},${table.projectId},${table.sessionId}) >= 1`,
  ),
])
export const decisionAffectedResources = pgTable('decision_affected_resources', { decisionId: uuid('decision_id').notNull(), resourceType: text('resource_type').notNull(), resourceId: uuid('resource_id').notNull(), impact: text('impact').notNull() })
export const decisionRelations = pgTable('decision_relations', { id: uuid('id').primaryKey(), decisionId: uuid('decision_id').notNull(), relatedDecisionId: uuid('related_decision_id').notNull(), kind: decisionRelationKind('kind').notNull(), createdByActorId: uuid('created_by_actor_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull() })
export const decisionTransitionConsumptions = pgTable('decision_transition_consumptions', { id: uuid('id').primaryKey(), targetDecisionId: uuid('target_decision_id').notNull(), transitionType: text('transition_type').notNull(), derivedDecisionId: uuid('derived_decision_id'), consumedByActorId: uuid('consumed_by_actor_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull() })
export const leases = pgTable('leases', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), sessionId: uuid('session_id').notNull(), holderActorId: uuid('holder_actor_id'), resourceType: text('resource_type').notNull(), resourceId: uuid('resource_id').notNull(), kind: leaseKind('kind').notNull(), status: leaseStatus('status').notNull(), reason: text('reason').notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull(), renewCount: integer('renew_count').notNull(), version: integer('version').notNull(), releasedAt: timestamp('released_at', { withTimezone: true }), releasedByActorId: uuid('released_by_actor_id'), auditReason: text('audit_reason'), revokedAt: timestamp('revoked_at', { withTimezone: true }), revokedByActorId: uuid('revoked_by_actor_id'), heartbeatIdempotencyKey: text('heartbeat_idempotency_key'), heartbeatRequestHash: text('heartbeat_request_hash'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const handoffs = pgTable('handoffs', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), fromSessionId: uuid('from_session_id').notNull(), targetAgentId: uuid('target_agent_id'), targetSkill: text('target_skill'), scopeType: text('scope_type'), scopeId: uuid('scope_id'), summary: text('summary').notNull(), completedWork: jsonb('completed_work').notNull(), remainingWork: jsonb('remaining_work').notNull(), openQuestions: jsonb('open_questions').notNull(), risks: jsonb('risks').notNull(), acceptanceCriteria: jsonb('acceptance_criteria').notNull(), requestedAction: text('requested_action'), leaseTransferPolicy: text('lease_transfer_policy').notNull(), artifactIds: uuid('artifact_ids').array().notNull(), contextSnapshotId: uuid('context_snapshot_id'), requestedCapabilities: text('requested_capabilities').array().notNull(), status: handoffStatus('status').notNull(), acceptedSessionId: uuid('accepted_session_id'), resolvedAgentId: uuid('resolved_agent_id'), resolvedDelegationId: uuid('resolved_delegation_id'), rejectedByActorId: uuid('rejected_by_actor_id'), machineRejectReason: text('machine_reject_reason'), routingSnapshot: jsonb('routing_snapshot').notNull(), revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), requestedAt: timestamp('requested_at', { withTimezone: true }), decidedAt: timestamp('decided_at', { withTimezone: true }), completedAt: timestamp('completed_at', { withTimezone: true }),
})
export const routingRecords = pgTable('routing_records', { id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), sourceSessionId: uuid('source_session_id'), targetAgentId: uuid('target_agent_id').notNull(), requestedSkill: text('requested_skill'), requiredCapabilities: text('required_capabilities').array().notNull(), outcome: routingOutcome('outcome').notNull(), sortRank: integer('sort_rank'), rationale: jsonb('rationale').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull() })
export const routingAttempts = pgTable('routing_attempts', { id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), handoffId: uuid('handoff_id').notNull(), sourceSessionId: uuid('source_session_id').notNull(), attemptKey: text('attempt_key').notNull(), requestedSkill: text('requested_skill'), requiredCapabilities: text('required_capabilities').array().notNull(), candidateCount: integer('candidate_count').notNull(), selectedAgentId: uuid('selected_agent_id'), outcome: text('outcome').notNull(), failureCode: text('failure_code'), rationale: jsonb('rationale').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull() })
export const contextDeltas = pgTable('context_deltas', {
  id: uuid('id').primaryKey(), sessionId: uuid('session_id').notNull(), baseSnapshotId: uuid('base_snapshot_id').notNull(), sourceSnapshotId: uuid('source_snapshot_id'), additions: jsonb('additions').notNull(), contentHash: text('content_hash').notNull(), rationale: text('rationale').notNull(), historyLink: jsonb('history_link').notNull(), createdByActorId: uuid('created_by_actor_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const providerKind = pgEnum('provider_kind', ['fake', 'github', 'gitea'])
export const providerDeliveryStatus = pgEnum('provider_delivery_status', ['received', 'claimed', 'processed', 'dead'])
export const providerActionStatus = pgEnum('provider_action_status', ['pending', 'claimed', 'completed', 'failed', 'dead'])
export const normalizedCheckStatus = pgEnum('normalized_check_status', ['queued', 'running', 'passed', 'failed', 'skipped'])
export const pullRequestState = pgEnum('pull_request_state', ['open', 'closed', 'merged'])
export const reviewVerdict = pgEnum('review_verdict', ['approved', 'changes_requested', 'commented'])
export const findingSeverity = pgEnum('finding_severity', ['blocking', 'high', 'medium', 'low'])
export const artifactUploadStatus = pgEnum('artifact_upload_status', ['pending', 'uploaded', 'verified', 'rejected', 'expired'])
export const projectHealth = pgEnum('project_health', ['on_track', 'at_risk', 'off_track'])
export const projectUpdateStatus = pgEnum('project_update_status', ['draft', 'published'])
export const completionSuggestionStatus = pgEnum('completion_suggestion_status', ['open', 'accepted', 'dismissed'])

export const providerConnections = pgTable('provider_connections', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), provider: providerKind('provider').notNull(), externalAccountId: text('external_account_id').notNull(), displayName: text('display_name').notNull(), installationId: text('installation_id'), serviceActorId: uuid('service_actor_id').notNull(), webhookSecretCiphertext: binary('webhook_secret_ciphertext').notNull(), credentialsCiphertext: binary('credentials_ciphertext'), active: boolean('active').notNull(), revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const repositories = pgTable('repositories', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), connectionId: uuid('connection_id').notNull(), teamId: uuid('team_id').notNull(), externalId: text('external_id').notNull(), fullName: text('full_name').notNull(), defaultBranch: text('default_branch').notNull(), cloneUrl: text('clone_url'), requiredChecks: text('required_checks').array().notNull(), active: boolean('active').notNull(), revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const repositoryContexts = pgTable('repository_contexts', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), repositoryId: uuid('repository_id').notNull(), projectId: uuid('project_id'), workItemId: uuid('work_item_id'), sessionId: uuid('session_id'), baseBranch: text('base_branch').notNull(), baseSha: text('base_sha').notNull(), branchPattern: text('branch_pattern').notNull(), allowedPaths: text('allowed_paths').array().notNull(), permissions: text('permissions').array().notNull(), guidanceManifestHash: text('guidance_manifest_hash').notNull(), createdByActorId: uuid('created_by_actor_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const repositoryGuidanceEntries = pgTable('repository_guidance_entries', {
  contextId: uuid('context_id').notNull(), ordinal: integer('ordinal').notNull(), path: text('path').notNull(), blobSha: text('blob_sha').notNull(), contentHash: text('content_hash').notNull(), content: text('content').notNull(),
})
export const providerWebhookDeliveries = pgTable('provider_webhook_deliveries', {
  id: uuid('id').primaryKey(), connectionId: uuid('connection_id').notNull(), repositoryId: uuid('repository_id'), deliveryId: text('delivery_id').notNull(), eventName: text('event_name').notNull(), bodyHash: text('body_hash').notNull(), payload: jsonb('payload').notNull(), status: providerDeliveryStatus('status').notNull(), attemptCount: integer('attempt_count').notNull(), availableAt: timestamp('available_at', { withTimezone: true }).notNull(), claimedAt: timestamp('claimed_at', { withTimezone: true }), claimedBy: text('claimed_by'), processedAt: timestamp('processed_at', { withTimezone: true }), lastError: text('last_error'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const providerActions = pgTable('provider_actions', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), connectionId: uuid('connection_id').notNull(), repositoryId: uuid('repository_id').notNull(), requestedByActorId: uuid('requested_by_actor_id').notNull(), sessionId: uuid('session_id'), workItemId: uuid('work_item_id'), projectId: uuid('project_id'), planStepId: uuid('plan_step_id'), kind: text('kind').notNull(), intentKey: text('intent_key').notNull(), payload: jsonb('payload').notNull(), expectedHeadSha: text('expected_head_sha'), approvalId: uuid('approval_id'), status: providerActionStatus('status').notNull(), attemptCount: integer('attempt_count').notNull(), availableAt: timestamp('available_at', { withTimezone: true }).notNull(), claimedAt: timestamp('claimed_at', { withTimezone: true }), claimedBy: text('claimed_by'), result: jsonb('result'), lastError: text('last_error'), completedAt: timestamp('completed_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const pullRequestProjections = pgTable('pull_request_projections', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), repositoryId: uuid('repository_id').notNull(), externalId: text('external_id').notNull(), number: integer('number').notNull(), uri: text('uri').notNull(), workItemId: uuid('work_item_id'), sessionId: uuid('session_id'), artifactId: uuid('artifact_id'), producerActorId: uuid('producer_actor_id'), baseBranch: text('base_branch').notNull(), headBranch: text('head_branch').notNull(), baseSha: text('base_sha').notNull(), headSha: text('head_sha').notNull(), state: pullRequestState('state').notNull(), draft: boolean('draft').notNull(), revision: integer('revision').notNull(), sourceDeliveryId: uuid('source_delivery_id'), providerObservedAt: timestamp('provider_observed_at', { withTimezone: true }), providerObservationRank: integer('provider_observation_rank').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const commitProjections = pgTable('commit_projections', {
  id: uuid('id').primaryKey(), repositoryId: uuid('repository_id').notNull(), sha: text('sha').notNull(), branch: text('branch').notNull(), beforeSha: text('before_sha'), sourceDeliveryId: uuid('source_delivery_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const ciCheckProjections = pgTable('ci_check_projections', {
  id: uuid('id').primaryKey(), pullRequestId: uuid('pull_request_id').notNull(), externalId: text('external_id').notNull(), name: text('name').notNull(), status: normalizedCheckStatus('status').notNull(), required: boolean('required').notNull(), headSha: text('head_sha').notNull(), detailsUrl: text('details_url'), startedAt: timestamp('started_at', { withTimezone: true }), completedAt: timestamp('completed_at', { withTimezone: true }), sourceDeliveryId: uuid('source_delivery_id'), providerObservedAt: timestamp('provider_observed_at', { withTimezone: true }), providerObservationRank: integer('provider_observation_rank').notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const providerReviewProjections = pgTable('provider_review_projections', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), repositoryId: uuid('repository_id').notNull(), pullRequestId: uuid('pull_request_id').notNull(), externalId: text('external_id').notNull(), state: text('state').notNull(), headSha: text('head_sha').notNull(), authorExternalId: text('author_external_id').notNull(), authorLogin: text('author_login'), uri: text('uri'), sourceDeliveryId: uuid('source_delivery_id').notNull(), providerObservedAt: timestamp('provider_observed_at', { withTimezone: true }).notNull(), providerObservationRank: integer('provider_observation_rank').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const structuredReviews = pgTable('structured_reviews', {
  id: uuid('id').primaryKey(), pullRequestId: uuid('pull_request_id').notNull(), reviewerSessionId: uuid('reviewer_session_id').notNull(), reviewerActorId: uuid('reviewer_actor_id').notNull(), artifactId: uuid('artifact_id').notNull(), headSha: text('head_sha').notNull(), verdict: reviewVerdict('verdict').notNull(), summary: text('summary').notNull(), evidence: jsonb('evidence').notNull(), metadata: jsonb('metadata').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const structuredReviewFindings = pgTable('structured_review_findings', {
  id: uuid('id').primaryKey(), reviewId: uuid('review_id').notNull(), severity: findingSeverity('severity').notNull(), title: text('title').notNull(), body: text('body'), path: text('path'), line: integer('line').notNull(), file: text('file').notNull(), summary: text('summary').notNull(), evidence: text('evidence').notNull(), recommendation: text('recommendation').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const mergeApprovalBindings = pgTable('merge_approval_bindings', {
  approvalId: uuid('approval_id').primaryKey(), connectionId: uuid('connection_id').notNull(), repositoryId: uuid('repository_id').notNull(), pullRequestId: uuid('pull_request_id').notNull(), providerPullRequestId: text('provider_pull_request_id').notNull(), headSha: text('head_sha').notNull(), method: text('method').notNull(), canonicalPayloadHash: text('canonical_payload_hash').notNull(), invalidatedAt: timestamp('invalidated_at', { withTimezone: true }), invalidationReason: text('invalidation_reason'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const artifactLinks = pgTable('artifact_links', {
  artifactId: uuid('artifact_id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), projectId: uuid('project_id'), workItemId: uuid('work_item_id').notNull(), sessionId: uuid('session_id').notNull(), planStepId: uuid('plan_step_id'), repositoryId: uuid('repository_id'), pullRequestId: uuid('pull_request_id'), provenance: jsonb('provenance').notNull(),
})
export const artifactUploadIntents = pgTable('artifact_upload_intents', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), workItemId: uuid('work_item_id').notNull(), sessionId: uuid('session_id').notNull(), projectId: uuid('project_id'), planStepId: uuid('plan_step_id'), repositoryId: uuid('repository_id').notNull(), pullRequestId: uuid('pull_request_id'), headSha: text('head_sha'), sourceTool: text('source_tool').notNull(), requestedByActorId: uuid('requested_by_actor_id').notNull(), storageKey: text('storage_key').notNull(), filename: text('filename').notNull(), mimeType: text('mime_type').notNull(), sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(), expectedChecksum: text('expected_checksum').notNull(), actualChecksum: text('actual_checksum'), status: artifactUploadStatus('status').notNull(), attemptCount: integer('attempt_count').notNull(), availableAt: timestamp('available_at', { withTimezone: true }).notNull(), claimedAt: timestamp('claimed_at', { withTimezone: true }), claimedBy: text('claimed_by'), lastError: text('last_error'), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), verifiedAt: timestamp('verified_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const projectMilestones = pgTable('project_milestones', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), projectId: uuid('project_id').notNull(), name: text('name').notNull(), description: text('description'), targetDate: date('target_date'), revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const projectUpdates = pgTable('project_updates', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), projectId: uuid('project_id').notNull(), authorActorId: uuid('author_actor_id').notNull(), health: projectHealth('health').notNull(), body: text('body').notNull(), status: projectUpdateStatus('status').notNull(), evidenceArtifactIds: uuid('evidence_artifact_ids').array().notNull(), publishedAt: timestamp('published_at', { withTimezone: true }), revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const projectDependencies = pgTable('project_dependencies', {
  projectId: uuid('project_id').notNull(), dependsOnProjectId: uuid('depends_on_project_id').notNull(), createdByActorId: uuid('created_by_actor_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const completionSuggestions = pgTable('completion_suggestions', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), projectId: uuid('project_id').notNull(), workItemId: uuid('work_item_id').notNull(), pullRequestId: uuid('pull_request_id'), suggestedByActorId: uuid('suggested_by_actor_id').notNull(), rationale: text('rationale').notNull(), evidenceArtifactIds: uuid('evidence_artifact_ids').array().notNull(), status: completionSuggestionStatus('status').notNull(), decidedByActorId: uuid('decided_by_actor_id'), decidedAt: timestamp('decided_at', { withTimezone: true }), revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), sessionId: uuid('session_id').notNull(), workItemId: uuid('work_item_id'), producerActorId: uuid('producer_actor_id').notNull(), type: text('type').notNull(), title: text('title').notNull(), uri: text('uri'), storageKey: text('storage_key'), mimeType: text('mime_type'), sizeBytes: bigint('size_bytes', { mode: 'number' }), checksum: text('checksum'), sourceTool: text('source_tool'), repository: jsonb('repository'), metadata: jsonb('metadata').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), sessionId: uuid('session_id').notNull(), requestedByActorId: uuid('requested_by_actor_id').notNull(), approvalType: text('approval_type').notNull(), actionName: text('action_name').notNull(), actionPayloadSanitized: jsonb('action_payload_sanitized').notNull(), actionPayloadHash: text('action_payload_hash').notNull(), riskLevel: approvalRiskLevel('risk_level').notNull(), rationaleSummary: text('rationale_summary').notNull(), requiredApprovals: integer('required_approvals').notNull(), status: approvalStatus('status').notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), consumedAt: timestamp('consumed_at', { withTimezone: true }), revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const approvalDecisions = pgTable('approval_decisions', {
  id: uuid('id').primaryKey(), approvalId: uuid('approval_id').notNull(), actorId: uuid('actor_id').notNull(), decision: text('decision').notNull(), reason: text('reason').notNull(), decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
})
export const agentSessionTokens = pgTable('agent_session_tokens', {
  id: uuid('id').primaryKey(), sessionId: uuid('session_id').notNull(), agentId: uuid('agent_id').notNull(), installationTokenId: uuid('installation_token_id').notNull(), tokenHash: text('token_hash').notNull(), exchangeNonceHash: text('exchange_nonce_hash').notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), exchangedAt: timestamp('exchanged_at', { withTimezone: true }), revokedAt: timestamp('revoked_at', { withTimezone: true }), issuedByActorId: uuid('issued_by_actor_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const agentWebhookDeliveries = pgTable('agent_webhook_deliveries', {
  id: uuid('id').primaryKey(), agentId: uuid('agent_id').notNull(), endpointId: uuid('endpoint_id').notNull(), secretVersion: integer('secret_version').notNull(), eventId: uuid('event_id'), deliveryId: text('delivery_id').notNull(), eventType: text('event_type').notNull(), sessionId: uuid('session_id'), payload: jsonb('payload').notNull(), status: webhookDeliveryStatus('status').notNull(), attemptCount: integer('attempt_count').notNull(), availableAt: timestamp('available_at', { withTimezone: true }).notNull(), lockedAt: timestamp('locked_at', { withTimezone: true }), lockedBy: text('locked_by'), deliveredAt: timestamp('delivered_at', { withTimezone: true }), lastError: text('last_error'), deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const inboxItems = pgTable('inbox_items', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), recipientHumanActorId: uuid('recipient_human_actor_id'), recipientActorId: uuid('recipient_actor_id').notNull(), recipientSessionId: uuid('recipient_session_id'), claimedBySessionId: uuid('claimed_by_session_id'), claimedAt: timestamp('claimed_at', { withTimezone: true }), teamId: uuid('team_id'), sessionId: uuid('session_id'), kind: inboxItemKind('kind').notNull(), sourceType: text('source_type').notNull(), sourceId: uuid('source_id').notNull(), sourceRoomMessageId: uuid('source_room_message_id'), requiresResponse: boolean('requires_response').notNull(), status: inboxItemStatus('status').notNull(), revision: integer('revision').notNull(), payload: jsonb('payload').notNull(), resolvedAt: timestamp('resolved_at', { withTimezone: true }), resolvedByActorId: uuid('resolved_by_actor_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const inboxItemReceipts = pgTable('inbox_item_receipts', { id: uuid('id').primaryKey(), inboxItemId: uuid('inbox_item_id').notNull(), workspaceId: uuid('workspace_id').notNull(), actorId: uuid('actor_id').notNull(), sessionId: uuid('session_id').notNull(), kind: inboxReceiptKind('kind').notNull(), replyMessageId: uuid('reply_message_id'), correlationId: text('correlation_id').notNull(), idempotencyKey: text('idempotency_key').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull() })

export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), dedupeKey: text('dedupe_key').notNull(),
  agentId: uuid('agent_id').notNull(), sessionId: uuid('session_id').notNull(), projectId: uuid('project_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(), inputTokens: bigint('input_tokens', { mode: 'number' }),
  outputTokens: bigint('output_tokens', { mode: 'number' }), runtimeMs: bigint('runtime_ms', { mode: 'number' }),
  toolCalls: integer('tool_calls'),
  costMinor: bigint('cost_minor', { mode: 'bigint' }),
  currency: text('currency').notNull(),
  costSource: costSource('cost_source').notNull(), metadata: jsonb('metadata').notNull(), recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
})
export const budgetPolicies = pgTable('budget_policies', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), scopeType: budgetScope('scope_type').notNull(),
  scopeId: uuid('scope_id').notNull(), currency: text('currency').notNull(),
  softCostMinor: bigint('soft_cost_minor', { mode: 'bigint' }),
  hardCostMinor: bigint('hard_cost_minor', { mode: 'bigint' }),
  softTokens: bigint('soft_tokens', { mode: 'number' }),
  hardTokens: bigint('hard_tokens', { mode: 'number' }), revision: integer('revision').notNull(), createdByActorId: uuid('created_by_actor_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const notificationPreferences = pgTable('notification_preferences', {
  workspaceId: uuid('workspace_id').notNull(), actorId: uuid('actor_id').notNull(), channels: notificationChannel('channels').array().notNull(),
  digest: text('digest').notNull(), minimumPriority: notificationPriority('minimum_priority').notNull(), mutedKinds: text('muted_kinds').array().notNull(),
  webhookUrl: text('webhook_url'), revision: integer('revision').notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), recipientActorId: uuid('recipient_actor_id').notNull(),
  priority: notificationPriority('priority').notNull(), kind: text('kind').notNull(), title: text('title').notNull(), body: text('body').notNull(),
  sourceType: text('source_type').notNull(), sourceId: uuid('source_id').notNull(), dedupeKey: text('dedupe_key').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').primaryKey(), notificationId: uuid('notification_id').notNull(), channel: notificationChannel('channel').notNull(),
  status: notificationDeliveryStatus('status').notNull(), attemptCount: integer('attempt_count').notNull(),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull(), claimedAt: timestamp('claimed_at', { withTimezone: true }),
  claimedBy: text('claimed_by'), claimFence: integer('claim_fence').notNull(), effectKey: text('effect_key').notNull(),
  effectCompletedAt: timestamp('effect_completed_at', { withTimezone: true }), deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  lastError: text('last_error'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const automationRules = pgTable('automation_rules', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), teamId: uuid('team_id'), name: text('name').notNull(),
  state: automationRuleState('state').notNull(), currentVersionId: uuid('current_version_id'), revision: integer('revision').notNull(),
  createdByActorId: uuid('created_by_actor_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const automationRuleVersions = pgTable('automation_rule_versions', {
  id: uuid('id').primaryKey(), ruleId: uuid('rule_id').notNull(), version: integer('version').notNull(), trigger: jsonb('trigger').notNull(),
  condition: jsonb('condition'), actions: jsonb('actions').notNull(), maxAttempts: integer('max_attempts').notNull(),
  createdByActorId: uuid('created_by_actor_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const automationOccurrences = pgTable('automation_occurrences', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), ruleId: uuid('rule_id').notNull(),
  ruleVersionId: uuid('rule_version_id').notNull(), occurrenceKey: text('occurrence_key').notNull(), eventId: uuid('event_id'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }), payload: jsonb('payload').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const automationRuns = pgTable('automation_runs', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), teamId: uuid('team_id'), ruleId: uuid('rule_id'),
  ruleVersionId: uuid('rule_version_id'), occurrenceId: uuid('occurrence_id'), loopId: uuid('loop_id'), sessionId: uuid('session_id'),
  dryRun: boolean('dry_run').notNull(), status: automationRunStatus('status').notNull(), trace: jsonb('trace').notNull(),
  attemptCount: integer('attempt_count').notNull(), maxAttempts: integer('max_attempts').notNull(),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull(), claimedAt: timestamp('claimed_at', { withTimezone: true }),
  claimedBy: text('claimed_by'), claimFence: integer('claim_fence').notNull(), startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }), lastError: text('last_error'),
  enforceNoOverlap: boolean('enforce_no_overlap').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const automationEffects = pgTable('automation_effects', {
  id: uuid('id').primaryKey(), runId: uuid('run_id').notNull(), actionOrdinal: integer('action_ordinal').notNull(),
  effectKey: text('effect_key').notNull(), action: jsonb('action').notNull(), status: automationEffectStatus('status').notNull(),
  attemptCount: integer('attempt_count').notNull(), availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }), claimedBy: text('claimed_by'), claimFence: integer('claim_fence').notNull(),
  externalCheckpoint: jsonb('external_checkpoint'), externalCompletedAt: timestamp('external_completed_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }), lastError: text('last_error'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const automationExternalEffectIntents = pgTable('automation_external_effect_intents', {
  effectId: uuid('effect_id').primaryKey(), effectKey: text('effect_key').notNull(), requestHash: text('request_hash').notNull(),
  state: automationExternalIntentState('state').notNull(), responseStatus: integer('response_status'), responseReceipt: text('response_receipt'),
  preparedAt: timestamp('prepared_at', { withTimezone: true }).notNull(), acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
})
export const loops = pgTable('loops', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), teamId: uuid('team_id'), projectId: uuid('project_id'),
  name: text('name').notNull(), ownerActorId: uuid('owner_actor_id').notNull(), agentId: uuid('agent_id').notNull(),
  runTemplateVersionId: uuid('run_template_version_id').notNull(), trigger: jsonb('trigger').notNull(), budget: jsonb('budget').notNull(),
  noOverlap: boolean('no_overlap').notNull(), visibility: text('visibility').notNull(), failureNotification: text('failure_notification').notNull(),
  state: loopState('state').notNull(), nextRunAt: timestamp('next_run_at', { withTimezone: true }), revision: integer('revision').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const loopBudgetReservations = pgTable('loop_budget_reservations', {
  id: uuid('id').primaryKey(), loopId: uuid('loop_id').notNull(), automationRunId: uuid('automation_run_id').notNull(),
  amount: jsonb('amount').notNull(), status: budgetReservationStatus('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), releasedAt: timestamp('released_at', { withTimezone: true }),
})
export const projectHealthUpdates = pgTable('project_health_updates', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), projectId: uuid('project_id').notNull(),
  authorActorId: uuid('author_actor_id').notNull(), source: healthUpdateSource('source').notNull(), health: planningHealth('health').notNull(),
  summary: text('summary').notNull(), forecastAt: timestamp('forecast_at', { withTimezone: true }), confidence: numeric('confidence').notNull(),
  uncertainty: text('uncertainty').notNull(), status: healthUpdateStatus('status').notNull(), approvalId: uuid('approval_id'),
  publishedAt: timestamp('published_at', { withTimezone: true }), revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const projectHealthSources = pgTable('project_health_sources', {
  updateId: uuid('update_id').notNull(), ordinal: integer('ordinal').notNull(), sourceKind: text('source_kind').notNull(),
  sourceId: uuid('source_id').notNull(), observedAt: timestamp('observed_at', { withTimezone: true }).notNull(), value: jsonb('value').notNull(),
})
export const a2aAgentBindings = pgTable('a2a_agent_bindings', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), agentId: uuid('agent_id').notNull(),
  protocolVersion: text('protocol_version').notNull(), externalAgentUrl: text('external_agent_url').notNull(), cardHash: text('card_hash').notNull(),
  active: boolean('active').notNull(), revision: integer('revision').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const a2aTaskBindings = pgTable('a2a_task_bindings', {
  id: uuid('id').primaryKey(), bindingId: uuid('binding_id').notNull(), externalTaskId: text('external_task_id').notNull(),
  sessionId: uuid('session_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const a2aDeliveries = pgTable('a2a_deliveries', {
  id: uuid('id').primaryKey(), bindingId: uuid('binding_id').notNull(), deliveryId: text('delivery_id').notNull(),
  externalTaskId: text('external_task_id'), direction: text('direction').notNull(), sequence: bigint('sequence', { mode: 'number' }), sessionId: uuid('session_id'),
  domainEventId: uuid('domain_event_id'), payload: jsonb('payload').notNull(), status: a2aDeliveryStatus('status').notNull(),
  attemptCount: integer('attempt_count').notNull(), lastError: text('last_error'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(), processedAt: timestamp('processed_at', { withTimezone: true }),
})
