import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolvePlaywrightRunPaths } from './playwright-run-directory.js'

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(webRoot, '..', '..')

describe('resolvePlaywrightRunPaths', () => {
  it('keeps the existing root and web-local defaults when isolation is not requested', () => {
    const rootPaths = resolvePlaywrightRunPaths('root-mixed', {}, repositoryRoot)
    const mockedPaths = resolvePlaywrightRunPaths('mocked-dev', {}, webRoot)

    expect(rootPaths).toMatchObject({
      isolated: false,
      runRoot: null,
      outputDirectory: path.join(repositoryRoot, 'test-results'),
      authenticatedStatePath: path.resolve(
        repositoryRoot,
        'test-results/.auth/admin.json',
      ),
      htmlReportDirectory: path.join(repositoryRoot, 'playwright-report'),
    })
    expect(mockedPaths.outputDirectory).toBe(
      path.join(webRoot, 'test-results'),
    )
    expect(mockedPaths.htmlReportDirectory).toBe(
      path.join(webRoot, 'playwright-report'),
    )
  })

  it.each([
    'root-mixed',
    'mocked-dev',
    'production-web-plus-mocked-api',
  ] as const)('isolates every %s artifact below its topology directory', (topology) => {
    const runRoot = path.resolve(process.cwd(), '.tmp/playwright-run')
    const topologyRoot = path.join(runRoot, topology)

    expect(
      resolvePlaywrightRunPaths(topology, {
        WORKMESH_PLAYWRIGHT_RUN_DIR: runRoot,
      }),
    ).toEqual({
      isolated: true,
      runRoot,
      topologyRoot,
      authDirectory: path.join(topologyRoot, '.auth'),
      authenticatedStatePath: path.join(topologyRoot, '.auth/admin.json'),
      outputDirectory: path.join(topologyRoot, 'output'),
      htmlReportDirectory: path.join(topologyRoot, 'html-report'),
    })
  })

  it('rejects a relative isolated run root', () => {
    expect(() =>
      resolvePlaywrightRunPaths('root-mixed', {
        WORKMESH_PLAYWRIGHT_RUN_DIR: 'artifacts/playwright-run',
      }),
    ).toThrow('WORKMESH_PLAYWRIGHT_RUN_DIR must be an absolute path')
  })
})
