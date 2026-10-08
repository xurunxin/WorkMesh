import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const json = path => JSON.parse(read(path))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 })
const registry = json('apps/web/features/navigation/theme-token-migration.json')
const baseline = json('apps/web/features/navigation/theme-token-baseline.json')
const source = json('docs/reviews/d1b/plan-source.json')
const matrix = json('docs/reviews/d1b/surface-matrix.json')
const cssPath = 'packages/ui/src/tokens.css'
const withoutComments = text => text.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\r\n]/g, ' ')).replace(/(^|\s)\/\/.*$/gm, '$1')
const dependencies = text => [...text.matchAll(/var\(\s*(--[\w-]+)/g)].map(match => match[1])
const declarations = css => [...withoutComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/gs)].flatMap(block =>
  [...block[2].matchAll(/(--wm-[\w-]+)\s*:\s*([^;]+);/g)].map(match => ({ selector: block[1].trim().replace(/\s+/g, ' '), token: match[1], value: match[2].trim() })))

export function validateGraph(values, producers = []) {
  const visiting = new Set()
  const visited = new Set(producers)
  function visit(name) {
    if (visited.has(name)) return
    assert(!visiting.has(name), `循环依赖 ${name}`)
    assert(values.has(name), `未知依赖 ${name}`)
    visiting.add(name)
    for (const dependency of dependencies(values.get(name))) visit(dependency)
    visiting.delete(name)
    visited.add(name)
  }
  for (const name of values.keys()) visit(name)
}

export function assertDeletionSafe(names, references) {
  const retired = new Set(names)
  assert(!references.some(reference => retired.has(reference.token)), '仍有旧消费，禁止删除')
}

