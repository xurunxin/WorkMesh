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

// 读取实际 index blob；提交后它与 HEAD 一致。工作区字节单独保存，不能用 LF 假设替代。
export function fingerprintFiles(paths) {
  const index = new Map(git('ls-files', '--stage').toString().trim().split(/\r?\n/).map(line => {
    const match = /^\d+ ([a-f0-9]+) 0\t(.+)$/.exec(line)
    assert(match, `index 不可读或有冲突：${line}`)
    return [match[2], match[1]]
  }))
  const sorted = [...new Set(paths)].sort()
  const ids = [...new Set(sorted.map(path => {
    assert(index.has(path), `文件必须先加入 index：${path}`)
    return index.get(path)
  }))]
  const batch = gitWithInput(ids.join('\n') + '\n')
  const blobs = new Map()
  let offset = 0
  for (const id of ids) {
    const end = batch.indexOf(10, offset)
    const header = /^([a-f0-9]+) blob (\d+)$/.exec(batch.subarray(offset, end).toString())
    assert(header && header[1] === id, `无法读取 blob ${id}`)
    const size = Number(header[2])
    const bytes = batch.subarray(end + 1, end + 1 + size)
    assert.equal(bytes.length, size)
    assert.equal(batch[end + 1 + size], 10)
    blobs.set(id, bytes)
    offset = end + 2 + size
  }
  assert.equal(offset, batch.length)
  return sorted.map(path => {
    const bytes = readFileSync(resolve(root, path))
    const gitBlob = index.get(path)
    const gitBytes = blobs.get(gitBlob)
    return { path, gitBlob, gitBytes: gitBytes.length, gitSha256: sha(gitBytes), worktreeBytes: bytes.length, worktreeSha256: sha(bytes), bytesEqual: bytes.equals(gitBytes), gitObjectKind: 'actual-index-blob' }
  })
}

function gitWithInput(input) {
  return execFileSync('git', ['cat-file', '--batch'], { cwd: root, input, maxBuffer: 64 * 1024 * 1024 })
}

export function verifyArtifactBindings(artifacts) {
  assert(artifacts.length > 0, '当前成果绑定不能为空')
  const actual = fingerprintFiles(artifacts.map(artifact => artifact.path))
  assert.deepEqual(actual, artifacts, '当前成果的 Git/index 与工作区双字节绑定过期')
  return actual
}

export function assertRuntimeDefinitions(definitions, readSource = read) {
  for (const definition of definitions) {
    for (const marker of [...definition.producers, ...definition.cleanup, ...definition.consumers]) {
      assert(withoutComments(readSource(marker.file)).includes(marker.expression), `${definition.token} 缺少生产者／清除／消费：${marker.expression}`)
    }
    if (definition.fallback) assert(withoutComments(readSource(definition.fallback.file)).includes(definition.fallback.expression), `${definition.token} fallback 缺失`)
  }
}

export function sourcePaths() {
  return git('ls-files', 'apps/web', 'packages/ui/src').toString().trim().split(/\r?\n/).filter(path => /\.(css|tsx?|mjs|jsx?)$/.test(path) && !path.includes('/baselines/'))
}

export function executionInputPaths() {
  const binding = json('docs/reviews/d1b/plan-binding.json')
  return [...new Set([...sourcePaths(), ...binding.artifacts.map(artifact => artifact.path), ...registry.sources.map(input => input.path), ...binding.inputFiles.map(input => input.path), ...binding.matrixInputs.map(input => input.path), 'docs/reviews/d1b/plan-binding.json'])].sort()
}

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
  const binding = json('docs/reviews/d1b/plan-binding.json')
  const artifactBinding = verifyArtifactBindings(binding.artifacts)
  assert.equal(binding.currentPlanID, source.currentPlanID)
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
  assert.deepEqual(registry.runtimeDefinitions.map(definition => definition.token), registry.retainedRuntime)
  assertRuntimeDefinitions(registry.runtimeDefinitions)
  const declaredNames = new Set(current.map(declaration => declaration.token))
  const undefinedCssDependencies = [...new Set(dependencies(withoutComments(read(cssPath))).filter(name => !declaredNames.has(name)))].sort()
  assert.deepEqual(undefinedCssDependencies, [...registry.retainedRuntime].sort(), 'CSS 实例依赖登记不完整')
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
  const candidates = sourcePaths()
  const retired = new Set([...registry.entries.map(e => e.from), ...registry.additionalRetirements.map(e => e.from), ...registry.nonWmConsumers.map(e => e.from)])
  const references = []
  const files = fingerprintFiles(candidates)
  for (const path of candidates) {
    const bytes = readFileSync(resolve(root, path))
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
  for (const definition of registry.runtimeDefinitions) {
    const values = new Map([['--consumer', `var(${definition.token}, 0)`]])
    assert.throws(() => validateGraph(values), /未知依赖/)
    validateGraph(values, registry.retainedRuntime)
    const firstProducer = definition.producers[0]
    assert.throws(() => assertRuntimeDefinitions([definition], path => read(path).replace(firstProducer.expression, '')), /缺少生产者/)
    if (definition.cleanup.length > 0) {
      const marker = definition.cleanup[0]
      assert.throws(() => assertRuntimeDefinitions([definition], path => read(path).replace(marker.expression, '')), /缺少生产者／清除/)
    }
    if (definition.fallback) {
      const marker = definition.fallback
      assert.throws(() => assertRuntimeDefinitions([definition], path => read(path).replaceAll(marker.expression, '')), /fallback 缺失|缺少生产者／清除／消费/)
    }
  }
  const staleArtifact = { ...artifactBinding[0], worktreeSha256: '0'.repeat(64) }
  assert.throws(() => verifyArtifactBindings([staleArtifact]), /绑定过期/)
  return {
    currentPlanID: source.currentPlanID, status: '静态前置核验通过；动态／视觉／CI 未运行',
    legacySlots: registry.entries.length, legacyDeclarations: baseline.declarations.length,
    graphScopesChecked: ['root', 'dark', 'compact', 'dark+compact'],
    negativeGuardsChecked: ['旧消费未零禁止删除', '嵌套未知依赖', '相互循环', '合并自引用', 'runtime 定义缺失', '各实例生产者／清除／fallback 缺失', '当前成果绑定过期'],
    runtimeDefinitionsChecked: registry.runtimeDefinitions,
    matrixRows: matrix.rows.length, globalReplays: matrix.globalReplays.length,
    lexicalInventoryPolicy: '保守词法引用清单，不是已实现的 AST 阶段账本；包含声明和测试预期字符串，不能将总数直接作为消费数',
    cleanupAllowed: false,
    artifactBinding,
    inputBinding: fingerprintFiles(executionInputPaths()),
    executionRecord: 'docs/reviews/d1b/evidence/preflight-execution.json',
    files, references,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verify()
  console.log(JSON.stringify(result, null, 2))
}
