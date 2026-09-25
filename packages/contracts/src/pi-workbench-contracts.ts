import { z } from 'zod'

// WM-WEBPI-20260924 W01 — frozen contract shapes for the Pi agent workbench.
// Covers conversations, turns, runner attempts (single-writer fencing,
// queue/idempotency/stop semantics), user-configured LLM connections and
// models, and the runner tool-invocation ledger. DTOs and events are frozen
// before implementation (plan W01); DDL and REST wiring land in later tasks.
// Schema primitives are intentionally local so this module never imports
// index.ts (same pattern as agent-response.ts); keep values identical.

const idSchema = z.string().uuid()
const timestampSchema = z.string().datetime({ offset: true })
const revisionSchema = z.number().int().positive()
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
// Mirror of index.ts agentSessionStopModeSchema; stop is a server-enforced
// state-machine command, not a frontend flag.
export const workbenchStopModeSchema = z.enum(['graceful', 'immediate'])

// ---------------------------------------------------------------------------
// Usage (minimal; does not duplicate the existing usage ledger — LLM token
// usage recorded per attempt/invocation only).
// ---------------------------------------------------------------------------

export const workbenchUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative(),
}).strict()

// ---------------------------------------------------------------------------
// Conversation / context pin
// ---------------------------------------------------------------------------

export const conversationStatusSchema = z.enum(['active', 'archived'])
export const conversationContextPinKindSchema = z.enum(['guidance', 'document', 'work_item'])

export const conversationContextPinSchema = z.object({
  kind: conversationContextPinKindSchema,
  refId: idSchema,
  // Pinned revision; null pins the live head and re-resolves on each turn.
  revision: revisionSchema.nullable(),
}).strict()

export const conversationContextPinResponseSchema = conversationContextPinSchema.extend({
  resolvedRevision: revisionSchema.nullable(),
  pinnedByActorId: idSchema,
  pinnedAt: timestampSchema,
})

export const conversationResponseSchema = z.object({
  id: idSchema,
  workspace_id: idSchema,
  team_id: idSchema.nullable(),
  project_id: idSchema.nullable(),
  work_item_id: idSchema.nullable(),
  // A conversation always keeps a responsible human; agents act only through
  // the delegation backing the bound agent session — a conversation never
  // implicitly gains team-wide write authority.
  responsible_human_actor_id: idSchema,
  title: z.string().min(1).max(180),
  status: conversationStatusSchema,
  agent_session_id: idSchema.nullable(),
  default_llm_connection_id: idSchema.nullable(),
  default_llm_model_id: idSchema.nullable(),
  context_pins: z.array(conversationContextPinResponseSchema).max(20),
  revision: revisionSchema,
  created_by_actor_id: idSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  archived_at: timestampSchema.nullable(),
}).strict()

export const conversationCreateInputSchema = z.object({
  teamId: idSchema.nullable().optional(),
  projectId: idSchema.nullable().optional(),
  workItemId: idSchema.nullable().optional(),
  agentSessionId: idSchema.optional(),
  title: z.string().min(1).max(180),
  llmConnectionId: idSchema.optional(),
  llmModelId: idSchema.optional(),
  contextPins: z.array(conversationContextPinSchema).max(20).default([]),
}).strict()

// ---------------------------------------------------------------------------
// Messages (append-only public record; no hidden chain-of-thought)
// ---------------------------------------------------------------------------

export const conversationMessageRoleSchema = z.enum(['user', 'assistant', 'system'])

export const conversationMessageResponseSchema = z.object({
  id: idSchema,
  conversation_id: idSchema,
  turn_id: idSchema.nullable(),
  sequence: z.number().int().positive(),
  role: conversationMessageRoleSchema,
  author_actor_id: idSchema.nullable(),
  // Public operational summary only; hidden model chain-of-thought is never
  // persisted or transported.
  content_markdown: z.string().min(1).max(50_000),
  runner_attempt_id: idSchema.nullable(),
  created_at: timestampSchema,
}).strict()

// ---------------------------------------------------------------------------
// Turns (queue + idempotency + stop semantics)
// ---------------------------------------------------------------------------

