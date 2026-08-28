import { describe, expect, it } from 'vitest'
import { workflowStatePatchSchema } from '../../../../packages/contracts/src/index.js'

describe('WorkflowStatePatch', () => {
  it('accepts either editable field', () => {
    expect(workflowStatePatchSchema.parse({ name: 'In review' })).toEqual({ name: 'In review' })
    expect(workflowStatePatchSchema.parse({ color: '#12aBcF' })).toEqual({ color: '#12aBcF' })
    expect(workflowStatePatchSchema.parse({ name: 'Done', color: '#16A34A' })).toEqual({ name: 'Done', color: '#16A34A' })
  })

  it('rejects empty, invalid, and non-editable patches', () => {
    expect(workflowStatePatchSchema.safeParse({}).success).toBe(false)
    expect(workflowStatePatchSchema.safeParse({ color: 'green' }).success).toBe(false)
    expect(workflowStatePatchSchema.safeParse({ category: 'started' }).success).toBe(false)
    expect(workflowStatePatchSchema.safeParse({ name: '' }).success).toBe(false)
  })
})
