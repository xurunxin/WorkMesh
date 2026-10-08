import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourcePaths, assertRuntimeDefinitions, validateGraph } from './verify-preflight.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const registry = JSON.parse(read('apps/web/features/navigation/theme-token-migration.json'))
const require = createRequire(resolve(root, 'package.json'))
const ts = require('typescript')
const webRequire = createRequire(resolve(root, 'apps/web/package.json'))
const postcss = createRequire(webRequire.resolve('next/package.json'))('postcss')
const map = new Map(registry.entries.map(entry => [entry.from, entry.to]))
const local = 'apps/web/features/workbench/conversation-workbench.module.css'
const cssPath = 'packages/ui/src/tokens.css'
const scope = 'data-wm-token-surface="workbench"'
const ledgerPath = 'docs/reviews/d1b/workbench-ledger.json'
const normalized = text => text.replace(/\s+/g, ' ').trim()
const replace = value => value.replace(/--wm-[\w-]+/g, name => map.get(name) ?? name)
const dependencies = value => [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map(match => match[1])

// CSS 由 PostCSS 定位选择器/属性；TS 字符串及模板由 TypeScript AST 定位。
export function scan(path, source) {
  const records = [], occurrences = new Map()
  const push = (kind, owner, property, value, line) => {
    const identity = `${path}|${kind}|${owner}|${property}`
    const occurrence = (occurrences.get(identity) ?? 0) + 1
    occurrences.set(identity, occurrence)
    records.push({ id: `${identity}|${occurrence}`, path, kind, owner, property, occurrence, value: normalized(value), dependencies: dependencies(value), line })
  }
  if (path.endsWith('.css')) {
    postcss.parse(source, { from: path }).walkDecls(declaration => {
      if (!declaration.prop.startsWith('--wm-') && !declaration.value.includes('var(--')) return
      const ancestors = []
      for (let parent = declaration.parent; parent; parent = parent.parent) {
        if (parent.type === 'rule') ancestors.unshift(normalized(parent.selector))
        if (parent.type === 'atrule') ancestors.unshift(`@${parent.name} ${normalized(parent.params)}`)
      }
      push(declaration.prop.startsWith('--wm-') ? 'definition' : 'consumer', ancestors.join(' > '), declaration.prop, declaration.value, declaration.source.start.line)
    })
  } else {
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = node => {
      if ((ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && /--[\w-]+/.test(node.text)) {
        const owners = []
        for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
          if ((ts.isFunctionDeclaration(ancestor) || ts.isVariableDeclaration(ancestor) || ts.isPropertyAssignment(ancestor) || ts.isMethodDeclaration(ancestor)) && ancestor.name) owners.unshift(ancestor.name.getText(ast))
        }
        const owner = owners.join('.') || ts.SyntaxKind[node.parent.kind]
        push('string', owner, ts.SyntaxKind[node.parent.kind], node.text, ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1)
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  return records
}

export const collect = () => sourcePaths().flatMap(path => scan(path, read(path)))
const withoutLine = ({ line, ...record }) => record

export function validate(current, ledger) {
  const actual = new Map(current.map(record => [record.id, record]))
  const consumed = new Set()
  for (const entry of ledger.entries) {
    const value = actual.get(entry.id)
    assert(value, `消费/声明身份消失：${entry.id}`)
    assert.equal(value.value, entry.expectedValue, `阶段表达式被改写：${entry.id}`)
    consumed.add(entry.id)
  }
  const added = current.filter(record => !consumed.has(record.id))
  for (const record of added) {
    const expected = ledger.additions.find(entry => entry.id === record.id)
    assert(expected, `未经阶段登记的新增消费/声明：${record.id}`)
    assert.deepEqual(withoutLine(record), expected, `新增表达式偏离阶段登记：${record.id}`)
  }
  assert.equal(added.length, ledger.additions.length, '登记的新分支缺失')
  for (const record of current.filter(record => record.path === cssPath && record.kind === 'definition')) {
    if (record.property.startsWith('--wm-ref-')) assert(record.dependencies.every(name => !map.has(name)), `新槽仍依赖退役名称：${record.id}`)
  }
  // 每层合并根声明，分别核验根、明暗及密度组合；fallback 依赖亦遍历。
  const definitions = current.filter(record => record.path === cssPath && record.kind === 'definition')
  for (const theme of ['light', 'dark']) for (const compact of [false, true]) {
    const values = new Map()
    for (const record of definitions) {
      if (record.owner === ':root' || (record.owner.includes(`data-wm-theme='${theme}'`) && (!record.owner.includes('density') || compact)) || (compact && record.owner === "[data-wm-density='compact']")) values.set(record.property, record.value)
    }
    validateGraph(values, registry.retainedRuntime)
    for (const record of current.filter(record => record.kind !== 'definition' && record.path.endsWith('.css'))) {
      for (const dependency of record.dependencies) if (dependency.startsWith('--wm-')) assert(values.has(dependency) || registry.retainedRuntime.includes(dependency), `未知消费依赖 ${dependency}`)
    }
  }
  assertRuntimeDefinitions(registry.runtimeDefinitions)
  const boundary = read('apps/web/app/workbench/page.tsx')
  assert(boundary.includes('<section className="content workbench-page" data-wm-token-surface="workbench">'), '工作台边界缺失')
  assert(!read('packages/ui/src/layout/app-shell.tsx').includes(scope), '不得整体切换共享 shell')
  for (const record of ledger.additions.filter(record => record.kind !== 'definition' && record.path.endsWith('.css'))) assert(record.owner.includes(scope), `共享新分支未隔离：${record.id}`)
  const legacy = current.filter(record => record.dependencies.some(name => map.has(name)))
  assert(legacy.length > 0, '首面不能清空全部旧消费')
  return { phase: 'workbench', ledgerEntries: ledger.entries.length, scopedAdditions: ledger.additions.length, remainingLegacyExpressions: legacy.length, runtime: registry.retainedRuntime, cleanupAllowed: false, visualReview: '待人工视觉评审', nextStageAllowed: false }
}

function expectedValue(record) {
  if (record.path === local) return replace(record.value)
  if (record.path === cssPath && record.kind === 'definition' && record.owner === "[data-wm-theme='dark']") {
    return registry.existingRefDarkRebindings.find(binding => binding.from === record.property)?.newValue ?? record.value
  }
  return record.value
}

const main = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (main && process.argv.includes('--snapshot')) {
  assert(!readFileExists(ledgerPath), '不得覆盖冻结迁前账本')
  const entries = collect().map(record => ({ ...withoutLine(record), beforeLine: record.line, expectedValue: normalized(expectedValue(record)), status: record.path === local ? 'migrated-pending-review' : record.path === cssPath && expectedValue(record) !== record.value ? 'rebound' : 'unmigrated' }))
  writeFileSync(resolve(root, ledgerPath), JSON.stringify({ phase: 'workbench', source: '工作台迁前实际源码；D1a 基线保留不改', entries, additions: [], visualReview: 'pending', cleanupAllowed: false }, null, 2) + '\n')
} else if (main) {
  const current = collect()
  const ledger = JSON.parse(read(ledgerPath))
  if (process.argv.includes('--self-test')) {
    validate(current, ledger)
    const mutation = (name, change) => { const modified = structuredClone(current); change(modified); assert.throws(() => validate(modified, ledger), undefined, name); return name }
    const cases = [
      mutation('旧声明有消费时禁止删除', records => records.splice(records.findIndex(record => record.property === '--wm-canvas'), 1)),
      mutation('未迁共享消费禁止无条件替换', records => { const record = records.find(record => record.path === cssPath && record.kind === 'consumer' && record.dependencies.some(name => map.has(name))); record.value = replace(record.value) }),
      mutation('嵌套 fallback 未知依赖失败', records => { records.find(record => record.path === local).value += ' var(--wm-ref-focus, var(--wm-unknown))' }),
      mutation('新分支边界删除失败', records => { records.find(record => record.owner.includes(scope)).owner = '.wm-button' }),
      mutation('已迁项回退失败', records => { const record = records.find(record => record.path === local); record.value = ledger.entries.find(entry => entry.id === record.id).value }),
    ]
    assert.throws(() => validateGraph(new Map([['--a', 'var(--b)'], ['--b', 'var(--a)']])))
    assert.throws(() => assertRuntimeDefinitions(registry.runtimeDefinitions.filter(record => record.token === '--wm-overlay-depth'), path => read(path).replace("layer.backdrop.style.setProperty('--wm-overlay-depth', String(index * 2))", '')))
    console.log(JSON.stringify({ ...validate(current, ledger), negativeCases: [...cases, '循环依赖失败', '运行时生产者缺失失败'] }, null, 2))
  } else console.log(JSON.stringify(validate(current, ledger), null, 2))
}

function readFileExists(path) {
  try { read(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error }
}