export const turnStatusSchema = z.enum(['queued', 'dispatching', 'running', 'settled', 'failed', 'canceled', 'stopped'])
export const terminalTurnStatusSchema = z.enum(['settled', 'failed', 'canceled', 'stopped'])
export const turnStopReasonSchema = z.enum(['user_stop', 'authority_revoked', 'budget_exhausted', 'server_policy', 'upstream_error'])

export const turnResponseSchema = z.object({
  id: idSchema,
  conversation_id: idSchema,
  sequence: z.number().int().positive(),
  status: turnStatusSchema,
  initiated_by_actor_id: idSchema,
  agent_session_id: idSchema.nullable(),
  current_runner_attempt_id: idSchema.nullable(),
  stop_reason: turnStopReasonSchema.nullable(),
  error_code: z.string().min(1).max(120).nullable(),
  retry_of_turn_id: idSchema.nullable(),
  queued_at: timestampSchema,
  dispatch_requested_at: timestampSchema.nullable(),
  started_at: timestampSchema.nullable(),
  settled_at: timestampSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
}).strict().superRefine((turn, context) => {
  const nonQueued = turn.status !== 'queued'
  if (nonQueued && !turn.dispatch_requested_at) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'dispatch_requested_at is required once the turn leaves the queue', path: ['dispatch_requested_at'] })
  }
  if (turn.status === 'queued' && (turn.started_at || turn.settled_at)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'a queued turn cannot have started or settled timestamps', path: ['status'] })
  }
  const terminal = terminalTurnStatusSchema.options.includes(turn.status as typeof terminalTurnStatusSchema.options[number])
  if (terminal && !turn.settled_at) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'terminal turns require settled_at', path: ['settled_at'] })
  }
  if (!terminal && turn.settled_at) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'settled_at is reserved for terminal turns', path: ['settled_at'] })
  }
  if (turn.status !== 'stopped' && turn.stop_reason === 'authority_revoked') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'authority_revoked applies only to stopped turns', path: ['stop_reason'] })
  }
})

// Transport requires the standard Idempotency-Key header (server dedupes per
// conversation); the body intentionally carries no idempotency field.
export const conversationTurnCreateInputSchema = z.object({
  messageMarkdown: z.string().min(1).max(50_000),
  llmConnectionId: idSchema.optional(),
  llmModelId: idSchema.optional(),
}).strict()

// Steering adds context to a running turn without cancelling its attempt; the runner
// consumes the message on its next status poll. Follow-up and retry both create a new
// turn so the terminal fact stays immutable.
export const conversationTurnSteerInputSchema = z.object({
  messageMarkdown: z.string().min(1).max(50_000),
}).strict()

export const conversationTurnFollowupInputSchema = z.object({
  messageMarkdown: z.string().min(1).max(50_000),
  // Set when this turn re-runs a terminal turn's request (same conversation, new fact).
  retryOfTurnId: idSchema.optional(),
  llmConnectionId: idSchema.optional(),
  llmModelId: idSchema.optional(),
}).strict()

// Context-pin edits replace the whole pin list; the server re-validates every pin's
// scope and resolved revision, so the client cannot smuggle an out-of-scope reference.
export const conversationContextPinsUpdateInputSchema = z.object({
  pins: z.array(conversationContextPinSchema).max(50),
}).strict()

export const conversationTurnStopInputSchema = z.object({
  reason: z.string().min(1).max(2_000),
  stopMode: workbenchStopModeSchema.default('graceful'),
}).strict()

// ---------------------------------------------------------------------------
// Runner attempts (single writer / fencing / recovery protocol)
// ---------------------------------------------------------------------------

export const runnerAttemptStatusSchema = z.enum(['preparing', 'running', 'settling', 'settled', 'aborted', 'failed', 'superseded'])
export const runnerAttemptRuntimeSchema = z.enum(['pi_runner'])

