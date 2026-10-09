import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'

const directory = import.meta.dirname
const root = resolve(directory, '../../..')
const original = '6f059e3642291f9ab622db37e9de167d070574f2'
const main = 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const git = args => {
  const result = spawnSync('git', args, { cwd: root, windowsHide: true })
  if (result.status !== 0) throw Error(`Git 原对象不可读：${args.join(' ')}`)
  return result.stdout
}
const indexPath = resolve(directory, 'preservation.json')
if (existsSync(indexPath)) throw Error('保全索引已存在，不覆盖历史')
const paths = git(['diff', '--name-only', '-z', main, original, '--', 'apps', 'packages', 'scripts', 'infra', 'deploy', 'OPENAPI.yaml', 'docker-compose.lite.yml', 'playwright.config.ts']).toString().split('\0').filter(Boolean)
const archive = (bytes, name) => {
  const path = resolve(directory, 'history', name)
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, gzipSync(bytes))
  const compressed = readFileSync(path)
  if (!gunzipSync(compressed).equals(bytes)) throw Error('保全归档回读失败')
  return { archive: `history/${name}`, bytes: bytes.length, sha256: sha(bytes), gzipSha256: sha(compressed) }
}
const entries = paths.map(path => {
  const blob = git(['show', `${original}:${path}`])
  const raw = readFileSync(resolve(root, path))
  const gitBlob = archive(blob, `product/${path}.git.gz`)
  return { path, sourceCommit: original, gitBlob, worktree: raw.equals(blob) ? { ...gitBlob, sameAsGitBlob: true } : archive(raw, `product/${path}.worktree.gz`),
    disposition: path.startsWith('apps/web/') || path === 'playwright.config.ts' || path === 'scripts/verify-a2-lite.mjs' ? '本轮延后 UI/原 UI 验证；保全后候选移除此增量，不删除 Git 历史' : '后端或独立 Lite 兼容切片；按功能 hunk 保留，须新候选验证' }
})
const documents = ['docs/plan/activation-task-specs/09.md', 'docs/plan/activation-task-specs/index.json', 'docs/reviews/r1/test-coverage.json', 'docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md', 'docs/plan/a2-configuration-readiness.md', 'docs/reviews/a2/execution-results.json', 'docs/reviews/a2/visual-review.md', 'docs/reviews/a2/visual-delivery/source.json'].map(path => {
  const bytes = readFileSync(resolve(root, path))
  return { path, sourceCommit: original, ...archive(bytes, `documents/${path}.worktree.gz`) }
})
const objectProofs = [original, '741623eca9d26439e575d6119f7ed97d37df1fde', '380aad996489dbdabddd212be8f45edbcdda7209', main].map(commit => ({ commit, type: git(['cat-file', '-t', commit]).toString().trim(), tree: git(['rev-parse', `${commit}^{tree}`]).toString().trim() }))
const hunk = git(['diff', '--binary', main, original, '--', ...paths])
const index = { capturedAt: new Date().toISOString(), originalHead: original, main, objectProofs, entries, documents,
  fullProductDiff: archive(hunk, 'full-product-diff.patch.gz'),
  historicalEvidence: 'docs/reviews/a2/**、原批准计划和全部原始失败/恢复/视觉材料保持；索引不将旧检查用于新后端组合',
  deferredAcceptance: ['依赖深度列表', '深链返回重算', '全部满足隐藏', 'non-unmet 无横幅', 'Back/Forward 键盘窄屏 i18n', 'Lite 安装到新横幅消失整个 UI 闭环'],
  retainedUiBehavior: '同正文保 key、改体新 key，精确 action/目标/正文确认，waiting 与 action 分离，超时可改，焦点/实时/手动/轮询统一取消及代际门禁，忽略 abort 的迟到成功/失败反例',
  visualStatus: '原五项像素失败及双采集未执行缺口保留，人工未接受，不重发旧视觉问卡' }
writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')
console.log(JSON.stringify({ objects: objectProofs.length, productFiles: entries.length, documents: documents.length, index: indexPath }))
