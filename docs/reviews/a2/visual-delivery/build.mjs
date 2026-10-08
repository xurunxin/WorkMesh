import { createHash } from 'node:crypto'
import { readdirSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { readEvidence } from '../read-evidence-bytes.mjs'

const directory = import.meta.dirname
const root = resolve(directory, '../../../..')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const posix = path => path.replaceAll('\\', '/')
const rel = path => posix(relative(root, path))
const walk = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(path, entry.name)) : [resolve(path, entry.name)])
const json = path => JSON.parse(readEvidence(resolve(root, path)))
const gitBytes = (head, path) => {
  const result = spawnSync('git', ['show', `${head}:${path}`], { cwd: root, windowsHide: true })
  if (result.status !== 0) throw Error(`Git 原件不可读：${head}:${path}`)
  return result.stdout
}
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim()
const productHead = '380aad996489dbdabddd212be8f45edbcdda7209'
const oldRun = 'docs/reviews/a2/runs/a2-6f596da7'
const currentRun = 'docs/reviews/a2/runs/a2-71164f40'
const localRun = 'docs/reviews/a2/visual-delivery/runs/visual-f321025a'
const images = []
mkdirSync(resolve(directory, 'images'), { recursive: true })
const image = (source, name, group, extra = {}) => {
  const bytes = readEvidence(source)
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error(`不是 PNG：${source}`)
  const path = `images/${name}.png`
  writeFileSync(resolve(directory, path), bytes)
  const entry = { path, group, source: rel(source), bytes: bytes.length, sha256: sha(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), ...extra }
  if (sha(readFileSync(resolve(directory, path))) !== entry.sha256) throw Error('图片复制字节不一致')
  images.push(entry)
  return entry
}
const oldBefore = json(`${oldRun}/source-before.json`)
const oldAfter = json(`${oldRun}/source-after.json`)
const oldPaths = walk(resolve(root, oldRun, 'playwright/mocked-dev/output'))
const d0Params = {
  colorScheme: 'light', locale: 'zh-CN', timezoneId: 'UTC', deviceScaleFactor: 1,
  fixedTime: '2026-08-22T09:30:00.000Z', reducedMotion: 'reduce', serviceWorkers: 'block',
  launchArguments: ['--disable-gpu', '--disable-skia-runtime-opts', '--force-color-profile=srgb', '--disable-partial-raster'],
  screenshot: { animations: 'disabled', caret: 'hide', fullPage: true, style: 'apps/web/e2e/mocked/d0-screenshot.css' },
  threshold: 0.005, maxDiffPixels: 0,
  browserVersion: '149.0.7827.55', platform: 'win32',
  browserVersionObservation: '同轮通过的窄屏 project-replay.json；五项失败没有自己的 replay.json，不能据此声称已完成双采集',
}
const surfaces = [
  ['workbench', 'desktop-1440x1000', '桌面工作台', '/workbench', 'URL 未明确 workKind，新增上下文提示和普通入口链接；保留会话和消息布局。'],
  ['board', 'desktop-1440x1000', '桌面看板', '/?view=projects&project=project-1&tab=board', '项目仓库配置区改变内容高度；原列标题和目标卡片可达断言已执行。'],
  ['project', 'desktop-1440x1000', '桌面项目总览', '/?view=projects&project=project-1', '既有项目面板增加仓库配置区及其焦点入口；总览可视高度改变。'],
  ['workbench', 'mobile-390x844', '窄屏工作台', '/workbench', '新增 URL 上下文提示和入口在窄屏换行；历史图用于布局差异评审。'],
  ['board', 'mobile-390x844', '窄屏看板', '/?view=projects&project=project-1&tab=board', '配置区影响滚动布局；采集前已滚动到目标列并断言卡片及列标题可达。'],
].map(([slug, project, title, route, explanation]) => {
  const viewport = project.startsWith('desktop') ? { width: 1440, height: 1000 } : { width: 390, height: 844 }
  const set = ['expected', 'actual', 'diff'].map(kind => {
    const source = oldPaths.find(path => dirname(path).endsWith(project) && path.endsWith(`${slug}-${kind}.png`))
    if (!source) throw Error(`缺少 ${slug}/${project}/${kind}`)
    const entry = image(source, `d0-${slug}-${project.startsWith('desktop') ? 'desktop' : 'mobile'}-${kind}`, '历史 D0', { kind, runId: 'a2-6f596da7', viewport, route })
    if (kind === 'expected') {
      const baseline = `apps/web/e2e/baselines/d0/win32/${project}/${slug}.png`
      const original = gitBytes(oldBefore.head, baseline)
      if (sha(original) !== entry.sha256) throw Error('expected 与原 D0 Git 基线不一致')
      entry.baseline = { path: baseline, gitHead: oldBefore.head, bytes: original.length, sha256: sha(original) }
    }
    return entry
  })
  return { slug, project, title, route, explanation, viewport, images: set, result: '像素比较失败；双采集一致断言未执行；人工接受待确认' }
})
const currentBefore = json(`${currentRun}/source-before.json`)
const currentAfter = json(`${currentRun}/source-after.json`)
const component = 'apps/web/features/projects/project-repository-configuration.tsx'
const archivedComponent = readEvidence(resolve(root, currentRun, 'source/before', component))
if (sha(archivedComponent) !== sha(gitBytes(productHead, component)) || sha(archivedComponent) !== sha(gitBytes(head, component))) throw Error('当前组件绑定不一致')
const currentPaths = walk(resolve(root, currentRun, 'playwright-gitea-disabled/root-mixed/output'))
const current = ['workbench-desktop', 'project-desktop', 'workbench-zh-CN-light', 'project-zh-CN-light', 'workbench-zh-CN-dark', 'project-zh-CN-dark'].map(name => {
  const path = currentPaths.find(path => path.endsWith(`${name}.png`))
  if (!path) throw Error(`缺少当前截图 ${name}`)
  const item = image(path, `current-${name}`, '当前源码已有受测轮', { runId: 'a2-71164f40', productHead, localeCopy: 'zh-CN', theme: name.endsWith('dark') ? 'dark' : 'light',
    screenshot: { fullPage: false, options: 'page.screenshot 默认选项；未套 D0 栅格 CSS' },
    clock: '该用例未固定时间', timezoneId: null, browserVersion: null,
    missingParameters: '原用例未单独记录浏览器版本/时区；不补造、不与 D0 做同参数比较' })
  item.viewport = { width: item.width, height: item.height }
  return item
})
const localPaths = walk(resolve(root, localRun))
const capturePath = localPaths.find(path => path.endsWith('capture.json'))
const localCapture = json(rel(capturePath))
const local = localCapture.captures.map(capture => {
  const path = localPaths.find(path => path.endsWith(`${capture.name}.png`))
  const entry = image(path, `recovery-${capture.name}`, '当前源码局部采集', { runId: 'visual-f321025a', productHead,
    viewport: capture.name.endsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    scope: capture.name.endsWith('mobile') ? '真实 390 × 844 视口；配置标题与恢复入口可见，不计 API/Worker/Lite 验收' : '#project-repository-configuration 元素截图；真实组件、传输夹具，不计 API/Worker/Lite 验收' })
  if (capture.sha256 !== entry.sha256) throw Error('局部采集原哈希不一致')
  return entry
})
const inputs = [
  `${oldRun}/source-before.json`, `${oldRun}/source-after.json`, `${oldRun}/receipts.json`,
  `${currentRun}/source-before.json`, `${currentRun}/source-after.json`, `${currentRun}/receipts.json`,
  'docs/reviews/a2/visual-review.md', 'docs/reviews/a2/raw-evidence-archives.json',
  'docs/plan/a2-configuration-readiness.md',
].map(path => { const bytes = readEvidence(resolve(root, path)); return { path, bytes: bytes.length, sha256: sha(bytes), disposition: '只读历史原件，不改字节' } })
const provenance = {
  format: 'PNG 普通文件逐字节复制；SHA-256 对图片原字节，不转换换行、不裁剪历史图片',
  preparedFromHead: head, productHead, observedMain: '74f247f9240eaf21e74ef248f71a445c1d4276d7',
  mainObservation: '本轮平台 git ls-remote origin refs/heads/main；不用 FETCH_HEAD 或旧 origin/main 推断',
  humanVisualApproval: '待确认；不因自动采集或技术审查通过改为视觉通过',
  historicalD0: { runId: 'a2-6f596da7', sourceHead: oldBefore.head, sourceBefore: `${oldRun}/source-before.json`, sourceAfter: `${oldRun}/source-after.json`,
    sourceBeforeObservedAt: oldBefore.observedAt, sourceAfterObservedAt: oldAfter.observedAt,
    sourceFilesUnchanged: JSON.stringify(oldBefore.files) === JSON.stringify(oldAfter.files),
    dirtySourceOverrides: oldBefore.files, parameters: d0Params, surfaces,
    result: '8 通过、6 失败；本页五项像素失败均未执行后续双采集一致断言；另项桌面详情 ERR_NO_BUFFER_SPACE 后 a2-40208d29 定向通过，首败不删除' },
  currentRun: { runId: 'a2-71164f40', sourceHead: currentBefore.head, sourceBefore: `${currentRun}/source-before.json`, sourceAfter: `${currentRun}/source-after.json`,
    sourceBeforeObservedAt: currentBefore.observedAt, sourceAfterObservedAt: currentAfter.observedAt,
    sourceFilesUnchanged: JSON.stringify(currentBefore.files) === JSON.stringify(currentAfter.files),
    dirtySourceOverrides: currentBefore.files,
    component: { path: component, bytes: archivedComponent.length, sha256: sha(archivedComponent), equalsProductHeadAndPreparedHead: true },
    scope: 'Gitea 关闭定向浏览器轮已有截图；普通未满足/空仓库布局，不能证明新增恢复状态，也不冒作 D0 像素通过' },
  localCapture: { runId: 'visual-f321025a', receipt: `${localRun}/receipts.json`, sourceBefore: `${localRun}/source-before.json`, sourceAfter: `${localRun}/source-after.json`, ...localCapture,
    failuresPreserved: [
      { runId: 'visual-365de426', reason: 'docs 下模块未声明 ESM，import.meta 加载失败；未启动服务，随后只增加局部 package.json' },
      { runId: 'visual-0780e159', reason: '局部夹具把项目 Team 映射成 team-2，目标不匹配，表单不存在；修正为原项目 team-1，不改产品' },
    ],
    partialCapturePreserved: { runId: 'visual-82665dc9', result: '局部采集断言通过，但窄屏元素长图被固定高度滚动容器截断；原件保留，最终窄屏图改为真实视口采集，仅改局部采集脚本' },
    result: '局部采集 1 项通过，四张图；重试只读确认后 POST 总数仍 1；非安装、非原 28 项恢复测试的新执行' },
  images, immutableInputs: inputs,
  sanitization: '图片仅测试夹具内容；连接/凭证表单保持折叠，SHA 为 a/b 固定占位，无真实密钥；逐图查看，未改图像字节',
}
writeFileSync(resolve(directory, 'source.json'), JSON.stringify(provenance, null, 2) + '\n')
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const figure = (item, title, explanation = '') => `<figure><a href="${item.path}"><img src="${item.path}" alt="${escape(title)}" width="${item.width}" height="${item.height}"></a><figcaption><strong>${escape(title)}</strong>${explanation ? `<span>${escape(explanation)}</span>` : ''}<small>${item.width} × ${item.height} · SHA-256 ${item.sha256.slice(0, 12)}… · 点击原图放大</small></figcaption></figure>`
const historical = surfaces.map(surface => `<article id="${surface.slug}-${surface.project}"><h3>${surface.title}<span class="tag historical">历史 · 像素失败</span></h3><p>${surface.explanation} 路由 <code>${escape(surface.route)}</code>，视口 ${surface.viewport.width} × ${surface.viewport.height}。</p><div class="comparison">${surface.images.map(item => figure(item, ({ expected: 'expected · 原 D0 基线', actual: 'actual · 旧运行采集', diff: 'diff · 原像素差异' })[item.kind])).join('')}</div><p class="gap">保留失败：${surface.result}。这组 actual 早于两次 UI 恢复修订；没有拿当前图替换它。</p></article>`).join('\n')
const currentTitles = { 'current-workbench-desktop': '当前工作台 · 桌面亮色', 'current-project-desktop': '当前项目配置 · 桌面亮色',
  'current-workbench-zh-CN-light': '当前工作台 · 窄屏亮色', 'current-project-zh-CN-light': '当前项目配置 · 窄屏亮色',
  'current-workbench-zh-CN-dark': '当前工作台 · 窄屏暗色', 'current-project-zh-CN-dark': '当前项目配置 · 窄屏暗色' }
