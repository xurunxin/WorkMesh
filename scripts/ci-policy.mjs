import { appendFileSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { testConsumers } from './ci-test-inputs.mjs'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const checkIds = ['source-gates', 'db-integration', 'api-integration', 'worker-integration', 'recovery-integration', 'agent-smoke', 'connector-platform', 'connector-install', 'server-build', 'server-install']

export function validateServerInstallEntrypoint(job, build) {
  const failures = []
  if (job?.env?.PYTHONDONTWRITEBYTECODE !== '1' || build?.env?.PYTHONDONTWRITEBYTECODE !== '1')
    failures.push('server-install Python checks must not dirty the committed source with bytecode')
  const architectures = [{ arch: 'amd64', runner: 'ubuntu-24.04' }, { arch: 'arm64', runner: 'ubuntu-24.04-arm' }]
  const profileMatrix = '${{ fromJSON(github.event_name == \'workflow_dispatch\' && inputs.native-diagnostic == true && \'["team"]\' || \'["personal","team","enterprise"]\') }}'
  if (JSON.stringify(build?.strategy?.matrix) !== JSON.stringify({ include: architectures })
    || JSON.stringify(job?.strategy?.matrix) !== JSON.stringify({ arch: ['amd64', 'arm64'], profile: profileMatrix, include: architectures })
    || [job, build].some(value => value?.['runs-on'] !== '${{ matrix.runner }}'
      || value?.strategy?.['fail-fast'] !== false || value?.['continue-on-error']))
    failures.push('server delivery must build both architectures and require all six ordinary configuration guests')
  if (JSON.stringify(job?.needs) !== JSON.stringify(['changes', 'server-build'])
    || job?.if !== '${{ needs.changes.outputs.server-install == \'true\' }}'
    || build?.if !== '${{ needs.changes.outputs.server-build == \'true\' }}')
    failures.push('server guests must depend on successful selected candidate producers')
  const requireCommand = (owner, command) => {
    const steps = owner?.steps?.filter(step => step.run?.includes(command)) ?? []
    if (steps.length !== 1 || steps[0].if || steps[0]['continue-on-error']
      || !steps[0].run.includes('set -euo pipefail') || steps[0].run.includes('|| true'))
      failures.push(`server delivery must execute ${command} without skipping or masking failure`)
  }
  for (const command of ['node --test scripts/server-distribution/install.test.mjs',
    'python3 scripts/server-distribution/native_diagnostic_test.py', 'node scripts/server-distribution/build.mjs --arch'])
    requireCommand(build, command)
  for (const command of ['python3 scripts/server-distribution/run.py --arch',
    'printf \'%s\' "$CANDIDATE_ID"', 'sha256sum --check']) requireCommand(job, command)
  const candidate = build?.steps?.find(step => step.id === 'candidate')
  const download = job?.steps?.find(step => step.name === 'Download immutable architecture candidate')
  const binding = build?.steps?.find(step => step.id === 'binding')?.run ?? ''
  if (candidate?.uses !== 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'
    || candidate?.with?.path !== '.tmp/server-distribution' || candidate?.with?.['if-no-files-found'] !== 'error'
    || candidate?.with?.overwrite || !binding.includes('steps.candidate.outputs.artifact-id')
    || !binding.includes('sha256sum .tmp/server-distribution/manifest.json')
    || download?.uses !== 'actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0'
    || download?.with?.['artifact-ids'] !== '${{ env.CANDIDATE_ID }}' || download?.with?.['merge-multiple'] !== true
    || download?.with?.path !== '.tmp/server-distribution' || download?.if || download?.['continue-on-error'])
    failures.push('server guests must reuse the immutable producer artifact ID and independently bound manifest digest')
  for (const arch of ['amd64', 'arm64']) {
    for (const kind of ['candidate', 'digest']) {
      if (build?.outputs?.[`${kind}-${arch}`] !== '${{ steps.binding.outputs.' + kind + '-' + arch + ' }}')
        failures.push('each producer architecture needs a distinct artifact/digest output')
    }
  }
  for (const [key, kind] of [['CANDIDATE_ID', 'candidate'], ['CANDIDATE_SHA', 'digest']]) {
    const expected = '${{ matrix.arch == \'amd64\' && needs.server-build.outputs.' + kind + '-amd64 || needs.server-build.outputs.' + kind + '-arm64 }}'
    if (job?.env?.[key] !== expected) failures.push('server handoff must select the matching architecture producer')
  }
  const guest = job?.steps?.find(step => step.name === 'Execute installed configuration in full guest')?.run ?? ''
  if (!guest.includes("--profile '${{ matrix.profile }}'") || !guest.includes('--native-diagnostic')
    || guest.split("--profile '${{ matrix.profile }}'").length !== 3 || guest.split('--profile').length !== 3
    || !guest.includes("if test '${{ github.event_name }}' = workflow_dispatch && test '${{ inputs.native-diagnostic }}' = true; then"))
    failures.push('native diagnosis must require explicit manual dispatch; normal CI must retain full acceptance')
  const handoffOrder = ['Validate immutable producer handoff', 'Download immutable architecture candidate',
    'Verify producer manifest digest', 'Execute installed configuration in full guest']
    .map(name => job?.steps?.findIndex(step => step.name === name) ?? -1)
  if (handoffOrder.some((index, ordinal) => index < 0 || (ordinal > 0 && index <= handoffOrder[ordinal - 1])))
    failures.push('producer identity and manifest verification must precede guest execution')
  return failures
}

export function validateConnectorInstallEntrypoint(job) {
  const failures = []
  const expected = [{ arch: 'amd64', runner: 'ubuntu-24.04' }, { arch: 'arm64', runner: 'ubuntu-24.04-arm' }]
  if (JSON.stringify(job?.strategy?.matrix?.include) !== JSON.stringify(expected)
    || job?.['runs-on'] !== '${{ matrix.runner }}' || job?.strategy?.['fail-fast'] !== false)
    failures.push('connector-install must retain both native hosted architectures')
  for (const command of ['pnpm --filter @workmesh/connector build:release -- --output',
    'pnpm --filter @workmesh/connector test:install', 'node scripts/verify-connector-install.mjs --artifacts']) {
    const steps = job?.steps?.filter(step => step.run?.includes(command)) ?? []
    if (steps.length !== 1 || steps[0].if || steps[0]['continue-on-error']
      || !/set -(?:o pipefail|euo pipefail)/.test(steps[0].run) || steps[0].run.includes('|| true'))
      failures.push(`connector-install must execute ${command} without skipping or masking failure`)
  }
  return failures
}

export function validateCiBootstrap({ job, manifest, lock, yamlVersion }) {
  const failures = []
  const require = (value, message) => { if (!value) failures.push(message) }
  const steps = job?.steps ?? []
  const index = steps.findIndex(step => step.name === 'Validate selection and required-result safety')
  const step = steps[index]
  const lines = step?.run?.split(/\r?\n/).map(line => line.trim()) ?? []
  const install = 'npm ci --prefix scripts/ci-bootstrap --ignore-scripts --no-audit --no-fund 2>&1 | tee ci-logs/ci-bootstrap.log'
  const test = 'node --test scripts/ci-policy.test.mjs 2>&1 | tee ci-logs/ci-policy.log'
  require(lines.includes(install) && lines.includes(test) && lines.indexOf(install) < lines.indexOf(test), 'Classification must install locked YAML before policy tests')
  require(lines.includes('node scripts/check-integration-docs.mjs 2>&1 | tee ci-logs/integration-docs.log'), 'Classification must check integration documentation before selecting jobs')
  require(lines.includes('set -o pipefail') && !step?.['continue-on-error'] && !step?.if, 'Bootstrap and policy failures must propagate unconditionally')
  const nodeIndex = steps.findIndex(step => step.uses?.startsWith('actions/setup-node@') && step.with?.['node-version-file'] === '.node-version')
  require(nodeIndex >= 0 && index > nodeIndex && steps.findIndex(step => step.id === 'scope') > index, 'Bootstrap must follow Node setup and precede classification')
  require(steps.some(step => step.if === '${{ always() }}' && step.uses?.startsWith('actions/upload-artifact@') && step.with?.path === 'ci-logs'), 'Bootstrap evidence must be always uploaded')
  require(manifest.private === true && JSON.stringify(manifest.dependencies) === JSON.stringify({ yaml: yamlVersion }) && !manifest.devDependencies && !manifest.scripts && !manifest.workspaces, 'Bootstrap must contain only the exact workspace YAML parser')
  require(lock.lockfileVersion === 3 && Object.keys(lock.packages ?? {}).sort().join(',') === ',node_modules/yaml', 'Bootstrap lock must contain exactly one dependency')
  const dependency = lock.packages?.['node_modules/yaml']
  require(lock.packages?.['']?.dependencies?.yaml === yamlVersion && dependency?.version === yamlVersion && dependency?.resolved === `https://registry.npmjs.org/yaml/-/yaml-${yamlVersion}.tgz` && /^sha512-[A-Za-z0-9+/]+=*$/.test(dependency?.integrity ?? ''), 'Bootstrap YAML must be versioned and integrity locked')
  return failures
}

export function validateMcpConformanceEntrypoints({ job, rootScripts, packageScripts, integrationConfig, unitConfig }) {
  const failures = []
  const require = (value, message) => { if (!value) failures.push(message) }
  const steps = job?.steps ?? []
  const index = steps.findIndex(step => step.name === 'Run real MCP and Pi conformance')
  const step = steps[index]
  require(step?.run?.includes('pnpm test:conformance:integration'), 'Required API job must execute real MCP conformance')
  require(step?.run?.includes('set -o pipefail') && !step?.['continue-on-error'], 'MCP conformance failures must propagate')
  require(index > steps.findIndex(step => step.run?.includes('pnpm test:integration:api')), 'MCP services must run after API integration')
  require(step?.run?.includes('ci-logs/mcp-coverage/conformance.log'), 'MCP evidence must be saved')
  require(steps.some(step => step.if?.includes('always()') && step.with?.path === 'ci-logs' && step.uses?.startsWith('actions/upload-artifact@')), 'MCP evidence must be always uploaded')
  require(rootScripts['test:integration']?.includes('pnpm test:conformance:integration'), 'Root integration must run real conformance')
  require(rootScripts['test:conformance:integration'] === 'node scripts/require-integration-env.mjs && pnpm --filter @workmesh/db test:reset && pnpm --filter @workmesh/conformance test:integration', 'MCP fixture must be checked and reset before execution')
  require(packageScripts['test:integration'] === 'vitest run --config vitest.integration.config.ts', 'Real conformance must use its dedicated config')
  require(integrationConfig.includes("'src/mcp-coverage.conformance.test.ts'") && integrationConfig.includes("'src/execution-recovery.conformance.test.ts'") && integrationConfig.includes("'src/planning-collaboration.conformance.test.ts'") && integrationConfig.includes("'src/delivery-recovery.conformance.test.ts'") && integrationConfig.includes('passWithNoTests: false') && integrationConfig.includes('fileParallelism: false'), 'Real conformance must be explicit, nonempty and serial')
  require(unitConfig.includes('**/mcp-coverage.conformance.test.ts') && unitConfig.includes('**/execution-recovery.conformance.test.ts') && unitConfig.includes('**/planning-collaboration.conformance.test.ts') && unitConfig.includes('**/delivery-recovery.conformance.test.ts'), 'Real conformance must be excluded from memory units')
  require(integrationConfig.includes("'src/joint-clients.conformance.test.ts'") && unitConfig.includes('**/joint-clients.conformance.test.ts'), 'Joint client conformance must run in integration, excluded from units')
  require(integrationConfig.includes("'src/optional-domains.conformance.test.ts'") && unitConfig.includes('**/optional-domains.conformance.test.ts'), 'Optional domain conformance must run in integration, excluded from units')
  require(rootScripts['test:acceptance:m4'] === 'node scripts/require-integration-env.mjs && pnpm --filter @workmesh/conformance acceptance:optional'
    && packageScripts['acceptance:optional'] === 'tsx src/optional-domains.acceptance.ts', 'M4 native acceptance must retain its explicit required local entry')
  require(!integrationConfig.includes('optional-domains.acceptance') && !step?.run?.includes('test:acceptance:m4'), 'M4 native acceptance must remain separate from Required API CI')
  return failures
}

export function readWorkspaces(directory = root) {
  return ['apps', 'packages'].flatMap(parent => readdirSync(resolve(directory, parent), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(entry => {
      const path = `${parent}/${entry.name}`
      let manifest
      try { manifest = JSON.parse(readFileSync(resolve(directory, path, 'package.json'), 'utf8')) }
      catch (error) { if (error.code === 'ENOENT') return []; throw error }
      if (!/^@workmesh\/[a-z0-9-]+$/.test(manifest.name)) throw new Error(`Unexpected workspace: ${path}`)
      return [{ name: manifest.name, path, scripts: manifest.scripts ?? {}, dependencies: Object.keys({
        ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies,
      }).filter(name => name.startsWith('@workmesh/')) }]
    }))
}

// Only known prose paths are cheap. Runtime Skills, API/SQL contracts, generated
// policy tables and unknown paths must not acquire a documentation exemption.
export function isProse(path) {
  if (['docs/route-policy-matrix.md', 'docs/VERSION_POLICY.md', 'docs/V1_RELEASE_POLICY.md',
    'docs/releases/v1.0.0.md', 'docs/operations/releases.md',
    'docs/plans/agent-first-coordination-mcp.md', 'docs/adr/0043-agent-connection-and-coordination-mcp.md'].includes(path)) return false
  return /^docs\/.*\.md$/.test(path) || /^(README|AGENTS|CONTRIBUTING|CHANGELOG|LICENSE)(\.md)?$/.test(path)
}

export function classifyChanges(paths, workspaces, { forceFull = false, mainPush = false } = {}) {
  const runtime = paths.filter(path => !isProse(path))
  const direct = new Set(runtime.map(path => workspaces.find(workspace => path.startsWith(`${workspace.path}/`))?.name))
  const full = forceFull || paths.length === 0 || (mainPush && runtime.length > 0) || direct.has(undefined)
  const affected = new Set(full ? workspaces.map(workspace => workspace.name) : direct)
  // Test consumers too: an upstream contract change can break an unchanged app.
  let changed = true
  while (changed) {
    changed = false
    for (const workspace of workspaces) {
      if (!affected.has(workspace.name) && workspace.dependencies.some(name => affected.has(name))) {
        affected.add(workspace.name); changed = true
      }
    }
  }
  const has = name => affected.has(`@workmesh/${name}`)
  const serverDelivery = full || ['api', 'worker', 'mcp', 'contracts', 'db', 'config', 'recovery', 'artifact-storage'].some(has)
  const checks = {
    'source-gates': full || runtime.length > 0,
    'connector-platform': full || has('connector'),
    'connector-install': full || ['connector', 'api', 'mcp', 'contracts', 'db', 'config', 'agent-sdk'].some(has),
    'server-build': serverDelivery,
    'server-install': serverDelivery,
    'db-integration': full || has('db'),
    // API integration imports worker implementations directly in its fixtures.
    'api-integration': full || ['api', 'worker', 'fake-agent', 'mcp', 'agent-sdk', 'agent-runner', 'conformance'].some(has),
    'worker-integration': full || has('worker'),
    // Restored production images must also be checked when their consumers change.
    'recovery-integration': full || ['recovery', 'db', 'artifact-storage', 'config', 'api', 'worker'].some(has),
    'agent-smoke': full || ['agent-sdk', 'mcp', 'fake-agent', 'conformance'].some(has),
  }
  const testPackages = new Set([...affected, ...testConsumers(runtime)])
  return { mode: full ? 'full' : runtime.length ? 'affected' : 'docs', packages: [...affected].sort(), testPackages: [...testPackages].sort(), checks }
}

export function evaluateResults(plan, needs) {
  if (!plan || !['full', 'affected', 'docs'].includes(plan.mode) || !plan.checks) throw new Error('Missing or invalid CI plan')
  const expected = ['changes', ...checkIds]
  if (Object.keys(needs).length !== expected.length || expected.some(id => !needs[id])) throw new Error('Incomplete CI results')
  const failures = []
  if (needs.changes.result !== 'success') failures.push(`changes=${needs.changes.result}`)
  for (const id of checkIds) {
    if (typeof plan.checks[id] !== 'boolean') throw new Error(`Invalid CI decision for ${id}`)
    const expectedResult = plan.checks[id] ? 'success' : 'skipped'
    if (needs[id].result !== expectedResult) failures.push(`${id}=${needs[id].result} (expected ${expectedResult})`)
  }
  return failures
}

export function planForEvent(eventName, event, workspaces, git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' })) {
  // Reusable CI from a candidate tag, manual dispatch, and scheduled runs are
  // always full. They must never inherit a PR's reduced acceptance scope.
  const pr = eventName === 'pull_request'
  const mainPush = eventName === 'push' && event.ref === 'refs/heads/main'
  if (!pr && !mainPush) return classifyChanges([], workspaces, { forceFull: true })
  const base = pr ? event.pull_request?.base?.sha : event.before
  const head = pr ? event.pull_request?.head?.sha : event.after
  if (![base, head].every(sha => /^[a-f0-9]{40}$/i.test(sha ?? '') && !/^0+$/.test(sha))) {
    return classifyChanges([], workspaces, { forceFull: true })
  }
  let comparisonBase, paths
  try {
    comparisonBase = pr ? git(['merge-base', base, head]).trim() : base
    paths = git(['diff', '--no-renames', '--name-only', '-z', comparisonBase, head]).split('\0').filter(Boolean)
  } catch {
    // Missing history is uncertainty, never permission to skip acceptance.
    return classifyChanges([], workspaces, { forceFull: true })
  }
  // Check the actual PR/push range, not an unchanged checkout's working tree.
  // A formatting failure is a failed gate, never a reason to fall back to full.
  git(['diff', '--check', comparisonBase, head])
  return classifyChanges(paths, workspaces, { mainPush })
}

export function validateDevelopmentImageEntrypoint(job) {
  const command = 'python3 scripts/validate-development-images.py'
  const steps = job?.steps?.filter(step => step.run?.trim() === command) ?? []
  if (steps.length !== 1 || steps[0].if !== undefined || steps[0]['continue-on-error'])
    return ['source-gates必须实际构建三个后端开发镜像，不得省略、条件跳过或忽略失败']
  return []
}

export function validateBackendLiteEntrypoint(job) {
  const expected = 'set -o pipefail\nnode scripts/verify-a2-backend-lite.mjs 2>&1 | tee ci-logs/backend-lite-deployment.log\npnpm validate:production-images 2>&1 | tee ci-logs/backend-production-deployment.log'
  const steps = job?.steps?.filter(step => step.run?.trim() === expected) ?? []
  if (steps.length !== 1 || steps[0].if !== undefined || steps[0]['continue-on-error']
    || steps[0].env?.WORKMESH_VALIDATION_OUTPUT !== 'ci-logs/backend-deployment')
    return ['source-gates必须执行无源码 Lite/生产、TLS、真实 worker 和签名 Skill 验收，不得跳过或吞掉失败']
  return []
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'aggregate') {
    const needs = JSON.parse(process.env.NEEDS_JSON)
    const plan = JSON.parse(needs.changes?.outputs?.plan ?? 'null')
    const failures = evaluateResults(plan, needs)
    for (const [id, value] of Object.entries(needs)) console.log(`${id}: ${value.result}`)
    if (failures.length) throw new Error(`Required CI failed: ${failures.join(', ')}`)
  } else {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const plan = planForEvent(process.env.GITHUB_EVENT_NAME, event, readWorkspaces())
    const outputs = { mode: plan.mode, packages: JSON.stringify(plan.packages), 'test-packages': JSON.stringify(plan.testPackages), plan: JSON.stringify(plan), ...plan.checks }
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''))
    console.log(JSON.stringify(plan, null, 2))
  }
}
