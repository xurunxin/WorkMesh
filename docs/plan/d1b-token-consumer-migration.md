## 背景与目标

以已重新读取的 main `1078bbcd527550bfabee73093b7ffd0032d3fd24`、D1a 并存槽和 G1 原始测量为输入，补齐映射，逐面迁移全部消费者，最后删除旧声明与兼容分支。执行前再次读取最新 main，记录输入差异。

采用暖色表面、分层文字、独立 hover/secondary 槽、语义状态色和已批准圆角。允许替换旧样式与组件呈现；D0 保存历史前后差异，不要求重构后像素一致。危险色采用用户批准的 `#ef4444`，注明候选采纳；暗色仅同值重绑定。

本项不实现后续卡片结构与 Attention 策略、三栏分隔线、状态化菜单、拖拽与多选功能，不改变 API、事件或数据库。

## 文件修改

- `docs/plan/d1b-token-consumer-migration.md`、`docs/reviews/d1b/plan-binding.json`：产品编码前，先由 Chief 读回平台当前计划全文和实际元数据，逐字落盘完整中文计划；绑定实际 `currentPlanID`、版本、正文 UTF-8 SHA-256、任务 ID、输入提交及文件指纹。聊天中的计划链接不视为全文读取。独立审查针对这份精确快照进行，绑定无法核实或审查未闭合时停在文档门禁。

- `packages/ui/src/tokens.css`、`apps/web/features/navigation/theme-token-migration.json`：建立覆盖历史全部旧槽、声明作用域和派生依赖的显式退役映射。保留 D1a 已确认映射；普通 `--wm-surface` 新设 `--wm-ref-surface-card`，亮色取 `#fdfaf6`、暗色保留 `#141619`，不与 canvas 对应的 `--wm-ref-surface` 合并；`--wm-muted` 合并到 `--wm-ref-text-secondary`；危险候选转为正式 `--wm-ref-danger`。其余未映射槽采用不冲突的新名称、沿用现值并标注 WorkMesh 来源，字体、间距、动效和层叠参数只同值迁名。映射生成必须拒绝重名覆盖，并区分参考实测、用户采纳和产品沿用。

- 同一 token 文件中的暗色及派生声明：新槽直接绑定原暗色字面值，公式只引用新槽；分别保留 canvas/card/raised、hover/secondary、tertiary/dim 的暗色语义。主题与密度作用域重新声明受影响的 panel、border、gradient、focus-ring 公式，避免继承已在父级解析的结果。旧声明保留至最终清理门禁。

- `packages/ui/src/layout/app-shell.tsx` 与各路由 shell 调用点：增加临时界面作用域标记，沿用 `AuthenticatedWorkspaceShell` 的既有属性传递；共享样式只在当前迁移面生效。`apps/web/app/styles.css`、工作台和 Markdown 的 CSS Modules 按同一规则迁移，最终统一消费新槽并删除临时分支。加载、错误及详情打开状态使用相同作用域。

- `apps/web/app/agents/agent-workspace.module.css`：迁移实际使用的非 `--wm-*` 变量与硬编码 fallback，例如 `--text-muted`、`--surface-raised`、`--border-subtle`、`--danger-text`，对应到明确的新语义槽，纳入扫描与明暗验证。

- `packages/ui/src/domain/work-item.tsx`、`packages/ui/src/primitives/catalog.tsx`、`apps/web/app/ui-catalog/page.tsx`：迁移 inline style 和示例消费；更新 `workflowStatusStyle` 的旧 fallback。`--wm-status-color`、`--wm-dismissal-depth` 作为实例运行时变量保留，验证生产者、消费者和 fallback，不改服务端提供的自定义工作流颜色。

- `apps/web/features/navigation/theme.test.tsx` 及新增扫描辅助文件：保留 `theme-token-baseline.json` 的历史原件，把冻结全部消费的断言演进为阶段保护。按文件、选择器或表达式、属性和出现项追踪迁移，未迁项保持，已迁项必须对应映射；覆盖漏迁、提前删除、未知依赖、循环、嵌套 fallback 和运行时定义缺失。同步现有 UI token 契约测试中的名称，不删除行为断言。

