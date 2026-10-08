import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, cpSync, statSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRawEvidenceZip, readRawEvidenceArchive, digest } from '../../../scripts/verify-raw-evidence-archive.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const id = process.argv[2]
assert(/^[a-z0-9-]+$/.test(id), '必须指定真实运行ID')
const prefix = `docs/reviews/d1b/evidence/board/runs/${id}`
const directory = resolve(root, prefix)
const run = JSON.parse(readFileSync(resolve(directory, 'execution.json')))
assert.equal(run.id, id)
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(directory, entry.name)) : [resolve(directory, entry.name)])
function archive(name, entries, members) {
  const zip = createRawEvidenceZip([...members].map(([name, bytes]) => ({ name, bytes })))
  const index = { schemaVersion: 1, archive: { path: `${name}.zip`, bytes: zip.length, sha256: digest(zip) }, entries,
    policy: '实际Git对象及工作区/运行原字节；无损自包含，不trim，不猜测换行' }
  readRawEvidenceArchive(index, zip)
  writeFileSync(resolve(directory, `${name}-index.json`), JSON.stringify(index, null, 2) + '\n')
  writeFileSync(resolve(directory, `${name}.zip`), zip)
}
const entries = [], members = new Map()
for (const input of run.before) {
  const blob = execFileSync('git', ['cat-file', 'blob', input.gitBlob], { cwd: root, maxBuffer: 32 * 1024 * 1024 })
  assert.equal(digest(blob), input.gitSha256)
  const current = existsSync(resolve(root, input.path)) ? readFileSync(resolve(root, input.path)) : null
  const worktree = [current, blob].find(bytes => bytes && bytes.length === input.worktreeBytes && digest(bytes) === input.worktreeSha256)
  assert(worktree, `必须先保全运行输入再改源码：${input.path}`)
  for (const [byteKind, bytes] of [['git-blob', blob], ['worktree', worktree]]) {
    const sha256 = digest(bytes), member = `bytes/${sha256}`
    members.set(member, bytes)
    entries.push({ logicalPath: input.path, version: id, byteKind, bytes: bytes.length, sha256, member,
      sourceCommit: null, sourceBlobId: input.gitBlob })
  }
}
archive('source-inputs', entries, members)
// 运行目录只读复制留证；原测试临时目录的有归属清理另作登记。
const output = resolve(run.environment.WORKMESH_PLAYWRIGHT_RUN_DIR, 'mocked-dev/output')
if (existsSync(output) && !existsSync(resolve(directory, 'playwright'))) cpSync(output, resolve(directory, 'playwright'), { recursive: true })
const logs = ['stdout.log', 'stderr.log'].map(file => resolve(directory, file)).filter(existsSync)
if (existsSync(resolve(directory, 'playwright'))) logs.push(...walk(resolve(directory, 'playwright')).filter(file => file.endsWith('.md')))
const rawEntries = [], rawMembers = new Map()
for (const file of logs) {
  const bytes = readFileSync(file)
  if (!bytes.length) continue
  const sha256 = digest(bytes), member = `bytes/${sha256}`
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: bytes }).toString().trim()
  assert(execFileSync('git', ['cat-file', 'blob', blob], { cwd: root }).equals(bytes))
  rawMembers.set(member, bytes)
  rawEntries.push({ logicalPath: relative(root, file).replaceAll('\\', '/'), version: id, byteKind: 'worktree',
    bytes: bytes.length, sha256, member, sourceCommit: null, sourceBlobId: blob })
}
if (rawEntries.length) {
  archive('raw-evidence', rawEntries, rawMembers)
  for (const file of logs) if (readFileSync(file).length) unlinkSync(file)
}
// 在再次采集同一组合之前保留本次实际输出，含失败前已完成/部分输出；不混入更早运行。
const captures = walk(resolve(root, 'docs/reviews/d1b/evidence/board')).filter(file =>
  !file.startsWith(resolve(root, 'docs/reviews/d1b/evidence/board/runs'))
  && new RegExp(`[/\\\\]${run.phase}\\.(png|json)$`).test(file)
  && statSync(file).mtimeMs >= Date.parse(run.startedAt) && statSync(file).mtimeMs <= Date.parse(run.finishedAt))
const captureEntries = [], captureMembers = new Map()
for (const file of captures) {
  const bytes = readFileSync(file), sha256 = digest(bytes), member = `bytes/${sha256}`
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { input: bytes }).toString().trim()
  captureMembers.set(member, bytes)
  captureEntries.push({ logicalPath: relative(root, file).replaceAll('\\', '/'), version: id, byteKind: 'worktree',
    bytes: bytes.length, sha256, member, sourceCommit: null, sourceBlobId: blob })
}
if (captureEntries.length) archive('captures', captureEntries, captureMembers)
console.log(JSON.stringify({ id, sourceVersions: entries.length, uniqueSourceMembers: members.size,
  rawVersions: rawEntries.length, captures: captureEntries.length, exitCode: run.exitCode, sourceUnchanged: run.sourceUnchanged }))
