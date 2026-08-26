import { z } from 'zod'
import {
  createRoutePolicyManifest,
  mcpPolicyBindings,
  type RoutePolicyFeatureTier,
} from './route-policy.js'

export * from './route-policy.js'
export { workmeshSkillManifest } from './workmesh-skill-manifest.js'

export const releaseMetadata = Object.freeze({
  serverVersion: '1.0.0',
  restApiVersion: '1.0',
  agentProtocolVersion: '1.0',
  mcpVersion: '1.0.0',
  a2aUpstreamVersion: '0.3',
  preferredClientProfileVersion: '1.0',
  supportedClientProfileVersions: ['1.0'] as const,
  conformanceSuiteVersion: '1.0',
  schemaBaseline: 1,
})

export const featureKeySchema = z.enum([
  'WORKMESH_BETA_PLANNING',
  'WORKMESH_BETA_TEMPLATES',
  'WORKMESH_BETA_COSTS',
  'WORKMESH_BETA_GITEA',
  'WORKMESH_BETA_OPERATIONS_UI',
  'WORKMESH_BETA_COORDINATION_MCP',
  'WORKMESH_EXPERIMENTAL_AUTOMATION',
  'WORKMESH_EXPERIMENTAL_AGENT_LOOPS',
  'WORKMESH_EXPERIMENTAL_A2A',
  'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS',
  'WORKMESH_EXPERIMENTAL_MULTI_RUNTIME',
])
export const supportTierSchema = z.enum(['beta', 'experimental'])
export type FeatureKey = z.infer<typeof featureKeySchema>
export type SupportTier = z.infer<typeof supportTierSchema>
export type ReleaseInfo = z.infer<typeof releaseInfoResponseSchema>
export type FeatureState = z.infer<typeof featureStateSchema>
export type FeatureRegistry = z.infer<typeof featureRegistryResponseSchema>
export type FeatureRuntime = 'api' | 'web' | 'worker' | 'sdk-mcp' | 'reserved'

export const featureDefinitions = Object.freeze([
  { key: 'WORKMESH_BETA_PLANNING', tier: 'beta', defaultEnabled: false, runtimeDependencies: ['api', 'web', 'worker'] },
  { key: 'WORKMESH_BETA_TEMPLATES', tier: 'beta', defaultEnabled: false, runtimeDependencies: ['api', 'web'] },
  { key: 'WORKMESH_BETA_COSTS', tier: 'beta', defaultEnabled: false, runtimeDependencies: ['api', 'web'] },
  { key: 'WORKMESH_BETA_GITEA', tier: 'beta', defaultEnabled: false, runtimeDependencies: ['api', 'worker', 'sdk-mcp'] },
  { key: 'WORKMESH_BETA_OPERATIONS_UI', tier: 'beta', defaultEnabled: false, runtimeDependencies: ['web'] },
  { key: 'WORKMESH_BETA_COORDINATION_MCP', tier: 'beta', defaultEnabled: false, runtimeDependencies: ['api', 'web', 'worker', 'sdk-mcp'] },
  { key: 'WORKMESH_EXPERIMENTAL_AUTOMATION', tier: 'experimental', defaultEnabled: false, runtimeDependencies: ['api', 'worker', 'web'] },
  { key: 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS', tier: 'experimental', defaultEnabled: false, runtimeDependencies: ['api', 'worker', 'web'] },
  { key: 'WORKMESH_EXPERIMENTAL_A2A', tier: 'experimental', defaultEnabled: false, runtimeDependencies: ['api'] },
  { key: 'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS', tier: 'experimental', defaultEnabled: false, runtimeDependencies: ['api', 'worker'] },
  { key: 'WORKMESH_EXPERIMENTAL_MULTI_RUNTIME', tier: 'experimental', defaultEnabled: false, runtimeDependencies: ['reserved'] },
] as const satisfies readonly {
  key: FeatureKey
  tier: SupportTier
  defaultEnabled: false
  runtimeDependencies: readonly FeatureRuntime[]
}[])

export const releaseInfoResponseSchema = z.object({
  serverVersion: z.literal(releaseMetadata.serverVersion),
  restApiVersion: z.literal(releaseMetadata.restApiVersion),
  agentProtocolVersion: z.literal(releaseMetadata.agentProtocolVersion),
  mcpVersion: z.literal(releaseMetadata.mcpVersion),
  a2aUpstreamVersion: z.literal(releaseMetadata.a2aUpstreamVersion),
  preferredClientProfileVersion: z.literal(releaseMetadata.preferredClientProfileVersion),
  supportedClientProfileVersions: z.tuple([z.literal('1.0')]),
  conformanceSuiteVersion: z.literal(releaseMetadata.conformanceSuiteVersion),
  schemaBaseline: z.literal(releaseMetadata.schemaBaseline),
  buildSha: z.string().min(1).max(128),
}).strict()
export const featureStateSchema = z.object({
  key: featureKeySchema,
  tier: supportTierSchema,
  enabled: z.boolean(),
}).strict()
export const featureRegistryResponseSchema = z.object({
  features: z.array(featureStateSchema).length(featureDefinitions.length),
}).strict()

const featureRoutePrefixes = [
  ['/api/v1/cycles', 'WORKMESH_BETA_PLANNING'],
  ['/api/v1/initiatives', 'WORKMESH_BETA_PLANNING'],
  ['/api/v1/advanced-views', 'WORKMESH_BETA_PLANNING'],
  ['/api/v1/projects/:id/health', 'WORKMESH_BETA_PLANNING'],
  ['/api/v1/work-items/:id/cycle', 'WORKMESH_BETA_PLANNING'],
  ['/api/v1/templates', 'WORKMESH_BETA_TEMPLATES'],
  ['/api/v1/usage-', 'WORKMESH_BETA_COSTS'],
  ['/api/v1/budget-policies', 'WORKMESH_BETA_COSTS'],
  ['/api/v1/automation-rules', 'WORKMESH_EXPERIMENTAL_AUTOMATION'],
  ['/api/v1/automation-runs', 'WORKMESH_EXPERIMENTAL_AUTOMATION'],
  ['/api/v1/notifications', 'WORKMESH_BETA_PLANNING'],
  ['/api/v1/notification-preferences', 'WORKMESH_BETA_PLANNING'],
  ['/api/v1/agent-connections', 'WORKMESH_BETA_COORDINATION_MCP'],
  ['/.well-known/workmesh-agent', 'WORKMESH_BETA_COORDINATION_MCP'],
  ['/api/v1/loops', 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS'],
  ['/api/v1/a2a-bindings', 'WORKMESH_EXPERIMENTAL_A2A'],
] as const satisfies readonly (readonly [string, FeatureKey])[]

export const featureForApiRoute = (route: string): FeatureKey | undefined =>
  featureRoutePrefixes.find(([prefix]) => route.startsWith(prefix))?.[1]

export const idSchema = z.string().uuid()
export const timestampSchema = z.string().datetime({ offset: true })
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const revisionSchema = z.number().int().positive()
export const pageQuerySchema = z.object({
  cursor: z.string().min(1).max(8_192).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export type PageQuery = z.infer<typeof pageQuerySchema>
export type ListResponse<T> = { items: T[]; nextCursor: string | null }
export const listResponseSchema = <T extends z.ZodTypeAny>(item: T) => z.object({
  items: z.array(item),
  nextCursor: z.string().nullable(),
}).strict()
export const actorKindSchema = z.enum(['human', 'agent', 'service'])
export const membershipRoleSchema = z.enum(['admin', 'maintainer', 'member'])
export const statusCategorySchema = z.enum(['backlog', 'planned', 'started', 'completed', 'canceled'])
export const prioritySchema = z.enum(['none', 'urgent', 'high', 'medium', 'low'])
export const savedViewLayoutSchema = z.enum(['list', 'board'])
export const agentSessionStateSchema = z.enum([
  'queued', 'acknowledged', 'planning', 'executing', 'awaiting_input', 'awaiting_approval',
  'blocked', 'paused', 'stopping', 'stale', 'completed', 'failed', 'canceled',
])

// Request DTOs deliberately retain the existing camelCase API field names.
export const workspaceInputSchema = z.object({ name: z.string().min(1).max(120), slug: z.string().regex(/^[a-z0-9-]+$/).max(80) })
export const teamInputSchema = z.object({ name: z.string().min(1).max(120), key: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/) })
export const stateInputSchema = z.object({ name: z.string().min(1).max(80), category: statusCategorySchema, color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), position: z.number().int().nonnegative().optional() })
export const projectInputSchema = z.object({ teamId: idSchema, name: z.string().min(1).max(180), summary: z.string().max(500).optional(), description: z.string().max(20000).nullable().optional(), status: z.string().max(80).optional(), leadActorId: idSchema.nullable().optional(), targetDate: z.coerce.date().nullable().optional() })
export const workItemInputSchema = z.object({ teamId: idSchema, title: z.string().min(1).max(500), description: z.string().max(50000).optional(), statusId: idSchema, priority: prioritySchema.default('none'), dueDate: z.coerce.date().optional(), responsibleHumanActorId: idSchema.optional(), labels: z.array(z.string().min(1).max(60)).max(30).default([]), projectId: idSchema.optional(), milestoneId: idSchema.optional(), parentId: idSchema.optional() }).strict()
export const workItemPatchSchema = workItemInputSchema.partial().omit({ teamId: true }).extend({ description: z.string().max(50000).nullable().optional(), dueDate: z.coerce.date().nullable().optional(), responsibleHumanActorId: idSchema.nullable().optional(), projectId: idSchema.nullable().optional(), milestoneId: idSchema.nullable().optional(), parentId: idSchema.nullable().optional() }).strict()
export const workItemRelationKindSchema = z.enum(['blocks', 'related'])
export const workItemRelationInputSchema = z.object({ targetWorkItemId: idSchema, kind: workItemRelationKindSchema }).strict()
export const commentInputSchema = z.object({ body: z.string().min(1).max(50000), parentCommentId: idSchema.optional(), replyToCommentId: idSchema.optional(), mentions: z.array(idSchema).max(20).default([]) })
export const commentPatchSchema = z.object({ body: z.string().min(1).max(50000).optional(), isResolved: z.boolean().optional(), deleted: z.boolean().optional() })
export const savedViewFiltersSchema = z.record(z.unknown())
export const savedViewInputSchema = z.object({ name: z.string().min(1).max(80), teamId: idSchema.optional(), filters: savedViewFiltersSchema.default({}), layout: savedViewLayoutSchema.default('list') })
export const installInputSchema = workspaceInputSchema.extend({ adminName: z.string().min(1).max(120), email: z.string().email(), password: z.string().min(12) })
export const loginInputSchema = z.object({ email: z.string().email(), password: z.string().min(1) })
export const authIdempotencyErrorCodeSchema = z.enum([
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_REPLAY_EXPIRED',
  'IDEMPOTENCY_REPLAY_UNAVAILABLE',
])
export const authIdempotencyPolicySchema = z.object({
  replayWindowSeconds: z.literal(900),
  conflictRetentionSeconds: z.literal(86_400),
})
export const authIdempotencyPolicy = authIdempotencyPolicySchema.parse({
  replayWindowSeconds: 900,
  conflictRetentionSeconds: 86_400,
})

// Response DTOs use the PostgreSQL/API wire representation: snake_case keys.
export const workspaceResponseSchema = z.object({ id: idSchema, name: z.string(), slug: z.string(), revision: revisionSchema, created_at: timestampSchema, updated_at: timestampSchema })
export const teamResponseSchema = z.object({ id: idSchema, workspace_id: idSchema, name: z.string(), key: z.string(), next_work_item_number: z.number().int().positive(), revision: revisionSchema, deleted_at: timestampSchema.nullable(), created_at: timestampSchema, updated_at: timestampSchema })
export const membershipResponseSchema = z.object({ workspace_id: idSchema, team_id: idSchema.nullable(), actor_id: idSchema, role: membershipRoleSchema, created_at: timestampSchema })
export const workflowStateResponseSchema = z.object({ id: idSchema, team_id: idSchema, name: z.string(), category: statusCategorySchema, color: z.string(), position: z.number().int().nonnegative(), is_archived: z.boolean(), revision: revisionSchema, created_at: timestampSchema, updated_at: timestampSchema })
export const humanActorResponseSchema = z.object({ id: idSchema, email: z.string().email(), display_name: z.string(), kind: z.literal('human').optional(), is_active: z.boolean().optional(), workspace_id: idSchema.optional(), created_at: timestampSchema.optional() })
export const projectResponseSchema = z.object({ id: idSchema, workspace_id: idSchema, team_id: idSchema, name: z.string(), summary: z.string().nullable(), description: z.string().nullable(), status: z.string(), lead_actor_id: idSchema.nullable(), target_date: dateSchema.nullable(), revision: revisionSchema, deleted_at: timestampSchema.nullable(), created_at: timestampSchema, updated_at: timestampSchema })
export const responsibleHumanProjectionSchema = z.object({ actor_id: idSchema, display_name: z.string() }).strict()
/**
 * A bounded, read-only summary used by human-facing Work Item collections.
 *
 * It deliberately describes relationships rather than expanding their target
 * records, so a collection response cannot become a cross-scope read channel.
 */
export const workItemSurfaceSummarySchema = z.object({
  blocked_by_count: z.number().int().nonnegative(),
  blocking_count: z.number().int().nonnegative(),
  sub_issue_count: z.number().int().nonnegative(),
  completed_sub_issue_count: z.number().int().nonnegative(),
}).strict()
export const workItemExecutorProjectionSchema = z.object({
  agent_id: idSchema,
  agent_actor_id: idSchema,
  agent_slug: z.string(),
  agent_display_name: z.string(),
  session_id: idSchema,
  lease_id: idSchema,
  lease_kind: z.enum(['exclusive', 'review_shared']),
  resource_type: z.enum(['work_item', 'plan_step']),
  resource_id: idSchema,
  execution_state: agentSessionStateSchema,
  heartbeat_health: z.enum(['healthy', 'degraded', 'stale']),
  last_heartbeat_at: timestampSchema.nullable(),
  lease_heartbeat_at: timestampSchema,
  lease_expires_at: timestampSchema,
}).strict()
export const workItemAssignmentProjectionSchema = z.object({
  delegation_id: idSchema,
  agent_id: idSchema,
  agent_actor_id: idSchema,
  agent_slug: z.string(),
  agent_display_name: z.string(),
  session_id: idSchema.nullable(),
  session_state: agentSessionStateSchema.nullable(),
  assigned_at: timestampSchema,
}).strict()
export const workItemResponseSchema = z.object({ id: idSchema, workspace_id: idSchema, team_id: idSchema, number: z.number().int().positive(), title: z.string(), description: z.string().nullable(), status_id: idSchema, priority: prioritySchema, due_date: dateSchema.nullable(), responsible_human_actor_id: idSchema.nullable(), responsible_human: responsibleHumanProjectionSchema.nullable(), active_assignment: workItemAssignmentProjectionSchema.nullable().default(null), active_executor: workItemExecutorProjectionSchema.nullable(), shared_reviewers: z.array(workItemExecutorProjectionSchema), labels: z.array(z.string()), project_id: idSchema.nullable(), project_name: z.string().nullable().optional(), milestone_id: idSchema.nullable(), parent_id: idSchema.nullable(), surface_summary: workItemSurfaceSummarySchema.optional(), revision: revisionSchema, deleted_at: timestampSchema.nullable(), created_at: timestampSchema, updated_at: timestampSchema, team_key: z.string(), status_name: z.string(), status_category: statusCategorySchema }).strict()
export const workItemRelationResponseSchema = z.object({ id: idSchema, workspace_id: idSchema, team_id: idSchema, source_work_item_id: idSchema, target_work_item_id: idSchema, kind: workItemRelationKindSchema, created_by_actor_id: idSchema.nullable(), revision: revisionSchema, deleted_at: timestampSchema.nullable(), created_at: timestampSchema, updated_at: timestampSchema }).strict()
export const mentionResponseSchema = z.object({ actor_id: idSchema, display_name: z.string().optional() })
export const commentResponseSchema = z.object({ id: idSchema, channel_id: idSchema, author_actor_id: idSchema, author_name: z.string(), author_kind: z.literal('human'), parent_comment_id: idSchema.nullable(), reply_to_comment_id: idSchema.nullable(), body: z.string(), mentions: z.array(idSchema), is_resolved: z.boolean(), revision: revisionSchema, deleted_at: timestampSchema.nullable(), created_at: timestampSchema, updated_at: timestampSchema })
export const savedViewResponseSchema = z.object({ id: z.string(), workspace_id: idSchema.optional(), owner_actor_id: idSchema.optional(), team_id: idSchema.nullable().optional(), name: z.string(), filters: savedViewFiltersSchema, layout: savedViewLayoutSchema, built_in: z.boolean().optional(), revision: revisionSchema.optional(), created_at: timestampSchema.optional(), updated_at: timestampSchema.optional() })
export const commandResponseSchema = z.object({ id: idSchema, revision: revisionSchema })
export const sessionResponseSchema = z.object({ csrf_token: z.string().min(1) })
export const authMeResponseSchema = z.object({ actor: humanActorResponseSchema, csrf_token: z.string().min(1) })
export const installationStatusResponseSchema = z.object({ installed: z.boolean() })
export const healthResponseSchema = z.object({ status: z.literal('ok') })

export const DURABLE_EVENT_CURSOR_PATTERN = /^(?:0|[1-9][0-9]{0,17}|(?:[1-8][0-9]{18}|9[0-1][0-9]{17}|92[0-1][0-9]{16}|922[0-2][0-9]{15}|9223[0-2][0-9]{14}|92233[0-6][0-9]{13}|922337[0-1][0-9]{12}|92233720[0-2][0-9]{10}|922337203[0-5][0-9]{9}|9223372036[0-7][0-9]{8}|92233720368[0-4][0-9]{7}|922337203685[0-3][0-9]{6}|9223372036854[0-6][0-9]{5}|92233720368547[0-6][0-9]{4}|922337203685477[0-4][0-9]{3}|9223372036854775[0-7][0-9]{2}|922337203685477580[0-6]|9223372036854775807))$/
export const durableEventCursorSchema = z
  .string()
  .regex(
    DURABLE_EVENT_CURSOR_PATTERN,
    'Cursor exceeds the PostgreSQL bigint range',
  )
export const eventResourceTypeSchema = z.enum([
  'workspace',
  'team',
  'project',
  'work_item',
  'session',
  'room',
  'artifact',
  'delivery',
])
export const eventResourceSchema = z.object({
  type: eventResourceTypeSchema,
  id: idSchema,
})
export const eventAudienceSchema = z.object({
  visibility: z.enum(['workspace', 'team', 'actor', 'resource']),
  workspaceId: idSchema,
  teamId: idSchema.nullable(),
  actorId: idSchema.nullable(),
})
// Events are intentionally passthrough so consumers remain compatible with newer event fields.
export const eventEnvelopeSchema = z.object({
  cursor: durableEventCursorSchema,
  id: idSchema,
  event_type: z.string().min(1),
  event_version: z.number().int().positive(),
  workspace_id: idSchema,
  team_id: idSchema.nullable().optional(),
  audience_actor_id: idSchema.nullable().optional(),
  audience: eventAudienceSchema,
  scopes: z.array(eventResourceSchema),
  invalidates: z.array(eventResourceSchema),
  aggregate_type: z.string().min(1),
  aggregate_id: idSchema,
  aggregate_revision: revisionSchema.nullable(),
  actor_id: idSchema,
  correlation_id: z.string().min(1),
  idempotency_key: z.string().nullable(),
  payload: z.unknown(),
  occurred_at: timestampSchema,
}).passthrough()

export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'BOOTSTRAP_AUTH_FAILED',
  'FORBIDDEN',
  'FEATURE_DISABLED',
  'NOT_FOUND',
  'CONFLICT',
  'LAST_ACTIVE_TEAM_CONFLICT',
  'REVISION_CONFLICT',
  'IF_MATCH_REQUIRED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_REPLAY_EXPIRED',
  'IDEMPOTENCY_REPLAY_UNAVAILABLE',
  'CSRF_FAILED',
  'INVALID_CREDENTIALS',
  'INSTALLATION_ALREADY_COMPLETED',
  'RESPONSIBLE_HUMAN_REQUIRED',
  'WORK_ITEM_PARENT_SELF',
  'WORK_ITEM_PARENT_DELETED',
  'WORK_ITEM_PARENT_PROJECT_MISMATCH',
  'WORK_ITEM_PARENT_SCOPE_MISMATCH',
  'WORK_ITEM_PARENT_CYCLE',
  'WORK_ITEM_MILESTONE_PROJECT_MISMATCH',
  'WORK_ITEM_MILESTONE_DELETED',
  'WORK_ITEM_RELATION_SELF',
  'WORK_ITEM_RELATED_ORDER',
  'WORK_ITEM_RELATION_SCOPE_MISMATCH',
  'WORK_ITEM_RELATION_ENDPOINT_DELETED',
  'WORK_ITEM_BLOCK_CYCLE',
  'WORK_ITEM_HAS_ACTIVE_PARENT',
  'WORK_ITEM_HAS_ACTIVE_CHILDREN',
  'WORK_ITEM_HAS_ACTIVE_RELATIONS',
  'MILESTONE_HAS_ACTIVE_WORK_ITEMS',
  'PLANNING_RELATION_ALREADY_EXISTS',
  'PAGINATION_CURSOR_INVALID',
  'PAGINATION_CURSOR_MISMATCH',
  'CURSOR_EXPIRED',
  'PROFILE_VERSION_UNSUPPORTED',
  'REALTIME_CAPACITY_EXCEEDED',
  'INTERNAL_ERROR',
  // Stage 5 (v1.1) Agent Connection & Coordination MCP — folded into the
  // unified error contract. Plan §"测试与验收" requires that every error
  // response follows the {error:{code,message,details,correlationId}} shape,
  // so these codes live in apiErrorCodeSchema (not a parallel union).
  'AGENT_CONNECTION_PAIRING_INVALID',
  'AGENT_CONNECTION_PAIRING_EXPIRED',
  'AGENT_CONNECTION_PAIRING_CONSUMED',
  'AGENT_CONNECTION_PAIRING_LOCKED',
  'AGENT_CONNECTION_REVOKED',
  'AGENT_CONNECTION_PRIVILEGE_ESCALATION',
  'AGENT_CONNECTION_NOT_FOUND',
  'AGENT_CONNECTION_CLIENT_TYPE_MISMATCH',
  'AGENT_CONNECTION_TEAM_MISMATCH',
  'AGENT_CONNECTION_INSTALLATION_MISMATCH',
  'COORDINATION_SESSION_CONNECTION_REVOKED',
  'COORDINATION_SESSION_REFRESH_FAILED',
  'COORDINATION_SESSION_TEAM_SCOPE_DENIED',
  'AGENT_DELEGATE_NOT_GRANTED',
  'COORDINATOR_DESTRUCTIVE_OPERATION_FORBIDDEN',
  'COORDINATOR_AGENT_DELEGATE_NOT_TRANSITIVE',
  'COORDINATOR_PRINCIPAL_HUMAN_INVALID',
  'AGENT_SKILL_VERSION_MISMATCH',
  'AGENT_SKILL_SIGNATURE_INVALID',
])
export const errorResponseSchema = z.object({ error: z.object({ code: apiErrorCodeSchema, message: z.string(), details: z.unknown().optional(), correlationId: z.string().min(1) }) })

