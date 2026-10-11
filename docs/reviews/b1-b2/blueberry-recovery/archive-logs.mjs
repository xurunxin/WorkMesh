import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRawEvidenceZip, readRawEvidenceArchive, resolveEvidenceBytes, digest } from '../../../../scripts/verify-raw-evidence-archive.mjs'

const root = process.cwd()
const base = 'docs/reviews/b1-b2/blueberry-recovery'
const indexPath = resolve(root, base, 'raw-evidence-index.json')
const zipPath = resolve(root, base, 'raw-evidence.zip')
const version = 'blueberry-2026-10-11'
const old = existsSync(indexPath) ? readRawEvidenceArchive(JSON.parse(readFileSync(indexPath, 'utf8')), readFileSync(zipPath)) : null
if (process.argv.includes('--pack')) {
  const entries = new Map(old?.index.entries.map(entry => [entry.logicalPath, entry]) ?? [])
  const members = new Map(old?.contents ?? [])
  const originals = []
  function visit(relative) {
    // 检查仍在运行时，不能归档或删除它将在收尾读取的输出。
    const checks = join(root, relative, 'local-checks.json')
    if (relative !== base && existsSync(checks) && !existsSync(join(root, relative, 'local-resource-events.json'))) return
    for (const file of readdirSync(resolve(root, relative), { withFileTypes: true })) {
      const logicalPath = `${relative}/${file.name}`
      if (file.isDirectory()) { visit(logicalPath); continue }
      if (!file.name.endsWith('.log')) continue
      const bytes = readFileSync(resolve(root, logicalPath))
      if (!bytes.length) continue
      if (/\bwm[a-z]_[A-Za-z0-9_-]{43,}/.test(bytes.toString('utf8'))) throw new Error(`凭据形态拒绝归档：${logicalPath}`)
      const sha256 = digest(bytes), member = `bytes/${sha256}`
      if (entries.has(logicalPath) && entries.get(logicalPath).sha256 !== sha256) throw new Error(`禁止覆盖历史日志：${logicalPath}`)
      members.set(member, bytes)
      entries.set(logicalPath, { logicalPath, version, byteKind: 'worktree', bytes: bytes.length, sha256, member,
        sourceCommit: null, sourceBlobId: createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex') })
      originals.push({ logicalPath, bytes })
    }
  }
  visit(base)
  const rows = [...entries.values()].sort((a, b) => a.logicalPath.localeCompare(b.logicalPath))
  const used = new Set(rows.map(row => row.member))
  const zip = createRawEvidenceZip([...members].filter(([name]) => used.has(name)).map(([name, bytes]) => ({ name, bytes })))
  const index = { schemaVersion: 1, archive: { path: `${base}/raw-evidence.zip`, bytes: zip.length, sha256: digest(zip) }, entries: rows,
    note: '保全执行工作树中的完整日志字节，不去尾空白、不归一化换行；GitHub原始stdout字节另有ci-job-log-sources.json绑定，早期文本保存含换行转换的版本也保留。sourceCommit=null不冒已可达来源。空日志保留为零字节文件。' }
  const archive = readRawEvidenceArchive(index, zip)
  for (const original of originals) if (!resolveEvidenceBytes(archive, { logicalPath: original.logicalPath, version, byteKind: 'worktree' }).equals(original.bytes)) throw new Error('归档逐字节验证失败')
  writeFileSync(zipPath, zip); writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
  readRawEvidenceArchive(JSON.parse(readFileSync(indexPath, 'utf8')), readFileSync(zipPath))
  for (const original of originals) unlinkSync(resolve(root, original.logicalPath))
}
const archive = readRawEvidenceArchive(JSON.parse(readFileSync(indexPath, 'utf8')), readFileSync(zipPath))
console.log(JSON.stringify({ entries: archive.index.entries.length, members: archive.memberCount, bytes: archive.totalBytes, verified: true }))
