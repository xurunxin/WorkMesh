import type {
  RealtimeInvalidation,
  RealtimeResource,
} from './realtime.js'

export type AgentRegistryRefreshTarget =
  | 'agents'
  | 'teams'
  | 'sessions'
  | 'approvals'
  | 'attention'
export type AgentWorkRefreshTarget = 'agents' | 'sessions'
export type WorkRoomRefreshTarget = 'timeline' | 'comments'
export type HomeRefreshTarget =
  | 'teams'
  | 'states'
  | 'humans'
  | 'projects'
  | 'views'
  | 'items'
const attentionAggregateTypes = new Set([
  'decision',
  'approval',
  'inbox_item',
  'completion_suggestion',
])

export const agentRegistryRefreshTargets = (
  invalidation: RealtimeInvalidation,
): ReadonlySet<AgentRegistryRefreshTarget> => {
  if (invalidation.reason === 'resync')
    return new Set(['agents', 'teams', 'sessions', 'approvals', 'attention'])
  const invalidates = new Set(
    invalidation.event.invalidates.map(resource => resource.type),
  )
  const targets = new Set<AgentRegistryRefreshTarget>()
  if (invalidates.has('team')) {
    targets.add('agents'); targets.add('teams')
  }
  if (invalidates.has('session')) {
    targets.add('sessions'); targets.add('approvals')
  }
  if (
    invalidates.has('workspace')
    && invalidation.event.aggregate_type === 'agent'
  )
    targets.add('agents')
  if (attentionAggregateTypes.has(invalidation.event.aggregate_type))
    targets.add('attention')
  return targets
}

export const agentWorkRefreshTargets = (
  invalidation: RealtimeInvalidation,
  resources: Readonly<{
    teamId: string
    workItemId: string
    sessionIds: ReadonlySet<string>
  }>,
): ReadonlySet<AgentWorkRefreshTarget> => {
  if (invalidation.reason === 'resync')
    return new Set(['agents', 'sessions'])
  const invalidates = new Set(
    invalidation.event.invalidates.map(resource => resource.type),
  )
  const invalidatesExact = (type: RealtimeResource['type'], id: string) =>
    invalidation.event.invalidates.some(resource =>
      resource.type === type && resource.id === id)
  const targets = new Set<AgentWorkRefreshTarget>()
  if (invalidatesExact('team', resources.teamId)) targets.add('agents')
  if (
    invalidates.has('workspace')
    && invalidation.event.aggregate_type === 'agent'
  )
    targets.add('agents')
  if (
    invalidatesExact('work_item', resources.workItemId)
    || (
      invalidates.has('session')
      && invalidation.event.invalidates.some(resource =>
        resource.type === 'session' && resources.sessionIds.has(resource.id))
    )
  )
    targets.add('sessions')
  return targets
}

export const workRoomRefreshTargets = (
  invalidation: RealtimeInvalidation,
  workItemId: string,
): ReadonlySet<WorkRoomRefreshTarget> => {
  if (invalidation.reason === 'resync')
    return new Set(['timeline', 'comments'])
  if (invalidation.event.invalidates.some(resource =>
    resource.type === 'work_item' && resource.id === workItemId))
    return new Set(['timeline', 'comments'])
  return new Set()
}

export const homeRefreshTargets = (
  invalidation: RealtimeInvalidation,
  resources: Readonly<{
    teamId?: string
    projectId?: string
    workItemId?: string
  }>,
): ReadonlySet<HomeRefreshTarget> => {
  if (invalidation.reason === 'resync')
    return new Set(['teams', 'states', 'humans', 'projects', 'views', 'items'])
  const invalidates = new Set(
    invalidation.event.invalidates.map(resource => resource.type),
  )
  const references = (type: RealtimeResource['type'], id?: string) =>
    Boolean(id) && [
      ...invalidation.event.scopes,
      ...invalidation.event.invalidates,
    ].some(resource => resource.type === type && resource.id === id)
  const targets = new Set<HomeRefreshTarget>()
  if (invalidates.has('team')) {
    targets.add('teams')
    if (references('team', resources.teamId))
      for (const target of [
        'states', 'humans', 'projects', 'views', 'items',
      ] as const)
        targets.add(target)
  }
  if (invalidates.has('project')) {
    targets.add('projects')
    if (
      references('team', resources.teamId)
      || references('project', resources.projectId)
    )
      targets.add('items')
  }
  const invalidatesSelectedWorkItem =
    invalidates.has('work_item')
    && (
      references('team', resources.teamId)
      || references('work_item', resources.workItemId)
    )
  if (invalidatesSelectedWorkItem) {
    targets.add('items')
  }
  if (invalidates.has('workspace')) {
    if (invalidation.event.aggregate_type === 'actor') targets.add('humans')
    if (invalidation.event.aggregate_type === 'saved_view') targets.add('views')
    if (invalidation.event.aggregate_type === 'workspace')
      for (const target of ['teams', 'humans', 'projects', 'views'] as const)
        targets.add(target)
  }
  return targets
}
