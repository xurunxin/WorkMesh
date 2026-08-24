import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type {
  AgentSessionState, Capability, CompleteAgentSessionInput, PlanStepInput,
  CiRetryInput, ProviderActionInput, StructuredReviewInput, FeatureRegistry,
  ReleaseInfo, RoutePolicyManifestEntry, ListResponse, EventEnvelope,
  InboxListItem, InboxItemDetail, InboxReplyResponse,
  WorkItemResponse, WorkItemRelationInput, WorkItemRelationResponse, MilestoneResponse,
  GuidanceResponse, GuidanceScope,
  AgentCapabilityManifest,
  AgentConnectionCreateInput, AgentConnectionCreateResponse,
  AgentConnectionCurrentIdentity,
  AgentConnectionPatchInput, AgentConnectionResponse,
  AgentConnectionRedeemInput, AgentConnectionRedeemResponse,
  AgentConnectionRotateResponse, AgentWellKnownResponse,
} from '@workmesh/contracts'
import {
  durableEventCursorSchema,
  eventEnvelopeSchema,
  routePolicyManifest,
} from '@workmesh/contracts'
export { releaseMetadata } from '@workmesh/contracts'

export type WorkMeshErrorCode =
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'WEBHOOK_TIMESTAMP_INVALID'
  | 'WEBHOOK_TIMESTAMP_EXPIRED'
  | string

export type AutomaticRetrySuppression =
  | 'attempt_limit'
  | 'retry_after_exceeds_limit'
  | 'total_retry_delay_exceeded'

export interface WorkMeshRetryMetadata {
  retryAfterHeader?: string
  retryAfterMs?: number
  automaticRetrySuppressed?: AutomaticRetrySuppression
}

export class WorkMeshSdkError extends Error {
  readonly code: WorkMeshErrorCode
  readonly status?: number
  readonly correlationId?: string
  readonly details?: unknown
  readonly retry?: WorkMeshRetryMetadata

  constructor(message: string, options: { code: WorkMeshErrorCode; status?: number; correlationId?: string; details?: unknown; retry?: WorkMeshRetryMetadata }) {
    super(message)
    this.name = 'WorkMeshSdkError'
    this.code = options.code
    this.status = options.status
    this.correlationId = options.correlationId
    this.details = options.details
    this.retry = options.retry
  }
}

export class WorkMeshCursorExpiredError extends WorkMeshSdkError {
  readonly minimumCursor: string
  readonly resyncCursor: string
  readonly resyncRequired = true

  constructor(
    message: string,
    options: {
      status: number
      correlationId?: string
      details: {
        minimumCursor: string
        resyncCursor: string
        resyncRequired: true
      }
    },
  ) {
    super(message, {
      code: 'CURSOR_EXPIRED',
      status: options.status,
      correlationId: options.correlationId,
      details: options.details,
    })
    this.name = 'WorkMeshCursorExpiredError'
    this.minimumCursor = options.details.minimumCursor
    this.resyncCursor = options.details.resyncCursor
  }
}

export type WorkMeshLogger = Pick<Console, 'debug' | 'warn'>

const sensitiveKey = /authorization|token|secret|password|signature|cookie/i

export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForLog)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : redactForLog(nested)]))
  }
  return value
}

/** Creates a repeatable key only when the caller supplies a stable operation id. */
export function stableIdempotencyKey(sessionId: string, operation: string, operationId: string = randomUUID()): string {
  const digest = createHash('sha256').update(`${sessionId}\u0000${operation}\u0000${operationId}`).digest('hex')
  return `wm_${digest.slice(0, 48)}`
}

export interface RetryOptions {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  maxRetryAfterMs?: number
  maxTotalRetryDelayMs?: number
}
export interface WorkMeshClientOptions {
  baseUrl: string
  sessionToken?: string
  installationToken?: string
  coordinationToken?: string
  fetch?: typeof globalThis.fetch
  logger?: WorkMeshLogger
  retry?: RetryOptions
}
export interface RequestOptions { signal?: AbortSignal; idempotencyKey?: string; ifMatch?: number | string; correlationId?: string; profileVersion?: string }
export interface PageRequestOptions extends RequestOptions { cursor?: string; limit?: number }
export interface EventListOptions extends RequestOptions {
  cursor: string
  limit?: number
}
export interface EventStreamOptions extends RequestOptions {
  cursor: string
}
export interface ApiCommand { id: string; revision: number }
export interface TokenExchange { sessionToken: string; expiresAt?: string }
export interface SessionAck { summary: string; externalUrls?: Array<{ label: string; url: string }> }
export interface Heartbeat { currentStepId?: string; usage: { runtimeSeconds: number; inputTokens?: number; outputTokens?: number; toolCalls?: number } }
export interface ActivityInput { kind: string; summary: string; detailsMarkdown?: string; toolInvocation?: unknown; artifactIds?: string[]; references?: unknown[]; visibility?: 'workspace' | 'team' | 'private'; ephemeral?: boolean }
export interface ApprovalInput { sessionId: string; approvalType: string; actionName: string; actionPayloadSanitized: Record<string, unknown>; actionPayloadHash: string; riskLevel: 'low' | 'medium' | 'high' | 'critical'; rationaleSummary: string; requiredApprovals?: number; expiresAt: string }
export interface ArtifactInput { sessionId: string; workItemId?: string; type: 'commit' | 'pull_request' | 'test_report' | 'code_review' | 'document' | 'link' | 'file' | 'other'; title: string; uri?: string; checksum?: string; sourceTool?: string; metadata?: Record<string, unknown> }
export interface DelegateAndStartInput { agentId: string; principalHumanActorId: string; role?: 'executor' | 'reviewer' | 'researcher' | 'coordinator' | 'triager'; requestedCapabilities: Capability[]; initialPrompt: string; contextSnapshotId?: string; budget?: Record<string, number> }
export type RoomMessageIntent = 'inform' | 'ask' | 'answer' | 'propose' | 'decide' | 'claim' | 'handoff' | 'blocker' | 'review_request' | 'review_result' | 'status'
export interface RoomMessageInput { intent: RoomMessageIntent; body: string; recipientActorId?: string; recipientActorIds?: string[]; recipientSessionId?: string; recipientSessionIds?: string[]; replyToMessageId?: string; threadId?: string; payload?: Record<string, unknown>; requiresResponse?: boolean; sessionId?: string }

