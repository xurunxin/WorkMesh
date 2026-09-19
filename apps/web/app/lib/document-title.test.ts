import { describe, expect, it } from 'vitest'
import { workMeshDocumentTitle } from './document-title'

describe('WorkMesh document titles', () => {
  it('uses the product name as the stable default', () => {
    expect(workMeshDocumentTitle()).toBe('WorkMesh')
    expect(workMeshDocumentTitle('  ')).toBe('WorkMesh')
  })

  it('formats route and entity titles consistently', () => {
    expect(workMeshDocumentTitle('Projects')).toBe('Projects · WorkMesh')
    expect(workMeshDocumentTitle('Runtime Reliability')).toBe('Runtime Reliability · WorkMesh')
  })
})
