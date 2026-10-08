import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd(), base = 'docs/reviews/b1-b2/'
const ansi = process.argv.includes('--ansi')
const main = '96e724858e692d262107c34db50b40c3ae7c122c'
const combinedHead = ansi ? '76369131ef6de844813fe40a8df519c8fbbf29ed' : main
const manifest = base + (ansi ? 'ansi-source.json' : 'revision-source.json')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const read = path => readFileSync(resolve(root, path))
const json = path => JSON.parse(read(path).toString())
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 })
function row(path) {
  const bytes = read(path), blobId = execFileSync('git', ['hash-object', '--path', path, '--stdin'], { input: bytes, cwd: root }).toString().trim()
  const blob = git('cat-file', 'blob', blobId)
  return { path, worktreeBytes: bytes.length, worktreeSha256: hash(bytes), gitBlobId: blobId, gitBlobBytes: blob.length, gitBlobSha256: hash(blob) }
}
const paths = new Set(json(base + 'current-source.json').files.map(row => row.path))
function relevant(run, path) {
  if (run.includes('linux') || run.includes('windows') || run.includes('unit-')) {
    return path.startsWith('apps/connector/') || path.startsWith('packages/contracts/') || path.startsWith('skills/workmesh/')
      || path.startsWith('apps/web/public/skills/') || path.startsWith('pnpm-') || path.startsWith('scripts/test-connector-')
      || path === 'scripts/connector-secret-probe.mts' || ['package.json', 'tsconfig.base.json', 'vitest.config.ts'].includes(path)
  }
  return true
}
function visit(path) {
  for (const entry of readdirSync(resolve(root, path), { withFileTypes: true })) {
    if (['node_modules', 'dist', '.turbo', 'README.md', 'examples'].includes(entry.name)) continue
    const child = path + '/' + entry.name
    if (entry.isDirectory()) visit(child); else paths.add(child)
  }
}
visit('apps/connector'); visit('packages/contracts/src')
for (const path of ['apps/api/src/server.ts', 'apps/api/src/authz/authorize.ts', 'apps/api/src/configuration-readiness.ts',
  'apps/api/integration/configuration-readiness.integration.test.ts', 'docs/route-policy-matrix.md']) paths.add(path)
if (process.argv.includes('--capture')) {
  const files = [...paths].sort().map(row), bindings = []
  for (const run of readdirSync(resolve(root, base + 'evidence'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('revision-')).map(entry => entry.name)) {
    const path = base + `evidence/${run}/`
    if (run.includes('linux')) {
      const captured = json(path + 'resources.json'), observed = new Map(captured.source.map(row => [row.path, row.sha256]))
      const compared = files.filter(file => observed.has(file.path) && relevant(run, file.path))
      const differences = compared.filter(file => observed.get(file.path) !== file.worktreeSha256).map(file => file.path)
      bindings.push({ run, source: path + 'resources.json', exitCode: captured.exitCode, comparedFiles: compared.length, differences,
        finalSource: differences.length === 0, scope: '容器中实际复制源；不把非连接器 main 文件当作平台测试执行范围' })
    } else {
      const before = json(path + 'source-before.json'), after = json(path + 'source-after.json')
      const observed = new Map(before.files.map(row => [row.path, row.sha256])), ended = new Map(after.files.map(row => [row.path, row.sha256]))
      const compared = files.filter(file => observed.has(file.path) && relevant(run, file.path))
      const differences = compared.filter(file => observed.get(file.path) !== file.worktreeSha256).map(file => file.path)
      const changedDuringRun = before.files.filter(file => relevant(run, file.path) && ended.get(file.path) !== file.sha256).map(file => file.path)
      bindings.push({ run, source: path + 'source-before.json', checks: json(path + 'checks.json'), comparedFiles: compared.length,
        differences, changedDuringRun, finalSource: differences.length === 0 && changedDuringRun.length === 0,
        scope: '历史源不同或运行期间变动如实列出，不作为最终组合通过；适用补查见报告' })
    }
  }
  writeFileSync(resolve(root, manifest), JSON.stringify({ capturedAt: new Date().toISOString(),
    historicalProductCommit: ansi ? '375990f10d73679f3c0724d21e8d7c58b3d8bd9b' : '903573a873538613c054a4f9732c321587b0a45e', integratedMain: main,
    ...(ansi ? { unlandedCombination: { head: combinedHead, owner: '#15 C1', mainProof: false,
      commonAncestor: main, reason: '共享缓存 FETCH_HEAD 被误判为 main；Chief 已纠正，跨分支组合保全，不冒主线落地或 CI 成功' } } : {}),
    bytePolicy: '运行工作树与实际暂存 Git blob 分开；先 stage 再 capture；审查证据更新不引发产品重测',
    runtimeSourceId: hash(Buffer.from(JSON.stringify(files))), files, bindings,
    gates: { threeOSCI: '未闭合', windowsSecondUser: '本机缺夹具，失败', macOS: '未运行', requiredCI: '未取得修订提交成功结果',
      resultReview: '待本轮复审', actualMain: '连接器尚未合入' } }, null, 2) + '\n')
}
const source = json(manifest), gitOnly = process.argv.includes('--git-only')
for (const file of source.files) {
  const actual = row(file.path)
  if (gitOnly) for (const key of ['gitBlobId', 'gitBlobBytes', 'gitBlobSha256']) assert.equal(actual[key], file[key], file.path)
  else assert.deepEqual(actual, file, file.path)
}
assert.equal(hash(Buffer.from(JSON.stringify(source.files))), source.runtimeSourceId)
for (const name of ['current-source.json', 'current-spec.md', 'current-spec-source.json', 'plan-source.json', 'source-snapshot.json']) {
  const path = base + name
  assert.ok(git('cat-file', 'blob', row(path).gitBlobId).equals(git('show', `903573a873538613c054a4f9732c321587b0a45e:${path}`)))
}
assert.equal(git('diff', combinedHead, '--', 'SCHEMA.sql', 'packages/db', 'apps/api/src', 'apps/mcp/src', 'packages/contracts/src').length, 0)
console.log(JSON.stringify({ runtimeSourceId: source.runtimeSourceId, files: source.files.length,
  mode: gitOnly ? 'Git blob' : '工作树与 Git blob', zeroOwnSchemaChanges: true, mainSafetyPreserved: true, historicalEvidenceUnchanged: true,
  actualMain: main, unlandedCombination: ansi ? combinedHead : null,
  finalSourceRuns: source.bindings.filter(row => row.finalSource).map(row => row.run), gates: source.gates }, null, 2))
