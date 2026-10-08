# D1a 并存主题 token 实施计划

CurrentPlatformPlan: doc:KOcjFQKKKda7YZQrix1C0
HistoryPlatformPlans: doc:dcX1w5SQEK9Gf44BfBy41, doc:C0sgpVa1S0PPoKM5VDLqR, doc:gk5iDSxHGPN1T9eA-lGG1
TaskTodo: IJQA_DfxU0hF5e8L5Xb3v
BaseCommit: 9ac1a2015da1ae20b9693ac8a62aac6f49dca8d7

## Context

D1a 只增加并存语义映射，不改变旧 token 的声明或消费，也不产生界面迁移。权威来源为 `docs/references/todos-analysis/design-tokens.md` 及其测量证据；旧值基线取本任务开工时核验的主线。D1a 的计划副本落在 `docs/plan/d1a-coexisting-theme-tokens.md`，注明平台任务引用 `IJQA_DfxU0hF5e8L5Xb3v`。

## Changes

- `packages/ui/src/tokens.css`：新增以下 `--wm-ref-*` 槽；在 `[data-wm-theme='dark']` 中仅以既有暗色语义槽作别名，不增加暗色字面值。映射表同步写入 ADR，列出原件章节及 `design-observations.json` / `css-evidence.json` 证据：
  - `--wm-canvas` → `--wm-ref-surface: #faf7f2`；`--wm-surface-raised` → `--wm-ref-surface-elevated: #fdfaf6`；`--wm-surface-hover` → `--wm-ref-surface-hover: #f2ede6`；`--wm-surface-subtle` → `--wm-ref-surface-secondary: #f2ede6`；`--wm-surface-inset` → `--wm-ref-surface-inset: #f2ede6`。深色别名一一对应为 `--wm-canvas`、`--wm-surface-raised`、`--wm-surface-hover`、`--wm-surface-subtle`、`--wm-surface-inset`；hover 与 secondary 保持独立槽，因为相同的参考亮色观测值不能抹平现有暗色 `#262A2F` 与 `#1F2226` 的差异，#21 迁移时沿各自槽迁移。
  - `--wm-border`、`--wm-border-strong` → `--wm-ref-border-default: #e2dbd1`、`--wm-ref-border-strong: #cec6bb`；深色别名分别指向 `--wm-border`、`--wm-border-strong`。
  - `--wm-text`、`--wm-text-muted`、`--wm-text-subtle` → `--wm-ref-text-primary: #1c1917`、`--wm-ref-text-secondary: #57534e`、`--wm-ref-text-tertiary: #78716c`；深色别名分别指向现有同义文本槽。另新增 `--wm-ref-text-dim: #a8a29e`，暗色别名指向 `--wm-text-muted`。
  - `--wm-neutral`、`--wm-info`、`--wm-warning`、`--wm-success` → `--wm-ref-status-pending: #9ca3af`、`--wm-ref-status-running: #3b82f6`、`--wm-ref-status-needs-human: #f59e0b`、`--wm-ref-status-done: #22c55e`；深色别名分别指向现有四个语义槽。`--wm-danger` 对应新增 `--wm-ref-danger-candidate: #ef4444`，明确标为 CSS 危险色候选，不称作错误态实测。所有状态继续由语义 token 表达。
  - `--wm-accent`、`--wm-focus` → `--wm-ref-accent: #4f46e5`、`--wm-ref-focus: #6366f1`；深色别名指向现有强调和焦点槽。
  - 新增主题无关槽：`--wm-radius-sm` → `--wm-ref-radius-control: 6px`（原件“主按钮”及“圆角”）；`--wm-radius-card` → `--wm-ref-radius-card: 8px`、`--wm-radius-panel` → `--wm-ref-radius-column: 12px`（原件“圆角”）。三者均有明确旧槽对应，暗色不覆写；不覆盖既有圆角 token。
