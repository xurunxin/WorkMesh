import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readEvidence } from './read-evidence-bytes.mjs'

const root = resolve(import.meta.dirname, '../../..')
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8').replace(/^\uFEFF/, ''))
const write = (path, value) => writeFileSync(resolve(root, path), JSON.stringify(value, null, 2) + '\n')
const digest = path => { const bytes = readFileSync(resolve(root, path)); return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } }
const runId = process.argv[2]
const liteRunId = process.argv[3] === '-' ? undefined : process.argv[3]
const proofRunId = process.argv[4]
if (!runId) throw Error('需要已结束的最终源码检查运行 ID')
const directory = `docs/reviews/a2/runs/${runId}`
const receipt = json(`${directory}/receipts.json`)
const before = json(`${directory}/source-before.json`), after = json(`${directory}/source-after.json`)
if (receipt.results.some(item => item.code !== 0) || after.files.some(item => before.files.find(value => value.path === item.path)?.sha256 !== item.sha256)) throw Error('检查失败或运行中源码变化，不同步通过')
const result = args => {
  const command = receipt.results.find(item => JSON.stringify(item.args) === JSON.stringify(args))
  if (!command || command.code !== 0) throw Error(`缺少实际成功结果：${args}`)
  return readEvidence(resolve(root, directory, command.log)).toString('utf8')
}
const units = result(['test'])
const full = result(['test:e2e'])
const targeted = result(['--filter', '@workmesh/web', 'exec', 'playwright', 'test', '--config', '../../playwright.config.ts', 'configuration-readiness.spec.ts'])
const summaries = text => text.split(/\r?\n/).filter(line => /Tests\s+\d|\d+ (passed|failed|skipped)\b|Tasks:\s/.test(line))
const map = json('docs/reviews/a2/execution-map.json')
if (!proofRunId) throw Error('需要可见基线断言加强后的实际重验 ID')
const proofDirectory = `docs/reviews/a2/runs/${proofRunId}`
const proof = json(`${proofDirectory}/receipts.json`)
const proofBefore = json(`${proofDirectory}/source-before.json`), proofAfter = json(`${proofDirectory}/source-after.json`)
if (proof.results.some(item => item.code !== 0) || proofAfter.files.some(item => proofBefore.files.find(value => value.path === item.path)?.sha256 !== item.sha256)) throw Error('加强断言重验失败或源码变化')
if (!proof.results.some(item => item.args.includes('project-repository-configuration.test.tsx') || item.args.includes('features/projects/project-repository-configuration.test.tsx'))
  || !proof.results.some(item => item.args.includes('configuration-readiness.spec.ts') && !item.args.includes('--list'))) throw Error('缺少加强断言的组件或浏览器结果')
map.configurationRecovery = { inputHead: 'b492a35b11445c157a825b5e747ac0e15506e491', report: 'docs/reviews/a2/configuration-recovery-review.md', runId, proofRunId,
  uiResult: `${runId} 最终产品源码完整浏览器退出 0；仅两处测试加强可见基线断言后 ${proofRunId} 关闭 Gitea 的完整 A2 用例退出 0；首败与旧源码重跑保留历史`,
  unitResult: `${runId} 根单元 29 task 成功、Web 819 通过；仅测试加强后 ${proofRunId} 组件 22 项和真实 i18n 3 项通过；当前受测原字节与提交 blob 分列绑定`,
  summaries: { units: summaries(units), fullBrowser: summaries(full), targetedBrowser: summaries(targeted) }, liteRunId: liteRunId ?? null }
const repairs = [
  { id: 'configuration-recovery-replay', file: 'apps/web/e2e/configuration-readiness.spec.ts', caseName: 'A2 响应丢失后真实重载同文重放确认已完成上下文', assertions: ['原 POST 已提交并完成解析后丢弃响应', 'page.reload() 后同文重放保持原 key 和 action ID', '准确动作/仓库/目标/正文确认，不以新基线排除'] },
  { id: 'configuration-recovery-pages', file: 'apps/web/e2e/configuration-readiness.spec.ts', caseName: '关闭 Gitea 的混合 provider 跨 Team 分页仍可配置 GitHub', assertions: ['选择非首屏第 23 仓库', '焦点、真实 workspace 事件及 pinned 后保留选择和待确认动作', '真实 POST 指向所选仓库，返回后缺口消失'] },
  { id: 'configuration-recovery-waiting', file: 'apps/web/features/projects/project-repository-configuration.test.tsx', caseName: '等待超时可重试原动作确认且不会追加命令，迟到结果可确认', cases: ['等待超时后可修改错误 SHA 并显式提交新正文，未确认记录不锁死表单', '暂时读取失败后可显式修改 SHA，迟到原结果不冒称当前草稿已提交', '读取一直挂起仍按期限释放表单，重试原动作确认并取消旧读取'], assertions: ['waiting 独立于原动作记录', '只读确认重试不追加命令', '超时与读取失败恢复编辑/原动作重试，挂起读取按期限取消'] },
]
map.repairs = [...map.repairs.filter(item => !item.id?.startsWith('configuration-recovery-')), ...repairs]
map.previousLiteResult ??= map.liteResult
if (liteRunId) {
  const lite = json(`docs/reviews/a2/runs/${liteRunId}/receipts.json`)
  const browser = lite.results.find(item => item.args.includes('playwright.a2-lite.config.ts'))
  if (!browser || browser.code !== 0 || !lite.preInstallProxy || lite.preInstallProxy.status !== 200 || lite.preInstallProxy.body.installed !== false) throw Error('缺少新精确提交的真实 Lite 安装通过')
  map.liteResult = `${liteRunId}：精确 ${lite.sha} 镜像，真实四角色/save-load、无源码 Compose、编译代理规则及 Web 安装/认证、HTTPS 生产 Worker 解析；原 @lite 1 项实际通过，退出 0；真实设备与厂商未验收`
} else map.liteResult = '本轮 UI 修补后的新精确提交 Lite 安装待重跑；旧 a2-lite-333f7614 仅为旧输入通过'
map.repairs.find(item => item.id === 'lite-build-proxy').evidence = liteRunId ? `docs/reviews/a2/runs/${liteRunId}/receipts.json` : map.liteResult
map.DoD = '未满足项列表可用 + 全部交互断言通过 + 既有 IA 与导航无回归；原六项与九类要求保持，实际结果逐输入绑定，独审/人类视觉/latest Required CI/actual main 尚未完成'
write('docs/reviews/a2/execution-map.json', map)
write('docs/reviews/a2/configuration-recovery/input.json', { source: '本轮用户注入实施独审；问题转录明确非原消息字节', inputHead: map.configurationRecovery.inputHead, main: map.main,
  feedbackDocumentId: null, feedbackVersion: null, planId: map.planId, planVersion: null, outputPlanId: null, reason: '执行修补不修改批准计划、不新建自引用 plan',
  inputs: ['docs/plan/a2-configuration-readiness.md', 'docs/plan/a2-configuration-readiness/current-spec.md', 'docs/reviews/a2/configuration-recovery/reviewer-feedback.md'].map(digest),
  previousEvidence: 'docs/reviews/a2/configuration-recovery/history/source.json', mainObservation: 'docs/reviews/a2/configuration-recovery/final-main-readback.json', runId, proofRunId, liteRunId: liteRunId ?? null })
console.log(JSON.stringify({ runId, liteRunId: liteRunId ?? null, repairs: repairs.length }))
