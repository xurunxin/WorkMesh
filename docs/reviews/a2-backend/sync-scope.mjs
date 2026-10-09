import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const save = (path, value) => writeFileSync(resolve(root, path), JSON.stringify(value, null, 2) + '\n')
const spec = readFileSync(resolve(import.meta.dirname, 'current-spec.md'))
const digest = createHash('sha256').update(spec).digest('hex')
writeFileSync(resolve(root, 'docs/plan/activation-task-specs/09.md'), spec)
const source = { todoId: '0BkezbmWV6k8vwrlSNuF_', scopeChangeAt: '2026-10-09T12:00:00+08:00',
  sha256: digest, snapshotPath: 'docs/reviews/a2-backend/current-spec.md',
  source: '当前用户完整 Spec 注入；Chief 旧卡读回另存 history/chief-old-spec.md', version: null,
  binding: 'docs/reviews/a2-backend/sources.json' }
const index = read('docs/plan/activation-task-specs/index.json')
const task = index.tasks.find(item => item.seqNum === 9)
task.historicalUi = { source: task.currentSource, approvedPlan: task.approvedPlanBinding, execution: task.execution,
  preservation: 'docs/reviews/a2-backend/preservation.json', scope: '旧 UI/失败/视觉未验收及六测试完整保全，当前不作为后端通过' }
task.title = '[A2-后端] 仓库配置授权、稳定请求身份与异步结果追溯'
task.specSha256 = digest; task.currentSource = source
task.currentPlanPath = 'docs/plan/backend-agent-mcp-priority/branch-separation.md'
task.testMapping = 'docs/reviews/a2-backend/coverage.json'
task.approvedScope = ['仓库 Human/Agent 精确分页边界', '连接秘密稳定 HMAC 请求身份', 'Worker 外读/恢复/落库授权与原 requester 受众', '异步 action 追溯', '现有消费者和独立 Lite 代理兼容']
task.stages = [{ id: '9-backend', owner: 'A2 执行者', input: '已合 #53/c768 精确 hunk 与用户后端范围裁定',
  output: '后端独立候选；延期 UI 移出当前差异并无损保全；当前 Web 恢复 main',
  acceptance: '新组合适用本机 checks、独审、最新 Required CI 与 actual main；不代原 UIDoD', testMapping: task.testMapping }]
task.syncStatus = '当前后端范围已同步受控文件；旧 UI 与旧检查保留历史，新候选待实际验证/独审/CI/main'
task.latestMainImpact = 'c768 相对已整合 74f247f 仅 #53 七份文档；产品无主线增量，正常整合精确对象'
task.execution = { inputMain: 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d', record: 'docs/reviews/a2-backend/README.md', results: 'docs/reviews/a2-backend/results.json', status: '未运行；不引用旧组合通过' }
save('docs/plan/activation-task-specs/index.json', index)
const coverage = read('docs/reviews/r1/test-coverage.json')
const feature = coverage.features.find(item => item.seqNum === 9)
feature.historicalUiMapping = { originalDoD: feature.originalDoD, matrix: feature.matrix, supplementalCases: feature.supplementalCases, actualExecutionMapping: feature.actualExecutionMapping, approvedPlanBinding: feature.approvedPlanBinding }
for (const entry of feature.originalTests) {
  entry.historicalStatus = entry.status; entry.status = '本轮延期 UI；不计新后端通过'
  entry.disposition = '用户收窄范围，原用例完整保全在 6f059e 与 preservation.json；后续重设计继续消费行为合同'
}
feature.originalDoD = { historical: feature.originalDoD, currentDisposition: '原 UIDoD 正式延期，未视觉接受；后端 DoD 见当前完整 Spec' }
const stage3 = 'apps/api/integration/stage3-delivery.integration.test.ts'
const stage4 = 'apps/api/integration/stage4-operations.integration.test.ts'
const rows = [
  ['happy path', true, stage3, 'authorizes before context disclosure and persists provider intent without provider I/O', '提交仅持久化 action，Worker 完成后 context 可精确追溯；新增 DTO 与现有 SDK/MCP/Web 消费兼容'],
  ['unauthorized actor', true, stage3, '解析期间撤权后无上下文发布：%s', '覆盖 Human/角色/membership/目标/Team/连接/仓库变更，无 context/pinned/outbox，拒绝受众仅原 requester；stage4 Agent 新过滤拒绝/旧范围正对照'],
  ['invalid state transition', true, stage3, 'checkpoint 后撤权重启无上下文发布：%s', '持久化结果不授予过期目标权限；停用/删除/作用域变化禁止发布'],
  ['duplicate idempotency key', true, stage3, '连接同 key 仅改秘密字段均冲突：%s', '三秘密字段独立参数化；同文重放、旧脱敏键拒绝、TTL 边界；明文不入账本/事件/日志'],
  ['stale revision', false, stage3, null, '本切片不新增 revisioned mutation；context POST 无 If-Match，保持异步追加事实语义'],
  ['transaction failure', true, stage3, 'authorizes before context disclosure and persists provider intent without provider I/O', '现有事务失败注入回滚 action/context/event/outbox，不松原断言'],
  ['webhook/job replay', true, stage3, 'A2 仓库解析重放仅产生一份上下文', '重复 tick 和重建 Worker 精确一次；保留现有 webhook 正负对照'],
  ['concurrent request', true, stage3, '撤权与上下文落库按持锁顺序串行', '两真实连接观测 pg_blocking_pids，撤权先锁拒绝/发布先锁提交；stage4 筛选游标不换域'],
  ['server restart/outbox recovery', true, stage3, 'checkpoint 后撤权重启无上下文发布：%s', '结果 checkpoint 后重建 Worker 不再读供应商，重验权限；正常恢复仍精确一次'],
]
const matrix = rows.map(([category, applicable, file, caseName, assertion]) => ({ category, applicable, file, caseName, assertion, owner: 'A2 执行者', result: applicable ? '未运行；新候选结果单独绑定' : '不适用；不伪造测试' }))
const extra = [
  [stage4, 'Human 可用仓库筛选在分页前排除关闭 provider 与其他 Team'],
  [stage4, 'Human 仓库筛选游标绑定不允许换域续页'],
  [stage4, 'Agent 旧列表权限不变且拒绝 Human 新筛选参数'],
  [stage3, '连接同文重放与旧脱敏指纹拒绝降级'],
  [stage3, '仓库发布与 C1 事件快照共享事务兼容'],
  ['packages/contracts/src/repository-configuration-contracts.test.ts', '仓库Human筛选参数与操作提示响应边界'],
].map(([file, caseName]) => ({ file, caseName, result: '未运行' }))
feature.matrix = matrix; feature.supplementalCases = extra; feature.currentSource = source
feature.currentPlanPath = task.currentPlanPath; feature.detailedMappingPath = task.testMapping
feature.actualExecutionMapping = 'docs/reviews/a2-backend/results.json'
save('docs/reviews/r1/test-coverage.json', coverage)
save(task.testMapping, { source, matrix, supplementalCases: extra, originalSixTests: feature.originalTests,
  lite: { command: 'node scripts/verify-a2-backend-lite.mjs', scope: 'main 现有 Web/真实代理安装认证/四角色无源码/TLS/context 实际落库与 action 归因；非旧新横幅 UI 链路', status: '未运行', risk: '原 Lite RustFS 凭证映射安装缺口保留，不靠绕过认证/代理通过' } })
console.log(JSON.stringify({ specSha256: digest, originalTests: feature.originalTests.length, categories: matrix.length }))
