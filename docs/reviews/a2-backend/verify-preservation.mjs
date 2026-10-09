import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

const root = resolve(import.meta.dirname, '../../..')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const git = args => {
  const result = spawnSync('git', args, { cwd: root, maxBuffer: 20_000_000, windowsHide: true })
  if (result.status !== 0) throw Error(`Git 输入不可读：${args.join(' ')}`)
  return result.stdout
}
const preservation = JSON.parse(readFileSync(resolve(import.meta.dirname, 'preservation.json'), 'utf8'))
let archiveCount = 0
const verifyArchive = record => {
  const compressed = readFileSync(resolve(import.meta.dirname, record.archive))
  const raw = gunzipSync(compressed)
  if (sha(raw) !== record.sha256 || raw.length !== record.bytes || sha(compressed) !== record.gzipSha256) throw Error('保全原字节校验失败')
  archiveCount++
  return raw
}
for (const entry of preservation.entries) {
  if (!verifyArchive(entry.gitBlob).equals(git(['show', `${entry.sourceCommit}:${entry.path}`]))) throw Error('历史 Git 原件不一致')
  verifyArchive(entry.worktree)
}
for (const entry of preservation.documents) verifyArchive(entry)
verifyArchive(preservation.fullProductDiff)
for (const object of preservation.objectProofs) {
  if (git(['rev-parse', `${object.commit}^{tree}`]).toString().trim() !== object.tree) throw Error('历史 tree 变化')
}
const sources = JSON.parse(readFileSync(resolve(import.meta.dirname, 'sources.json'), 'utf8'))
for (const entry of sources.inputs) {
  const bytes = readFileSync(resolve(import.meta.dirname, entry.path))
  if (sha(bytes) !== entry.sha256 || bytes.length !== entry.bytes) throw Error('当前/Chief 旧来源字节变化')
  if (!bytes.equals(git(['show', `HEAD:docs/reviews/a2-backend/${entry.path}`]))) throw Error('提交来源与工作树字节不一致')
}
if (!readFileSync(resolve(root, 'docs/plan/activation-task-specs/09.md')).equals(readFileSync(resolve(import.meta.dirname, 'current-spec.md')))) throw Error('当前完整规格不同步')
if (git(['diff', '--name-only', preservation.main, 'HEAD', '--', 'apps/web', 'playwright.config.ts']).toString().trim()) throw Error('候选仍有延期 UI 增量')
const unchanged = ['docs/plan/a2-configuration-readiness.md', 'docs/plan/a2-configuration-readiness', 'docs/reviews/a2']
if (git(['diff', '--name-only', preservation.originalHead, 'HEAD', '--', ...unchanged]).toString().trim()) throw Error('旧计划/实现/失败/视觉原件变化')
const outcome = { observedAt: new Date().toISOString(), head: git(['rev-parse', 'HEAD']).toString().trim(), archiveCount,
  historicalObjects: preservation.objectProofs, sourceBytesMatchGit: true, deferredUiDiffAgainstMain: [], historicalEvidenceUnchanged: unchanged,
  actualMainRefReadback: { sha: preservation.main, observedAt: '2026-10-09T04:21:40Z', args: ['ls-remote', 'origin', 'refs/heads/main'], tool: 'mcp__tds__git', result: '同精确 c768，非 FETCH_HEAD' } }
writeFileSync(resolve(import.meta.dirname, 'preservation-verification.json'), JSON.stringify(outcome, null, 2) + '\n')
console.log(JSON.stringify({ archives: archiveCount, sourceBytesMatchGit: true, deferredUiDiff: 0 }))