export const runnerAttemptResponseSchema = z.object({
  id: idSchema,
  turn_id: idSchema,
  conversation_id: idSchema,
  agent_session_id: idSchema,
  attempt_no: z.number().int().positive(),
  // Server-minted writer token: only the attempt presenting the current fence
  // may write turn/session state; stale writers receive RUNNER_FENCE_STALE.
  fence_token: z.string().min(16).max(128),
  status: runnerAttemptStatusSchema,
  runtime: runnerAttemptRuntimeSchema,
  llm_connection_id: idSchema.nullable(),
  llm_model_id: idSchema.nullable(),
  supersedes_attempt_id: idSchema.nullable(),
  // Recovery invariant: a superseding attempt must reconcile unknown external
  // effects of its predecessor before replaying any external call.
  external_effects_reconciled: z.boolean(),
  usage: workbenchUsageSchema.nullable(),
  stop_reason: turnStopReasonSchema.nullable(),
  error_code: z.string().min(1).max(120).nullable(),
  started_at: timestampSchema.nullable(),
  settled_at: timestampSchema.nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
}).strict().superRefine((attempt, context) => {
  if ((attempt.attempt_no > 1) !== Boolean(attempt.supersedes_attempt_id)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'attempt_no > 1 must reference the superseded attempt and vice versa', path: ['supersedes_attempt_id'] })
  }
  const terminal = ['settled', 'aborted', 'failed', 'superseded'].includes(attempt.status)
  if (terminal && !attempt.settled_at) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'terminal attempts require settled_at', path: ['settled_at'] })
  }
  if (!terminal && attempt.settled_at) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'settled_at is reserved for terminal attempts', path: ['settled_at'] })
  }
})

// Coordinator → runner dispatch contract (frozen for W10 implementation).
export const runnerAttemptCreateInputSchema = z.object({
  turnId: idSchema,
  llmConnectionId: idSchema.nullable().optional(),
  llmModelId: idSchema.nullable().optional(),
}).strict()

// Completion requires a result summary plus evidence, or an explicit
// no-artifact explanation (mirrors completeAgentSessionInputSchema).
export const runnerAttemptSettleInputSchema = z.object({
  outcome: z.enum(['settled', 'aborted', 'failed']),
  summaryMarkdown: z.string().min(1).max(20_000),
  artifactIds: z.array(idSchema).max(100).default([]),
  noArtifactReason: z.string().min(1).max(2_000).optional(),
  usage: workbenchUsageSchema.optional(),
  errorCode: z.string().min(1).max(120).optional(),
  externalEffectsReconciled: z.boolean().default(false),
}).strict().refine(
  value => value.outcome !== 'settled' || value.artifactIds.length > 0 || Boolean(value.noArtifactReason),
  { message: 'Completion requires evidence or noArtifactReason', path: ['noArtifactReason'] },
)

// Runner-only wire payload. Never store or expose this response through the
// Human workbench, event stream, generic idempotency ledger, or activity log.
export const workbenchRunnerCredentialSchema = z.object({
  runnerAttemptId: idSchema,
  fenceToken: z.string().min(16).max(128),
  baseUrl: z.string().url(),
  apiType: z.enum(['openai-completions', 'openai-responses']),
  apiKey: z.string().min(1),
  modelId: z.string().min(1).max(200),
  modelName: z.string().min(1).max(200),
  capabilities: z.unknown(),
  connectionRevision: revisionSchema,
  modelRevision: revisionSchema,
  messages: z.array(z.object({ role: conversationMessageRoleSchema,
    content_markdown: z.string().min(1).max(50_000) }).strict()).max(100),
}).strict()

export const workbenchSessionCompletionRequestSchema = z.object({
  ifMatch: revisionSchema,
  operationKey: z.string().regex(/^pi-[a-f0-9]{64}$/),
  body: z.object({
    summary: z.string().min(1).max(20_000),
    artifactIds: z.array(idSchema).max(100).default([]),
    checks: z.array(z.object({ name: z.string().min(1).max(160),
      command: z.string().max(10_000).optional(),
      status: z.enum(['passed', 'failed', 'skipped']),
      summary: z.string().min(1).max(10_000) })).max(100).default([]),
    limitations: z.array(z.string().min(1).max(2_000)).max(100).default([]),
    noArtifactReason: z.string().min(1).max(2_000).optional(),
  }).strict().refine(value => value.artifactIds.length > 0 || value.checks.length > 0
    || Boolean(value.noArtifactReason), { message: 'Completion requires evidence or noArtifactReason' }),
}).strict()

