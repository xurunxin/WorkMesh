import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRawEvidenceZip, readRawEvidenceArchive, digest } from '../../../scripts/verify-raw-evidence-archive.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const directory = resolve(root, 'docs/reviews/r1/execution-logs')
const archivePath = resolve(directory, 'raw-checks.zip')
const indexPath = resolve(directory, 'raw-checks-index.json')
const draft = 'f137787faa0979b59dd70668001b09bb5e132421'
const files = []
function collect(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name)
    if (entry.isDirectory()) collect(child)
    else if (/\.(log|md|xml)$/.test(entry.name) && entry.name !== 'README.md') files.push(child)
  }
}

if (existsSync(indexPath) || existsSync(archivePath)) {
  // 不把已经规范化的展示副本覆盖成原件；新检查使用新目录另归档。
  const index = JSON.parse(readFileSync(indexPath, 'utf8'))
  const result = readRawEvidenceArchive(index, readFileSync(archivePath))
  console.log(`现有检查归档核验通过：${result.memberCount} 个独立原件，未覆盖`)
} else {
  collect(directory)
  const entries = [], members = new Map(), displays = [], emptyFiles = []
  function add(logicalPath, bytes, version, byteKind, sourceCommit) {
    const sha256 = digest(bytes)
    if (!bytes.length) { emptyFiles.push({ logicalPath, version, bytes: 0, sha256 }); return }
    const member = 'bytes/' + sha256
    const sourceBlobId = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex')
    members.set(member, bytes)
    entries.push({ logicalPath, version, byteKind, sourceCommit, sourceBlobId, bytes: bytes.length, sha256, member })
  }
  for (const file of files) {
    const logicalPath = relative(root, file).replaceAll('\\', '/')
    const bytes = readFileSync(file)
    add(logicalPath, bytes, 'captured-before-display', 'worktree', null)
    try {
      const original = execFileSync('git', ['show', `${draft}:${logicalPath}`], { cwd: root, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
      add(logicalPath, original, draft, 'git-blob', draft)
    } catch { /* 新检查没有初稿来源提交，清单如实记null。 */ }
    const trimmed = bytes.toString('utf8').replaceAll('\r\n', '\n').split('\n').map(line => line.replace(/[ \t]+$/g, '')).join('\n').replace(/\n+$/, '')
    const display = trimmed ? trimmed + '\n' : ''
    displays.push({ logicalPath, rawSha256: digest(bytes), displaySha256: digest(Buffer.from(display)), policy: '仅展示副本统一LF、移除行尾空白与多余EOF空行；归档保留处理前原字节' })
    writeFileSync(file, display)
  }
  const zip = createRawEvidenceZip([...members].map(([name, bytes]) => ({ name, bytes })))
  const index = { schemaVersion: 1, purpose: 'R1检查原件；复用既有安全ZIP读取器，独立于G1归档，不修改G1历史', capturedAt: new Date().toISOString(), archive: { path: 'raw-checks.zip', bytes: zip.length, sha256: digest(zip) }, entries, emptyFiles, displays }
  readRawEvidenceArchive(index, zip)
  writeFileSync(archivePath, zip)
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
  console.log(`已保留并核验检查原字节：${entries.length} 条来源，${members.size} 个独立原件`)
}
