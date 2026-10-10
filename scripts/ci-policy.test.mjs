import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkIds, classifyChanges, evaluateResults, planForEvent, readWorkspaces, validateCiBootstrap, validateMcpConformanceEntrypoints } from './ci-policy.mjs'
import { readFileSync } from 'node:fs'
import { parse } from './ci-bootstrap/yaml.mjs'

const workspaces = readWorkspaces()
const classify = (paths, options) => classifyChanges(paths, workspaces, options)
const results = plan => Object.fromEntries(['changes', ...checkIds].map(id => [id, { result: id === 'changes' || plan.checks[id] ? 'success' : 'skipped' }]))

test('classification bootstrap locks only YAML and cannot bypass policy or evidence', () => {
  const input = {
    job: parse(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')).jobs.changes,
    manifest: JSON.parse(readFileSync(new URL('./ci-bootstrap/package.json', import.meta.url), 'utf8')),
    lock: JSON.parse(readFileSync(new URL('./ci-bootstrap/package-lock.json', import.meta.url), 'utf8')),
    yamlVersion: parse(readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8')).importers['.'].devDependencies.yaml.version,
  }
  assert.deepEqual(validateCiBootstrap(input), [])
  for (const mutate of [
    value => { value.job.steps.find(step => step.name === 'Validate selection and required-result safety').run = 'node --test scripts/ci-policy.test.mjs' },
    value => { value.job.steps.find(step => step.name === 'Validate selection and required-result safety').run = value.job.steps.find(step => step.name === 'Validate selection and required-result safety').run.replace('set -o pipefail', '') },
    value => { value.job.steps.find(step => step.name === 'Validate selection and required-result safety')['continue-on-error'] = true },
    value => { value.job.steps.find(step => step.name === 'Validate selection and required-result safety').if = 'false' },
    value => { value.job.steps = value.job.steps.filter(step => step.name !== 'Set up exact Node') },
    value => { value.job.steps = value.job.steps.filter(step => step.id !== 'scope') },
    value => { value.job.steps = value.job.steps.filter(step => !step.uses?.startsWith('actions/upload-artifact@')) },
    value => { value.manifest.dependencies.yaml = '^2.9.0' },
    value => { value.lock.packages['node_modules/yaml'].integrity = '' },
    value => { value.lock.packages['node_modules/extra'] = { version: '1.0.0' } },
  ]) {
    const candidate = structuredClone(input)
    mutate(candidate)
    assert.ok(validateCiBootstrap(candidate).length > 0)
  }
})

test('YAML semantics preserve flow maps, aliases and literal command bodies', () => {
  const document = parse('run: &command |\n  set -o pipefail\n  echo "# literal: yes"\nsteps: [{run: *command, continue-on-error: false}]\n')
  assert.equal(document.steps[0].run, 'set -o pipefail\necho "# literal: yes"\n')
  assert.equal(document.steps[0]['continue-on-error'], false)
  assert.throws(() => parse('steps: []\nsteps: []\n'), /unique/)
})

test('known prose on PR and main avoids every install/service/test job', () => {
  for (const options of [{}, { mainPush: true }]) {
    const plan = classify(['docs/adr/0078-review.md', 'docs/plan/design.md', 'README.md', 'AGENTS.md'], options)
    assert.equal(plan.mode, 'docs')
    assert.deepEqual(plan.packages, [])
    assert.ok(Object.values(plan.checks).every(value => value === false))
    assert.deepEqual(evaluateResults(plan, results(plan)), [])
  }
})

test('UI changes test web consumers and E2E, but skip unrelated backend/protocol/recovery jobs', () => {
  const plan = classify(['packages/ui/src/button.tsx'])
  assert.deepEqual(plan.packages, ['@workmesh/ui', '@workmesh/web'])
  assert.deepEqual(Object.entries(plan.checks).filter(([, enabled]) => enabled).map(([id]) => id), ['source-gates', 'e2e'])
})

test('direct web tests, assets and package-local skills are runtime changes', () => {
  for (const path of ['apps/web/e2e/example.spec.ts', 'apps/web/public/icon.svg', 'apps/agent-runner/skills/workmesh-workbench/SKILL.md']) {
    const plan = classify([path])
    assert.equal(plan.mode, 'affected')
    assert.equal(plan.checks['source-gates'], true)
    assert.equal(plan.checks.e2e, true)
  }
})

test('API and worker changes retain destructive recovery and real browser integration', () => {
  for (const name of ['api', 'worker']) {
    const plan = classify([`apps/${name}/src/index.ts`])
    assert.equal(plan.checks[`${name}-integration`], true)
    assert.equal(plan.checks['recovery-integration'], true)
    assert.equal(plan.checks.e2e, true)
    assert.equal(plan.checks['api-integration'], true)
  }
})

test('cross-workspace lock audits are selected without inventing runtime dependency cycles', () => {
  for (const name of ['api', 'worker']) {
    const plan = classify([`apps/${name}/src/agent/commands.ts`])
    const consumers = name === 'api' ? ['@workmesh/conformance'] : []
    assert.deepEqual(plan.packages, [`@workmesh/${name}`, ...consumers].sort())
    assert.deepEqual(plan.testPackages, [`@workmesh/${name}`, '@workmesh/db', ...consumers].sort())
    assert.equal(plan.checks['db-integration'], false)
    assert.equal(plan.checks['worker-integration'], name === 'worker')
  }
  assert.deepEqual(classify(['apps/web/app/page.tsx']).testPackages, ['@workmesh/web'])
  assert.deepEqual(classify(['README.md']).testPackages, [])
})

test('upstream contracts/domain/db/config changes include transitive consumers', () => {
  for (const name of ['contracts', 'domain', 'db', 'config']) {
    const plan = classify([`packages/${name}/src/index.ts`])
    assert.ok(plan.packages.includes('@workmesh/api'))
    assert.ok(plan.packages.includes('@workmesh/worker'))
    assert.equal(plan.checks['api-integration'], true)
    assert.equal(plan.checks['worker-integration'], true)
    assert.equal(plan.checks['recovery-integration'], true)
  }
  const plan = classify(['packages/contracts/src/index.ts'])
  assert.ok(Object.values(plan.checks).every(Boolean))
})

test('protocol changes retain SDK consumers, conformance and direct E2E imports', () => {
  const plan = classify(['packages/agent-sdk/src/index.ts'])
  for (const name of ['agent-sdk', 'mcp', 'fake-agent', 'conformance']) assert.ok(plan.packages.includes(`@workmesh/${name}`))
  assert.equal(plan.checks['agent-smoke'], true)
  assert.equal(plan.checks.e2e, true)
})

test('root config, unknown/deleted workspaces and executable-looking docs fail closed to full', () => {
  for (const path of ['pnpm-lock.yaml', '.github/workflows/ci.yml', 'OPENAPI.yaml', 'SCHEMA.sql', 'AGENT_PROTOCOL.md',
    'docs/route-policy-matrix.md', 'docs/V1_RELEASE_POLICY.md', 'docs/VERSION_POLICY.md', 'docs/operations/releases.md',
    'docs/adr/0043-agent-connection-and-coordination-mcp.md', 'docs/plans/agent-first-coordination-mcp.md',
    'docs/releases/v1.0.0.md', 'docs/example.ts',
    'skills/workmesh/SKILL.md', 'packages/deleted/src/index.ts', 'scripts/runner.mjs']) {
    const plan = classify(['README.md', path])
    assert.equal(plan.mode, 'full', path)
    assert.ok(Object.values(plan.checks).every(Boolean), path)
  }
})

test('main code changes, empty diff, manual/scheduled/reusable CI and merge queues always run full', () => {
  assert.equal(classify(['apps/web/app/page.tsx'], { mainPush: true }).mode, 'full')
  assert.equal(classify([]).mode, 'full')
  for (const eventName of ['workflow_dispatch', 'workflow_call', 'schedule', 'merge_group']) {
    assert.equal(planForEvent(eventName, {}, workspaces, () => { throw new Error('Must not inspect diff') }).mode, 'full')
  }
  assert.equal(planForEvent('push', { ref: 'refs/tags/v1.0.0-rc.1' }, workspaces).mode, 'full')
})

test('PR uses merge-base, main push uses before/after, renames include both paths, missing history runs full', () => {
  const base = 'a'.repeat(40), head = 'b'.repeat(40), mergeBase = 'c'.repeat(40)
  const calls = []
  const git = args => { calls.push(args); return args[0] === 'merge-base' ? mergeBase : 'README.md\0docs/adr/new.md\0' }
  assert.equal(planForEvent('pull_request', { pull_request: { base: { sha: base }, head: { sha: head } } }, workspaces, git).mode, 'docs')
  assert.deepEqual(calls[1], ['diff', '--no-renames', '--name-only', '-z', mergeBase, head])
  calls.length = 0
  assert.equal(planForEvent('push', { ref: 'refs/heads/main', before: base, after: head }, workspaces, git).mode, 'docs')
  assert.deepEqual(calls[0], ['diff', '--no-renames', '--name-only', '-z', base, head])
  const event = { pull_request: { base: { sha: base }, head: { sha: head } } }
  assert.equal(planForEvent('pull_request', event, workspaces, () => { throw new Error('Missing object') }).mode, 'full')
  assert.equal(planForEvent('pull_request', {}, workspaces).mode, 'full')
  assert.throws(() => planForEvent('pull_request', event, workspaces, args => {
    if (args.includes('--check')) throw new Error('Invalid whitespace')
    return args[0] === 'merge-base' ? mergeBase : 'README.md\0'
  }), /Invalid whitespace/)
  assert.equal(classify(['docs/old.md', 'apps/web/app/new.md']).checks.e2e, true)
})

test('aggregate rejects failure, cancellation and accidental skips for every required job', () => {
  const plan = classify([], { forceFull: true })
  for (const id of ['changes', ...checkIds]) {
    for (const result of ['failure', 'cancelled', 'skipped']) {
      const needs = results(plan); needs[id].result = result
      assert.ok(evaluateResults(plan, needs).some(failure => failure.startsWith(`${id}=`)))
    }
  }
})

test('aggregate only accepts planned skips and rejects incomplete/malformed decisions', () => {
  const plan = classify(['apps/web/app/page.tsx'])
  assert.deepEqual(evaluateResults(plan, results(plan)), [])
  for (const result of ['success', 'failure', 'cancelled']) {
    const needs = results(plan); needs['db-integration'].result = result
    assert.ok(evaluateResults(plan, needs).length > 0)
  }
  assert.throws(() => evaluateResults(null, {}))
  assert.throws(() => evaluateResults(plan, {}))
  assert.throws(() => evaluateResults({ ...plan, checks: {} }, results(plan)))
})

// 真实MCP/Pi链不得因只改adapter或Runner而漏过必需API job。
test('MCP discovery consumers require real conformance and propagate failed or skipped job', () => {
  for (const path of ['apps/mcp/src/index.ts', 'apps/agent-runner/src/workmesh-tools.ts', 'packages/agent-sdk/src/index.ts', 'packages/conformance/src/index.ts']) {
    const plan = classify([path])
    assert.equal(plan.checks['api-integration'], true)
    for (const result of ['failure', 'cancelled', 'skipped']) {
      const actual = results(plan)
      actual['api-integration'] = { result }
      assert.ok(evaluateResults(plan, actual).some(failure => failure.startsWith('api-integration=')))
    }
  }
})

test('real workflow semantic mutations cannot silently omit MCP conformance', () => {
  const input = {
    job: parse(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')).jobs['api-integration'],
    rootScripts: JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).scripts,
    packageScripts: JSON.parse(readFileSync(new URL('../packages/conformance/package.json', import.meta.url))).scripts,
    integrationConfig: readFileSync(new URL('../packages/conformance/vitest.integration.config.ts', import.meta.url), 'utf8'),
    unitConfig: readFileSync(new URL('../vitest.config.ts', import.meta.url), 'utf8'),
  }
  assert.deepEqual(validateMcpConformanceEntrypoints(input), [])
  for (const mutate of [
    value => { value.job.steps = value.job.steps.filter(step => step.name !== 'Run real MCP and Pi conformance') },
    value => { value.rootScripts['test:integration'] = 'pnpm test:integration:api' },
    value => { value.rootScripts['test:conformance:integration'] = 'pnpm --filter @workmesh/conformance test:integration' },
    value => { value.packageScripts['test:integration'] = 'vitest run' },
    ...['src/mcp-coverage.conformance.test.ts', 'src/execution-recovery.conformance.test.ts', 'src/planning-collaboration.conformance.test.ts', 'src/delivery-recovery.conformance.test.ts'].map(suite => value => {
      assert.ok(value.integrationConfig.includes(suite), 'Mutation must remove an existing suite')
      value.integrationConfig = value.integrationConfig.replace(suite, 'deleted-suite.test.ts')
    }),
    value => { value.integrationConfig = value.integrationConfig.replace('passWithNoTests: false', 'passWithNoTests: true') },
    value => { value.job.steps.find(step => step.name === 'Run real MCP and Pi conformance').run = 'pnpm test:conformance:integration' },
    value => { value.job.steps.find(step => step.name === 'Run real MCP and Pi conformance')['continue-on-error'] = true },
    value => { value.job.steps = value.job.steps.filter(step => !step.uses?.startsWith('actions/upload-artifact@')) },
  ]) {
    const candidate = structuredClone(input)
    mutate(candidate)
    assert.ok(validateMcpConformanceEntrypoints(candidate).length > 0)
  }
})