// Per-tool settlement detail. Sanitization mirrors the tool-activity contract: the
// runner sends a bounded summary of the sanitized input shape, never raw arguments.
export const workbenchToolInvocationSummarySchema = z.object({
  toolName: z.string().min(1).max(160),
  callCount: z.number().int().min(1).max(10_000),
  sanitizedInputSummary: z.string().min(1).max(2_000),
}).strict()

export const workbenchRunnerSettleInputSchema = z.object({
  fenceToken: z.string().min(16).max(128),
  assistantMessageMarkdown: z.string().min(1).max(50_000).optional(),
  settlement: runnerAttemptSettleInputSchema,
  sessionCompletion: workbenchSessionCompletionRequestSchema.optional(),
  toolInvocations: z.array(workbenchToolInvocationSummarySchema).max(200).optional(),
}).strict().refine(value => value.settlement.outcome !== 'settled' || Boolean(value.assistantMessageMarkdown),
  { path: ['assistantMessageMarkdown'], message: 'Settled turns require a public assistant response' })
  .refine(value => !value.sessionCompletion || value.settlement.outcome === 'settled',
    { path: ['sessionCompletion'], message: 'Session completion requires a settled public Turn' })

// ---------------------------------------------------------------------------
// LLM connections / models / secrets (Decision 5 + 6 of ADR 0065)
// ---------------------------------------------------------------------------

export const llmApiTypeSchema = z.enum(['openai-completions', 'openai-responses'])
export const llmConnectionScopeSchema = z.enum(['personal', 'team', 'workspace'])
export const llmConnectionStatusSchema = z.enum(['active', 'disabled', 'revoked'])
export const llmSecretStatusSchema = z.enum(['configured', 'missing'])

export const llmConnectionResponseSchema = z.object({
  id: idSchema,
  workspace_id: idSchema,
  scope: llmConnectionScopeSchema,
  // team id for team scope; owner actor id for personal; null for workspace.
  scope_id: idSchema.nullable(),
  name: z.string().min(1).max(120),
  api_type: llmApiTypeSchema,
  base_url: z.string().url().max(2_048),
  status: llmConnectionStatusSchema,
  // Only the status is exposed — never the secret material nor its ref.
  secret_status: llmSecretStatusSchema,
  can_manage: z.boolean(),
  created_by_actor_id: idSchema,
  revision: revisionSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  revoked_at: timestampSchema.nullable(),
}).strict()

export const llmModelCapabilitiesSchema = z.object({
  inputModalities: z.array(z.enum(['text', 'image'])).min(1).max(4),
  toolCalling: z.boolean(),
  reasoning: z.boolean(),
  contextWindowTokens: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
}).strict()

export const llmModelResponseSchema = z.object({
  id: idSchema,
  connection_id: idSchema,
  external_model_id: z.string().min(1).max(200),
  display_name: z.string().min(1).max(200),
  enabled: z.boolean(),
  capabilities: llmModelCapabilitiesSchema,
  revision: revisionSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
}).strict()

export const llmConnectionDetailResponseSchema = llmConnectionResponseSchema.extend({
  models: z.array(llmModelResponseSchema),
}).strict()

export const llmConnectionCreateInputSchema = z.object({
  scope: llmConnectionScopeSchema,
  teamId: idSchema.optional(),
  name: z.string().min(1).max(120),
  apiType: llmApiTypeSchema,
  baseUrl: z.string().url().max(2_048),
  // Write-only transport field; persisted server-side as an opaque secretRef
  // and never returned, logged, or included in events.
  secretMaterial: z.string().min(1).max(4_096),
}).strict().superRefine((input, context) => {
  if (input.scope === 'team' && !input.teamId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'teamId is required for team scope', path: ['teamId'] })
  }
  if (input.scope !== 'team' && input.teamId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'teamId is only valid for team scope', path: ['teamId'] })
  }
})

