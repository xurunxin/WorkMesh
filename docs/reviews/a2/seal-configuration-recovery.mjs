import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { readEvidence } from './read-evidence-bytes.mjs'

const root = resolve(import.meta.dirname, '../../..'), base = 'b492a35b11445c157a825b5e747ac0e15506e491'
const digest = bytes => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8').replace(/^\uFEFF/, ''))
const git = args => { const result = spawnSync('git', args, { cwd: root, maxBuffer: 30_000_000 }); if (result.status !== 0) throw Error(`Git 读回失败：${args}`); return result.stdout }
const head = git(['rev-parse', 'HEAD']).toString().trim()
const manifest = json('docs/reviews/a2/raw-evidence-archives.json')
const recoveryHeads = new Set([base, 'fc14c523ae86c13e952e47d19b7508695c402d76'])
const changed = new Set(git(['diff', '--name-only', base, head]).toString().trim().split(/\r?\n/))
const priorEntries = manifest.entries.filter(item => !recoveryHeads.has(item.priorHead))
const priorArchivesChanged = priorEntries.filter(item => changed.has(item.archivePath)).map(item => item.archivePath)
const archives = manifest.entries.filter(item => recoveryHeads.has(item.priorHead)).map(item => {
  const blob = git(['show', `${head}:${item.archivePath}`])
  const actual = digest(blob)
  return { path: item.archivePath, expected: item.archive, actual, matches: actual.bytes === item.archive.bytes && actual.sha256 === item.archive.sha256 }
})
const previous = json('docs/reviews/a2/configuration-recovery/history/source.json')
const history = previous.files.map(item => {
  const bytes = readEvidence(resolve(root, item.snapshot)), actual = digest(bytes)
  return { path: item.snapshot, expected: { bytes: item.bytes, sha256: item.sha256 }, actual, matches: actual.bytes === item.bytes && actual.sha256 === item.sha256 }
})
const inputs = json('docs/reviews/a2/configuration-recovery/input.json').inputs.slice(0, 2).map(item => {
  const actual = digest(git(['show', `${head}:${item.path}`]))
  return { ...item, blob: actual, matches: actual.bytes === item.bytes && actual.sha256 === item.sha256 }
})
const backendDiff = git(['diff', '--name-only', base, head, '--', 'apps/api', 'apps/worker', 'packages/contracts', 'packages/db', 'OPENAPI.yaml', 'infra/docker/lite.Dockerfile', 'docker-compose.lite.yml', 'scripts/verify-a2-lite.mjs']).toString().trim()
const result = { observedAt: new Date().toISOString(), head, inputHead: base, archives, priorArchives: { count: priorEntries.length, changed: priorArchivesChanged, originalProof: 'docs/reviews/a2/delivery-git-byte-proof.json' }, history, inputs, backendAndDeploymentChanged: backendDiff,
  rule: '本轮新归档逐 Git blob 核验；旧归档沿原证明并核无差异；历史解压原字节与批准正文独立核验，不伪补未来提交。' }
writeFileSync(resolve(import.meta.dirname, 'configuration-recovery/git-byte-proof.json'), JSON.stringify(result, null, 2) + '\n')
if (priorArchivesChanged.length || backendDiff || [...archives, ...history, ...inputs].some(item => !item.matches)) throw Error('源码或归档字节不符合绑定')
console.log(JSON.stringify({ head, newArchives: archives.length, oldArchivesUnchanged: priorEntries.length, historyExact: history.length, approvedInputsExact: inputs.length, backendAndDeploymentUnchanged: true }))
