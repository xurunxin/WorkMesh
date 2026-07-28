'use client'

import { ApiError, apiListRequest, apiRequest, json, type ListResponse } from './api'

export type AgentState = 'queued' | 'acknowledged' | 'planning' | 'executing' | 'awaiting_input' | 'awaiting_approval' | 'blocked' | 'paused' | 'stopping' | 'stale' | 'completed' | 'failed' | 'canceled'

export type Agent = {
  id: string; workspace_id: string; actor_id: string; name?: string; display_name?: string; slug: string; description: string | null; provider?: string; version?: string
  manifest?: { provider?: string; version?: string; heartbeatIntervalSeconds?: number }; supported_protocols: string[]; skills: string[]; requested_capabilities: string[]; approved_capabilities: string[]
  max_concurrency: number; heartbeat_interval_seconds?: number; is_active: boolean; revision: number; team_access?: AgentTeamAccess[]
}

export type AgentTeamAccess = {
  agent_id: string; team_id: string; approved_capabilities: string[]; status: 'active' | 'revoked'
  approved_by_actor_id: string; revision: number; created_at: string; updated_at: string; revoked_at: string | null
}

export type AgentSession = {
  id: string; agent_id: string; agent_actor_id: string; delegation_id: string; work_item_id: string | null; state: AgentState
  state_reason: string | null; revision: number; current_plan_version_id: string | null; budget: Budget; last_heartbeat_at: string | null
  retry_of_session_id?: string | null; stop_requested_at: string | null; error_code: string | null; error_summary: string | null; created_at: string; updated_at: string
}

export type Budget = { maxRuntimeSeconds?: number; maxInputTokens?: number; maxOutputTokens?: number; maxCostUsd?: number }
export type Delegation = { id: string; revision: number; agent_id: string; status: string }
export type PlanStep = { id: string; title: string; description?: string; status: string; ordinal: number; dependsOn: string[]; acceptanceCriteria: string[]; expectedArtifacts: string[] }
export type PlanVersion = { id: string; revision: number; parent_version_id: string | null; change_summary: string; created_at: string; steps: PlanStep[] }
export type AgentActivity = { id: string; kind: string; summary: string; detailsMarkdown?: string; artifactIds: string[]; ephemeral: boolean; created_at: string; toolInvocation?: { toolName: string; status: string; resultSummary?: string } }
export type Artifact = { id: string; session_id: string; work_item_id?: string | null; type: string; title: string; uri?: string; source_tool?: string; created_at: string }
export type Approval = { id: string; session_id: string; approval_type: string; action_name: string; risk_level: string; rationale_summary: string; status: string; revision: number; expires_at: string; created_at: string }

export const agentStateLabel = (state: AgentState): string => state.replaceAll('_', ' ')
export const agentStateClass = (state: AgentState): string => `agent-state state-${state}`
export const formatTime = (value: string | null | undefined): string => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not reported'
export const agentName = (agent: Agent | undefined): string => agent?.name ?? agent?.display_name ?? agent?.slug ?? 'Agent'
export const agentProvider = (agent: Agent): string => agent.provider ?? agent.manifest?.provider ?? 'Unknown provider'
export const agentVersion = (agent: Agent): string => agent.version ?? agent.manifest?.version ?? ''
export const agentHeartbeat = (agent: Agent): number => agent.heartbeat_interval_seconds ?? agent.manifest?.heartbeatIntervalSeconds ?? 30
export const canPauseAgentSession = (state: AgentState): boolean => ['planning', 'executing', 'awaiting_input', 'awaiting_approval', 'blocked'].includes(state)
export const canRetryAgentSession = (state: AgentState): boolean => ['failed', 'canceled', 'stale'].includes(state)
export const canStopAgentSession = (state: AgentState): boolean => !['stopping', 'completed', 'failed', 'canceled'].includes(state)
export const canManageAgentTeamAccess = (workspaceRole: string | undefined): boolean => workspaceRole === 'admin'
export const activeAgentTeamAccess = (agent: Agent, teamId: string): AgentTeamAccess | undefined => agent.team_access?.find(access => access.team_id === teamId && access.status === 'active' && access.revoked_at === null)
export const approvedAgentCapabilitiesForTeam = (agent: Agent, teamId: string): string[] => {
  const teamAccess = activeAgentTeamAccess(agent, teamId)
  if (!teamAccess) return []
  return agent.approved_capabilities.filter(capability => teamAccess.approved_capabilities.includes(capability))
}

const idempotencyStoragePrefix = 'workmesh.idempotency.'
const inFlightOperationKeys = new Map<string, string>()

function operationIdempotencyKey(operation: string): string {
  const cached = inFlightOperationKeys.get(operation) ?? sessionStorage.getItem(`${idempotencyStoragePrefix}${operation}`)
  if (cached) {
    inFlightOperationKeys.set(operation, cached)
    return cached
  }
  const created = crypto.randomUUID()
  inFlightOperationKeys.set(operation, created)
  sessionStorage.setItem(`${idempotencyStoragePrefix}${operation}`, created)
  return created
}

function clearOperationIdempotencyKey(operation: string): void {
  inFlightOperationKeys.delete(operation)
  sessionStorage.removeItem(`${idempotencyStoragePrefix}${operation}`)
}

function preservesOperationIdempotencyKey(reason: unknown): boolean {
  return !(reason instanceof ApiError) || reason.status === 408 || reason.status === 425 || reason.status === 429 || reason.status >= 500
}

