import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
let require = createRequire(resolve(root, 'package.json'))
require = createRequire(realpathSync(require.resolve('@playwright/test/package.json')))
require = createRequire(realpathSync(require.resolve('playwright/package.json')))
const core = realpathSync(require.resolve('playwright-core/package.json'))
const { utils } = require(resolve(dirname(core), 'lib/coreBundle.js'))
const comparator = utils.getComparator('image/png')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const variants = ['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark']
const states = ['ready', 'create', 'loading', 'error', 'empty', 'rich', 'portal']
const rows = []
const read = path => readFileSync(resolve(root, path))
const compare = (expectedPath, actualPath, diffPath) => {
  const expected = read(expectedPath), actual = read(actualPath)
  const result = comparator(actual, expected, { threshold: 0.005, maxDiffPixels: 0 })
  if (result?.diff) writeFileSync(resolve(root, diffPath), result.diff)
  return {
    expected: { path: expectedPath, bytes: expected.length, sha256: sha(expected) },
    actual: { path: actualPath, bytes: actual.length, sha256: sha(actual) },
    rawBytesEqual: expected.equals(actual), comparatorPassed: result === null,
    message: result?.errorMessage ?? '固定比较器未发现超过阈值的变化',
    diff: result?.diff ? { path: diffPath, bytes: result.diff.length, sha256: sha(result.diff) } : null,
  }
}
const matrix = JSON.parse(read('docs/reviews/d1b/surface-matrix.json'))
for (const variant of variants) for (const rowID of ['workbench', 'root-redirect']) for (const state of rowID === 'workbench' ? states : ['ready']) {
  const directory = `docs/reviews/d1b/evidence/workbench/${variant}/${rowID}/${state}`
  const before = JSON.parse(read(`${directory}/before.json`)), after = JSON.parse(read(`${directory}/after.json`))
  assert.equal(before.actualURL, after.actualURL)
  assert.equal(before.theme, after.theme)
  assert.deepEqual(before.viewport, after.viewport)
  const comparison = compare(`${directory}/before.png`, `${directory}/after.png`, `${directory}/diff.png`)
  assert.equal(comparison.expected.sha256, before.screenshot.sha256)
  assert.equal(comparison.actual.sha256, after.screenshot.sha256)
  let historical = null
  if (variant.endsWith('light') && rowID === 'workbench' && state === 'ready') {
    const d0 = matrix.rows.find(row => row.id === rowID).evidence.d0References.find(reference => reference.viewport.width === before.viewport.width)
    assert.equal(sha(read(d0.snapshot)), d0.baselineSha256, 'D0 原件被改变')
    historical = { d0Before: compare(d0.snapshot, `${directory}/before.png`, `${directory}/d0-before-diff.png`), d0After: compare(d0.snapshot, `${directory}/after.png`, `${directory}/d0-after-diff.png`) }
  }
  const result = { variant, rowID, state, comparison, historical, runtime: { before: `${directory}/before.json`, after: `${directory}/after.json` }, humanReview: '待人工视觉评审', disposition: '保留真实设计差异；比较器结果不代表颜色验收' }
  writeFileSync(resolve(root, directory, 'comparison.json'), JSON.stringify(result, null, 2) + '\n')
  rows.push(result)
}
writeFileSync(resolve(root, 'docs/reviews/d1b/evidence/workbench/comparisons.json'), JSON.stringify({ comparator: { package: 'playwright-core', version: JSON.parse(readFileSync(core)).version, threshold: 0.005, maxDiffPixels: 0 }, rows, humanReview: '待人工视觉评审', nextStageAllowed: false }, null, 2) + '\n')
console.log(JSON.stringify({ comparisons: rows.length, changed: rows.filter(row => !row.comparison.comparatorPassed).length, d0OriginalsPreserved: true, humanReview: '待人工视觉评审' }))