export async function *iterateListPages<T>(
  load: (cursor?: string) => Promise<ListResponse<T>>,
  maximumPages = 10_000,
): AsyncGenerator<T, void, undefined> {
  let cursor: string | undefined
  for (let pageNumber = 0; pageNumber < maximumPages; pageNumber += 1) {
    const page = await load(cursor)
    for (const item of page.items) yield item
    if (!page.nextCursor) return
    cursor = page.nextCursor
  }
  throw new WorkMeshSdkError('Pagination exceeded the configured page traversal bound', {
    code: 'PAGINATION_PAGE_LIMIT_EXCEEDED',
  })
}

function pagedPath(
  path: string,
  query: Record<string, string | number | boolean | undefined>,
  options: PageRequestOptions,
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value))
  if (options.cursor !== undefined) params.set('cursor', options.cursor)
  if (options.limit !== undefined) params.set('limit', String(options.limit))
  return `${path}${params.size ? `?${params}` : ''}`
}
export interface LeaseInput { sessionId: string; resourceType: 'work_item' | 'plan_step'; resourceId: string; kind?: 'exclusive' | 'review_shared'; ttlSeconds?: number; reason: string }
export interface PlanStepCommentInput { planVersionId: string; planStepId: string; body: string; references?: unknown[] }
export interface AssignmentProposalInput { planStepId: string; agentId?: string; skill?: string; rationale: string }
export type ContextDeltaAddition =
  | { sourceType: 'artifact' | 'message' | 'work_item' | 'plan_step'; sourceId: string; uri?: never; hash: string }
  | { sourceType: 'guidance'; uri: string; sourceId?: never; hash: string }
export interface ContextDeltaInput { baseSnapshotId: string; additions: ContextDeltaAddition[]; rationale: string }
export interface ChildSessionInput { agentId: string; planStepId: string; planVersionId: string; role?: 'executor' | 'reviewer' | 'researcher'; initialPrompt: string; required?: boolean; budget?: Record<string, number> }
export interface ReviewDelegationInput { reviewerAgentId: string; planStepId: string; planVersionId: string; initialPrompt: string; ttlSeconds?: number }
export interface HandoffInput { fromSessionId: string; targetAgentId?: string; targetSkill?: string; scopeType?: 'workspace' | 'project' | 'work_item' | 'plan_step'; scopeId?: string; summary: string; completedWork?: string[]; remainingWork?: string[]; openQuestions?: string[]; risks?: string[]; acceptanceCriteria?: string[]; requestedAction?: string; leaseTransferPolicy?: 'retain' | 'transfer' | 'release'; artifactIds?: string[]; contextSnapshotId?: string; requestedCapabilities?: Capability[]; status?: 'draft' | 'requested' }
export interface HandoffTransitionInput { reason?: string }
export type HandoffMachineRejectReason = 'capability_missing' | 'budget_insufficient' | 'concurrency_limit' | 'context_incomplete' | 'conflict' | 'manual_reject'
export interface HandoffRejectInput { reason?: string; machineReason?: HandoffMachineRejectReason }

const sdkRouteMatchers = routePolicyManifest.map(policy => ({
  policy,
  pattern: new RegExp(`^${policy.path
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{[^}]+\\\}/g, '[^/]+')}$`),
}))

export function resolveSdkRoutePolicy(
  method: string,
  pathname: string,
): RoutePolicyManifestEntry {
  const match = sdkRouteMatchers.find(candidate =>
    candidate.policy.method === method.toUpperCase()
    && candidate.pattern.test(pathname),
  )
  if (!match) {
    throw new WorkMeshSdkError('The SDK operation has no registered route policy', {
      code: 'SDK_ROUTE_POLICY_MISSING',
      details: { method: method.toUpperCase(), pathname },
    })
  }
  return match.policy
}

export class WorkMeshClient {
  private readonly baseUrl: string
  private sessionToken?: string
  private readonly installationToken?: string
  private readonly coordinationToken?: string
  private readonly requestFetch: typeof globalThis.fetch
  private readonly logger?: WorkMeshLogger
  private readonly retry: Required<RetryOptions>

  constructor(options: WorkMeshClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.sessionToken = options.sessionToken
    this.installationToken = options.installationToken
    this.coordinationToken = options.coordinationToken
    this.requestFetch = options.fetch ?? globalThis.fetch
    this.logger = options.logger
    this.retry = normalizeRetryOptions(options.retry)
  }

  setSessionToken(token: string | undefined): void { this.sessionToken = token }

  getServerInfo(options?: RequestOptions): Promise<ReleaseInfo> {
    return this.request('GET', '/api/v1/info', undefined, options)
  }

  getFeatures(options?: RequestOptions): Promise<FeatureRegistry> {
    return this.request('GET', '/api/v1/features', undefined, options)
  }

  getAgentCapabilities(options: RequestOptions = {}): Promise<AgentCapabilityManifest> {
    return this.request('GET', '/api/v1/agent-capabilities', undefined, options)
  }

  getCurrentAgentConnectionIdentity(options: RequestOptions = {}): Promise<AgentConnectionCurrentIdentity> {
    return this.request('GET', '/api/v1/agent-connections/current-identity', undefined, options)
  }

