import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '../../..')
const evidenceRoot = realpathSync(import.meta.dirname)
const manifestPath = resolve(evidenceRoot, 'raw-evidence-archives.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { format: '逐文件无损 gzip；原文件名去掉 .gz，解压后不转换换行', entries: [] }
const sha256 = value => createHash('sha256').update(value).digest('hex')
const save = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
const candidates = []
const walk = directory => {
  if (lstatSync(directory).isSymbolicLink()) throw Error('证据目录含链接，停止')
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isSymbolicLink()) throw Error('证据树含链接，停止')
    if (entry.isDirectory()) walk(path)
    else if (entry.isFile()) {
      const local = relative(evidenceRoot, path).replaceAll('\\', '/')
      if (local.startsWith('pre-c3-source/') || local.startsWith('c3-integration/conflicts/')
        || local.startsWith('configuration-recovery/history/') && local.endsWith('.json') && !local.endsWith('/source.json')
        || local.startsWith('context-read-generation/') && local.endsWith('.log')
        || local.startsWith('runs/') && (local.includes('/source/') || local.endsWith('.log') || local.endsWith('.md') || local.includes('/.playwright-artifacts'))) candidates.push(path)
    }
  }
}
walk(evidenceRoot)
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
for (const path of candidates) {
  if (path.endsWith('.gz')) continue
  if (!isAbsolute(path) || !realpathSync(path).startsWith(evidenceRoot + sep) || lstatSync(path).isSymbolicLink()) throw Error('单路径边界未确认')
  const original = readFileSync(path)
  const archivePath = `${path}.gz`
  if (existsSync(archivePath)) throw Error('归档目标已存在，保留原文件')
  const repoPath = relative(root, path).replaceAll('\\', '/')
  const blob = spawnSync('git', ['show', `${head}:${repoPath}`], { cwd: root, maxBuffer: 20_000_000 })
  const record = { originalPath: repoPath, archivePath: `${repoPath}.gz`, original: { bytes: original.length, sha256: sha256(original) },
    priorHead: head, priorGitBlob: blob.status === 0 ? { bytes: blob.stdout.length, sha256: sha256(blob.stdout) } : null,
    reason: '完整保留原始日志、受测源码原字节和失败上下文；不格式化原件、不修改 CI 或忽略规则',
    activity: '本轮浏览器、Docker 镜像及安装作业已结束；原件读回与解压核验后仅清本任务闲置未压缩副本',
    plannedAt: new Date().toISOString(), roundTrip: null, deleteResult: null }
  manifest.entries.push(record); save()
  writeFileSync(archivePath, gzipSync(original, { level: 9 }), { flag: 'wx' })
  const compressed = readFileSync(archivePath)
  const restored = gunzipSync(compressed)
  record.archive = { bytes: compressed.length, sha256: sha256(compressed) }
  record.roundTrip = { bytes: restored.length, sha256: sha256(restored), exact: restored.equals(original), at: new Date().toISOString() }; save()
  if (!record.roundTrip.exact) throw Error('解压原字节不一致，保留原件')
  // No recursive removal, shell interpolation or forced cleanup.
  unlinkSync(path)
  record.deleteResult = { exists: existsSync(path), at: new Date().toISOString() }; save()
}
console.log(JSON.stringify({ newlyPacked: candidates.filter(path => !path.endsWith('.gz')).length, total: manifest.entries.length, allExact: manifest.entries.every(entry => entry.roundTrip?.exact && entry.deleteResult?.exists === false) }))
