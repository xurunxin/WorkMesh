# D1a 并存语义 token 验证记录

## 追踪身份与范围

- 当前平台计划：`doc:KOcjFQKKKda7YZQrix1C0`；本地全文：[`docs/plan/d1a-coexisting-theme-tokens.md`](../../plan/d1a-coexisting-theme-tokens.md)
- 历史计划修订：`doc:dcX1w5SQEK9Gf44BfBy41`、`doc:C0sgpVa1S0PPoKM5VDLqR`、`doc:gk5iDSxHGPN1T9eA-lGG1`、`doc:MRt5l7TjMqrC4jJiu6P5F`
- 任务：`IJQA_DfxU0hF5e8L5Xb3v`
- 开工基点：`9ac1a2015da1ae20b9693ac8a62aac6f49dca8d7`；实现前 HEAD：`ff61a697e59174c041d19c437e1ee7ce07e65265`
- 本轮实际验证的源状态：上述实现前 HEAD 加上工作区修复；逐文件 SHA-256 和补丁摘要见 [`artifact-manifest.json`](artifact-manifest.json)。
- 主题静态基线：[`theme-token-baseline.json`](../../../apps/web/features/navigation/theme-token-baseline.json)，取自开工 base。固定 175 条旧声明、132 组文件/token 消费对及 1,476 个实际 `var()` 引用；消费者快照逐个记录文件、token、行号、同一行出现次序及原始行内容。
- 范围：只新增并存语义槽与映射。根值、旧声明和消费方未改；没有界面迁移、旧 token 清理或 Tailwind 引入。既有状态语义 token 保留。

## 验收映射

| #11 原验收 | 本次用例 / 证据 | 结果 |
| --- | --- | --- |
| 1. 旧 token 与消费方可用，有消费方时禁止删除 | `theme.test.tsx` 的 `preserves every base token declaration, scope, value, and existing CSS consumer`；基线 JSON 的 175 条声明与 1,476 个引用 | 通过：完整比较所有非 `--wm-ref-*` 声明，并逐项精确比较消费引用内容与位置 |
| 2. 新槽映射有来源，状态色保留语义 token | `theme.test.tsx` 的 `declares measured light slots and resolves dark slots through existing semantics`；ADR 0077 映射表及所引测量证据 | 通过；危险色保留 CSS 候选限定 |
| 3. 不替换根值、不迁移消费方，视觉基线无意外变化 | 基线契约用例、代码 diff、D0 回放日志 | 通过；D0 桌面/移动 14/14，无快照更新 |
| 4. 主题解析与必需检查 | 定向主题 E2E、根级 E2E、lint/typecheck/unit/integration | 通过；条件跳过列于下表 |
| 5. ADR 记录映射依据与视觉取舍 | ADR 0077 D1a 映射及来源表 | 通过；本批未产生界面色彩位移，不涉及新的视觉裁决 |

九类适用性：仅 happy path 适用，由 token 契约单测及主题 E2E 覆盖。未授权 actor、非法状态转换、重复幂等键、旧 revision、事务失败、webhook/job 重放、并发请求、重启/outbox recovery 均为 CSS token 变更不适用；本批不新增 actor/API 写操作、事务、job 或持久化状态。

## 本次验证结果

| 检查 | 结果与原始日志 |
| --- | --- |
| `pnpm --filter @workmesh/web exec vitest run features/navigation/theme.test.tsx` | 10/10 通过；`evidence/logs/theme-unit.log` |
| `pnpm --filter @workmesh/web test:e2e e2e/theme-unification.spec.ts` | 10/10 通过；`evidence/logs/theme-e2e-focused.log` |
| `pnpm lint` / `pnpm typecheck` | 各 18/18 Turbo 任务通过；`evidence/logs/lint.log`、`typecheck.log` |
| `pnpm test` | 29/29 Turbo 任务通过；Web 113 文件/778 项通过，API 33 文件/174 项通过；worker 23 文件/163 项通过并有 2 项平台条件跳过；`evidence/logs/unit-suite.log` |
| `pnpm test:integration` | DB 17 文件/77 项通过；API 22 文件/154 项通过、1 项跳过；worker 9 文件/79 项通过；recovery 1 文件/1 项通过；`evidence/logs/integration-suite.log` |
| `pnpm test:e2e` | 67/67 通过、无跳过；`evidence/logs/e2e-suite.log` |
| `pnpm --dir apps/web exec playwright test --config playwright.d0.config.ts --update-snapshots=none` | 14/14 通过，未更新快照；`evidence/logs/d0-baseline.log` |
| `git diff --check` | 退出码 0；仅有 Git 的 CRLF 提示，没有空白错误；`evidence/logs/diff-check.log` |

跳过项及条件：

- `retention-soak-lock.test.ts` 的 `passes a wrapper prelock across exec and rejects unlocked, unrelated, symlink, mode, and inode cases` 与 `retention-soak-formal-launch.test.ts` 的 `preserves the private prelocked FD through Node and the tsx registration loader` 均使用 `it.runIf(process.platform === "linux")`；本轮 Windows 10 主机不执行这两个 Linux 文件描述符/`flock` 测试。它们是 `pnpm test` 的 2 项 skip。
- `apps/api/integration/workbench-runner.integration.test.ts` 中 `runs an exact-session MiniMax-M3 Pi turn through the durable API` 仅在 `RUN_WORKBENCH_LIVE=1` 且设置 `MINIMAX_CN_API_KEY` 时执行；本轮未启用真实外部 provider 或配置密钥，因此 integration 的 1 项 skip。不会把此项报告为通过。
- 本轮设置 `RUN_RETENTION_UPGRADE_INTEGRATION=1`，worker integration 没有 retention upgrade skip。定向/全量 E2E 与 D0 回放没有 skip。

## 环境、历史失败与证据索引

测试运行版本和隔离环境记录于 `evidence/runtime.txt`；命令、实际退出码、日志字节数及 SHA-256 记录于 `evidence/check-index.json`。本轮使用专用健康检查 PostgreSQL、Redis、RustFS 容器和隔离测试数据库/buckets；生成的 bootstrap token 仅存在进程环境，未写入日志或证据。finally 已恢复本进程改动的环境变量，并移除 `wm-d1a-pg`、`wm-d1a-redis`、`wm-d1a-rustfs`；[`cleanup-check.log`](evidence/logs/cleanup-check.log) 复核容器均已不存在，容器内的测试数据库与 S3 数据随临时容器一并销毁。历史两次启动初败及纠正方式见 [`evidence/attempt-history.md`](evidence/attempt-history.md)，原始历史终端日志当时没有归档，故明确作为前序对话记录，不伪称有原始日志。版本与受控工件 SHA 清单见 [`artifact-manifest.json`](artifact-manifest.json)。

## 门禁状态

本轮实现检查成功，但独立 R1 复核/合入及 Chief 最终确认仍是验收门槛，本文不将其记作已完成。#21 继续负责逐面迁移、人工视觉评审及无旧消费后清理旧值。
