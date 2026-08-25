import type { AgentSessionState, Capability, CompleteAgentSessionInput, PlanStepInput, StatusCategory } from '@workmesh/contracts'

export * from './authorization.js'

export class DomainError extends Error { constructor(readonly code: string, message: string, readonly details?: unknown) { super(message) } }
export const defaultStates: ReadonlyArray<{ name: string; category: StatusCategory; color: string; position: number }> = [
  { name: 'Backlog', category: 'backlog', color: '#6b7280', position: 0 }, { name: 'Ready', category: 'planned', color: '#64748b', position: 1 }, { name: 'In Progress', category: 'started', color: '#3b82f6', position: 2 }, { name: 'In Review', category: 'started', color: '#8b5cf6', position: 3 }, { name: 'Done', category: 'completed', color: '#22c55e', position: 4 }, { name: 'Canceled', category: 'canceled', color: '#ef4444', position: 5 }
]
export const assertResponsibleHumanForStarted = (category: StatusCategory, responsibleHumanActorId: string | null | undefined): void => { if (category === 'started' && !responsibleHumanActorId) throw new DomainError('RESPONSIBLE_HUMAN_REQUIRED', 'A started work item requires a responsible human') }
export const assertWorkItemSelfClaimable = (input: Readonly<{
  statusCategory: StatusCategory
  responsibleHumanActorId: string | null
  principalHumanActorId: string
  hasActiveExecutorDelegation: boolean
}>): void => {
  if (input.statusCategory === 'completed' || input.statusCategory === 'canceled')
    throw new DomainError('WORK_ITEM_NOT_CLAIMABLE', 'A terminal Work Item cannot be claimed')
  if (!input.responsibleHumanActorId || input.responsibleHumanActorId !== input.principalHumanActorId)
    throw new DomainError('RESOURCE_SCOPE_DENIED', 'The Work Item responsible Human does not match the Connection principal')
  if (input.hasActiveExecutorDelegation)
    throw new DomainError('WORK_ITEM_ALREADY_ASSIGNED', 'The Work Item already has an active executor assignment')
}
export const parseRevision = (value: string | undefined): number => { const match = value?.match(/^"?revision-(\d+)"?$/); if (!match) throw new DomainError('IF_MATCH_REQUIRED', 'If-Match must be a revision ETag'); return Number(match[1]) }
export const assertRevision = (expected: number, actual: number): void => { if (expected !== actual) throw new DomainError('REVISION_CONFLICT', 'Resource has changed', { expectedRevision: expected, currentRevision: actual }) }
export const etag = (revision: number): string => `"revision-${revision}"`

export const activeAgentSessionStates = ['acknowledged', 'planning', 'executing', 'awaiting_input', 'awaiting_approval', 'blocked'] as const satisfies readonly AgentSessionState[]
export const terminalAgentSessionStates = ['completed', 'failed', 'canceled'] as const satisfies readonly AgentSessionState[]

/**
 * Every non-terminal execution Session reserves one Agent execution slot.
 * Coordination Sessions are authorization/control-plane Sessions and never
 * participate in executor admission.
 */
export const agentExecutionCapacityStates = [
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
] as const satisfies readonly AgentSessionState[]

export const countsTowardAgentExecutionCapacity = (
  sessionKind: 'execution' | 'coordination',
  state: AgentSessionState,
): boolean => sessionKind === 'execution'
  && agentExecutionCapacityStates.includes(state as typeof agentExecutionCapacityStates[number])

export const agentSessionTransitions: Readonly<Record<AgentSessionState, readonly AgentSessionState[]>> = {
  queued: ['acknowledged', 'stale', 'stopping', 'canceled'],
  acknowledged: ['planning', 'executing', 'stopping', 'failed'],
  planning: ['executing', 'awaiting_approval', 'awaiting_input', 'blocked', 'paused', 'stopping', 'failed'],
  executing: ['awaiting_input', 'awaiting_approval', 'blocked', 'paused', 'stopping', 'completed', 'failed'],
  awaiting_input: ['executing', 'paused', 'stopping', 'failed'],
  awaiting_approval: ['executing', 'canceled', 'paused', 'stopping', 'failed'],
  blocked: ['executing', 'paused', 'stopping', 'failed'],
  paused: ['executing', 'stopping', 'canceled'],
  stopping: ['canceled'],
  stale: ['acknowledged', 'canceled', 'stopping'],
  completed: [],
  failed: [],
  canceled: [],
}

