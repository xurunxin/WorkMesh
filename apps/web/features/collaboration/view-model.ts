import type { CollaborationState, NotificationFact } from './contracts'

const priorityRank: Record<NotificationFact['priority'], number> = {
  approval: 0, input: 1, agent_failure: 2, handoff: 3, mention: 4, update: 5,
}

export function notificationHealth(notification: NotificationFact): 'delivered' | 'pending' | 'failed' | 'unavailable' {
  if (notification.deliveries.some(delivery => delivery.status === 'failed' || delivery.status === 'dead')) return 'failed'
  if (notification.deliveries.some(delivery => delivery.status === 'pending' || delivery.status === 'claimed')) return 'pending'
  if (notification.deliveries.some(delivery => delivery.status === 'delivered')) return 'delivered'
  return 'unavailable'
}

export function sortNotifications(items: NotificationFact[]): NotificationFact[] {
  return items.slice().sort((left, right) =>
    priorityRank[left.priority] - priorityRank[right.priority]
    || right.created_at.localeCompare(left.created_at)
    || right.id.localeCompare(left.id))
}

export function collaborationState(input: { loading: boolean; error?: { status?: number; code?: string } | null; count: number; reconnecting?: boolean }): CollaborationState {
  if (input.reconnecting) return 'reconnecting'
  if (input.loading) return 'loading'
  if (input.error?.code === 'SSE_RECONNECTING') return 'reconnecting'
  if (input.error?.code === 'APPROVAL_EXPIRED') return 'expired'
  if (input.error?.status === 403 || input.error?.code === 'FORBIDDEN') return 'forbidden'
  if (input.error?.status === 409 || input.error?.code === 'REVISION_CONFLICT') return 'conflict'
  if (input.error) return 'error'
  return input.count === 0 ? 'empty' : 'ready'
}
