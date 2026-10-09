import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { relative, resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'

const root = realpathSync(import.meta.dirname)
const runId = process.argv[2]
if (!/^a2-backend-(?:lite-)?[a-f0-9]{8}$/.test(runId ?? '')) throw Error('只归档本轮独有运行')
const directory = resolve(root, 'runs', runId)
const receipts = JSON.parse(readFileSync(resolve(directory, 'receipts.json'), 'utf8'))
if (receipts.resources.some(resource => resource.type === 'container' && resource.id && resource.cleanup?.code !== 0)) throw Error('活动容器未收尾，不归档')
if (existsSync(resolve(directory, 'archive.json'))) throw Error('已归档，不覆盖')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const candidates = []
const walk = path => {
  if (lstatSync(path).isSymbolicLink() || relative(root, realpathSync(path)).startsWith('..')) throw Error('链接/绝对边界未确认')
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const target = resolve(path, entry.name)
    if (entry.isDirectory()) walk(target)
    else if (entry.isSymbolicLink()) throw Error('证据树含链接')
    else if (entry.isFile() && (relative(directory, target).replaceAll('\\', '/').startsWith('source/') || /\.(log|zip|md)$/.test(entry.name))) candidates.push(target)
  }
}
walk(directory)
const archiveRoot = resolve(root, 'blobs'); mkdirSync(archiveRoot, { recursive: true })
const entries = candidates.map(path => {
  const bytes = readFileSync(path); const hash = sha(bytes); const target = resolve(archiveRoot, `${hash}.gz`)
  if (!existsSync(target)) writeFileSync(target, gzipSync(bytes), { flag: 'wx' })
  const compressed = readFileSync(target)
  if (!gunzipSync(compressed).equals(bytes)) throw Error('原字节解压核验失败')
  return { originalPath: relative(root, path).replaceAll('\\', '/'), archivePath: relative(root, target).replaceAll('\\', '/'), bytes: bytes.length, sha256: hash,
    compressedSha256: sha(compressed), roundTripExact: true, target: path,
    activity: '运行子进程结束、容器收尾及认证材料脱敏后保全；仅删除闲置未压缩副本', plannedAt: new Date().toISOString() }
})
writeFileSync(resolve(directory, 'archive.json'), JSON.stringify({ runId, format: '内容寻址无损 gzip，Git blob/工作树另绑，原始源文件恢复不转换换行', entries }, null, 2) + '\n')
for (const entry of entries) {
  if (sha(readFileSync(entry.target)) !== entry.sha256) throw Error('删除前原件变化，保留')
  unlinkSync(entry.target)
  appendFileSync(resolve(directory, 'archive-cleanup.jsonl'), JSON.stringify({ path: entry.target, code: 0, exists: existsSync(entry.target), at: new Date().toISOString() }) + '\n')
}
console.log(JSON.stringify({ runId, entries: entries.length, allExact: true }))
