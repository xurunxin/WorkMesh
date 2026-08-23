import { describe, expect, it } from 'vitest'
import { isAuthenticatedWorkspacePath } from './shortcut-scope'

describe('authenticated shortcut scope', () => {
  it.each([
    '/',
    '/agents',
    '/agents/',
    '/agents/agent-1',
    '/agents/agent%2F1',
    '/agent-sessions/session-1',
    '/settings',
    '/operations',
  ])('allows the known authenticated workspace route %s', pathname => {
    expect(isAuthenticatedWorkspacePath(pathname)).toBe(true)
  })

  it.each([
    '/login',
    '/install',
    '/connect',
    '/not-found',
    '/future-public-page',
    '/agents-extra',
    '/agent-sessions',
    '/preview-issues',
    '/preview-round2',
    '/evidence/collaboration-faults',
  ])('fails closed for public, static, incomplete, or unknown route %s', pathname => {
    expect(isAuthenticatedWorkspacePath(pathname)).toBe(false)
  })
})