  getWellKnown(options?: RequestOptions): Promise<AgentWellKnownResponse> { return this.request('GET', '/.well-known/workmesh-agent', undefined, options) }
  createAgentConnection(input: AgentConnectionCreateInput, options: RequestOptions = {}): Promise<AgentConnectionCreateResponse> { return this.request('POST', '/api/v1/agent-connections', input, { ...options, idempotencyKey: options.idempotencyKey ?? randomUUID() }) }
  redeemAgentConnection(input: AgentConnectionRedeemInput, options: RequestOptions = {}): Promise<AgentConnectionRedeemResponse> { return this.request('POST', '/api/v1/agent-connections/redeem', input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.pairingCode, 'agent-connection-redeem') }) }
  getAgentConnection(id: string, options?: RequestOptions): Promise<AgentConnectionResponse> { return this.request('GET', `/api/v1/agent-connections/${encodeURIComponent(id)}`, undefined, options) }
  patchAgentConnection(id: string, input: AgentConnectionPatchInput, options: RequestOptions & { ifMatch: number | string }): Promise<AgentConnectionResponse> { return this.request('PATCH', `/api/v1/agent-connections/${encodeURIComponent(id)}`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(id, 'agent-connection-patch') }) }
  revokeAgentConnection(id: string, options: RequestOptions & { ifMatch: number | string }): Promise<void> { return this.request('DELETE', `/api/v1/agent-connections/${encodeURIComponent(id)}`, undefined, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(id, 'agent-connection-revoke') }) }
  rotateAgentConnection(id: string, options: RequestOptions & { ifMatch: number | string }): Promise<AgentConnectionRotateResponse> { return this.request('POST', `/api/v1/agent-connections/${encodeURIComponent(id)}/rotate`, {}, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(id, 'agent-connection-rotate') }) }
  confirmAgentConnectionRotation(id: string, options: RequestOptions & { ifMatch: number | string }): Promise<AgentConnectionResponse> { return this.request('POST', `/api/v1/agent-connections/${encodeURIComponent(id)}/rotate-confirm`, {}, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(id, 'agent-connection-rotate-confirm') }) }

  listTeams<T = unknown>(options: PageRequestOptions = {}): Promise<ListResponse<T>> { return this.request('GET', pagedPath('/api/v1/teams', {}, options), undefined, options) }
  listWorkflowStates<T = unknown>(teamId: string, options: PageRequestOptions = {}): Promise<ListResponse<T>> { return this.request('GET', pagedPath(`/api/v1/teams/${encodeURIComponent(teamId)}/states`, {}, options), undefined, options) }
  listProjects<T = unknown>(query: Record<string, string | number | boolean | undefined> = {}, options: PageRequestOptions = {}): Promise<ListResponse<T>> { return this.request('GET', pagedPath('/api/v1/projects', query, options), undefined, options) }
  getProject<T = unknown>(projectId: string, options?: RequestOptions): Promise<T> { return this.request('GET', `/api/v1/projects/${encodeURIComponent(projectId)}`, undefined, options) }
  createProject<T = unknown>(input: { teamId: string; name: string; summary?: string; description?: string | null; status?: string; leadActorId?: string | null; targetDate?: string | null }, options: RequestOptions = {}): Promise<T> { return this.request('POST', '/api/v1/projects', input, { ...options, idempotencyKey: options.idempotencyKey ?? randomUUID() }) }
  updateProject<T = unknown>(projectId: string, input: Record<string, unknown>, options: RequestOptions & { ifMatch: number | string }): Promise<T> { return this.request('PATCH', `/api/v1/projects/${encodeURIComponent(projectId)}`, input, { ...options, idempotencyKey: options.idempotencyKey ?? randomUUID() }) }
  createWorkItem<T = WorkItemResponse>(input: { teamId: string; title: string; description?: string; statusId: string; priority?: 'none'|'low'|'medium'|'high'|'urgent'; dueDate?: string; responsibleHumanActorId?: string; labels?: string[]; projectId?: string; milestoneId?: string; parentId?: string }, options: RequestOptions = {}): Promise<T> { return this.request('POST', '/api/v1/work-items', { priority: 'none', labels: [], ...input }, { ...options, idempotencyKey: options.idempotencyKey ?? randomUUID() }) }
  updateWorkItem<T = WorkItemResponse>(workItemId: string, input: Record<string, unknown>, options: RequestOptions & { ifMatch: number | string }): Promise<T> { return this.request('PATCH', `/api/v1/work-items/${encodeURIComponent(workItemId)}`, input, { ...options, idempotencyKey: options.idempotencyKey ?? randomUUID() }) }
  listProjectMilestones<T = MilestoneResponse>(projectId: string, options: PageRequestOptions = {}): Promise<ListResponse<T>> { return this.request('GET', pagedPath(`/api/v1/projects/${encodeURIComponent(projectId)}/milestones`, {}, options), undefined, options) }
  getMilestone<T = MilestoneResponse>(milestoneId: string, options?: RequestOptions): Promise<T> { return this.request('GET', `/api/v1/milestones/${encodeURIComponent(milestoneId)}`, undefined, options) }
  createMilestone<T = MilestoneResponse>(projectId: string, input: { name: string; description?: string; targetDate?: string }, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/milestones`, input, { ...options, idempotencyKey: options.idempotencyKey ?? randomUUID() }) }
  updateMilestone<T = MilestoneResponse>(milestoneId: string, input: Record<string, unknown>, options: RequestOptions & { ifMatch: number | string }): Promise<T> { return this.request('PATCH', `/api/v1/milestones/${encodeURIComponent(milestoneId)}`, input, { ...options, idempotencyKey: options.idempotencyKey ?? randomUUID() }) }
  deleteMilestone<T = { id: string; revision: number }>(milestoneId: string, options: RequestOptions & { ifMatch: number | string }): Promise<T> { return this.request('DELETE', `/api/v1/milestones/${encodeURIComponent(milestoneId)}`, undefined, { ...options, idempotencyKey: options.idempotencyKey ?? randomUUID() }) }
  listWorkItemRelations<T = WorkItemRelationResponse>(workItemId: string, options: PageRequestOptions = {}): Promise<ListResponse<T>> { return this.request('GET', pagedPath(`/api/v1/work-items/${encodeURIComponent(workItemId)}/relations`, {}, options), undefined, options) }
  createWorkItemRelation<T = WorkItemRelationResponse>(workItemId: string, input: WorkItemRelationInput, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/work-items/${encodeURIComponent(workItemId)}/relations`, input, { ...options, idempotencyKey: options.idempotencyKey ?? randomUUID() }) }
  deleteWorkItemRelation<T = { id: string; revision: number }>(workItemId: string, relationId: string, options: RequestOptions & { ifMatch: number | string }): Promise<T> { return this.request('DELETE', `/api/v1/work-items/${encodeURIComponent(workItemId)}/relations/${encodeURIComponent(relationId)}`, undefined, { ...options, idempotencyKey: options.idempotencyKey ?? randomUUID() }) }

  async exchangeSessionToken(sessionId: string, exchangeToken: string, installationToken: string, options: RequestOptions = {}): Promise<TokenExchange> {
    // The one-time code is not a bearer credential: the active installation token proves the Agent identity.
    const result = await this.request<TokenExchange>('POST', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/token/exchange`, { exchangeToken }, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, 'token-exchange'), authorizationToken: installationToken, skipTokenRefresh: true })
    this.sessionToken = result.sessionToken
    return result
  }
  async refreshSessionToken(sessionId: string, installationToken = this.installationToken, options: RequestOptions = {}): Promise<TokenExchange> {
    if (!installationToken) throw new WorkMeshSdkError('An installation token is required to refresh a session token', { code: 'INSTALLATION_TOKEN_REQUIRED' })
    const result = await this.request<TokenExchange>('POST', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/token/refresh`, {}, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, 'token-refresh'), authorizationToken: installationToken, skipTokenRefresh: true, refreshSessionId: sessionId })
    this.sessionToken = result.sessionToken
    return result
  }

  getSession<T = unknown>(sessionId: string, options: RequestOptions = {}): Promise<T> { return this.request('GET', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}`, undefined, { ...options, refreshSessionId: sessionId }) }
  getSessionContext<T = unknown>(sessionId: string, options: RequestOptions = {}): Promise<T> { return this.request('GET', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/context`, undefined, { ...options, refreshSessionId: sessionId }) }
  getPlan<T = unknown>(sessionId: string, options: RequestOptions = {}): Promise<T> { return this.request('GET', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/plan`, undefined, { ...options, refreshSessionId: sessionId }) }
  getActivities<T = unknown>(sessionId: string, options: PageRequestOptions = {}): Promise<ListResponse<T>> { return this.request('GET', pagedPath(`/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/activities`, {}, options), undefined, { ...options, refreshSessionId: sessionId }) }
  getRoom<T = unknown>(query: { workItemId?: string; projectId?: string; sessionId?: string }, options: RequestOptions = {}): Promise<T> { const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined) as [string,string][]); return this.request('GET', `/api/v1/rooms?${params}`, undefined, options) }
  getRoomTimeline<T = unknown>(roomId: string, options: PageRequestOptions = {}): Promise<ListResponse<T>> { return this.request('GET', pagedPath(`/api/v1/rooms/${encodeURIComponent(roomId)}/timeline`, {}, options), undefined, options) }
  postRoomMessage<T = unknown>(roomId: string, input: RoomMessageInput, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/rooms/${encodeURIComponent(roomId)}/messages`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.sessionId ?? roomId, 'room-message') }) }
  listInbox<T = InboxListItem>(status: 'open' | 'resolved' = 'open', options: PageRequestOptions = {}): Promise<ListResponse<T>> { return this.request('GET', pagedPath('/api/v1/inbox', { status }, options), undefined, options) }
  getInboxItem<T = InboxItemDetail>(inboxItemId: string, options: RequestOptions = {}): Promise<T> { return this.request('GET', `/api/v1/inbox/${encodeURIComponent(inboxItemId)}`, undefined, options) }
  claimInboxItem<T = InboxItemDetail>(inboxItemId: string, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/inbox/${encodeURIComponent(inboxItemId)}/claim`, {}, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(inboxItemId, 'inbox-claim') }) }
  acknowledgeInboxItem<T = InboxItemDetail>(inboxItemId: string, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/inbox/${encodeURIComponent(inboxItemId)}/acknowledge`, {}, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(inboxItemId, 'inbox-acknowledge') }) }
  replyInboxItem<T = InboxReplyResponse>(inboxItemId: string, input: { body: string; payload?: Record<string, unknown> }, options: RequestOptions & { ifMatch: number | string }): Promise<T> { return this.request('POST', `/api/v1/inbox/${encodeURIComponent(inboxItemId)}/reply`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(inboxItemId, 'inbox-reply') }) }
  commentPlanStep<T = unknown>(sessionId: string, input: PlanStepCommentInput, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/plan/comments`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, `plan-step-comment:${input.planStepId}`), refreshSessionId: sessionId }) }
  proposeAssignment<T = unknown>(sessionId: string, input: AssignmentProposalInput, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/assignment-proposals`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, `assignment-proposal:${input.planStepId}`), refreshSessionId: sessionId }) }
  createChildSession<T = unknown>(parentSessionId: string, input: ChildSessionInput, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/agent-sessions/${encodeURIComponent(parentSessionId)}/children`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(parentSessionId, `child-session:${input.planStepId}`), refreshSessionId: parentSessionId }) }
  appendContextDelta<T = unknown>(sessionId: string, input: ContextDeltaInput, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/context-deltas`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, 'context-delta'), refreshSessionId: sessionId }) }
  createReviewDelegation<T = unknown>(sessionId: string, input: ReviewDelegationInput, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/review-delegations`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, `review-delegation:${input.planStepId}`), refreshSessionId: sessionId }) }
  acquireLease<T = unknown>(input: LeaseInput, options: RequestOptions = {}): Promise<T> { return this.request('POST', '/api/v1/leases', input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.sessionId, 'lease') }) }
  mutateLease<T = unknown>(leaseId: string, action: 'heartbeat' | 'renew' | 'release' | 'force-release', input: { ttlSeconds?: number; reason?: string } = {}, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/leases/${encodeURIComponent(leaseId)}/${action}`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(leaseId, action) }) }
  offerHandoff<T = unknown>(input: HandoffInput, options: RequestOptions = {}): Promise<T> { return this.request('POST', '/api/v1/handoffs', input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.fromSessionId, 'handoff-offer'), refreshSessionId: input.fromSessionId }) }
  inspectPendingHandoff<T = unknown>(handoffId: string, installationToken = this.installationToken, options: RequestOptions = {}): Promise<T> {
    if (!installationToken) throw new WorkMeshSdkError('An installation token is required to inspect a pending handoff', { code: 'INSTALLATION_TOKEN_REQUIRED' })
    return this.request('GET', `/api/v1/handoffs/${encodeURIComponent(handoffId)}/inspect`, undefined, { ...options, authorizationToken: installationToken, skipTokenRefresh: true })
  }
  requestHandoff<T = unknown>(handoffId: string, input: HandoffTransitionInput = {}, options: RequestOptions = {}): Promise<T> { return this.mutateHandoff(handoffId, 'request', input, options) }
  cancelHandoff<T = unknown>(handoffId: string, input: HandoffTransitionInput = {}, options: RequestOptions = {}): Promise<T> { return this.mutateHandoff(handoffId, 'cancel', input, options) }
  completeHandoff<T = unknown>(handoffId: string, input: HandoffTransitionInput = {}, options: RequestOptions = {}): Promise<T> { return this.mutateHandoff(handoffId, 'complete', input, options) }
  rejectHandoff<T = unknown>(handoffId: string, input: HandoffRejectInput, options: RequestOptions = {}): Promise<T> {
    if (this.sessionToken) return this.mutateHandoff(handoffId, 'reject', input, options)
    if (!this.installationToken) throw new WorkMeshSdkError('A session or installation token is required to reject a handoff', { code: 'AUTHORIZATION_TOKEN_REQUIRED' })
    return this.request('POST', `/api/v1/handoffs/${encodeURIComponent(handoffId)}/reject`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(handoffId, 'handoff-reject'), authorizationToken: this.installationToken, skipTokenRefresh: true })
  }
  getWorkItem<T = WorkItemResponse>(workItemId: string, options?: RequestOptions): Promise<T> { return this.request('GET', `/api/v1/work-items/${encodeURIComponent(workItemId)}`, undefined, options) }
  listWorkItems<T = WorkItemResponse>(query: Record<string, string | number | boolean | undefined> = {}, options: PageRequestOptions = {}): Promise<ListResponse<T>> {
    return this.request('GET', pagedPath('/api/v1/work-items', query, options), undefined, options)
  }
  async listEvents(options: EventListOptions): Promise<EventEnvelope[]> {
    const cursor = durableEventCursorSchema.parse(options.cursor)
    const params = new URLSearchParams({ cursor })
    if (options.limit !== undefined) params.set('limit', String(options.limit))
    const events = await this.request<unknown[]>(
      'GET',
      `/api/v1/events?${params}`,
      undefined,
      options,
    )
    return events.map(event => eventEnvelopeSchema.parse(event))
  }
  async *streamEvents(
    options: EventStreamOptions,
  ): AsyncGenerator<EventEnvelope, void, undefined> {
    let cursor = durableEventCursorSchema.parse(options.cursor)
    let attempt = 0
    let totalRetryDelayMs = 0
    while (!options.signal?.aborted) {
      const url = new URL('/api/v1/events/stream', `${this.baseUrl}/`)
      url.searchParams.set('cursor', cursor)
      resolveSdkRoutePolicy('GET', url.pathname)
      const headers: Record<string, string> = {
        accept: 'text/event-stream',
        'last-event-id': cursor,
      }
      if (this.sessionToken)
        headers.authorization = `Bearer ${this.sessionToken}`
      if (options.correlationId)
        headers['x-correlation-id'] = options.correlationId
      try {
        const response = await this.requestFetch(url, {
          method: 'GET',
          headers,
          signal: options.signal,
        })
        if (!response.ok) {
          const payload = await readErrorPayload(response)
          if (!shouldRetry(response.status))
            throw toSdkError(response.status, payload)
          const retryAfterHeader = response.headers.get('retry-after')
          const retryAfterMs = parseRetryAfter(retryAfterHeader)
          const delayMs =
            retryAfterMs ?? exponentialRetryDelay(attempt + 1, this.retry)
          const suppressed =
            attempt + 1 >= this.retry.maxAttempts
              ? 'attempt_limit'
              : retryAfterMs !== undefined
                  && retryAfterMs > this.retry.maxRetryAfterMs
                ? 'retry_after_exceeds_limit'
                : delayMs > this.retry.maxTotalRetryDelayMs - totalRetryDelayMs
                  ? 'total_retry_delay_exceeded'
                  : undefined
          if (suppressed)
            throw toSdkError(response.status, payload, {
              retryAfterHeader: retryAfterHeader ?? undefined,
              retryAfterMs,
              automaticRetrySuppressed: suppressed,
            })
          attempt += 1
          totalRetryDelayMs += delayMs
          await wait(delayMs, options.signal)
          continue
        }
        if (!response.body)
          throw new WorkMeshSdkError('WorkMesh returned an empty SSE body', {
            code: 'MALFORMED_RESPONSE',
            status: response.status,
          })
        let received = false
        for await (const frame of decodeSse(response.body)) {
          if (!frame.data) continue
          let payload: unknown
          try {
            payload = JSON.parse(frame.data)
          } catch {
            throw new WorkMeshSdkError('WorkMesh returned invalid SSE JSON', {
              code: 'MALFORMED_RESPONSE',
              status: response.status,
            })
          }
          if (
            frame.event === 'control'
            && payload
            && typeof payload === 'object'
            && (payload as { type?: unknown }).type === 'cursor.expired'
          ) {
            const error = (payload as { error?: unknown }).error
            throw toSdkError(409, { error })
          }
          const event = eventEnvelopeSchema.parse(payload)
          if (frame.id && frame.id !== event.cursor)
            throw new WorkMeshSdkError(
              'SSE id and durable event cursor do not match',
              { code: 'MALFORMED_RESPONSE', status: response.status },
            )
          received = true
          yield event
          cursor = event.cursor
          attempt = 0
          totalRetryDelayMs = 0
        }
        if (options.signal?.aborted) return
        if (received) attempt = 0
        throw new TypeError('WorkMesh SSE connection ended')
      } catch (cause) {
        if (
          cause instanceof WorkMeshSdkError
          || options.signal?.aborted
        )
          throw cause
        attempt += 1
        const delayMs = exponentialRetryDelay(attempt, this.retry)
        if (
          attempt >= this.retry.maxAttempts
          || delayMs > this.retry.maxTotalRetryDelayMs - totalRetryDelayMs
        )
          throw new WorkMeshSdkError(
            'Unable to maintain the WorkMesh event stream',
            {
              code: 'NETWORK_ERROR',
              details: redactForLog({
                cause: cause instanceof Error ? cause.message : String(cause),
              }),
              retry: { automaticRetrySuppressed: 'attempt_limit' },
            },
          )
        totalRetryDelayMs += delayMs
        await wait(delayMs, options.signal)
      }
    }
  }
  getGuidance<T = GuidanceResponse>(scope: GuidanceScope, id: string, options?: RequestOptions): Promise<T> { return this.request('GET', `/api/v1/${scope}s/${encodeURIComponent(id)}/guidance`, undefined, options) }
  /** Delegation and session creation happen in one server transaction. */
  delegateAndStart<T = unknown>(workItemId: string, input: DelegateAndStartInput, options: RequestOptions & { ifMatch: number | string }): Promise<T> {
    return this.request('POST', `/api/v1/work-items/${encodeURIComponent(workItemId)}/agent-session`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(workItemId, 'delegate-and-start'), ifMatch: options.ifMatch })
  }

  acknowledge(sessionId: string, input: SessionAck, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'ack', input, options) }
  transitionState(sessionId: string, state: AgentSessionState, reason: string, options: RequestOptions & { ifMatch: number | string }): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'state', { state, reason }, options, true) }
  heartbeat(sessionId: string, input: Heartbeat, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'heartbeat', input, options) }
  sendPrompt(sessionId: string, input: { bodyMarkdown: string; planRevision?: number; workItemRevision?: number }, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'prompt', input, options) }
  appendActivity(sessionId: string, input: ActivityInput, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'activities', input, options) }
  sendMessage(sessionId: string, bodyMarkdown: string, options: RequestOptions = {}): Promise<ApiCommand> { return this.appendActivity(sessionId, { kind: 'message', summary: bodyMarkdown, detailsMarkdown: bodyMarkdown }, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, 'message') }) }
  askQuestion(sessionId: string, question: string, options: RequestOptions = {}): Promise<ApiCommand> { return this.appendActivity(sessionId, { kind: 'question', summary: question, detailsMarkdown: question }, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, 'question') }) }
  publishPlan(sessionId: string, input: { changeSummary: string; steps: PlanStepInput[]; approvalId?: string; approvalPayloadHash?: string }, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('PUT', sessionId, 'plan', input, options, true) }
  sendSignal(sessionId: string, signal: 'stop' | 'pause' | 'resume', reason: string, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'signals', { signal, reason }, options, true) }
  stopAcknowledgement(sessionId: string, input: { cleanupSummary: string; residualRisks?: string[] }, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'stop-ack', input, options, true) }
  complete(sessionId: string, input: CompleteAgentSessionInput, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'complete', input, options, true) }
  fail(sessionId: string, input: { code: string; summary: string; retryable?: boolean; evidence?: string[] }, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'fail', input, options, true) }
  retrySession<T = unknown>(sessionId: string, input: { reason: string; initialPrompt?: string; reuseContext?: boolean }, options: RequestOptions & { ifMatch: number | string }): Promise<T> { return this.request('POST', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/retry`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, 'retry'), refreshSessionId: sessionId }) }
  publishArtifact(input: ArtifactInput, options: RequestOptions = {}): Promise<ApiCommand> { return this.request('POST', '/api/v1/artifacts', input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.sessionId, 'publish-artifact'), refreshSessionId: input.sessionId }) }
  requestApproval(input: ApprovalInput, options: RequestOptions = {}): Promise<ApiCommand> { return this.request('POST', '/api/v1/approvals', input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.sessionId, 'request-approval'), refreshSessionId: input.sessionId }) }
  consumeApproval<T = unknown>(approvalId: string, input: { actionPayloadHash: string }, options: RequestOptions & { sessionId: string; ifMatch: number | string }): Promise<T> {
    return this.request('POST', `/api/v1/approvals/${encodeURIComponent(approvalId)}/consume`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(options.sessionId, `consume-approval:${approvalId}`), refreshSessionId: options.sessionId })
  }
  listRepositories<T = unknown>(options: PageRequestOptions = {}): Promise<ListResponse<T>> { return this.request('GET', pagedPath('/api/v1/repositories', {}, options), undefined, options) }
  getRepositoryContext<T = unknown>(repositoryId: string, options: RequestOptions = {}): Promise<T> { return this.request('GET', `/api/v1/repositories/${encodeURIComponent(repositoryId)}/context`, undefined, options) }
  requestProviderAction<T = unknown>(input: ProviderActionInput, options: RequestOptions = {}): Promise<T> { return this.request('POST', '/api/v1/provider-actions', input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.sessionId, `provider:${input.kind}`), refreshSessionId: input.sessionId }) }
  publishDeliveryArtifact<T = unknown>(input: { workItemId: string; sessionId: string; projectId?: string; planStepId?: string; repositoryId?: string; pullRequestId?: string; headSha?: string; type: ArtifactInput['type'] | 'branch' | 'diff' | 'build' | 'preview'; title: string; uri?: string; checksum: string; sourceTool: string; command?: string; result?: 'passed' | 'failed' | 'skipped'; metadata?: Record<string, unknown> }, options: RequestOptions = {}): Promise<T> { return this.request('POST', '/api/v1/delivery-artifacts', input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.sessionId, `delivery-artifact:${input.type}`), refreshSessionId: input.sessionId }) }
  requestArtifactUpload<T = unknown>(input: { workItemId: string; sessionId: string; projectId?: string; planStepId?: string; repositoryId: string; pullRequestId?: string; headSha?: string; sourceTool: string; filename: string; mimeType: string; sizeBytes: number; checksum: string }, options: RequestOptions = {}): Promise<T> { return this.request('POST', '/api/v1/artifact-upload-intents', input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.sessionId, `artifact-upload:${input.filename}:${input.checksum}`), refreshSessionId: input.sessionId }) }
  finalizeArtifactUpload<T = unknown>(uploadId: string, sessionId: string, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/artifact-upload-intents/${encodeURIComponent(uploadId)}/finalize`, {}, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, `artifact-finalize:${uploadId}`), refreshSessionId: sessionId }) }
  getArtifactDownload<T = unknown>(uploadId: string, options: RequestOptions = {}): Promise<T> { return this.request('GET', `/api/v1/artifact-upload-intents/${encodeURIComponent(uploadId)}/download`, undefined, options) }
  publishStructuredReview<T = unknown>(pullRequestId: string, input: StructuredReviewInput, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/pull-requests/${encodeURIComponent(pullRequestId)}/reviews`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.sessionId, `review:${pullRequestId}:${input.headSha}`), refreshSessionId: input.sessionId }) }
  requestMerge<T = unknown>(pullRequestId: string, input: { sessionId: string; approvalId: string; actionPayloadHash: string; headSha: string; method: 'merge' | 'squash' | 'rebase' }, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/pull-requests/${encodeURIComponent(pullRequestId)}/merge`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.sessionId, `merge:${pullRequestId}:${input.headSha}`), refreshSessionId: input.sessionId }) }
  retryCiCheck<T = unknown>(pullRequestId: string, checkRunId: string, input: CiRetryInput, options: RequestOptions = {}): Promise<T> { return this.request('POST', `/api/v1/pull-requests/${encodeURIComponent(pullRequestId)}/checks/${encodeURIComponent(checkRunId)}/retry`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.sessionId, `ci-retry:${pullRequestId}:${checkRunId}:${input.headSha}`), refreshSessionId: input.sessionId }) }
  getProjectDelivery<T = unknown>(projectId: string, options: RequestOptions = {}): Promise<T> { return this.request('GET', `/api/v1/projects/${encodeURIComponent(projectId)}/delivery`, undefined, options) }
  draftProjectUpdate<T = unknown>(projectId: string, input: { health: 'on_track' | 'at_risk' | 'off_track'; body: string; evidenceArtifactIds?: string[] }, options: RequestOptions & { sessionId: string }): Promise<T> { return this.request('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/updates`, { ...input, status: 'draft', evidenceArtifactIds: input.evidenceArtifactIds ?? [] }, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(options.sessionId, `draft-project-update:${projectId}`), refreshSessionId: options.sessionId }) }
  publishProjectUpdate<T = unknown>(projectId: string, updateId: string, options: RequestOptions & { ifMatch: number | string }): Promise<T> { return this.request('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/updates/${encodeURIComponent(updateId)}/publish`, {}, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(updateId, 'publish-project-update') }) }
  suggestCompletion<T = unknown>(projectId: string, input: { workItemId: string; pullRequestId?: string; rationale: string; evidenceArtifactIds?: string[] }, options: RequestOptions & { sessionId: string }): Promise<T> { return this.request('POST', `/api/v1/projects/${encodeURIComponent(projectId)}/completion-suggestions`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(options.sessionId, `completion-suggestion:${input.workItemId}`), refreshSessionId: options.sessionId }) }
  decideCompletionSuggestion<T = unknown>(suggestionId: string, decision: 'accepted' | 'dismissed', options: RequestOptions & { ifMatch: number | string }): Promise<T> { return this.request('POST', `/api/v1/completion-suggestions/${encodeURIComponent(suggestionId)}/decision`, { decision }, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(suggestionId, `completion-suggestion-${decision}`) }) }

  private mutate(method: 'POST' | 'PUT', sessionId: string, operation: string, input: unknown, options: RequestOptions, revisioned = false): Promise<ApiCommand> {
    return this.request(method, `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/${operation}`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, operation), ifMatch: revisioned ? options.ifMatch : undefined, refreshSessionId: sessionId })
  }

  private mutateHandoff<T>(handoffId: string, action: 'request' | 'cancel' | 'complete' | 'reject', input: HandoffTransitionInput | HandoffRejectInput, options: RequestOptions): Promise<T> {
    return this.request('POST', `/api/v1/handoffs/${encodeURIComponent(handoffId)}/${action}`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(handoffId, `handoff-${action}`) })
  }

  private async request<T>(method: string, path: string, body?: unknown, options: RequestOptions & { authorizationToken?: string; skipTokenRefresh?: boolean; refreshSessionId?: string } = {}): Promise<T> {
    const url = new URL(path, `${this.baseUrl}/`).toString()
    resolveSdkRoutePolicy(method, new URL(url).pathname)
    const headers: Record<string, string> = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (options.authorizationToken ?? this.sessionToken) headers.authorization = `Bearer ${options.authorizationToken ?? this.sessionToken}`
    if (this.coordinationToken) headers['x-workmesh-installation-token'] = this.coordinationToken
    if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey
    if (options.correlationId) headers['x-correlation-id'] = options.correlationId
    if (options.profileVersion) headers['workmesh-client-profile'] = options.profileVersion
    if (options.ifMatch !== undefined) headers['if-match'] = typeof options.ifMatch === 'number' ? `"revision-${options.ifMatch}"` : options.ifMatch
    const serializedBody = body === undefined ? undefined : JSON.stringify(body)
    let totalRetryDelayMs = 0
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await this.requestFetch(url, { method, headers, body: serializedBody, signal: options.signal })
        if (!response.ok) {
          const payload = await readErrorPayload(response)
          if (shouldRetry(response.status)) {
            const retryAfterHeader = response.headers.get('retry-after')
            const retryAfterMs = parseRetryAfter(retryAfterHeader)
            const delayMs = retryAfterMs ?? exponentialRetryDelay(attempt, this.retry)
            const automaticRetrySuppressed =
              attempt >= this.retry.maxAttempts
                ? 'attempt_limit'
                : retryAfterMs !== undefined
                    && retryAfterMs > this.retry.maxRetryAfterMs
                  ? 'retry_after_exceeds_limit'
                  : delayMs > this.retry.maxTotalRetryDelayMs - totalRetryDelayMs
                    ? 'total_retry_delay_exceeded'
                    : undefined
            const error = toSdkError(response.status, payload, {
              retryAfterHeader: retryAfterHeader ?? undefined,
              retryAfterMs,
              automaticRetrySuppressed,
            })
            if (automaticRetrySuppressed) throw error
            totalRetryDelayMs += delayMs
            await wait(delayMs, options.signal)
            continue
          }
          throw toSdkError(response.status, payload)
        }
        if (response.status === 204) return undefined as T
        return await readJson(response) as T
      } catch (cause) {
        if (cause instanceof WorkMeshSdkError || options.signal?.aborted) throw cause
        const delayMs = exponentialRetryDelay(attempt, this.retry)
        const automaticRetrySuppressed =
          attempt >= this.retry.maxAttempts
            ? 'attempt_limit'
            : delayMs > this.retry.maxTotalRetryDelayMs - totalRetryDelayMs
              ? 'total_retry_delay_exceeded'
              : undefined
        if (automaticRetrySuppressed)
          throw new WorkMeshSdkError('Unable to reach WorkMesh API', {
            code: 'NETWORK_ERROR',
            details: redactForLog({ cause: cause instanceof Error ? cause.message : String(cause) }),
            retry: { automaticRetrySuppressed },
          })
        this.logger?.warn('WorkMesh request failed; retrying', redactForLog({ method, path, attempt, cause: cause instanceof Error ? cause.message : String(cause) }))
        totalRetryDelayMs += delayMs
        await wait(delayMs, options.signal)
      }
    }
  }
}

