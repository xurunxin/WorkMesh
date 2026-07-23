import { z } from 'zod'

export const idSchema = z.string().uuid()
export const timestampSchema = z.string().datetime({ offset: true })
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const revisionSchema = z.number().int().positive()
export const actorKindSchema = z.enum(['human', 'agent', 'service'])
export const membershipRoleSchema = z.enum(['admin', 'maintainer', 'member'])
export const statusCategorySchema = z.enum(['backlog', 'planned', 'started', 'completed', 'canceled'])
export const prioritySchema = z.enum(['none', 'urgent', 'high', 'medium', 'low'])
export const savedViewLayoutSchema = z.enum(['list', 'board'])

// Request DTOs deliberately retain the existing camelCase API field names.
export const workspaceInputSchema = z.object({ name: z.string().min(1).max(120), slug: z.string().regex(/^[a-z0-9-]+$/).max(80) })
export const teamInputSchema = z.object({ name: z.string().min(1).max(120), key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/) })
export const stateInputSchema = z.object({ name: z.string().min(1).max(80), category: statusCategorySchema, color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), position: z.number().int().nonnegative().optional() })
export const projectInputSchema = z.object({ teamId: idSchema, name: z.string().min(1).max(180), summary: z.string().max(500).optional(), description: z.string().max(20000).nullable().optional(), status: z.string().max(80).optional(), leadActorId: idSchema.nullable().optional(), targetDate: z.coerce.date().nullable().optional() })
export const workItemInputSchema = z.object({ teamId: idSchema, title: z.string().min(1).max(500), description: z.string().max(50000).optional(), statusId: idSchema, priority: prioritySchema.default('none'), dueDate: z.coerce.date().optional(), responsibleHumanActorId: idSchema.optional(), labels: z.array(z.string().min(1).max(60)).max(30).default([]), projectId: idSchema.optional() })
export const workItemPatchSchema = workItemInputSchema.partial().omit({ teamId: true }).extend({ description: z.string().max(50000).nullable().optional(), dueDate: z.coerce.date().nullable().optional(), responsibleHumanActorId: idSchema.nullable().optional(), projectId: idSchema.nullable().optional() })
export const commentInputSchema = z.object({ body: z.string().min(1).max(50000), parentCommentId: idSchema.optional(), replyToCommentId: idSchema.optional(), mentions: z.array(idSchema).max(20).default([]) })
export const commentPatchSchema = z.object({ body: z.string().min(1).max(50000).optional(), isResolved: z.boolean().optional(), deleted: z.boolean().optional() })
export const savedViewFiltersSchema = z.record(z.unknown())
export const savedViewInputSchema = z.object({ name: z.string().min(1).max(80), teamId: idSchema.optional(), filters: savedViewFiltersSchema.default({}), layout: savedViewLayoutSchema.default('list') })
export const installInputSchema = workspaceInputSchema.extend({ adminName: z.string().min(1).max(120), email: z.string().email(), password: z.string().min(12) })
export const loginInputSchema = z.object({ email: z.string().email(), password: z.string().min(1) })

