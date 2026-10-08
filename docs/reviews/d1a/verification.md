# D1a 并存语义 token 验证记录

## 追踪身份与范围

- 当前平台计划：`doc:KOcjFQKKKda7YZQrix1C0`；本地全文：[`docs/plan/d1a-coexisting-theme-tokens.md`](../../plan/d1a-coexisting-theme-tokens.md)
- 历史计划修订：`doc:dcX1w5SQEK9Gf44BfBy41`、`doc:C0sgpVa1S0PPoKM5VDLqR`、`doc:gk5iDSxHGPN1T9eA-lGG1`、`doc:MRt5l7TjMqrC4jJiu6P5F`
- 任务：`IJQA_DfxU0hF5e8L5Xb3v`
- 开工基点：`9ac1a2015da1ae20b9693ac8a62aac6f49dca8d7`；受测代码 HEAD：`40a51cc476aa1de1d9e313dfd9bdfbbb64ef5aeb`，tree：`5126885a0a17b5871208ee34496639bd2dc99590`
- 根范围只增加并存语义槽与来源映射。根值、旧声明、消费方均未改；无界面迁移、旧 token 清理或 Tailwind。
- 旧 CSS 基线：[`theme-token-baseline.json`](../../../apps/web/features/navigation/theme-token-baseline.json)，由开工 base 独立重建，覆盖 175 条旧声明、132 组消费、1,476 个实际 `var()` 引用；测试将完整旧声明和值与基线比较，并逐项比较消费引用文件/位置/原始内容。

## 验收映射与测试结果

| #11 原验收 | 用例及证据 | 结果 |
| --- | --- | --- |
| 1. 旧 token 与消费方可用，有消费方时禁止删除 | `theme.test.tsx` 的旧声明/消费基线契约；D0 diff | 通过，无旧值或消费迁移 |
| 2. 新槽来源与状态语义 | `theme.test.tsx` 新槽/来源断言；ADR 0077 映射和测量证据 | 通过；危险色保留 CSS 候选限定 |
| 3. 无根值替换/界面迁移及基线无意外变化 | 源码指纹、`git diff --check`、D0 回放 | 通过；D0 14/14、未更新快照 |
| 4. 主题解析与必需检查 | 定向/全量 E2E、lint/typecheck/unit/integration | 通过，条件跳过如实列明 |
| 5. ADR 记录映射依据与视觉取舍 | ADR 0077 D1a 映射表、原件章节和证据引用 | 通过；没有界面位移或新增视觉裁决 |

九类适用性：仅 happy path 适用，由 token 契约单测和主题 E2E 覆盖。未授权 actor、非法状态转换、重复幂等键、旧 revision、事务失败、webhook/job 重放、并发请求、重启/outbox recovery 均为纯 CSS token 变更不适用；本批没有 actor/API 写操作、事务、job 或持久化状态。

| 检查 | 本轮实际结果 | source-bound 日志 |
| --- | --- | --- |
| 定向 theme unit | 10/10 通过 | [`reverification-final/run-binding.json`](evidence/reverification-final/run-binding.json)，`theme-unit` |
| `pnpm lint` / `pnpm typecheck` | 各 18/18 Turbo 任务通过 | 同上，`lint` / `typecheck` |
| `pnpm test` | 29/29 Turbo 任务通过；Web 778 项、API 174 项通过；worker 163 项中 2 项平台条件跳过 | [`reverification-bound-02/run-binding.json`](evidence/reverification-bound-02/run-binding.json)，`unit-suite` |
| 定向主题 E2E | 10/10 通过 | 同上，`theme-e2e-focused` |
| `pnpm test:integration` | DB 77、API 154（1 项跳过）、worker 79、recovery 1，共 311 通过、1 项跳过 | [`reverification-integration-03/run-binding.json`](evidence/reverification-integration-03/run-binding.json)，`integration-suite` |
| `pnpm test:e2e` | 67/67 通过，无跳过 | [`reverification-bound-02/run-binding.json`](evidence/reverification-bound-02/run-binding.json)，`e2e-suite` |
| D0 亮色基线 replay | 14/14 通过，无快照更新；报告和截图已归档 | 同上，`d0-baseline`；[`D0 HTML 报告`](evidence/reverification-bound-02/d0-html-report/index.html) 和 `d0-output/` |
| `git diff --check` | 退出码 0 | [`reverification-integration-03/run-binding.json`](evidence/reverification-integration-03/run-binding.json)，`diff-check` |

