import { describe, expect, it } from 'vitest'
import { WORKFLOW_COLOR_PRESETS, workflowColorValue } from './workflow-color-presets'

describe('workflow color presets', () => {
  it('keeps the five persisted preset identifiers and colors stable', () => {
    expect(WORKFLOW_COLOR_PRESETS).toEqual([
      { id: 'neutral', value: '#73736f' },
      { id: 'blue', value: '#2563eb' },
      { id: 'green', value: '#15803d' },
      { id: 'amber', value: '#a16207' },
      { id: 'red', value: '#b42318' },
    ])
  })

  it('resolves only persisted preset identifiers', () => {
    expect(workflowColorValue('neutral')).toBe('#73736f')
    expect(workflowColorValue('red')).toBe('#b42318')
    expect(workflowColorValue('custom')).toBeNull()
    expect(workflowColorValue('unknown')).toBeNull()
  })
})
