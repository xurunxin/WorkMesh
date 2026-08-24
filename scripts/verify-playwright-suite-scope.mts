import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const SUITE_SCOPE_SCHEMA_VERSION = 1 as const

type GateStatus = 'pass' | 'blocked'
type TopologyId = 'root-mixed' | 'mocked-dev' | 'production-web-plus-mocked-api'

type CommandResult = Readonly<{
  ok: boolean
  exitCode: number | null
  stdout: string
  durationMs: number
}>

export type PlaywrightList = Readonly<{
  tests: number
  files: number
  specs: string[]
}>

type SuiteAssertion = Readonly<{
  name: string
  status: GateStatus
  expected: string[]
  actual: string[]
}>

type TopologyResult = Readonly<{
  id: TopologyId
  label: string
  config: string
  command: string[]
  status: GateStatus
  exitCode: number | null
  durationMs: number
  collected: PlaywrightList
  assertions: SuiteAssertion[]
}>

export type PlaywrightSuiteScopeResult = Readonly<{
  schemaVersion: typeof SUITE_SCOPE_SCHEMA_VERSION
  kind: 'workmesh.playwright-suite-scope'
  generatedAt: string
  repositoryRoot: string
  status: GateStatus
  topologies: TopologyResult[]
  blockers: string[]
}>

type CliArguments = Readonly<{
  help: boolean
  output: string | null
}>

const HELP = `Usage: pnpm exec tsx scripts/verify-playwright-suite-scope.mts --output <file>

Lists the root mixed, mocked-development, and production-Web-plus-mocked-API Playwright suites.
The command writes their exact collected files/tests and exits non-zero when suite ownership overlaps.
`

