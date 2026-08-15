'use client'

import { ApiError, apiRequest } from '../../app/lib/api'
import { type MoveCommandRequest, type MoveCommandResult, type WorkItemDto, type WorkItemMoveCommandAdapter, type WorkItemMoveIntent } from './contracts'

export type MoveRequestInit = { path: string; init: RequestInit; operation: MoveCommandRequest }
export type MoveNetworkRecovery = { clearActionError: () => void; refreshCanonicalCollection: () => Promise<void> }
export type MoveCommandCallbacks = {
  applyOptimistic?: (intent: WorkItemMoveIntent) => void
  rollback?: (intent: WorkItemMoveIntent) => void
  onForbidden?: (intent: WorkItemMoveIntent) => void
  onConflict?: (intent: MoveCommandRequest, reason: ApiError) => void
  onOffline?: (intent: MoveCommandRequest, reason: unknown) => void
}

const identity = (intent: WorkItemMoveIntent): string => [intent.workItemId, intent.targetStatusId, intent.currentRevision, intent.responsibleHumanActorId ?? ''].join(':')

export function createStableMoveOperationId(intent: WorkItemMoveIntent): string {
  // UUIDs are generated once per exact intent and retained by the adapter for replay.
  return `work-item-move:${intent.workItemId}:${intent.currentRevision}:${intent.targetStatusId}:${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
}

export function buildMoveRequest(intent: WorkItemMoveIntent, stableOperationId = createStableMoveOperationId(intent)): MoveRequestInit {
  const operation: MoveCommandRequest = { ...intent, stableOperationId }
  return {
    operation,
    path: `/api/v1/work-items/${encodeURIComponent(intent.workItemId)}`,
    init: {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': stableOperationId,
        'If-Match': `"revision-${intent.currentRevision}"`,
      },
      body: JSON.stringify({ statusId: intent.targetStatusId, responsibleHumanActorId: intent.responsibleHumanActorId }),
    },
  }
}

/**
 * Leave replay eligibility inside the command adapter, but retire the stale
 * presentation error before asking the canonical collection to converge.
 * A failed refresh supplies its own current collection error.
 */
export async function recoverMoveNetworkFailure({ clearActionError, refreshCanonicalCollection }: MoveNetworkRecovery): Promise<void> {
  clearActionError()
  await refreshCanonicalCollection()
}

type Requester = <T>(path: string, init: RequestInit) => Promise<T>
type AdapterOptions = MoveCommandCallbacks & { request?: Requester; onSuccess?: (result: MoveCommandResult) => void | Promise<void> }

/**
 * Single mutation seam for pointer, keyboard and explicit selector moves.
 * Optimism is presentation-only; the server response remains authoritative.
 */
export function createWorkItemMoveCommandAdapter(options: AdapterOptions = {}): WorkItemMoveCommandAdapter {
  const request = options.request ?? apiRequest
  const operations = new Map<string, { operation: MoveCommandRequest; identity: string; replayEligible: boolean }>()
  const move = async (intent: WorkItemMoveIntent): Promise<MoveCommandResult> => {
    const key = identity(intent)
    const current = operations.get(intent.workItemId)
    const operation = current?.identity === key ? current.operation : buildMoveRequest(intent).operation
    operations.set(intent.workItemId, { identity: key, operation, replayEligible: false })
    options.applyOptimistic?.(intent)
    try {
      const response = await request<WorkItemDto>(`/api/v1/work-items/${encodeURIComponent(intent.workItemId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': operation.stableOperationId,
          'If-Match': `"revision-${intent.currentRevision}"`,
        },
        body: JSON.stringify({ statusId: intent.targetStatusId, responsibleHumanActorId: intent.responsibleHumanActorId }),
      })
      const result = { item: response, intent: operation }
      operations.delete(intent.workItemId)
      await options.onSuccess?.(result)
      return result
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 403) {
        options.rollback?.(intent)
        options.onForbidden?.(intent)
        operations.delete(intent.workItemId)
      } else if (reason instanceof ApiError && reason.status === 409) {
        options.rollback?.(intent)
        options.onConflict?.(operation, reason)
        // Keep the operation only as conflict context; never blind-retry it.
      } else {
        options.rollback?.(intent)
        options.onOffline?.(operation, reason)
        const saved = operations.get(intent.workItemId)
        if (saved) saved.replayEligible = true
      }
      throw reason
    }
  }
  const replay = async (intent: WorkItemMoveIntent): Promise<MoveCommandResult> => {
    const saved = operations.get(intent.workItemId)
    if (!saved || !saved.replayEligible || saved.identity !== identity(intent)) throw new Error('Move replay requires the exact eligible network intent.')
    return move(intent)
  }
  return { move, replay, cancel: workItemId => operations.delete(workItemId) }
}
