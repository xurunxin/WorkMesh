export const runPhases = ['all', 'intake', 'investigation', 'planning', 'implementation', 'validation', 'human_input', 'recovery', 'completion'] as const
export const runActions = ['all', 'acknowledgement', 'read', 'write', 'tool', 'state_transition', 'plan', 'message', 'approval', 'decision', 'evidence', 'validation', 'handoff', 'heartbeat', 'other'] as const

export type RunTimelineRouteState = {
  action: typeof runActions[number]
  actorId: string
  attentionOnly: boolean
  comparePlanId: string
  cursor: string
  evidence: 'all' | 'present' | 'missing'
  failureOnly: boolean
  groupId: string
  phase: typeof runPhases[number]
  planId: string
  risk: 'all' | 'low' | 'medium' | 'high' | 'critical'
  stepId: string
  technical: boolean
  timeWindow: 'all' | '24h' | '7d' | '30d'
}

const oneOf = <T extends readonly string[]>(value: string | null, options: T, fallback: T[number]): T[number] => options.includes(value ?? '') ? value as T[number] : fallback

export const parseRunTimelineRouteState = (params: URLSearchParams): RunTimelineRouteState => ({
  action: oneOf(params.get('runAction'), runActions, 'all'),
  actorId: params.get('runActor') ?? '',
  attentionOnly: params.get('runAttention') === '1',
  comparePlanId: params.get('runCompare') ?? '',
  cursor: /^[1-9][0-9]{0,18}$/.test(params.get('runCursor') ?? '') ? params.get('runCursor')! : '',
  evidence: oneOf(params.get('runEvidence'), ['all', 'present', 'missing'] as const, 'all'),
  failureOnly: params.get('runFailure') === '1',
  groupId: params.get('runGroup') ?? '',
  phase: oneOf(params.get('runPhase'), runPhases, 'all'),
  planId: params.get('runPlan') ?? '',
  risk: oneOf(params.get('runRisk'), ['all', 'low', 'medium', 'high', 'critical'] as const, 'all'),
  stepId: params.get('runStep') ?? '',
  technical: params.get('runTechnical') === '1',
  timeWindow: oneOf(params.get('runTime'), ['all', '24h', '7d', '30d'] as const, 'all'),
})

const keys: Record<keyof RunTimelineRouteState, string> = {
  action: 'runAction', actorId: 'runActor', attentionOnly: 'runAttention', comparePlanId: 'runCompare', cursor: 'runCursor', evidence: 'runEvidence',
  failureOnly: 'runFailure', groupId: 'runGroup', phase: 'runPhase', planId: 'runPlan', risk: 'runRisk', stepId: 'runStep', technical: 'runTechnical', timeWindow: 'runTime',
}

export const writeRunTimelineRouteState = (current: URLSearchParams, state: RunTimelineRouteState): URLSearchParams => {
  const next = new URLSearchParams(current)
  for (const key of Object.values(keys)) next.delete(key)
  if (state.action !== 'all') next.set(keys.action, state.action)
  if (state.actorId) next.set(keys.actorId, state.actorId)
  if (state.attentionOnly) next.set(keys.attentionOnly, '1')
  if (state.comparePlanId) next.set(keys.comparePlanId, state.comparePlanId)
  if (state.cursor) next.set(keys.cursor, state.cursor)
  if (state.evidence !== 'all') next.set(keys.evidence, state.evidence)
  if (state.failureOnly) next.set(keys.failureOnly, '1')
  if (state.groupId) next.set(keys.groupId, state.groupId)
  if (state.phase !== 'all') next.set(keys.phase, state.phase)
  if (state.planId) next.set(keys.planId, state.planId)
  if (state.risk !== 'all') next.set(keys.risk, state.risk)
  if (state.stepId) next.set(keys.stepId, state.stepId)
  if (state.technical) next.set(keys.technical, '1')
  if (state.timeWindow !== 'all') next.set(keys.timeWindow, state.timeWindow)
  return next
}
