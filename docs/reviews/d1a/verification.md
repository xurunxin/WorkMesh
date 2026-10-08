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
| `pnpm lint` / `pnpm typecheck` | 环境 08 重跑均为 18/18 Turbo 任务通过 | [`reverification-environment-08/run-binding.json`](evidence/reverification-environment-08/run-binding.json)，`lint` / `typecheck` |
| `pnpm test` | 29/29 Turbo 任务通过；Web 778 项、API 174 项通过；worker 163 项中 2 项平台条件跳过 | [`reverification-bound-02/run-binding.json`](evidence/reverification-bound-02/run-binding.json)，`unit-suite` |
| 定向主题 E2E | 10/10 通过 | 同上，`theme-e2e-focused` |
| `pnpm test:integration` | DB 77、API 154（1 项跳过）、worker 79、recovery 1，共 311 通过、1 项跳过 | [`reverification-integration-03/run-binding.json`](evidence/reverification-integration-03/run-binding.json)，`integration-suite` |
| `pnpm test:e2e` | 环境 07 的 Stage 0 超时作为失败轮次保留；环境 08 加入显式 URL 等待后，在同源码指纹下全量 67/67 通过 | [`reverification-environment-08/run-binding.json`](evidence/reverification-environment-08/run-binding.json)，`e2e-suite`；失败原件见环境 07 |
| 缺失环境证据后的独立主题 E2E 重跑 | 环境 06 与 07 的主题用例均 10/10 通过；环境 07 还绑定全量 E2E 和 D0 replay | [`reverification-environment-07/run-binding.json`](evidence/reverification-environment-07/run-binding.json)，配套 setup/cleanup 原始命令日志 |
| D0 亮色基线 replay | 环境 08 为 14/14 通过，无快照更新 | [`reverification-environment-08/run-binding.json`](evidence/reverification-environment-08/run-binding.json)，`d0-baseline`；此前环境 07 报告仍归档 |
| `git diff --check` | 退出码 0 | [`reverification-integration-03/run-binding.json`](evidence/reverification-integration-03/run-binding.json)，`diff-check` |

跳过项仅为：unit 中两个 `process.platform === "linux"` 的 `flock`/FD 测试在 Windows 不运行；API integration 中 exact-session MiniMax provider 用例要求 `RUN_WORKBENCH_LIVE=1` 和 `MINIMAX_CN_API_KEY`，本轮未启用真实外部服务。定向/全量 E2E 与 D0 无跳过。九类及五项原验收逐项明细见 [`reverification-index.json`](evidence/reverification-index.json)。

## 执行绑定、环境与失败记录

每条纳入结果的命令均在执行前后记录 HEAD、tree、源文件 Git blob ID、工作区 SHA-256、干净状态和源码指纹；各 `run-binding.json` 可把命令、退出码、原始日志哈希及前后指纹串起来。既有源绑定命令使用指纹 `116293733d57055901c2daf1397090e55e7d440c2574c113c6d32af0539b2ca4`；修正后的环境 08 使用独立指纹 `89a2d3ba350e56b74302061a96ac793fbda6f631208b589fc6afd2b4b8e50c0e`，主题 E2E、全量 E2E 与 D0 命令的前后指纹均相同。环境 08 唯一受测工作区改动为 `apps/web/e2e/stage0.spec.ts`，HEAD/tree 仍为其绑定中记录的 c48 对象；逐文件 Git blob 与工作区 SHA 分列在 `source-before.json` / `source-after.json`。Git 对象与检出字节的逐项关系见 [`git-blob-hashes.json`](evidence/git-blob-hashes.json)。