// Kept as a permissive helper so existing API error handling remains source-compatible.
export const errorBody = (code: string, message: string, correlationId: string, details?: unknown) => ({ error: { code, message, details, correlationId } })

export const retentionStatusResponseSchema = z.object({
  mode: z.enum(['unknown', 'disabled', 'archive_only', 'archive_and_prune']),
  workerSeenAt: timestampSchema.nullable(),
  workerFresh: z.boolean(),
  policies: z.array(z.object({
    recordClass: z.string(),
    onlineDays: z.number().int().positive(),
    conflictDays: z.number().int().positive().nullable(),
    archiveDays: z.number().int().positive().nullable(),
    deleteAllowed: z.boolean(),
    protectedReason: z.string().nullable(),
  })),
  floor: z.object({ prunedThroughCursor: durableEventCursorSchema, updatedAt: timestampSchema }),
  archive: z.object({
    planned: z.number().int().nonnegative(),
    uploaded: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    pruned: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    lastVerifiedEndCursor: durableEventCursorSchema.nullable(),
    retainUntil: timestampSchema.nullable(),
  }),
  jobs: z.array(z.object({
    name: z.string(),
    leased: z.boolean(),
    fence: durableEventCursorSchema,
    fixedCutoffAt: timestampSchema.nullable(),
    watermarkCursor: durableEventCursorSchema,
    lastErrorCode: z.string().nullable(),
    counters: z.record(z.number()),
    lastCompletedAt: timestampSchema.nullable(),
  })),
  blockers: z.object({
    undeliveredOutbox: z.number().int().nonnegative(),
    protectedA2AEvents: z.number().int().nonnegative(),
    protectedWebhookEvents: z.number().int().nonnegative(),
    unverifiedSegments: z.number().int().nonnegative(),
  }),
  redis: z.object({
    status: z.enum(['ok', 'unavailable']),
    streamLength: z.number().int().nonnegative().nullable(),
    exactLimit: z.number().int().positive(),
  }),
})

export const stage0RouteManifest = [
  { method: 'GET', path: '/livez', authenticated: false },
  { method: 'GET', path: '/readyz', authenticated: false },
  { method: 'GET', path: '/health', authenticated: false },
  { method: 'GET', path: '/api/v1/info', authenticated: false },
  { method: 'GET', path: '/api/v1/features', authenticated: true },
  { method: 'GET', path: '/api/v1/agent-capabilities', authenticated: true },
  { method: 'GET', path: '/api/v1/install-status', authenticated: false },
  { method: 'POST', path: '/api/v1/test/reset-install', authenticated: false, mutation: true },
  { method: 'POST', path: '/api/v1/auth/install', authenticated: true, mutation: true },
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
  { method: 'GET', path: '/api/v1/admin/retention/status', authenticated: true },
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
  'deploy:production', 'secrets:use', 'automation:manage', 'admin:*', 'agent:delegate',
])
export const delegationRoleSchema = z.enum(['executor', 'reviewer', 'researcher', 'coordinator', 'triager'])
export const delegationScopeTypeSchema = z.enum(['work_item', 'plan_step', 'project', 'automation', 'team'])
export const delegationStatusSchema = z.enum(['active', 'revoked', 'expired', 'completed'])
export const agentSessionKindSchema = z.enum(['execution', 'coordination'])
export const planStepStatusSchema = z.enum(['pending', 'in_progress', 'blocked', 'completed', 'canceled'])
export const activityKindSchema = z.enum([
  'ack', 'status', 'plan_published', 'plan_changed', 'action_started', 'action_completed', 'evidence',
  'question', 'decision_request', 'message', 'artifact_published', 'warning', 'error', 'completion', 'heartbeat', 'stop_ack',
])
export const approvalStatusSchema = z.enum(['pending', 'approved', 'rejected', 'expired', 'consumed', 'canceled'])
export const approvalRiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical'])
export const checkStatusSchema = z.enum(['passed', 'failed', 'skipped'])
export const visibilitySchema = z.enum(['workspace', 'team', 'private'])
export const artifactTypeSchema = z.enum(['branch', 'commit', 'diff', 'pull_request', 'test_report', 'build', 'preview', 'code_review', 'document', 'link', 'file', 'other'])