function shouldRetry(status: number): boolean { return status === 429 || (status >= 500 && status <= 599) }
function normalizeRetryOptions(retry: RetryOptions = {}): Required<RetryOptions> {
  const normalized = {
    maxAttempts: retry.maxAttempts ?? 3,
    baseDelayMs: retry.baseDelayMs ?? 150,
    maxDelayMs: retry.maxDelayMs ?? 2_000,
    maxRetryAfterMs: retry.maxRetryAfterMs ?? 60_000,
    maxTotalRetryDelayMs: retry.maxTotalRetryDelayMs ?? 120_000,
  }
  if (!Number.isSafeInteger(normalized.maxAttempts) || normalized.maxAttempts < 1)
    throw new WorkMeshSdkError('retry.maxAttempts must be a positive safe integer', { code: 'INVALID_RETRY_OPTIONS' })
  for (const [name, value] of Object.entries(normalized).filter(([name]) => name !== 'maxAttempts')) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new WorkMeshSdkError(`retry.${name} must be a non-negative safe integer`, { code: 'INVALID_RETRY_OPTIONS' })
  }
  return normalized
}
function parseRetryAfter(retryAfter: string | null, nowMs = Date.now()): number | undefined {
  if (retryAfter === null) return undefined
  const value = retryAfter.trim()
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    const seconds = Number(value)
    const milliseconds = seconds * 1_000
    return seconds >= 0 && Number.isSafeInteger(milliseconds) ? milliseconds : undefined
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - nowMs) : undefined
}
function exponentialRetryDelay(attempt: number, retry: Required<RetryOptions>): number {
  return Math.min(retry.baseDelayMs * 2 ** (attempt - 1), retry.maxDelayMs)
}
function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
  })
}
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { throw new WorkMeshSdkError('WorkMesh returned invalid JSON', { code: 'MALFORMED_RESPONSE', status: response.status }) }
}
async function readErrorPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { raw: text.slice(0, 2_000) } }
}
function toSdkError(status: number, payload: unknown, retry?: WorkMeshRetryMetadata): WorkMeshSdkError {
  const candidate = payload && typeof payload === 'object' && 'error' in payload ? (payload as { error?: unknown }).error : undefined
  if (candidate && typeof candidate === 'object') {
    const error = candidate as { code?: unknown; message?: unknown; correlationId?: unknown; details?: unknown }
    const message = typeof error.message === 'string' ? error.message : `WorkMesh request failed (${status})`
    const correlationId = typeof error.correlationId === 'string' ? error.correlationId : undefined
    if (
      error.code === 'CURSOR_EXPIRED'
      && error.details
      && typeof error.details === 'object'
    ) {
      const details = error.details as Record<string, unknown>
      const parsed = durableEventCursorSchema.safeParse(details.minimumCursor)
      const resync = durableEventCursorSchema.safeParse(details.resyncCursor)
      if (parsed.success && resync.success && details.resyncRequired === true)
        return new WorkMeshCursorExpiredError(message, {
          status,
          correlationId,
          details: {
            minimumCursor: parsed.data,
            resyncCursor: resync.data,
            resyncRequired: true,
          },
        })
    }
    return new WorkMeshSdkError(message, { code: typeof error.code === 'string' ? error.code : 'HTTP_ERROR', status, correlationId, details: error.details, retry })
  }
  return new WorkMeshSdkError(`WorkMesh request failed (${status})`, { code: 'HTTP_ERROR', status, details: payload, retry })
}