export const isTerminalAgentSessionState = (state: AgentSessionState): boolean => terminalAgentSessionStates.includes(state as typeof terminalAgentSessionStates[number])

export const assertAgentSessionTransition = (currentState: AgentSessionState, requestedState: AgentSessionState): void => {
  if (!agentSessionTransitions[currentState].includes(requestedState)) {
    throw new DomainError('INVALID_SESSION_TRANSITION', `Cannot transition an agent session from ${currentState} to ${requestedState}`, { currentState, requestedState })
  }
}

/** Retry creates a distinct queued session; terminal history is never reopened. */
export const assertAgentSessionRetryAllowed = (sourceState: AgentSessionState): void => {
  if (sourceState !== 'failed' && sourceState !== 'canceled' && sourceState !== 'stale') {
    throw new DomainError('AGENT_SESSION_RETRY_NOT_ALLOWED', 'Only failed, canceled, or stale sessions may be retried', { sourceState })
  }
}

export type AgentSessionControlAction = 'pause' | 'resume' | 'stop' | 'retry' | 'handoff' | 'replan' | 'steer'

export type AgentSessionControlPolicy = Readonly<{
  action: AgentSessionControlAction
  allowed: boolean
  reasonCode: string
  targetState: AgentSessionState | null
}>

/** Shared state-policy source for Human control previews and final commands. */
export const evaluateAgentSessionControl = (
  currentState: AgentSessionState,
  action: AgentSessionControlAction,
): AgentSessionControlPolicy => {
  const targetState = action === 'pause'
    ? 'paused'
    : action === 'resume'
      ? 'executing'
      : action === 'stop'
        ? 'stopping'
        : null
  try {
    if (targetState) assertAgentSessionTransition(currentState, targetState)
    else if (action === 'retry') assertAgentSessionRetryAllowed(currentState)
    else if (isTerminalAgentSessionState(currentState) || currentState === 'stopping')
      throw new DomainError('AGENT_SESSION_CONTROL_NOT_ALLOWED', `Cannot ${action} a session in ${currentState}`, { currentState, action })
    return { action, allowed: true, reasonCode: 'control.allowed', targetState }
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    return { action, allowed: false, reasonCode: error.code.toLowerCase(), targetState }
  }
}

export const assertAgentSessionControlAllowed = (
  currentState: AgentSessionState,
  action: AgentSessionControlAction,
): void => {
  const policy = evaluateAgentSessionControl(currentState, action)
  if (policy.allowed) return
  // Final commands retain their established public error codes while sharing
  // the exact transition predicates used by the advisory preview.
  if (action === 'retry') assertAgentSessionRetryAllowed(currentState)
  if (policy.targetState) assertAgentSessionTransition(currentState, policy.targetState)
  throw new DomainError('AGENT_SESSION_CONTROL_NOT_ALLOWED', `Cannot ${action} a session in ${currentState}`, { currentState, action, reasonCode: policy.reasonCode })
}

type PlanStepLike = Pick<PlanStepInput, 'id' | 'status' | 'dependsOn' | 'ordinal' | 'cancellationReason'>
const startedPlanStepStates = new Set<PlanStepInput['status']>(['in_progress', 'blocked', 'completed'])