// Stage 2: all collaboration messages are visible to authorized humans.  This
// intentionally has no private/hidden visibility option for agent-to-agent use.
export const roomSubjectKindSchema = z.enum(['work_item', 'project', 'session'])
export const roomMessageIntentSchema = z.enum(['inform', 'ask', 'answer', 'propose', 'decide', 'claim', 'handoff', 'blocker', 'review_request', 'review_result', 'status'])
export const roomMessageInputSchema = z.object({
  intent: roomMessageIntentSchema, body: z.string().min(1).max(50_000), recipientActorId: idSchema.optional(), recipientActorIds: z.array(idSchema).min(1).max(50).optional(), replyToMessageId: idSchema.optional(), threadId: idSchema.optional(),
  recipientSessionId: idSchema.optional(), recipientSessionIds: z.array(idSchema).min(1).max(50).optional(),
  payload: z.record(z.unknown()).default({}), requiresResponse: z.boolean().default(false), sessionId: idSchema.optional(),
}).strict().superRefine((value, context) => {
  const visibility = value.payload.visibility
  if (visibility === 'private' || visibility === 'hidden') context.addIssue({ code: z.ZodIssueCode.custom, path: ['payload', 'visibility'], message: 'Work Room messages cannot be private or hidden from authorized humans' })
  if (value.recipientActorId && value.recipientActorIds) context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipientActorIds'], message: 'Use recipientActorId or recipientActorIds, not both' })
  if (value.recipientSessionId && value.recipientSessionIds) context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipientSessionIds'], message: 'Use recipientSessionId or recipientSessionIds, not both' })
  if ((value.recipientSessionId || value.recipientSessionIds) && (value.recipientActorId || value.recipientActorIds)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipientSessionIds'], message: 'Use actor recipients or exact Session recipients, not both' })
})
export const inboxClaimInputSchema = z.object({}).strict()
export const inboxAcknowledgeInputSchema = z.object({}).strict()
export const inboxReplyInputSchema = z.object({ body: z.string().min(1).max(50_000), payload: z.record(z.unknown()).default({}) }).strict()
export const inboxItemKindSchema = z.enum(['waiting_input', 'approval', 'session_stale', 'ask', 'review_request', 'blocker', 'handoff', 'mention'])
export const inboxItemStatusSchema = z.enum(['open', 'resolved'])
export const inboxReceiptKindSchema = z.enum(['claimed', 'read', 'acknowledged', 'replied'])
export const inboxListItemResponseSchema = z.object({
  id: idSchema,
  kind: inboxItemKindSchema,
  source_type: z.string().min(1),
  source_id: idSchema,
  status: inboxItemStatusSchema,
  requires_response: z.boolean(),
  recipient_session_id: idSchema.nullable(),
  claimed_by_session_id: idSchema.nullable(),
  claimed_at: timestampSchema.nullable(),
  revision: revisionSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  payload: z.record(z.unknown()),
  detail_available: z.boolean(),
}).strict()
export const inboxReceiptResponseSchema = z.object({
  id: idSchema,
  actor_id: idSchema,
  session_id: idSchema,
  kind: inboxReceiptKindSchema,
  reply_message_id: idSchema.nullable(),
  created_at: timestampSchema,
}).strict()
export const inboxItemDetailResponseSchema = z.object({
  id: idSchema,
  workspace_id: idSchema,
  recipient_actor_id: idSchema,
  recipient_human_actor_id: idSchema.nullable(),
  recipient_session_id: idSchema.nullable(),
  claimed_by_session_id: idSchema.nullable(),
  claimed_at: timestampSchema.nullable(),
  team_id: idSchema.nullable(),
  session_id: idSchema.nullable(),
  kind: inboxItemKindSchema,
  source_type: z.string().min(1),
  source_id: idSchema,
  source_room_message_id: idSchema.nullable(),
  requires_response: z.boolean(),
  status: inboxItemStatusSchema,
  revision: revisionSchema,
  payload: z.record(z.unknown()),
  resolved_at: timestampSchema.nullable(),
  resolved_by_actor_id: idSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  channel_id: idSchema.nullable(),
  source_message_body: z.string().nullable(),
  source_message_intent: roomMessageIntentSchema.nullable(),
  source_author_actor_id: idSchema.nullable(),
  source_author_session_id: idSchema.nullable(),
  source_thread_id: idSchema.nullable(),
  source_subject_kind: roomSubjectKindSchema.nullable(),
  source_subject_id: idSchema.nullable(),
  receipts: z.array(inboxReceiptResponseSchema),
  detailAvailable: z.literal(true),
}).strict()
export const inboxReplyResponseSchema = inboxItemDetailResponseSchema.extend({ replyMessageId: idSchema }).strict()
export type InboxListItem = z.infer<typeof inboxListItemResponseSchema>
export type InboxReceipt = z.infer<typeof inboxReceiptResponseSchema>
export type InboxItemDetail = z.infer<typeof inboxItemDetailResponseSchema>
export type InboxReplyResponse = z.infer<typeof inboxReplyResponseSchema>
export const humanAttentionProjectionVersionSchema = z.literal(1)
export const humanAttentionKindSchema = z.enum(['decision', 'approval', 'clarification', 'conflict', 'recovery', 'completion_review'])
export const humanAttentionStatusSchema = z.enum(['open', 'seen', 'decided', 'applying', 'verified', 'failed', 'expired', 'superseded'])
export const humanAttentionSeveritySchema = z.enum(['info', 'low', 'medium', 'high', 'critical'])
export const humanAttentionUrgencySchema = z.enum(['normal', 'soon', 'immediate'])
export const freshnessStateSchema = z.enum(['current', 'refreshing', 'stale', 'offline', 'resync_required', 'partial'])
export const attentionActorReferenceSchema = z.object({ id: idSchema, kind: actorKindSchema, displayName: z.string().min(1) }).strict()
export const attentionResourceReferenceSchema = z.object({ type: z.string().min(1).max(100), id: idSchema, label: z.string().min(1).max(500).optional() }).strict()
export const attentionEvidenceReferenceSchema = z.object({ type: z.string().min(1).max(100), id: z.string().min(1).max(2_000), title: z.string().min(1).max(500).optional(), uri: z.string().url().optional(), status: z.string().min(1).max(100).optional() }).strict()
export const attentionOptionSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  command: z.string().min(1).max(200),
  method: z.enum(['POST', 'PATCH', 'PUT', 'DELETE']),
  path: z.string().startsWith('/api/v1/').max(2_000),
  targetRevision: revisionSchema.optional(),
  requiredCapabilities: z.array(capabilitySchema).max(50),
  requiredActorKinds: z.array(actorKindSchema).min(1).max(3),
  requiresApproval: z.boolean(),
  consequencePreviewPath: z.string().startsWith('/api/v1/').max(2_000).optional(),
}).strict()
export const attentionAudienceRelationshipSchema = z.enum(['assigned_to_me', 'visible_to_me', 'workspace_administration'])
export const attentionAudienceSchema = z.object({
  relationship: attentionAudienceRelationshipSchema,
  canRespond: z.boolean(),
}).strict()
export const attentionResponseSchema = z.object({
  workflow: humanAttentionKindSchema,
  requiresReason: z.boolean(),
  requiresMessage: z.boolean(),
  choices: z.array(z.object({ id: z.string().min(1).max(2_000), label: z.string().min(1).max(2_000) }).strict()).max(50),
  expectedStatus: humanAttentionStatusSchema,
}).strict()
export const attentionBulkPolicySchema = z.object({
  eligible: z.boolean(),
  compatibilityKey: z.string().min(1).max(500).nullable(),
  prohibitedReason: z.string().min(1).max(500).nullable(),
  revalidateIndividually: z.literal(true),
}).strict()
export const humanAttentionFreshnessSchema = z.object({ state: freshnessStateSchema, observedAt: timestampSchema, sourceUpdatedAt: timestampSchema, invalidAfter: timestampSchema.optional() }).strict()
export const humanAttentionItemSchema = z.object({
  projectionVersion: humanAttentionProjectionVersionSchema,
  id: z.string().regex(/^v1:[a-z_]+:[0-9a-f-]{36}$/),
  kind: humanAttentionKindSchema,
  status: humanAttentionStatusSchema,
  workspaceId: idSchema,
  teamId: idSchema.nullable(),
  projectId: idSchema.nullable(),
  workItemId: idSchema.nullable(),
  sessionId: idSchema.nullable(),
  planVersionId: idSchema.nullable(),
  planStepId: idSchema.nullable(),
  title: z.string().min(1).max(500),
  summary: z.string().min(1).max(20_000),
  summaryDerived: z.literal(true),
  reasonCodes: z.array(z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/)).min(1).max(20),
  severity: humanAttentionSeveritySchema,
  urgency: humanAttentionUrgencySchema,
  requestedBy: attentionActorReferenceSchema,
  responsibleHuman: attentionActorReferenceSchema.nullable(),
  options: z.array(attentionOptionSchema).max(20),
  recommendedOptionId: z.string().min(1).max(100).nullable(),
  audience: attentionAudienceSchema,
  response: attentionResponseSchema,
  bulk: attentionBulkPolicySchema,
  impactSummary: z.string().min(1).max(20_000),
  affectedResources: z.array(attentionResourceReferenceSchema).max(100),
  evidence: z.array(attentionEvidenceReferenceSchema).max(100),
  expiresAt: timestampSchema.nullable(),
  sourceRevision: revisionSchema,
  source: z.object({ type: z.string().min(1).max(100), id: idSchema, status: z.string().min(1).max(100) }).strict(),
  freshness: humanAttentionFreshnessSchema,
  correlationId: z.string().min(1).max(200),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict()
export const humanAttentionListResponseSchema = z.object({ items: z.array(humanAttentionItemSchema).max(200), nextCursor: z.string().nullable() }).strict()
export type HumanAttentionKind = z.infer<typeof humanAttentionKindSchema>
export type HumanAttentionStatus = z.infer<typeof humanAttentionStatusSchema>
export type HumanAttentionItem = z.infer<typeof humanAttentionItemSchema>
export const controlPlaneProjectionVersionSchema = z.literal(1)
export const controlCenterCollectionSchema = z.enum(['attention', 'running', 'risks', 'recently_verified', 'ready_work', 'blocked_work'])
export const controlPlaneResourceReferenceSchema = z.object({ type: z.string().min(1).max(100), id: idSchema, revision: revisionSchema.optional(), label: z.string().min(1).max(500).optional() }).strict()
export const controlCenterDigestSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  summary: z.string().min(1).max(20_000),
  projectId: idSchema.nullable(),
  workItemId: idSchema.nullable(),
  sessionId: idSchema.nullable(),
  state: z.string().min(1).max(100),
  revision: revisionSchema,
  source: controlPlaneResourceReferenceSchema,
  responsibleHuman: attentionActorReferenceSchema.nullable(),
  activeAgent: attentionActorReferenceSchema.nullable(),
  workItem: z.object({ id: idSchema, title: z.string().min(1).max(500) }).strict().nullable(),
  currentStep: z.object({
    id: idSchema,
    title: z.string().min(1).max(500),
    status: planStepStatusSchema,
    ordinal: z.number().int().nonnegative(),
  }).strict().nullable(),
  health: z.object({
    heartbeat: z.enum(['healthy', 'degraded', 'stale']),
    lastHeartbeatAt: timestampSchema.nullable(),
  }).strict().nullable(),
  lastActivity: z.object({
    id: idSchema,
    kind: z.string().min(1).max(100),
    summary: z.string().min(1).max(20_000),
    createdAt: timestampSchema,
  }).strict().nullable(),
  pendingHumanActionCount: z.number().int().nonnegative(),
  evidenceCount: z.number().int().nonnegative(),
  verified: z.boolean(),
  updatedAt: timestampSchema,
}).strict()
export const controlCenterSectionSchema = z.object({ items: z.array(controlCenterDigestSchema).max(100), nextCursor: z.string().nullable() }).strict()
export const controlCenterResponseSchema = z.object({
  projectionVersion: controlPlaneProjectionVersionSchema,
  scope: z.object({ workspaceId: idSchema, projectId: idSchema.nullable() }).strict(),
  project: z.object({
    id: idSchema,
    name: z.string().min(1).max(500),
    status: z.string().min(1).max(100),
    targetDate: dateSchema.nullable(),
    responsibleHuman: attentionActorReferenceSchema.nullable(),
    revision: revisionSchema,
  }).strict().nullable(),
  revision: revisionSchema,
  freshness: humanAttentionFreshnessSchema,
  collections: z.object({
    attention: controlCenterSectionSchema,
    running: controlCenterSectionSchema,
    risks: controlCenterSectionSchema,
    recently_verified: controlCenterSectionSchema,
    ready_work: controlCenterSectionSchema,
    blocked_work: controlCenterSectionSchema,
  }).strict(),
}).strict()
export const runPhaseSchema = z.enum(['intake', 'investigation', 'planning', 'implementation', 'validation', 'human_input', 'recovery', 'completion'])
export const runActionTypeSchema = z.enum(['acknowledgement', 'read', 'write', 'tool', 'state_transition', 'plan', 'message', 'approval', 'decision', 'evidence', 'validation', 'handoff', 'heartbeat', 'other'])
export const runValidationStateSchema = z.enum(['not_verified', 'pending', 'verified', 'failed'])
export const runTechnicalRecordSchema = z.object({
  id: idSchema,
  sequence: z.number().int().positive(),
  kind: z.string().min(1).max(100),
  summary: z.string().min(1).max(10_000),
  detailsSummary: z.string().max(2_000).nullable(),
  actor: attentionActorReferenceSchema,
  createdAt: timestampSchema,
  correlationId: z.string().min(1).max(500).nullable(),
  eventCursor: durableEventCursorSchema.nullable(),
  toolInvocation: z.object({ toolName: z.string().min(1).max(160), inputSanitized: z.record(z.unknown()), status: z.enum(['started', 'succeeded', 'failed']), resultSummary: z.string().max(10_000).optional(), externalTraceUrl: z.string().url().optional() }).strict().nullable(),
  references: z.array(z.object({ type: z.enum(['work_item', 'plan_step', 'artifact', 'approval']), id: idSchema }).strict()).max(100),
}).strict()
export const causalEventGroupSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.string().min(1).max(100),
  phase: runPhaseSchema,
  actionType: runActionTypeSchema,
  summary: z.string().min(1).max(20_000),
  trigger: z.object({ kind: z.string().min(1).max(100), summary: z.string().min(1).max(2_000), sourceActivityId: idSchema }).strict(),
  actor: attentionActorReferenceSchema,
  planVersionId: idSchema.nullable(),
  planStepId: idSchema.nullable(),
  risk: approvalRiskLevelSchema.nullable(),
  count: z.number().int().positive().max(10_000),
  firstSequence: z.number().int().nonnegative(),
  lastSequence: z.number().int().nonnegative(),
  sourceActivityIds: z.array(idSchema).max(200),
  affectedResources: z.array(controlPlaneResourceReferenceSchema).max(200),
  evidence: z.array(attentionEvidenceReferenceSchema).max(200),
  validation: z.object({ state: runValidationStateSchema, summary: z.string().max(2_000).nullable() }).strict(),
  startedAt: timestampSchema,
  endedAt: timestampSchema,
  durationMs: z.number().int().nonnegative(),
  collapsed: z.boolean(),
  material: z.boolean(),
  failure: z.boolean(),
  attention: z.boolean(),
  technicalRecords: z.array(runTechnicalRecordSchema).max(200),
}).strict()
export const runPlanStepSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(20_000).nullable(),
  status: planStepStatusSchema,
  ordinal: z.number().int().nonnegative(),
  dependsOn: z.array(idSchema).max(100),
  acceptanceCriteria: z.array(z.string().min(1).max(2_000)).max(100),
  expectedArtifacts: z.array(artifactTypeSchema).max(50),
  causalGroupIds: z.array(z.string().min(1).max(200)).max(200),
  evidenceIds: z.array(idSchema).max(200),
}).strict()
export const runPlanVersionSchema = z.object({
  id: idSchema,
  revision: revisionSchema,
  parentVersionId: idSchema.nullable(),
  changeSummary: z.string().min(1).max(5_000),
  author: attentionActorReferenceSchema,
  createdAt: timestampSchema,
  steps: z.array(runPlanStepSchema).max(500),
}).strict()
export const runEvidenceDetailSchema = attentionEvidenceReferenceSchema.extend({
  checksum: z.string().max(500).nullable(),
  sourceTool: z.string().max(160).nullable(),
  createdAt: timestampSchema,
  planStepId: idSchema.nullable(),
  causalGroupIds: z.array(z.string().min(1).max(200)).max(200),
  validationState: runValidationStateSchema,
  repository: z.object({ repository: z.string().max(2_000).nullable(), branch: z.string().max(500).nullable(), commit: z.string().max(500).nullable(), pullRequest: z.string().url().nullable() }).strict().nullable(),
}).strict()
export const runExplanationResponseSchema = z.object({
  projectionVersion: controlPlaneProjectionVersionSchema,
  session: z.object({ id: idSchema, state: agentSessionStateSchema, revision: revisionSchema, stateReason: z.string().nullable(), budget: z.record(z.number()), updatedAt: timestampSchema }).strict(),
  project: z.object({ id: idSchema, name: z.string().min(1).max(500), revision: revisionSchema }).strict().nullable(),
  workItem: z.object({ id: idSchema, title: z.string(), revision: revisionSchema }).strict().nullable(),
  responsibleHuman: attentionActorReferenceSchema.nullable(),
  activeAgent: attentionActorReferenceSchema,
  plan: z.object({ id: idSchema, revision: revisionSchema, changeSummary: z.string() }).strict().nullable(),
  currentStep: z.object({ id: idSchema, title: z.string(), status: planStepStatusSchema, ordinal: z.number().int().nonnegative() }).strict().nullable(),
  planVersions: z.array(runPlanVersionSchema).max(50),
  causalGroups: z.array(causalEventGroupSchema).max(100),
  nextCursor: durableEventCursorSchema.nullable(),
  pendingAttention: z.array(humanAttentionItemSchema).max(100),
  changes: z.array(controlPlaneResourceReferenceSchema).max(200),
  evidence: z.array(attentionEvidenceReferenceSchema).max(200),
  evidenceDetails: z.array(runEvidenceDetailSchema).max(200),
  verification: z.object({ state: runValidationStateSchema, summary: z.string().min(1).max(2_000) }).strict(),
  health: z.object({ heartbeat: z.enum(['healthy', 'degraded', 'stale']), lastHeartbeatAt: timestampSchema.nullable(), leaseCount: z.number().int().nonnegative(), pendingApprovalCount: z.number().int().nonnegative() }).strict(),
  freshness: humanAttentionFreshnessSchema,
  allowedControls: z.array(z.object({ action: z.enum(['pause', 'resume', 'stop', 'retry', 'handoff', 'replan', 'steer']), allowed: z.boolean(), reasonCode: z.string(), targetState: agentSessionStateSchema.nullable() }).strict()).length(7),
}).strict()
export const workItemExecutionSummaryResponseSchema = z.object({
  projectionVersion: controlPlaneProjectionVersionSchema,
  workItem: z.object({ id: idSchema, title: z.string(), revision: revisionSchema, status: z.string() }).strict(),
  activeRuns: z.array(controlCenterDigestSchema).max(100),
  recentRuns: z.array(controlCenterDigestSchema).max(100),
  evidence: z.array(attentionEvidenceReferenceSchema).max(200),
  freshness: humanAttentionFreshnessSchema,
}).strict()
export const agentSessionControlActionSchema = z.enum(['pause', 'resume', 'stop', 'retry', 'handoff', 'replan', 'steer'])
export const agentSessionStopModeSchema = z.enum(['graceful', 'immediate'])
export const agentSessionSteeringScopeSchema = z.enum(['current_step', 'remaining_plan', 'session', 'guidance_proposal'])
export const agentSessionControlPreviewInputSchema = z.object({
  action: agentSessionControlActionSchema,
  stopMode: agentSessionStopModeSchema.optional(),
  steeringScope: agentSessionSteeringScopeSchema.optional(),
}).strict()
export const actionPreviewResponseSchema = z.object({
  projectionVersion: controlPlaneProjectionVersionSchema,
  action: agentSessionControlActionSchema,
  allowed: z.boolean(),
  reasonCode: z.string().min(1).max(200),
  sourceRevision: revisionSchema,
  currentState: agentSessionStateSchema,
  targetState: agentSessionStateSchema.nullable(),
  affectedResources: z.array(controlPlaneResourceReferenceSchema).max(200),
  consequences: z.array(z.object({ code: z.string().min(1).max(200), summary: z.string().min(1).max(2_000) }).strict()).max(100),
  reversible: z.boolean(),
  releaseLease: z.boolean(),
  preserveArtifacts: z.boolean(),
  preserveUncommittedWork: z.enum(['yes', 'no', 'unknown', 'runtime_dependent']),
  nextWorkItemState: z.string().nullable(),
  invalidatedApprovals: z.array(controlPlaneResourceReferenceSchema).max(100),
  requiredReason: z.boolean(),
  requiredApproval: z.object({ required: z.boolean(), approvalType: z.string().nullable() }).strict(),
  stopMode: agentSessionStopModeSchema.nullable(),
  supportedStopModes: z.array(z.object({ mode: agentSessionStopModeSchema, available: z.boolean(), summary: z.string().min(1).max(2_000) }).strict()).max(2),
  steeringScope: agentSessionSteeringScopeSchema.nullable(),
  supportedSteeringScopes: z.array(z.object({ scope: agentSessionSteeringScopeSchema, available: z.boolean(), reasonCode: z.string().min(1).max(200), summary: z.string().min(1).max(2_000), result: z.enum(['prompt', 'plan_version_request', 'guidance_navigation']) }).strict()).max(4),
  currentPlan: z.object({ id: idSchema, revision: revisionSchema }).strict().nullable(),
  currentStep: z.object({ id: idSchema, title: z.string().min(1).max(500) }).strict().nullable(),
  lastHeartbeatAt: timestampSchema.nullable(),
  leaseBehavior: z.enum(['unchanged', 'release_now', 'retain_for_handoff', 'server_controlled']),
  recoveryPath: z.string().min(1).max(2_000),
  resultResource: z.enum(['same_session', 'new_session', 'handoff_request', 'plan_version_request', 'guidance']).nullable(),
  warnings: z.array(z.string().min(1).max(2_000)).max(100),
  expiresAt: timestampSchema,
  freshness: humanAttentionFreshnessSchema,
  advisory: z.literal(true),
}).strict()
export const controlPlaneInvalidationSchema = z.object({
  projection: z.enum(['control_center', 'run_explanation', 'execution_summary', 'control_preview']),
  scopeId: idSchema,
  fragments: z.array(controlCenterCollectionSchema).max(6),
}).strict()
export type ControlPlaneInvalidation = z.infer<typeof controlPlaneInvalidationSchema>