type SseFrame = Readonly<{ event?: string; id?: string; data?: string }>

async function *decodeSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame, void, undefined> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done }).replaceAll('\r\n', '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const frame: { event?: string; id?: string; data?: string } = {}
        const data: string[] = []
        for (const line of block.split('\n')) {
          if (!line || line.startsWith(':')) continue
          const separator = line.indexOf(':')
          const field = separator < 0 ? line : line.slice(0, separator)
          const raw = separator < 0 ? '' : line.slice(separator + 1)
          const valueText = raw.startsWith(' ') ? raw.slice(1) : raw
          if (field === 'event') frame.event = valueText
          else if (field === 'id') frame.id = valueText
          else if (field === 'data') data.push(valueText)
        }
        if (data.length) frame.data = data.join('\n')
        yield frame
        boundary = buffer.indexOf('\n\n')
      }
      if (done) return
    }
  } finally {
    reader.releaseLock()
  }
}

export interface WebhookVerificationOptions { secrets: readonly string[]; now?: Date; toleranceSeconds?: number }
export interface VerifiedWebhook { timestamp: number; secretIndex: number; payload: unknown }

/** Verifies HMAC against raw bytes. Supply old and new secrets during rotation. */
export function verifyWebhook(rawBody: string | Uint8Array, headers: Headers | Record<string, string | undefined>, options: WebhookVerificationOptions): VerifiedWebhook {
  const header = (name: string): string | undefined => headers instanceof Headers ? headers.get(name) ?? undefined : headers[name] ?? headers[name.toLowerCase()]
  const timestampText = header('WorkMesh-Timestamp')
  const signature = header('WorkMesh-Signature')
  const timestamp = timestampText ? Number(timestampText) : Number.NaN
  if (!Number.isInteger(timestamp)) throw new WorkMeshSdkError('Webhook timestamp is invalid', { code: 'WEBHOOK_TIMESTAMP_INVALID' })
  const now = Math.floor((options.now?.getTime() ?? Date.now()) / 1_000)
  if (Math.abs(now - timestamp) > (options.toleranceSeconds ?? 300)) throw new WorkMeshSdkError('Webhook timestamp is outside the replay window', { code: 'WEBHOOK_TIMESTAMP_EXPIRED' })
  if (!signature) throw new WorkMeshSdkError('Webhook signature is missing', { code: 'WEBHOOK_SIGNATURE_INVALID' })
  const supplied = signature.replace(/^v1=/, '')
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : Buffer.from(rawBody)
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`), body])
  const index = options.secrets.findIndex(secret => secureEqual(createHmac('sha256', secret).update(signedPayload).digest('hex'), supplied))
  if (index < 0) throw new WorkMeshSdkError('Webhook signature is invalid', { code: 'WEBHOOK_SIGNATURE_INVALID' })
  try { return { timestamp, secretIndex: index, payload: JSON.parse(body.toString('utf8')) } } catch { throw new WorkMeshSdkError('Webhook body is not valid JSON', { code: 'MALFORMED_RESPONSE' }) }
}
function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex'); const b = Buffer.from(right, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export type { AgentSessionState, Capability }
