# D1a 并存语义 token 验证记录

## 追踪身份与范围

- 当前平台计划：`doc:KOcjFQKKKda7YZQrix1C0`；本地全文：[`docs/plan/d1a-coexisting-theme-tokens.md`](../../plan/d1a-coexisting-theme-tokens.md)
- 历史计划修订：`doc:dcX1w5SQEK9Gf44BfBy41`、`doc:C0sgpVa1S0PPoKM5VDLqR`、`doc:gk5iDSxHGPN1T9eA-lGG1`
- 任务：`IJQA_DfxU0hF5e8L5Xb3v`
- 开工基点：`9ac1a2015da1ae20b9693ac8a62aac6f49dca8d7`；主题静态基线记录于 `apps/web/features/navigation/theme-token-baseline.json`
- 实现边界：仅新增并存语义槽与映射。根值、旧声明和消费方未改；没有界面迁移、旧 token 清理或 Tailwind 引入。`--wm-info`、`--wm-success`、`--wm-warning`、`--wm-danger` 等既有状态语义保留。

## 验收映射

| #11 原验收 | 本次具体用例 / 证据 | 本次结果 |
| --- | --- | --- |
| 1. 旧 token 与消费方仍可用，存在消费方时不可删除 | `theme.test.tsx` 的 `preserves every base token declaration, scope, value, and existing CSS consumer`；基线固定 175 条声明、132 个消费文件/token 对、1,422 条消费引用 | 通过；逐项核对开工声明与消费引用 |
| 2. 新槽映射有来源，状态色保留语义 token | `theme.test.tsx` 的 `declares measured light slots and resolves dark slots through existing semantics`；ADR 0077 的 D1a 映射表，引用 `design-tokens.md`、`design-observations.json`、`css-evidence.json` | 通过；危险色标记为 CSS 候选，没有称作实测错误态 |
| 3. 无根值替换或消费迁移，视觉基线无意外变化 | 基线保护用例；`git diff` 的改动范围；D0 无快照更新重放 | 通过；D0 14/14 通过 |
| 4. 主题解析和必需检查 | `theme-unification.spec.ts` 10/10；`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e` | 通过，集成条件跳过见下方 |
| 5. 色彩映射依据及位移取舍有记录 | ADR 0077 的完整映射、明暗别名、来源证据与映射边界 | 通过；本批没有可见位移，不涉及用户视觉裁决 |

## 九类适用性

本任务只新增 CSS 自定义属性，不新增领域操作或状态机。happy path 适用，由 `theme.test.tsx` 的完整 token 契约测试及 `theme-unification.spec.ts` 的根、继承和嵌套暗色作用域测试覆盖。以下八类均不适用：未授权 actor、非法状态转换、重复幂等键、旧 revision、事务失败、webhook/job 重放、并发请求、重启/outbox recovery；本次没有新增 actor/API 写操作、事务、job 或持久化状态。

## 本次检查结果

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @workmesh/web exec vitest run features/navigation/theme.test.tsx` | 通过：10 项 |
| `pnpm --filter @workmesh/web test:e2e e2e/theme-unification.spec.ts` | 通过：10 项；从 package script 启动，`global-setup.ts` 获得 `npm_execpath` 并重置隔离验收库 |
| `pnpm lint` | 通过：18/18 任务 |
| `pnpm typecheck` | 通过：18/18 任务 |
| `pnpm test` | 通过：29/29 任务；Web 113 个测试文件、778 项通过 |
| `pnpm test:integration` | 通过：DB 77 项、API 154 项（1 项条件跳过）、worker 78 项（1 项条件跳过）、recovery 1 项 |
| `pnpm test:e2e` | 通过；`apps/web/test-results/.last-run.json` 状态为 `passed`，失败数为 0 |
| `pnpm --dir apps/web exec playwright test --config playwright.d0.config.ts --update-snapshots=none` | 通过：D0 桌面与移动两个项目共 14 项；没有更新快照 |
| `git diff --check` | 通过；仅 Git 的 LF/CRLF 转换提示，无空白错误 |

集成与浏览器检查使用本轮独立 PostgreSQL、Redis、RustFS 测试容器，以及专用 test 数据库和 bucket。随机 `WORKMESH_BOOTSTRAP_TOKEN` 仅注入进程环境，没有写入本记录；结束时已恢复 shell 变量并移除本轮容器与其中测试数据。Recovery 测试代码会创建 source bucket；本次准备流程预先创建带版本控制的 target bucket 和 API artifact bucket。此实现细节与计划中的概述不同，两个 bucket 均只属于临时测试服务。

D0 报告由既有 Playwright 配置写入 `.tmp/d1a-d0-replay/mocked-dev/html-report/`；该目录为忽略的临时产物。稳定复验证据为上表命令结果及仓库内 D0 基线和 manifest。

## 门禁状态

实现及本次必需检查已完成；尚未将独立 R1 复核/合入或 Chief 最终确认记为完成。只有独立复核通过并合入、Chief 确认后本卡方可验收。#21 继续负责逐面迁移、人工视觉评审及无旧消费后清理旧值。
