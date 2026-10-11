import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const phase = process.argv[2]
if (!['before', 'after'].includes(phase)) throw new Error('需要 before 或 after')
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64_000_000 })
const head = git(['rev-parse', 'HEAD']).trim()
const selected = ['apps', 'packages', 'scripts', 'infra', '.github', 'skills', '.gitattributes',
  'AGENT_PROTOCOL.md', 'CONTEXT.md', 'OPENAPI.yaml', 'SCHEMA.sql', '.node-version',
  'pnpm-lock.yaml', 'package.json', 'turbo.json', 'vitest.config.ts']
const entries = git(['ls-files', '--stage', '-z', ...selected]).split('\0').filter(Boolean).map(row => {
  const [metadata, path] = row.split('\t')
  if (!path || /[\r\n"]/.test(path)) throw new Error('无法绑定源码路径')
  return { path, indexBlob: metadata.split(' ')[1] }
})
const tree = new Map(git(['ls-tree', '-r', '-z', head]).split('\0').filter(Boolean).map(row => {
  const [metadata, path] = row.split('\t'); return [path, metadata.split(' ')[2]]
}))
const blobs = execFileSync('git', ['hash-object', '--stdin-paths'], { encoding: 'utf8',
  input: entries.map(row => row.path).join('\n') + '\n', maxBuffer: 64_000_000 }).trim().split('\n')
if (blobs.length !== entries.length) throw new Error('源码数量不符')
const files = entries.map((row, index) => {
  const bytes = readFileSync(row.path)
  return { ...row, rawBytes: bytes.length, rawSha256: createHash('sha256').update(bytes).digest('hex'),
    canonicalGitBlob: blobs[index], committedBlob: tree.get(row.path) ?? null }
})
const mismatches = files.filter(row => row.indexBlob !== row.canonicalGitBlob || row.indexBlob !== row.committedBlob).map(row => row.path)
const prior = phase === 'after' ? JSON.parse(readFileSync('ci-logs/connector-source-before.json', 'utf8')) : null
const beforeFiles = new Map(prior?.files.map(row => [row.path, row.rawSha256]) ?? [])
const changed = prior ? files.filter(row => beforeFiles.get(row.path) !== row.rawSha256).map(row => row.path) : []
const removed = prior ? prior.files.filter(row => !files.some(file => file.path === row.path)).map(row => row.path) : []
const snapshot = { phase, capturedAt: new Date().toISOString(), head, tree: git(['rev-parse', 'HEAD^{tree}']).trim(),
  platform: process.platform, arch: process.arch, node: process.version, executable: process.execPath,
  git: git(['--version']).trim(), runId: process.env.GITHUB_RUN_ID ?? null, runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  githubSha: process.env.GITHUB_SHA ?? null, rule: '保留运行原字节摘要；按真实路径 Git 属性计算 blob，与 index/提交三方一致，前后原字节不变',
  files, mismatches, changed, removed, sameHead: !prior || prior.head === head }
mkdirSync('ci-logs', { recursive: true })
writeFileSync(`ci-logs/connector-source-${phase}.json`, JSON.stringify(snapshot, null, 2) + '\n')
console.log(JSON.stringify({ phase, head, platform: process.platform, files: files.length, mismatches, changed, removed, sameHead: snapshot.sameHead }))
if (mismatches.length || changed.length || removed.length || !snapshot.sameHead) process.exitCode = 1