- `apps/web/e2e/theme-unification.spec.ts`、新增 `apps/web/playwright.d1b.config.ts` 和对应 mocked 用例：保留原主题启动、偏好和切换覆盖，增加实际七面及全局组件的 computed style、继承、焦点和导航检查。复用 D0 的 `final-tour` 数据、`seedWorkbench`/`readyPage` 就绪逻辑、视口、字体、栅格和截图条件；受保护页面必须实际到达并显示目标内容，重定向不能冒充覆盖。

- `docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md`、`docs/plan/activation-task-specs/{12,13,14,21,22}.md`：同步已批准方向、危险色出处、暗色同值重绑定和 D0 历史对比语义；后续卡继续承担自己的功能与依赖。新增 `docs/reviews/d1b/test-coverage.json` 作为当前验收映射，逐项承接原测试、DoD 和九类适用性；历史 R1、D0、D1a 证据保持原样。

- `docs/reviews/d1b/verification.md` 与证据目录：保存映射、阶段扫描、前后 PNG、diff、实际视觉意见、检查结果和门禁状态。每次运行绑定执行前后源码指纹、命令、退出码、runtime、实际用例数及 skip；证据分别记录实际 Git blob 与工作区字节哈希。

## 执行顺序与停点

1. 完成计划全文绑定、规格同步、全量映射和阶段断言设计，另一 agent 独审后由 Chief 确认；此时才允许产品编码。
2. 严格按工作台 → 看板 → 项目 → Agent 详情 → 工作项列表 → 工作项详情 → 设置推进。每面保留迁移前后证据，运行实际明暗属性、键盘焦点、返回和导航检查，并检查未迁界面没有被共享样式提前切换。提交 D0 expected/actual/diff 与差异理由，经实际人工视觉评审后进入下一面。
3. 七面完成后，逐路由补齐 Agent 列表、Session 详情、运营、连接、登录、安装及 UI catalog；逐路由沿用相同评审停点。根布局中的 `ToastViewport` 和 CommandCenter 的 body portal 单独最后迁移，不能假定它们继承 AppShell 作用域；前面各阶段仍检查这些浮层的焦点和关闭返回行为。
4. 所有界面获准后，先统一共享、运行时 fallback 和派生消费，移除临时作用域分支；扫描运行源码、CSS Modules、inline style、字符串、fallback 与活动测试夹具。历史文档和冻结基线显式排除，实例变量单独核验。只有退役名称的全部消费与别名依赖为零，才删除旧 root、dark、density 声明。
5. 清理后重新验证明暗、子树、派生属性及完整回归。新增产品范围或实际方向分歧提交具体方案给 Chief／用户；常规视觉取舍形成可审结果，不因不同于旧设计重复询问。

## 验证与交付

- 定向执行 `pnpm --filter @workmesh/web exec vitest run features/navigation/theme.test.tsx`，以及受影响 UI 契约测试；静态保护必须证明有消费时不能删除，清理后无退役声明、消费、悬空或循环。
- 经 pnpm 执行 Playwright，并先用 `--list` 核实范围：`pnpm --filter @workmesh/web exec playwright test --config ../../playwright.config.ts e2e/theme-unification.spec.ts`。实际验证默认暗色、偏好与 URL 优先级、明→暗→明、刷新、根与暗色子树、compact 密度，以及背景、文字、边框、圆角、渐变和焦点环。
- 每面使用 D1b 专用配置验证桌面与移动。D0 对比执行 `pnpm --dir apps/web exec playwright test --config playwright.d0.config.ts --update-snapshots=none`；保留 `maxDiffPixels=0`、`threshold=0.005` 和全部采集参数。设计差异如实记为历史比较差异，不冒称 D0 零差异通过，也不放宽比较器。
- 按 `.github/workflows/ci.yml` 和 D1a 已验证的准备流程启动本轮独有 PostgreSQL、Redis、S3 及 recovery 夹具，使用名称含 test 的隔离数据库和绝对 Playwright run dir；正式与 mocked Next 服务顺序运行。执行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`，记录服务准备、恢复与清理。条件跳过单列，未运行不填通过。
- 原日志空白采用已审无损 ZIP 与自包含索引方式，复用 `scripts/verify-raw-evidence-archive.mjs` 验证；不 trim 原件或修改 CI 豁免。提交前运行 `git diff --check`。
- 实施成果须取得最新 HEAD 的 Required CI 成功、独立复核、实际合入及 Chief 确认才验收。交付报告列明范围、文件、实际测试与视觉评审、演示步骤和限制；不把规划审查或本机检查当作最终完成。
