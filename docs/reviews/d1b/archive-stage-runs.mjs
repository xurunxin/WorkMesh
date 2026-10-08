import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRawEvidenceZip, readRawEvidenceArchive, digest } from '../../../scripts/verify-raw-evidence-archive.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const runs = resolve(root, 'docs/reviews/d1b/evidence/workbench/runs')
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(resolve(directory, entry.name)) : [resolve(directory, entry.name)])
}
for (const run of readdirSync(runs, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
  const directory = resolve(runs, run.name)
  const rawFiles = files(directory).filter(path => /[\\/](stdout|stderr)\.log$/.test(path) || path.includes(`${sep}playwright${sep}`))
  const members = new Map(), entries = []
  for (const path of rawFiles) {
    assert(path.startsWith(runs + sep), '原件路径越界')
    const bytes = readFileSync(path)
    if (!bytes.length) continue // 空原件保持原路径；既有验证器明确不接收零字节 member。
    const sha256 = digest(bytes), member = `bytes/${sha256}`
    members.set(member, bytes)
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: bytes, encoding: 'utf8' }).trim()
    assert.equal(execFileSync('git', ['cat-file', 'blob', blob], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).equals(bytes), true)
    entries.push({ logicalPath: relative(root, path).replaceAll('\\', '/'), version: run.name, byteKind: 'worktree', bytes: bytes.length, sha256, member, sourceCommit: null, sourceBlobId: blob, provenance: '真实运行原件；Git blob 已实际写入并逐字节读回，来源提交尚未产生' })
  }
  if (!entries.length) continue
  const archiveDirectory = resolve(directory, 'raw-archive')
  mkdirSync(archiveDirectory, { recursive: true })
  const zip = createRawEvidenceZip([...members].map(([name, bytes]) => ({ name, bytes })))
  const index = { schemaVersion: 1, archive: { path: 'raw.zip', bytes: zip.length, sha256: digest(zip) }, entries, policy: '不 trim、无损、自包含；逻辑原路径按 version/byteKind 解析；空原件留在原路径' }
  const decoded = readRawEvidenceArchive(index, zip)
  for (const entry of entries) assert(decoded.contents.get(entry.member).equals(members.get(entry.member)))
  writeFileSync(resolve(archiveDirectory, 'raw.zip'), zip)
  writeFileSync(resolve(archiveDirectory, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  for (const path of rawFiles) if (readFileSync(path).length) unlinkSync(path)
  console.log(JSON.stringify({ run: run.name, files: entries.length, bytes: zip.length, verified: true }))
}
