import { describe, expect, it } from 'vitest'
import { actorDisplayName } from './actor.js'

describe('actor identity presentation', () => {
  it('uses the public auth contract display_name field', () => {
    expect(actorDisplayName({ display_name: 'Alice' })).toBe('Alice')
  })
})
