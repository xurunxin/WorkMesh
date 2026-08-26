import type { RecoveryCondition } from '@workmesh/contracts'

export type RecoveryRoute = {
  lifecycle: 'active' | 'resolved'
  condition?: RecoveryCondition
  severity?: 'medium' | 'high' | 'critical'
  projectId?: string
  selectedId?: string
}

const conditions = new Set<RecoveryCondition>([
  'missing_first_heartbeat', 'heartbeat_timeout', 'session_stale',
  'session_failed', 'session_canceled', 'session_blocked',
  'assignment_without_active_executor', 'lease_lost', 'approval_expired',
  'validation_attempts_exhausted', 'completion_evidence_missing',
  'budget_exhausted',
])

export function readRecoveryRoute(search: string): RecoveryRoute {
  const params = new URLSearchParams(search)
  const lifecycle = params.get('recoveryLifecycle') === 'resolved' ? 'resolved' : 'active'
  const rawCondition = params.get('recoveryCondition')
  const rawSeverity = params.get('recoverySeverity')
  return {
    lifecycle,
    ...(rawCondition && conditions.has(rawCondition as RecoveryCondition) ? { condition: rawCondition as RecoveryCondition } : {}),
    ...(rawSeverity === 'medium' || rawSeverity === 'high' || rawSeverity === 'critical' ? { severity: rawSeverity } : {}),
    ...(params.get('project') ? { projectId: params.get('project')! } : {}),
    ...(params.get('recoveryItem') ? { selectedId: params.get('recoveryItem')! } : {}),
  }
}

export function recoveryHref(current: string, route: RecoveryRoute): string {
  const url = new URL(current, 'http://workmesh.local')
  url.searchParams.set('view', 'recovery')
  url.searchParams.set('recoveryLifecycle', route.lifecycle)
  const set = (key: string, value?: string) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key)
  set('recoveryCondition', route.condition)
  set('recoverySeverity', route.severity)
  set('project', route.projectId)
  set('recoveryItem', route.selectedId)
  return `${url.pathname}${url.search}${url.hash}`
}
