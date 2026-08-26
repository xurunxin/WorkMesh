import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('Human Control Plane preview isolation', () => {
  it('is gated out of production unless the explicit preview environment flag is set', () => {
    const source = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8')
    expect(source).toContain("process.env.WORKMESH_HCP_PREVIEW !== '1'")
    expect(source).toContain('notFound()')
  })
})
