import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readRawEvidenceArchive, resolveEvidenceBytes } from '../../../scripts/verify-raw-evidence-archive.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '../../..')
const index = JSON.parse(readFileSync(path.join(directory, 'raw-evidence-index.json'), 'utf8'))
const archive = readRawEvidenceArchive(index, readFileSync(path.join(directory, 'raw-evidence.zip')))
for (const entry of index.entries) {
  const bytes = resolveEvidenceBytes(archive, entry)
  if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
    throw new Error(`原日志字节不符：${entry.logicalPath}`)
}
const source = JSON.parse(readFileSync(path.join(directory, 'tested-source.json'), 'utf8'))
const refIndex = process.argv.indexOf('--source-ref')
const sourceRef = refIndex === -1 ? null : process.argv[refIndex + 1]
if (refIndex !== -1 && !sourceRef) throw new Error('必须提供历史受测提交')
for (const file of source.files) {
  // Git's path filters handle the Windows CRLF checkout; raw tested bytes remain recorded separately.
  const blob = execFileSync('git', sourceRef ? ['rev-parse', `${sourceRef}:${file.path}`] : ['hash-object', '--path', file.path, file.path], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
  if (blob !== file.gitBlobSha1) throw new Error(`受测源码 Git blob 不符：${file.path}`)
}
const plan = JSON.parse(readFileSync(path.join(root, 'docs/plan/c1-channel-delivery/savedplan-Ry2L3-U5lGSRc8EpsaLs6.json'), 'utf8'))
if (plan.version !== null || createHash('sha256').update(plan.body, 'utf8').digest('hex') !== source.savedPlanBodySha256)
  throw new Error('计划精确正文或 null 版本记录不符')
console.log(JSON.stringify({ logs: index.entries.length, members: archive.memberCount, sourceFiles: source.files.length, planBody: '一致', errors: [] }))