/** Ensures a proposed immutable plan version is a deterministic, executable DAG. */
export const validatePlanSteps = (steps: readonly PlanStepLike[], previousSteps: readonly PlanStepLike[] = []): void => {
  const seen = new Set<string>()
  const ordinalSeen = new Set<number>()
  for (const step of steps) {
    if (seen.has(step.id)) throw new DomainError('PLAN_STEP_ID_REUSED', 'A plan version cannot contain duplicate step IDs', { stepId: step.id })
    if (ordinalSeen.has(step.ordinal)) throw new DomainError('VALIDATION_ERROR', 'Plan step ordinals must be unique', { ordinal: step.ordinal })
    seen.add(step.id)
    ordinalSeen.add(step.ordinal)
    if (step.dependsOn.includes(step.id)) throw new DomainError('PLAN_STEP_DEPENDENCY_CYCLE', 'A plan step cannot depend on itself', { stepId: step.id })
    if (step.status === 'canceled' && !step.cancellationReason) throw new DomainError('VALIDATION_ERROR', 'Canceled plan steps require a cancellation reason', { stepId: step.id })
  }
  for (const step of steps) for (const dependencyId of step.dependsOn) {
    if (!seen.has(dependencyId)) throw new DomainError('PLAN_STEP_DEPENDENCY_MISSING', 'A plan step dependency is not present in this version', { stepId: step.id, dependencyId })
  }
  const byId = new Map(steps.map(step => [step.id, step]))
  const visiting = new Set<string>()
  const path: string[] = []
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visited.has(id)) return
    if (visiting.has(id)) { const from = path.indexOf(id); throw new DomainError('PLAN_STEP_DEPENDENCY_CYCLE', 'Plan steps must form an acyclic dependency graph', { stepId: id, path: [...path.slice(from), id] }) }
    visiting.add(id)
    path.push(id)
    for (const dependencyId of byId.get(id)?.dependsOn ?? []) visit(dependencyId)
    visiting.delete(id)
    path.pop()
    visited.add(id)
  }
  for (const id of byId.keys()) visit(id)

  for (const previous of previousSteps) {
    if (startedPlanStepStates.has(previous.status) && !seen.has(previous.id)) {
      throw new DomainError('PLAN_STEP_REMOVAL_INVALID', 'Started or completed plan steps must remain in later versions as completed or canceled', { stepId: previous.id, previousStatus: previous.status })
    }
  }
}

export const assertPlanStepReady = (step: PlanStepLike, steps: readonly PlanStepLike[]): void => {
  const byId = new Map(steps.map(candidate => [candidate.id, candidate]))
  const unresolvedDependencies = step.dependsOn.filter(id => byId.get(id)?.status !== 'completed')
  if (unresolvedDependencies.length > 0) throw new DomainError('PLAN_STEP_NOT_READY', 'Plan step dependencies must complete before it starts', { stepId: step.id, unresolvedDependencies })
}

/** A child can receive a tighter budget but may not silently exceed the parent. */
export const inheritChildBudget = (parent: Record<string, number>, requested: Record<string, number> = {}): Record<string, number> => {
  for (const [key, value] of Object.entries(requested)) {
    const ceiling = parent[key]
    if (ceiling !== undefined && value > ceiling) throw new DomainError('CHILD_BUDGET_EXCEEDED', 'Child budget cannot exceed its parent budget', { key, parent: ceiling, requested: value })
  }
  return { ...parent, ...requested }
}

export const reserveChildBudget = (parent: Record<string, number>, existingReservations: readonly Record<string, number>[], requested: Record<string, number>): Record<string, number> => {
  for (const [key, amount] of Object.entries(requested)) {
    const reserved = existingReservations.reduce((sum, item) => sum + (item[key] ?? 0), 0)
    if (amount < 0 || (parent[key] !== undefined && reserved + amount > parent[key])) throw new DomainError('CHILD_BUDGET_RESERVATION_EXCEEDED', 'Child reservation exceeds the remaining parent budget', { key, parent: parent[key], reserved, requested: amount })
  }
  return { ...requested }
}

export const assertChildSessionLimit = (maxChildren: number, existingChildren: number): void => {
  if (existingChildren >= maxChildren) throw new DomainError('CHILD_SESSION_LIMIT_REACHED', 'Parent session child limit has been reached', { maxChildren, existingChildren })
}

