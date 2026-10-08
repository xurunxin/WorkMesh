import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRawEvidenceZip, readRawEvidenceArchive, resolveEvidenceBytes, digest } from '../../../scripts/verify-raw-evidence-archive.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const base = 'docs/reviews/b1-b2/evidence'
const indexPath = resolve(root, base, 'raw-evidence-index.json'), zipPath = resolve(root, base, 'raw-evidence.zip')
const version = 'execution-2026-10-08'
if (process.argv.includes('--pack')) {
  const old = existsSync(indexPath) ? readRawEvidenceArchive(JSON.parse(readFileSync(indexPath, 'utf8')), readFileSync(zipPath)) : null
  const rows = new Map(old?.index.entries.map(row => [row.logicalPath, row]) ?? [])
  const members = new Map(old?.contents ?? [])
  const originals = []
  function visit(path) {
    for (const entry of readdirSync(resolve(root, path), { withFileTypes: true })) {
      if (entry.name === 'playwright-runtime') continue // 原始浏览器状态须单独脱敏，不能归档。
      const logicalPath = `${path}/${entry.name}`
      if (entry.isDirectory()) visit(logicalPath)
      else if (entry.name.endsWith('.log')) {
        const bytes = readFileSync(resolve(root, logicalPath)); if (!bytes.length) continue
        if (/\bwm[a-z]_[A-Za-z0-9_-]{43,}/.test(bytes.toString('utf8'))) throw new Error(`归档拒绝凭据形态：${logicalPath}`)
        const sha256 = digest(bytes), member = `bytes/${sha256}`
        members.set(member, bytes)
        rows.set(logicalPath, { logicalPath, version, byteKind: 'worktree', bytes: bytes.length, sha256, member,
          sourceCommit: null, sourceBlobId: createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex') })
        originals.push({ logicalPath, bytes })
      }
    }
  }
  visit(base)
  const entries = [...rows.values()].sort((a, b) => a.logicalPath.localeCompare(b.logicalPath))
  const used = new Set(entries.map(row => row.member))
  const zip = createRawEvidenceZip([...members].filter(([name]) => used.has(name)).map(([name, bytes]) => ({ name, bytes })))
  const index = { schemaVersion: 1, archive: { path: `${base}/raw-evidence.zip`, bytes: zip.length, sha256: digest(zip) },
    note: '日志为执行时脱敏后的原始工作树字节，未格式化或归一化换行。sourceCommit=null；sourceBlobId 仅为按这些原字节计算的 Git 对象 ID，不声称已写入源提交或具备可达性。旧检查中的 log 路径由本索引精确解析。', entries }
  const archive = readRawEvidenceArchive(index, zip)
  for (const original of originals) {
    if (!resolveEvidenceBytes(archive, { logicalPath: original.logicalPath, version, byteKind: 'worktree' }).equals(original.bytes)) throw new Error('归档逐字节验证失败')
  }
  writeFileSync(zipPath, zip); writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
  // 索引和 ZIP 写入并独立读回后才删已经保全的日志原件。
  readRawEvidenceArchive(JSON.parse(readFileSync(indexPath, 'utf8')), readFileSync(zipPath))
  for (const original of originals) unlinkSync(resolve(root, original.logicalPath))
}
const archive = readRawEvidenceArchive(JSON.parse(readFileSync(indexPath, 'utf8')), readFileSync(zipPath))
console.log(JSON.stringify({ entries: archive.index.entries.length, members: archive.memberCount, bytes: archive.totalBytes, verified: true }))