export const controlPlaneInvalidationsForEvent = (event: EventEnvelope): ControlPlaneInvalidation[] => {
  const fragments = new Set<z.infer<typeof controlCenterCollectionSchema>>()
  if (/^(approval|decision|inbox|completion_suggestion)\./.test(event.event_type)) fragments.add('attention')
  if (/^(agent\.session|lease|handoff)\./.test(event.event_type)) {
    fragments.add('running')
    fragments.add('risks')
    fragments.add('recently_verified')
  }
  if (/^(work_item|agent\.plan)\./.test(event.event_type)) {
    fragments.add('ready_work')
    fragments.add('blocked_work')
  }
  if (/^(artifact|delivery)\./.test(event.event_type)) fragments.add('recently_verified')
  const resources = [...event.scopes, ...event.invalidates]
  const result: ControlPlaneInvalidation[] = [{ projection: 'control_center', scopeId: event.workspace_id, fragments: [...fragments] }]
  for (const resource of resources) {
    if (resource.type === 'project') result.push({ projection: 'control_center', scopeId: resource.id, fragments: [...fragments] })
    if (resource.type === 'work_item') result.push({ projection: 'execution_summary', scopeId: resource.id, fragments: [] })
    if (resource.type === 'session') {
      result.push({ projection: 'run_explanation', scopeId: resource.id, fragments: [] })
      result.push({ projection: 'control_preview', scopeId: resource.id, fragments: [] })
    }
  }
  return [...new Map(result.map(item => [`${item.projection}:${item.scopeId}`, item])).values()]
}
export type ControlCenterResponse = z.infer<typeof controlCenterResponseSchema>
export type RunExplanation = z.infer<typeof runExplanationResponseSchema>
export type WorkItemExecutionSummary = z.infer<typeof workItemExecutionSummaryResponseSchema>
export type ActionPreview = z.infer<typeof actionPreviewResponseSchema>
export const decisionInputSchema = z.object({ title: z.string().min(1).max(500), rationale: z.string().min(1).max(20_000), options: z.array(z.string().min(1).max(2_000)).max(50).default([]), selectedOption: z.string().max(2_000).optional(), evidence: z.array(z.string().min(1).max(2_000)).max(100).default([]), affectedResources: z.array(z.object({ resourceType: z.enum(['work_item', 'plan_step', 'artifact', 'session']), resourceId: idSchema, impact: z.string().min(1).max(2_000).default('affected') })).max(100).default([]), sessionId: idSchema.optional() })
export const leaseKindSchema = z.enum(['exclusive', 'review_shared'])
export const leaseResourceTypeSchema = z.enum(['work_item', 'plan_step'])
export const acquireLeaseInputSchema = z.object({ sessionId: idSchema, resourceType: leaseResourceTypeSchema, resourceId: idSchema, kind: leaseKindSchema.default('exclusive'), ttlSeconds: z.number().int().min(10).max(3_600).default(300), reason: z.string().min(1).max(2_000) })
export const handoffInputSchema = z.object({ fromSessionId: idSchema, targetAgentId: idSchema.optional(), targetSkill: z.string().min(1).max(160).optional(), scopeType: z.enum(['workspace', 'project', 'work_item', 'plan_step']).optional(), scopeId: idSchema.optional(), summary: z.string().min(1).max(20_000), completedWork: z.array(z.string().min(1).max(10_000)).max(100).default([]), remainingWork: z.array(z.string().min(1).max(10_000)).max(100).default([]), openQuestions: z.array(z.string().min(1).max(2_000)).max(100).default([]), risks: z.array(z.string().min(1).max(2_000)).max(100).default([]), acceptanceCriteria: z.array(z.string().min(1).max(2_000)).max(100).default([]), requestedAction: z.string().min(1).max(10_000).optional(), leaseTransferPolicy: z.enum(['retain', 'transfer', 'release']).default('retain'), artifactIds: z.array(idSchema).max(100).default([]), contextSnapshotId: idSchema.optional(), requestedCapabilities: z.array(capabilitySchema).max(50).default([]), status: z.enum(['draft', 'requested']).default('requested') }).refine(value => Boolean(value.targetAgentId) !== Boolean(value.targetSkill), 'Specify exactly one target agent or skill')
export const handoffMachineRejectReasonSchema = z.enum(['capability_missing', 'budget_insufficient', 'concurrency_limit', 'context_incomplete', 'conflict', 'manual_reject'])
export const handoffRejectInputSchema = z.object({ reason: z.string().min(1).max(10_000).optional(), machineReason: handoffMachineRejectReasonSchema.optional() }).superRefine((value, context) => { if (!value.reason && !value.machineReason) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide a human reason or a machine rejection reason' }) })
export const contextDeltaInputSchema = z.object({
  baseSnapshotId: idSchema,
  additions: z.array(z.object({
    sourceType: z.enum(['artifact', 'message', 'work_item', 'plan_step', 'guidance']),
    sourceId: idSchema.optional(),
    uri: z.string().url().optional(),
    hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }).superRefine((value, context) => {
    if (value.sourceType === 'guidance') {
      if (!value.uri || value.sourceId) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Guidance additions require only an authorized URI' })
    } else if (!value.sourceId || value.uri) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Internal context additions require only a source id' })
  })).min(1).max(100),
  rationale: z.string().min(1).max(10_000),
})
export const assignmentProposalInputSchema = z.object({ planStepId: idSchema, agentId: idSchema.optional(), skill: z.string().min(1).max(160).optional(), rationale: z.string().min(1).max(10_000) }).refine(value => Boolean(value.agentId) !== Boolean(value.skill), 'Specify exactly one agent or skill')

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
export const delegationResponseSchema = z.object({
  id: idSchema, workspace_id: idSchema, agent_id: idSchema, agent_actor_id: idSchema, principal_human_actor_id: idSchema,
  work_item_id: idSchema.nullable(), role: delegationRoleSchema, scope_type: delegationScopeTypeSchema, scope_id: idSchema,
  permissions_snapshot: z.array(capabilitySchema), capability_scope: capabilityScopeSchema, status: delegationStatusSchema,
  created_by_actor_id: idSchema, starts_at: timestampSchema.nullable(), ends_at: timestampSchema.nullable(), revoked_at: timestampSchema.nullable(),
  revision: revisionSchema, created_at: timestampSchema, updated_at: timestampSchema,
})

export const budgetSchema = z.object({ maxRuntimeSeconds: z.number().int().positive().max(604_800).optional(), maxInputTokens: z.number().int().nonnegative().optional(), maxOutputTokens: z.number().int().nonnegative().optional(), maxCostUsd: z.number().nonnegative().optional() }).default({})
export const externalUrlSchema = z.object({ label: z.string().min(1).max(120), url: z.string().url() })
export const delegateAndStartAgentSessionInputSchema = z.object({
  agentId: idSchema, principalHumanActorId: idSchema, role: z.literal('executor').default('executor'), requestedCapabilities: z.array(capabilitySchema).min(1).max(50),
  initialPrompt: z.string().min(1).max(50_000), contextSnapshotId: idSchema.optional(), budget: budgetSchema,
})
export const claimWorkItemInputSchema = z.object({
  requestedCapabilities: z.array(capabilitySchema).min(1).max(50).optional(),
  initialPrompt: z.string().min(1).max(50_000).optional(),
  contextSnapshotId: idSchema.optional(),
  budget: budgetSchema.optional(),
}).strict()
export const agentSessionResponseSchema = z.object({
  id: idSchema, workspace_id: idSchema, agent_id: idSchema, agent_actor_id: idSchema, delegation_id: idSchema,
  work_item_id: idSchema.nullable(), project_id: idSchema.nullable(), plan_step_id: idSchema.nullable(), state: agentSessionStateSchema,
  state_reason: z.string().nullable(), sequence: z.number().int().nonnegative(), revision: revisionSchema, current_plan_version_id: idSchema.nullable(),
  context_snapshot_id: idSchema.nullable(), budget: budgetSchema, external_urls: z.array(externalUrlSchema), last_heartbeat_at: timestampSchema.nullable(),
  heartbeat_health: z.enum(['healthy', 'degraded', 'stale']), heartbeat_health_changed_at: timestampSchema,
  heartbeat_checked_at: timestampSchema.nullable(), heartbeat_current_step_id: idSchema.nullable(), heartbeat_usage: z.record(z.unknown()),
  retry_of_session_id: idSchema.nullable(), stop_requested_at: timestampSchema.nullable(), ended_at: timestampSchema.nullable(), error_code: z.string().nullable(), error_summary: z.string().nullable(),
  created_at: timestampSchema, updated_at: timestampSchema,
})
export const delegateAndStartAgentSessionResponseSchema = z.object({ delegation: delegationResponseSchema, session: agentSessionResponseSchema })
export const claimWorkItemResponseSchema = z.object({
  delegation: delegationResponseSchema,
  session: agentSessionResponseSchema,
  exchangeToken: z.string().min(32).max(4_096),
}).strict()
export const retryAgentSessionInputSchema = z.object({ reason: z.string().min(1).max(2_000), initialPrompt: z.string().min(1).max(50_000).optional(), reuseContext: z.boolean().default(true) })
export const acknowledgeAgentSessionInputSchema = z.object({ summary: z.string().min(1).max(2_000), externalUrls: z.array(externalUrlSchema).max(20).default([]) })
export const exchangeAgentSessionTokenInputSchema = z.object({ exchangeToken: z.string().min(32).max(4_096) })
export const exchangeAgentSessionTokenResponseSchema = z.object({ sessionToken: z.string().min(1), expiresAt: timestampSchema })
export const refreshAgentSessionTokenInputSchema = z.object({ tokenId: z.string().min(1).max(500).optional() })
export const heartbeatInputSchema = z.object({ currentStepId: idSchema.optional(), usage: z.object({ runtimeSeconds: z.number().int().nonnegative(), inputTokens: z.number().int().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional(), toolCalls: z.number().int().nonnegative().optional() }) })
export const promptAgentSessionInputSchema = z.object({ bodyMarkdown: z.string().min(1).max(50_000), planRevision: revisionSchema.optional(), workItemRevision: revisionSchema.optional() })
export const sessionSignalSchema = z.enum(['stop', 'pause', 'resume'])
export const signalAgentSessionInputSchema = z.object({ signal: sessionSignalSchema, reason: z.string().min(1).max(2_000), stopMode: agentSessionStopModeSchema.optional() })
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
export const planVersionSummaryResponseSchema = planVersionResponseSchema.omit({ steps: true })
/** Immutable plan history ordered by ascending revision for compare views. */
export const planVersionHistoryResponseSchema = listResponseSchema(planVersionSummaryResponseSchema).superRefine((response, context) => {
  for (let index = 1; index < response.items.length; index += 1) {
    const previous = response.items[index - 1]
    const current = response.items[index]
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
export const guidanceScopeSchema = z.enum(['workspace', 'team', 'project'])
export const guidancePinSchema = z.object({
  scope: guidanceScopeSchema,
  scopeId: idSchema,
  uri: z.string().url(),
  revisionId: idSchema,
  revisionNumber: z.number().int().positive(),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict()
export const sessionContextResponseSchema = z.object({ session: agentSessionResponseSchema, workItem: workItemResponseSchema.nullable(), plan: planVersionResponseSchema.nullable(), contextSnapshotId: idSchema.nullable(), guidanceUris: z.array(z.string().url()), guidancePins: z.array(guidancePinSchema) })
export const guidanceRevisionMetadataSchema = z.object({
  id: idSchema,
  revisionNumber: z.number().int().positive(),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  changeSummary: z.string().min(1).max(500),
  authorActorId: idSchema,
  authorDisplayName: z.string().min(1),
  publishedAt: timestampSchema,
}).strict()
export const guidanceResponseSchema = z.object({
  scope: guidanceScopeSchema,
  scopeId: idSchema,
  documentId: idSchema.nullable(),
  status: z.enum(['unpublished', 'active', 'archived']),
  revision: z.number().int().nonnegative(),
  currentRevision: guidanceRevisionMetadataSchema.nullable(),
  markdown: z.string().max(100_000),
  updatedAt: timestampSchema,
}).strict()
export const publishGuidanceInputSchema = z.object({ markdown: z.string().max(100_000), changeSummary: z.string().min(1).max(500) }).strict()
export const archiveGuidanceInputSchema = z.object({ reason: z.string().min(1).max(2_000) }).strict()
export const rollbackGuidanceInputSchema = z.object({ revisionId: idSchema, reason: z.string().min(1).max(2_000) }).strict()
export const guidanceHistoryResponseSchema = z.object({
  scope: guidanceScopeSchema,
  scopeId: idSchema,
  documentId: idSchema.nullable(),
  revision: z.number().int().nonnegative(),
  status: z.enum(['unpublished', 'active', 'archived']),
  currentRevisionId: idSchema.nullable(),
  revisions: z.array(guidanceRevisionMetadataSchema),
  audit: z.array(z.object({
    id: idSchema,
    action: z.enum(['published', 'archived', 'rolled_back']),
    fromRevisionId: idSchema.nullable(),
    toRevisionId: idSchema.nullable(),
    actorId: idSchema,
    actorDisplayName: z.string().min(1),
    reason: z.string(),
    createdAt: timestampSchema,
  }).strict()),
}).strict()
export const guidanceDiffResponseSchema = z.object({
  scope: guidanceScopeSchema,
  scopeId: idSchema,
  from: guidanceRevisionMetadataSchema,
  to: guidanceRevisionMetadataSchema,
  changes: z.array(z.object({ kind: z.enum(['context', 'removed', 'added']), oldLine: z.number().int().positive().nullable(), newLine: z.number().int().positive().nullable(), text: z.string() }).strict()),
}).strict()

export const requestApprovalInputSchema = z.object({ sessionId: idSchema, approvalType: z.string().min(1).max(160), actionName: z.string().min(1).max(300), actionPayloadSanitized: z.record(z.unknown()), actionPayloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/), riskLevel: approvalRiskLevelSchema, rationaleSummary: z.string().min(1).max(10_000), requiredApprovals: z.number().int().positive().max(20).default(1), expiresAt: timestampSchema })
export const decideApprovalInputSchema = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().min(1).max(10_000) })
export const approvalQuorumSchema = z.object({ required: z.number().int().positive(), approved: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(), reached: z.boolean() })
export const approvalDecisionSchema = z.object({ actor_id: idSchema, decision: z.enum(['approved', 'rejected']), reason: z.string(), decided_at: timestampSchema })
export const approvalResponseSchema = requestApprovalInputSchema.extend({ id: idSchema, requested_by_actor_id: idSchema, status: approvalStatusSchema, decisions: z.array(approvalDecisionSchema), quorum: approvalQuorumSchema, consumed_at: timestampSchema.nullable(), created_at: timestampSchema, updated_at: timestampSchema })
export const approvalDecisionResponseSchema = z.object({ approval: approvalResponseSchema, decision: approvalDecisionSchema, quorum: approvalQuorumSchema, status: approvalStatusSchema })
export const consumeApprovalInputSchema = z.object({ actionPayloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/) })
export const approvalConsumptionResponseSchema = z.object({ approval_id: idSchema, status: z.literal('consumed'), consumed_at: timestampSchema, action_payload_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/) })

export const agentEventTypeSchema = z.enum(['agent.registered', 'agent.delegation.created', 'agent.delegation.revoked', 'agent.session.created', 'agent.session.acknowledged', 'agent.session.prompted', 'agent.session.state_changed', 'agent.session.health_changed', 'agent.session.stale', 'agent.session.completed', 'agent.session.failed', 'agent.coordination_session.opened', 'agent.coordination_session.refreshed', 'agent.coordination_session.closed', 'agent.plan.published', 'agent.activity.appended', 'approval.requested', 'approval.decision.recorded', 'approval.approved', 'approval.rejected', 'approval.expired', 'artifact.published'])
export const coordinationSessionOpenedReasonSchema = z.enum(['initial', 'expired', 'recovered_terminal_backing', 'recovered_invalid_backing'])
export const coordinationSessionClosedReasonSchema = z.enum(['expired', 'terminal_backing', 'invalid_binding', 'invalid_backing', 'connection_revoked'])
export const coordinationSessionOpenedEventPayloadSchema = z.object({
  connectionId: idSchema,
  sessionId: idSchema,
  reason: coordinationSessionOpenedReasonSchema,
  expiresAt: timestampSchema,
}).strict()
export const coordinationSessionRefreshedEventPayloadSchema = z.object({
  connectionId: idSchema,
  sessionId: idSchema,
  previousExpiresAt: timestampSchema,
  expiresAt: timestampSchema,
}).strict()
const coordinationSessionClosedEventPayloadBaseSchema = z.object({
  connectionId: idSchema,
  reason: coordinationSessionClosedReasonSchema,
})
export const coordinationSessionClosedEventPayloadSchema = z.union([
  coordinationSessionClosedEventPayloadBaseSchema.extend({
    sessionId: idSchema,
  }).strict(),
  coordinationSessionClosedEventPayloadBaseSchema.extend({
    sessionReferenceOmitted: z.literal('resource_scope_mismatch'),
  }).strict(),
])
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
  'WORK_ITEM_ALREADY_ASSIGNED', 'WORK_ITEM_NOT_CLAIMABLE',
  'SESSION_NOT_ACTIVE', 'SESSION_STOPPED', 'STOP_ACK_ALREADY_RECORDED', 'INVALID_SESSION_TRANSITION', 'DELEGATION_NOT_ACTIVE',
  'CAPABILITY_DENIED', 'RESOURCE_SCOPE_DENIED', 'APPROVAL_REQUIRED', 'APPROVAL_NOT_APPROVED', 'APPROVAL_EXPIRED', 'APPROVAL_PAYLOAD_MISMATCH',
  'APPROVAL_ALREADY_CONSUMED', 'PLAN_REVISION_CONFLICT', 'PLAN_STEP_ID_REUSED', 'PLAN_STEP_DEPENDENCY_MISSING', 'PLAN_STEP_DEPENDENCY_CYCLE',
  'PLAN_STEP_REMOVAL_INVALID', 'PLAN_STEP_NOT_READY', 'COMPLETION_EVIDENCE_REQUIRED', 'COMPLETION_PLAN_INCOMPLETE', 'LEASE_REQUIRED',
  'AGENT_ADMIN_REQUIRED', 'APPROVED_CAPABILITY_NOT_REQUESTED', 'AGENT_TEAM_ACCESS_NOT_FOUND',
  'AGENT_SESSION_RETRY_NOT_ALLOWED', 'INSTALLATION_TOKEN_REQUIRED', 'INSTALLATION_TOKEN_REVOKED', 'APPROVAL_QUORUM_NOT_REACHED',
  'APPROVAL_SESSION_MISMATCH', 'APPROVAL_CONSUME_CONFLICT',
  'CHILD_SESSION_LIMIT', 'PARENT_CHILDREN_INCOMPLETE', 'CHILD_BUDGET_EXCEEDED', 'COMPLETION_PLAN_INCOMPLETE', 'LEASE_CONFLICT', 'LEASE_EXPIRED',
  'HANDOFF_STATE_CONFLICT', 'STALE_PLAN_VERSION',
  'PROVIDER_CONNECTION_NOT_FOUND', 'REPOSITORY_NOT_FOUND', 'REPOSITORY_ACCESS_DENIED',
  'PROVIDER_SIGNATURE_INVALID', 'PROVIDER_DELIVERY_CONFLICT', 'PROVIDER_ACTION_CONFLICT',
  'REPOSITORY_HEAD_CHANGED', 'REPOSITORY_PATH_DENIED', 'REPOSITORY_GUIDANCE_INVALID',
  'REVIEWER_CONFLICT', 'MERGE_HEAD_CHANGED', 'MERGE_REVIEW_BLOCKED', 'MERGE_CHECKS_BLOCKED',
  'MERGE_APPROVAL_REQUIRED', 'MERGE_APPROVAL_MISMATCH', 'PROJECT_DEPENDENCY_CYCLE',
  'ARTIFACT_CHECKSUM_MISMATCH', 'ARTIFACT_UPLOAD_EXPIRED',
])
export const agentApiErrorCodeSchema = z.union([apiErrorCodeSchema, stage1ApiErrorCodeSchema])
export const agentErrorResponseSchema = z.object({ error: z.object({ code: agentApiErrorCodeSchema, message: z.string(), details: z.unknown().optional(), correlationId: z.string().min(1) }) })
export const agentExecutionConcurrencyStateSchema = z.enum([
  'queued',
  'acknowledged',
  'planning',
  'executing',
  'awaiting_input',
  'awaiting_approval',
  'blocked',
  'paused',
  'stopping',
  'stale',
])
export const agentConcurrencyLimitDetailsSchema = z.object({
  maxConcurrency: z.number().int().positive(),
  activeExecutionSessionCount: z.number().int().nonnegative(),
  countedSessionKinds: z.tuple([z.literal('execution')]),
  countedSessionStates: z.array(agentExecutionConcurrencyStateSchema).length(10)
    .refine(states => new Set(states).size === states.length, 'countedSessionStates must be unique'),
  activeExecutionSessionsByState: z.record(z.number().int().nonnegative()).superRefine((counts, context) => {
    for (const key of Object.keys(counts)) {
      if (!agentExecutionConcurrencyStateSchema.safeParse(key).success) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown execution concurrency state: ${key}` })
      }
    }
  }),
}).strict()

export const stage1RouteManifest = [
  { method: 'GET', path: '/api/v1/agents', authenticated: true },
  { method: 'POST', path: '/api/v1/agents/register', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/agents/{id}', authenticated: true },
  { method: 'PATCH', path: '/api/v1/agents/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/agents/{id}/webhook-endpoints', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agents/{id}/webhook-endpoints/{endpointId}/rotate-secret', authenticated: true, mutation: true, revisioned: true },
  { method: 'PUT', path: '/api/v1/agents/{id}/team-access/{teamId}', authenticated: true, mutation: true },
  { method: 'DELETE', path: '/api/v1/agents/{id}/team-access/{teamId}', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/work-items/{id}/agent-session', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/work-items/{id}/claim', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/delegations/{id}', authenticated: true },
  { method: 'POST', path: '/api/v1/delegations/{id}/revoke', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/agent-sessions', authenticated: true },
  { method: 'GET', path: '/api/v1/agent-sessions/{id}', authenticated: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/token/exchange', authenticated: false, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/token/refresh', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/ack', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/heartbeat', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/state', authenticated: true, mutation: true, revisioned: true },
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
  { method: 'PUT', path: '/api/v1/workspaces/{id}/guidance', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/workspaces/{id}/guidance/history', authenticated: true },
  { method: 'GET', path: '/api/v1/workspaces/{id}/guidance/diff', authenticated: true },
  { method: 'POST', path: '/api/v1/workspaces/{id}/guidance/archive', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/workspaces/{id}/guidance/rollback', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/teams/{id}/guidance', authenticated: true },
  { method: 'PUT', path: '/api/v1/teams/{id}/guidance', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/teams/{id}/guidance/history', authenticated: true },
  { method: 'GET', path: '/api/v1/teams/{id}/guidance/diff', authenticated: true },
  { method: 'POST', path: '/api/v1/teams/{id}/guidance/archive', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/teams/{id}/guidance/rollback', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/projects/{id}/guidance', authenticated: true },
  { method: 'PUT', path: '/api/v1/projects/{id}/guidance', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/projects/{id}/guidance/history', authenticated: true },
  { method: 'GET', path: '/api/v1/projects/{id}/guidance/diff', authenticated: true },
  { method: 'POST', path: '/api/v1/projects/{id}/guidance/archive', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/projects/{id}/guidance/rollback', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/artifacts', authenticated: true },
  { method: 'POST', path: '/api/v1/artifacts', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/approvals', authenticated: true },
  { method: 'POST', path: '/api/v1/approvals', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/approvals/{id}', authenticated: true },
  { method: 'POST', path: '/api/v1/approvals/{id}/decide', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/approvals/{id}/consume', authenticated: true, mutation: true, revisioned: true },
] as const
export const stage2RouteManifest = [
  { method: 'GET', path: '/api/v1/rooms', authenticated: true },
  { method: 'GET', path: '/api/v1/rooms/{id}/timeline', authenticated: true },
  { method: 'POST', path: '/api/v1/rooms/{id}/messages', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/messages/{id}/resolve', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/inbox', authenticated: true },
  { method: 'GET', path: '/api/v1/inbox/{id}', authenticated: true },
  { method: 'POST', path: '/api/v1/inbox/{id}/claim', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/inbox/{id}/acknowledge', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/inbox/{id}/reply', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/work-items/{id}/decisions', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/projects/{id}/decisions', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/decisions', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/decisions/{id}', authenticated: true },
  { method: 'POST', path: '/api/v1/decisions/{id}/finalize', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/decisions/{id}/supersede', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/decisions/{id}/reverse', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/leases', authenticated: true },
  { method: 'POST', path: '/api/v1/leases', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/leases/{id}/heartbeat', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/leases/{id}/renew', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/leases/{id}/release', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/leases/{id}/force-release', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/plan/comments', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/assignment-proposals', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/children', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/context-deltas', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{id}/review-delegations', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/handoffs', authenticated: true },
  { method: 'POST', path: '/api/v1/handoffs', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/handoffs/{id}/inspect', authenticated: true },
  { method: 'POST', path: '/api/v1/handoffs/{id}/request', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/handoffs/{id}/accept', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/handoffs/{id}/reject', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/handoffs/{id}/cancel', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/handoffs/{id}/complete', authenticated: true, mutation: true },
] as const

// Stage 3: provider-neutral delivery control-plane contracts.
export const providerKindSchema = z.enum(['fake', 'github', 'gitea'])
export const strictExternalUrlSchema = z.string().max(2_048).superRefine((value, context) => {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'A valid external URL is required' })
    return
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password)
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'External URLs must use HTTPS and must not contain credentials' })
})
export const repositoryBranchPatternSchema = z.string().min(1).max(500).superRefine((value, context) => {
  if (!value.includes('{workItemKey}'))
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Branch pattern must include {workItemKey}' })
  const literal = value.replaceAll('{workItemKey}', 'WORK-1').replaceAll('{slug}', 'slug')
  if (literal.includes('{') || literal.includes('}') || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(literal)
      || literal.endsWith('/') || literal.includes('//') || literal.includes('..') || literal.endsWith('.lock'))
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Branch pattern contains an unsupported token or Git ref character' })
})
export const providerConnectionInputSchema = z.object({
  provider: providerKindSchema,
  externalAccountId: z.string().min(1).max(500),
  displayName: z.string().min(1).max(160),
  webhookSecret: z.string().min(16).max(4_096),
  installationId: z.string().min(1).max(500).optional(),
  appId: z.string().min(1).max(100).optional(),
  privateKey: z.string().min(64).max(100_000).optional(),
  baseUrl: strictExternalUrlSchema.optional(),
  accessToken: z.string().min(16).max(10_000).optional(),
}).superRefine((value, context) => {
  if (value.provider === 'github' && (!value.installationId || !value.appId || !value.privateKey))
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'GitHub connections require installationId, appId, and privateKey' })
  if (value.provider === 'gitea' && (!value.baseUrl || !value.accessToken))
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Gitea connections require baseUrl and accessToken' })
})
export const repositoryInputSchema = z.object({
  connectionId: idSchema,
  teamId: idSchema,
  externalId: z.string().min(1).max(500),
  fullName: z.string().min(1).max(500),
  defaultBranch: z.string().min(1).max(500),
  cloneUrl: strictExternalUrlSchema.optional(),
  requiredChecks: z.array(z.string().min(1).max(300)).max(100).default([]),
})
export const repositoryGuidanceEntrySchema = z.object({
  path: z.string().min(1).max(2_000),
  blobSha: z.string().min(1).max(200),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  content: z.string().max(1_000_000),
})
export const repositoryContextInputSchema = z.object({
  projectId: idSchema.optional(),
  workItemId: idSchema.optional(),
  sessionId: idSchema.optional(),
  baseBranch: z.string().min(1).max(500),
  baseSha: z.string().min(1).max(200),
  branchPattern: repositoryBranchPatternSchema.default('workmesh/{workItemKey}-{slug}'),
  allowedPaths: z.array(z.string().min(1).max(2_000)).min(1).max(500),
  permissions: z.array(z.enum(['read', 'write_branch', 'open_pr', 'review', 'merge', 'ci'])).min(1).max(6),
}).strict().superRefine((value, context) => {
  if ([value.projectId, value.workItemId, value.sessionId].filter(Boolean).length !== 1)
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Repository context requires exactly one resource link' })
})
const deliveryLinkFields = {
  workItemId: idSchema,
  sessionId: idSchema,
  projectId: idSchema.optional(),
  planStepId: idSchema.optional(),
}
export const providerActionInputSchema = z.discriminatedUnion('kind', [
  z.object({ ...deliveryLinkFields, kind: z.literal('create_branch'), repositoryId: idSchema, name: z.string().min(1).max(500), baseSha: z.string().min(1).max(200) }),
  z.object({ ...deliveryLinkFields, kind: z.literal('create_commit'), repositoryId: idSchema, branch: z.string().min(1).max(500), expectedHeadSha: z.string().min(1).max(200), message: z.string().min(1).max(10_000), files: z.array(z.object({ path: z.string().min(1).max(2_000), content: z.string().max(2_000_000) })).min(1).max(500) }),
  z.object({ ...deliveryLinkFields, kind: z.literal('open_pull_request'), repositoryId: idSchema, baseBranch: z.string().min(1).max(500), headBranch: z.string().min(1).max(500), title: z.string().min(1).max(500), body: z.string().max(50_000), draft: z.boolean().default(true) }),
])
export const deliveryArtifactInputSchema = z.object({
  ...deliveryLinkFields,
  repositoryId: idSchema.optional(),
  pullRequestId: idSchema.optional(),
  headSha: z.string().min(1).max(200).optional(),
  type: artifactTypeSchema,
  title: z.string().min(1).max(500),
  uri: strictExternalUrlSchema.optional(),
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sourceTool: z.string().min(1).max(160),
  command: z.string().max(10_000).optional(),
  result: z.enum(['passed', 'failed', 'skipped']).optional(),
  metadata: z.record(z.unknown()).default({}),
}).superRefine((value, context) => {
  if ((value.pullRequestId === undefined) !== (value.headSha === undefined))
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Delivery artifact pullRequestId and headSha must be supplied together' })
})
export const artifactUploadIntentInputSchema = z.object({
  ...deliveryLinkFields,
  repositoryId: idSchema,
  pullRequestId: idSchema.optional(),
  headSha: z.string().min(1).max(200).optional(),
  sourceTool: z.string().min(1).max(160),
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive().max(52_428_800),
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).superRefine((value, context) => {
  if ((value.pullRequestId === undefined) !== (value.headSha === undefined))
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Upload pullRequestId and headSha must be supplied together' })
})
export const humanArtifactUploadIntentInputSchema = z.object({
  workItemId: idSchema,
  filename: z.string().min(1).max(500),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/markdown', 'application/json', 'text/csv', 'application/zip']),
  sizeBytes: z.number().int().positive().max(52_428_800),
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
})
export const artifactUploadStatusSchema = z.enum(['pending', 'uploaded', 'verified', 'rejected', 'expired', 'canceled'])
export const artifactUploadIntentStatusResponseSchema = z.object({
  id: idSchema, status: artifactUploadStatusSchema, filename: z.string(), mimeType: z.string(),
  sizeBytes: z.number().int().positive(), expectedChecksum: z.string(), actualChecksum: z.string().nullable(),
  expiresAt: timestampSchema, verifiedAt: timestampSchema.nullable(), artifactId: idSchema.nullable(), lastErrorCode: z.string().nullable(),
})
export const structuredFindingInputSchema = z.object({
  severity: z.enum(['blocking', 'high', 'medium', 'low']),
  file: z.string().min(1).max(2_000),
  line: z.number().int().positive(),
  summary: z.string().min(1).max(2_000),
  evidence: z.string().min(1).max(20_000),
  recommendation: z.string().min(1).max(20_000),
})
export const structuredReviewInputSchema = z.object({
  sessionId: idSchema,
  artifactId: idSchema,
  headSha: z.string().min(1).max(200),
  verdict: z.enum(['approved', 'changes_requested', 'commented']),
  summary: z.string().min(1).max(20_000),
  findings: z.array(structuredFindingInputSchema).max(500),
  evidence: z.array(z.string().min(1).max(20_000)).max(100).default([]),
  metadata: z.record(z.unknown()).default({}),
})
export const mergeIntentInputSchema = z.object({
  sessionId: idSchema,
  approvalId: idSchema,
  actionPayloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  headSha: z.string().min(1).max(200),
  method: z.enum(['merge', 'squash', 'rebase']),
})
export const ciRetryInputSchema = z.object({
  sessionId: idSchema,
  approvalId: idSchema,
  actionPayloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  headSha: z.string().min(1).max(200),
})
export const milestoneInputSchema = z.object({
  name: z.string().min(1).max(180),
  description: z.string().max(10_000).optional(),
  targetDate: z.coerce.date().optional(),
}).strict()
export const milestonePatchSchema = milestoneInputSchema.partial().extend({
  description: z.string().max(10_000).nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
}).strict().refine(
  value => Object.values(value).some(field => field !== undefined),
  { message: 'At least one Milestone field must be provided' },
)
export const milestoneResponseSchema = z.object({
  id: idSchema,
  workspace_id: idSchema,
  project_id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  target_date: dateSchema.nullable(),
  revision: revisionSchema,
  deleted_at: timestampSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
}).strict()
export const projectUpdateInputSchema = z.object({
  health: z.enum(['on_track', 'at_risk', 'off_track']),
  body: z.string().min(1).max(20_000),
  status: z.literal('draft').default('draft'),
  evidenceArtifactIds: z.array(idSchema).max(100).default([]),
})
export const projectUpdatePublishInputSchema = z.object({}).strict()
export const projectDependencyInputSchema = z.object({ dependsOnProjectId: idSchema })
export const completionSuggestionInputSchema = z.object({
  workItemId: idSchema,
  pullRequestId: idSchema.optional(),
  rationale: z.string().min(1).max(10_000),
  evidenceArtifactIds: z.array(idSchema).max(100).default([]),
})
export const completionSuggestionDecisionInputSchema = z.object({
  decision: z.enum(['accepted', 'dismissed']),
})

export const stage3RouteManifest = [
  { method: 'POST', path: '/api/v1/provider-connections', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/provider-webhooks/{connectionId}/github', authenticated: false, mutation: true },
  { method: 'GET', path: '/api/v1/repositories', authenticated: true },
  { method: 'POST', path: '/api/v1/repositories', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/repositories/{id}/context', authenticated: true },
  { method: 'POST', path: '/api/v1/repositories/{id}/context', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/provider-actions', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/delivery-artifacts', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/artifact-upload-intents', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/artifact-upload-intents/{id}', authenticated: true },
  { method: 'POST', path: '/api/v1/artifact-upload-intents/{id}/finalize', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/artifact-upload-intents/{id}/cancel', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/work-items/{id}/artifacts', authenticated: true },
  { method: 'GET', path: '/api/v1/artifact-upload-intents/{id}/download', authenticated: true },
  { method: 'POST', path: '/api/v1/pull-requests/{id}/reviews', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/pull-requests/{id}/merge', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/pull-requests/{id}/checks/{checkId}/retry', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/projects/{id}/delivery', authenticated: true },
  { method: 'GET', path: '/api/v1/projects/{id}/milestones', authenticated: true },
  { method: 'POST', path: '/api/v1/projects/{id}/milestones', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/milestones/{id}', authenticated: true },
  { method: 'PATCH', path: '/api/v1/milestones/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'DELETE', path: '/api/v1/milestones/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/work-items/{id}/relations', authenticated: true },
  { method: 'POST', path: '/api/v1/work-items/{id}/relations', authenticated: true, mutation: true },
  { method: 'DELETE', path: '/api/v1/work-items/{id}/relations/{relationId}', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/projects/{id}/updates', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/projects/{id}/updates/{updateId}/publish', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/projects/{id}/dependencies', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/projects/{id}/completion-suggestions', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/completion-suggestions/{id}/decision', authenticated: true, mutation: true },
] as const

export type ProviderActionInput = z.infer<typeof providerActionInputSchema>
export type RepositoryContextInput = z.infer<typeof repositoryContextInputSchema>
export type StructuredReviewInput = z.infer<typeof structuredReviewInputSchema>
export type CiRetryInput = z.infer<typeof ciRetryInputSchema>
export type CompletionSuggestionDecisionInput = z.infer<typeof completionSuggestionDecisionInputSchema>
export type WorkItemResponse = z.infer<typeof workItemResponseSchema>
export type WorkItemSurfaceSummary = z.infer<typeof workItemSurfaceSummarySchema>
export type WorkItemRelationInput = z.infer<typeof workItemRelationInputSchema>
export type WorkItemRelationResponse = z.infer<typeof workItemRelationResponseSchema>
export type MilestoneResponse = z.infer<typeof milestoneResponseSchema>
export type WorkItemAssignmentProjection = z.infer<typeof workItemAssignmentProjectionSchema>
export type WorkItemExecutorProjection = z.infer<typeof workItemExecutorProjectionSchema>
export type GuidanceScope = z.infer<typeof guidanceScopeSchema>
export type GuidanceResponse = z.infer<typeof guidanceResponseSchema>
export type GuidanceRevisionMetadata = z.infer<typeof guidanceRevisionMetadataSchema>
export type GuidancePin = z.infer<typeof guidancePinSchema>
export type PublishGuidanceInput = z.infer<typeof publishGuidanceInputSchema>
export type ArchiveGuidanceInput = z.infer<typeof archiveGuidanceInputSchema>
export type RollbackGuidanceInput = z.infer<typeof rollbackGuidanceInputSchema>
export type AgentSessionState = z.infer<typeof agentSessionStateSchema>
export type Capability = z.infer<typeof capabilitySchema>
export type PlanStepInput = z.infer<typeof planStepInputSchema>
export type CompleteAgentSessionInput = z.infer<typeof completeAgentSessionInputSchema>
export type ClaimWorkItemInput = z.infer<typeof claimWorkItemInputSchema>
export type ClaimWorkItemResponse = z.infer<typeof claimWorkItemResponseSchema>
export type ApprovalEventEnvelope = z.infer<typeof approvalEventEnvelopeSchema>

// Stage 4: planning, operational automation, usage, notifications, templates,
// and the version-isolated A2A transport boundary.
export const cycleInputSchema = z.object({
  teamId: idSchema.optional(),
  name: z.string().min(1).max(180),
  startsAt: z.coerce.date(),
  durationWeeks: z.number().int().min(1).max(8),
})
export const cycleGenerationInputSchema = z.object({
  teamId: idSchema.optional(),
  firstStartsAt: z.coerce.date(),
  durationWeeks: z.number().int().min(1).max(8),
  count: z.number().int().min(1).max(52),
  namePrefix: z.string().min(1).max(120).default('Cycle'),
})
export const cycleCarryOverInputSchema = z.object({
  targetCycleId: idSchema,
  workItemIds: z.array(idSchema).min(1).max(500).optional(),
})
export const cycleMembershipInputSchema = z.object({ cycleId: idSchema.nullable() })

export const initiativeStatusSchema = z.enum(['planned', 'active', 'paused', 'completed', 'canceled'])
export const initiativePrioritySchema = z.enum(['none', 'low', 'medium', 'high', 'urgent'])
export const healthSchema = z.enum(['on_track', 'at_risk', 'off_track', 'unknown'])
export const initiativeInputSchema = z.object({
  name: z.string().min(1).max(240),
  summary: z.string().max(2_000).optional(),
  ownerActorId: idSchema,
  parentInitiativeId: idSchema.optional(),
  status: initiativeStatusSchema.default('planned'),
  priority: initiativePrioritySchema.default('none'),
  health: healthSchema.default('unknown'),
  projectIds: z.array(idSchema).max(200).default([]),
})

export const advancedViewEntitySchema = z.enum(['issue', 'project', 'session', 'initiative'])
export const advancedViewLayoutSchema = z.enum(['list', 'board', 'timeline'])
export const advancedViewScopeSchema = z.enum(['private', 'team', 'workspace'])
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n
export const MINOR_UNIT_DECIMAL_PATTERN = DURABLE_EVENT_CURSOR_PATTERN
export const minorUnitDecimalSchema = z.string()
  .regex(MINOR_UNIT_DECIMAL_PATTERN, 'Minor-unit amount must be a canonical non-negative PostgreSQL bigint decimal string')
  .refine(value => BigInt(value) <= POSTGRES_BIGINT_MAX, 'Minor-unit amount exceeds PostgreSQL bigint range')
export const positiveMinorUnitDecimalSchema = minorUnitDecimalSchema
  .refine(value => BigInt(value) > 0n, 'Minor-unit amount must be positive')
export const advancedViewFiltersSchema = z.object({
  assigneeActorIds: z.array(idSchema).max(100).optional(),
  agentIds: z.array(idSchema).max(100).optional(),
  priorities: z.array(prioritySchema).max(5).optional(),
  projectIds: z.array(idSchema).max(100).optional(),
  cycleIds: z.array(idSchema).max(100).optional(),
  sessionStates: z.array(agentSessionStateSchema).max(20).optional(),
  approvalStatuses: z.array(approvalStatusSchema).max(10).optional(),
  health: z.array(healthSchema).max(4).optional(),
  cost: z.object({
    minMinor: minorUnitDecimalSchema.optional(),
    maxMinor: minorUnitDecimalSchema.optional(),
    currency: z.string().length(3).transform(value => value.toUpperCase()).optional(),
  }).strict().refine(
    value => value.minMinor === undefined || value.maxMinor === undefined
      || BigInt(value.minMinor) <= BigInt(value.maxMinor),
    'Minimum cost must not exceed maximum cost',
  ).optional(),
}).strict()
export const advancedViewInputSchema = z.object({
  name: z.string().min(1).max(120),
  entityType: advancedViewEntitySchema,
  teamId: idSchema.optional(),
  filters: advancedViewFiltersSchema.default({}),
  grouping: z.string().max(120).optional(),
  ordering: z.array(z.object({ field: z.string().min(1).max(120), direction: z.enum(['asc', 'desc']) })).max(10).default([]),
  visibleFields: z.array(z.string().min(1).max(120)).max(80).default([]),
  layout: advancedViewLayoutSchema,
  scope: advancedViewScopeSchema,
  favorite: z.boolean().default(false),
  isDefault: z.boolean().default(false),
})

export const forecastSourceSchema = z.object({
  kind: z.enum(['work_item', 'session', 'milestone', 'dependency', 'project_update', 'usage']),
  id: idSchema,
  observedAt: timestampSchema,
  value: z.record(z.unknown()).default({}),
})
export const projectHealthInputSchema = z.object({
  health: healthSchema.exclude(['unknown']),
  summary: z.string().min(1).max(20_000),
  forecastAt: z.coerce.date().optional(),
  confidence: z.number().min(0).max(1),
  uncertainty: z.string().min(1).max(5_000),
  sources: z.array(forecastSourceSchema).min(1).max(200),
  source: z.enum(['human', 'agent']),
  approvalId: idSchema.optional(),
  publish: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.source === 'agent' && value.publish && !value.approvalId)
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Publishing an agent health update requires exact approval' })
})

const boundedCronField = (raw: string, minimum: number, maximum: number): boolean =>
  raw.split(',').every(part => {
    if (part === '*') return true
    const step = /^\*\/(\d+)$/.exec(part)
    if (step) {
      const value = Number(step[1])
      return Number.isInteger(value) && value > 0 && value <= maximum - minimum + 1
    }
    const range = /^(\d+)-(\d+)$/.exec(part)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      return start >= minimum && end <= maximum && start <= end
    }
    const value = Number(part)
    return Number.isInteger(value) && value >= minimum && value <= maximum
  })

export const boundedUtcCronSchema = z.string().min(1).max(200).refine(raw => {
  const fields = raw.trim().split(/\s+/)
  return fields.length === 5
    && boundedCronField(fields[0]!, 0, 59)
    && boundedCronField(fields[1]!, 0, 23)
    && boundedCronField(fields[2]!, 1, 31)
    && boundedCronField(fields[3]!, 1, 12)
    && boundedCronField(fields[4]!, 0, 6)
}, { message: 'CRON_UNSUPPORTED: expected the bounded five-field UTC cron grammar' })

export const automationTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('schedule'), cron: boundedUtcCronSchema, timezone: z.literal('UTC').default('UTC') }),
  z.object({ type: z.literal('event'), eventTypes: z.array(z.string().min(1).max(200)).min(1).max(100) }),
])
export const automationConditionSchema: z.ZodType<{
  all?: unknown[]
  any?: unknown[]
  not?: unknown
  field?: string
  op?: 'eq' | 'neq' | 'in' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists'
  value?: unknown
}> = z.lazy(() => z.object({
  all: z.array(automationConditionSchema).min(1).max(50).optional(),
  any: z.array(automationConditionSchema).min(1).max(50).optional(),
  not: automationConditionSchema.optional(),
  field: z.string().min(1).max(200).optional(),
  op: z.enum(['eq', 'neq', 'in', 'contains', 'gt', 'gte', 'lt', 'lte', 'exists']).optional(),
  value: z.unknown().optional(),
}).superRefine((value, context) => {
  const forms = Number(Boolean(value.all)) + Number(Boolean(value.any)) + Number(Boolean(value.not)) + Number(Boolean(value.field))
  if (forms !== 1) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Condition must have exactly one form' })
  if (value.field && !value.op) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Leaf condition requires op' })
}))
export const automationActionSchema = z.object({
  type: z.enum(['update_work_item', 'add_label', 'create_work_item', 'delegate_agent', 'start_session', 'send_message', 'request_approval', 'create_project_update', 'call_webhook', 'notify']),
  parameters: z.record(z.unknown()).default({}),
})
export const automationRuleInputSchema = z.object({
  name: z.string().min(1).max(240),
  teamId: idSchema.optional(),
  trigger: automationTriggerSchema,
  condition: automationConditionSchema.optional(),
  actions: z.array(automationActionSchema).min(1).max(50),
  maxAttempts: z.number().int().min(1).max(12).default(5),
})
export const automationRuleVersionInputSchema = automationRuleInputSchema.omit({ name: true, teamId: true })
export const automationDryRunInputSchema = z.object({
  occurrenceKey: z.string().min(1).max(500),
  payload: z.record(z.unknown()).default({}),
})
export const automationTriggerInputSchema = automationDryRunInputSchema.extend({
  eventId: idSchema.optional(),
  scheduledFor: z.coerce.date().optional(),
})

export const loopInputSchema = z.object({
  name: z.string().min(1).max(240),
  ownerActorId: idSchema,
  teamId: idSchema.optional(),
  projectId: idSchema.optional(),
  agentId: idSchema,
  runTemplateVersionId: idSchema,
  trigger: automationTriggerSchema,
  budget: z.object({
    maxRuntimeSeconds: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
    maxCostMinor: positiveMinorUnitDecimalSchema.optional(),
    maxToolCalls: z.number().int().positive().optional(),
    currency: z.string().length(3).default('USD'),
  }),
  noOverlap: z.boolean().default(true),
  visibility: z.enum(['team', 'workspace']).default('team'),
  failureNotification: z.enum(['owner', 'team', 'none']).default('owner'),
})

export const notificationPrioritySchema = z.enum(['input', 'approval', 'agent_failure', 'mention', 'handoff', 'update'])
export const notificationChannelSchema = z.enum(['in_app', 'browser', 'webhook'])
export const notificationPreferenceInputSchema = z.object({
  channels: z.array(notificationChannelSchema).min(1).max(3),
  digest: z.enum(['immediate', 'hourly', 'daily']),
  minimumPriority: notificationPrioritySchema,
  mutedKinds: z.array(z.string().min(1).max(120)).max(100).default([]),
  webhookUrl: strictExternalUrlSchema.optional(),
})
export const notificationInputSchema = z.object({
  recipientActorId: idSchema,
  priority: notificationPrioritySchema,
  kind: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  body: z.string().max(10_000).default(''),
  sourceType: z.string().min(1).max(120),
  sourceId: idSchema,
  channels: z.array(notificationChannelSchema).min(1).max(3),
  dedupeKey: z.string().min(1).max(500),
})
export const notificationPreferenceResponseSchema = z.object({
  channels: z.array(notificationChannelSchema).min(1).max(3),
  digest: z.enum(['immediate', 'hourly', 'daily']),
  minimum_priority: notificationPrioritySchema,
  muted_kinds: z.array(z.string()),
  webhook_configured: z.boolean(),
  revision: z.number().int().nonnegative(),
  updated_at: timestampSchema.nullable(),
}).strict()
export const notificationDeliveryResponseSchema = z.object({
  channel: notificationChannelSchema,
  status: z.enum(['pending', 'claimed', 'delivered', 'failed', 'dead']),
  attempt_count: z.number().int().nonnegative(),
  available_at: timestampSchema,
  claimed_at: timestampSchema.nullable(),
  effect_completed_at: timestampSchema.nullable(),
  delivered_at: timestampSchema.nullable(),
  created_at: timestampSchema,
  last_error_present: z.boolean(),
}).strict()
export const notificationResponseSchema = z.object({
  id: idSchema,
  priority: notificationPrioritySchema,
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  source_type: z.string(),
  source_id: idSchema,
  read_at: timestampSchema.nullable(),
  created_at: timestampSchema,
  deliveries: z.array(notificationDeliveryResponseSchema),
}).strict()
export const notificationListResponseSchema = listResponseSchema(notificationResponseSchema)

export const usageInputSchema = z.object({
  dedupeKey: z.string().min(1).max(500),
  agentId: idSchema,
  sessionId: idSchema,
  projectId: idSchema.optional(),
  occurredAt: z.coerce.date(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  runtimeMs: z.number().int().nonnegative().optional(),
  toolCalls: z.number().int().nonnegative().optional(),
  costMinor: minorUnitDecimalSchema.optional(),
  currency: z.string().length(3),
  costSource: z.enum(['provider_reported', 'rate_card', 'manual', 'unknown']),
  metadata: z.record(z.unknown()).default({}),
}).superRefine((value, context) => {
  if (value.costSource === 'unknown' && value.costMinor !== undefined)
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Unknown cost must remain null, not zero' })
  if (value.costSource !== 'unknown' && value.costMinor === undefined)
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Known cost requires costMinor' })
})
export const budgetPolicyInputSchema = z.object({
  scopeType: z.enum(['workspace', 'team', 'project', 'agent', 'session', 'loop']),
  scopeId: idSchema,
  currency: z.string().length(3),
  softCostMinor: minorUnitDecimalSchema.optional(),
  hardCostMinor: positiveMinorUnitDecimalSchema.optional(),
  softTokens: z.number().int().nonnegative().optional(),
  hardTokens: z.number().int().positive().optional(),
}).refine(
  value => value.softCostMinor === undefined || value.hardCostMinor === undefined
    || BigInt(value.softCostMinor) <= BigInt(value.hardCostMinor),
  'Soft cost must not exceed hard cost',
)

export const templateKindSchema = z.enum(['work_item', 'project', 'agent_run', 'handoff', 'automation'])
export const templateInputSchema = z.object({
  teamId: idSchema.optional(),
  kind: templateKindSchema,
  name: z.string().min(1).max(240),
  description: z.string().max(5_000).default(''),
  body: z.record(z.unknown()),
})
export const templateVersionInputSchema = z.object({
  body: z.record(z.unknown()),
  changeSummary: z.string().min(1).max(2_000),
})
export const templateStateInputSchema = z.object({
  status: z.enum(['draft', 'active', 'archived']),
})
export const templateImportInputSchema = z.object({
  formatVersion: z.literal(1),
  templates: z.array(z.object({
    kind: templateKindSchema,
    name: z.string().min(1).max(240),
    description: z.string().max(5_000).default(''),
    versions: z.array(z.object({ body: z.record(z.unknown()), changeSummary: z.string().max(2_000).default('Imported') })).min(1).max(100),
  })).min(1).max(100),
})

export const stage4RouteManifest = [
  { method: 'GET', path: '/api/v1/cycles', authenticated: true },
  { method: 'POST', path: '/api/v1/cycles', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/cycles/generate', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/cycles/{id}/carry-over', authenticated: true, mutation: true },
  { method: 'PATCH', path: '/api/v1/work-items/{id}/cycle', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/initiatives', authenticated: true },
  { method: 'POST', path: '/api/v1/initiatives', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/initiatives/{id}/rollup', authenticated: true },
  { method: 'GET', path: '/api/v1/advanced-views', authenticated: true },
  { method: 'POST', path: '/api/v1/advanced-views', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/advanced-views/{id}/results', authenticated: true },
  { method: 'POST', path: '/api/v1/projects/{id}/health', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/projects/{id}/health', authenticated: true },
  { method: 'GET', path: '/api/v1/automation-rules', authenticated: true },
  { method: 'POST', path: '/api/v1/automation-rules', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/automation-rules/{id}/versions', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/automation-rules/{id}/dry-run', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/automation-rules/{id}/trigger', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/automation-rules/{id}/state', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/automation-runs', authenticated: true },
  { method: 'GET', path: '/api/v1/automation-runs/{runId}', authenticated: true },
  { method: 'GET', path: '/api/v1/loops', authenticated: true },
  { method: 'POST', path: '/api/v1/loops', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/loops/{id}/run', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/loops/{id}/state', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/usage-records', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/usage-summary', authenticated: true },
  { method: 'POST', path: '/api/v1/budget-policies', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/notifications', authenticated: true },
  { method: 'POST', path: '/api/v1/notifications', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/notification-preferences', authenticated: true },
  { method: 'PUT', path: '/api/v1/notification-preferences', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/templates', authenticated: true },
  { method: 'POST', path: '/api/v1/templates', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/templates/{id}/versions', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/templates/{id}/state', authenticated: true, mutation: true, revisioned: true },
  { method: 'GET', path: '/api/v1/templates/export', authenticated: true },
  { method: 'POST', path: '/api/v1/templates/import', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/a2a-bindings', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/a2a-bindings/{id}/tasks', authenticated: true, mutation: true },
  { method: 'GET', path: '/api/v1/a2a-bindings/{id}/tasks/{taskId}/events', authenticated: true },
] as const

// Stage 5 (v1.1): Agent Connection & Coordination MCP. The Coordination MCP
// HTTP transport is intentionally not represented in the REST route manifest;
// the MCP server reads the same shared contract schemas below. The Beta flag
// `WORKMESH_BETA_COORDINATION_MCP` is enforced at the API layer.
//
// The endpoint set is exactly the plan §"一次性配对" resource surface
// (plan v0.4) plus the well-known discovery route. No list endpoint, no
// Human landing page.
//
// Plan v0.4 (current) — Rotation is a real lifecycle with an explicit
// confirmation step, NOT worker auto-expiry:
//   1. POST /rotate issues a new pairing code. Old + new credentials
//      overlap for 15 minutes (overlap_until is a real deadline).
//   2. During overlap, Admin may call POST /rotate-confirm to revoke
//      only the old fingerprint. Connection state returns to 'active';
//      new Token is preserved; live Coordination Sessions are NOT
//      invalidated. This is the explicit implementation of the
//      original plan "确认成功后撤销旧凭据".
//   3. If Admin does NOT call /rotate-confirm, the worker auto-expires
//      the old fingerprint at overlap_until. The new Token, the
//      Connection, and the live Sessions are unaffected. Worker
//      expiry is a safety net, not the primary mechanism.
//   4. DELETE remains the hard path that revokes the entire
//      Connection AND invalidates every live Coordination Session
//      AND removes the new Token. The two operations are NOT
//      interchangeable.
// Earlier plan versions that conflated /rotate with /rotate-confirm
// (v0.2: "new redeem auto-revokes old" — withdrawn; v0.3: "worker
// auto-invalidates at overlap_until" — withdrawn in favor of v0.4)
// are recorded in the revision history at the top of the plan file.
export const stage5RouteManifest = [
  { method: 'GET', path: '/.well-known/workmesh-agent', authenticated: false },
  { method: 'GET', path: '/api/v1/agent-connections', authenticated: true },
  { method: 'POST', path: '/api/v1/agent-connections', authenticated: true, mutation: true },
  { method: 'POST', path: '/api/v1/agent-connections/redeem', authenticated: false, mutation: true },
  { method: 'GET', path: '/api/v1/agent-connections/current-identity', authenticated: true },
  { method: 'GET', path: '/api/v1/agent-connections/{id}', authenticated: true },
  { method: 'PATCH', path: '/api/v1/agent-connections/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'DELETE', path: '/api/v1/agent-connections/{id}', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/agent-connections/{id}/rotate', authenticated: true, mutation: true, revisioned: true },
  { method: 'POST', path: '/api/v1/agent-connections/{id}/rotate-confirm', authenticated: true, mutation: true, revisioned: true },
] as const

export const humanAttentionRouteManifest = [
  { method: 'GET', path: '/api/v1/human-attention', authenticated: true },
  { method: 'GET', path: '/api/v1/human-attention/{id}', authenticated: true },
] as const

export const controlPlaneReadRouteManifest = [
  { method: 'GET', path: '/api/v1/control-center', authenticated: true },
  { method: 'GET', path: '/api/v1/projects/{projectId}/control-center', authenticated: true },
  { method: 'GET', path: '/api/v1/agent-sessions/{sessionId}/explanation', authenticated: true },
  { method: 'GET', path: '/api/v1/work-items/{workItemId}/execution-summary', authenticated: true },
  { method: 'POST', path: '/api/v1/agent-sessions/{sessionId}/control-preview', authenticated: true },
] as const

export const agentRouteManifest = [
  ...stage0RouteManifest,
  ...stage1RouteManifest,
  ...stage2RouteManifest,
  ...stage3RouteManifest,
  ...stage4RouteManifest,
  ...stage5RouteManifest,
  ...humanAttentionRouteManifest,
  ...controlPlaneReadRouteManifest,
] as const

export const routePolicyManifest = createRoutePolicyManifest((path) => {
  const key = featureForApiRoute(path)
  if (!key) return undefined
  const definition = featureDefinitions.find(candidate => candidate.key === key)
  if (!definition) return undefined
  return { key, tier: definition.tier as RoutePolicyFeatureTier }
})

export const clientProfileVersionSchema = z.literal(releaseMetadata.preferredClientProfileVersion)
export const clientReactionSchema = z.enum([
  'discard_session_credentials',
  'refresh_credentials_or_stop',
  'stop_and_acknowledge',
  'do_not_retry_out_of_scope',
  'refetch_and_rebase',
  'stop_protected_action',
  'request_or_wait_for_approval',
  'disable_optional_capability',
  'resync_from_server_cursor',
])
export const clientProfileErrorReactionSchema = z.object({
  errorCode: z.string().min(1),
  reaction: clientReactionSchema,
  retryableAfterStateChange: z.boolean(),
}).strict()
export const clientProfileErrorReactions = Object.freeze([
  { errorCode: 'DELEGATION_NOT_ACTIVE', reaction: 'discard_session_credentials', retryableAfterStateChange: false },
  { errorCode: 'UNAUTHENTICATED', reaction: 'refresh_credentials_or_stop', retryableAfterStateChange: true },
  { errorCode: 'SESSION_STOPPED', reaction: 'stop_and_acknowledge', retryableAfterStateChange: false },
  { errorCode: 'RESOURCE_SCOPE_DENIED', reaction: 'do_not_retry_out_of_scope', retryableAfterStateChange: false },
  { errorCode: 'REVISION_CONFLICT', reaction: 'refetch_and_rebase', retryableAfterStateChange: true },
  { errorCode: 'LEASE_EXPIRED', reaction: 'stop_protected_action', retryableAfterStateChange: true },
  { errorCode: 'APPROVAL_REQUIRED', reaction: 'request_or_wait_for_approval', retryableAfterStateChange: true },
  { errorCode: 'FEATURE_DISABLED', reaction: 'disable_optional_capability', retryableAfterStateChange: false },
  { errorCode: 'CURSOR_EXPIRED', reaction: 'resync_from_server_cursor', retryableAfterStateChange: true },
] as const satisfies readonly z.infer<typeof clientProfileErrorReactionSchema>[])

const clientProfileFeatureSchema = z.object({
  key: featureKeySchema.nullable(),
  tier: z.enum(['stable', 'beta', 'experimental']),
  enabled: z.boolean(),
}).strict()
const clientProfileOperationSchema = z.object({
  operationId: z.string().min(1),
  policyId: z.string().min(1),
  authentication: z.enum(['agent_session', 'human_or_agent_session', 'human_or_coordination_connection', 'coordination_connection', 'installation_target']),
  transports: z.object({
    rest: z.object({ method: z.string().min(1), path: z.string().min(1) }).strict(),
    sse: z.boolean(),
    mcpBindings: z.array(z.string().min(1)),
  }).strict(),
  requirements: z.object({
    capabilities: z.array(capabilitySchema),
    activeSession: z.boolean(),
    activeDelegation: z.boolean(),
    liveGrantIntersection: z.boolean(),
    resourceScope: z.enum(['none', 'resolved_resource']),
    approval: z.boolean(),
    lease: z.boolean(),
    revision: z.enum(['none', 'if_match']),
    idempotency: z.enum(['none', 'required']),
  }).strict(),
  feature: clientProfileFeatureSchema,
  supported: z.boolean(),
  eligibleByCapability: z.boolean(),
}).strict()
export const agentCapabilityManifestResponseSchema = z.object({
  profileVersion: clientProfileVersionSchema,
  generatedFrom: z.literal('route_policy_manifest'),
  authorizationEvaluatedPerRequest: z.literal(true),
  agent: z.object({
    actorId: idSchema,
    sessionId: idSchema,
    sessionState: agentSessionStateSchema,
    sessionRevision: revisionSchema,
    effectiveCapabilities: z.array(capabilitySchema),
    capabilityScope: capabilityScopeSchema,
    supportedProtocols: z.array(agentProtocolSchema),
  }).strict(),
  delivery: z.object({
    push: z.object({ supported: z.literal(true), configured: z.boolean() }).strict(),
    pull: z.object({ supported: z.literal(true), inbox: z.literal(true) }).strict(),
    realtime: z.object({ supported: z.literal(true), durableCursor: z.literal(true) }).strict(),
  }).strict(),
  operations: z.array(clientProfileOperationSchema),
  extensions: z.array(z.object({
    id: z.string().min(1),
    tier: z.enum(['beta', 'experimental']),
    enabled: z.boolean(),
    negotiationRequired: z.literal(true),
  }).strict()),
  errorReactions: z.array(clientProfileErrorReactionSchema),
}).strict()
export type AgentCapabilityManifest = z.infer<typeof agentCapabilityManifestResponseSchema>
export type ClientProfileErrorReaction = z.infer<typeof clientProfileErrorReactionSchema>

type AgentCapabilityManifestInput = Readonly<{
  actorId: string
  sessionId: string
  sessionState: z.infer<typeof agentSessionStateSchema>
  sessionRevision: number
  effectiveCapabilities: readonly z.infer<typeof capabilitySchema>[]
  capabilityScope: z.infer<typeof capabilityScopeSchema>
  supportedProtocols: readonly z.infer<typeof agentProtocolSchema>[]
  pushConfigured: boolean
  features: Readonly<Record<FeatureKey, boolean>>
}>

export function createAgentCapabilityManifest(input: AgentCapabilityManifestInput): AgentCapabilityManifest {
  const effective = new Set<string>(input.effectiveCapabilities)
  const mcpByOperation = new Map<string, string[]>()
  for (const [binding, policy] of Object.entries(mcpPolicyBindings)) {
    const entries = mcpByOperation.get(policy.operationId) ?? []
    entries.push(binding)
    mcpByOperation.set(policy.operationId, entries)
  }
  const operations = routePolicyManifest
    .filter(policy => policy.actorKinds.includes('agent'))
    .map(policy => {
      const featureKey = policy.feature.key as FeatureKey | null
      const enabled = featureKey === null || input.features[featureKey]
      const requiredCapabilities = policy.agent.capabilities
        .map(capability => capabilitySchema.safeParse(capability))
        .filter((result): result is { success: true; data: z.infer<typeof capabilitySchema> } => result.success)
        .map(result => result.data)
      return {
        operationId: policy.operationId,
        policyId: policy.policyId,
        authentication: policy.authentication as 'agent_session' | 'human_or_agent_session' | 'human_or_coordination_connection' | 'coordination_connection' | 'installation_target',
        transports: {
          rest: policy.bindings.rest,
          sse: policy.bindings.sse,
          mcpBindings: [...(mcpByOperation.get(policy.operationId) ?? [])].sort(),
        },
        requirements: {
          capabilities: requiredCapabilities,
          activeSession: policy.agent.requireActiveSession,
          activeDelegation: policy.agent.requireActiveDelegation,
          liveGrantIntersection: policy.agent.requireLiveGrantIntersection,
          resourceScope: policy.agent.resourceScope,
          approval: policy.approval.required,
          lease: policy.lease.required,
          revision: policy.revision,
          idempotency: policy.idempotency,
        },
        feature: { key: featureKey, tier: policy.feature.tier, enabled },
        supported: enabled,
        eligibleByCapability: !policy.agent.requireLiveGrantIntersection
          || requiredCapabilities.every(capability => effective.has(capability)),
      }
    })
    .sort((left, right) => left.operationId.localeCompare(right.operationId))
  return agentCapabilityManifestResponseSchema.parse({
    profileVersion: releaseMetadata.preferredClientProfileVersion,
    generatedFrom: 'route_policy_manifest',
    authorizationEvaluatedPerRequest: true,
    agent: {
      actorId: input.actorId,
      sessionId: input.sessionId,
      sessionState: input.sessionState,
      sessionRevision: input.sessionRevision,
      effectiveCapabilities: [...input.effectiveCapabilities].sort(),
      capabilityScope: input.capabilityScope,
      supportedProtocols: [...input.supportedProtocols].sort(),
    },
    delivery: {
      push: { supported: true, configured: input.pushConfigured },
      pull: { supported: true, inbox: true },
      realtime: { supported: true, durableCursor: true },
    },
    operations,
    extensions: [
      { id: 'workmesh.a2a', tier: 'experimental', enabled: input.features.WORKMESH_EXPERIMENTAL_A2A, negotiationRequired: true },
      { id: 'workmesh.engineering-graph', tier: 'experimental', enabled: false, negotiationRequired: true },
    ],
    errorReactions: clientProfileErrorReactions,
  })
}

export type AutomationRuleInput = z.infer<typeof automationRuleInputSchema>
export type AutomationCondition = z.infer<typeof automationConditionSchema>
export type AutomationAction = z.infer<typeof automationActionSchema>
export type LoopInput = z.infer<typeof loopInputSchema>
export type UsageInput = z.infer<typeof usageInputSchema>
export type NotificationPriority = z.infer<typeof notificationPrioritySchema>
export type A2AProtocolVersion = '0.3'

// Stage 5 (v1.1): Agent Connection resource shapes.
//
// Convention matches the rest of the contract layer:
//   - Request DTOs use camelCase API field names (projectInputSchema,
//     workItemInputSchema, commentInputSchema all do the same).
//   - Response DTOs use snake_case wire format (projectResponseSchema,
//     workItemResponseSchema do the same).
//   - The well-known manifest is camelCase because clients read it before
//     any WorkMesh session exists.
//   - Schemas are .strict() by default: extra fields are rejected, not
//     preserved. .passthrough() is never used, so undeclared secrets
//     cannot leak through a Connection response.

const agentConnectionClientTypeValues = ['codex', 'opencode', 'pi', 'generic_mcp'] as const
export const agentConnectionClientTypeSchema = z.enum(agentConnectionClientTypeValues)

export const agentConnectionStatusSchema = z.enum(['pending', 'active', 'rotating', 'revoked'])

// URL pattern + URL parser defense: the regex pins the shape, the URL
// parser rejects userinfo (https://user:pass@host/...) so an attacker
// cannot carry a secret in the userinfo segment. The reviewer-flagged
// bypass `https://code@host.test/connect#wmp_...` is rejected here.
const connectUrlPattern = /^https:\/\/[a-zA-Z0-9.\-]+(:[0-9]+)?\/connect#wmp_[A-Za-z0-9_-]{43}$/
const connectUrlSchema = z
  .string()
  .superRefine((value, ctx) => {
    if (!connectUrlPattern.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'connect_url must be https://<host>/connect#wmp_<43-char-pairing-code>; userinfo, query/path credentials, and malformed fragments are rejected',
      })
      return
    }
    const beforeFragment = value.split('#')[0] ?? value
    if (/[?&=](pairing[_-]?code|code|secret|token|access[_-]?token)=/i.test(beforeFragment)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'connect_url must not embed credentials in the query or path; fragment-only is the rule',
      })
      return
    }
    try {
      const parsed = new URL(value)
      if (parsed.username || parsed.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'connect_url must not carry a userinfo segment (https://user:pass@host/...); the URL parser rejected it',
        })
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'connect_url is not a valid URL',
      })
    }
  })

