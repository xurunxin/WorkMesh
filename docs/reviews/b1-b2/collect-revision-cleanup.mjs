import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { readRawEvidenceArchive, resolveEvidenceBytes } from '../../../scripts/verify-raw-evidence-archive.mjs'
const base = resolve('docs/reviews/b1-b2/evidence'), containers = [], temporaryPaths = [], events = []
const archive = existsSync(resolve(base, 'raw-evidence-index.json'))
  ? readRawEvidenceArchive(JSON.parse(readFileSync(resolve(base, 'raw-evidence-index.json'), 'utf8')), readFileSync(resolve(base, 'raw-evidence.zip'))) : null
for (const run of readdirSync(base, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name.startsWith('revision-')).map(entry => entry.name)) {
  const directory = resolve(base, run)
  for (const file of ['resources.json', 'node-runtime.json']) {
    if (!existsSync(resolve(directory, file))) continue
    const parsed = JSON.parse(readFileSync(resolve(directory, file), 'utf8'))
    for (const resource of Array.isArray(parsed) ? parsed : [parsed]) {
      if (resource.id) {
        let absent = false
        try { execFileSync('docker', ['inspect', resource.id], { stdio: 'pipe' }) }
        catch (error) { absent = /No such (?:object|container)/i.test(error.stderr?.toString() ?? '') }
        containers.push({ run, id: resource.id, name: resource.name, image: resource.image, recordedCleaned: resource.cleaned, verifiedAbsent: absent })
      }
      const path = resource.temporary ?? resource.path
      if (path) temporaryPaths.push({ run, path, recordedCleaned: resource.temporaryCleaned ?? resource.cleaned ?? resource.removed,
        verifiedAbsent: !existsSync(path), retainedReason: resource.retainedReason ?? null })
    }
  }
  const logs = new Map()
  // 归档移除原日志后，仍能从已验证 ZIP 恢复资源登记，避免重跑账本丢失记录。
  for (const entry of archive?.index.entries ?? []) if (entry.logicalPath.startsWith(`docs/reviews/b1-b2/evidence/${run}/`) && entry.logicalPath.endsWith('.log')) {
    logs.set(resolve(entry.logicalPath), resolveEvidenceBytes(archive, entry).toString('utf8'))
  }
  if (existsSync(resolve(directory, 'native.log'))) logs.set(resolve(directory, 'native.log'), readFileSync(resolve(directory, 'native.log'), 'utf8'))
  if (existsSync(resolve(directory, 'logs'))) for (const file of readdirSync(resolve(directory, 'logs')).filter(name => name.endsWith('.log'))) {
    const path = resolve(directory, 'logs', file); logs.set(path, readFileSync(path, 'utf8'))
  }
  for (const log of logs.values()) for (const line of log.split('\n')) {
    const at = line.indexOf('{"resource":')
    if (at < 0) continue
    try { events.push({ run, ...JSON.parse(line.slice(at).trim()) }) } catch { /* 仅收录完整结构化记录，不猜残缺行。 */ }
  }
}
const paths = [...new Set(events.filter(row => row.resource === 'temporaryPath').map(row => row.path))]
const result = { capturedAt: new Date().toISOString(), containers, temporaryPaths,
  testPaths: paths.map(path => ({ path, verifiedAbsent: !existsSync(path) })), events,
  sharedImages: '未构建专用镜像；保留共享 postgres/redis/rustfs/node 基础镜像，未 prune',
  retained: [{ path: process.cwd(), reason: '当前构建不删除，未 actual main' },
    { path: 'C:/Users/xurx/.tds/workspaces/01a1187a-f0f1-74d9-a5e7-0022c903a6e6', reason: '旧 dirty 工作区保留，未满足 actual main/保全/无人运行条件' },
    { path: resolve('apps/connector/dist'), reason: '上一轮删除被自动审批拒绝；本轮 build 更新，保留且不入 Git' }],
  systemSecrets: '实际平台随机引用的删除记录见 events；仅列引用，未保存令牌；本轮不创建业务配置' }
writeFileSync(resolve(base, process.argv.includes('--ansi') ? 'ansi-cleanup.json' : 'revision-cleanup.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ containers: containers.length, containersAbsent: containers.every(row => row.verifiedAbsent),
  temporaryPaths: temporaryPaths.length, temporaryAbsent: temporaryPaths.every(row => row.verifiedAbsent),
  testPaths: paths.length, testPathsAbsent: result.testPaths.every(row => row.verifiedAbsent) }))
