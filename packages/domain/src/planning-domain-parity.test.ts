import { describe, expect, it } from 'vitest'
import { assertWorkItemParent, canonicalWorkItemRelation } from './index.js'

describe('planning domain parity invariants', () => {
  it('canonicalizes undirected related links without changing blocker direction', () => {
    expect(canonicalWorkItemRelation('b', 'a', 'related')).toEqual({ sourceWorkItemId: 'a', targetWorkItemId: 'b', kind: 'related' })
    expect(canonicalWorkItemRelation('b', 'a', 'blocks')).toEqual({ sourceWorkItemId: 'b', targetWorkItemId: 'a', kind: 'blocks' })
    expect(() => canonicalWorkItemRelation('a', 'a', 'related')).toThrow('cannot relate to itself')
  })

  it('rejects self, cross-Project, and cyclic parents', () => {
    expect(() => assertWorkItemParent({ id: 'a', projectId: 'p' }, { id: 'a', projectId: 'p', ancestorIds: [] })).toThrow('own parent')
    expect(() => assertWorkItemParent({ id: 'a', projectId: 'p' }, { id: 'b', projectId: 'q', ancestorIds: [] })).toThrow('same Project')
    expect(() => assertWorkItemParent({ id: 'a', projectId: 'p' }, { id: 'b', projectId: 'p', ancestorIds: ['a'] })).toThrow('acyclic')
  })
})
