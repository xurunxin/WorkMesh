import type { AgentSessionState, Capability, CompleteAgentSessionInput, PlanStepInput, StatusCategory } from '@workmesh/contracts'

export class DomainError extends Error { constructor(readonly code: string, message: string, readonly details?: unknown) { super(message) } }
export const defaultStates: ReadonlyArray<{ name: string; category: StatusCategory; color: string; position: number }> = [
  { name: 'Backlog', category: 'backlog', color: '#6b7280', position: 0 }, { name: 'Ready', category: 'planned', color: '#64748b', position: 1 }, { name: 'In Progress', category: 'started', color: '#3b82f6', position: 2 }, { name: 'In Review', category: 'started', color: '#8b5cf6', position: 3 }, { name: 'Done', category: 'completed', color: '#22c55e', position: 4 }, { name: 'Canceled', category: 'canceled', color: '#ef4444', position: 5 }
]
export const assertResponsibleHumanForStarted = (category: StatusCategory, responsibleHumanActorId: string | null | undefined): void => { if (category === 'started' && !responsibleHumanActorId) throw new DomainError('RESPONSIBLE_HUMAN_REQUIRED', 'A started work item requires a responsible human') }
export const parseRevision = (value: string | undefined): number => { const match = value?.match(/^"?revision-(\d+)"?$/); if (!match) throw new DomainError('IF_MATCH_REQUIRED', 'If-Match must be a revision ETag'); return Number(match[1]) }
export const assertRevision = (expected: number, actual: number): void => { if (expected !== actual) throw new DomainError('REVISION_CONFLICT', 'Resource has changed', { expectedRevision: expected, currentRevision: actual }) }
export const etag = (revision: number): string => `"revision-${revision}"`

export const activeAgentSessionStates = ['acknowledged', 'planning', 'executing', 'awaiting_input', 'awaiting_approval', 'blocked'] as const satisfies readonly AgentSessionState[]
export const terminalAgentSessionStates = ['completed', 'failed', 'canceled'] as const satisfies readonly AgentSessionState[]

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
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new DomainError('PLAN_STEP_DEPENDENCY_CYCLE', 'Plan steps must form an acyclic dependency graph', { stepId: id })
    visiting.add(id)
    for (const dependencyId of byId.get(id)?.dependsOn ?? []) visit(dependencyId)
    visiting.delete(id)
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
  operation: 'ack' | 'heartbeat' | 'prompt' | 'activity' | 'plan' | 'artifact' | 'complete' | 'fail' | 'stop_ack'
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
  if (gate.session.state === 'stopping') {
    if (gate.operation !== 'stop_ack') throw new DomainError('SESSION_STOPPED', 'Stopped sessions cannot perform ordinary writes')
    if (gate.session.stopCleanupAcknowledged) throw new DomainError('STOP_ACK_ALREADY_RECORDED', 'A stop cleanup acknowledgement was already recorded')
    return
  }
  if (isTerminalAgentSessionState(gate.session.state)) throw new DomainError('SESSION_STOPPED', 'Terminal sessions cannot perform ordinary writes', { state: gate.session.state })
  if (gate.operation === 'stop_ack') throw new DomainError('SESSION_NOT_ACTIVE', 'A stop cleanup acknowledgement is allowed only while stopping')
  if (gate.operation === 'ack' && gate.session.state !== 'queued' && gate.session.state !== 'stale') throw new DomainError('SESSION_NOT_ACTIVE', 'Only queued or stale sessions can be acknowledged', { state: gate.session.state })
  if (gate.operation !== 'ack' && gate.operation !== 'heartbeat' && !activeAgentSessionStates.includes(gate.session.state as typeof activeAgentSessionStates[number])) {
    throw new DomainError('SESSION_NOT_ACTIVE', 'Session state does not allow this ordinary write', { state: gate.session.state, operation: gate.operation })
  }
}

export const assertAgentMutationAllowed = authorizeAgentMutation
