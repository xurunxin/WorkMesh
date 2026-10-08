import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const bytes = path => readFileSync(new URL(path, new URL('../../../', import.meta.url)))
const json = path => JSON.parse(bytes(path).toString('utf8').replace(/^\uFEFF/, ''))
const hash = data => createHash('sha256').update(data).digest('hex')
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 })
const mapping = json('apps/web/features/navigation/theme-token-migration.json')
const baseline = json(mapping.baselinePath)
const matrix = json('docs/reviews/d1b/surface-matrix.json')
const inventory = json('docs/reviews/d1b/consumer-inventory.json')
const binding = json('docs/reviews/d1b/execution-binding.json')
const coverage = json('docs/reviews/d1b/test-coverage.json')
const checks = []
function check(name, fn) {
  fn()
  checks.push({ name, result: '通过' })
}

check('原175条声明与115槽完整覆盖，不允许重名覆盖', () => {
  assert.equal(mapping.oldDeclarationCount, 175)
  assert.equal(mapping.oldUniqueTokenCount, 115)
  assert.equal(mapping.entries.length, 115)
  assert.equal(new Set(mapping.entries.map(e => e.oldToken)).size, 115)
  assert.deepEqual(mapping.entries.flatMap(e => e.declarations.map(d => ({ selector: d.selector, token: e.oldToken, value: d.oldValue })))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  [...baseline.declarations].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
  const targets = new Map()
  for (const e of mapping.entries) targets.set(e.newToken, [...(targets.get(e.newToken) ?? []), e.oldToken])
  assert.deepEqual([...targets.values()].filter(v => v.length > 1), [['--wm-text-muted', '--wm-muted']])
  assert.equal(targets.size, 114)
})

check('实际原测量字节与 SOURCE-MANIFEST 一致，JSON指针可解析', () => {
  const source = json('docs/references/todos-analysis/SOURCE-MANIFEST.json')
  for (const f of source.files) {
    const data = bytes(f.repository_path)
    assert.equal(data.length, f.bytes)
    assert.equal(hash(data), f.sha256)
  }
  for (const e of mapping.entries) {
    assert.ok(e.evidence.length > 0, e.oldToken)
    for (const p of e.evidence.filter(p => p.pointer)) {
      let value = json(p.path)
      for (const key of p.pointer.slice(1).split('/').map(k => k.replace(/~1/g, '/').replace(/~0/g, '~'))) value = value[key]
      assert.deepEqual(value, p.raw, `${e.oldToken}: ${p.pointer}`)
    }
  }
  assert.equal(mapping.entries.find(e => e.oldToken === '--wm-danger').kind, 'user-approved-candidate')
  assert.equal(mapping.entries.find(e => e.oldToken === '--wm-surface').kind, 'reference-design-adoption')
})

check('设计图的全部依赖有目标定义，各作用域无循环且暗色同值', () => {
  const retired = new Set(mapping.entries.map(e => e.oldToken))
  const declarations = new Map()
  for (const e of mapping.entries) {
    for (const d of e.declarations) {
      const key = `${d.selector}:${e.newToken}`
      if (declarations.has(key)) assert.equal(declarations.get(key).targetValue, d.targetValue, key)
      declarations.set(key, d)
      if (d.selector === "[data-wm-theme='dark']" && !d.oldValue.includes('var(')) assert.equal(d.targetValue, d.oldValue)
      for (const dep of d.dependencies) assert.ok(!retired.has(dep), dep)
    }
  }
  const rootValues = new Map(mapping.entries.flatMap(e => e.declarations.filter(d => d.selector === ':root').map(d => [e.newToken, d])))
  for (const scope of new Set(mapping.entries.flatMap(e => e.declarations.map(d => d.selector)))) {
    const resolved = new Map(rootValues)
    for (const e of mapping.entries) for (const d of e.declarations.filter(d => d.selector === scope)) resolved.set(e.newToken, d)
    const visited = new Set()
    function visit(token, path = new Set()) {
      assert.ok(!path.has(token), `循环: ${[...path, token].join(' → ')}`)
      assert.ok(resolved.has(token), `缺定义: ${token}`)
      if (visited.has(token)) return
      const next = new Set([...path, token])
      for (const dep of resolved.get(token).dependencies) visit(dep, next)
      visited.add(token)
    }
    for (const token of resolved.keys()) visit(token)
  }
  assert.equal(mapping.additionalRetirements[0].oldToken, '--wm-ref-danger-candidate')
  assert.equal(mapping.preservedReferenceSlots[0].token, '--wm-ref-text-dim')
})

check('三个运行时生产者及实际未声明依赖一致，非wm fallback 纳入', () => {
  assert.deepEqual(mapping.runtimeTokens.map(r => r.token).sort(), ['--wm-dismissal-depth', '--wm-overlay-depth', '--wm-status-color'])
  for (const r of mapping.runtimeTokens) for (const p of r.producers) assert.ok(bytes(p.file).toString('utf8').includes(p.marker))
  const declared = new Set([...baseline.declarations.map(d => d.token), ...mapping.runtimeTokens.map(r => r.token)])
  const unknown = inventory.files.flatMap(f => f.references.filter(r => r.token.startsWith('--wm-') && !r.token.startsWith('--wm-ref-') && !declared.has(r.token)))
  assert.deepEqual(unknown, [])
  assert.equal(mapping.nonWmMigrations.length, 6)
  for (const e of mapping.nonWmMigrations) assert.ok(inventory.files.find(f => f.file === e.file).references.some(r => r.token === e.oldToken))
})

check('生产源码前后指纹不变，工作区与 Git 字节分别核对', () => {
  for (const f of inventory.sourceFiles) {
    const data = bytes(f.path)
    const blob = git(['cat-file', 'blob', f.gitBlob])
    assert.equal(data.length, f.worktreeBytes, f.path)
    assert.equal(hash(data), f.worktreeSha256, f.path)
    assert.equal(blob.length, f.gitBytes, f.path)
    assert.equal(hash(blob), f.gitSha256, f.path)
    // 使用 Git 的路径转换核对内容，不能把 Windows 检出 CRLF 冒作 Git 字节。
    assert.equal(git(['hash-object', '--path', f.path, f.path]).toString().trim(), f.gitBlob, f.path)
  }
})

check('已审计划四件原字节保留，当前未实读的doc不冒填', () => {
  for (const f of [binding.reviewedPlanBody, ...binding.reviewedArtifacts]) {
    const blob = git(['cat-file', 'blob', f.gitBlob])
    assert.equal(hash(bytes(f.path)), f.gitSha256)
    assert.equal(hash(blob), f.gitSha256)
    assert.deepEqual(blob, bytes(f.path))
  }
  assert.equal(binding.currentPlanID, null)
  assert.equal(binding.handoffPlanID, 'doc:nnchKV-O25SWiYsj3hXgm')
  assert.equal(binding.planVersion, null)
})

check('115矩阵行和115全局复验保留待运行/评审，清旧不放行', () => {
  assert.equal(matrix.rows.length, 115)
  assert.equal(matrix.globalReplays.length, 115)
  assert.equal(new Set(matrix.rows.map(r => r.id)).size, 115)
  assert.equal(matrix.variants.length, 4)
  for (const r of matrix.rows) {
    assert.equal(r.canonical.observedURL, null)
    assert.equal(r.evidence.filesExist, false)
    assert.equal(r.checks.reviewRecord, null)
    assert.equal(r.checks.stopBeforeNextSurface, true)
  }
  for (const gate of Object.values(matrix.cleanupGate)) assert.equal(gate, false)
})

check('原五测试、DoD和九类适用性完整承接，后续责任保留', () => {
  assert.equal(coverage.feature.originalTests.length, 5)
  assert.equal(coverage.feature.originalDoD.length, 1)
  assert.equal(coverage.feature.matrix.length, 9)
  assert.equal(coverage.feature.matrix.filter(m => m.applicable).length, 1)
  assert.deepEqual(coverage.followups.map(f => f.seqNum), [12, 13, 14, 22])
  for (const id of [12, 13, 14, 22]) assert.ok(bytes(`docs/plan/activation-task-specs/${id}.md`).toString('utf8').includes('D1b 已授权 UI 方向同步'))
})

process.stdout.write(JSON.stringify({ kind: 'workmesh.d1b.document-preflight-check', runtime: process.version,
  checks, result: '仅文档静态核验通过；不代表阶段扫描、界面运行、视觉批准或最终验收',
  sourceFingerprint: hash(Buffer.from(JSON.stringify(inventory.sourceFiles.map(f => [f.path, f.gitBlob, f.worktreeSha256])))),
  skip: [], servicesStarted: false }, null, 2) + '\n')