export function verify() {
  assert.equal(source.planBody, read('docs/plan/d1b-token-consumer-migration.md'))
  assert.equal(sha(source.planBody), source.readback.bodyUtf8Sha256)
  assert.equal(registry.currentPlanID, source.currentPlanID)
  assert.equal(matrix.currentPlanID, source.currentPlanID)
  assert.deepEqual(declarations(read(cssPath)).filter(d => !d.token.startsWith('--wm-ref-')), baseline.declarations)
  assert.deepEqual(registry.entries.map(e => e.from), [...new Set(baseline.declarations.map(d => d.token))])
  const emitted = registry.entries.filter(e => e.declarations.some(d => d.emitsDeclaration))
  assert.equal(new Set(emitted.map(e => e.to)).size, emitted.length, '新名称冲突')
  assert(!registry.entries.find(e => e.from === '--wm-muted').declarations.some(d => d.emitsDeclaration))
  const mapping = new Map(registry.entries.map(e => [e.from, e.to]))
  const rewrite = value => value.replace(/--wm-[\w-]+/g, name => mapping.get(name) ?? name)
  const current = declarations(read(cssPath))
  const rootValues = new Map(current.filter(d => d.selector === ':root' && d.token.startsWith('--wm-ref-')).map(d => [d.token, d.value]))
  rootValues.delete('--wm-ref-danger-candidate')
  for (const entry of emitted) {
    for (const declaration of entry.declarations) {
      assert.deepEqual(declaration.dependencies, dependencies(rewrite(declaration.oldValue)))
      if (declaration.selector === ':root') rootValues.set(entry.to, declaration.newValue)
      if (declaration.selector !== ':root') assert.equal(declaration.newValue, rewrite(declaration.oldValue), '作用域现值被更改')
    }
  }
  validateGraph(rootValues)
  const darkValues = new Map(rootValues)
  for (const entry of emitted) for (const declaration of entry.declarations) {
    if (declaration.selector === "[data-wm-theme='dark']") darkValues.set(entry.to, declaration.newValue)
  }
  for (const rebinding of registry.existingRefDarkRebindings) {
    assert.equal(rebinding.newValue, rewrite(current.find(d => d.token === dependencies(rebinding.oldExpression)[0] && d.selector === "[data-wm-theme='dark']")?.value ?? current.find(d => d.token === dependencies(rebinding.oldExpression)[0] && d.selector === ':root')?.value))
    darkValues.set(rebinding.to, rebinding.newValue)
  }
  validateGraph(darkValues)
  const compactValues = new Map(rootValues)
  const darkCompactValues = new Map(darkValues)
  for (const entry of emitted) for (const declaration of entry.declarations) if (declaration.selector.includes('density')) {
    compactValues.set(entry.to, declaration.newValue)
    darkCompactValues.set(entry.to, declaration.newValue)
  }
  validateGraph(compactValues)
  validateGraph(darkCompactValues)
  const observations = json('docs/references/todos-analysis/design-observations.json')
  const evidence = json('docs/references/todos-analysis/css-evidence.json')
  for (const entry of registry.entries) {
    const provenance = entry.provenance
    if (provenance.pointer?.startsWith('/12/custom/')) {
      const raw = observations[12].custom[provenance.pointer.slice('/12/custom/'.length)]
      assert.equal('#' + raw.split(' ').map(n => Number(n).toString(16).padStart(2, '0')).join(''), provenance.value)
    } else if (provenance.pointer?.startsWith('/rules/')) {
      const rule = evidence.rules[Number(provenance.pointer.slice('/rules/'.length))]
      assert.equal(rule.selector, provenance.selector)
      assert.deepEqual(rule.declarations, provenance.raw)
    }
  }
  for (const fingerprint of registry.sources) {
    assert.equal(sha(readFileSync(resolve(root, fingerprint.path))), fingerprint.worktreeSha256)
    assert.equal(sha(git('cat-file', 'blob', fingerprint.gitBlob)), fingerprint.gitSha256)
  }
  const rows = new Set(matrix.rows.map(row => row.id))
  assert.equal(rows.size, matrix.rows.length)
  assert.equal(matrix.globalReplays.length, matrix.rows.length)

  // 保守清单包含测试中的预期字符串；最终阶段账本须按 AST 语义细化，不能据词法计数放行。
  const candidates = git('ls-files', 'apps/web', 'packages/ui/src').toString().trim().split(/\r?\n/).filter(path => /\.(css|tsx?|mjs|jsx?)$/.test(path) && !path.includes('/baselines/'))
  const retired = new Set([...registry.entries.map(e => e.from), ...registry.additionalRetirements.map(e => e.from), ...registry.nonWmConsumers.map(e => e.from)])
  const references = []
  const files = []
  for (const path of candidates) {
    const bytes = readFileSync(resolve(root, path))
    const blob = git('rev-parse', `HEAD:${path}`).toString().trim()
    const gitBytes = git('cat-file', 'blob', blob)
    files.push({ path, worktreeBytes: bytes.length, worktreeSha256: sha(bytes), gitBlob: blob, gitBytes: gitBytes.length, gitSha256: sha(gitBytes), bytesEqual: bytes.equals(gitBytes) })
    const lines = withoutComments(bytes.toString('utf8')).split(/\r?\n/)
    const identities = new Map()
    lines.forEach((line, index) => {
      const expression = line.trim().replace(/\s+/g, ' ')
      for (const match of line.matchAll(/--[a-zA-Z][\w-]*/g)) {
        if (!retired.has(match[0])) continue
        const key = sha(`${path}\n${expression}\n${match[0]}`)
        const occurrence = (identities.get(key) ?? 0) + 1
        identities.set(key, occurrence)
        const after = line.slice(match.index + match[0].length)
        const before = line.slice(0, match.index)
        const role = /^\s*:/.test(after) ? '声明或实例生产者' : /var\(\s*$/.test(before) ? 'var 消费（含 fallback）' : '名称字符串／API 使用，须阶段 AST 分类'
        references.push({ file: path, line: index + 1, token: match[0], role, expression, identity: `${key}:${occurrence}`, target: mapping.get(match[0]) ?? registry.additionalRetirements.find(e => e.from === match[0])?.to ?? registry.nonWmConsumers.find(e => e.from === match[0])?.to, status: '未迁移' })
      }
    })
  }
  assert.throws(() => assertDeletionSafe(['--wm-canvas'], references), /禁止删除/)
  assert.throws(() => validateGraph(new Map([['--a', 'var(--b, var(--unknown))'], ['--b', 'red']])), /未知依赖/)
  assert.throws(() => validateGraph(new Map([['--a', 'var(--b)'], ['--b', 'var(--a)']])), /循环依赖/)
  assert.throws(() => validateGraph(new Map([['--wm-ref-text-secondary', 'var(--wm-ref-text-secondary)']])), /循环依赖/)
  assert.throws(() => validateGraph(new Map([['--consumer', 'var(--wm-status-color)']])), /未知依赖/)
  validateGraph(new Map([['--consumer', 'var(--wm-status-color)']]), registry.retainedRuntime)
  return { currentPlanID: source.currentPlanID, status: '静态前置核验通过；动态／视觉／CI 未运行', legacySlots: registry.entries.length, legacyDeclarations: baseline.declarations.length, graphScopesChecked: ['root', 'dark', 'compact', 'dark+compact'], negativeGuardsChecked: ['旧消费未零禁止删除', '嵌套未知依赖', '相互循环', '合并自引用', 'runtime 定义缺失'], matrixRows: matrix.rows.length, globalReplays: matrix.globalReplays.length, lexicalInventoryPolicy: '保守词法引用清单，不是已实现的 AST 阶段账本；包含声明和测试预期字符串，不能将总数直接作为消费数', cleanupAllowed: false, files, references }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verify()
  console.log(JSON.stringify(result, null, 2))
}
