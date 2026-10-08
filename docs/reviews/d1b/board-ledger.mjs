import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collect, validate } from './stage-ledger.mjs'

const path = 'docs/reviews/d1b/board-ledger.json'
const withoutLine = ({ line, ...record }) => record
export function validateBoard(current, ledger) {
  const result = validate(current, ledger)
  const source = readFileSync('apps/web/features/work-items/work-surfaces.tsx', 'utf8')
  assert(source.includes('data-wm-token-surface={layout === \'board\' ? \'board\' : undefined}'), '实际布局边界缺失')
  assert(source.includes('tokenSurface="board"'), '实例样式没有传递局部作用域')
  const ui = readFileSync('packages/ui/src/domain/work-item.tsx', 'utf8')
  assert(ui.includes('value={tokenSurface === \'board\' && layout === \'board\'}'), '列表不得继承看板实例回退')
  assert(ui.includes("color || (semantic ? 'var(--wm-ref-text-secondary)' : 'var(--wm-muted)')"), '颜色优先及旧作用域回退丢失')
  return result
}
const main = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (main && process.argv.includes('--snapshot')) {
  assert(!existsSync(path), '不得覆盖迁前账本')
  const records = collect().map(record => ({ ...withoutLine(record), beforeLine: record.line,
    expectedValue: record.value, status: 'inherited-protected' }))
  writeFileSync(path, JSON.stringify({ phase: 'board', acceptedPredecessor: JSON.parse(readFileSync('docs/reviews/d1b/board-authorization.json')),
    source: '本轮看板迁前真实AST/CSS清单；原工作台和D1a历史账本保留', entries: records, additions: [],
    visualReview: 'pending', cleanupAllowed: false, nextStageAllowed: false }, null, 2) + '\n')
} else if (main) {
  const ledger = JSON.parse(readFileSync(path))
  console.log(JSON.stringify(validateBoard(collect(), ledger), null, 2))
}
