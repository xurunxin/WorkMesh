import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const acceptance = JSON.parse(read('../../docs/acceptance/human-control-plane-acceptance.json')) as {
  topologies: Array<{ id: string }>
  primarySurfaces: string[]
  requiredStates: string[]
  viewports: Array<{ width: number; height: number }>
  performanceBudgets: Record<string, number>
  telemetry: { maxEntries: number; externalTransmission: boolean; forbiddenFields: string[] }
  claims: Record<string, boolean>
}

describe('Human Control Plane final acceptance contract', () => {
  it('pins every required surface, failure family, viewport, and honest nonclaim', () => {
    expect(acceptance.primarySurfaces).toEqual(expect.arrayContaining(['project', 'work_item', 'attention', 'run', 'governed_control', 'inbox_thread', 'recovery', 'evidence']))
    expect(acceptance.requiredStates).toEqual(expect.arrayContaining(['loading', 'partial', 'forbidden', 'conflict', 'offline', 'resync_required', 'feature_disabled', 'authority_changed', 'large_collection']))
    expect(acceptance.viewports).toEqual([{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }, { width: 1920, height: 1080 }])
    expect(Object.values(acceptance.claims).every(value => value === false)).toBe(true)
  })

  it('stays aligned with executable topology and performance owners', () => {
    const runner = read('../../scripts/run-web-ui-final-playwright.mts')
    const tour = read('e2e/mocked/final-visual-tour.mocked.spec.ts')
    const scale = read('e2e/mocked/large-list-pagination.mocked.spec.ts')
    for (const topology of ['root-mixed-real-local', 'mocked-dev', 'production-web-plus-mocked-api'])
      expect(acceptance.topologies.some(candidate => candidate.id === topology)).toBe(true)
    for (const topology of ['root-mixed', 'mocked-dev', 'production-web-plus-mocked-api']) expect(runner).toContain(topology)
    for (const viewport of acceptance.viewports) expect(tour).toContain(`width: ${viewport.width}, height: ${viewport.height}`)
    expect(acceptance.performanceBudgets.paginationMsMax).toBe(1_500)
    expect(scale).toContain('duration <= 1_500')
    expect(scale).toContain(`duration <= ${acceptance.performanceBudgets.interactionMsMax}`)
    expect(scale).toContain(`toHaveLength(${acceptance.performanceBudgets.workItems})`)
  })

  it('forbids sensitive identity and content dimensions and external transmission', () => {
    expect(acceptance.telemetry.externalTransmission).toBe(false)
    expect(acceptance.telemetry.maxEntries).toBe(200)
    expect(acceptance.telemetry.forbiddenFields).toEqual(expect.arrayContaining(['body', 'prompt', 'secret', 'credential', 'path', 'url', 'resourceId', 'payload', 'hiddenReasoning', 'correlationId']))
  })
})
