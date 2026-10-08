import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync } from 'node:fs'
import { resolve, relative, dirname, join } from 'node:path'

// 只读原工作区；仅向当前构建恢复已盘点文件，原件不删除、不覆盖。
const previous = resolve('C:/Users/xurx/.tds/workspaces/01a1187a-f0f2-7dd4-b77e-b9540ad44d9e')
const current = process.cwd()
if (current === previous) throw new Error('禁止在原工作区执行恢复')
const output = resolve('docs/reviews/a1')
mkdirSync(output, { recursive: true })
if (existsSync(join(output, 'recovery-inventory.json'))) throw new Error('已有恢复盘点，禁止再次覆盖当前构建')
const hash = data => createHash('sha256').update(data).digest('hex')
const git = (cwd, args) => execFileSync('git', args, { cwd, windowsHide: true })
const oldHead = git(previous, ['rev-parse', 'HEAD']).toString().trim()
if (oldHead !== '901e040a2cd4be83f9b9801bc3087ac150d1cde1') throw new Error('原基点变化')
const manifest = JSON.parse(readFileSync(join(previous, 'docs/reviews/a1/source-manifest.json'), 'utf8'))
const tracked = git(previous, ['diff', '--name-only', '-z']).toString().split('\0').filter(Boolean)
const additions = ['apps/api/integration/configuration-readiness.integration.test.ts',
  'apps/api/src/configuration-readiness.ts', 'packages/contracts/src/configuration-readiness-contracts.test.ts',
  'packages/contracts/src/configuration-readiness-contracts.ts']
const files = [...tracked, ...additions]
const restored = files.map(path => {
  const bytes = readFileSync(join(previous, path))
  const expected = manifest.files.find(entry => entry.path === path)
  if (!expected || expected.sha256 !== hash(bytes) || expected.bytes !== bytes.length)
    throw new Error(`产品/规格来源哈希不匹配：${path}`)
  mkdirSync(dirname(join(current, path)), { recursive: true })
  copyFileSync(join(previous, path), join(current, path))
  if (hash(readFileSync(join(current, path))) !== hash(bytes)) throw new Error(`恢复字节不一致：${path}`)
  const blob = execFileSync('git', ['hash-object', '--path', path, '--stdin'],
    { cwd: current, windowsHide: true, input: bytes })
  return { path, bytes: bytes.length, sha256: hash(bytes), expectedSha256: expected.sha256,
    source: '原工作区未提交原字节', gitObjectId: blob.toString().trim() }
})
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name)
  return entry.isDirectory() ? walk(path) : [path]
})
const historyRoot = join(previous, 'docs/reviews/a1')
const historicalFiles = walk(historyRoot).map(path => {
  const repoPath = relative(previous, path).replaceAll('\\', '/')
  const bytes = readFileSync(path)
  const expected = manifest.files.find(entry => entry.path === repoPath)
  return { path: repoPath, bytes: bytes.length, sha256: hash(bytes),
    expectedSha256: expected?.sha256 ?? null,
    matchesPreviousManifest: expected ? expected.sha256 === hash(bytes) && expected.bytes === bytes.length : null }
})
const missing = manifest.files.filter(entry => !existsSync(join(previous, entry.path))).map(entry => entry.path)
const plan = git(current, ['show', '98175411cb0b1f3d52c661d71e3e75c489a05e6b:docs/plan/a1-configuration-readiness.md'])
if (hash(plan) !== 'b8f45274b46301a0a2efbd5a7a27ada848e2a1025dd7e698b902db9ddfda0267') throw new Error('计划 Git 正文哈希不匹配')
writeFileSync(join(output, 'recovery-inventory.json'), JSON.stringify({ capturedAt: new Date().toISOString(),
  previousWorkspace: previous, previousHead: oldHead, currentBranch: git(current, ['branch', '--show-current']).toString().trim(),
  main: '1078bbcd527550bfabee73093b7ffd0032d3fd24',
  plan: { commit: '98175411cb0b1f3d52c661d71e3e75c489a05e6b', currentID: '39ypDb7ncugLDlTiQKVhp', version: null,
    bytes: plan.length, sha256: hash(plan), source: '旧分支已提交 Git blob；保留 source.json 的历史注入来源',
    confirmation: '本轮用户说明原 15:46 直接 confirm 有效；不冒称规划独审已进行' },
  restored, historicalFiles, missing,
  note: '历史日志均为旧分支运行；来源精确匹配与缺口分开。原工作区保持只读。Git object/SHA-256 由最终证据索引补核。' }, null, 2) + '\n')
console.log(JSON.stringify({ restored: restored.length, historicalFiles: historicalFiles.length, missing }))
