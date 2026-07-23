import { bigint, boolean, customType, date, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

const binary = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' })

export const actorKind = pgEnum('actor_kind', ['human', 'agent', 'service'])
export const workspaceRole = pgEnum('workspace_role', ['admin', 'member'])
export const membershipRole = pgEnum('membership_role', ['admin', 'maintainer', 'member'])
export const statusCategory = pgEnum('status_category', ['backlog', 'planned', 'started', 'completed', 'canceled'])
export const outboxStatus = pgEnum('outbox_status', ['pending', 'delivering', 'delivered', 'dead'])
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
export const inboxItemKind = pgEnum('inbox_item_kind', ['waiting_input', 'approval', 'session_stale'])
export const inboxItemStatus = pgEnum('inbox_item_status', ['open', 'resolved'])

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
  responsibleHumanActorId: uuid('responsible_human_actor_id'), labels: text('labels').array().notNull(), projectId: uuid('project_id'), revision: integer('revision').notNull(),
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
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(), actorId: uuid('actor_id').notNull(), tokenHash: text('token_hash').notNull(), csrfToken: text('csrf_token').notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const apiIdempotencyKeys = pgTable('api_idempotency_keys', {
  workspaceId: uuid('workspace_id').notNull(), actorId: uuid('actor_id').notNull(), idempotencyKey: text('idempotency_key').notNull(), operation: text('operation').notNull(), requestHash: text('request_hash').notNull(),
  responseStatus: integer('response_status'), responseBody: jsonb('response_body'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const domainEvents = pgTable('domain_events', {
  cursor: bigint('cursor', { mode: 'number' }).primaryKey(), id: uuid('id').notNull(), workspaceId: uuid('workspace_id').notNull(), teamId: uuid('team_id'), audienceActorId: uuid('audience_actor_id'),
  eventType: text('event_type').notNull(), eventVersion: integer('event_version').notNull(), aggregateType: text('aggregate_type').notNull(), aggregateId: uuid('aggregate_id').notNull(), aggregateRevision: integer('aggregate_revision'),
  actorId: uuid('actor_id').notNull(), correlationId: text('correlation_id').notNull(), idempotencyKey: text('idempotency_key'), sessionId: uuid('session_id'), sessionSequence: bigint('session_sequence', { mode: 'number' }), causationId: uuid('causation_id'), payload: jsonb('payload').notNull(), occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
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
  stopRequestedAt: timestamp('stop_requested_at', { withTimezone: true }), stopAcknowledgedAt: timestamp('stop_acknowledged_at', { withTimezone: true }), resultSummary: text('result_summary'), resultEvidence: jsonb('result_evidence').notNull(),
  noArtifactReason: text('no_artifact_reason'), errorCode: text('error_code'), errorSummary: text('error_summary'), endedAt: timestamp('ended_at', { withTimezone: true }), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const agentPlanVersions = pgTable('agent_plan_versions', {
  id: uuid('id').primaryKey(), sessionId: uuid('session_id').notNull(), revision: integer('revision').notNull(), parentVersionId: uuid('parent_version_id'), changeSummary: text('change_summary').notNull(), authorActorId: uuid('author_actor_id').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const agentPlanSteps = pgTable('agent_plan_steps', {
  planVersionId: uuid('plan_version_id').notNull(), id: uuid('id').notNull(), title: text('title').notNull(), description: text('description'), status: planStepStatus('status').notNull(), ordinal: integer('ordinal').notNull(), ownerActorId: uuid('owner_actor_id'),
  acceptanceCriteria: jsonb('acceptance_criteria').notNull(), expectedArtifacts: text('expected_artifacts').array().notNull(), cancellationReason: text('cancellation_reason'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
export const agentPlanStepDependencies = pgTable('agent_plan_step_dependencies', {
  planVersionId: uuid('plan_version_id').notNull(), stepId: uuid('step_id').notNull(), dependsOnStepId: uuid('depends_on_step_id').notNull(),
})
export const agentActivities = pgTable('agent_activities', {
  id: uuid('id').primaryKey(), sessionId: uuid('session_id').notNull(), actorId: uuid('actor_id').notNull(), sequence: bigint('sequence', { mode: 'number' }).notNull(), kind: text('kind').notNull(), summary: text('summary').notNull(),
  detailsMarkdown: text('details_markdown'), toolInvocation: jsonb('tool_invocation'), artifactIds: uuid('artifact_ids').array().notNull(), referencesJson: jsonb('references_json').notNull(), visibility: activityVisibility('visibility').notNull(), ephemeral: boolean('ephemeral').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
export const agentSessionPrompts = pgTable('agent_session_prompts', {
  id: uuid('id').primaryKey(), sessionId: uuid('session_id').notNull(), authorActorId: uuid('author_actor_id').notNull(), bodyMarkdown: text('body_markdown').notNull(), planRevision: integer('plan_revision'), workItemRevision: integer('work_item_revision'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
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
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), recipientHumanActorId: uuid('recipient_human_actor_id').notNull(), sessionId: uuid('session_id'), kind: inboxItemKind('kind').notNull(), sourceType: text('source_type').notNull(), sourceId: uuid('source_id').notNull(), status: inboxItemStatus('status').notNull(), payload: jsonb('payload').notNull(), resolvedAt: timestamp('resolved_at', { withTimezone: true }), resolvedByActorId: uuid('resolved_by_actor_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
