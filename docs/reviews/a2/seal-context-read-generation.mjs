import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { readEvidence } from './read-evidence-bytes.mjs'

const root = resolve(import.meta.dirname, '../../..')
const directory = 'docs/reviews/a2/context-read-generation'
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const digest = bytes => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
const git = args => {
  const result = spawnSync('git', args, { cwd: root, maxBuffer: 50_000_000 })
  if (result.status !== 0) throw Error(`Git 只读失败：${args}`)
  return result.stdout
}
const same = (actual, expected) => actual.bytes === expected.bytes && actual.sha256 === expected.sha256
const head = git(['rev-parse', 'HEAD']).toString().trim()
const input = json(`${directory}/input.json`)
const before = JSON.parse(git(['show', `${input.inputHead}:docs/reviews/a2/raw-evidence-archives.json`]).toString())
const manifest = json('docs/reviews/a2/raw-evidence-archives.json')
const changes = new Set(git(['diff', '--name-only', input.inputHead, head]).toString().trim().split(/\r?\n/))
const oldChanged = before.entries.filter(item => changes.has(item.archivePath)
  || JSON.stringify(manifest.entries.find(value => value.archivePath === item.archivePath)) !== JSON.stringify(item)).map(item => item.archivePath)
const oldPaths = new Set(before.entries.map(item => item.archivePath))
const archives = manifest.entries.filter(item => !oldPaths.has(item.archivePath)).map(item => {
  const blob = git(['show', `${head}:${item.archivePath}`])
  const raw = gunzipSync(blob)
  return { path: item.archivePath, gitBlob: digest(blob), original: digest(raw),
    matches: same(digest(blob), item.archive) && same(digest(raw), item.original) }
})
const history = input.files.map(item => {
  const archive = git(['show', `${head}:${item.archive}`]), raw = gunzipSync(archive)
  return { path: item.archive, actual: digest(raw), expected: { bytes: item.bytes, sha256: item.sha256 }, matches: same(digest(raw), item) }
})
const approved = input.approvedInputs.map(item => {
  const blob = git(['show', `${head}:${item.path}`])
  return { ...item, actual: digest(blob), matches: same(digest(blob), item) }
})
const feedbackBlob = git(['show', `${head}:${input.feedbackSnapshot.path}`])
const feedback = { ...input.feedbackSnapshot, actual: digest(feedbackBlob), matches: same(digest(feedbackBlob), input.feedbackSnapshot) }
const backendDiff = git(['diff', '--name-only', input.inputHead, head, '--', 'apps/api', 'apps/worker', 'packages', 'OPENAPI.yaml', 'infra', 'docker-compose.lite.yml', 'scripts']).toString().trim()
const source = process.argv[2] ? json(`docs/reviews/a2/runs/${process.argv[2]}/source-after.json`).files.map(item => {
  const tested = readEvidence(resolve(root, `docs/reviews/a2/runs/${process.argv[2]}/source/after`, item.path))
  const blob = git(['show', `${head}:${item.path}`])
  return { path: item.path, tested: digest(tested), gitBlob: digest(blob), exact: tested.equals(blob),
    onlyCRLF: tested.toString('utf8').replaceAll('\r\n', '\n') === blob.toString('utf8').replaceAll('\r\n', '\n') }
}) : []
const oldEvidenceChanged = [...changes].filter(path => path.startsWith('docs/reviews/a2/configuration-recovery/'))
const result = { observedAt: new Date().toISOString(), head, inputHead: input.inputHead,
  originalArchives: { count: before.entries.length, changed: oldChanged }, archives, history, approved, feedback,
  backendAndDeploymentChanged: backendDiff, oldRecoveryEvidenceChanged: oldEvidenceChanged, source,
  rule: '精确提交 Git blob；gzip 原字节与批准正文独立核验，旧证据只核不变，不重写历史，不预填后续文档提交。' }
if (!process.argv.includes('--check-only')) writeFileSync(resolve(root, directory, 'git-byte-proof.json'), JSON.stringify(result, null, 2) + '\n')
if (oldChanged.length || oldEvidenceChanged.length || backendDiff || !feedback.matches || [...archives, ...history, ...approved].some(item => !item.matches) || source.some(item => !item.onlyCRLF)) throw Error('当前输入/提交字节未闭合')
console.log(JSON.stringify({ head, archives: archives.length, oldArchivesUnchanged: before.entries.length,
  historyExact: history.length, approvedExact: approved.length, testedSourceExactExceptCRLF: source.length, backendUnchanged: true }))
