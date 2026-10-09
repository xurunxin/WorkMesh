import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = resolve(import.meta.dirname, '../../..')
const main = 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d'
const git = args => {
  const result = spawnSync('git', args, { cwd: root, maxBuffer: 30_000_000, windowsHide: true })
  if (result.status !== 0) throw Error('候选 Git 对象不可读')
  return result.stdout
}
const head = git(['rev-parse', 'HEAD']).toString().trim()
const paths = git(['diff', '--name-only', '-z', main, head, '--', 'apps', 'packages', 'scripts', 'infra', 'deploy', 'OPENAPI.yaml', 'docker-compose.lite.yml', 'playwright.config.ts']).toString().split('\0').filter(Boolean)
if (paths.some(path => path.startsWith('apps/web/') || path === 'playwright.config.ts' || path.includes('/migrations/'))) throw Error('候选包含延期 UI 或未批迁移')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const bytes = git(['diff', '--binary', main, head, '--', ...paths])
writeFileSync(resolve(import.meta.dirname, 'candidate-product.patch.gz'), gzipSync(bytes))
const files = paths.map(path => {
  const blob = git(['show', `${head}:${path}`]); const raw = readFileSync(resolve(root, path))
  return { path, gitBlob: { bytes: blob.length, sha256: sha(blob) }, worktree: { bytes: raw.length, sha256: sha(raw) }, sameBytes: raw.equals(blob),
    purpose: path.startsWith('scripts/verify-a2-backend') ? '独立 Lite 后端验收入口，须本轮实际安装执行' : path.startsWith('infra/') || path.startsWith('deploy/') || path === 'docker-compose.lite.yml' ? '独立构建期代理兼容' : '已审仓库后端 hunk' }
})
writeFileSync(resolve(import.meta.dirname, 'candidate-source.json'), JSON.stringify({ main, sourceHead: head, observedAt: new Date().toISOString(),
  productDiff: { path: 'candidate-product.patch.gz', rawBytes: bytes.length, rawSha256: sha(bytes) }, files,
  historicalUiPreservedAt: '3f0227876461', currentSpec: 'current-spec.md',
  consumerCheck: 'main Web 无 repository 配置消费者；SDK listRepositories/getRepositoryContext 使用通用 transport，不将新增 DTO 强加到现有客户端；MCP 既有只读工具消费该 SDK',
  acceptance: '本文件绑定候选源码，不代表独审、最新 CI、actual main 或旧 UI 视觉通过' }, null, 2) + '\n')
console.log(JSON.stringify({ sourceHead: head, backendAndDeploymentFiles: files.length, deferredUiFiles: 0 }))
