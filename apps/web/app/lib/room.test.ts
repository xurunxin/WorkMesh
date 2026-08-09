import { describe, expect, it } from 'vitest'
import { mergeRoomTimelines } from './room.js'

describe('Work Room timeline composition', () => {
  it('keeps room event cards while adding durable REST comments', () => {
    const merged = mergeRoomTimelines(
      [
        { id: 'event-1', actorName: 'Unknown actor' },
        { id: 'event-2', actorName: 'Unknown actor' },
      ],
      [{
        id: 'comment-comment-1',
        type: 'comment',
        body: 'Durable comment from another browser',
      }],
    )

    expect(merged.map(item => item.id)).toEqual([
      'event-1',
      'event-2',
      'comment-comment-1',
    ])
    expect(merged.some(item =>
      item.body === 'Durable comment from another browser')).toBe(true)
  })

  it('deduplicates stable timeline IDs without hiding distinct sources', () => {
    expect(mergeRoomTimelines(
      [{ id: 'event-1' }, { id: 'event-1' }],
      [{ id: 'comment-1' }, { id: 'comment-1' }],
    ).map(item => item.id)).toEqual(['event-1', 'comment-1'])
  })
})
