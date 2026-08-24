export type DetailPriority = 'none' | 'urgent' | 'high' | 'medium' | 'low'
export type DetailStatusCategory = 'backlog' | 'planned' | 'started' | 'completed' | 'canceled'

export type WorkItemDetailDto = {
  id: string
  title: string
  description: string | null
  number: number
  revision: number
  status_id: string
  status_name: string
  status_category: DetailStatusCategory
  team_id: string
  team_key: string
  priority: DetailPriority
  due_date: string | null
  responsible_human_actor_id: string | null
  responsible_human: { actor_id: string; display_name: string } | null
  active_assignment: AgentAssignmentDto | null
  active_executor: AgentExecutionDto | null
  shared_reviewers: AgentExecutionDto[]
  labels: string[]
  project_id: string | null
  milestone_id: string | null
  parent_id: string | null
}

export type AgentAssignmentDto = {
  delegation_id: string
  agent_id: string
  agent_actor_id: string
  agent_slug: string
  agent_display_name: string
  session_id: string | null
  session_state: string | null
  assigned_at: string
}

export type AgentExecutionDto = {
  agent_id: string
  agent_actor_id: string
  agent_slug: string
  agent_display_name: string
  session_id: string
  lease_id: string
  lease_kind: 'exclusive' | 'review_shared'
  resource_type: 'work_item' | 'plan_step'
  resource_id: string
  execution_state: string
  heartbeat_health: 'healthy' | 'degraded' | 'stale'
  last_heartbeat_at: string | null
  lease_heartbeat_at: string
  lease_expires_at: string
}

export type WorkItemDetailModel = {
  id: string
  key: string
  revision: number
  title: string
  description: string
  workflowState: { id: string; name: string; category: DetailStatusCategory }
  priority: DetailPriority
  dueDate: string
  labels: string[]
  projectId: string | null
  milestoneId: string | null
  parentId: string | null
  responsibleHuman: { actorId: string; displayName: string } | null
  agentExecutions: Array<{
    sessionId: string
    agent: { id: string; actorId: string; slug: string; displayName: string }
    delegation: { leaseId: string; kind: 'exclusive' | 'review_shared'; resourceType: 'work_item' | 'plan_step'; resourceId: string }
    executionState: string
    heartbeat: { health: 'healthy' | 'degraded' | 'stale'; lastAt: string | null }
    leaseExpiresAt: string
  }>
}

export type WorkItemDetailDraft = {
  title: string
  description: string
  statusId: string
  priority: DetailPriority
  dueDate: string
  responsibleHumanActorId: string
  projectId: string
  milestoneId: string
  parentId: string
  labels: string
}

export type DetailOption = { id: string; label: string }
export type WorkItemDetailOptions = {
  statuses: DetailOption[]
  humans: DetailOption[]
  projects: DetailOption[]
  milestones: DetailOption[]
  parents: DetailOption[]
}

export type StructuredDetailError = {
  httpStatus: number
  code: string
  message: string
  details?: unknown
  correlationId?: string
  safeNextAction: string
}