审查指出 [`reverification-bound-02/service-setup.json`](evidence/reverification-bound-02/service-setup.json) 在工作区和对应 HEAD 中都不存在；此历史缺口仍明确保留，环境 07/08 均为独立新执行，不回填或重建该轮现场。环境 07 的完整失败材料仍在 [`e2e-failure-captures/`](evidence/reverification-environment-07/e2e-failure-captures/)：原失败日志/上下文、两张截图、视频、HTML report 与脱敏 trace ZIP。trace 定位到 `stage0.spec.ts` 第 387 行等待当前团队选择器，页面仍处 `/workbench`；`workbench/page.tsx` 未提供 `teamSwitcher`，因此该路由不渲染该选择器。此前点击“我的工作”后没有显式等待目标 URL；更深层的导航未提交原因未能从原 trace 证明，记录为未知。修复仅在 [`stage0.spec.ts`](../../../apps/web/e2e/stage0.spec.ts) 点击后等待 `/?view=my-work`，没有放宽超时、跳过或删减断言。环境 08 在隔离 PostgreSQL/Redis/RustFS 与新的源码指纹下复验：主题 E2E 10/10、`pnpm test:e2e` 67/67（包含 Stage 0）及 D0 14/14 均通过；`service-setup.json`、实际 setup/cleanup 命令、source 前后指纹、完整日志及 [`全量 E2E HTML 报告`](evidence/reverification-environment-08/e2e-html-report/index.html) 均已归档。环境 07 原失败记录不覆盖，环境 08 成功只替代其全量 E2E 当前验收结果。

先前记录的通过摘要没有源码运行绑定，现已标为历史材料且不作为本轮验收依据。补验中保留的初败原始日志不覆盖：第一次隔离重跑因一次 Web 单测偶发断言、Playwright run dir 非绝对路径及 API rate-limit 配置失败；修正绝对目录后，完整单测、定向/全量 E2E、D0 通过，集成只因遗漏 CI `WORKMESH_RUNNER_SERVICE_TOKEN` 而失败；补齐该测试 token 后，integration 与 diff-check 在新绑定运行中通过。另一轮 `git diff --check` 暴露的两处空行已修复并由最终退出码 0 的绑定检查复核。历史原始终端日志此前未留存，详见 [`attempt-history.md`](evidence/attempt-history.md)；不声称恢复了缺失的旧 raw。

Git 哈希按来源分别登记。[`git-blob-hashes.json`](evidence/git-blob-hashes.json) 的新审计以实际 HEAD `c48d8144bffb8aae85a0af2ea842c19bc994db70` 为准：257 项原始证据加 1 项更新后的来源索引，共 258 行直接从 `git cat-file blob` 读取并独立读取工作区；257 行可经 UTF-8 BOM/CRLF checkout 归一化还原，1 行 `reverification-index.json` 是本轮在该 HEAD 后更新的内容，故如实标记 `different content`。`git-blob-hashes.json` 自身的 Git 字节和当前工作区字节由 [`artifact-manifest.json`](artifact-manifest.json) 的独立控制记录登记，不在自身索引中循环记哈希。例：`reverification-integration-03/logs/integration-suite.log` 的 Git blob 是 `14c3e50918894bd79342d3152efb1965b9e13b86`，Git 字节为 1,032,206、SHA-256 `9e26140a87a344eea9356da3ab874d1f55a8c9d56ee59ca9d90705d2b5a7c671`；工作区为 1,036,611 字节，SHA-256 `ce85f5ecfe72e9f769d4a86a2782ff1766a41cde7fe28accff463eeb4c4050e6`，仅 CRLF/BOM 检出转换。`artifact-manifest.json` 的历史受测源码/日志 Git 记录仍锚定其实际受测 HEAD `40a51cc476aa1de1d9e313dfd9bdfbbb64ef5aeb`；环境 04–08 的 196 个新增证据文件尚不在审计 HEAD，集中列于 `artifact-manifest.json` 的 `pendingEvidence`，分别登记预期 clean-filter Git blob、Git 字节数/SHA-256、工作区字节数/SHA-256及归一化关系，未声称已有提交对象。例如环境 08 全量 E2E 日志投影 Git blob `66bb8a3ab6cebbe6aef06fae6a99bf5d6387a150`、1,645,631 字节/SHA-256 `246f3d922f9bc96571bc659b7573d8032673e8ebde5f996b5600eba384da74ad`；工作区 1,651,727 字节/SHA-256 `69ff4ccba6f5420ae840c9a94236648d8f1734061161bb43bf4e1d82249ef1a3`，二者仅有 BOM/CRLF clean-filter 转换。R1 历史清单及证据保持原样。

## 门禁状态

本地绑定验证全部通过。最新提交 CI、独立 R1 复核/合入及 Chief 最终确认仍是验收门槛，本记录不将其写成已完成；本机结果不替代最新 head CI。#21 继续负责逐面迁移、人工视觉评审及无旧消费后清理旧值。
