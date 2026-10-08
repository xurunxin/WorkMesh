import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync, realpathSync, lstatSync, unlinkSync, existsSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'

// 仅包装本轮独有、已退出采集的原始 HTML/失败上下文；主交付 PNG 始终可直接打开。
const directory = import.meta.dirname
const allowed = ['visual-365de426', 'visual-0780e159', 'visual-82665dc9', 'visual-f321025a']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const walk = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(path, entry.name)) : [resolve(path, entry.name)])
const indexPath = resolve(directory, 'local-report-archives.json')
if (existsSync(indexPath)) throw Error('本轮包装已登记，不覆盖历史回执')
const index = { purpose: '仅本轮采集报告无损 gzip；历史 A2 证据不动', createdAt: new Date().toISOString(), entries: [] }
const save = () => writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
for (const runId of allowed) {
  const boundary = realpathSync(resolve(directory, 'runs', runId))
  const receipt = JSON.parse(readFileSync(resolve(boundary, 'receipts.json'), 'utf8'))
  if (!receipt.end || receipt.resources.some(resource => resource.afterListening)) throw Error('采集尚未退出，不能包装活动报告')
  for (const path of walk(boundary).filter(path => /\.(html|md)$/.test(path))) {
    const resolved = realpathSync(path)
    if (!resolved.startsWith(boundary + '\\') && !resolved.startsWith(boundary + '/')) throw Error('路径越界')
    for (let current = path; current !== boundary; current = dirname(current)) if (lstatSync(current).isSymbolicLink()) throw Error('存在链接边界')
    const raw = readFileSync(path)
    const entry = { runId, path: relative(directory, path).replaceAll('\\', '/'), resolvedAbsolutePath: resolved,
      owner: runId, basis: '本轮 capture.mjs 独有运行目录，命令结束、服务端口无监听；非共享、非其他任务路径',
      rawBytes: raw.length, rawSha256: sha(raw), archive: relative(directory, `${path}.gz`).replaceAll('\\', '/'),
      activeReferences: false, boundaryVerified: true, plannedAt: new Date().toISOString(), operation: null }
    index.entries.push(entry)
  }
}
save() // 删除原始包装对象前持久化每个 path 的依据和安全核对。
for (const entry of index.entries) {
  const original = resolve(directory, entry.path)
  const archive = resolve(directory, entry.archive)
  const raw = readFileSync(original)
  if (sha(raw) !== entry.rawSha256) throw Error('包装前原件变化')
  writeFileSync(archive, gzipSync(raw))
  const compressed = readFileSync(archive)
  if (!gunzipSync(compressed).equals(raw)) throw Error('无损回读不一致，保留原件')
  entry.archiveBytes = compressed.length; entry.archiveSha256 = sha(compressed); entry.readBackVerifiedAt = new Date().toISOString(); save()
  unlinkSync(original)
  entry.operation = { method: 'unlink 本轮单个已归档报告文件；未递归删除目录', exitCode: 0, originalExists: existsSync(original), at: new Date().toISOString() }; save()
}
console.log(JSON.stringify({ archivedFiles: index.entries.length, index: indexPath }))
