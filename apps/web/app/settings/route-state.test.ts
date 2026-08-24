import { describe, expect, it } from 'vitest'
import { readSettingsRoute, writeSettingsRoute } from './route-state'

describe('Settings route state', () => {
  it('reads Operations and Team while defaulting invalid tabs to Workspace', () => {
    expect(readSettingsRoute('?tab=operations&team=team-1')).toEqual({
      tab: 'operations',
      teamId: 'team-1',
    })
    expect(readSettingsRoute('?tab=unknown&team=')).toEqual({ tab: 'workspace', teamId: null })
    expect(readSettingsRoute('')).toEqual({ tab: 'workspace', teamId: null })
  })

  it('writes one partial field without losing Team, query, hash, or stable parameter order', () => {
    const source = new URL('https://wm.test/settings?team=team-1&opsQuery=retry&x=1#operations-runs')
    const result = writeSettingsRoute(source, { tab: 'operations' })

    expect(result.href).toBe('https://wm.test/settings?team=team-1&opsQuery=retry&x=1&tab=operations#operations-runs')
    expect(source.href).toBe('https://wm.test/settings?team=team-1&opsQuery=retry&x=1#operations-runs')
    expect(result).not.toBe(source)
  })

  it('distinguishes omitted Team from explicit deletion and canonicalizes the default tab', () => {
    const source = new URL('https://wm.test/settings?tab=operations&team=team-1&x=keep#operations-templates')

    const workspace = writeSettingsRoute(source, { tab: 'workspace' })
    expect(workspace.searchParams.has('tab')).toBe(false)
    expect(workspace.searchParams.get('team')).toBe('team-1')
    expect(workspace.searchParams.get('x')).toBe('keep')
    expect(workspace.hash).toBe('#operations-templates')

    const omitted = writeSettingsRoute(source, {})
    expect(omitted.searchParams.get('team')).toBe('team-1')
    expect(omitted.searchParams.get('tab')).toBe('operations')

    const removed = writeSettingsRoute(source, { teamId: null })
    expect(removed.searchParams.has('team')).toBe(false)
    expect(removed.searchParams.get('tab')).toBe('operations')
    expect(removed.searchParams.get('x')).toBe('keep')
    expect(removed.hash).toBe('#operations-templates')

    const replaced = writeSettingsRoute(removed, { teamId: 'team-2' })
    expect(replaced.searchParams.get('team')).toBe('team-2')
    expect(replaced.searchParams.get('tab')).toBe('operations')
    expect(replaced.searchParams.get('x')).toBe('keep')
    expect(replaced.hash).toBe('#operations-templates')
    expect(removed.searchParams.has('team')).toBe(false)
  })
})