跳过项仅为：unit 中两个 `process.platform === "linux"` 的 `flock`/FD 测试在 Windows 不运行；API integration 中 exact-session MiniMax provider 用例要求 `RUN_WORKBENCH_LIVE=1` 和 `MINIMAX_CN_API_KEY`，本轮未启用真实外部服务。定向/全量 E2E 与 D0 无跳过。九类及五项原验收逐项明细见 [`reverification-index.json`](evidence/reverification-index.json)。

## 执行绑定、环境与失败记录

每条纳入结果的命令均在执行前后记录 HEAD、tree、源文件 Git blob ID、工作区 SHA-256、干净状态和源码指纹；各 `run-binding.json` 可把命令、退出码、原始日志哈希及前后指纹串起来。本次成功源码指纹为 `116293733d57055901c2daf1397090e55e7d440c2574c113c6d32af0539b2ca4`，每条成功命令的前后指纹相同。受测源固定在上列 HEAD/tree；Git 对象与检出字节的逐项关系见 [`git-blob-hashes.json`](evidence/git-blob-hashes.json)。

隔离服务的版本、容器 image digest、健康状态、loopback 端口、独立测试数据库/bucket、脱敏配置与随机 bootstrap token 未打印/落盘的事实，见 [`reverification-bound-02/service-setup.json`](evidence/reverification-bound-02/service-setup.json) 和 [`reverification-integration-03/service-setup.json`](evidence/reverification-integration-03/service-setup.json)。逐变量恢复布尔值、容器清理和测试数据随容器销毁的实际记录见对应 `cleanup.json`；两次重跑的 `environmentRestored`、`containerCleanupVerified`、`testDatabaseAndBucketsDestroyedWithContainers` 均为 `true`。D0 既有 replay/capture 报告另外完整归档于 [`d0-previous-run/`](evidence/d0-previous-run/)；本轮 D0 报告及截图见上表链接。

先前记录的通过摘要没有源码运行绑定，现已标为历史材料且不作为本轮验收依据。补验中保留的初败原始日志不覆盖：第一次隔离重跑因一次 Web 单测偶发断言、Playwright run dir 非绝对路径及 API rate-limit 配置失败；修正绝对目录后，完整单测、定向/全量 E2E、D0 通过，集成只因遗漏 CI `WORKMESH_RUNNER_SERVICE_TOKEN` 而失败；补齐该测试 token 后，integration 与 diff-check 在新绑定运行中通过。另一轮 `git diff --check` 暴露的两处空行已修复并由最终退出码 0 的绑定检查复核。历史原始终端日志此前未留存，详见 [`attempt-history.md`](evidence/attempt-history.md)；不声称恢复了缺失的旧 raw。

Git 哈希分开登记：`gitBytesAtHead`/`gitSha256AtHead` 从 `git cat-file blob` 的真实对象字节计算；`worktreeBytes`/`worktreeSha256` 对 Windows 检出文件计算。`normalizedEqualsGitBlob=true` 表示字节相同或仅有 UTF-8 BOM/CRLF 检出转换；false 且 `checkoutTransform=different content` 则表示对应追踪文档/证据在记录的 HEAD 后由本轮修改，Git 字段仍是旧对象字节，worktree 字段是待提交内容。未修改源码与 ADR 的行均经归一化核对一致；不再用工作区哈希冒充 Git blob 哈希。清单见 [`artifact-manifest.json`](artifact-manifest.json) 与 [`check-index.json`](evidence/check-index.json)。R1 历史清单及证据保持原样。

## 门禁状态

本地绑定验证全部通过。最新提交 CI、独立 R1 复核/合入及 Chief 最终确认仍是验收门槛，本记录不将其写成已完成；本机结果不替代最新 head CI。#21 继续负责逐面迁移、人工视觉评审及无旧消费后清理旧值。
