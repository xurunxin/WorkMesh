import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const base = resolve(root, 'docs/reviews/b1-b2/evidence')
const containers = [], temporaryPaths = [], events = [], retainedGeneratedOutputs = []
for (const entry of readdirSync(base, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const path = resolve(base, entry.name, 'resources.json')
  if (!existsSync(path)) continue
  const source = JSON.parse(readFileSync(path, 'utf8'))
  const resources = Array.isArray(source) ? source : [source]
  for (const resource of resources) {
    if (resource.id) {
      let verifiedAbsent = false
      try { execFileSync('docker', ['inspect', resource.id], { stdio: 'pipe' }) }
      catch (error) { if (/No such (object|container)/i.test(error.stderr?.toString() ?? '')) verifiedAbsent = true; else throw error }
      containers.push({ run: entry.name, id: resource.id, name: resource.name, image: resource.image,
        recordedCleaned: resource.cleaned, verifiedAbsent })
    }
    const temporary = resource.temporary ?? resource.path
    if (resource.retainedReason) { retainedGeneratedOutputs.push({ path: temporary, reason: resource.retainedReason, verifiedPresent: existsSync(temporary) }); continue }
    if (temporary) temporaryPaths.push({ run: entry.name, path: temporary, recordedCleaned: resource.temporaryCleaned ?? resource.cleaned, verifiedAbsent: !existsSync(temporary) })
  }
}
function visit(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === 'playwright-runtime') continue
    const child = resolve(path, entry.name)
    if (entry.isDirectory()) visit(child)
    else if (entry.name.endsWith('.log')) {
      for (const line of readFileSync(child, 'utf8').split('\n')) {
        const at = line.indexOf('{"resource":'); if (at < 0) continue
        const event = JSON.parse(line.slice(at).trim())
        events.push({ ...event, log: child.slice(root.length + 1).replaceAll('\\', '/') })
      }
    }
  }
}
visit(base)
const sharedImages = []
for (const name of ['postgres:16-alpine', 'redis:7-alpine', 'rustfs/rustfs:1.0.0', 'node:22.19.0-bookworm']) {
  const id = execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', name], { encoding: 'utf8', stdio: 'pipe' }).trim()
  sharedImages.push({ name, id, state: '保留', reason: '公共基础镜像，未构建任务专用镜像；不对共享镜像做 prune' })
}
const result = { collectedAt: new Date().toISOString(), ownership: '仅 01a11ac2-b1-b2 已登记资源；未枚举/删除其他任务资源或持久数据',
  containers, temporaryPaths, events, sharedImages, retainedGeneratedOutputs,
  allRecordedContainersAbsent: containers.every(row => row.recordedCleaned === true && row.verifiedAbsent),
  allRecordedTemporaryPathsAbsent: temporaryPaths.every(row => row.recordedCleaned === true && row.verifiedAbsent),
  runtime: JSON.parse(readFileSync(resolve(base, 'node-runtime.json'), 'utf8')),
  probe: JSON.parse(readFileSync(resolve(base, 'probe-cleanup.json'), 'utf8')),
  retainedWorkspaces: [
    { path: root, reason: '当前构建与待复核产品/证据，actual main 尚未落地，保留' },
    { path: 'C:/Users/xurx/.tds/workspaces/01a1187a-f0f1-74d9-a5e7-0022c903a6e6', reason: '旧 dirty 工作区只读盘点；部分骨架已保全，其他历史工作/日志原位保留，尚未达到正式清理条件' },
  ], earlierResourceGap: '增强登记前的单元/平台随机临时路径及秘密引用无完整 ID 日志；测试 finally 清理与断言保留，末尾只读定向扫描另核验，不补造历史 ID。',
  configuration: '所有验证夹具变量仅存在于本轮子 shell/子进程；API 夹具 finally 恢复 WEB_ORIGIN/PUBLIC_MCP_ORIGIN；没有修改机器 Node、daemon 或 Docker 全局配置。' }
if (!result.allRecordedContainersAbsent || !result.allRecordedTemporaryPathsAbsent) throw new Error('已登记资源仍有清理缺口')
writeFileSync(resolve(base, 'cleanup.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ containers: containers.length, containersAbsent: result.allRecordedContainersAbsent, temporaryPaths: temporaryPaths.length, events: events.length, sharedImagesRetained: sharedImages.length }))