- `apps/web/features/navigation/theme.test.tsx`：固定开工基点的旧 token 声明作用域和值快照及旧消费引用清单；逐项断言旧声明和值不变、每个原消费引用仍存在且引用 token 仍定义，并断言 D1a 没有迁移消费方。覆盖旧别名 `--wm-muted` 和由 token 派生的声明。为新增映射断言完整亮色槽、暗色别名、来源标记及状态语义槽。
- `apps/web/e2e/theme-unification.spec.ts`：每个亮色路由显式设置亮色偏好并断言 `data-wm-theme="light"`；另断言无偏好时默认暗色及明→暗→亮切换往返。浏览器中验证根节点、后代继承和既有暗色子树作用域的新槽 computed 值，并检查实际表面背景、边框颜色、文字颜色和圆角属性。旧 computed 值与颜色预期固定为开工基点常量，不从改后 CSS 推导。
- `docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md`：加入完整旧槽→新槽→亮色值→原件章节/证据→暗色别名映射表，并记录危险色候选边界及圆角不参与主题切换。
- `docs/plan/d1a-coexisting-theme-tokens.md`：确认本计划后、任何产品编码前，先落盘当时已保存的本计划全文。元数据使用执行时绑定：`CurrentPlatformPlan` 为交接时本 todo 最新已保存 plan 的实际 docID；历史计划单列，`TaskTodo` 独立记录，`BaseCommit` 在实际开工时重新核验完整 SHA。落盘时填写并实际核对这些绑定；计划确认后由独立审查复核动态绑定门禁，未确认闭合前不得实施。保留实施步骤与验收门禁。
- `docs/reviews/d1a/verification.md`：归档实际命令、结果、D0 对比结论、映射及基线证据引用、独立复核结果和 Chief 确认状态。

## Verification

- `theme.test.tsx` 将 #11 原验收 1–3、5 对应到旧值/消费清单保护、完整来源映射和“无迁移”断言；`theme-unification.spec.ts` 对应原验收 4 及明暗行为回归；D0 重放对应视觉基线无变化。#11 九类适用性中仅 happy path 适用，另外八类（未授权、非法状态、幂等重复、旧 revision、事务失败、webhook/job 重放、并发、重启/outbox）记录为样式变更不适用。
- 完整集成环境按 `.github/workflows/ci.yml` 的 `db-integration`、`api-integration`、`worker-integration`、`recovery-integration`、`e2e` job 配置准备隔离服务：启动健康的 PostgreSQL 与 RustFS，因 `docker-compose.yml` 的 Redis 未发布宿主端口，按 CI 用例启动绑定 loopback 端口的专用 Redis；创建名称含 `test` 的独立数据库并设置 `REDIS_URL` 与 API 所需 `S3_*`。设置 `RUN_INTEGRATION=1`，用 `pnpm bootstrap:token` 生成随机测试 token 并直接注入 `WORKMESH_BOOTSTRAP_TOKEN`，不写入日志或证据。完整运行 recovery 时另设 `RUN_RECOVERY_INTEGRATION=1`、独立 `RECOVERY_SOURCE_DATABASE_URL` / `RECOVERY_TARGET_DATABASE_URL`、`RECOVERY_TEST_S3_ENDPOINT` / `RECOVERY_TEST_S3_ACCESS_KEY_ID` / `RECOVERY_TEST_S3_SECRET_ACCESS_KEY`、`WORKMESH_POSTGRES_TOOL_CONTAINER`（含 `pg_dump` / `pg_restore` 的测试 PostgreSQL 容器）及其 host/port；`packages/recovery/integration/recovery.integration.test.ts` 会创建 source bucket 并启用版本控制，测试准备流程须预先创建 target bucket 并启用版本控制。`scripts/require-integration-env.mjs`、该 recovery 集成测试和 `playwright.config.ts` 分别校验这些前置条件。记录并在结束时恢复原 shell 环境，清理由本轮创建的容器、测试数据库和 S3 buckets；不得触碰非测试数据。随后执行：
  - `pnpm --filter @workmesh/web exec vitest run features/navigation/theme.test.tsx`
  - `pnpm --filter @workmesh/web test:e2e e2e/theme-unification.spec.ts`（经现有 package script 启动，保留 `npm_execpath` 供 `apps/web/e2e/global-setup.ts` 重置隔离验收库）。
  - `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`
  - 按 `apps/web/e2e/baselines/d0/README.md` 的既有环境，以 `--update-snapshots=none` 重放 D0 基线。
- 将本次结果写入 `docs/reviews/d1a/verification.md`；九类适用性与五项原验收逐项留证。D1a 仅在必需检查成功、独立 R1 复核完成并合入、Chief 确认后验收；#21 的逐面迁移与旧值清理仍由 #21 验收。

## Assumptions

- 例行语义对应按以上映射固定；只有实际出现视觉位移或映射争议时才暂停并提交 Chief／用户裁决。本阶段不改根 token、不改消费方，因此 D0 应保持原样。