export const assertRequiredChildrenCompleted = (children: readonly { id: string; requiredForParent: boolean; state: AgentSessionState }[]): void => {
  const blockers = children.filter(child => child.requiredForParent && child.state !== 'completed').map(child => child.id).sort()
  if (blockers.length) throw new DomainError('REQUIRED_CHILDREN_INCOMPLETE', 'Required child sessions must complete first', { blockerSessionIds: blockers })
}

export const assertDecisionRelationAcyclic = (relations: readonly { decisionId: string; relatedDecisionId: string }[]): void => {
  const edges = new Map<string, string[]>()
  for (const relation of relations) edges.set(relation.decisionId, [...(edges.get(relation.decisionId) ?? []), relation.relatedDecisionId])
  const active: string[] = []; const done = new Set<string>()
  const visit = (id: string): void => { const at = active.indexOf(id); if (at >= 0) throw new DomainError('DECISION_RELATION_CYCLE', 'Decision relations must be acyclic', { path: [...active.slice(at), id] }); if (done.has(id)) return; active.push(id); for (const next of edges.get(id) ?? []) visit(next); active.pop(); done.add(id) }
  for (const id of edges.keys()) visit(id)
}

export const assertLeaseAcquirable = (active: readonly { id: string; kind: 'exclusive' | 'review_shared'; sessionId: string; expiresAt: Date | string }[], requested: 'exclusive' | 'review_shared', now: Date = new Date()): void => {
  const conflict = active.find(lease => new Date(lease.expiresAt).getTime() > now.getTime() && (lease.kind === 'exclusive' || requested === 'exclusive'))
  if (conflict) throw new DomainError('LEASE_CONFLICT', 'Resource is already leased', { leaseId: conflict.id, holderSessionId: conflict.sessionId, expiresAt: conflict.expiresAt })
}

export interface RoutingCandidate { id: string; slug: string; skills: readonly string[]; activeSessions: number; capabilities: readonly Capability[] }
/** Deterministic, auditable routing order; callers already filtered access. */
export const selectRoutingCandidate = (candidates: readonly RoutingCandidate[], input: { exactAgentId?: string; skill?: string; requiredCapabilities: readonly Capability[] }): RoutingCandidate | undefined => candidates
  .filter(candidate => input.requiredCapabilities.every(capability => candidate.capabilities.includes(capability)))
  .sort((left, right) => {
    const exact = Number(right.id === input.exactAgentId) - Number(left.id === input.exactAgentId)
    if (exact) return exact
    const skill = Number(Boolean(input.skill && right.skills.includes(input.skill))) - Number(Boolean(input.skill && left.skills.includes(input.skill)))
    if (skill) return skill
    return left.activeSessions - right.activeSessions || left.slug.localeCompare(right.slug)
  })[0]

export const assertCompletionEvidence = (completion: Pick<CompleteAgentSessionInput, 'artifactIds' | 'checks' | 'noArtifactReason'>): void => {
  const hasEvidence = completion.artifactIds.length > 0 || completion.checks.length > 0
  if (!hasEvidence && !completion.noArtifactReason) {
    throw new DomainError('COMPLETION_EVIDENCE_REQUIRED', 'Completion requires evidence or an explicit no-artifact reason')
  }
}

export interface ApprovalUse {
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed' | 'canceled'
  expiresAt: Date | string
  actionPayloadHash: string
  consumedAt?: Date | string | null
}

/** Validate approval again immediately before an irreversible external action. */
export const assertApprovalUsable = (approval: ApprovalUse, actionPayloadHash: string, now: Date = new Date()): void => {
  if (approval.status === 'consumed' || approval.consumedAt) throw new DomainError('APPROVAL_ALREADY_CONSUMED', 'Approval has already been consumed')
  if (approval.status !== 'approved') throw new DomainError('APPROVAL_NOT_APPROVED', 'Approval is not approved', { status: approval.status })
  if (new Date(approval.expiresAt).getTime() <= now.getTime()) throw new DomainError('APPROVAL_EXPIRED', 'Approval has expired')
  if (approval.actionPayloadHash !== actionPayloadHash) throw new DomainError('APPROVAL_PAYLOAD_MISMATCH', 'Approval does not authorize this action payload')
}

