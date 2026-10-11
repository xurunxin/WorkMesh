import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const root = 'docs/reviews/b1-b2/blueberry-recovery'
const attempt = process.argv[2]
if (!attempt || !/^[a-z0-9-]+$/.test(attempt)) throw new Error('需要准确运行标识')
const source = JSON.parse(readFileSync(`${root}/${attempt}/run-source.json`, 'utf8'))
if (source.files.some(file => /[\r\n"]/.test(file.path))) throw new Error('路径不适合 Git 批量 hash 输入')
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64_000_000 })
const head = git(['rev-parse', 'HEAD']).trim()
const tree = new Map(git(['ls-tree', '-r', '-z', head]).split('\0').filter(Boolean).map(row => {
  const [metadata, path] = row.split('\t'); return [path, metadata.split(' ')[2]]
}))
const hashes = execFileSync('git', ['hash-object', '--stdin-paths'], { encoding: 'utf8',
  input: source.files.map(file => file.path).join('\n') + '\n', maxBuffer: 64_000_000 }).trim().split('\n')
if (hashes.length !== source.files.length) throw new Error('Git hash 数量不一致')
const rows = source.files.map((file, index) => ({ path: file.path, runtimeSha256: file.rawSha256,
  runtimeBytesStillMatch: createHash('sha256').update(readFileSync(file.path)).digest('hex') === file.rawSha256,
  runtimeCanonicalGitBlob: hashes[index], capturedIndexBlob: file.indexBlob, committedBlob: tree.get(file.path),
  canonicalMatches: hashes[index] === file.indexBlob && hashes[index] === tree.get(file.path) }))
const proof = { capturedAt: new Date().toISOString(), head, sourceRuntimeHead: source.runtimeHead ?? source.head,
  sourceWasDirty: source.dirty ?? null, branch: git(['branch', '--show-current']).trim(),
  rule: '工作树原字节 SHA-256 实比；规范 Git blob 用 hash-object 与真实路径属性计算，与捕获 index 和当前提交三方一致', rows }
writeFileSync(`${root}/${attempt}/delivery-binding.json`, JSON.stringify(proof, null, 2) + '\n')
const failed = rows.filter(row => !row.runtimeBytesStillMatch || !row.canonicalMatches)
console.log(JSON.stringify({ head, files: rows.length, mismatches: failed.map(row => row.path) }))
if (failed.length) process.exitCode = 1
