import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '../../..')
const runId = process.argv[2], phase = process.argv[3]
if (!/^a2-lite-[a-f0-9]{8}$/.test(runId) || !['before-browser', 'after-install'].includes(phase)) throw Error('需要精确本任务 Lite 运行与合法阶段')
const directory = resolve(import.meta.dirname, 'runs', runId)
const receipt = JSON.parse(readFileSync(resolve(directory, 'receipts.json'), 'utf8'))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const normalized = bytes => Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'))
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
if (head !== receipt.sha) throw Error('宿主 HEAD 与镜像输入已不同，不能绑定为相同')
const paths = ['infra/docker/lite.Dockerfile', 'docker-compose.lite.yml', 'apps/web/next.config.ts', 'scripts/verify-a2-lite.mjs',
  'apps/web/playwright.a2-lite.config.ts', 'apps/web/e2e/configuration-readiness.spec.ts', 'apps/web/e2e/fixtures/configuration-readiness.ts',
  'apps/web/e2e/fixtures/configuration-readiness-provider.ts', 'apps/web/features/projects/project-repository-configuration.tsx',
  'apps/web/app/lib/i18n.tsx']
const before = phase === 'after-install' ? JSON.parse(readFileSync(resolve(directory, 'source-before-browser.json'), 'utf8')) : null
const files = paths.map(path => {
  const bytes = readFileSync(resolve(root, path)), target = resolve(directory, 'source', `host-${phase}`, path)
  mkdirSync(dirname(target), { recursive: true }); copyFileSync(resolve(root, path), target)
  if (before) return { path, bytes: bytes.length, sha256: sha256(bytes), matchesBeforeBrowser: before.files.find(item => item.path === path)?.worktree.sha256 === sha256(bytes) }
  const blob = spawnSync('git', ['show', `${head}:${path}`], { cwd: root, maxBuffer: 5_000_000 })
  if (blob.status !== 0) throw Error(`缺镜像 Git blob：${path}`)
  return { path, worktree: { bytes: bytes.length, sha256: sha256(bytes) }, gitBlob: { bytes: blob.stdout.length, sha256: sha256(blob.stdout) }, exact: bytes.equals(blob.stdout), onlyCRLF: normalized(bytes).equals(normalized(blob.stdout)) }
})
writeFileSync(resolve(directory, `source-${phase}.json`), JSON.stringify({ observedAt: new Date().toISOString(), phase: before ? '实际安装及收尾结束后实读' : '镜像构建期间浏览器启动前实读；非进程启动时快照', head, files }, null, 2) + '\n')
console.log(JSON.stringify({ runId, phase, allMatch: files.every(item => before ? item.matchesBeforeBrowser : item.onlyCRLF) }))
