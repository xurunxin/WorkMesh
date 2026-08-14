import { ApiError, apiMutation, json } from '../../../app/lib/api'
import type { StructuredDetailError, WorkItemDetailDraft, WorkItemDetailDto } from './contracts'

const nullable = (value: string): string | null => value || null

export async function updateWorkItemDetail(input: {
  workItemId: string
  revision: number
  draft: WorkItemDetailDraft
}): Promise<WorkItemDetailDto> {
  return apiMutation(`work-item-detail:${input.workItemId}`, `/api/v1/work-items/${input.workItemId}`, {
    method: 'PATCH',
    headers: { ...json({}), 'If-Match': `"revision-${input.revision}"` },
    body: JSON.stringify({
      title: input.draft.title,
      description: nullable(input.draft.description),
      statusId: input.draft.statusId,
      priority: input.draft.priority,
      dueDate: nullable(input.draft.dueDate),
      responsibleHumanActorId: nullable(input.draft.responsibleHumanActorId),
      projectId: nullable(input.draft.projectId),
      milestoneId: nullable(input.draft.milestoneId),
      parentId: nullable(input.draft.parentId),
      labels: input.draft.labels.split(',').map(label => label.trim()).filter(Boolean),
    }),
  })
}

export function detailError(reason: unknown): StructuredDetailError {
  if (reason instanceof ApiError) return {
    httpStatus: reason.status,
    code: reason.code ?? 'REQUEST_FAILED',
    message: reason.message,
    details: reason.details,
    correlationId: reason.correlationId,
    safeNextAction: reason.safeNextAction ?? (reason.status === 409 ? 'Review the latest server version before retrying.' : 'Retry after the reported cause is resolved.'),
  }
  return { httpStatus: 0, code: 'NETWORK_UNAVAILABLE', message: reason instanceof Error ? reason.message : 'The network request failed.', safeNextAction: 'Reconnect, then reload the latest authorized state.' }
}