export const agentConnectionCreateInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    agentSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    teamId: idSchema,
    principalHumanActorId: idSchema.optional(),
    clientType: agentConnectionClientTypeSchema,
    requestedCapabilities: z
      .array(capabilitySchema)
      .min(1)
      .max(50)
      .refine(arr => new Set(arr).size === arr.length, { message: 'requestedCapabilities must not contain duplicates' }),
    grantAgentDelegate: z.boolean().default(false),
    notes: z.string().max(2000).optional(),
  })
  .strict()

// PATCH can only change non-privilege-escalating fields. teamId, clientType,
// requestedCapabilities, grantAgentDelegate are deliberately omitted; the
// .strict() above makes any attempt to send them a validation error.
export const agentConnectionPatchInputSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    principalHumanActorId: idSchema.optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, { message: 'PATCH body must include at least one field' })

export const agentConnectionRedeemInputSchema = z
  .object({
    pairingCode: z.string().regex(/^wmp_[A-Za-z0-9_-]{43}$/),
    agentSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    client: z
      .object({
        type: agentConnectionClientTypeSchema,
        version: z.string().min(1).max(80),
        runtime: z.string().min(1).max(160).optional(),
      })
      .strict(),
  })
  .strict()

// Skill bundle: a base schema shared by the well-known manifest and the
// redeem response. The redeem response requires the download_url (the Agent
// must actually fetch the bundle); the well-known manifest does not
// (clients may already have the bundle pinned). The well-known variant
// keeps download_url optional at the base; the redeem variant extends
// with download_url required. No `allOf` mixing: one base, one extension.
// `version` is locked to the official SemVer 2.0.0 grammar
// (https://semver.org/#is-there-a-suggested-regular-expression-regexp-to-check-a-semver-string)
// so AGENT_SKILL_VERSION_MISMATCH is actually decidable on a pinned
// regex. The reviewer's previous `\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$`
// accepted `01.0.0` (leading zeros are forbidden by SemVer 2.0.0 §2),
// accepted `1.0.0-alpha..1` (consecutive dots forbidden by §9), and
// rejected `1.0.0+build.1` (build metadata is part of SemVer 2.0.0 §10).
// The official regex below covers all three. The Zod and OpenAPI patterns
// MUST stay byte-identical; the generator in
// scripts/generate-stage5-subset-blocks.mjs keeps them in sync.
// Exported so the stage5 test can assert that the OpenAPI pattern
// is byte-identical to this Zod regex (closing the v5 Standards
// sub-agent's Duplicated Code smell). Update OPENAPI.yaml when
// this changes; the test will fail if you forget.
export const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
const agentConnectionSkillBundleBaseSchema = z.object({
  name: z.literal('workmesh'),
  version: z.string().regex(semverPattern, 'skill bundle version must be SemVer 2.0.0 (https://semver.org) — leading zeros, consecutive dots, and missing build-metadata are not allowed'),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  signature: z.string().min(16).max(2000),
})
// .strict() so the well-known manifest's bundle (no download_url) rejects
// any field outside the base, including a stray download_url. The redeem
// response uses agentConnectionSkillBundleSchema which extends the base
// with download_url required.
export const agentConnectionSkillBundleSchema = agentConnectionSkillBundleBaseSchema
  .extend({ download_url: z.string().url() })
  .strict()
