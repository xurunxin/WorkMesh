import { appendFileSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { testConsumers } from './ci-test-inputs.mjs'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const checkIds = ['source-gates', 'db-integration', 'api-integration', 'worker-integration', 'e2e', 'recovery-integration', 'agent-smoke']

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
  require(integrationConfig.includes("include: ['src/mcp-coverage.conformance.test.ts']") && integrationConfig.includes('passWithNoTests: false') && integrationConfig.includes('fileParallelism: false'), 'Real conformance must be explicit, nonempty and serial')
  require(unitConfig.includes('**/mcp-coverage.conformance.test.ts'), 'Real conformance must be excluded from memory units')
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
  const checks = {
    'source-gates': full || runtime.length > 0,
    'db-integration': full || has('db'),
    // API integration imports worker implementations directly in its fixtures.
    'api-integration': full || ['api', 'worker', 'mcp', 'agent-sdk', 'agent-runner', 'conformance'].some(has),
    'worker-integration': full || has('worker'),
    // E2E imports worker + fake-agent directly, outside web's package manifest.
    e2e: full || ['web', 'api', 'worker', 'fake-agent', 'agent-sdk', 'mcp', 'agent-runner'].some(has),
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
