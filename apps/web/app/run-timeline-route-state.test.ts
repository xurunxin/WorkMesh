import { describe, expect, it } from 'vitest'
import { parseRunTimelineRouteState, writeRunTimelineRouteState } from './run-timeline-route-state'

describe('Run Timeline URL state', () => {
  it('round-trips causal filters while preserving unrelated Project state', () => {
    const initial = new URLSearchParams('view=projects&project=p1&runPhase=validation&runFailure=1&runAttention=1&runTechnical=1&runTime=7d&runCursor=42')
    const state = parseRunTimelineRouteState(initial)
    expect(state).toMatchObject({ phase: 'validation', failureOnly: true, attentionOnly: true, technical: true, timeWindow: '7d', cursor: '42' })
    const written = writeRunTimelineRouteState(initial, { ...state, groupId: 'activity-group:a1', stepId: 's1' })
    expect(written.get('view')).toBe('projects')
    expect(written.get('project')).toBe('p1')
    expect(written.get('runGroup')).toBe('activity-group:a1')
    expect(written.get('runStep')).toBe('s1')
  })

  it('converges invalid enum and cursor values to meaningful defaults', () => {
    expect(parseRunTimelineRouteState(new URLSearchParams('runPhase=raw&runAction=shell&runTime=forever&runCursor=-1'))).toMatchObject({ phase: 'all', action: 'all', timeWindow: 'all', cursor: '' })
  })
})
