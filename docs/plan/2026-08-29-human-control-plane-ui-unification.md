# WorkMesh Human Control Plane 全站统一重构

日期：2026-08-29
状态：执行中
规范：`docs/adr/0064-unified-human-control-plane-web-experience.md`
设计基线：当前 Human Control Plane；品牌方向为四节点字母 W

## 1. 品牌、标题与统一认证壳层

- 生成透明 WorkMesh 标记并派生 PNG、ICO 与 Apple 图标。
- 为根 Metadata、普通页面和实体详情建立统一 title contract。
- 建立 AuthenticatedWorkspaceShell，统一导航、Realtime、release、sign-out、Team 上下文和 app-sidebar-footer。
- 所有登录后生产路由迁入统一壳层；登录、安装、连接引导复用品牌资产。

测试：Metadata/title、favicon 帧与透明通道、桌面/移动 footer、登录后路由合同。
DoD：所有生产路由有稳定标题和图标；登录后页面不再自行拼装缺字段的 AppShell。

## 2. Agent 与 Recovery 故障修复

- Agent Definition 所有 REST 返回统一通过 transport projector/schema；enum array 变为 JSON 数组。
- Web 在边界校验 Agent DTO，畸形数据呈现局部可恢复错误。
- Recovery completion evidence SQL 同时支持旧数组与新对象，畸形 JSON 不得造成 500。

测试：生产形状 `{mcp}`、正常/畸形 DTO；Recovery 数组、对象、null、标量、no-artifact、权限与分页。
DoD：生产 Agent 详情可打开；Recovery active/resolved 可读取；API wire shape 符合合同。

## 3. 共享 Tabs 与控件收敛

- 扩展共享 Tabs 的 badge/count，并迁移 Project、协作队列、Recovery 和 Work 视图。
- 保持 link/tab/anchor 的正确语义，统一焦点、选中态、紧凑模式与响应式规则。
- 迁移重复按钮、选择器、Badge、Card、Async/Error 状态，删除零引用样式。

测试：键盘、ARIA、badge、紧凑模式和静态禁止旧类名合同。
DoD：不存在 wm-project-navigation、collaboration-queue-tabs、project-tabs、settings-tabs 的生产使用。

## 4. Project SPA 与长内容

- Next Router URL 成为 Project、surface 和 Work view 的唯一状态源。
- 请求支持取消/代次检查；显式缺失项目不回退首项。
- 保留 Overview、Work、Attention、Runs；Work 内含 List、Board、Backlog。
- Project rail/detail 独立滚动，移动端自然滚动；长 Markdown 不截断。

测试：首次选择、显式缺失、快速 A/B 切换、Back/Forward、无刷新、长 Markdown、窄屏溢出。
DoD：快速导航稳定停留在最后选择；工作区视觉不回落；所有 Project 内容可访问。

## 5. 遗留删除与视觉验收

- 删除 preview-issues、preview-round2、human-control-plane-preview、evidence/collaboration-faults。
- 删除 Settings 内嵌 Operations、未实现 Project surfaces 与专属 CSS/测试。
- 在生产形状 mock 数据上做 1440px 与 390px 同视口视觉 QA。

测试：旧 URL 404；Project、Attention、Recovery、Agents、Agent Detail、Operations、Settings、Session 视觉与主交互。
DoD：`design-qa.md` 为 passed，无 P0/P1/P2 视觉问题。

## 6. 集成验证与交付

- 运行 focused Web/API/contracts 测试后执行 lint、typecheck、test、integration、E2E、生产构建和 diff-check。
- 将实际结果与偏差同步到 WorkMesh WorkItems 活动流。
- 以一个完整、已验证的功能提交保存状态；不 push、不部署。

DoD：相关检查通过，无已知 blocker；API + Web 为唯一潜在发布范围。

## 固定边界

- 无数据库迁移、无新事件、无 Worker/MCP 协议变化。
- Human 责任与 Agent 执行、Workflow 状态与 Agent Session 状态继续分离。
- 不保留旧视图、兼容路由或隐藏双路径。
- 不修改当前主工作区及其他 worktree 的未提交内容。
