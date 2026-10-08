import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const git = args => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 })
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const target = 'docs/reviews/d1b/recovery/current-artifacts.json'
const excluded = [target, 'docs/reviews/d1b/evidence/board/final-verification.json']
function fingerprint(paths) {
  const index = new Map(git(['ls-files', '--stage', '-z']).toString().split('\0').filter(Boolean).map(line => {
    const match = /^\d+ ([a-f0-9]{40}) 0\t([\s\S]+)$/.exec(line)
    assert(match, `index有冲突或路径不可读：${line}`)
    return [match[2], match[1]]
  }))
  const rows = []
  for (let offset = 0; offset < paths.length; offset += 24) {
    const group = paths.slice(offset, offset + 24)
    const ids = [...new Set(group.map(path => { assert(index.has(path), `须先加入index：${path}`); return index.get(path) }))]
    const batch = execFileSync('git', ['cat-file', '--batch'], { input: ids.join('\n') + '\n', maxBuffer: 64 * 1024 * 1024 })
    const blobs = new Map()
    let cursor = 0
    for (const id of ids) {
      const end = batch.indexOf(10, cursor), header = /^([a-f0-9]+) blob (\d+)$/.exec(batch.subarray(cursor, end).toString())
      assert(header && header[1] === id)
      const size = Number(header[2]), blob = batch.subarray(end + 1, end + 1 + size)
      assert.equal(batch[end + 1 + size], 10); blobs.set(id, blob); cursor = end + 2 + size
    }
    assert.equal(cursor, batch.length)
    for (const path of group) {
      const gitBlob = index.get(path), blob = blobs.get(gitBlob), worktree = readFileSync(path)
      assert.equal(createHash('sha1').update(Buffer.from(`blob ${blob.length}\0`)).update(blob).digest('hex'), gitBlob)
      rows.push({ path, gitBlob, gitBytes: blob.length, gitSha256: sha(blob), worktreeBytes: worktree.length,
        worktreeSha256: sha(worktree), bytesEqual: blob.equals(worktree), gitObjectKind: 'actual-index-blob' })
    }
  }
  return rows
}
if (process.argv.includes('--check')) {
  const record = JSON.parse(readFileSync(target))
  assert.equal(record.phase, 'board')
  assert.deepEqual(fingerprint(record.files.map(row => row.path)), record.files)
  const numstat = git(['-c', 'core.quotepath=false', 'diff', '--numstat', record.baseCommit]).toString()
  for (const row of record.files.filter(row => /\.(png|zip)$/.test(row.path))) {
    assert(numstat.includes(`-\t-\t${row.path}\n`), `Git未实际判定为二进制：${row.path}`)
    assert.equal(row.bytesEqual, true, `二进制工作区/Git字节不一致：${row.path}`)
  }
  console.log(JSON.stringify({ phase: record.phase, boundFiles: record.files.length,
    binaryFiles: record.files.filter(row => /\.(png|zip)$/.test(row.path)).length, binding: '当前实际Git/index与工作区双字节', remotePushVerified: false }))
} else {
  const baseCommit = '567f68dc9b2905a166184c24686a9f2fd74f2832'
  const paths = git(['diff', '--name-only', '--diff-filter=ACMRT', '-z', baseCommit]).toString().split('\0').filter(path => path && !excluded.includes(path)).sort()
  assert(paths.length > 0)
  writeFileSync(target, JSON.stringify({ recordedAt: new Date().toISOString(), phase: 'board', baseCommit,
    resultCommit: null, inheritedWorkbenchSnapshot: 'recovery/workbench-artifacts-567f68d.json',
    policy: '实际index blob及工作区双字节；平台提交前，非远端推送证明；本清单及核验输出排除自身以避免循环绑定',
    excluded, files: fingerprint(paths) }, null, 2) + '\n')
}