export const agentConnectionWellKnownSkillSchema = agentConnectionSkillBundleBaseSchema.strict()

// Cross-field invariants for AgentConnectionResponse:
//   (a) granted_capabilities ⊆ requested_capabilities (no Agent can ever
//       get a capability the Admin did not pre-authorize).
//   (b) granted_capabilities may not include agent:delegate unless
//       grant_agent_delegate is true.
//   (c) granted_capabilities must not contain duplicates.
// OpenAPI enforces (a) and (b) via if/then/else; this Zod schema enforces
// all three so non-OpenAPI clients also get the contract.
const crossFieldGrantDelegateSchema = z
  .object({
    grant_agent_delegate: z.boolean(),
    requested_capabilities: z.array(capabilitySchema),
    granted_capabilities: z.array(capabilitySchema),
  })
  .superRefine((value, ctx) => {
    if (!value.grant_agent_delegate && value.granted_capabilities.includes('agent:delegate')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'granted_capabilities may not include agent:delegate when grant_agent_delegate is false',
        path: ['granted_capabilities'],
      })
    }
    const requested = new Set(value.requested_capabilities)
    const unrequested = value.granted_capabilities.filter(c => !requested.has(c))
    if (unrequested.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `granted_capabilities must be a subset of requested_capabilities; unrequested: ${unrequested.join(', ')}`,
        path: ['granted_capabilities'],
      })
    }
    if (new Set(value.granted_capabilities).size !== value.granted_capabilities.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'granted_capabilities must not contain duplicates',
        path: ['granted_capabilities'],
      })
    }
  })

