# D0 改动前视觉基线

来源：[本地源计划 D0](../../../../../docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md)、ADR 0077。平台任务为 [D0](todo:MPhtZiff23B33m9i2equq)，阻塞 [D1a](todo:IJQA_DfxU0hF5e8L5Xb3v)，并为后续 [D1b](todo:2j2sxT5wJ-l001efH_meJ) 提供同一基线。本目录保存 e2e 资产与验证证据，不改变产品实现或 token 值。

2026-10-07 18:38（Asia/Shanghai），用户批准仅本批使用 Todos 编排与记录、仓库存放规格及证据，替代 AGENTS.md 的真实 WorkMesh 双轨记录要求。批准已写入源计划；不等待真实 WorkMesh MCP，不声称已创建或同步真实 WorkMesh 记录。其余领域、安全、测试约束保持。

## 开工前测试清单映射

测试文件：`apps/web/e2e/mocked/d0-visual-baseline.mocked.spec.ts`；测试组：`D0 亮色视觉基线`。以下三个清单项共用每个页面的实际用例，每个用例分别在两个视口项目执行：

- [x] 覆盖全部受影响界面：`工作台：覆盖、两次采集一致、D1 可直接比对`、`看板：覆盖、两次采集一致、D1 可直接比对`、`项目总览：覆盖、两次采集一致、D1 可直接比对`、`Agent 详情：覆盖、两次采集一致、D1 可直接比对`、`工作项列表：覆盖、两次采集一致、D1 可直接比对`、`工作项详情：覆盖、两次采集一致、D1 可直接比对`、`设置：覆盖、两次采集一致、D1 可直接比对`。
- [x] 同一视口两次采集可重复：上述用例分别在两个新建浏览器上下文采集，原始 PNG SHA-256 必须相同，不使用视觉容差。固定部分栅格条件后两轮各 14 项通过；56 次原始附件与基线的额外哈希核验见当前 manifest。此前失败原样保留。
- [x] 基线可被 D1 的视觉 diff 直接消费：上述用例的 `toHaveScreenshot` 直接读取本目录 PNG；禁止更新基线重放，`maxDiffPixels=0`、`threshold=0.005`。阈值依据观测到的圆角边缘取整差异设置，也可能容许其他微小颜色差异；原始 PNG 不做处理。

## DoD 与门禁

基线产出并可重放；D1 开工前以此为门禁。当前视觉清单通过，五项必需检查成功退出，条件跳过如实记录；通用 mocked-dev 实际失败尚待逐项处置或总管裁决，**D0 与 D1 门禁继续关闭，不宣称 D0 完成**。缺少真实 WorkMesh 连接不再阻塞 D0。G1/P1/R1 独立验收；本条不实施 token 变更。结论及剩余原因见 [verification.md](verification.md)。

本次资料地址已同步为 `docs/references/todos-analysis/`；输入包仍在 G1 审查分支，未进入本次验证基点，不导入或提前放行该输入门禁。

## 采集条件与重放

固定桌面 `1440 × 1000`、移动 `390 × 844`；`zh-CN`、亮色、DPR 1、UTC、日期 `2026-08-22T09:30:00.000Z`，Chromium 版本以验证记录为准。截图为完整页面，禁用动画并隐藏输入光标。仅通过 `d0-screenshot.css` 一次性隐藏 Next 开发工具浮层；自动比对与单独采集共用相同页面样式，不遮罩产品内容，不修正当前视觉缺陷。平台目录隔离操作系统字体差异；当前基线为 Windows，换平台不得自动生成替代基线后声称通过。

复用既有 `project-work-preview-server.mjs` 的 `final-tour` 固定数据。工作台与 Agent 详情缺少的只读 DTO 由测试补齐，不调用模型或写领域。页面标志记录须就绪，无加载骨架、页面异常或 API 错误；当前实时状态照实保留。看板固定滚动到目标列，卡片、列头须完整进入视口，两次滚动位置须相同。两个上下文间重置夹具、cookie、存储。浏览器启用软件渲染、sRGB、关闭 Skia 运行时优化，并以 `--disable-partial-raster` 固定部分栅格条件；参数及 A/B 依据见 [诊断记录](evidence/raster-diagnosis.md)。

亮色通过现有 `workmesh.theme=light` 偏好在页面启动前固定，并断言 `data-wm-theme=light`。当前实现已支持暗色且默认暗色，规格中“当前仅亮色”前提已过时；本任务仍严格只采亮色，不改变主题功能。

旧零阈值详情失败证据保留。比较器继续使用 `threshold=0.005,maxDiffPixels=0`，本轮未放宽；该颜色感知阈值不是 RGB 差值上限，抗锯齿处理影响计数，也可能容许其他微小颜色变化。新发现的详情原始帧不一致通过栅格条件 A/B 修订，不用容差豁免哈希失败。两次原始哈希相同、重启视觉比较通过、四次原始采集与基线相同分别验证；容差通过和采集环境修订均不表示用户产品视觉批准。

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
$env:WORKMESH_PLAYWRIGHT_RUN_DIR = Join-Path (Get-Location) '.tmp/d0-replay'
pnpm --dir apps/web exec playwright test --config playwright.d0.config.ts --update-snapshots=none
```

采集时首次使用 `--update-snapshots=all`；此命令只用于 D0 建立改动前资产。D1 一律使用 `--update-snapshots=none`，从报告读取 expected / actual / diff 并人工评审；不得用更新基线掩盖 token 迁移的视觉差异。配置、测试、锁文件和字体环境必须一致。每个用例报告附有两次 PNG 和 SHA-256、视口、路由、浏览器版本、token 文件 SHA-256。

查看时打开本文件在变更评审中的预览按钮；PNG 的页面对应关系及实际检查结果见 `verification.md`。
