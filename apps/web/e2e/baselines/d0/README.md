# D0 改动前视觉基线

来源：[本地源计划 D0](../../../../../docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md)、ADR 0077。平台任务为 [D0](todo:MPhtZiff23B33m9i2equq)，阻塞 [D1](todo:IJQA_DfxU0hF5e8L5Xb3v)。本目录保存 e2e 资产与验证证据，不改变产品实现或 token 值。

## 开工前测试清单映射

测试文件：`apps/web/e2e/mocked/d0-visual-baseline.mocked.spec.ts`；测试组：`D0 亮色视觉基线`。以下三个清单项共用每个页面的实际用例，每个用例分别在两个视口项目执行：

- [x] 覆盖全部受影响界面：`工作台：覆盖、两次采集一致、D1 可直接比对`、`看板：覆盖、两次采集一致、D1 可直接比对`、`项目总览：覆盖、两次采集一致、D1 可直接比对`、`Agent 详情：覆盖、两次采集一致、D1 可直接比对`、`工作项列表：覆盖、两次采集一致、D1 可直接比对`、`工作项详情：覆盖、两次采集一致、D1 可直接比对`、`设置：覆盖、两次采集一致、D1 可直接比对`。
- [x] 同一视口两次采集可重复：上述用例分别在两个新建浏览器上下文采集，比较 PNG 的 SHA-256，要求逐字节一致；再重启服务运行整套用例。最终两轮 14 + 14 个用例通过，56 次采集均与对应基线哈希相同。
- [x] 基线可被 D1 的视觉 diff 直接消费：上述用例的 `toHaveScreenshot` 直接读取本目录 PNG；禁止更新基线重放，`maxDiffPixels=0`、`threshold=0.005`。阈值只过滤经观测的圆角边缘取整噪声，原始 PNG 不做处理。

## DoD 与门禁

基线产出并可重放；D1 开工前以此为门禁。未满足测试清单、仓库必需检查及 WorkMesh 控制面记录同步前，不宣称 D0 完成，不开放 D1，不允许修改 token 值。视觉测试与五项必需检查已通过，条件跳过项如实记录；控制面归属等待用户裁决，真实 WorkMesh 记录尚未同步，因此 D1 仍关闭。验证结论记录于本目录的 [verification.md](verification.md)。

## 采集条件与重放

固定桌面 `1440 × 1000`、移动 `390 × 844`；`zh-CN`、亮色、DPR 1、UTC、日期 `2026-08-22T09:30:00.000Z`，Chromium 版本以验证记录为准。截图为完整页面，禁用动画并隐藏输入光标。仅通过 `d0-screenshot.css` 一次性隐藏 Next 开发工具浮层；自动比对与单独采集共用相同页面样式，不遮罩产品内容，不修正当前视觉缺陷。平台目录隔离操作系统字体差异；当前基线为 Windows，换平台不得自动生成替代基线后声称通过。

复用既有 `project-work-preview-server.mjs` 的 `final-tour` 固定数据。工作台缺少的只读对话、消息、轮次和模型列表由测试补充固定夹具，不调用真实模型。Agent 详情的 Session context 与预算利用率按当前只读 DTO 补齐，仅影响测试夹具。截图须包含页面标志记录，不得出现加载骨架、页面错误或失败的 API 响应；既有实时连接状态照实保留。两个上下文之间重置夹具，并重建 cookie 和浏览器存储。浏览器启用软件渲染、固定 sRGB，并关闭 Skia 运行时优化；参数保存在 `playwright.d0.config.ts`。

亮色通过现有 `workmesh.theme=light` 偏好在页面启动前固定，并断言 `data-wm-theme=light`。当前实现已支持暗色且默认暗色，规格中“当前仅亮色”前提已过时；本任务仍严格只采亮色，不改变主题功能。

不同服务启动之间观测到移动端详情的 13 个圆角边缘像素每通道最多相差 1；零颜色阈值会误报。视觉比较使用 Playwright 的 `threshold=0.005`，超出该微小颜色阈值的差异像素数量仍必须为零。单次运行内两个新建上下文的 PNG 仍要求 SHA-256 完全相同。重启重放保留各自原始哈希，并按上述视觉阈值验收，不宣称四次 PNG 必然逐字节一致。

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
$env:WORKMESH_PLAYWRIGHT_RUN_DIR = Join-Path (Get-Location) '.tmp/d0-replay'
pnpm --dir apps/web exec playwright test --config playwright.d0.config.ts --update-snapshots=none
```

采集时首次使用 `--update-snapshots=all`；此命令只用于 D0 建立改动前资产。D1 一律使用 `--update-snapshots=none`，从报告读取 expected / actual / diff 并人工评审；不得用更新基线掩盖 token 迁移的视觉差异。配置、测试、锁文件和字体环境必须一致。每个用例报告附有两次 PNG 和 SHA-256、视口、路由、浏览器版本、token 文件 SHA-256。

查看时打开本文件在变更评审中的预览按钮；PNG 的页面对应关系及实际检查结果见 `verification.md`。
