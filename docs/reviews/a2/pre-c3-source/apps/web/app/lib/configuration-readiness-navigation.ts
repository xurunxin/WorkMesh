import { configurationReadinessQuerySchema, type ConfigurationReadinessQuery } from '@workmesh/contracts'
import { projectWorkspaceHref } from './project-work'

export type ReadinessKind = 'repository' | 'model' | 'agent'
export function readinessContext(search: string, teamId: string | null, conversation?: {
  team_id: string | null; project_id: string | null; work_item_id: string | null
} | null): ConfigurationReadinessQuery | null {
  const params = new URLSearchParams(search)
  for (const key of ['workKind', 'teamId', 'projectId', 'workItemId']) if (params.getAll(key).length > 1) return null
  if (conversation && (!conversation.team_id || ['teamId', 'projectId', 'workItemId'].some(key => {
    const actual = key === 'teamId' ? conversation.team_id : key === 'projectId' ? conversation.project_id : conversation.work_item_id
    return params.has(key) && params.get(key) !== actual
  }))) return null
  const result = configurationReadinessQuerySchema.safeParse({
    teamId: conversation?.team_id ?? (params.has('teamId') ? params.get('teamId') : teamId),
    workKind: params.get('workKind'),
    ...(conversation ? { ...(conversation.project_id ? { projectId: conversation.project_id } : {}), ...(conversation.work_item_id ? { workItemId: conversation.work_item_id } : {}) }
      : { ...(params.has('projectId') ? { projectId: params.get('projectId') } : {}), ...(params.has('workItemId') ? { workItemId: params.get('workItemId') } : {}) }),
  })
  return result.success ? result.data : null
}
export function readinessHref(kind: ReadinessKind, context: ConfigurationReadinessQuery): string {
  if (kind === 'model') return '/settings/agent-workbench'
  if (kind === 'agent') return '/agents'
  const params = new URLSearchParams({ teamId: context.teamId })
  if (context.workItemId) params.set('repositoryWorkItem', context.workItemId)
  return `${projectWorkspaceHref({ filterSearch: params.toString(), projectId: context.projectId })}#project-repository-configuration`
}
export function saveReadinessReturn(kind: ReadinessKind, conversationId: string | null): void {
  window.history.replaceState({ ...window.history.state, a2Return: { focusId: `readiness-${kind}`, conversationId } }, '')
}
export function restoreReadinessFocus(): void {
  const saved = window.history.state?.a2Return as { focusId?: string } | undefined
  if (!saved?.focusId) return
  const target = document.getElementById(saved.focusId) ?? document.getElementById('readiness-title')
  target?.focus({ preventScroll: true })
}