// Response schemas are .strict() (not .passthrough()) so undeclared fields
// like `installation_token` cannot ride along inside a `connection` payload.
// The combination of .strict() on the outer wrapper and the inner response
// schema being non-passthrough is what makes the connection leak impossible.
export const agentConnectionResponseSchema = z
  .object({
    id: idSchema,
    workspace_id: idSchema,
    team_id: idSchema,
    agent_actor_id: idSchema,
    principal_human_actor_id: idSchema,
    name: z.string(),
    agent_slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    client_type: agentConnectionClientTypeSchema,
    status: agentConnectionStatusSchema,
    requested_capabilities: z.array(capabilitySchema).refine(arr => new Set(arr).size === arr.length, { message: 'requested_capabilities must not contain duplicates' }),
    granted_capabilities: z.array(capabilitySchema).refine(arr => new Set(arr).size === arr.length, { message: 'granted_capabilities must not contain duplicates' }),
    grant_agent_delegate: z.boolean(),
    skill_version: z.string().regex(semverPattern, 'skill_version must be SemVer or null').nullable(),
    skill_sha256: z.string().nullable().refine(value => value === null || /^sha256:[a-f0-9]{64}$/.test(value), { message: 'skill_sha256 must be null or match sha256:<64 hex chars>' }),
    credential_fingerprint_prefix: z.string().nullable(),
    pairing_code_expires_at: timestampSchema.nullable(),
    last_used_at: timestampSchema.nullable(),
    rotated_at: timestampSchema.nullable(),
    revoked_at: timestampSchema.nullable(),
    revision: revisionSchema,
    redacted_token: z.literal(true),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict()
  .and(crossFieldGrantDelegateSchema)

export const agentConnectionListResponseSchema = listResponseSchema(agentConnectionResponseSchema)

export const agentConnectionCreateResponseSchema = z
  .object({
    connection: agentConnectionResponseSchema,
    connect_url: connectUrlSchema,
    skill: agentConnectionWellKnownSkillSchema,
  })
  .strict()

// The redeem response is keyed by Idempotency-Key for the lifetime of the
// pairing code. A replay returns the exact same bytes; the contract pins
// that promise here so the plan's "成功响应使用现有加密认证幂等机制安全
// 重放" requirement is enforceable at the schema layer. The bundle in the
// redeem response carries the required download_url.
export const agentConnectionRedeemResponseSchema = z
  .object({
    connection: agentConnectionResponseSchema,
    installation_token: z.string().regex(/^wmi_[A-Za-z0-9_-]{43}$/),
    mcp: z
      .object({
        transport: z.literal('streamable_http'),
        url: z.string().url(),
        auth: z
          .object({
            type: z.literal('installation_token'),
            header: z.literal('X-WorkMesh-Installation-Token'),
          })
          .strict(),
      })
      .strict(),
    skill: agentConnectionSkillBundleSchema,
    principal_human_actor_id: idSchema,
    team_id: idSchema,
    idempotency_replay: z
      .object({
        replayable_until: timestampSchema,
        replay_returns_identical_body: z.literal(true),
      })
      .strict(),
  })
  .strict()

export const agentConnectionRotateResponseSchema = z
  .object({
    connection: agentConnectionResponseSchema,
    connect_url: connectUrlSchema,
    pairing_code_expires_at: timestampSchema,
    overlap_until: timestampSchema,
  })
  .strict()

export const agentWellKnownResponseSchema = z
  .object({
    protocolVersion: z.literal('v1'),
    mcpUrl: z.string().url(),
    wellKnownUrl: z.string().url(),
    apiVersion: z.string().min(1).max(20),
    supportedClients: z.array(agentConnectionClientTypeSchema).min(1),
    skill: agentConnectionWellKnownSkillSchema,
  })
  .strict()

export const coordinationSessionResponseSchema = z
  .object({
    id: idSchema,
    connection_id: idSchema,
    session_kind: z.literal('coordination'),
    role: z.literal('coordinator'),
    delegation_scope: z.literal('team'),
    granted_capabilities: z
      .array(capabilitySchema)
      .refine(arr => new Set(arr).size === arr.length, { message: 'granted_capabilities must not contain duplicates' }),
    expires_at: timestampSchema,
    refreshed_at: timestampSchema.nullable(),
    team_id: idSchema,
    principal_human_actor_id: idSchema,
  })
  .strict()

// Cross-field invariants for AgentConnectionIdentity (the per-request
// identity a Coordination MCP request resolves to):
//   (a) coordination_session.granted_capabilities ⊆
//       connection.granted_capabilities
//       — a live Session cannot be granted a capability the
//         parent Connection does not have, otherwise the public
//         contract would let a Connection grant "work:read" and a
//         forged Session claim "admin:*".
//   (b) identity.granted_capabilities = coordination_session.granted_capabilities
//       — the per-request view must mirror the Session; otherwise
//         individual MCP responses could drift from the Session
//         that supposedly issued them.
//   (c) granted_capabilities has no duplicates.
//   (d) cross-Identity id binding — eight equalities across the
//       three nested objects. JSON Schema 2020-12 has no way to
//       compare two dynamic values, so (d) is enforced in Zod only;
//       the OpenAPI schema documents each binding pair in its
//       description so generated clients and spec validators still
//       know the constraint.
//         (d.1) coordination_session.connection_id === connection.id
//         (d.2) coordination_session.team_id === connection.team_id
//         (d.3) coordination_session.team_id === identity.team_id
//         (d.4) coordination_session.principal_human_actor_id
//                 === connection.principal_human_actor_id
//         (d.5) coordination_session.principal_human_actor_id
//                 === identity.principal_human_actor_id
//         (d.6) identity.agent_actor_id === connection.agent_actor_id
//         (d.7) identity.team_id === connection.team_id
//         (d.8) identity.principal_human_actor_id
//                 === connection.principal_human_actor_id
// OpenAPI enforces (a) and (b) per-capability via if/then/else blocks
// (JSON Schema 2020-12 has no subset operator); Zod enforces all
// four so non-OpenAPI clients also get the contract.
const agentConnectionIdentityCoreSchema = z
  .object({
    connection: agentConnectionResponseSchema,
    coordination_session: coordinationSessionResponseSchema,
    agent_actor_id: idSchema,
    principal_human_actor_id: idSchema,
    team_id: idSchema,
    granted_capabilities: z
      .array(capabilitySchema)
      .refine(arr => new Set(arr).size === arr.length, { message: 'granted_capabilities must not contain duplicates' }),
  })
  .strict()
const validateAgentConnectionIdentity = (
  value: z.infer<typeof agentConnectionIdentityCoreSchema>,
  ctx: z.RefinementCtx,
): void => {
    // (a) Subset: coordination_session.granted_capabilities ⊆ connection.granted_capabilities
    const connectionGranted = new Set(value.connection.granted_capabilities)
    const unrequested = value.coordination_session.granted_capabilities.filter(c => !connectionGranted.has(c))
    if (unrequested.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `coordination_session.granted_capabilities must be a subset of connection.granted_capabilities; not in connection: ${unrequested.join(', ')}`,
        path: ['coordination_session', 'granted_capabilities'],
      })
    }
    // (b) Equality: identity.granted_capabilities = coordination_session.granted_capabilities
    const sessionSet = new Set(value.coordination_session.granted_capabilities)
    const identityExtra = value.granted_capabilities.filter(c => !sessionSet.has(c))
    const sessionExtra = value.coordination_session.granted_capabilities.filter(c => !value.granted_capabilities.includes(c))
    if (identityExtra.length > 0 || sessionExtra.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `identity.granted_capabilities must equal coordination_session.granted_capabilities; identity has extras [${identityExtra.join(', ')}], session has extras [${sessionExtra.join(', ')}]`,
        path: ['granted_capabilities'],
      })
    }
    // (d) Cross-Identity id binding. The plan restricts one Connection
    // to one Team and one principal Human; a forged Session claiming
    // a different Team or a different principal must be rejected
    // before the request touches any downstream capability check.
    const idBindings: Array<{ lhs: () => string; rhs: () => string; label: string; path: string[] }> = [
      { lhs: () => value.coordination_session.connection_id, rhs: () => value.connection.id, label: 'coordination_session.connection_id === connection.id', path: ['coordination_session', 'connection_id'] },
      { lhs: () => value.coordination_session.team_id, rhs: () => value.connection.team_id, label: 'coordination_session.team_id === connection.team_id', path: ['coordination_session', 'team_id'] },
      { lhs: () => value.coordination_session.team_id, rhs: () => value.team_id, label: 'coordination_session.team_id === identity.team_id', path: ['team_id'] },
      { lhs: () => value.coordination_session.principal_human_actor_id, rhs: () => value.connection.principal_human_actor_id, label: 'coordination_session.principal_human_actor_id === connection.principal_human_actor_id', path: ['coordination_session', 'principal_human_actor_id'] },
      { lhs: () => value.coordination_session.principal_human_actor_id, rhs: () => value.principal_human_actor_id, label: 'coordination_session.principal_human_actor_id === identity.principal_human_actor_id', path: ['principal_human_actor_id'] },
      { lhs: () => value.agent_actor_id, rhs: () => value.connection.agent_actor_id, label: 'identity.agent_actor_id === connection.agent_actor_id', path: ['agent_actor_id'] },
      { lhs: () => value.team_id, rhs: () => value.connection.team_id, label: 'identity.team_id === connection.team_id', path: ['team_id'] },
      { lhs: () => value.principal_human_actor_id, rhs: () => value.connection.principal_human_actor_id, label: 'identity.principal_human_actor_id === connection.principal_human_actor_id', path: ['principal_human_actor_id'] },
    ]
    for (const { lhs, rhs, label, path } of idBindings) {
      if (lhs() !== rhs()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} (got ${lhs()} vs ${rhs()})`,
          path,
        })
      }
    }
}

export const agentConnectionIdentitySchema = agentConnectionIdentityCoreSchema
  .superRefine(validateAgentConnectionIdentity)

export const agentConnectionAuthenticatedCredentialSchema = z.discriminatedUnion('status', [
  z.object({
    fingerprint_prefix: z.string().regex(/^[a-f0-9]{12}$/),
    status: z.literal('active'),
    overlap_until: z.null(),
  }).strict(),
  z.object({
    fingerprint_prefix: z.string().regex(/^[a-f0-9]{12}$/),
    status: z.literal('overlap'),
    overlap_until: timestampSchema,
  }).strict(),
])

export const agentConnectionCurrentIdentitySchema = agentConnectionIdentityCoreSchema
  .extend({ authenticated_credential: agentConnectionAuthenticatedCredentialSchema })
  .strict()
  .superRefine(validateAgentConnectionIdentity)

export type AgentConnectionClientType = z.infer<typeof agentConnectionClientTypeSchema>
export type AgentConnectionStatus = z.infer<typeof agentConnectionStatusSchema>
export type AgentConnectionCreateInput = z.infer<typeof agentConnectionCreateInputSchema>
export type AgentConnectionPatchInput = z.infer<typeof agentConnectionPatchInputSchema>
export type AgentConnectionResponse = z.infer<typeof agentConnectionResponseSchema>
export type AgentConnectionListResponse = z.infer<typeof agentConnectionListResponseSchema>
export type AgentConnectionCreateResponse = z.infer<typeof agentConnectionCreateResponseSchema>
export type AgentConnectionRedeemInput = z.infer<typeof agentConnectionRedeemInputSchema>
export type AgentConnectionRedeemResponse = z.infer<typeof agentConnectionRedeemResponseSchema>
export type AgentConnectionRotateResponse = z.infer<typeof agentConnectionRotateResponseSchema>
export type AgentWellKnownResponse = z.infer<typeof agentWellKnownResponseSchema>
export type CoordinationSessionResponse = z.infer<typeof coordinationSessionResponseSchema>
export type AgentConnectionIdentity = z.infer<typeof agentConnectionIdentitySchema>
export type AgentConnectionCurrentIdentity = z.infer<typeof agentConnectionCurrentIdentitySchema>
