import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRawEvidenceZip, readRawEvidenceArchive, digest } from '../../../scripts/verify-raw-evidence-archive.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const directory = resolve(root, 'docs/reviews/d1b/evidence/workbench')
const runs = readdirSync(resolve(directory, 'runs'), { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
  try { return [JSON.parse(readFileSync(resolve(directory, 'runs', entry.name, 'execution.json')))] }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
})
for (const run of runs) assert.deepEqual(run.before, run.after, `运行 ${run.id} 期间输入发生变化，不能合并为一个版本`)
const ids = [...new Set(runs.flatMap(run => run.before.map(input => input.gitBlob)))]
const batch = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: ids.join('\n') + '\n', maxBuffer: 128 * 1024 * 1024 })
const blobs = new Map()
let offset = 0
for (const id of ids) {
  const end = batch.indexOf(10, offset)
  const header = batch.subarray(offset, end).toString().split(' ')
  assert.equal(header[0], id)
  assert.equal(header[1], 'blob')
  const size = Number(header[2])
  blobs.set(id, batch.subarray(end + 1, end + 1 + size))
  offset = end + size + 2
}
assert.equal(offset, batch.length)
const members = new Map(), entries = []
for (const run of runs) for (const input of run.before) {
  const gitBytes = blobs.get(input.gitBlob)
  assert.equal(gitBytes.length, input.gitBytes)
  assert.equal(digest(gitBytes), input.gitSha256)
  // 换行恢复必须通过运行时已记录的原字节 hash/大小双校验；不能假定 CRLF/LF。
  const candidates = [gitBytes, Buffer.from(gitBytes.toString().replace(/(?<!\r)\n/g, '\r\n'))]
  const worktree = candidates.find(bytes => bytes.length === input.worktreeBytes && digest(bytes) === input.worktreeSha256)
  assert(worktree, `无法从实际 blob 精确恢复已记录工作区字节：${run.id}/${input.path}`)
  for (const [byteKind, bytes] of [['git-blob', gitBytes], ['worktree', worktree]]) {
    const sha256 = digest(bytes), member = `bytes/${sha256}`
    members.set(member, bytes)
    entries.push({ logicalPath: input.path, version: run.id, byteKind, bytes: bytes.length, sha256, member, sourceCommit: null, sourceBlobId: input.gitBlob, provenance: byteKind === 'git-blob' ? '运行时实际 index blob，现已实际 cat-file 读回' : '由实际 index blob 恢复；仅与运行时记录原工作区大小/SHA-256 完全相符才纳入；不猜测换行' })
  }
}
const zip = createRawEvidenceZip([...members].map(([name, bytes]) => ({ name, bytes })))
const index = { schemaVersion: 1, archive: { path: 'source-inputs.zip', bytes: zip.length, sha256: digest(zip) }, entries, policy: '每次运行的 before/after 相同，共用 run.id 版本；自包含，不依赖旧 index blob 后续可达性' }
const decoded = readRawEvidenceArchive(index, zip)
for (const [member, bytes] of members) assert(decoded.contents.get(member).equals(bytes))
writeFileSync(resolve(directory, 'source-inputs.zip'), zip)
writeFileSync(resolve(directory, 'source-inputs-index.json'), JSON.stringify(index, null, 2) + '\n')
console.log(JSON.stringify({ runs: runs.length, logicalByteVersions: entries.length, members: members.size, archiveBytes: zip.length, verified: true }))
