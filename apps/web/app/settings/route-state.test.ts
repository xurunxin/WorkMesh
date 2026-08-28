import { describe, expect, it } from 'vitest'
import { legacySettingsOperationsHref, readSettingsRoute, writeSettingsRoute } from './route-state'

describe('Settings route state', () => {
  it('reads the Team while ignoring retired settings tabs', () => {
    expect(readSettingsRoute('?tab=operations&team=team-1')).toEqual({ teamId: 'team-1' })
    expect(readSettingsRoute('?tab=unknown&team=')).toEqual({ teamId: null })
    expect(readSettingsRoute('')).toEqual({ teamId: null })
  })

  it('writes Team without losing unrelated query or hash state', () => {
    const source = new URL('https://wm.test/settings?team=team-1&opsQuery=retry&x=1#operations-runs')
    const result = writeSettingsRoute(source, { teamId: 'team-2' })

    expect(result.href).toBe('https://wm.test/settings?team=team-2&opsQuery=retry&x=1#operations-runs')
    expect(source.href).toBe('https://wm.test/settings?team=team-1&opsQuery=retry&x=1#operations-runs')
    expect(result).not.toBe(source)
  })

  it('distinguishes omitted Team from explicit deletion', () => {
    const source = new URL('https://wm.test/settings?tab=operations&team=team-1&x=keep#operations-templates')

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

  it('redirects legacy embedded Operations URLs to the sole Operations page', () => {
    const legacy = new URL('https://wm.test/settings?tab=operations&team=team-1&opsQuery=retry&x=keep#operations-runs')

    expect(legacySettingsOperationsHref(legacy)).toBe('/operations?opsQuery=retry&x=keep#operations-runs')
    expect(legacySettingsOperationsHref(new URL('https://wm.test/settings?team=team-1'))).toBeNull()
    expect(legacy.href).toBe('https://wm.test/settings?tab=operations&team=team-1&opsQuery=retry&x=keep#operations-runs')
  })
})
