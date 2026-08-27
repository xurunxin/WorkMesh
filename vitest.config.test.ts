import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { localVitestSetup } from './vitest.config'
import integrationConfig from './vitest.integration.config'

describe('localVitestSetup', () => {
  it('loads the package-local setup when the current package owns one', () => {
    const webRoot = resolve(process.cwd(), 'apps/web')
    expect(localVitestSetup(webRoot)).toEqual([resolve(webRoot, 'vitest-setup.ts')])
  })

  it('does not invent setup files for packages that do not own one', () => {
    const uiRoot = resolve(process.cwd(), 'packages/ui')
    const contractsRoot = resolve(process.cwd(), 'packages/contracts')
    expect(localVitestSetup(uiRoot)).toEqual([])
    expect(localVitestSetup(contractsRoot)).toEqual([])
  })
})

describe('integration Vitest lifecycle', () => {
  it('uses process isolation for long-lived server suites', () => {
    expect(integrationConfig.test?.pool).toBe('forks')
    expect(integrationConfig.test?.fileParallelism).toBe(false)
    expect(integrationConfig.test?.maxWorkers).toBe(1)
    expect(integrationConfig.test?.hookTimeout).toBe(300_000)
    expect(integrationConfig.test?.testTimeout).toBe(300_000)
  })
})
