import { describe, expect, it } from 'vitest'
import { readRecoveryRoute, recoveryHref } from './recovery-route'

describe('Recovery Center route', () => {
  it('owns filters and selection while preserving unrelated route context', () => {
    const href = recoveryHref('https://workmesh.test/?view=projects&foo=bar#source', {
      lifecycle: 'resolved', condition: 'lease_lost', severity: 'critical',
      projectId: 'project-1', selectedId: 'v1:lease_lost:source-1',
    })
    expect(href).toContain('view=recovery')
    expect(href).toContain('foo=bar')
    expect(href).toContain('recoveryLifecycle=resolved')
    expect(href).toContain('#source')
  })

  it('normalizes unsupported values', () => {
    expect(readRecoveryRoute('?recoveryLifecycle=nope&recoveryCondition=made_up&recoverySeverity=low'))
      .toEqual({ lifecycle: 'active' })
  })
})