export const parseSuiteScopeArguments = (values: readonly string[]): CliArguments => {
  let help = false
  let output: string | null = null
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--help' || value === '-h') {
      help = true
      continue
    }
    if (value === '--output') {
      const next = values[index + 1]
      if (!next || next.startsWith('--')) throw new Error('--output requires a file path')
      output = next
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${value ?? '(missing)'}`)
  }
  if (!help && !output) throw new Error('--output is required')
  return { help, output }
}

export const normalizePlaywrightSpecPath = (value: string): string => {
  const normalized = value.trim().replaceAll('\\', '/')
  const e2eMarker = normalized.lastIndexOf('/e2e/')
  if (e2eMarker >= 0) return normalized.slice(e2eMarker + '/e2e/'.length)
  return normalized.replace(/^\.\//, '').replace(/^apps\/web\/e2e\//, '').replace(/^e2e\//, '')
}

export const parsePlaywrightList = (output: string): PlaywrightList => {
  const specs: string[] = []
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/(?:^|\s›\s)([^›]*?\.spec\.tsx?):\d+:\d+\s+›/)
    if (match?.[1]) specs.push(normalizePlaywrightSpecPath(match[1]))
  }
  const uniqueSpecs = [...new Set(specs)].sort((left, right) => left.localeCompare(right))
  const totalMatch = output.match(/Total:\s+(\d+)\s+tests?\s+in\s+(\d+)\s+files?/i)
  return {
    tests: totalMatch ? Number(totalMatch[1]) : specs.length,
    files: totalMatch ? Number(totalMatch[2]) : uniqueSpecs.length,
    specs: uniqueSpecs,
  }
}

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((entry, index) => entry === right[index])

const sorted = (values: readonly string[]): string[] =>
  [...values].sort((left, right) => left.localeCompare(right))

export const evaluateSuiteAssertions = (
  topology: TopologyId,
  list: PlaywrightList,
  declaredMockedSpecs: readonly string[],
): SuiteAssertion[] => {
  if (topology === 'root-mixed') {
    const accidentalMockedSpecs = list.specs.filter(spec =>
      spec.startsWith('mocked/') || spec.endsWith('.mocked.spec.ts'),
    )
    return [{
      name: 'root-excludes-mocked-specs',
      status: accidentalMockedSpecs.length === 0 && list.tests > 0 ? 'pass' : 'blocked',
      expected: [],
      actual: accidentalMockedSpecs,
    }]
  }

  const expected = topology === 'mocked-dev'
    ? sorted([...declaredMockedSpecs, 'human-reflow.spec.ts'])
    : sorted([
      'mocked/final-visual-tour.mocked.spec.ts',
      'mocked/large-list-pagination.mocked.spec.ts',
    ])
  const actual = sorted(list.specs)
  return [{
    name: topology === 'mocked-dev'
      ? 'mocked-dev-collects-declared-mocked-plus-human-reflow'
      : 'production-collects-only-final-runtime-cases',
    status: list.tests > 0 && sameStrings(actual, expected) ? 'pass' : 'blocked',
    expected,
    actual,
  }]
}

const runCommand = async (
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number }>,
): Promise<CommandResult> => new Promise(resolve => {
  const startedAt = Date.now()
  execFile(
    command,
    [...args],
    {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs ?? 120_000,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
    (error, stdout) => {
      const exitCode = typeof error?.code === 'number' ? error.code : error ? 1 : 0
      resolve({
        ok: error === null,
        exitCode,
        stdout,
        durationMs: Date.now() - startedAt,
      })
    },
  )
})

const listWithPlaywright = async (input: Readonly<{
  repositoryRoot: string
  cwd: string
  config: string
  runDirectory: string
}>): Promise<CommandResult> => {
  let playwrightCli: string
  try {
    const workspaceRequire = createRequire(path.join(input.repositoryRoot, 'package.json'))
    playwrightCli = workspaceRequire.resolve('@playwright/test/cli')
  } catch {
    return { ok: false, exitCode: null, stdout: '', durationMs: 0 }
  }
  return runCommand(
    process.execPath,
    [playwrightCli, 'test', '--config', input.config, '--list'],
    {
      cwd: input.cwd,
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://scope:scope@127.0.0.1:5432/workmesh_suite_scope_test',
        RUN_INTEGRATION: process.env.RUN_INTEGRATION ?? '1',
        WORKMESH_BOOTSTRAP_TOKEN: process.env.WORKMESH_BOOTSTRAP_TOKEN ?? 'suite-scope-list-only',
        WORKMESH_PLAYWRIGHT_RUN_DIR: input.runDirectory,
      },
    },
  )
}

const declaredMockedSpecs = async (repositoryRoot: string): Promise<string[]> => {
  const directory = path.join(repositoryRoot, 'apps', 'web', 'e2e', 'mocked')
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.mocked.spec.ts'))
    .map(entry => `mocked/${entry.name}`)
    .sort((left, right) => left.localeCompare(right))
}

export const runPlaywrightSuiteScope = async (
  repositoryRoot: string,
  now = new Date(),
): Promise<PlaywrightSuiteScopeResult> => {
  const temporaryRunDirectory = await mkdtemp(path.join(os.tmpdir(), 'workmesh-web-ui-final-suite-scope-'))
  const mockedSpecs = await declaredMockedSpecs(repositoryRoot)
  const definitions: Array<Readonly<{
    id: TopologyId
    label: string
    cwd: string
    config: string
    configPath: string
  }>> = [
    {
      id: 'root-mixed',
      label: 'root mixed topology',
      cwd: repositoryRoot,
      config: 'playwright.config.ts',
      configPath: 'playwright.config.ts',
    },
    {
      id: 'mocked-dev',
      label: 'mocked development topology',
      cwd: path.join(repositoryRoot, 'apps', 'web'),
      config: 'playwright.mocked.config.ts',
      configPath: 'apps/web/playwright.mocked.config.ts',
    },
    {
      id: 'production-web-plus-mocked-api',
      label: 'production Web plus mocked API topology',
      cwd: path.join(repositoryRoot, 'apps', 'web'),
      config: 'playwright.production.config.ts',
      configPath: 'apps/web/playwright.production.config.ts',
    },
  ]

  const topologies: TopologyResult[] = []
  try {
    for (const definition of definitions) {
      const topologyRunDirectory = path.join(temporaryRunDirectory, definition.id)
      await mkdir(topologyRunDirectory, { recursive: true })
      const command = ['pnpm', 'exec', 'playwright', 'test', '--config', definition.config, '--list']
      const result = await listWithPlaywright({
        repositoryRoot,
        cwd: definition.cwd,
        config: definition.config,
        runDirectory: topologyRunDirectory,
      })
      const collected = parsePlaywrightList(result.stdout)
      const assertions = evaluateSuiteAssertions(definition.id, collected, mockedSpecs)
      topologies.push({
        id: definition.id,
        label: definition.label,
        config: definition.configPath,
        command,
        status: result.ok && assertions.every(assertion => assertion.status === 'pass') ? 'pass' : 'blocked',
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        collected,
        assertions,
      })
    }
  } finally {
    await rm(temporaryRunDirectory, { recursive: true, force: true })
  }

  const blockers: string[] = []
  for (const topology of topologies) {
    if (topology.exitCode !== 0) blockers.push(`${topology.id.toUpperCase().replaceAll('-', '_')}_LIST_FAILED`)
    for (const assertion of topology.assertions) {
      if (assertion.status === 'blocked') blockers.push(assertion.name.toUpperCase().replaceAll('-', '_'))
    }
  }

  return {
    schemaVersion: SUITE_SCOPE_SCHEMA_VERSION,
    kind: 'workmesh.playwright-suite-scope',
    generatedAt: now.toISOString(),
    repositoryRoot,
    status: blockers.length === 0 ? 'pass' : 'blocked',
    topologies,
    blockers,
  }
}

const isDirectExecution = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false

if (isDirectExecution) {
  const args = parseSuiteScopeArguments(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
  } else {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const output = path.resolve(args.output as string)
    const result = await runPlaywrightSuiteScope(repositoryRoot)
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    process.stdout.write(`Playwright suite scope ${result.status}; result written to ${output}\n`)
    if (result.status !== 'pass') process.exitCode = 1
  }
}