async function idempotentAgentMutation<T>(operation: string, request: (idempotencyKey: string) => Promise<T>): Promise<T> {
  const idempotencyKey = operationIdempotencyKey(operation)
  try {
    const result = await request(idempotencyKey)
    clearOperationIdempotencyKey(operation)
    return result
  } catch (reason) {
    if (!preservesOperationIdempotencyKey(reason)) clearOperationIdempotencyKey(operation)
    throw reason
  }
}

export const normalizePlan = (value: Record<string, unknown>): PlanVersion => ({
  id: String(value.id), revision: Number(value.revision), parent_version_id: value.parent_version_id as string | null, change_summary: String(value.change_summary ?? ''), created_at: String(value.created_at),
  steps: Array.isArray(value.steps) ? value.steps.map(step => { const item = step as Record<string, unknown>; return { id: String(item.id), title: String(item.title), description: item.description as string | undefined, status: String(item.status), ordinal: Number(item.ordinal), dependsOn: (item.dependsOn ?? item.depends_on ?? []) as string[], acceptanceCriteria: (item.acceptanceCriteria ?? item.acceptance_criteria ?? []) as string[], expectedArtifacts: (item.expectedArtifacts ?? item.expected_artifacts ?? []) as string[] } }) : [],
})
export const normalizeActivity = (value: Record<string, unknown>): AgentActivity => ({ id: String(value.id), kind: String(value.kind), summary: String(value.summary), detailsMarkdown: (value.detailsMarkdown ?? value.details_markdown) as string | undefined, artifactIds: (value.artifactIds ?? value.artifact_ids ?? []) as string[], ephemeral: Boolean(value.ephemeral), created_at: String(value.created_at), toolInvocation: (value.toolInvocation ?? value.tool_invocation) as AgentActivity['toolInvocation'] })
export const normalizeArtifact = (value: Record<string, unknown>): Artifact => ({ id: String(value.id), session_id: String(value.session_id ?? value.sessionId), work_item_id: (value.work_item_id ?? value.workItemId) as string | null | undefined, type: String(value.type), title: String(value.title), uri: value.uri as string | undefined, source_tool: (value.source_tool ?? value.sourceTool) as string | undefined, created_at: String(value.created_at) })
export const normalizeApproval = (value: Record<string, unknown>): Approval => ({ id: String(value.id), session_id: String(value.session_id ?? value.sessionId), approval_type: String(value.approval_type ?? value.approvalType), action_name: String(value.action_name ?? value.actionName), risk_level: String(value.risk_level ?? value.riskLevel), rationale_summary: String(value.rationale_summary ?? value.rationaleSummary), status: String(value.status), revision: Number(value.revision), expires_at: String(value.expires_at ?? value.expiresAt), created_at: String(value.created_at) })

/** Stage 1 read routes are optional while an installation is being upgraded from Stage 0. */
export async function optionalAgentRequest<T>(path: string): Promise<T | null> {
  try { return await apiRequest<T>(path) } catch (reason) { if (reason instanceof ApiError && reason.status === 404) return null; throw reason }
}

export async function optionalAgentListRequest<T>(path: string, init?: RequestInit): Promise<ListResponse<T> | null> {
  try { return await apiListRequest<T>(path, init) } catch (reason) { if (reason instanceof ApiError && reason.status === 404) return null; throw reason }
}

export async function grantAgentTeamAccess(agentId: string, teamId: string, approvedCapabilities: string[]): Promise<AgentTeamAccess> {
  return apiRequest<AgentTeamAccess>(`/api/v1/agents/${agentId}/team-access/${teamId}`, {
    method: 'PUT',
    headers: json({}),
    body: JSON.stringify({ approvedCapabilities }),
  })
}

export async function revokeAgentTeamAccess(agentId: string, teamId: string): Promise<AgentTeamAccess> {
  return apiRequest<AgentTeamAccess>(`/api/v1/agents/${agentId}/team-access/${teamId}`, { method: 'DELETE' })
}

export async function delegateAndStart(input: { workItemId: string; workItemTeamId: string; workItemRevision: number; agent: Agent; humanActorId: string; prompt: string; budget: Budget }): Promise<AgentSession> {
  const approvedCapabilities = approvedAgentCapabilitiesForTeam(input.agent, input.workItemTeamId)
  if (approvedCapabilities.length === 0) throw new Error('This agent has no capabilities approved for the work item team.')
  const result = await idempotentAgentMutation(`delegate-start:${input.workItemId}`, idempotencyKey => {
    return apiRequest<{ delegation: Delegation; session: AgentSession }>(`/api/v1/work-items/${input.workItemId}/agent-session`, {
      method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${input.workItemRevision}"`, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        agentId: input.agent.id,
        principalHumanActorId: input.humanActorId,
        role: 'executor',
        requestedCapabilities: approvedCapabilities,
        initialPrompt: input.prompt,
        budget: input.budget,
      }),
    })
  })
  return result.session
}

export async function retryAgentSession(session: AgentSession): Promise<AgentSession> {
  return idempotentAgentMutation(`retry:${session.id}`, idempotencyKey => {
    return apiRequest<AgentSession>(`/api/v1/agent-sessions/${session.id}/retry`, {
      method: 'POST',
      headers: { ...json({}), 'If-Match': `"revision-${session.revision}"`, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ reason: 'Human requested a retry from WorkMesh.', reuseContext: true }),
    })
  })
}
