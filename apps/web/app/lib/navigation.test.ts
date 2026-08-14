import { describe, expect, it } from 'vitest'
import { homeScopeHref, parseHomeScope } from './navigation.js'

describe('home navigation', () => {
  it('maps every daily-work scope to a stable URL', () => {
    expect(homeScopeHref('my-work')).toBe('/?view=my-work')
    expect(homeScopeHref('active')).toBe('/?view=active')
    expect(homeScopeHref('backlog')).toBe('/?view=backlog')
    expect(homeScopeHref('projects')).toBe('/?view=projects')
    expect(homeScopeHref('inbox')).toBe('/?view=inbox')
    expect(homeScopeHref('guidance')).toBe('/?view=guidance')
  })

  it('restores a valid scope and fails safely to My Work', () => {
    expect(parseHomeScope('?view=projects')).toBe('projects')
    expect(parseHomeScope('?view=inbox')).toBe('inbox')
    expect(parseHomeScope('?view=unknown')).toBe('my-work')
    expect(parseHomeScope('')).toBe('my-work')
  })
})
