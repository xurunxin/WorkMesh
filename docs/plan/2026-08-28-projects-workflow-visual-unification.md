# WorkMesh 项目页与工作流视觉统一

日期：2026-08-28
状态：执行中
设计基线：已选定的第 3 个项目工作台方向

## 目标

将项目页改造成左侧项目导航、右侧项目详情的一屏工作台；全站页面与视口等高，把滚动收敛到页面组件内部；将全局搜索并入 `wm-shell-header`；允许团队管理员编辑工作流状态名称与颜色，并让变更实时同步到 Issues 列表、看板、卡片及已打开详情。

## 实施任务

### 1. 全站外壳与 Header 搜索

- 将根文档和应用外壳固定为 `100dvh`，禁止窗口级滚动。
- Header、Sidebar 保持固定，主内容区及各路由使用 `min-height: 0` 和显式内部滚动容器。
- 把全局命令中心拆分为单例弹窗控制器和 Header 触发器，通过 AppShell 搜索插槽挂入 `wm-shell-header`。
- 保留 `Ctrl/Cmd+K`、`/`、权限感知搜索和现有对话框行为。

测试：Shell 交互测试；搜索快捷键、触发器和对话框回归；所有用户可达及预览路由的视口溢出断言。
DoD：窗口无纵向或横向滚动，Header 搜索可用，键盘焦点在内部滚动区保持可见。

### 2. 项目主从工作台

- 项目页使用约 300px 固定左栏和弹性右栏，左右区域独立滚动。
- 左栏显示状态、名称、摘要和目标日期；右栏保留紧凑项目头、指标、Tabs、里程碑编辑表格和交付摘要。
- URL 未指定项目时自动选择首项并使用 `replaceState` 写入项目 URL；支持指定项目、前进后退和空项目。
- 保留现有 List、Board、Backlog WorkSurfaces，以及里程碑跳转到全局 Issues 的 URL 合约。

测试：首项自动选择、URL 指定项目、历史导航、空项目、长名称、多项目、独立滚动、Tabs 与里程碑链接。
DoD：项目页与设计基线在同视口下结构、密度和比例一致，现有项目功能无回归。

### 3. 工作流状态 PATCH API

- 新增 `PATCH /api/v1/teams/{id}/states/{stateId}`。
- `WorkflowStatePatch` 仅接受至少一个字段：`name`（1–80）或 `color`（`#RRGGBB`）。
- 要求 `Idempotency-Key`、CSRF、`If-Match`，沿用团队 manage 权限和结构化错误。
- 单事务更新 revision，并写入 `workflow_state.updated` domain event 与 outbox；不新增数据库迁移。
- 更新 OpenAPI、contracts、路由策略绑定与事件刷新策略。

测试：成功修改、空 patch、非法颜色、无权限、跨团队、幂等重放/冲突、陈旧 revision、名称唯一冲突、事务回滚、事件和 outbox。
DoD：API 合约、领域事务、事件和授权边界一致，重复请求安全收敛。

### 4. 设置编辑与颜色传播

- “团队工作流”每个状态增加编辑入口，单次只编辑一个状态；支持保存和取消。
- 冲突时刷新最新 revision、保留草稿并提示核对后重试；切换团队关闭编辑态。
- 将状态 `color` 传入共享看板列和 Issue 卡片；列头、计数、卡片状态条与状态标签使用 `--wm-status-color`。
- 浅色背景使用 `color-mix`，正文使用主题文字色；无有效颜色回退到 muted token。
- 状态更新事件刷新当前团队状态、Issues、选中 Issue 和设置页。

测试：编辑/取消/保存、冲突草稿、团队切换、只读权限、名称与颜色在列表、看板、卡片和详情同步。
DoD：状态编辑无需整页重载，所有消费面使用同一状态名称与颜色源。

### 5. 集成验证与视觉验收

- 运行 focused Web/API/contracts 测试后，执行本地 `pnpm lint`、`pnpm typecheck`、`pnpm test`、相关 integration 和完整 Web E2E。
- 在 1440×1024、1280×768、768px、375px、320px 视口验证文档无溢出、内部滚动和焦点可见性。
- 对选定设计与实现做同视口并排 QA，覆盖 Header 搜索、双栏比例、密度、截断、边距、颜色同步及浅/深主题。
- 将测试输出与截图证据同步到匹配 WorkMesh WorkItems 活动流。

DoD：所有相关本地检查通过，`design-qa.md` 记录视觉验收结果，无已知 blocker。

## API 与数据变更

- 新增 `WorkflowStatePatch` 和 `workflow_state.updated` 事件使用路径。
- Web/UI 的 `WorkSurfaceStatus`、`WorkItemStatusOption` 增加可选 `color`。
- 无数据库迁移；不开放 category、position 编辑。

## 固定边界

- 覆盖 `apps/web` 的全部用户可达及内部预览路由。
- Issues 自身筛选搜索仍保留在筛选组件内。
- 不新增项目列表聚合 API，不在项目概览重复嵌入 Issues 工作台。
- 只运行本地 CI，不新增 GitHub CI。
