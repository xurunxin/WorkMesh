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

export type NotificationGroup = Readonly<{
  key: string
  notification: NotificationFact
  count: number
  ids: string[]
}>

const highValueKind = /(fail|error|conflict|decision|approval|evidence|artifact|delivery|transition|blocked|recovery|handoff)/i

export function groupNotifications(items: NotificationFact[]): NotificationGroup[] {
  const groups: NotificationGroup[] = []
  const groupable = new Map<string, number>()
  for (const notification of sortNotifications(items)) {
    const health = notificationHealth(notification)
    const canGroup = notification.priority === 'update'
      && health !== 'failed'
      && !highValueKind.test(notification.kind)
    const key = [notification.kind, notification.source_type, notification.source_id, notification.title, notification.body, health].join('\u0000')
    const index = canGroup ? groupable.get(key) : undefined
    if (index === undefined) {
      const next = groups.push({ key: `${key}\u0000${notification.id}`, notification, count: 1, ids: [notification.id] }) - 1
      if (canGroup) groupable.set(key, next)
      continue
    }
    const current = groups[index]!
    groups[index] = { ...current, count: current.count + 1, ids: [...current.ids, notification.id] }
  }
  return groups
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