export interface PlanPublicationApproval extends ApprovalUse {
  id: string
  sessionId: string
}

export const assertPlanPublicationApproval = (
  session: { id: string; state: AgentSessionState },
  approvalId: string | undefined,
  actionPayloadHash: string | undefined,
  approval: PlanPublicationApproval | undefined,
  now: Date = new Date(),
): void => {
  const approvalRequired = session.state === 'awaiting_approval'
  if (!approvalId || !actionPayloadHash || !approval) {
    if (approvalRequired) throw new DomainError('APPROVAL_REQUIRED', 'Publishing a plan while awaiting approval requires an approval and payload hash')
    return
  }
  if (approval.id !== approvalId || approval.sessionId !== session.id) throw new DomainError('APPROVAL_SESSION_MISMATCH', 'Approval does not belong to this session')
  assertApprovalUsable(approval, actionPayloadHash, now)
}

export const approvalStatusAfterDecision = (requiredApprovals: number, approvedCount: number, rejectedCount: number): 'pending' | 'approved' | 'rejected' => {
  if (rejectedCount > 0) return 'rejected'
  return approvedCount >= requiredApprovals ? 'approved' : 'pending'
}

export interface AgentMutationGate {
  actorId?: string
  actorKind?: 'agent' | 'human' | 'service'
  session: { id: string; actorId: string; delegationId: string; state: AgentSessionState; revision: number; stopCleanupAcknowledged?: boolean }
  targetSessionId: string
  delegation: { id: string; active: boolean }
  capability: Capability
  grantedCapabilities: readonly Capability[]
  resourceInScope: boolean
  approval?: { required: boolean; approved: boolean; payloadMatches?: boolean; expired?: boolean; consumed?: boolean }
  lease?: { required: boolean; held: boolean }
  expectedRevision?: number
  idempotencyKey?: string
  operation: 'ack' | 'heartbeat' | 'prompt' | 'activity' | 'plan' | 'artifact' | 'complete' | 'fail' | 'stop_ack' | 'room_message' | 'decision' | 'inbox_claim' | 'inbox_ack' | 'inbox_reply'
}

/**
 * Common server-side command gate. Repositories supply already-loaded facts;
 * this pure function deliberately contains no HTTP, database, or token logic.
 */
