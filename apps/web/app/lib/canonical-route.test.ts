import { describe, expect, it } from 'vitest'
import { canonicalObjectHref, evidenceDrawerHref, safeExternalHref } from './canonical-route'

describe('canonical Human Control Plane routes', () => {
  it('maps supported identities without manufacturing optional Graph routes', () => {
    expect(canonicalObjectHref({ kind: 'work_item', id: 'work-1', projectId: 'project-1' })).toBe('/?view=issues&workItem=work-1&projectId=project-1')
    expect(canonicalObjectHref({ kind: 'plan_step', id: 'step-1', sessionId: 'session-1', planVersionId: 'plan-1' })).toBe('/agent-sessions/session-1?stepId=step-1&planId=plan-1')
    expect(canonicalObjectHref({ kind: 'approval', id: 'approval-1' })).toContain('v1%3Aapproval%3Aapproval-1')
    expect(canonicalObjectHref({ kind: 'recovery', id: 'v1:session_failed:source-1', projectId: 'project-1' })).toContain('recoveryItem=v1%3Asession_failed%3Asource-1')
    expect(canonicalObjectHref({ kind: 'graph', id: 'subject-1', enabled: false })).toBeUndefined()
  })

  it('owns drawer identity while preserving the source workspace state', () => {
    const opened = evidenceDrawerHref('/?view=inbox&queue=needs-you&attentionSelected=a1', 'e1', 'attention', 'approval-card')
    expect(opened).toContain('queue=needs-you')
    expect(opened).toContain('attentionSelected=a1')
    expect(opened).toContain('evidenceId=e1')
    expect(evidenceDrawerHref(opened)).toBe('/?view=inbox&queue=needs-you&attentionSelected=a1')
  })

  it('allows only credential-free HTTP(S) external targets', () => {
    expect(safeExternalHref('https://example.test/evidence?id=1')).toBe('https://example.test/evidence?id=1')
    expect(safeExternalHref('https://token@example.test/private')).toBeUndefined()
    expect(safeExternalHref('javascript:alert(1)')).toBeUndefined()
    expect(safeExternalHref('not-a-url')).toBeUndefined()
  })
})