// Response DTOs use the PostgreSQL/API wire representation: snake_case keys.
export const workspaceResponseSchema = z.object({ id: idSchema, name: z.string(), slug: z.string(), revision: revisionSchema, created_at: timestampSchema, updated_at: timestampSchema })
export const teamResponseSchema = z.object({ id: idSchema, workspace_id: idSchema, name: z.string(), key: z.string(), next_work_item_number: z.number().int().positive(), revision: revisionSchema, deleted_at: timestampSchema.nullable(), created_at: timestampSchema, updated_at: timestampSchema })
export const membershipResponseSchema = z.object({ workspace_id: idSchema, team_id: idSchema.nullable(), actor_id: idSchema, role: membershipRoleSchema, created_at: timestampSchema })
export const workflowStateResponseSchema = z.object({ id: idSchema, team_id: idSchema, name: z.string(), category: statusCategorySchema, color: z.string(), position: z.number().int().nonnegative(), is_archived: z.boolean(), revision: revisionSchema, created_at: timestampSchema, updated_at: timestampSchema })
export const humanActorResponseSchema = z.object({ id: idSchema, email: z.string().email(), display_name: z.string(), kind: z.literal('human').optional(), is_active: z.boolean().optional(), workspace_id: idSchema.optional(), created_at: timestampSchema.optional() })
export const projectResponseSchema = z.object({ id: idSchema, workspace_id: idSchema, team_id: idSchema, name: z.string(), summary: z.string().nullable(), description: z.string().nullable(), status: z.string(), lead_actor_id: idSchema.nullable(), target_date: dateSchema.nullable(), revision: revisionSchema, deleted_at: timestampSchema.nullable(), created_at: timestampSchema, updated_at: timestampSchema })
export const workItemResponseSchema = z.object({ id: idSchema, workspace_id: idSchema, team_id: idSchema, number: z.number().int().positive(), title: z.string(), description: z.string().nullable(), status_id: idSchema, priority: prioritySchema, due_date: dateSchema.nullable(), responsible_human_actor_id: idSchema.nullable(), labels: z.array(z.string()), project_id: idSchema.nullable(), revision: revisionSchema, deleted_at: timestampSchema.nullable(), created_at: timestampSchema, updated_at: timestampSchema, team_key: z.string(), status_name: z.string(), status_category: statusCategorySchema })
export const mentionResponseSchema = z.object({ actor_id: idSchema, display_name: z.string().optional() })
export const commentResponseSchema = z.object({ id: idSchema, channel_id: idSchema, author_actor_id: idSchema, author_name: z.string(), parent_comment_id: idSchema.nullable(), reply_to_comment_id: idSchema.nullable(), body: z.string(), mentions: z.array(idSchema), is_resolved: z.boolean(), revision: revisionSchema, deleted_at: timestampSchema.nullable(), created_at: timestampSchema, updated_at: timestampSchema })
export const savedViewResponseSchema = z.object({ id: z.string(), workspace_id: idSchema.optional(), owner_actor_id: idSchema.optional(), team_id: idSchema.nullable().optional(), name: z.string(), filters: savedViewFiltersSchema, layout: savedViewLayoutSchema, built_in: z.boolean().optional(), revision: revisionSchema.optional(), created_at: timestampSchema.optional(), updated_at: timestampSchema.optional() })
export const commandResponseSchema = z.object({ id: idSchema, revision: revisionSchema })
export const sessionResponseSchema = z.object({ csrf_token: z.string().min(1) })
export const authMeResponseSchema = z.object({ actor: humanActorResponseSchema, csrf_token: z.string().min(1) })
export const installationStatusResponseSchema = z.object({ installed: z.boolean() })
export const healthResponseSchema = z.object({ status: z.literal('ok') })

// Events are intentionally passthrough so consumers remain compatible with newer event fields.
export const eventEnvelopeSchema = z.object({ cursor: z.number().int().nonnegative(), id: idSchema, event_type: z.string().min(1), event_version: z.number().int().positive(), workspace_id: idSchema, team_id: idSchema.nullable().optional(), audience_actor_id: idSchema.nullable().optional(), aggregate_type: z.string().min(1), aggregate_id: idSchema, aggregate_revision: revisionSchema.nullable(), actor_id: idSchema, correlation_id: z.string().min(1), idempotency_key: z.string().nullable(), payload: z.unknown(), occurred_at: timestampSchema }).passthrough()

export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'LAST_ACTIVE_TEAM_CONFLICT',
  'REVISION_CONFLICT',
  'IF_MATCH_REQUIRED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_REPLAY_UNAVAILABLE',
  'CSRF_FAILED',
  'INVALID_CREDENTIALS',
  'INSTALLATION_ALREADY_COMPLETED',
  'RESPONSIBLE_HUMAN_REQUIRED',
  'INTERNAL_ERROR',
])
export const errorResponseSchema = z.object({ error: z.object({ code: apiErrorCodeSchema, message: z.string(), details: z.unknown().optional(), correlationId: z.string().min(1) }) })

// Kept as a permissive helper so existing API error handling remains source-compatible.
export const errorBody = (code: string, message: string, correlationId: string, details?: unknown) => ({ error: { code, message, details, correlationId } })

