import { describe, expect, it } from 'vitest'
import { visibleOperationsSections } from './sections'

const operations = 'WORKMESH_BETA_OPERATIONS_UI'

describe('visibleOperationsSections', () => {
  it('requires the Operations UI master feature', () => {
    expect(visibleOperationsSections(new Set(['WORKMESH_BETA_PLANNING']))).toEqual([])
    expect(visibleOperationsSections(new Set([operations]))).toEqual([])
  })

  it.each([
    ['WORKMESH_BETA_COSTS', ['metrics']],
    ['WORKMESH_BETA_PLANNING', ['cycles', 'initiatives']],
    ['WORKMESH_EXPERIMENTAL_AUTOMATION', ['automation', 'runs']],
    ['WORKMESH_EXPERIMENTAL_AGENT_LOOPS', ['loops']],
    ['WORKMESH_BETA_TEMPLATES', ['templates']],
  ] as const)('maps %s to its visible sections', (feature, expected) => {
    expect(visibleOperationsSections(new Set([operations, feature]))).toEqual(expected)
  })

  it('returns every section in deterministic visual order and ignores unknown features', () => {
    expect(visibleOperationsSections(new Set([
      'UNKNOWN_OPERATIONS_FEATURE',
      'WORKMESH_BETA_TEMPLATES',
      'WORKMESH_EXPERIMENTAL_AGENT_LOOPS',
      'WORKMESH_BETA_OPERATIONS_UI',
      'WORKMESH_EXPERIMENTAL_AUTOMATION',
      'WORKMESH_BETA_PLANNING',
      'WORKMESH_BETA_COSTS',
    ]))).toEqual([
      'metrics',
      'cycles',
      'initiatives',
      'automation',
      'loops',
      'runs',
      'templates',
    ])
  })
})
