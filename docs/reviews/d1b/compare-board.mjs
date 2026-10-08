import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'

let require = createRequire(resolve('package.json'))
require = createRequire(realpathSync(require.resolve('@playwright/test/package.json')))
require = createRequire(realpathSync(require.resolve('playwright/package.json')))
const core = realpathSync(require.resolve('playwright-core/package.json'))
const comparator = require(resolve(dirname(core), 'lib/coreBundle.js')).utils.getComparator('image/png')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const compare = (expectedPath, actualPath, diffPath) => {
  const expected = readFileSync(expectedPath), actual = readFileSync(actualPath)
  const result = comparator(actual, expected, { threshold: 0.005, maxDiffPixels: 0 })
  if (result?.diff) writeFileSync(diffPath, result.diff)
  return { expected: { path: expectedPath, bytes: expected.length, sha256: sha(expected) },
    actual: { path: actualPath, bytes: actual.length, sha256: sha(actual) }, rawBytesEqual: expected.equals(actual),
    comparatorPassed: result === null, message: result?.errorMessage ?? '固定比较器未发现超过阈值的变化',
    diff: result?.diff ? { path: diffPath, bytes: result.diff.length, sha256: sha(result.diff) } : null }
}
const matrix = JSON.parse(readFileSync('docs/reviews/d1b/surface-matrix.json'))
const rows = []
for (const variant of ['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark']) {
  for (const row of matrix.rows.filter(row => row.stage === 'board')) {
    for (const state of ['ready', 'loading', 'error', 'empty', 'compact', 'portal', 'detail']) {
      const directory = `docs/reviews/d1b/evidence/board/${variant}/${row.id}/${state}`
      const before = JSON.parse(readFileSync(`${directory}/before.json`)), after = JSON.parse(readFileSync(`${directory}/after.json`))
      assert.equal(before.actualURL, after.actualURL)
      assert.equal(before.requestedURL, row.request.url)
      assert.equal(after.requestedURL, row.request.url)
      assert.deepEqual(before.viewport, after.viewport)
      assert.equal(before.theme, after.theme)
      assert.deepEqual(before.failures, [])
      assert.deepEqual(after.failures, [])
      const comparison = compare(`${directory}/before.png`, `${directory}/after.png`, `${directory}/diff.png`)
      assert.equal(before.screenshot.sha256, comparison.expected.sha256)
      assert.equal(after.screenshot.sha256, comparison.actual.sha256)
      let historicalD0 = null
      if (variant.endsWith('light') && row.id === 'project-work-board' && state === 'ready') {
        const viewport = variant.startsWith('desktop') ? 'desktop-1440x1000' : 'mobile-390x844'
        const original = `apps/web/e2e/baselines/d0/win32/${viewport}/board.png`
        historicalD0 = { before: compare(original, `${directory}/before.png`, `${directory}/d0-before-diff.png`),
          after: compare(original, `${directory}/after.png`, `${directory}/d0-after-diff.png`),
          policy: '冻结D0原路由/亮色/视口/采集参数；迁前已有移动主题可达性修复，历史差异不冒零差异或视觉批准' }
      }
      const item = { variant, rowID: row.id, state, requestedURL: row.request.url, actualURL: after.actualURL,
        comparison, historicalD0, runtime: { before: `${directory}/before.json`, after: `${directory}/after.json` },
        checks: after.checks, humanReview: '待本面人工视觉评审' }
      rows.push(item)
      writeFileSync(`${directory}/comparison.json`, JSON.stringify(item, null, 2) + '\n')
    }
  }
}
writeFileSync('docs/reviews/d1b/evidence/board/comparisons.json', JSON.stringify({ stage: 'board',
  comparator: { threshold: 0.005, maxDiffPixels: 0 }, rows, nextStageAllowed: false, cleanupAllowed: false }, null, 2) + '\n')
console.log(JSON.stringify({ rows: rows.length, changed: rows.filter(row => !row.comparison.comparatorPassed).length,
  humanReview: 'pending', nextStageAllowed: false, cleanupAllowed: false }))
