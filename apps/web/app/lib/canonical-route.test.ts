import { describe, expect, it } from 'vitest'
import { canonicalObjectHref, evidenceDrawerHref, safeExternalHref, safeInternalHref, safeLoginReturnTo } from './canonical-route'

describe('canonical Human Control Plane routes', () => {
  it('C2 登录返回保留同源路径、查询和焦点定位', () => {
    const href = canonicalObjectHref({ kind: 'attention', id: 'v1:inbox_item:one' })!
    expect(safeLoginReturnTo(href + '#details', 'https://workmesh.test')).toBe(href + '#details')
    expect(safeLoginReturnTo('https://workmesh.test' + href, 'https://workmesh.test')).toBe(href)
    expect(safeLoginReturnTo('HTTPS://WORKMESH.TEST' + href, 'https://workmesh.test')).toBe(href)
    expect(safeLoginReturnTo(new URLSearchParams(new URLSearchParams({ returnTo: href }).toString()).get('returnTo'), 'https://workmesh.test')).toBe(href)
  })
  it.each(['https://evil.test/', '//evil.test/', '/\\evil.test', '/%2f%2fevil.test', '/%5cevil.test', '/%0aevil', '/%ff', '/%', '/login', '/%6cogin?returnTo=/', '/install/', 'https://u:p@workmesh.test/', 'javascript:alert(1)', '\n/', 'https://workmesh.test:443@evil.test/'])('C2 拒绝开放重定向、异常编码和登录循环：%s', value => {
    expect(safeLoginReturnTo(value, 'https://workmesh.test')).toBe('/')
  })
  it('maps supported identities without manufacturing optional Graph routes', () => {
    expect(canonicalObjectHref({ kind: 'work_item', id: 'work-1', projectId: 'project-1' })).toBe('/?view=issues&workItem=work-1&projectId=project-1')
    expect(canonicalObjectHref({ kind: 'plan_step', id: 'step-1', sessionId: 'session-1', planVersionId: 'plan-1' })).toBe('/agent-sessions/session-1?stepId=step-1&planId=plan-1')
    expect(canonicalObjectHref({ kind: 'approval', id: 'approval-1' })).toContain('v1%3Aapproval%3Aapproval-1')
    expect(canonicalObjectHref({ kind: 'recovery', id: 'v1:session_failed:source-1', projectId: 'project-1' })).toContain('recoveryItem=v1%3Asession_failed%3Asource-1')
    expect(canonicalObjectHref({ kind: 'graph', id: 'subject-1' })).toBeUndefined()
    expect(canonicalObjectHref({ kind: 'graph', id: 'subject-1', negotiatedHref: '/graphs/version-4?subject=authorized-1' })).toBe('/graphs/version-4?subject=authorized-1')
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

  it('accepts only server-negotiated internal targets for optional capabilities', () => {
    expect(safeInternalHref('/graphs/version-4?subject=authorized-1')).toBe('/graphs/version-4?subject=authorized-1')
    expect(safeInternalHref('https://example.test/graphs/private')).toBeUndefined()
    expect(safeInternalHref('//example.test/graphs/private')).toBeUndefined()
    expect(safeInternalHref('javascript:alert(1)')).toBeUndefined()
  })
})
