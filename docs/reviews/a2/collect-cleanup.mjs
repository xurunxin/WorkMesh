import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = import.meta.dirname
const read = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
const runs = readdirSync(resolve(root, 'runs')).filter(name => existsSync(resolve(root, 'runs', name, 'receipts.json'))).map(runId => {
  const directory = resolve(root, 'runs', runId)
  const receipt = read(resolve(directory, 'receipts.json'))
  return { runId, receipt: `runs/${runId}/receipts.json`, outcome: receipt.outcome ?? null,
    resources: receipt.resources.map(resource => ({ ...resource })),
    pathReceipts: existsSync(resolve(directory, 'cleanup-path-receipts.json')) ? read(resolve(directory, 'cleanup-path-receipts.json')) : null,
    sanitization: existsSync(resolve(directory, 'sanitization.json')) ? `runs/${runId}/sanitization.json` : null,
    crashObservation: existsSync(resolve(directory, 'post-harness-failure-observation.json')) ? `runs/${runId}/post-harness-failure-observation.json` : null,
  }
})
const archive = read(resolve(root, 'raw-evidence-archives.json'))
const result = { generatedAt: new Date().toISOString(), scope: '仅本 A2 工作树登记资源；完整逐 ID/path 原始回执保留，汇总不替代原件', runs,
  archiveCleanup: { inventory: 'raw-evidence-archives.json', entries: archive.entries.length, verifiedAndRemovedCopies: archive.entries.filter(entry => entry.roundTrip?.exact && entry.deleteResult?.exists === false).length },
  retained: [
    { resource: '当前 conversation worktree、node_modules、.next 与本任务证据', reason: '仍用于交付与恢复，当前目录不能提前删除' },
    { resource: '共享 Node/PostgreSQL/Redis/RustFS 基础镜像、Docker build cache、默认网络', reason: '共享或非本任务专用资源；没有 global prune' },
    { resource: 'C3 新旧 workspace、两次清理拒绝及违规审计、main 历史清理文档', reason: '用户明确只读候选，未修改、未删除、未绕过拒绝' },
    { resource: '历史进程未完整记录退出码的观察缺口', reason: '不以首败后的无监听推断原进程最终码；保留异常及独立收尾观察' },
  ] }
writeFileSync(resolve(root, 'cleanup-results.json'), JSON.stringify(result, null, 2) + '\n')
writeFileSync(resolve(root, 'cleanup-report.md'), `# A2 资源收尾\n\n完整登记、创建信息、删除前归属与活动引用、实际操作退出码及逐 path 回执见 [cleanup-results.json](cleanup-results.json) 和其指向的各 run 原件。汇总不替代逐项回执；未确认项按原记录保留，不推断成功。\n\n两轮 Lite 首败与后续重验均使用独有 project、镜像和安装目录。Compose 容器、卷、网络按 project label 核对；CA 额外卷、装载容器、四角色 probe 和镜像按 task label 及零引用核对。服务结束后保全日志，再清专用资源；安装目录先验证绝对路径、临时目录边界及整树无链接，再逐 path 删除并记录结果。文件类型资源的单独 cleanup 为 null 时，以同目录逐 path 回执核对，不将 null 填成成功。\n\n原始日志与源码快照采用逐文件无损 gzip；目前 ${result.archiveCleanup.entries} 份的解压 SHA 和原字节逐项一致。仅已核验的闲置未压缩副本被清理。历史 Git blob 和 Windows 工作树换行分列记录，脱敏 trace 不冒作秘密原字节。复现 HTML 报告时须先按原相对路径解压其归档数据文件，不能把缺失的未压缩引用当完整在线报告。\n\n保留当前 worktree 和交付证据、共享基础镜像/网络/build cache。C3 的审计和新旧目录保持只读；没有重开其清理任务，没有 global prune，没有换工具绕过历史审批拒绝。\n`)
console.log(JSON.stringify({ runs: runs.length, output: 'cleanup-results.json' }))