export const authorizeAgentMutation = (gate: AgentMutationGate): void => {
  if (!gate.actorId || gate.actorKind !== 'agent') throw new DomainError('AGENT_IDENTITY_REQUIRED', 'An authenticated agent identity is required')
  if (gate.session.id !== gate.targetSessionId || gate.session.actorId !== gate.actorId) throw new DomainError('AGENT_SESSION_TOKEN_MISMATCH', 'Agent identity is not authorized for this session')
  if (!gate.delegation.active || gate.delegation.id !== gate.session.delegationId) throw new DomainError('DELEGATION_NOT_ACTIVE', 'The session delegation is not active')
  if (!gate.grantedCapabilities.includes(gate.capability)) throw new DomainError('CAPABILITY_DENIED', 'The delegation does not grant the required capability', { capability: gate.capability })
  if (!gate.resourceInScope) throw new DomainError('RESOURCE_SCOPE_DENIED', 'The target resource is outside the delegated scope')
  if (!gate.idempotencyKey) throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', 'Agent mutations require an idempotency key')
  if (gate.expectedRevision !== undefined) assertRevision(gate.expectedRevision, gate.session.revision)
  if (gate.lease?.required && !gate.lease.held) throw new DomainError('LEASE_REQUIRED', 'This mutation requires a held lease')
  if (gate.approval?.required) {
    if (gate.approval.expired) throw new DomainError('APPROVAL_EXPIRED', 'Required approval has expired')
    if (gate.approval.consumed) throw new DomainError('APPROVAL_ALREADY_CONSUMED', 'Required approval has already been consumed')
    if (!gate.approval.approved) throw new DomainError('APPROVAL_REQUIRED', 'This mutation requires an approved request')
    if (gate.approval.payloadMatches === false) throw new DomainError('APPROVAL_PAYLOAD_MISMATCH', 'Approval payload does not match this mutation')
  }
  // A heartbeat is diagnostic after Stop/stale/terminal. It still requires the
  // exact live identity, delegation, capability, and scope above, but it never
  // restores workflow state or ordinary mutation authority.
  if (gate.operation === 'heartbeat') return
  if (gate.session.state === 'stopping') {
    if (gate.operation !== 'stop_ack') throw new DomainError('SESSION_STOPPED', 'Stopped sessions cannot perform ordinary writes')
    if (gate.session.stopCleanupAcknowledged) throw new DomainError('STOP_ACK_ALREADY_RECORDED', 'A stop cleanup acknowledgement was already recorded')
    return
  }
  if (isTerminalAgentSessionState(gate.session.state)) throw new DomainError('SESSION_STOPPED', 'Terminal sessions cannot perform ordinary writes', { state: gate.session.state })
  if (gate.operation === 'stop_ack') throw new DomainError('SESSION_NOT_ACTIVE', 'A stop cleanup acknowledgement is allowed only while stopping')
  if (gate.operation === 'ack' && gate.session.state !== 'queued' && gate.session.state !== 'stale') throw new DomainError('SESSION_NOT_ACTIVE', 'Only queued or stale sessions can be acknowledged', { state: gate.session.state })
  if (gate.operation !== 'ack' && !activeAgentSessionStates.includes(gate.session.state as typeof activeAgentSessionStates[number])) {
    throw new DomainError('SESSION_NOT_ACTIVE', 'Session state does not allow this ordinary write', { state: gate.session.state, operation: gate.operation })
  }
}

export const assertAgentMutationAllowed = authorizeAgentMutation

// Stage 3 delivery policy. Provider identifiers remain opaque strings so the
// domain layer is not coupled to GitHub numeric IDs or REST payloads.
export type NormalizedCheckStatus = 'queued' | 'running' | 'passed' | 'failed' | 'skipped'
export type MergeApprovalPayload = {
  provider: string
  connectionId: string
  repositoryId: string
  pullRequestId: string
  headSha: string
  method: 'merge' | 'squash' | 'rebase'
}
export type StructuredFinding = {
  severity: 'blocking' | 'high' | 'medium' | 'low'
  file: string
  line: number
  summary: string
  evidence: string
  recommendation: string
}

const stableJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableJson(item)]),
  )
}

export function canonicalMergeApprovalPayload(input: MergeApprovalPayload): string {
  return canonicalActionApprovalPayload(input)
}

export function canonicalActionApprovalPayload(input: unknown): string {
  return JSON.stringify(stableJson(input))
}

export function normalizeProviderCheck(status: string, conclusion?: string | null): NormalizedCheckStatus {
  if (status === 'queued' || status === 'pending' || status === 'requested') return 'queued'
  if (status === 'in_progress' || status === 'running') return 'running'
  if (conclusion === 'success') return 'passed'
  if (conclusion === 'skipped' || conclusion === 'neutral') return 'skipped'
  return 'failed'
}

