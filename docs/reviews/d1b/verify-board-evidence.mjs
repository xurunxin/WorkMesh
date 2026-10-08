import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { readRawEvidenceArchive, resolveEvidenceBytes, digest } from '../../../scripts/verify-raw-evidence-archive.mjs'
import { collect } from './stage-ledger.mjs'
import { validateBoard } from './board-ledger.mjs'

const json = path => JSON.parse(readFileSync(path))
const prefix = 'docs/reviews/d1b/evidence/board'
const archives = new Map()
function archive(id, name) {
  const key = `${id}/${name}`
  if (!archives.has(key)) {
    const directory = `${prefix}/runs/${id}`
    const index = json(`${directory}/${name}-index.json`)
    archives.set(key, readRawEvidenceArchive(index, readFileSync(`${directory}/${name}.zip`)))
  }
  return archives.get(key)
}
const runs = readdirSync(`${prefix}/runs`).map(id => {
  const directory = `${prefix}/runs/${id}`
  const run = json(`${directory}/execution.json`)
  assert.equal(run.id, id)
  assert.equal(run.surface, 'board')
  assert.equal(run.sourceUnchanged, true, `${id} 运行中源码变动`)
  assert.deepEqual(run.before, run.after)
  assert(Date.parse(run.finishedAt) >= Date.parse(run.startedAt))
  assert(run.elapsedMs > 0 && Number.isInteger(run.exitCode))
  const source = archive(id, 'source-inputs')
  for (const input of run.before) for (const byteKind of ['git-blob', 'worktree']) {
    const bytes = resolveEvidenceBytes(source, { logicalPath: input.path, version: id, byteKind })
    assert.equal(bytes.length, byteKind === 'git-blob' ? input.gitBytes : input.worktreeBytes)
    assert.equal(digest(bytes), byteKind === 'git-blob' ? input.gitSha256 : input.worktreeSha256)
  }
  for (const raw of Object.values(run.raw)) {
    const logicalPath = `${directory}/${raw.path}`
    const bytes = raw.bytes === 0 ? readFileSync(logicalPath) : resolveEvidenceBytes(archive(id, 'raw-evidence'), { logicalPath, version: id, byteKind: 'worktree' })
    assert.equal(bytes.length, raw.bytes)
    assert.equal(digest(bytes), raw.sha256)
  }
  if (existsSync(`${directory}/captures-index.json`)) archive(id, 'captures')
  return run
})
const byID = new Map(runs.map(run => [run.id, run]))
function successful(id) { const run = byID.get(id); assert(run, `缺少运行 ${id}`); assert.equal(run.exitCode, 0); return run }
const afterRun = successful('board-after-complete')
successful('board-before-mobile')
successful('board-theme-regression')
successful('board-lint')
successful('board-typecheck-final')
successful('board-unit-final')
assert.equal(byID.get('board-before-complete').exitCode, 1, '迁前组合运行保留两项移动失败')
const comparisons = json(`${prefix}/comparisons.json`)
assert.deepEqual(comparisons.comparator, { threshold: 0.005, maxDiffPixels: 0 })
assert.equal(comparisons.nextStageAllowed, false)
assert.equal(comparisons.cleanupAllowed, false)
assert.equal(comparisons.rows.length, 140)
const keys = new Set()
let d0Comparisons = 0, targets = 0
for (const row of comparisons.rows) {
  const key = `${row.variant}/${row.rowID}/${row.state}`
  assert(!keys.has(key)); keys.add(key)
  const beforeID = row.variant.startsWith('desktop') ? 'board-before-complete' : 'board-before-mobile'
  for (const [phase, id, record] of [['before', beforeID, row.comparison.expected], ['after', afterRun.id, row.comparison.actual]]) {
    const bytes = readFileSync(record.path)
    assert.equal(bytes.length, record.bytes)
    assert.equal(digest(bytes), record.sha256)
    const packed = archive(id, 'captures')
    assert.deepEqual(resolveEvidenceBytes(packed, { logicalPath: record.path, version: id, byteKind: 'worktree' }), bytes)
    const runtimeBytes = readFileSync(row.runtime[phase])
    assert.deepEqual(resolveEvidenceBytes(packed, { logicalPath: row.runtime[phase], version: id, byteKind: 'worktree' }), runtimeBytes)
    const runtime = JSON.parse(runtimeBytes)
    assert.equal(runtime.screenshot.sha256, record.sha256)
    assert.equal(runtime.row, row.rowID); assert.equal(runtime.state, row.state)
    assert.deepEqual(runtime.failures, [])
    assert.equal(runtime.requestedURL, row.requestedURL)
    assert.equal(runtime.actualURL, row.actualURL)
    if (phase === 'after' && row.state === 'ready') {
      assert.equal(runtime.derived.length, 4)
      assert.equal(runtime.checks.keyboard, true); assert.equal(runtime.checks.navigation, true)
    }
    targets += 2
  }
  for (const comparison of [row.comparison, ...Object.values(row.historicalD0 ?? {}).filter(value => value?.expected)]) {
    for (const record of [comparison.expected, comparison.actual, comparison.diff].filter(Boolean)) {
      assert.equal(digest(readFileSync(record.path)), record.sha256)
      if (record.path.startsWith('apps/web/e2e/baselines/d0/')) {
        const original = execFileSync('git', ['show', `567f68dc9b2905a166184c24686a9f2fd74f2832:${record.path}`])
        assert.deepEqual(readFileSync(record.path), original, 'D0原件不得改动')
        d0Comparisons++
      }
    }
  }
}
// 技术检查与采集绑定当前产品字节；后续文档收尾不冒充测试中修改源码。
const tested = ['apps/web/app/styles.css', 'apps/web/features/work-items/work-surfaces.tsx', 'apps/web/features/work-items/board-shared.css', 'packages/ui/src/domain/work-item.tsx', 'packages/ui/src/tokens.css', 'apps/web/e2e/theme-unification.spec.ts', 'apps/web/e2e/mocked/d1b-board.mocked.spec.ts', 'apps/web/e2e/mocked/d1b-theme-probes.ts']
for (const id of ['board-after-complete', 'board-theme-regression', 'board-unit-final', 'board-typecheck-final', 'board-lint']) {
  const run = successful(id)
  for (const path of tested) {
    const input = run.before.find(input => input.path === path)
    assert(input, `${id} 缺少 ${path}`)
    // 主题导航的含query路径判定在采集之后定向加强，由后续40项主题回归绑定。
    if (path === 'apps/web/e2e/theme-unification.spec.ts' && id !== 'board-theme-regression') continue
    assert.equal(digest(readFileSync(path)), input.worktreeSha256, `${id} 当前受测源码发生变化：${path}`)
  }
}
const html = readFileSync('docs/reviews/d1b/board-visual-review.html', 'utf8')
for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  assert(!match[1].startsWith('/'), '预览必须使用相对引用')
  assert(existsSync(resolve('docs/reviews/d1b', match[1])), `评审页断链：${match[1]}`)
  targets++
}
const guard = validateBoard(collect(), json('docs/reviews/d1b/board-ledger.json'))
console.log(JSON.stringify({ runs: runs.length, archives: archives.size, comparisons: keys.size,
  changed: comparisons.rows.filter(row => !row.comparison.comparatorPassed).length, d0Comparisons,
  verifiedTargets: targets, currentTestedSources: tested.length, guard,
  humanReview: 'pending', hostPreviewTested: false, nextStageAllowed: false, cleanupAllowed: false }, null, 2))