export const llmConnectionUpdateInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  apiType: llmApiTypeSchema.optional(),
  baseUrl: z.string().url().max(2_048).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  secretMaterial: z.string().min(1).max(4_096).optional(),
}).strict()

export const llmModelUpsertInputSchema = z.object({
  externalModelId: z.string().min(1).max(200),
  displayName: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  capabilities: llmModelCapabilitiesSchema,
}).strict()

// ---------------------------------------------------------------------------
// Tool invocation ledger (runner-scoped; separate from agent activity)
// ---------------------------------------------------------------------------

export const workbenchToolInvocationStatusSchema = z.enum(['started', 'succeeded', 'failed', 'canceled'])

export const workbenchToolInvocationResponseSchema = z.object({
  id: idSchema,
  runner_attempt_id: idSchema,
  turn_id: idSchema,
  conversation_id: idSchema,
  sequence: z.number().int().positive(),
  tool_name: z.string().min(1).max(160),
  status: workbenchToolInvocationStatusSchema,
  input_sanitized: z.record(z.unknown()).default({}),
  result_summary: z.string().max(10_000).nullable(),
  usage: workbenchUsageSchema.nullable(),
  // Digest of the unsanitized input for audit without storing the raw value.
  input_digest: sha256Schema.nullable(),
  started_at: timestampSchema,
  finished_at: timestampSchema.nullable(),
}).strict()

// ---------------------------------------------------------------------------
// Events (past-tense naming; payloads are strict camelCase)
// ---------------------------------------------------------------------------

export const workbenchEventTypeSchema = z.enum([
  'workbench.conversation.created',
  'workbench.conversation.archived',
  'workbench.message.appended',
  'workbench.turn.queued',
  'workbench.turn.dispatched',
  'workbench.turn.settled',
  'workbench.runner_attempt.started',
  'workbench.runner_attempt.settled',
  'workbench.runner_attempt.superseded',
  'workbench.llm_connection.created',
  'workbench.llm_connection.updated',
  'workbench.llm_connection.revoked',
  'workbench.llm_model.created',
  'workbench.llm_model.updated',
])

// Events never carry secret material or fence tokens.
export const workbenchConversationCreatedEventPayloadSchema = z.object({
  conversationId: idSchema,
  responsibleHumanActorId: idSchema,
  workItemId: idSchema.nullable(),
  agentSessionId: idSchema.nullable(),
}).strict()

export const workbenchConversationArchivedEventPayloadSchema = z.object({
  conversationId: idSchema,
  revision: revisionSchema,
}).strict()

export const workbenchMessageAppendedEventPayloadSchema = z.object({
  conversationId: idSchema,
  messageId: idSchema,
  turnId: idSchema.nullable(),
  role: conversationMessageRoleSchema,
  sequence: z.number().int().positive(),
}).strict()

export const workbenchTurnQueuedEventPayloadSchema = z.object({
  conversationId: idSchema,
  turnId: idSchema,
  initiatedByActorId: idSchema,
}).strict()

export const workbenchTurnDispatchedEventPayloadSchema = z.object({
  conversationId: idSchema,
  turnId: idSchema,
  runnerAttemptId: idSchema,
  attemptNo: z.number().int().positive(),
}).strict()

export const workbenchTurnSettledEventPayloadSchema = z.object({
  conversationId: idSchema,
  turnId: idSchema,
  runnerAttemptId: idSchema.nullable(),
  outcome: terminalTurnStatusSchema,
  stopReason: turnStopReasonSchema.nullable(),
  errorCode: z.string().min(1).max(120).nullable(),
}).strict()

export const workbenchRunnerAttemptStartedEventPayloadSchema = z.object({
  conversationId: idSchema,
  turnId: idSchema,
  runnerAttemptId: idSchema,
  attemptNo: z.number().int().positive(),
}).strict()

export const workbenchRunnerAttemptSettledEventPayloadSchema = z.object({
  conversationId: idSchema,
  turnId: idSchema,
  runnerAttemptId: idSchema,
  attemptNo: z.number().int().positive(),
  outcome: z.enum(['settled', 'aborted', 'failed']),
  usage: workbenchUsageSchema.nullable(),
}).strict()

