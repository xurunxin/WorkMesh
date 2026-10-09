import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { readEvidence } from './read-evidence-bytes.mjs'

const root = resolve(import.meta.dirname, '../../..')
const directory = 'docs/reviews/a2/context-read-generation'
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8').replace(/^\uFEFF/, ''))
const write = (path, value) => writeFileSync(resolve(root, path), JSON.stringify(value, null, 2) + '\n')
const digest = bytes => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
const git = args => {
  const result = spawnSync('git', args, { cwd: root, maxBuffer: 40_000_000 })
  if (result.status !== 0) throw Error(`Git 只读核验失败：${args}`)
  return result.stdout
}
const head = () => git(['rev-parse', 'HEAD']).toString().trim()
if (process.argv[2] === 'prepare') {
  if (existsSync(resolve(root, directory, 'input.json'))) throw Error('当前输入已保存，不覆盖历史')
  mkdirSync(resolve(root, directory, 'history'), { recursive: true })
  const files = [
    'docs/reviews/a2/execution-map.json', 'docs/reviews/a2/execution-results.json', 'docs/reviews/a2/checked-source-binding.json',
    'docs/plan/activation-task-specs/index.json', 'docs/reviews/r1/test-coverage.json', 'docs/plan/a2-configuration-readiness/source.json',
    'apps/web/features/projects/project-repository-configuration.tsx',
  ].map(path => {
    const blob = git(['show', `HEAD:${path}`])
    const archive = `${directory}/history/${path.replaceAll('/', '__')}.gz`
    writeFileSync(resolve(root, archive), gzipSync(blob, { level: 9 }), { flag: 'wx' })
    return { path, source: '本轮输入 HEAD 的精确 Git blob；不冒作旧运行时工作树字节', ...digest(blob), archive }
  })
  write(`${directory}/input.json`, {
    source: '本轮用户注入第三项 blocking 独审反馈；转录见 reviewer-feedback.md，不冒原平台消息字节',
    observedAt: new Date().toISOString(), inputHead: head(), main: '74f247f9240eaf21e74ef248f71a445c1d4276d7',
    mainObservation: `${directory}/main-readback.json`, planId: 'FkfKZkAdoHUa-nr2Hq1mA', version: null,
    feedbackDocumentId: null, feedbackVersion: null, outputPlanId: null,
    approvedInputs: ['docs/plan/a2-configuration-readiness.md', 'docs/plan/a2-configuration-readiness/current-spec.md'].map(path => ({ path, ...digest(git(['show', `HEAD:${path}`])) })),
    files, initialProbe: { log: `${directory}/first-failure.log.gz`, result: '测试按钮名误写造成 6 失败；仅为夹具首败，不能证明产品缺陷' },
    baselineProbe: { log: `${directory}/baseline-failure.log.gz`, result: '纠正按钮名后，旧产品 6 失败：三入口均无 AbortSignal；迟到状态与自动确认另在修补后逐项断言' },
  })
} else {
  const [runId, liteRunId] = process.argv.slice(2)
  if (!runId || !liteRunId) throw Error('需要已结束的本轮检查及 Lite ID')
  const runPath = `docs/reviews/a2/runs/${runId}`
  const receipt = json(`${runPath}/receipts.json`)
  const before = json(`${runPath}/source-before.json`), after = json(`${runPath}/source-after.json`)
  if (receipt.results.some(item => item.code !== 0) || after.files.some(item => before.files.find(value => value.path === item.path)?.sha256 !== item.sha256)) throw Error('检查失败或运行中输入变化，不能同步通过')
  for (const item of after.files) {
    const tested = readEvidence(resolve(root, runPath, 'source/after', item.path)).toString('utf8').replaceAll('\r\n', '\n')
    if (tested !== readFileSync(resolve(root, item.path), 'utf8').replaceAll('\r\n', '\n')) throw Error(`当前源码已改变：${item.path}`)
  }
  for (const args of [['test'], ['test:e2e'], ['lint'], ['typecheck'], ['ci:validate'], ['--filter', '@workmesh/web', 'build']]) {
    if (!receipt.results.some(item => JSON.stringify(item.args) === JSON.stringify(args) && item.code === 0)) throw Error(`缺检查：${args}`)
  }
  const lite = json(`docs/reviews/a2/runs/${liteRunId}/receipts.json`)
  if (!lite.results.some(item => item.args.includes('playwright.a2-lite.config.ts') && item.code === 0)
    || lite.preInstallProxy?.status !== 200 || lite.preInstallProxy?.body.installed !== false) throw Error('缺本轮真实 Lite 安装通过')
  const map = json('docs/reviews/a2/execution-map.json')
  map.previousConfigurationRecovery ??= map.configurationRecovery
  const report = 'docs/reviews/a2/context-read-generation-review.md'
  const uiResult = `${runId} 本轮源码 A2 关闭 Gitea 浏览器及根完整浏览器退出 0；原六项和导航断言保留，skip 不计通过`
  const unitResult = `${runId} 根单元退出 0；三入口×迟到成功/失败共六个真实 apiMutation 反例通过，原 22 项恢复测试保留`
  map.configurationRecovery = { inputHead: json(`${directory}/input.json`).inputHead, report, runId, proofRunId: null,
    uiResult, unitResult, liteRunId, imageHead: lite.sha, imageReceipt: `docs/reviews/a2/runs/${liteRunId}/receipts.json`,
    liteHostBinding: { before: `docs/reviews/a2/runs/${liteRunId}/source-before-browser.json`, after: `docs/reviews/a2/runs/${liteRunId}/source-after-install.json` } }
  map.contextReadGeneration = { ...map.configurationRecovery, feedback: `${directory}/reviewer-feedback.md`, input: `${directory}/input.json` }
  map.priorLiteResult ??= map.liteResult
  map.liteResult = `${liteRunId}：精确 ${lite.sha} 镜像，真实四角色/save-load、无源码 Compose、Web 安装/认证及 HTTPS 生产 Worker；原 @lite 1 项通过，退出 0；真实设备与厂商未验收`
  map.repairs = [...map.repairs.filter(item => item.id !== 'configuration-recovery-read-generation'), {
    id: 'configuration-recovery-read-generation', file: 'apps/web/features/projects/project-repository-configuration-races.test.tsx',
    caseName: '上下文读取代际隔离', cases: ['焦点', '实时', '手动'].flatMap(source => ['成功', '失败'].map(outcome => `${source}旧读取迟到${outcome}不覆盖修改正文后的新动作，继续自动确认`)),
    assertions: ['超时保留原动作并允许改 SHA', '真实 apiMutation 两次正文产生不同 key，CSRF 正常', '统一 AbortSignal；无视 abort 的迟到成功/失败亦不得落地', '新动作等待、表单、准确上下文不受旧读取影响，下一轮自动确认且零额外 POST'],
  }]
  write('docs/reviews/a2/execution-map.json', map)
  write(`${directory}/results.json`, { observedAt: new Date().toISOString(), head: head(), runId, liteRunId, report,
    sourceBefore: `${runPath}/source-before.json`, sourceAfter: `${runPath}/source-after.json`,
    rule: '本轮 UI 与镜像均实际新执行；服务端、协议及部署历史检查仅复用逐文件证明未变的输入',
    gates: ['本次实施独审', '五项人工视觉差异接受', 'latest Required CI', 'actual main 落地'] })
}
