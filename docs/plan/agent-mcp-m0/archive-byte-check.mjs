// 核对暂存Git blob与文档工作树；只写本目录报告。
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyChanges, readWorkspaces } from '../../../scripts/ci-policy.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const root = resolve(directory, '../../..')
const git = args => execFileSync('git', args, { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const paths = git(['ls-files', '-z', '--', 'docs/plan/agent-mcp-m0']).toString('utf8').split('\0').filter(Boolean)
const excluded = ['docs/plan/agent-mcp-m0/archive-byte-manifest.json']
const rows = paths.filter(path => !excluded.includes(path)).map(path => {
  const blob = git(['show', ':' + path])
  const worktree = readFileSync(resolve(root, path))
  if (!blob.equals(worktree)) throw Error('本轮生成工作树与暂存blob不相同: ' + path)
  return { path, bytes: worktree.length, worktreeSha256: sha256(worktree), gitBlobSha256: sha256(blob), gitObjectId: git(['rev-parse', ':' + path]).toString().trim(), mapping: '字节相同；UTF-8 LF生成；后续Windows检出可转换为CRLF' }
})
const report = { checkedAt: new Date().toISOString(), command: 'node docs/plan/agent-mcp-m0/archive-byte-check.mjs', sourceHead: 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d', files: rows, excludedSelfReference: excluded, ciClassification: classifyChanges(paths, readWorkspaces(root)), productChecksRun: false }
writeFileSync(resolve(directory, 'archive-byte-manifest.json'), JSON.stringify(report, null, 2) + '\n', 'utf8')
console.log(JSON.stringify({ stagedDocumentFiles: rows.length, identicalBytes: true, ciClassification: report.ciClassification, productChecksRun: false }))