export const workbenchRunnerAttemptSupersededEventPayloadSchema = z.object({
  conversationId: idSchema,
  turnId: idSchema,
  runnerAttemptId: idSchema,
  attemptNo: z.number().int().positive(),
  supersededByAttemptId: idSchema,
}).strict()

export const workbenchLlmConnectionCreatedEventPayloadSchema = z.object({
  llmConnectionId: idSchema,
  scope: llmConnectionScopeSchema,
  apiType: llmApiTypeSchema,
}).strict()

export const workbenchLlmConnectionUpdatedEventPayloadSchema = z.object({
  llmConnectionId: idSchema,
  revision: revisionSchema,
}).strict()

export const workbenchLlmConnectionRevokedEventPayloadSchema = z.object({
  llmConnectionId: idSchema,
  reason: z.string().min(1).max(2_000),
}).strict()

// ---------------------------------------------------------------------------
// Frozen minimal relation model (reviewable manifest; DDL lands in a later
// numbered migration, never in this task).
// ---------------------------------------------------------------------------

export type WorkbenchTableKind = 'state' | 'append_only_ledger'
export type WorkbenchTableSpec = {
  name: string
  kind: WorkbenchTableKind
  references: readonly string[]
  invariants: readonly string[]
}

export const workbenchRelationModel = Object.freeze([
  {
    name: 'conversations',
    kind: 'state',
    references: ['agent_sessions.id (nullable, currently bound session)'],
    invariants: [
      'responsible_human_actor_id is non-null; write authority flows only through the bound agent session delegation',
      'archived conversations reject new turns (CONVERSATION_ARCHIVED)',
      'context pins reference guidance/document/work_item at a pinned revision',
    ],
  },
  {
    name: 'conversation_messages',
    kind: 'append_only_ledger',
    references: ['conversations.id', 'conversation_turns.id (nullable)'],
    invariants: ['public operational summaries only; hidden chain-of-thought is never persisted'],
  },
  {
    name: 'conversation_turns',
    kind: 'state',
    references: ['conversations.id', 'agent_sessions.id (nullable)', 'runner_attempts.id (current attempt, nullable)'],
    invariants: [
      'turn creation is idempotent via the transport Idempotency-Key; dispatch happens only after the transaction commits (outbox)',
      'queue depth is bounded (CONVERSATION_TURN_QUEUE_LIMIT_EXCEEDED)',
      'terminal turn rows are immutable; retry creates a new turn',
    ],
  },
  {
    name: 'runner_attempts',
    kind: 'state',
    references: ['conversation_turns.id', 'agent_sessions.id', 'llm_connections.id (nullable)', 'llm_models.id (nullable)'],
    invariants: [
      'single writer: at most one non-terminal attempt per turn; fence_token arbitrates writers (RUNNER_FENCE_STALE)',
      'attempt_no increases monotonically per turn; attempt_no > 1 requires supersedes_attempt_id',
      'a superseding attempt reconciles unknown external effects before replaying them (external_effects_reconciled)',
      'Pi model context is rebuildable execution data and never a business authority for recovery',
    ],
  },
  {
    name: 'llm_connections',
    kind: 'state',
    references: [],
    invariants: [
      'secret material is stored only as a server-resolved secretRef outside DTOs, events, and logs',
      'base_url is subject to the admin egress allow-policy (LLM_CONNECTION_EGRESS_BLOCKED)',
      'api_type is explicit and never silently switched between completions and responses',
    ],
  },
  {
    name: 'llm_models',
    kind: 'state',
    references: ['llm_connections.id'],
    invariants: ['capabilities and limits are validated per model revision'],
  },
  {
    name: 'workbench_tool_invocations',
    kind: 'append_only_ledger',
    references: ['runner_attempts.id', 'conversation_turns.id', 'conversations.id'],
    invariants: [
      'sanitized inputs only; raw input is reducible to input_digest for audit',
      'per-invocation LLM usage is recorded here and not duplicated into the existing usage ledger',
    ],
  },
] as const satisfies readonly WorkbenchTableSpec[])
