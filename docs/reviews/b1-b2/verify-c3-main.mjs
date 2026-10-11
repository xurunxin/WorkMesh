import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

// 仅为此次真正 main 整合保存独立证据，不重写已审来源或平台缺口。
const base = 'docs/reviews/b1-b2/', main = '18252ba8761aa810c3fd12d31ecae83e8b24d985'
const previous = '7ea518a8aed920b53bd2c0e16b6a4e8b2a209e47'
const oldMain = '5b9c76b5f79917697906520edcd6947bfbfa925f'
const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 })
const text = (...args) => git(...args).toString().trim()
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const names = (...args) => text(...args).split('\n').filter(Boolean)
const incoming = names('diff', '--name-only', oldMain, main)
const inputs = new Set(json(base + 'raw-source.json').files.map(row => row.path))
for (const path of incoming) if (!path.startsWith('docs/')) inputs.add(path)
function row(path) {
  const bytes = readFileSync(path)
  const blobId = execFileSync('git', ['hash-object', '--path', path, '--stdin'], { input: bytes }).toString().trim()
  const blob = git('cat-file', 'blob', blobId)
  return { path, worktreeBytes: bytes.length, worktreeSha256: hash(bytes), gitBlobId: blobId, gitBlobSha256: hash(blob) }
}
const manifestPath = base + 'c3-main-source.json'
if (process.argv.includes('--capture')) {
  const files = [...inputs].sort().map(row), checks = []
  for (const run of ['revision-c3-impact-01', 'revision-c3-integration-01']) {
    const directory = base + 'evidence/' + run + '/'
    const before = json(directory + 'source-before.json'), after = json(directory + 'source-after.json')
    const observed = new Map(before.files.map(file => [file.path, file.sha256]))
    const ended = new Map(after.files.map(file => [file.path, file.sha256]))
    const compared = files.filter(file => observed.has(file.path))
    const differences = compared.filter(file => file.worktreeSha256 !== observed.get(file.path)).map(file => file.path)
    const changedDuringRun = compared.filter(file => ended.get(file.path) !== observed.get(file.path)).map(file => file.path)
    assert.deepEqual(differences, []); assert.deepEqual(changedDuringRun, [])
    checks.push({ run, commands: json(directory + 'checks.json'), comparedFiles: compared.length, differences, changedDuringRun,
      scope: run.includes('impact') ? '类型/契约/路由检查的既有捕获范围；C3 新模型目录通过实际单元命令验证，不冒全部源码在运行前已逐字节捕获' : '包含 config、模型目录原始文件和真实 server 的运行前后捕获范围' })
  }
  writeFileSync(manifestPath, JSON.stringify({ capturedAt: new Date().toISOString(), previousReviewedHead: previous,
    integratedMain: main, incomingPaths: incoming, files, sourceId: hash(Buffer.from(JSON.stringify(files))), checks,
    gates: { reviewedConnectorSource: '7ea518 的 ANSI/权限/stderr 独审已闭，不重新打开', combinationReview: '本轮实际 main 增量与检查待定向读回',
      threeOS: '仍待新 head 的三系统原生与 Required CI', windows: '历史两项缺第二用户夹具失败', macOS: '历史未测', actualMain: '连接器未合入' }
  }, null, 2) + '\n')
}
const manifest = json(manifestPath), committed = process.argv.includes('--committed')
const head = text('rev-parse', 'HEAD')
for (const file of manifest.files) {
  assert.deepEqual(row(file.path), file, file.path)
  if (committed) assert.equal(text('rev-parse', `${head}:${file.path}`), file.gitBlobId, file.path)
}
assert.equal(hash(Buffer.from(JSON.stringify(manifest.files))), manifest.sourceId)
assert.equal(text('diff', main, '3fcfdb5c99be5de8c0f3e07f4ad0b2d29b76a0c7'), '')
assert.equal(text('diff', previous, '--', 'apps/connector', 'apps/mcp', 'skills/workmesh', 'apps/web/public/skills', 'pnpm-lock.yaml'), '')
assert.equal(text('diff', main, '--', 'SCHEMA.sql', 'packages/db', 'apps/api/src', 'packages/contracts/src', 'packages/config/src'), '')
for (const path of names('ls-tree', '-r', '--name-only', previous, '--', base)) {
  if ([base + 'run-local.mjs', base + 'collect-revision-cleanup.mjs', base + 'evidence/raw-evidence-index.json', base + 'evidence/raw-evidence.zip'].includes(path)) continue
  assert.equal(row(path).gitBlobId, text('rev-parse', `${previous}:${path}`), `历史材料：${path}`)
}
console.log(JSON.stringify({ head, main, files: manifest.files.length, sourceId: manifest.sourceId,
  connectorUnchanged: true, mainProductPreserved: true, historicalReportsPreserved: true, committed }, null, 2))
