import { describe, expect, it } from 'vitest'
import { canManageWorkspace } from './settings-permissions.js'

describe('settings permissions', () => {
  it('keeps workspace mutations behind the admin role', () => {
    expect(canManageWorkspace('admin')).toBe(true)
    expect(canManageWorkspace('member')).toBe(false)
  })
})
