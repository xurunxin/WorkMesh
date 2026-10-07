import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

// Run from apps/web. Collection does not start servers or reset the database.
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')
const collect = shard => {
  const report = JSON.parse(execFileSync(process.execPath, [cli, 'test',
    '--config=../../playwright.config.ts', '--list', '--reporter=json',
    ...(shard ? [`--shard=${shard}/2`] : []),
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 5_000_000 }))
  const tests = new Map()
  const visit = suites => { for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) {
      const id = `${test.projectName}:${spec.id}`
      assert.ok(!tests.has(id), `Duplicate collected test: ${id}`)
      tests.set(id, test.projectName)
    }
    visit(suite.suites)
  } }
  visit(report.suites)
  assert.ok(tests.size > 0, 'Browser collection is empty')
  return tests
}
const full = collect(), shards = [collect(1), collect(2)]
const union = new Set(shards.flatMap(shard => [...shard.keys()]))
assert.deepEqual([...union].sort(), [...full.keys()].sort(), 'Shard union must equal the entire acceptance suite')
for (const [id, project] of full) {
  const occurrences = shards.filter(shard => shard.has(id)).length
  assert.equal(occurrences, project === 'bootstrap' ? 2 : 1, `Missing or repeated acceptance scenario: ${id}`)
}
console.log(`Browser coverage: ${full.size} unique cases; shards ${shards.map(shard => shard.size).join(' + ')}; only bootstrap repeats.`)
