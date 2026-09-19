import { describe, expect, it } from 'vitest'
import { readSettingsRoute, writeSettingsRoute } from './route-state'

describe('settings route', () => {
  it('keeps workspace settings as the only production surface', () => {
    expect(readSettingsRoute('?team=team-1')).toEqual({ tab: 'workspace', teamId: 'team-1' })
    expect(readSettingsRoute('?tab=operations&team=team-1')).toEqual({ tab: 'workspace', teamId: 'team-1' })
  })

  it('never writes the removed embedded Operations tab', () => {
    const result = writeSettingsRoute(new URL('https://wm.test/settings?tab=operations&team=team-1'), { tab: 'workspace' })
    expect(result.searchParams.has('tab')).toBe(false)
    expect(result.searchParams.get('team')).toBe('team-1')
  })
})
