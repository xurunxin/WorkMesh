import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const directory = 'docs/reviews/b1-b2/'
const target = resolve(root, directory, 'current-source.json')
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 })
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const read = path => readFileSync(resolve(root, path))
const json = path => JSON.parse(read(path).toString())
const historical = 'b80593e9918ac7ce05465fd0ac640c809753ac5a'
const frozenPaths = ['docs/plan/connector-recovery.md', ...['checks.json', 'plan-source.json', 'review-guide.md',
  'source-snapshot.json', 'test-coverage.json', 'todo-inputs.json', 'verify-plan.mjs'].map(path => directory + path)]
function row(path) {
  const bytes = read(path)
  const blobId = execFileSync('git', ['hash-object', '--path', path, '--stdin'], { cwd: root, input: bytes }).toString().trim()
  const blob = git('cat-file', 'blob', blobId) // capture 前先 stage，确保实际对象可读，不能只猜对象 ID。
  return { path, worktreeBytes: bytes.length, worktreeSha256: hash(bytes), gitBlobId: blobId,
    gitBlobBytes: blob.length, gitBlobSha256: hash(blob) }
}
function runtimePaths() {
  const files = []
  function visit(path) {
    for (const entry of readdirSync(resolve(root, path), { withFileTypes: true })) {
      if (['node_modules', 'dist', '.turbo', 'README.md', 'examples'].includes(entry.name)) continue
      const child = path + '/' + entry.name
      if (entry.isDirectory()) visit(child); else files.push(child)
    }
  }
  visit('apps/connector'); visit('apps/mcp/src'); visit('packages/contracts/src')
  return [...new Set([...files, '.gitattributes', '.github/workflows/ci.yml', 'AGENT_PROTOCOL.md', 'OPENAPI.yaml',
    'SCHEMA.sql', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.node-version', 'tsconfig.base.json',
    'vitest.config.ts', 'vitest.integration.config.ts', 'playwright.config.ts', 'turbo.json',
    'apps/api/package.json', 'apps/api/src/agent-connections.ts', 'apps/api/src/auth-idempotency.ts',
    'apps/api/integration/stage5-agent-connections.integration.test.ts', 'apps/api/integration/stage5-connector.integration.test.ts',
    'apps/web/app/attention-center.tsx', 'apps/web/app/attention-center-approval.test.tsx',
    'skills/workmesh/public-key.pem', 'apps/web/public/skills/workmesh-1.1.0.md',
    'scripts/ci-policy.mjs', 'scripts/ci-policy.test.mjs', 'scripts/ci-test-inputs.mjs', 'scripts/validate-ci.mjs',
    'scripts/test-connector-linux.sh', 'scripts/test-connector-windows.ps1', 'scripts/connector-secret-probe.mts'])].sort()
}
if (process.argv.includes('--capture')) {
  const files = runtimePaths().map(row)
  const bindings = []
  for (const [run, source] of [['static-04', 'source-before.json'], ['integration-02', 'source-before.json'],
    ['e2e-01', 'source-before.json'], ['windows-platform-04', 'source-before.json'], ['linux-native-04', 'resources.json'], ['policy-02', 'source-before.json']]) {
    const path = directory + `evidence/${run}/${source}`
    assert.ok(existsSync(resolve(root, path)), `Missing source: ${run}`)
    const captured = json(path); const observed = new Map((captured.files ?? captured.source).map(row => [row.path, row.sha256]))
    const relevant = path => {
      // 集成/E2E 不执行连接器平台测试与临时目录测试 helper；后续只增强这两个平台夹具，应用实现未变。
      if (['integration-02', 'e2e-01'].includes(run) && (path.startsWith('apps/connector/integration/') || path === 'apps/connector/test-support/resources.ts')) return false
      if (['integration-02', 'e2e-01'].includes(run) && path === 'scripts/test-connector-windows.ps1') return false
      // 策略检查不执行应用 TS 或原生存储；不能把其 source snapshot 中所有路径冒称执行过。
      if (run === 'policy-02') return path.startsWith('scripts/') || path === '.github/workflows/ci.yml' || path === 'turbo.json' || path.endsWith('package.json') || path === 'pnpm-lock.yaml'
      return true
    }
    const matched = files.filter(row => observed.has(row.path) && relevant(row.path))
    const differences = matched.filter(row => observed.get(row.path) !== row.worktreeSha256).map(row => row.path)
    assert.deepEqual(differences, [], `Final runtime source differs: ${run}`)
    bindings.push({ run, source: path, comparedFiles: matched.length, comparedPaths: matched.map(row => row.path), differences,
      result: '与该检查相关且已记录的源与最终源一致；快照存在不表示每文件都执行过，其他依赖见 main 基点及完整当前清单' })
  }
  const result = { bytePolicy: '工作树原字节与实际暂存 Git blob 分开；未冒称未提交工作已远端交付',
    branch: git('branch', '--show-current').toString().trim(), baselineHead: git('rev-parse', 'HEAD').toString().trim(),
    historicalPlanCommit: historical, latestMainReadViaPlatformGit: '1078bbcd527550bfabee73093b7ffd0032d3fd24',
    capturedAt: new Date().toISOString(), runtimeSourceId: hash(Buffer.from(JSON.stringify(files))), files, bindings,
    documentation: [directory + 'current-spec.md', 'apps/connector/examples/expectation.json'].map(row),
    gates: { independentResultReview: '待审', latestRequiredCI: '待当前提交 CI', actualMainDelivery: '未完成', macOS: '未运行', windowsOtherUser: '缺夹具，失败' } }
  writeFileSync(target, JSON.stringify(result, null, 2) + '\n')
}
const source = json(directory + 'current-source.json')
const gitOnly = process.argv.includes('--git-only')
for (const file of [...source.files, ...source.documentation]) {
  const actual = row(file.path)
  if (gitOnly) {
    for (const key of ['gitBlobId', 'gitBlobBytes', 'gitBlobSha256']) assert.equal(actual[key], file[key], `Current Git bytes changed: ${file.path}`)
  } else assert.deepEqual(actual, file, `Current source changed: ${file.path}`)
}
assert.equal(hash(Buffer.from(JSON.stringify(source.files))), source.runtimeSourceId)
assert.equal(hash(read(directory + 'current-spec.md')), json(directory + 'current-spec-source.json').utf8Sha256)
const plan = json(directory + 'plan-source.json').currentPlan
assert.equal(hash(read('docs/plan/connector-recovery.md')), plan.readableFileSha256)
assert.equal(hash(Buffer.from(json(directory + 'source-snapshot.json').planBody)), plan.sourceBodySha256)
for (const path of frozenPaths) {
  const approved = git('show', `${historical}:${path}`)
  const actualId = execFileSync('git', ['hash-object', '--path', path, '--stdin'], { cwd: root, input: read(path) }).toString().trim()
  assert.ok(git('cat-file', 'blob', actualId).equals(approved), `Frozen historical input changed: ${path}`)
}
assert.equal(git('diff', source.baselineHead, '--', 'SCHEMA.sql', 'packages/db', 'apps/api/src', 'apps/mcp/src', 'packages/contracts/src').length, 0)
assert.ok(!source.files.some(file => /\bwm[a-z]_[A-Za-z0-9_-]{43,}/.test(read(file.path).toString())), 'Plain credential shape in source')
console.log(JSON.stringify({ runtimeSourceId: source.runtimeSourceId, files: source.files.length, mode: gitOnly ? 'Git blob；历史运行原字节留在清单' : '工作树原字节与 Git blob', historicalPlanUnchanged: true,
  currentSpecVerified: true, zeroSchemaChanges: true, checkedBindings: source.bindings.map(({ run, comparedFiles, differences }) => ({ run, comparedFiles, differences })), gates: source.gates }, null, 2))