export const stage0RouteManifest = [
  { method: 'GET', path: '/health', authenticated: false },
  { method: 'GET', path: '/api/v1/install-status', authenticated: false },
  { method: 'POST', path: '/api/v1/auth/install', authenticated: false, mutation: true },
  { method: 'POST', path: '/api/v1/auth/login', authenticated: false, mutation: true },
  { method: 'POST', path: '/api/v1/auth/logout', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/auth/me', authenticated: true },
  { method: 'GET', path: '/api/v1/workspace', authenticated: true },
  { method: 'PATCH', path: '/api/v1/workspace', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/teams', authenticated: true },
  { method: 'POST', path: '/api/v1/teams', authenticated: true, mutation: true },
  { method: 'PATCH', path: '/api/v1/teams/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'DELETE', path: '/api/v1/teams/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/teams/{id}/states', authenticated: true },
  { method: 'POST', path: '/api/v1/teams/{id}/states', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/projects', authenticated: true },
  { method: 'POST', path: '/api/v1/projects', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/projects/{id}', authenticated: true },
  { method: 'PATCH', path: '/api/v1/projects/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'DELETE', path: '/api/v1/projects/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/actors/humans', authenticated: true },
  { method: 'GET', path: '/api/v1/work-items', authenticated: true },
  { method: 'POST', path: '/api/v1/work-items', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/work-items/{id}', authenticated: true },
  { method: 'PATCH', path: '/api/v1/work-items/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'DELETE', path: '/api/v1/work-items/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/work-items/{id}/comments', authenticated: true },
  { method: 'POST', path: '/api/v1/work-items/{id}/comments', authenticated: true, mutation: true },
  { method: 'PATCH', path: '/api/v1/comments/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/views', authenticated: true },
  { method: 'POST', path: '/api/v1/views', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/events', authenticated: true },
  { method: 'GET', path: '/api/v1/events/stream', authenticated: true },
] as const

export type StatusCategory = z.infer<typeof statusCategorySchema>
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>

// Stage 1: agent execution contracts. These stay transport-only: authorization
// and state-machine policy belong to @workmesh/domain.
export const agentProtocolSchema = z.enum(['native_http', 'mcp', 'a2a'])
export const capabilitySchema = z.enum([
  'work:read', 'work:write', 'comment:write', 'plan:write', 'message:write', 'artifact:write',
  'repo:read', 'repo:write_branch', 'repo:open_pr', 'repo:merge', 'ci:run', 'deploy:staging',
  'deploy:production', 'secrets:use', 'automation:manage', 'admin:*',
])
export const delegationRoleSchema = z.enum(['executor', 'reviewer', 'researcher', 'coordinator', 'triager'])
export const delegationScopeTypeSchema = z.enum(['work_item', 'plan_step', 'project', 'automation'])
export const delegationStatusSchema = z.enum(['active', 'revoked', 'expired', 'completed'])
export const agentSessionStateSchema = z.enum([
  'queued', 'acknowledged', 'planning', 'executing', 'awaiting_input', 'awaiting_approval',
  'blocked', 'paused', 'stopping', 'stale', 'completed', 'failed', 'canceled',
])
export const planStepStatusSchema = z.enum(['pending', 'in_progress', 'blocked', 'completed', 'canceled'])
export const activityKindSchema = z.enum([
  'ack', 'status', 'plan_published', 'plan_changed', 'action_started', 'action_completed', 'evidence',
  'question', 'decision_request', 'message', 'artifact_published', 'warning', 'error', 'completion', 'heartbeat', 'stop_ack',
])
export const approvalStatusSchema = z.enum(['pending', 'approved', 'rejected', 'expired', 'consumed', 'canceled'])
export const approvalRiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical'])
export const checkStatusSchema = z.enum(['passed', 'failed', 'skipped'])
export const visibilitySchema = z.enum(['workspace', 'team', 'private'])
export const artifactTypeSchema = z.enum(['commit', 'pull_request', 'test_report', 'document', 'link', 'file', 'other'])

const agentRegistrationFieldsSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  description: z.string().max(2_000).optional(),
  icon: z.string().url().optional(),
  provider: z.string().min(1).max(120),
  version: z.string().min(1).max(120),
  endpointUrl: z.string().url().optional(),
  supportedProtocols: z.array(agentProtocolSchema).min(1).max(3),
  skills: z.array(z.string().min(1).max(120)).max(100).default([]),
  requestedCapabilities: z.array(capabilitySchema).max(50).default([]),
  // Only workspace admins may submit this field. Authorization is enforced by the command gate.
  approvedCapabilities: z.array(capabilitySchema).max(50).optional(),
  outputArtifactTypes: z.array(artifactTypeSchema).max(20).default([]),
  maxConcurrency: z.number().int().positive().max(100).default(1),
  heartbeatIntervalSeconds: z.number().int().positive().max(3_600).default(30),
  metadata: z.record(z.unknown()).default({}),
})
const approvedCapabilitiesAreRequested = (requested: readonly z.infer<typeof capabilitySchema>[], approved: readonly z.infer<typeof capabilitySchema>[] | undefined): boolean => !approved || approved.every(capability => requested.includes(capability))
export const agentRegistrationInputSchema = agentRegistrationFieldsSchema.superRefine((value, context) => {
  if (!approvedCapabilitiesAreRequested(value.requestedCapabilities, value.approvedCapabilities)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Approved capabilities must be a subset of requested capabilities', path: ['approvedCapabilities'] })
})
export const agentPatchSchema = agentRegistrationFieldsSchema.partial().omit({ slug: true }).extend({ isActive: z.boolean().optional() }).superRefine((value, context) => {
  if (Object.keys(value).length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one field is required' })
  if (value.requestedCapabilities && !approvedCapabilitiesAreRequested(value.requestedCapabilities, value.approvedCapabilities)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Approved capabilities must be a subset of requested capabilities', path: ['approvedCapabilities'] })
})
export const agentTeamAccessInputSchema = z.object({ approvedCapabilities: z.array(capabilitySchema).min(1).max(50) })
export const agentTeamAccessResponseSchema = z.object({
  agent_id: idSchema, team_id: idSchema, approved_capabilities: z.array(capabilitySchema), status: z.enum(['active', 'revoked']),
  approved_by_actor_id: idSchema, revision: revisionSchema, created_at: timestampSchema, updated_at: timestampSchema, revoked_at: timestampSchema.nullable(),
})
export const agentResponseSchema = z.object({
  id: idSchema, workspace_id: idSchema, actor_id: idSchema, name: z.string(), slug: z.string(), description: z.string().nullable(),
  icon: z.string().nullable(), provider: z.string(), version: z.string(), endpoint_url: z.string().nullable(),
  supported_protocols: z.array(agentProtocolSchema), skills: z.array(z.string()), requested_capabilities: z.array(capabilitySchema),
  approved_capabilities: z.array(capabilitySchema), output_artifact_types: z.array(artifactTypeSchema), max_concurrency: z.number().int().positive(),
  heartbeat_interval_seconds: z.number().int().positive(), metadata: z.record(z.unknown()), team_access: z.array(agentTeamAccessResponseSchema), is_active: z.boolean(), revision: revisionSchema,
  created_at: timestampSchema, updated_at: timestampSchema,
})

export const capabilityScopeSchema = z.object({
  workspaceId: idSchema,
  teamIds: z.array(idSchema).max(100).default([]),
  projectIds: z.array(idSchema).max(100).default([]),
  workItemIds: z.array(idSchema).max(1_000).default([]),
  repositoryIds: z.array(z.string().min(1).max(300)).max(100).default([]),
  capabilities: z.array(capabilitySchema).max(50),
})
export const delegationInputSchema = z.object({
  agentId: idSchema,
  principalHumanActorId: idSchema,
  role: delegationRoleSchema,
  scopeType: delegationScopeTypeSchema,
  scopeId: idSchema,
  permissionsSnapshot: z.array(capabilitySchema).min(1).max(50),
  capabilityScope: capabilityScopeSchema,
  startsAt: timestampSchema.optional(),
  endsAt: timestampSchema.optional(),
})
export const delegationResponseSchema = z.object({
  id: idSchema, workspace_id: idSchema, agent_id: idSchema, agent_actor_id: idSchema, principal_human_actor_id: idSchema,
  work_item_id: idSchema.nullable(), role: delegationRoleSchema, scope_type: delegationScopeTypeSchema, scope_id: idSchema,
  permissions_snapshot: z.array(capabilitySchema), capability_scope: capabilityScopeSchema, status: delegationStatusSchema,
  created_by_actor_id: idSchema, starts_at: timestampSchema.nullable(), ends_at: timestampSchema.nullable(), revoked_at: timestampSchema.nullable(),
  revision: revisionSchema, created_at: timestampSchema, updated_at: timestampSchema,
})

export const budgetSchema = z.object({ maxRuntimeSeconds: z.number().int().positive().max(604_800).optional(), maxInputTokens: z.number().int().nonnegative().optional(), maxOutputTokens: z.number().int().nonnegative().optional(), maxCostUsd: z.number().nonnegative().optional() }).default({})
export const externalUrlSchema = z.object({ label: z.string().min(1).max(120), url: z.string().url() })
export const createAgentSessionInputSchema = z.object({
  delegationId: idSchema, workItemId: idSchema.optional(), projectId: idSchema.optional(), planStepId: idSchema.optional(),
  initialPrompt: z.string().min(1).max(50_000), contextSnapshotId: idSchema.optional(), budget: budgetSchema,
}).refine(value => Number(Boolean(value.workItemId)) + Number(Boolean(value.projectId)) + Number(Boolean(value.planStepId)) === 1, 'Exactly one execution subject is required')
export const delegateAndStartAgentSessionInputSchema = z.object({
  agentId: idSchema, principalHumanActorId: idSchema, role: delegationRoleSchema.default('executor'), requestedCapabilities: z.array(capabilitySchema).min(1).max(50),
  initialPrompt: z.string().min(1).max(50_000), contextSnapshotId: idSchema.optional(), budget: budgetSchema,
})
export const agentSessionResponseSchema = z.object({
  id: idSchema, workspace_id: idSchema, agent_id: idSchema, agent_actor_id: idSchema, delegation_id: idSchema,
  work_item_id: idSchema.nullable(), project_id: idSchema.nullable(), plan_step_id: idSchema.nullable(), state: agentSessionStateSchema,
  state_reason: z.string().nullable(), sequence: z.number().int().nonnegative(), revision: revisionSchema, current_plan_version_id: idSchema.nullable(),
  context_snapshot_id: idSchema.nullable(), budget: budgetSchema, external_urls: z.array(externalUrlSchema), last_heartbeat_at: timestampSchema.nullable(),
  retry_of_session_id: idSchema.nullable(), stop_requested_at: timestampSchema.nullable(), ended_at: timestampSchema.nullable(), error_code: z.string().nullable(), error_summary: z.string().nullable(),
  created_at: timestampSchema, updated_at: timestampSchema,
})
export const delegateAndStartAgentSessionResponseSchema = z.object({ delegation: delegationResponseSchema, session: agentSessionResponseSchema })
export const retryAgentSessionInputSchema = z.object({ reason: z.string().min(1).max(2_000), initialPrompt: z.string().min(1).max(50_000).optional(), reuseContext: z.boolean().default(true) })
export const acknowledgeAgentSessionInputSchema = z.object({ summary: z.string().min(1).max(2_000), externalUrls: z.array(externalUrlSchema).max(20).default([]) })
export const exchangeAgentSessionTokenInputSchema = z.object({ exchangeToken: z.string().min(32).max(4_096) })
export const exchangeAgentSessionTokenResponseSchema = z.object({ sessionToken: z.string().min(1), expiresAt: timestampSchema })
export const refreshAgentSessionTokenInputSchema = z.object({ tokenId: z.string().min(1).max(500).optional() })
export const heartbeatInputSchema = z.object({ currentStepId: idSchema.optional(), usage: z.object({ runtimeSeconds: z.number().int().nonnegative(), inputTokens: z.number().int().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional(), toolCalls: z.number().int().nonnegative().optional() }) })
export const promptAgentSessionInputSchema = z.object({ bodyMarkdown: z.string().min(1).max(50_000), planRevision: revisionSchema.optional(), workItemRevision: revisionSchema.optional() })
export const sessionSignalSchema = z.enum(['stop', 'pause', 'resume'])
export const signalAgentSessionInputSchema = z.object({ signal: sessionSignalSchema, reason: z.string().min(1).max(2_000) })
export const stopAcknowledgementInputSchema = z.object({ cleanupSummary: z.string().min(1).max(10_000), residualRisks: z.array(z.string().min(1).max(1_000)).max(50).default([]) })

export const planStepInputSchema = z.object({
  id: idSchema, title: z.string().min(1).max(500), description: z.string().max(20_000).optional(), status: planStepStatusSchema.default('pending'), ordinal: z.number().int().nonnegative(),
  ownerActorId: idSchema.optional(), dependsOn: z.array(idSchema).max(100).default([]), acceptanceCriteria: z.array(z.string().min(1).max(2_000)).max(100).default([]),
  expectedArtifacts: z.array(artifactTypeSchema).max(50).default([]), cancellationReason: z.string().min(1).max(2_000).optional(),
})
export const publishPlanInputSchema = z.object({
  changeSummary: z.string().min(1).max(5_000), steps: z.array(planStepInputSchema).min(1).max(500),
  approvalId: idSchema.optional(), approvalPayloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
}).refine(value => Boolean(value.approvalId) === Boolean(value.approvalPayloadHash), { message: 'approvalId and approvalPayloadHash must be supplied together', path: ['approvalId'] })
export const planStepResponseSchema = planStepInputSchema.extend({ plan_version_id: idSchema, created_at: timestampSchema, updated_at: timestampSchema })
export const planVersionResponseSchema = z.object({ id: idSchema, session_id: idSchema, revision: revisionSchema, parent_version_id: idSchema.nullable(), change_summary: z.string(), author_actor_id: idSchema, created_at: timestampSchema, steps: z.array(planStepResponseSchema) })
/** Immutable plan history ordered by ascending revision for compare views. */
export const planVersionHistoryResponseSchema = z.array(planVersionResponseSchema).superRefine((versions, context) => {
  for (let index = 1; index < versions.length; index += 1) {
    const previous = versions[index - 1]
    const current = versions[index]
    if (previous && current && previous.revision >= current.revision) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Plan history must be ordered by ascending revision', path: [index, 'revision'] })
  }
})

export const toolInvocationSchema = z.object({ toolName: z.string().min(1).max(160), inputSanitized: z.record(z.unknown()).default({}), status: z.enum(['started', 'succeeded', 'failed']), resultSummary: z.string().max(10_000).optional(), externalTraceUrl: z.string().url().optional() })
export const referenceSchema = z.object({ type: z.enum(['work_item', 'plan_step', 'artifact', 'approval']), id: idSchema })
export const appendActivityInputSchema = z.object({
  kind: activityKindSchema, summary: z.string().min(1).max(10_000), detailsMarkdown: z.string().max(50_000).optional(), toolInvocation: toolInvocationSchema.optional(),
  artifactIds: z.array(idSchema).max(100).default([]), references: z.array(referenceSchema).max(100).default([]), visibility: visibilitySchema.default('team'), ephemeral: z.boolean().default(false),
})
export const activityResponseSchema = appendActivityInputSchema.extend({ id: idSchema, session_id: idSchema, actor_id: idSchema, sequence: z.number().int().positive(), created_at: timestampSchema })

export const completionCheckSchema = z.object({ name: z.string().min(1).max(160), command: z.string().max(10_000).optional(), status: checkStatusSchema, summary: z.string().min(1).max(10_000) })
export const completeAgentSessionInputSchema = z.object({ summary: z.string().min(1).max(20_000), artifactIds: z.array(idSchema).max(100).default([]), checks: z.array(completionCheckSchema).max(100).default([]), limitations: z.array(z.string().min(1).max(2_000)).max(100).default([]), noArtifactReason: z.string().min(1).max(2_000).optional() }).refine(value => value.artifactIds.length > 0 || value.checks.length > 0 || Boolean(value.noArtifactReason), { message: 'Completion requires evidence or noArtifactReason' })
export const failAgentSessionInputSchema = z.object({ code: z.string().min(1).max(120), summary: z.string().min(1).max(20_000), retryable: z.boolean().default(false), evidence: z.array(z.string().min(1).max(2_000)).max(100).default([]) })
export const artifactInputSchema = z.object({ sessionId: idSchema, workItemId: idSchema.optional(), type: artifactTypeSchema, title: z.string().min(1).max(500), uri: z.string().url().optional(), checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(), sourceTool: z.string().min(1).max(160).optional(), metadata: z.record(z.unknown()).default({}) })
export const artifactResponseSchema = artifactInputSchema.extend({ id: idSchema, producer_actor_id: idSchema, created_at: timestampSchema })
export const sessionContextResponseSchema = z.object({ session: agentSessionResponseSchema, workItem: workItemResponseSchema.nullable(), plan: planVersionResponseSchema.nullable(), contextSnapshotId: idSchema.nullable(), guidanceUris: z.array(z.string().url()) })
export const guidanceResponseSchema = z.object({ scope: z.enum(['workspace', 'team', 'project']), scopeId: idSchema, revision: revisionSchema, markdown: z.string().max(100_000), updatedAt: timestampSchema })

export const requestApprovalInputSchema = z.object({ sessionId: idSchema, approvalType: z.string().min(1).max(160), actionName: z.string().min(1).max(300), actionPayloadSanitized: z.record(z.unknown()), actionPayloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/), riskLevel: approvalRiskLevelSchema, rationaleSummary: z.string().min(1).max(10_000), requiredApprovals: z.number().int().positive().max(20).default(1), expiresAt: timestampSchema })
export const decideApprovalInputSchema = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().min(1).max(10_000) })
export const approvalQuorumSchema = z.object({ required: z.number().int().positive(), approved: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(), reached: z.boolean() })
export const approvalDecisionSchema = z.object({ actor_id: idSchema, decision: z.enum(['approved', 'rejected']), reason: z.string(), decided_at: timestampSchema })
export const approvalResponseSchema = requestApprovalInputSchema.extend({ id: idSchema, requested_by_actor_id: idSchema, status: approvalStatusSchema, decisions: z.array(approvalDecisionSchema), quorum: approvalQuorumSchema, consumed_at: timestampSchema.nullable(), created_at: timestampSchema, updated_at: timestampSchema })
export const approvalDecisionResponseSchema = z.object({ approval: approvalResponseSchema, decision: approvalDecisionSchema, quorum: approvalQuorumSchema, status: approvalStatusSchema })
export const consumeApprovalInputSchema = z.object({ actionPayloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/) })
export const approvalConsumptionResponseSchema = z.object({ approval_id: idSchema, status: z.literal('consumed'), consumed_at: timestampSchema, action_payload_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/) })

export const agentEventTypeSchema = z.enum(['agent.registered', 'agent.delegation.created', 'agent.delegation.revoked', 'agent.session.created', 'agent.session.acknowledged', 'agent.session.prompted', 'agent.session.state_changed', 'agent.session.stale', 'agent.session.completed', 'agent.session.failed', 'agent.plan.published', 'agent.activity.appended', 'approval.requested', 'approval.decision.recorded', 'approval.approved', 'approval.rejected', 'approval.expired', 'artifact.published'])
export const approvalRequestedEventPayloadSchema = z.object({
  approvalId: idSchema, sessionId: idSchema, status: z.literal('pending'), actionName: z.string().min(1), actionPayloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  requiredApprovals: z.number().int().positive(), expiresAt: timestampSchema,
})
export const approvalDecisionRecordedEventPayloadSchema = z.object({
  approvalId: idSchema, decision: approvalDecisionSchema, quorum: approvalQuorumSchema, status: z.enum(['pending', 'approved', 'rejected']),
})
export const approvalApprovedEventPayloadSchema = z.object({ approvalId: idSchema, status: z.literal('approved'), quorum: approvalQuorumSchema, finalizedAt: timestampSchema })
export const approvalRejectedEventPayloadSchema = z.object({ approvalId: idSchema, status: z.literal('rejected'), quorum: approvalQuorumSchema, finalizedAt: timestampSchema })
export const approvalExpiredEventPayloadSchema = z.object({ approvalId: idSchema, status: z.literal('expired'), expiredAt: timestampSchema })
const approvalEnvelopeBase = { session_id: idSchema, sequence: z.number().int().positive() }
export const approvalEventEnvelopeSchema = z.discriminatedUnion('event_type', [
  eventEnvelopeSchema.extend({ ...approvalEnvelopeBase, event_type: z.literal('approval.requested'), payload: approvalRequestedEventPayloadSchema }).passthrough(),
  eventEnvelopeSchema.extend({ ...approvalEnvelopeBase, event_type: z.literal('approval.decision.recorded'), payload: approvalDecisionRecordedEventPayloadSchema }).passthrough(),
  eventEnvelopeSchema.extend({ ...approvalEnvelopeBase, event_type: z.literal('approval.approved'), payload: approvalApprovedEventPayloadSchema }).passthrough(),
  eventEnvelopeSchema.extend({ ...approvalEnvelopeBase, event_type: z.literal('approval.rejected'), payload: approvalRejectedEventPayloadSchema }).passthrough(),
  eventEnvelopeSchema.extend({ ...approvalEnvelopeBase, event_type: z.literal('approval.expired'), payload: approvalExpiredEventPayloadSchema }).passthrough(),
])
const approvalEventTypes = new Set(['approval.requested', 'approval.decision.recorded', 'approval.approved', 'approval.rejected', 'approval.expired'])
export const agentEventEnvelopeSchema = eventEnvelopeSchema.extend({ event_type: agentEventTypeSchema, session_id: idSchema.nullable().optional(), sequence: z.number().int().positive().optional() }).passthrough().superRefine((event, context) => {
  if (!approvalEventTypes.has(event.event_type)) return
  const parsed = approvalEventEnvelopeSchema.safeParse(event)
  if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue(issue)
})

export const stage1ApiErrorCodeSchema = z.enum([
  'AGENT_NOT_ACTIVE', 'AGENT_CONCURRENCY_LIMIT', 'AGENT_IDENTITY_REQUIRED', 'AGENT_SESSION_NOT_FOUND', 'AGENT_SESSION_TOKEN_MISMATCH',
  'SESSION_NOT_ACTIVE', 'SESSION_STOPPED', 'STOP_ACK_ALREADY_RECORDED', 'INVALID_SESSION_TRANSITION', 'DELEGATION_NOT_ACTIVE',
  'CAPABILITY_DENIED', 'RESOURCE_SCOPE_DENIED', 'APPROVAL_REQUIRED', 'APPROVAL_NOT_APPROVED', 'APPROVAL_EXPIRED', 'APPROVAL_PAYLOAD_MISMATCH',
  'APPROVAL_ALREADY_CONSUMED', 'PLAN_REVISION_CONFLICT', 'PLAN_STEP_ID_REUSED', 'PLAN_STEP_DEPENDENCY_MISSING', 'PLAN_STEP_DEPENDENCY_CYCLE',
  'PLAN_STEP_REMOVAL_INVALID', 'PLAN_STEP_NOT_READY', 'COMPLETION_EVIDENCE_REQUIRED', 'COMPLETION_PLAN_INCOMPLETE', 'LEASE_REQUIRED',
  'AGENT_ADMIN_REQUIRED', 'APPROVED_CAPABILITY_NOT_REQUESTED', 'AGENT_TEAM_ACCESS_NOT_FOUND',
  'AGENT_SESSION_RETRY_NOT_ALLOWED', 'INSTALLATION_TOKEN_REQUIRED', 'INSTALLATION_TOKEN_REVOKED', 'APPROVAL_QUORUM_NOT_REACHED',
  'APPROVAL_SESSION_MISMATCH', 'APPROVAL_CONSUME_CONFLICT',
])
export const agentApiErrorCodeSchema = z.union([apiErrorCodeSchema, stage1ApiErrorCodeSchema])
export const agentErrorResponseSchema = z.object({ error: z.object({ code: agentApiErrorCodeSchema, message: z.string(), details: z.unknown().optional(), correlationId: z.string().min(1) }) })

export const stage1RouteManifest = [
  { method: 'GET', path: '/api/v1/agents', authenticated: true },
  { method: 'POST', path: '/api/v1/agents/register', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/agents/{id}', authenticated: true },
  { method: 'PATCH', path: '/api/v1/agents/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'PUT', path: '/api/v1/agents/{id}/team-access/{teamId}', authenticated: true, mutation: true },
  { method: 'DELETE', path: '/api/v1/agents/{id}/team-access/{teamId}', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/work-items/{id}/delegations', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/work-items/{id}/agent-session', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/delegations/{id}', authenticated: true },
  { method: 'POST', path: '/api/v1/delegations/{id}/revoke', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/agent-sessions', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/agent-sessions', authenticated: true },
  { method: 'GET', path: '/api/v1/agent-sessions/{id}', authenticated: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/token/exchange', authenticated: false, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/token/refresh', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/ack', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/heartbeat', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/prompt', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/activities', authenticated: true, mutation: true },
  { method: 'PUT', path: '/api/v1/agent-sessions/{id}/plan', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/signals', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/stop-ack', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/complete', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/fail', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/retry', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/agent-sessions/{id}/activities', authenticated: true },
  { method: 'GET', path: '/api/v1/agent-sessions/{id}/plan', authenticated: true },
  { method: 'GET', path: '/api/v1/agent-sessions/{id}/plans', authenticated: true },
  { method: 'GET', path: '/api/v1/agent-sessions/{id}/context', authenticated: true },
  { method: 'GET', path: '/api/v1/workspaces/{id}/guidance', authenticated: true },
  { method: 'GET', path: '/api/v1/teams/{id}/guidance', authenticated: true },
  { method: 'GET', path: '/api/v1/projects/{id}/guidance', authenticated: true },
  { method: 'GET', path: '/api/v1/artifacts', authenticated: true },
  { method: 'POST', path: '/api/v1/artifacts', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/approvals', authenticated: true },
  { method: 'POST', path: '/api/v1/approvals', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/approvals/{id}', authenticated: true },
  { method: 'POST', path: '/api/v1/approvals/{id}/decide', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/approvals/{id}/consume', authenticated: true, mutation: true, revisioned: true },
] as const
export const agentRouteManifest = [...stage0RouteManifest, ...stage1RouteManifest] as const

export type AgentSessionState = z.infer<typeof agentSessionStateSchema>
export type Capability = z.infer<typeof capabilitySchema>
export type PlanStepInput = z.infer<typeof planStepInputSchema>
export type CompleteAgentSessionInput = z.infer<typeof completeAgentSessionInputSchema>
export type ApprovalEventEnvelope = z.infer<typeof approvalEventEnvelopeSchema>
