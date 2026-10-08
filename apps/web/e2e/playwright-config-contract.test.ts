import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

const isolatedRunRoot = path.resolve(process.cwd(), '.tmp/config-contract')

type WebServerContract = Readonly<{
  command: string
  env?: Readonly<Record<string, string | undefined>>
  reuseExistingServer?: boolean
}>

type ConfigContract = Readonly<{
  outputDir?: string
  projects?: ReadonlyArray<
    Readonly<{
      name?: string
      use?: Readonly<{ storageState?: unknown }>
      testMatch?: string | RegExp | Array<string | RegExp>
      testIgnore?: unknown
    }>
  >
  reporter?: unknown
  testIgnore?: unknown
  testMatch?: string | RegExp | Array<string | RegExp>
  webServer?: WebServerContract | WebServerContract[]
}>

const patternStrings = (
  value: ConfigContract['testMatch'],
): string[] => {
  if (!value) return []
  return (Array.isArray(value) ? value : [value]).map(String)
}

describe('Playwright topology configs', () => {
  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('preserves the mocked local list reporter when no run root is set', async () => {
    vi.stubEnv('WORKMESH_PLAYWRIGHT_RUN_DIR', '')
    vi.resetModules()

    const mockedModule = await import('../playwright.mocked.config.js')
    const mocked = mockedModule.default as unknown as ConfigContract

    expect(mocked.reporter).toEqual([['list']])
    vi.unstubAllEnvs()
  })

  it('keeps collection, runtime, and isolated artifact contracts distinct', async () => {
    vi.stubEnv('RUN_INTEGRATION', '1')
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://fixture:fixture@127.0.0.1:1/workmesh_ui_test',
    )
    vi.stubEnv('WORKMESH_BOOTSTRAP_TOKEN', 'fixture-only')
    vi.stubEnv('WORKMESH_PLAYWRIGHT_RUN_DIR', isolatedRunRoot)
    vi.stubEnv('NEXT_DEV_API_UPSTREAM', 'http://127.0.0.1:1/fixture-upstream')
    vi.resetModules()

    const [rootModule, mockedModule, productionModule, d0Module, d1bModule, boardModule] =
      await Promise.all([
        import('../../../playwright.config.js'),
        import('../playwright.mocked.config.js'),
        import('../playwright.production.config.js'),
        import('../playwright.d0.config.js'),
        import('../playwright.d1b.config.js'),
        import('../playwright.d1b-board.config.js'),
      ])
    const root = rootModule.default as unknown as ConfigContract
    const mocked = mockedModule.default as unknown as ConfigContract
    const production = productionModule.default as unknown as ConfigContract
    const d0 = d0Module.default as unknown as ConfigContract
    const d1b = d1bModule.default as unknown as ConfigContract
    const board = boardModule.default as unknown as ConfigContract

    expect(root.outputDir).toBe(
      path.join(isolatedRunRoot, 'root-mixed', 'output'),
    )
    expect(root.projects?.[1]?.use?.storageState).toBe(
      path.join(isolatedRunRoot, 'root-mixed', '.auth', 'admin.json'),
    )
    // Protected-route theme checks must run after login instead of merely
    // checking the login page reached by an anonymous redirect.
    expect(patternStrings(root.projects?.[0]?.testMatch)).toEqual([
      String(/stage0\.spec\.ts/),
    ])
    expect(String(root.projects?.[1]?.testIgnore)).not.toContain('theme-unification')
    expect(String(root.testIgnore)).toContain('mocked')

    expect(mocked.outputDir).toBe(
      path.join(isolatedRunRoot, 'mocked-dev', 'output'),
    )
    expect(patternStrings(mocked.testMatch)).toEqual([
      String(/[\\/]mocked[\\/].*\.mocked\.spec\.ts$/),
      String(/human-reflow\.spec\.ts$/),
    ])
    expect(patternStrings(mocked.testIgnore as ConfigContract['testMatch'])).toEqual([
      String(/[\\/]mocked[\\/]d0-visual-baseline\.mocked\.spec\.ts$/),
      String(/[\\/]mocked[\\/]d1b-workbench\.mocked\.spec\.ts$/),
      String(/[\\/]mocked[\\/]d1b-board\.mocked\.spec\.ts$/),
    ])
    expect(patternStrings(board.testMatch)).toEqual([String(/[\\/]mocked[\\/]d1b-board\.mocked\.spec\.ts$/)])
    expect(patternStrings(d1b.testMatch)).toContain(String(/theme-unification\.spec\.ts$/))
    expect(d1b.projects?.map(project => project.name)).toEqual(['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'])
    expect(d1b.projects?.every(project => !String(project.testIgnore).includes('theme-unification'))).toBe(true)
    expect(patternStrings(d0.testMatch)).toEqual([String(/[\\/]mocked[\\/]d0-visual-baseline\.mocked\.spec\.ts$/)])
    expect(d0.testIgnore).toEqual([])

    const mockedServers = mocked.webServer
    const d0Servers = d0.webServer
    expect(Array.isArray(mockedServers)).toBe(true)
    expect(Array.isArray(d0Servers)).toBe(true)
    if (!Array.isArray(mockedServers) || !Array.isArray(d0Servers)) return
    // 通用入口保留调用环境；只有 D0 覆盖为自己的隔离夹具。
    expect(mockedServers[1]?.env?.NEXT_DEV_API_UPSTREAM).toBe(
      'http://127.0.0.1:1/fixture-upstream',
    )
    expect(d0Servers[1]?.env?.NEXT_DEV_API_UPSTREAM).toBe(
      'http://127.0.0.1:3201',
    )

    expect(production.outputDir).toBe(
      path.join(
        isolatedRunRoot,
        'production-web-plus-mocked-api',
        'output',
      ),
    )
    expect(patternStrings(production.testMatch)).toEqual([
      String(/[\\/]mocked[\\/]final-visual-tour\.mocked\.spec\.ts$/),
      String(/[\\/]mocked[\\/]large-list-pagination\.mocked\.spec\.ts$/),
    ])

    const productionServers = production.webServer
    expect(Array.isArray(productionServers)).toBe(true)
    if (!Array.isArray(productionServers)) return

    expect(productionServers).toHaveLength(2)
    expect(
      productionServers.every((server) => server.reuseExistingServer === false),
    ).toBe(true)
    expect(productionServers[0]?.command).toContain(
      'project-work-preview-server.mjs',
    )
    expect(productionServers[1]?.command).toContain('next start')
    expect(productionServers[1]?.command).not.toContain('build')
    expect(productionServers[1]?.env?.NEXT_PUBLIC_API_URL).toBe(
      'http://127.0.0.1:3201',
    )

    for (const config of [root, mocked]) {
      const servers = config.webServer
      expect(Array.isArray(servers)).toBe(true)
      if (!Array.isArray(servers)) continue
      expect(servers.every((server) => server.reuseExistingServer === false)).toBe(
        true,
      )
    }
  })
})
