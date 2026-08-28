import { describe, expect, it } from 'vitest'
import { createWorkSurfaceViewModel, workSurfaceStateForCollection } from './view-model'
import type { WorkItemDto } from './contracts'

const workItem: WorkItemDto = {
  id: 'work-1',
  revision: 1,
  title: 'Keep the resolved row',
  description: 'A concise board summary.',
}

describe('work surface initialization authority', () => {
  it('never converts an unresolved empty collection into a false empty state', () => {
    expect(workSurfaceStateForCollection({
      error: null,
      hasItems: false,
      initialized: false,
      loading: false,
    })).toBe('loading')
  })

  it('uses empty only after the collection has initialized successfully', () => {
    expect(workSurfaceStateForCollection({
      error: null,
      hasItems: false,
      initialized: true,
      loading: false,
    })).toBe('empty')
  })

  it('marks a same-scope refresh as refreshing without discarding resolved rows', () => {
    const model = createWorkSurfaceViewModel({
      collection: {
        initialized: true,
        items: [workItem],
        loading: true,
        nextCursor: null,
      },
      layout: 'list',
      query: {},
      scope: 'my-work',
    })

    expect(model.state).toBe('refreshing')
    expect(model.items.map(item => item.id)).toEqual(['work-1'])
    expect(model.items[0]?.description).toBe('A concise board summary.')
  })

  it('keeps a retained refresh failure distinguishable from an initial failure', () => {
    const model = createWorkSurfaceViewModel({
      collection: {
        initialized: true,
        items: [workItem],
        loading: false,
        nextCursor: null,
      },
      error: new Error('refresh failed'),
      layout: 'list',
      query: {},
      scope: 'my-work',
    })

    expect(model.state).toBe('error')
    expect(model.items.map(item => item.id)).toEqual(['work-1'])
  })
})
