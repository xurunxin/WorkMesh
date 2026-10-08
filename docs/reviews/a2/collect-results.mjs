import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '../../..')
const runsRoot = resolve(import.meta.dirname, 'runs')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
const relative = path => path.replace(root + '\\', '').replaceAll('\\', '/')
const source = path => existsSync(path) ? json(path) : null
const runs = readdirSync(runsRoot).sort().filter(name => existsSync(resolve(runsRoot, name, 'receipts.json'))).map(name => {
  const directory = resolve(runsRoot, name)
  const receipt = json(resolve(directory, 'receipts.json'))
  const before = source(resolve(directory, 'source-before.json'))
  const after = source(resolve(directory, 'source-after.json'))
  const drift = before && after ? [...new Set([...before.files.map(item => item.path), ...after.files.map(item => item.path)])]
    .filter(path => before.files.find(item => item.path === path)?.sha256 !== after.files.find(item => item.path === path)?.sha256) : null
  return {
    runId: name, receipt: relative(resolve(directory, 'receipts.json')),
    runComplete: Boolean(after || receipt.outcome && receipt.outcome !== '未运行'),
    outcome: receipt.outcome ?? null, sourceBefore: before ? relative(resolve(directory, 'source-before.json')) : null,
    sourceAfter: after ? relative(resolve(directory, 'source-after.json')) : null,
    sourceHead: before?.head ?? receipt.sha ?? null, changedDuringRun: drift,
    sourceLimitation: before ? '保存 HEAD 加本轮未提交运行源码原字节；Git blob 与工作树换行另核。' : '早期运行未完整捕获前后源码；不以该通过替代当前整合验收。',
    commands: receipt.results.map(result => {
      const logPath = resolve(directory, result.log)
      const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''
      return { ...result, log: relative(logPath), summaryLines: log.split(/\r?\n/).filter(line => /Test Files\s|Tests\s+\d|\d+ (passed|failed|skipped)\b|Tasks:\s|Failed Suites|Error:|Error \[|ERR_|FAILED|failed to solve|未验收|不通过/.test(line)).slice(-45) }
    }),
    cleanup: receipt.resources.map(item => ({ type: item.type, id: item.id ?? null, name: item.name ?? item.target, owner: item.owner, preDelete: item.preDelete ?? null, cleanup: item.cleanup ?? null, postDelete: item.postDelete ?? null })),
    sanitization: existsSync(resolve(directory, 'sanitization.json')) ? relative(resolve(directory, 'sanitization.json')) : null,
  }
})
const inputs = ['docs/plan/a2-configuration-readiness.md', 'docs/plan/a2-configuration-readiness/current-spec.md', 'docs/plan/activation-task-specs/09.md', 'docs/reviews/a2/execution-map.json'].map(path => {
  const bytes = readFileSync(resolve(root, path))
  const blob = spawnSync('git', ['show', `HEAD:${path}`], { cwd: root, maxBuffer: 30_000_000 })
  return { path, worktree: { bytes: bytes.length, sha256: sha256(bytes) }, headBlob: blob.status === 0 ? { bytes: blob.stdout.length, sha256: sha256(blob.stdout) } : null }
})
writeFileSync(resolve(import.meta.dirname, 'execution-results.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), todoId: '0BkezbmWV6k8vwrlSNuF_', planId: 'FkfKZkAdoHUa-nr2Hq1mA', version: null,
  head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
  inputs, runs, acceptance: {
    status: '实现与实际检查记录；未标记整卡完成',
    rule: '只引用当前源码、具体命令与实际退出码；skip、未执行、失败均不计通过。历史首败保留，不把后续重跑倒填为首轮通过。',
    gates: ['Lite 安装链路以专用运行实际结果为准', '人工视觉评审待确认', '实施产物独审待完成', '本分支最新 Required CI 待完成', '实际 main 落地待完成'],
    remainingMainIssue: '全站 i18n 扫描含 C1 原有硬编码文案；保留诊断，不通过忽略规则掩盖，不扩大 A2 修改范围。',
    cleanupPolicy: '仅本任务登记资源；共享镜像、当前工作树、C3 审计与其新旧工作树保留。',
  },
}, null, 2) + '\n')
console.log(JSON.stringify({ runs: runs.length, output: 'docs/reviews/a2/execution-results.json' }))