export function assertMergeReady(input: {
  approvalHeadSha: string
  currentHeadSha: string
  producerActorId: string
  reviews: readonly {
    reviewerActorId: string
    headSha: string
    verdict: 'approved' | 'changes_requested' | 'commented'
  }[]
  findings: readonly StructuredFinding[]
  checks: readonly { name: string; status: NormalizedCheckStatus; required: boolean; headSha: string }[]
}): void {
  if (input.approvalHeadSha !== input.currentHeadSha ||
      input.reviews.some(review => review.headSha !== input.currentHeadSha))
    throw new DomainError('MERGE_HEAD_CHANGED', 'Approval and every considered review must bind the current pull-request head')
  if (input.reviews.some(review => review.verdict === 'changes_requested'))
    throw new DomainError('MERGE_REVIEW_BLOCKED', 'A current-head review requests changes')
  const approvals = input.reviews.filter(review => review.verdict === 'approved')
  if (approvals.length === 0)
    throw new DomainError('MERGE_REVIEW_BLOCKED', 'An independent current-head approval is required')
  if (approvals.some(review => review.reviewerActorId === input.producerActorId))
    throw new DomainError('REVIEWER_CONFLICT', 'A producer cannot approve their own change')
  if (input.findings.some((finding) => finding.severity === 'blocking' || finding.severity === 'high'))
    throw new DomainError('MERGE_REVIEW_BLOCKED', 'Blocking or High review findings remain')
  const required = input.checks.filter((check) => check.required)
  if (required.some((check) => check.headSha !== input.currentHeadSha || check.status !== 'passed'))
    throw new DomainError('MERGE_CHECKS_BLOCKED', 'All required checks must pass on the current head')
}

export function applicableAgentsPaths(changedPath: string): string[] {
  const segments = changedPath.replaceAll('\\', '/').split('/').filter(Boolean)
  const paths = ['AGENTS.md']
  for (let index = 1; index < segments.length; index += 1)
    paths.push(`${segments.slice(0, index).join('/')}/AGENTS.md`)
  return paths
}

export function assertAcyclicProjectDependencies(edges: readonly { projectId: string; dependsOnProjectId: string }[]): void {
  const graph = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.projectId === edge.dependsOnProjectId)
      throw new DomainError('PROJECT_DEPENDENCY_CYCLE', 'A project cannot depend on itself')
    graph.set(edge.projectId, [...(graph.get(edge.projectId) ?? []), edge.dependsOnProjectId])
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (node: string): void => {
    if (visiting.has(node)) throw new DomainError('PROJECT_DEPENDENCY_CYCLE', 'Project dependencies must be acyclic')
    if (visited.has(node)) return
    visiting.add(node)
    for (const next of graph.get(node) ?? []) visit(next)
    visiting.delete(node)
    visited.add(node)
  }
  for (const node of graph.keys()) visit(node)
}

export function milestoneProgress(items: readonly { statusCategory: string }[]): { completed: number; total: number; percent: number } {
  const total = items.length
  const completed = items.filter((item) => item.statusCategory === 'completed').length
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) }
}

export type WorkItemRelationKind = 'blocks' | 'related'

export function canonicalWorkItemRelation(
  sourceWorkItemId: string,
  targetWorkItemId: string,
  kind: WorkItemRelationKind,
): Readonly<{ sourceWorkItemId: string; targetWorkItemId: string; kind: WorkItemRelationKind }> {
  if (sourceWorkItemId === targetWorkItemId)
    throw new DomainError('WORK_ITEM_RELATION_SELF', 'A Work Item cannot relate to itself')
  if (kind === 'related' && sourceWorkItemId > targetWorkItemId)
    return { sourceWorkItemId: targetWorkItemId, targetWorkItemId: sourceWorkItemId, kind }
  return { sourceWorkItemId, targetWorkItemId, kind }
}

export function assertWorkItemParent(
  item: Readonly<{ id: string; projectId: string | null }>,
  parent: Readonly<{ id: string; projectId: string | null; ancestorIds: readonly string[] }>,
): void {
  if (item.id === parent.id)
    throw new DomainError('WORK_ITEM_PARENT_SELF', 'A Work Item cannot be its own parent')
  if (item.projectId !== parent.projectId)
    throw new DomainError('WORK_ITEM_PARENT_PROJECT_MISMATCH', 'Parent and child must belong to the same Project')
  if (parent.ancestorIds.includes(item.id))
    throw new DomainError('WORK_ITEM_PARENT_CYCLE', 'Work Item hierarchy must be acyclic')
}

export * from './stage4.js'
