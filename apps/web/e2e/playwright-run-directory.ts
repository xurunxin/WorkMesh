import path from 'node:path'

export type PlaywrightTopology =
  | 'root-mixed'
  | 'mocked-dev'
  | 'production-web-plus-mocked-api'

export type PlaywrightRunPaths = Readonly<{
  isolated: boolean
  runRoot: string | null
  topologyRoot: string
  authDirectory: string
  authenticatedStatePath: string
  outputDirectory: string
  htmlReportDirectory: string
}>

export const resolvePlaywrightRunPaths = (
  topology: PlaywrightTopology,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  workingDirectory = process.cwd(),
): PlaywrightRunPaths => {
  const configuredRoot = environment.WORKMESH_PLAYWRIGHT_RUN_DIR?.trim()
  if (configuredRoot && !path.isAbsolute(configuredRoot)) {
    throw new Error('WORKMESH_PLAYWRIGHT_RUN_DIR must be an absolute path')
  }

  const isolated = Boolean(configuredRoot)
  const runRoot = configuredRoot ? path.normalize(configuredRoot) : null
  const topologyRoot = runRoot
    ? path.join(runRoot, topology)
    : path.resolve(workingDirectory)
  const outputDirectory = runRoot
    ? path.join(topologyRoot, 'output')
    : path.join(topologyRoot, 'test-results')
  const authDirectory = runRoot
    ? path.join(topologyRoot, '.auth')
    : path.join(outputDirectory, '.auth')

  return {
    isolated,
    runRoot,
    topologyRoot,
    authDirectory,
    authenticatedStatePath: path.join(authDirectory, 'admin.json'),
    outputDirectory,
    htmlReportDirectory: runRoot
      ? path.join(topologyRoot, 'html-report')
      : path.join(topologyRoot, 'playwright-report'),
  }
}
