import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkIds, classifyChanges, evaluateResults, planForEvent, readWorkspaces } from './ci-policy.mjs'

const workspaces = readWorkspaces()
const classify = (paths, options) => classifyChanges(paths, workspaces, options)
const results = plan => Object.fromEntries(['changes', ...checkIds].map(id => [id, { result: id === 'changes' || plan.checks[id] ? 'success' : 'skipped' }]))

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
    assert.deepEqual(plan.packages, [`@workmesh/${name}`])
    assert.deepEqual(plan.testPackages, [`@workmesh/${name}`, '@workmesh/db'].sort())
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
