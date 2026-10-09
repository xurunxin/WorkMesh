import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'

const directory = import.meta.dirname
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const read = path => JSON.parse(readFileSync(resolve(directory, path), 'utf8').replace(/^\uFEFF/, ''))
const logs = (runId, log) => {
  const path = resolve(directory, 'runs', runId, log)
  if (existsSync(path)) return readFileSync(path, 'utf8')
  const index = read(`runs/${runId}/archive.json`)
  const entry = index.entries.find(item => item.originalPath === `runs/${runId}/${log}`)
  if (!entry) throw Error('原日志不可回读')
  const bytes = gunzipSync(readFileSync(resolve(directory, entry.archivePath)))
  if (hash(bytes) !== entry.sha256) throw Error('原日志哈希不匹配')
  return bytes.toString()
}
const runs = readdirSync(resolve(directory, 'runs')).map(runId => {
  const receipts = read(`runs/${runId}/receipts.json`)
  const sourceBefore = existsSync(resolve(directory, 'runs', runId, 'source-before.json')) ? read(`runs/${runId}/source-before.json`) : null
  const sourceAfter = existsSync(resolve(directory, 'runs', runId, 'source-after.json')) ? read(`runs/${runId}/source-after.json`) : null
  const changedFiles = sourceBefore && sourceAfter ? sourceBefore.files.filter(item => sourceAfter.files.find(value => value.path === item.path)?.sha256 !== item.sha256).map(item => item.path) : null
  return { runId, receipt: `runs/${runId}/receipts.json`, sourceBefore: sourceBefore ? `runs/${runId}/source-before.json` : null,
    sourceAfter: sourceAfter ? `runs/${runId}/source-after.json` : null, sourceHead: sourceBefore?.head ?? receipts.sha,
    changedDuringRun: changedFiles, sourceMeaning: '所有 API/Worker/contracts/Web 输入不变；若有增量仅独立 Lite 测试入口的等待/默认关闭准备，新 Lite 以新提交另执行',
    commands: receipts.results.filter(item => /pnpm|node/.test(item.name) && !item.args.includes('inspect')).map(item => ({ command: `${item.name} ${item.args.join(' ')}`, code: item.code,
      start: item.start ?? item.startedAt, end: item.end ?? item.endedAt, log: item.log,
      summaries: logs(runId, item.log).replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).filter(line => /\bTests\s+\d|\bTest Files\s+\d|\b\d+ passed|\b\d+ skipped|Tasks:/.test(line)).slice(-40) })),
    outcome: receipts.outcome ?? '按每命令实际 exit 记录，不用旧组合通过',
    resources: receipts.resources.map(item => ({ type: item.type, id: item.id ?? null, target: item.target ?? item.name, cleanup: item.cleanup })),
    firstFailure: receipts.results.filter(item => item.code !== 0 && /pnpm|node/.test(item.name)).map(item => ({ args: item.args, code: item.code, log: item.log })) }
})
const smokePath = resolve(directory, 'agent-smoke.log')
if (existsSync(smokePath)) {
  const raw = readFileSync(smokePath); const archived = `${smokePath}.gz`
  writeFileSync(archived, gzipSync(raw))
  if (!gunzipSync(readFileSync(archived)).equals(raw)) throw Error('smoke 原件保全失败')
  const receipt = { path: smokePath, sha256: hash(raw), bytes: raw.length, archive: 'agent-smoke.log.gz',
    activity: 'smoke 子进程 exit 0，未启动持久服务；无损回读后仅清己有日志副本', plannedAt: new Date().toISOString() }
  writeFileSync(resolve(directory, 'agent-smoke-archive.json'), JSON.stringify(receipt, null, 2) + '\n')
  unlinkSync(smokePath)
  receipt.result = { code: 0, exists: existsSync(smokePath), at: new Date().toISOString() }
  writeFileSync(resolve(directory, 'agent-smoke-archive.json'), JSON.stringify(receipt, null, 2) + '\n')
}
writeFileSync(resolve(directory, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), runs, agentSmoke: read('agent-smoke.json'),
  scope: '新后端独立候选；不以旧 UI/旧 source pass 代新组合',
  skipped: '完整集成命令中的独立 recovery 夹具及既有可选集成/单元 skip 明确未执行，不计通过；仓库 checkpoint/撤权恢复用例已实际执行',
  gates: { independentCandidateReview: '待另一 Agent 对当前后端候选独审', latestRequiredCI: '待当前交付 head 的最新 PR CI 实读', actualMain: '尚未合入，不宣称 backend done', originalUiVisual: '正式延期，旧视觉未接受，五差异及双采集缺口保留' },
  cleanup: '每次专用容器/安装/镜像/CA 卷逐资源回执见运行 receipts；共享镜像、被拒目标和当前 worktree 不清' }, null, 2) + '\n')
console.log(JSON.stringify({ runs: runs.length, currentResults: 'results.json' }))