const recoveryTitles = { 'recovery-waiting-desktop': ['等待解析', '提交后禁用字段，保留待处理动作提示。'], 'recovery-timeout-desktop': ['超时后的恢复入口', '字段已解禁，“重试确认”和“修改配置”可用。'],
  'recovery-edit-desktop': ['显式修改配置', '修改入口聚焦 SHA；示例 SHA 已改为 b，未再次提交。'], 'recovery-edit-mobile': ['窄屏恢复入口', '同一状态切到 390 × 844，回到配置标题；只采真实视口，完整长表单仍需滚动。'] }
writeFileSync(resolve(directory, 'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>A2 人工视觉确认材料</title><link rel="stylesheet" href="style.css"></head>
<body><main><header><p class="eyebrow">WorkMesh · A2 · 人工视觉确认材料</p><h1>五项历史差异与当前恢复界面</h1><p>仅补审阅材料，产品源码和原证据未改。代码审查通过与 28 项恢复测试的技术结论保留；<strong>人工视觉尚未接受，本轮不合入。</strong></p><nav><a href="#historical">五项原差异</a><a href="#current">当前受测轮截图</a><a href="#recovery">恢复状态局部图</a><a href="#sources">来源与缺口</a></nav></header>
<section id="historical"><h2>五项 D0 原差异 <span class="tag historical">历史布局</span></h2><p>原运行 <code>a2-6f596da7</code>，Git 基点 <code>${oldBefore.head}</code>，另有原 source-before 的未提交覆盖，不能只把基点当完整受测源码。观察 ${oldBefore.observedAt} 至 ${oldAfter.observedAt}，前后覆盖指纹一致。</p><p>固定 zh-CN / light / UTC / DPR 1，桌面 1440 × 1000、窄屏 390 × 844，客户端时间 2026-08-22T09:30:00.000Z；全页、动画关闭、光标隐藏、原 d0-screenshot.css；threshold 0.005、maxDiffPixels 0，软件栅格四参数保持。浏览器 149.0.7827.55 / win32 由同轮通过项回执读得，五项失败没有自己的 replay.json。</p>${historical}</section>
<section id="current"><h2>已有当前受测轮截图 <span class="tag current">当前源码</span></h2><p>来自 <code>a2-71164f40 / playwright-gitea-disabled</code>，源基点 <code>${currentBefore.head}</code> 加该轮两个未提交文件；组件原字节与 <code>${productHead}</code> 和材料准备 head <code>${head}</code> 一致（23737 字节，SHA-256 <code>${sha(archivedComponent)}</code>）。不是从旧 a2-46fe0e21 改标签。</p><p>原 Back/Forward、键盘、窄屏、中英文/明暗用例的已有图，展示缺口与空仓库。页面截图 1440 × 1000 / 390 × 844，中文、亮色或暗色；没有固定时钟或单独记录浏览器/时区，不与历史 D0 做同参数像素比较，也不声称图片字节相同。</p><div class="current-grid">${current.map(item => figure(item, currentTitles[item.path.split('/')[1].replace('.png', '')])).join('')}</div></section>
<section id="recovery"><h2>新增恢复状态局部图 <span class="tag current">当前源码 · 局部夹具</span></h2><p><code>visual-f321025a</code>，以真实 Next 页面、当前组件及 apiMutation 执行状态转换；final-tour 传输夹具提供待处理 action 和空 context，<strong>不运行真实 API/Worker，不用于 Lite 安装或授权验收</strong>。未替换 DOM、未裁剪历史图、未修改产品。局部采集 1 项通过，重试确认后仍只有首次 POST。</p><p>zh-CN / light / UTC / DPR 1 / reducedMotion reduce，软件栅格参数同上述四项。客户端起始 2026-10-09T00:00:00.000Z，两次快进 61000ms 展示超时；浏览器 149.0.7827.55 / win32。桌面采集整个配置元素，窄屏采集真实视口；均不是 D0 全页截图。每张实际尺寸见图注。</p><div class="recovery-grid">${local.map(item => { const [title, explanation] = recoveryTitles[item.path.split('/')[1].replace('.png', '')]; return figure(item, title, explanation) }).join('')}</div></section>
<section id="sources"><h2>来源、未验收项与收尾</h2><ul><li>五项原像素失败保留；它们在 toHaveScreenshot 退出，没有完成后续两次 PNG 字节一致断言。本次没有重跑完整 D0 或补写为通过。</li><li>桌面详情原 ERR_NO_BUFFER_SPACE 首败及 a2-40208d29 定向通过保留；旧 a2-46fe0e21 自检图保留历史用途，本页不把它们冒作当前恢复图。</li><li>局部采集的模块加载失败 visual-365de426、错误 Team 映射失败 visual-0780e159 均保留原日志和失败图；visual-82665dc9 断言通过但窄屏长图截断，原件保留，最终轮仅修正局部截图方式。</li><li>局部 preview / Next 服务在每轮前登记归属与端口，结束后 3200、3201 均无监听；没有创建 Docker 资源、没有删除共享资源或旧 workspace，当前 worktree 和本轮证据保留。</li><li>人工视觉、最新 PR CI、Chief 确认和实际 main 落地仍按原停点；本页不新增设计范围、不自动接受差异、不调用 gh 合入。</li></ul><p><a href="source.json">完整来源、原路径、逐图 SHA-256 与参数</a> · <a href="runs/visual-f321025a/receipts.json">局部采集与服务收尾回执</a> · <a href="runs/visual-f321025a/source-before.json">本轮采集前源码字节绑定</a> · <a href="runs/visual-f321025a/source-after.json">采集后绑定</a></p><p>全部图像是本分支普通 PNG，点击即可查看，无需解压。材料以测试夹具数据采集，未填真实凭证；历史和当前图均按原字节复制。旧文件、批准正文与 D0 原基线保持。</p></section></main></body></html>
`)
console.log(JSON.stringify({ images: images.length, historicalComparisons: surfaces.length, currentImages: current.length, localImages: local.length, preparedFromHead: head }))
