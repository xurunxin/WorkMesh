import type { AgentExecutionDto, WorkItemDetailDraft, WorkItemDetailDto, WorkItemDetailModel } from './contracts'

const execution = (value: AgentExecutionDto): WorkItemDetailModel['agentExecutions'][number] => ({
  sessionId: value.session_id,
  agent: { id: value.agent_id, actorId: value.agent_actor_id, slug: value.agent_slug, displayName: value.agent_display_name },
  delegation: { leaseId: value.lease_id, kind: value.lease_kind, resourceType: value.resource_type, resourceId: value.resource_id },
  executionState: value.execution_state,
  heartbeat: { health: value.heartbeat_health, lastAt: value.last_heartbeat_at },
  leaseExpiresAt: value.lease_expires_at,
})

export function toWorkItemDetailModel(item: WorkItemDetailDto): WorkItemDetailModel {
  return {
    id: item.id,
    key: `${item.team_key}-${item.number}`,
    revision: item.revision,
    title: item.title,
    description: item.description ?? '',
    workflowState: { id: item.status_id, name: item.status_name, category: item.status_category },
    priority: item.priority,
    dueDate: item.due_date?.slice(0, 10) ?? '',
    labels: [...item.labels],
    projectId: item.project_id,
    milestoneId: item.milestone_id,
    parentId: item.parent_id,
    responsibleHuman: item.responsible_human ? { actorId: item.responsible_human.actor_id, displayName: item.responsible_human.display_name } : null,
    agentExecutions: [item.active_executor, ...(item.shared_reviewers ?? [])].filter((value): value is AgentExecutionDto => value !== null).map(execution),
  }
}

export function detailDraft(model: WorkItemDetailModel): WorkItemDetailDraft {
  return {
    title: model.title,
    description: model.description,
    statusId: model.workflowState.id,
    priority: model.priority,
    dueDate: model.dueDate,
    responsibleHumanActorId: model.responsibleHuman?.actorId ?? '',
    projectId: model.projectId ?? '',
    milestoneId: model.milestoneId ?? '',
    parentId: model.parentId ?? '',
    labels: model.labels.join(', '),
  }
}

export const sameDetailDraft = (left: WorkItemDetailDraft, right: WorkItemDetailDraft): boolean =>
  JSON.stringify(left) === JSON.stringify(right)
