import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { readEvidence } from './read-evidence-bytes.mjs'

const root = resolve(import.meta.dirname, '../../..')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
const normalized = bytes => Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'))
const runs = ['a2-21cc8a38', 'a2-22323ec0', 'a2-46fe0e21', ...process.argv.slice(2)]
const currentHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
const records = runs.map(runId => {
  const directory = resolve(import.meta.dirname, 'runs', runId)
  const before = json(resolve(directory, 'source-before.json'))
  const after = json(resolve(directory, 'source-after.json'))
  const files = after.files.map(entry => {
    const tested = readEvidence(resolve(directory, 'source/after', entry.path))
    const current = readFileSync(resolve(root, entry.path))
    const blob = spawnSync('git', ['show', `${currentHead}:${entry.path}`], { cwd: root, maxBuffer: 5_000_000 })
    return { path: entry.path, tested: { bytes: tested.length, sha256: sha(tested) },
      beforeMatchesAfter: before.files.find(item => item.path === entry.path)?.sha256 === entry.sha256,
      current: { bytes: current.length, sha256: sha(current) }, currentMatchesTested: tested.equals(current),
      currentMatchesTestedExceptCRLF: normalized(tested).equals(normalized(current)),
      headBlob: blob.status === 0 ? { bytes: blob.stdout.length, sha256: sha(blob.stdout), matchesTested: blob.stdout.equals(tested), matchesTestedExceptCRLF: normalized(blob.stdout).equals(normalized(tested)) } : null }
  })
  return { runId, testedHead: before.head, files, changedDuringRun: files.filter(item => !item.beforeMatchesAfter).map(item => item.path), currentDifferences: files.filter(item => !item.currentMatchesTested).map(item => item.path) }
})
writeFileSync(resolve(import.meta.dirname, 'checked-source-binding.json'), JSON.stringify({ observedAt: new Date().toISOString(), currentHead, byteRule: '原字节与 Git blob 分列；仅 CRLF 转换单独证明，不把不同源码或运行中变化冒作相同。', records }, null, 2) + '\n')
console.log(JSON.stringify(records.map(item => ({ runId: item.runId, changedDuringRun: item.changedDuringRun, currentDifferences: item.currentDifferences }))))
