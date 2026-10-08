import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readRawEvidenceArchive, resolveEvidenceBytes } from '../../../../scripts/verify-raw-evidence-archive.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const directory = 'docs/reviews/d1b/recovery'
const read = path => readFileSync(resolve(root, path))
const json = path => JSON.parse(read(path))
const sha = value => createHash('sha256').update(value).digest('hex')
const archive = name => {
  const index = json(`${directory}/${name}-index.json`)
  return readRawEvidenceArchive(index, read(`${directory}/${index.archive.path}`))
}
const raw = archive('raw-evidence')
const inputs = archive('source-inputs')
const artifacts = json(`${directory}/checkpoint-artifacts.json`)
const audit = json(`${directory}/historical-run-audit.json`)
const checkpoint = 'd2e1a656df73f5afd7d91060c2f7e4b4fd1ebcf5'
const blobIds = [...new Set(artifacts.files.map(file => file.gitBlob))]
const batch = execFileSync('git', ['cat-file', '--batch'], {
  cwd: root, input: blobIds.join('\n') + '\n', maxBuffer: 128 * 1024 * 1024,
})
const blobs = new Map()
let at = 0
for (const id of blobIds) {
  const end = batch.indexOf(10, at)
  const match = /^(\w+) blob (\d+)$/.exec(batch.subarray(at, end).toString())
  assert(match && match[1] === id)
  const size = Number(match[2])
  blobs.set(id, batch.subarray(end + 1, end + 1 + size))
  at = end + size + 2
}
assert.equal(at, batch.length)
for (const file of artifacts.files) {
  const blob = blobs.get(file.gitBlob)
  assert.equal(blob.length, file.gitBytes)
  assert.equal(sha(blob), file.gitSha256)
  const worktree = existsSync(resolve(root, file.path)) ? read(file.path) :
    resolveEvidenceBytes(raw, { logicalPath: file.path, version: checkpoint, byteKind: 'worktree' })
  assert.equal(worktree.length, file.worktreeBytes, file.path)
  assert.equal(sha(worktree), file.worktreeSha256, file.path)
}
assert.deepEqual(audit.sourceInputGaps, [])
assert.deepEqual(audit.missingObjects, [])
for (const summary of audit.runs) {
  const prefix = `docs/reviews/d1b/evidence/workbench/runs/${summary.id}`
  const run = json(`${prefix}/execution.json`)
  assert.deepEqual(run.before, run.after)
  assert.equal(run.sourceUnchanged, true)
  for (const input of run.before) for (const byteKind of ['git-blob', 'worktree']) {
    const bytes = resolveEvidenceBytes(inputs, { logicalPath: input.path, version: run.id, byteKind })
    assert.equal(bytes.length, input[byteKind === 'git-blob' ? 'gitBytes' : 'worktreeBytes'])
    assert.equal(sha(bytes), input[byteKind === 'git-blob' ? 'gitSha256' : 'worktreeSha256'])
  }
  let original = null
  if (existsSync(resolve(root, `${prefix}/raw-archive/index.json`))) {
    const index = json(`${prefix}/raw-archive/index.json`)
    original = readRawEvidenceArchive(index, read(`${prefix}/raw-archive/${index.archive.path}`))
  }
  for (const stream of ['stdout', 'stderr']) {
    const metadata = run.raw[stream], logicalPath = `${prefix}/${metadata.path}`
    const candidates = []
    if (existsSync(resolve(root, logicalPath))) candidates.push(read(logicalPath))
    for (const byteKind of ['git-blob', 'worktree']) {
      try { candidates.push(resolveEvidenceBytes(raw, { logicalPath, version: checkpoint, byteKind })) } catch {}
    }
    if (original) try { candidates.push(resolveEvidenceBytes(original, { logicalPath, version: run.id, byteKind: 'worktree' })) } catch {}
    if (metadata.bytes === 0) candidates.push(Buffer.alloc(0))
    assert(candidates.some(bytes => bytes.length === metadata.bytes && sha(bytes) === metadata.sha256), logicalPath)
  }
}
const comparisons = json('docs/reviews/d1b/evidence/workbench/comparisons.json')
assert.equal(comparisons.rows.length, 32)
assert.equal(comparisons.rows.filter(row => !row.comparison.comparatorPassed).length, 30)
assert.equal(comparisons.comparator.threshold, 0.005)
assert.equal(comparisons.comparator.maxDiffPixels, 0)
for (const row of comparisons.rows) {
  for (const item of [row.comparison.expected, row.comparison.actual, row.comparison.diff].filter(Boolean)) {
    const bytes = read(item.path)
    assert.equal(bytes.length, item.bytes)
    assert.equal(sha(bytes), item.sha256)
  }
  for (const phase of ['before', 'after']) {
    const runtime = json(row.runtime[phase])
    const item = row.comparison[phase === 'before' ? 'expected' : 'actual']
    assert.equal(runtime.screenshot.sha256, item.sha256)
  }
  if (row.historical) for (const comparison of Object.values(row.historical)) {
    assert.equal(sha(read(comparison.expected.path)), comparison.expected.sha256)
  }
}
assert.equal(sha(read('docs/plan/d1b-token-consumer-migration.md')), '91a9eb7451ff2799754d4207863c67cff09112d1470b5ad1049066309f8dbdb8')
const ledger = json('docs/reviews/d1b/workbench-ledger.json')
assert.equal(ledger.cleanupAllowed, false)
assert.equal(ledger.visualReview, 'pending')
const unitPrefix = 'docs/reviews/d1b/evidence/workbench/runs/recovery-theme-unit-final'
const unit = json(unitPrefix + '/execution.json')
assert.equal(unit.exitCode, 0)
assert.deepEqual(unit.before, unit.after)
assert.equal(unit.sourceUnchanged, true)
const unitIndex = json(unitPrefix + '/raw-archive/index.json')
const unitArchive = readRawEvidenceArchive(unitIndex, read(unitPrefix + '/raw-archive/' + unitIndex.archive.path))
const unitLog = resolveEvidenceBytes(unitArchive, {
  logicalPath: unitPrefix + '/stdout.log', version: unit.id, byteKind: 'worktree',
})
assert.equal(sha(unitLog), unit.raw.stdout.sha256)
assert.match(unitLog.toString(), /11 passed/)
// 报告与此验证器在运行后补齐；受测产品源码、映射和阶段断言必须仍匹配运行字节。
for (const input of unit.after.filter(input => /^(apps\/|packages\/)/.test(input.path) || /(?:stage-ledger|verify-preflight|run-stage-command)\.mjs$/.test(input.path))) {
  assert.equal(sha(read(input.path)), input.worktreeSha256, input.path)
  const blob = execFileSync('git', ['show', ':' + input.path], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
  assert.equal(sha(blob), input.gitSha256, input.path)
}
console.log(JSON.stringify({ result: '恢复证据核验通过，非人工视觉批准', checkpointArtifacts: artifacts.files.length,
  png: audit.checkpointPng, zip: audit.checkpointZip, historicalRuns: audit.runs.length,
  sourceInputRecords: inputs.index.entries.length, sourceInputMembers: inputs.memberCount,
  rawRecords: raw.index.entries.length, sourceInputGaps: 0, comparisons: 32, changed: 30,
  currentThemeUnit: '11/11', nextStageAllowed: false, cleanupAllowed: false, runtime: process.version }, null, 2))
