import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8').replace(/^\uFEFF/, ''))
const write = (path, value) => writeFileSync(resolve(root, path), JSON.stringify(value, null, 2) + '\n')
const mapPath = 'docs/reviews/a2/execution-map.json'
const map = json(mapPath)
const liteResult = map.liteResult ?? '真实 Lite 运行待修补后重验；两轮失败不计通过'
const uiResult = map.configurationRecovery?.uiResult ?? 'a2-46fe0e21 完整浏览器及 a2-c2def680 关闭 Gitea 独立浏览器均通过；具体源码字节见 checked-source-binding.json'
const unitResult = map.configurationRecovery?.unitResult ?? 'a2-22323ec0 根单元检查通过；组件/契约受测字节不变，浏览器入口测试变化单列'
for (const item of map.originalTests) {
  item.result = item.id === 'todo-9-T6'
    ? liteResult
    : uiResult
}
for (const item of map.matrix) {
  if (!item.applicable) continue
  item.result = item.file.startsWith('apps/api/integration/')
    ? 'a2-21cc8a38 对应参数化场景通过；根集成 a2-22323ec0 通过，相关 API/Worker/契约原字节不变'
    : item.file.endsWith('.spec.ts')
      ? uiResult
      : unitResult
}
for (const item of map.repairs) item.result = item.id === 'lite-build-proxy' ? liteResult : item.id?.startsWith('configuration-recovery-')
  ? `${unitResult}；${uiResult}；精确场景见 ${map.configurationRecovery?.report ?? 'docs/reviews/a2/configuration-recovery-review.md'}`
  : item.file.startsWith('apps/api/integration/')
  ? 'a2-21cc8a38 实际通过，参数和断言保持；受测原字节与提交 blob 分列绑定'
  : uiResult
map.verification = { results: 'docs/reviews/a2/execution-results.json', source: 'docs/reviews/a2/checked-source-binding.json', visual: 'docs/reviews/a2/visual-review.md', latestCI: 'docs/reviews/a2/latest-ci-readback.json', status: '实现检查结果已绑定；Lite 以独立运行结果为准，真实设备/厂商、视觉确认、独审、latest Required CI、actual main 单列，不标记完成' }
write(mapPath, map)
const coveragePath = 'docs/reviews/r1/test-coverage.json'
const coverage = json(coveragePath)
const feature = coverage.features.find(item => item.seqNum === 9)
feature.actualExecutionMapping = map
write(coveragePath, coverage)
const indexPath = 'docs/plan/activation-task-specs/index.json'
const index = json(indexPath)
const task = index.tasks.find(item => item.seqNum === 9)
task.specSha256 = createHash('sha256').update(readFileSync(resolve(root, task.path))).digest('hex')
task.execution.status = '实现与检查结果已落盘，未标记整卡完成；等待实施独审及未验收项闭合'
task.execution.sourceBinding = 'docs/reviews/a2/checked-source-binding.json'
task.execution.latestCI = 'docs/reviews/a2/latest-ci-readback.json'
task.execution.originalIntegratedMain ??= task.execution.main
task.execution.main = map.main
task.execution.inputMainSource = 'docs/reviews/a2/late-main-input.json'
if (map.configurationRecovery) {
  task.execution.configurationRecovery = map.configurationRecovery.report
  task.execution.testedProductHead = map.configurationRecovery.imageHead ?? null
}
write(indexPath, index)
const sourcePath = 'docs/plan/a2-configuration-readiness/source.json'
const source = json(sourcePath)
source.execution.status = task.execution.status
source.execution.sourceBinding = task.execution.sourceBinding
source.execution.latestCI = task.execution.latestCI
source.execution.originalIntegratedMain ??= source.execution.main
source.execution.main = map.main
source.execution.inputMainSource = task.execution.inputMainSource
source.execution.currentMainInput = map.main
source.execution.liteProxyRepair = 'docs/reviews/a2/lite-proxy-repair.md'
if (map.configurationRecovery) {
  source.execution.configurationRecovery = map.configurationRecovery.report
  source.execution.testedProductHead = map.configurationRecovery.imageHead ?? null
}
write(sourcePath, source)
console.log(JSON.stringify({ testCount: map.originalTests.length, categories: map.matrix.length, repairs: map.repairs.length, planUntouched: true }))
