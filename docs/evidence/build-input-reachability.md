# 输入可达性验证记录

## 当前状态

- 主分支基点：`32789cec4d50db0b85a63d91049cc425d9e917a2`。本 G1 分支当前 HEAD 为首阶段提交 `ef264842a8e0dcd215151fd2e2d7c0dc7b5d6cdd`；其中已包含 37 份原件输入及来源清单，但不含 P1 台账。新补的完整 #19 审查原件与本轮脚本/清单修订属于后续修订。
- `32789…` 主分支 base 中新输入包**不可读**；`ef264…` G1 分支中已有首阶段 37 份输入。两者均不得据此宣称最终依赖 build base 已通过：P1 尚未合入目标分支，真实隔离 build 与独立 build 复核仍待执行。
- 最终门禁状态：**待验证**。当前没有本批改动合入后的真实隔离 build 正文读取证据，也没有独立复核签字。
- 批次控制面：用户于 2026-10-07 18:38（Asia/Shanghai）批准本批使用 Todos 编排、仓库保存规格和证据。此例外只适用于本批，不创建、不声称存在 WorkMesh Project/WorkItem，也不改 WorkMesh 产品领域控制面；仅替代 `AGENTS.md` 的双轨记录要求，其他约束有效。

## 基点、正文和哈希

以下 SHA-256 均由 `git cat-file blob <commit>:<path>` 的原始提交字节计算，不是工作树哈希。当前主基点中的文件正文可完整读取：

| 输入 | base commit | 路径 | Git blob | 提交字节 | SHA-256 | 结果 |
|---|---|---|---|---:|---|---|
| ADR 0074 | `32789cec4d50db0b85a63d91049cc425d9e917a2` | `docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md` | `b353cf0d75f6ecb00a4d706efa944cefb5b62b2a` | 11934 | `3b80220abbd1c63da2b08725f1eda4deae0d4b4a308b14845b5260b5f8d439bb` | 正文可读 |
| ADR 0075 | `32789cec4d50db0b85a63d91049cc425d9e917a2` | `docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md` | `4e9f4f140bafad6a96aba4fb9eba286b12ee0538` | 15626 | `b2b38f537dc20d2def6dc800c46e6e1d2e0136fecc83c2c531a3e554a60df504` | 正文可读 |
| ADR 0076 | `32789cec4d50db0b85a63d91049cc425d9e917a2` | `docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md` | `3bca13aa12d1136af96702ec71c8410021152430` | 14889 | `1e82a4fa6da13222898bb04dd5aed78e8c5bc4bccfd67227e6c8f407e23b3ed3` | 正文可读 |
| ADR 0077 | `32789cec4d50db0b85a63d91049cc425d9e917a2` | `docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md` | `a1a5c88bb759eeec3a5c3d640f453e548ec404d0` | 13679 | `67092e07b9e19df1ae8bf740067815362331e583f463d5923b74920412848655` | 正文可读；含本机绝对路径，G1 修正尚未进入该 base |
| 主计划 | `32789cec4d50db0b85a63d91049cc425d9e917a2` | `docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md` | `de96c83df8ec894820473460d7916aeb81ed1e5f` | 31128 | `3a3b033b8ad901c8ee24056dff649b2ad3bb46a9ab2096c3c3c1aba3da1c5aaf` | 正文可读；含本机绝对路径，G1 修正尚未进入该 base |
| 旧审查矩阵 | `32789cec4d50db0b85a63d91049cc425d9e917a2` | `docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.review.md` | `764608c4ad529b2fa80fab87e526a014a98b7872` | 44071 | `7226285a697cb7189e35863f6e5988b702a38bbdf72da9bce138a14a7b3d33bd` | 正文可读；不是 P1 事实台账 |

P1 的 16 条代码事实台账是**同一路径的另一个提交版本**，不能由旧审查矩阵代替：

| 状态 | base commit | 路径 | Git blob | 提交字节 | SHA-256 | 核对结果 |
|---|---|---|---|---:|---|---|
| #2 当前仍为 building；其 `run_review` 已执行，正在修订/跑检查；#3 是后续规格裁决项 | `c98ec5f538b3acd9ac052c4ef100e1d111232518` | `docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md` | `7f2624fad777b628a87517b142a3226a260188d2` | 38102 | `bacf9ea8cc733ab83514e1dc620a76ace39844a0b63e93f68defe20994121956` | 源提交正文有 16 条；不是当前 build base；合入前置为 #2 自身 review/check 通过 |

原件输入包位于 [`docs/references/todos-analysis/`](../references/todos-analysis/)。[来源清单](../references/todos-analysis/SOURCE-MANIFEST.json) 对 37 个交接原件（3 份任务 Markdown、5 份测量 JSON、截图索引、28 张 PNG）及 #19 完整审查报告逐项记录相对来源名、仓库相对路径、原始字节数和 SHA-256。37 份参考原件保留原始字节；生成的来源清单使用 LF。通用分析 README、截图联系表和其他采集工具不在依赖输入闭包内。

### #19 完整审查报告来源核对

原件可读，已按原始字节纳入 `docs/references/todos-analysis/reviews/todos-review.md`；在来源清单中记录来源相对名 `tools/todos-review.md`、字节数 `56573`、SHA-256 `c4fabf4571c35f41bf11cc022d7260b84b467766875b6e988f96d3afbedae5f8`。主分支旧 `.review.md` 提交 blob 为 44071 字节、SHA-256 `7226285a697cb7189e35863f6e5988b702a38bbdf72da9bce138a14a7b3d33bd`；两者不同，旧稿不是新报告全文。原报告中保留的历史本机引用只用于来源追溯，执行输入应使用仓库相对路径。

## PRD 输入一致性

`WORKMESH_PRD.md` 已由 `dae4620366f33136d65e533d85823db49b9a3fe1` 明确删除，不恢复旧 PRD，也不以记忆补写。现行依据为 `CONTEXT.md`、`AGENT_PROTOCOL.md`、`OPENAPI.yaml`、`SCHEMA.sql` 和 `docs/adr/`；`docs/plan/2026-08-22-agent-connection-runtime-reliability.md` 与 `docs/plan/2026-09-24-prototype-pi-agent-workbench.baseline.md` 记录当前文档集合和陈旧清单修正方向。G1 同步修正 `AGENTS.md`、`MANIFEST.json`、`VALIDATION.json`，保留既有领域不变量和必需测试要求。

## 任务交接映射

当前可用 base 均指上文的 `32789…`；它含四份 ADR、主计划和旧 `.review.md`，不含本批原件输入包，且不含 P1 16 条台账。会话分支改动经提交后也只有对应分支可读；只有合入目标分支并在实际 build 中核对后才是放行依据。

| Todo | 当前状态与范围 | 所需输入（仓库相对路径） | 覆盖缺口与门禁 | 已同步 spec 的内容核验 |
|---|---|---|---|---|
| #5 B1/B2 | todo；已合并原 #5 与 #6 的纵向范围 | ADR 0075、主计划、P1 台账 | G1/P1/R1 门禁；当前 base 无 P1 | 已同步 ADR 0075/主计划路径、#2 审核后 P1 要求、实际 base 门禁及 #5 合并验收范围 |
| #6 B2 | closed；内容已并入 #5 | ADR 0075、主计划（历史追踪） | 不重新开启、不独立放行 | 已同步关闭/吸收说明；保留来源，不冒称连接器实现完成 |
| #7 B3 | todo | ADR 0075、主计划、P1 台账 | G1/P1/R1 与 #5；P1 未合入 | 已同步仓库输入、#2 P1 版本要求及 #5/#20 的后续关系 |
| #8 A1 | todo | ADR 0074、主计划、P1 台账 | G1/P1/R1；P1 未合入 | 已同步 ADR 0074/主计划、P1 门禁及纯查询授权边界 |
| #9 A2 | todo | ADR 0074/0077、`ui-inventory.md`、主计划、P1 台账 | G1 首阶段输入已入 G1 分支，尚未在真实依赖 base 验证 | 已将 UI 原件引用改为受控相对路径，并保留 P1 与实际 base 门禁 |
| #10 D0 | building；仅视觉基线采集，不写实现 | ADR 0077、`design-tokens.md`、`design-observations.json`、截图索引与相关 PNG | 可独立采集；完成不得解除其他任务门禁 | 已同步受控输入路径、D0 独立范围及不解除 G1/P1/R1 门禁 |
| #11 D1a | todo；只新增并存语义槽和映射 | ADR 0077、`design-tokens.md`、测量 JSON、SOURCE-MANIFEST | 需 G1/P1/R1/D0；旧 token 消费方不迁移 | 已同步受控测量文件、D1a/D1b 范围及 P1 门禁 |
| #12 D2 | todo；卡片结构与 attention 不变量合并 | ADR 0077、`kanban-cards.md`、`component-observations.json`、相关截图 | 需 G1/P1/R1/D1a/#21；P1 未合入 | 已同步 kanban/测量附件、R1 attention 来源裁决与实际输入门禁 |
| #13 D4 | todo；对话/看板布局与状态记忆 | ADR 0077、`kanban-cards.md`、`board-guide-observations.json`、截图索引 | 需 G1/P1/R1/D2；G1 首阶段未在目标 base 验证 | 已同步受控 kanban 路径、截图索引和实际 base 门禁 |
| #14 D5a | todo；状态化主动作与菜单 | ADR 0077、`kanban-cards.md`、截图索引 | 需 G1/P1/R1/D4；拖拽等范围属于 #22 | 已同步受控输入及 D5a/D5b 拆分范围 |
| #15 C1 | todo；投递意图、每目标 attempt、fenced ack | ADR 0076、主计划、P1 台账 | 需 G1/P1/R1；与 D 链无依赖 | 已同步 ADR 0076/主计划、P1 门禁及无 D 链依赖说明 |
| #16 C2 | todo；企业微信只提醒+深链 | ADR 0076、主计划、P1 台账 | 需 G1/P1/R1/C1；无决策按钮 | 已同步 ADR 0076/主计划、target 配置由 C1 提供且无卡片决策 |
| #17 C3 | todo；只读、带出处的国内模型预置 | ADR 0076、主计划、各提供方官方资料 | 需 G1/P1/R1；第三方资料仍需任务实施时另行核对 | 已同步仓库输入、官方资料逐条核验要求及不推断兼容性 |
| #20 B-ship | todo；版本分发、文档、无源码 Lite 安装验收 | ADR 0075、主计划、#5/#7 验证产物 | 需 G1/P1/R1/#5/#7；设备安装不由 repo 内 pnpm 冒充 | 已同步 ADR 0075、#5/#7 产物依赖及设备安装验收边界 |
| #21 D1b | todo；迁移消费方并验证后删旧值 | ADR 0077、#11 映射与测量附件 | 原 #11 拆为 D1a/#11 与 D1b/#21；需 G1/P1/R1/D0/D1a | 已同步逐面迁移/最终清理范围，以及 #11 映射作为前置 |
| #22 D5b | todo；拖拽、多选逐项恢复、拖卡插入草稿 | ADR 0077、`kanban-cards.md`、截图索引 | 原 #14 拆为 D5a/#14 与 D5b/#22；需 G1/P1/R1/D4/D5a | 已同步拖拽/多选/草稿引用范围及 #14/#22 拆分 |

总管于 `2026-10-07T11:22:13Z`–`2026-10-07T11:22:29Z` 更新这 16 条任务；已重新读取全部 spec 并核对新增的 `G1 仓库输入交接（总管同步）` 段、当前相对路径和门禁。设计输入已改为 `docs/references/todos-analysis/`；16 条原有测试/DoD 保留；#6 仍 closed，#5、#11/#21、#14/#22 的合并/拆分关系符合映射。同步已完成，不再标记待同步。#10 D0 的独立采集不解除其他任务门禁。

## 验证流程与结果

1. 原件入库后检查来源文件、仓库工作树副本和 `git cat-file blob` 的字节长度/SHA-256；在 `.gitattributes` 规则下应逐字节相等。`SOURCE-MANIFEST.json` 是来源值清单。
2. #2 的 `run_review` 是 P1 自身的独立审查关口；该审查已执行，#2 正在修订/跑检查。关口通过后按流程合入 P1。#3 是 P1/G1 冻结后的独立规格裁决，不是合入前置。旧 `.review.md` 不替代 P1 台账。
3. 材料和一致性修正合入后，在同一 Todo #18 继续启动至少一次真实隔离 build。build 内用 `git rev-parse HEAD` 记录实际 base，执行 `node scripts/verify-build-input-reachability.mjs <base-commit>`；脚本逐份核对 `git rev-parse <commit>:<path>`、`git cat-file blob`、`git hash-object --path=<path> <path>`，并分别输出提交 blob 字节与工作树字节的 SHA-256。逐份阅读完整正文；所有输入和 P1 16 条检查通过后由独立复核者签字并追加证据。
4. 本轮未运行真实隔离 build，不能预填其 base/hash，也未完成独立 build 复核。验证脚本随本轮变更提交后可在 build 中使用；脚本将拒绝没有输入包、工作树缺少必读正文或缺少 P1 16 条表的 base。
5. 五项 `pnpm` 仓库检查运行于基于 `ef264842a8e0dcd215151fd2e2d7c0dc7b5d6cdd` 的本轮工作树，时间早于最后一次 verifier 行尾边界微调。该微调后重跑了可达性脚本 3/3 负向/归一化单测、`pnpm lint`、`pnpm typecheck`、`git diff --check` 和清单哈希核验；没有改动应用或 TypeScript 包源码。此 SHA 是检查基线，不是包含本轮改动的最终提交。结果如下：

| 命令 | 退出码 | 结果摘要 |
|---|---:|---|
| `pnpm lint` | 0 | Turbo 18/18 成功；缓存命中。 |
| `pnpm typecheck` | 0 | Turbo 18/18 成功；缓存命中。 |
| `pnpm test` | 0 | Turbo 29/29 成功；其中仓库原有跳过项仍按测试配置跳过。 |
| `pnpm test:integration` | 0 | DB 17 文件/77 测试通过；API 22 文件/154 通过、1 跳过；worker 8 文件/78 通过、1 跳过；recovery 1 文件/1 测试通过。 |
| `pnpm test:e2e` | 0 | Playwright 74/74 通过；Turbo 12/12 成功。 |
| `node --test scripts/verify-build-input-reachability.test.mjs` | 0 | 3/3 通过，覆盖工作树文件缺失、版本陈旧和 Git 行尾规范化。 |
| `git diff --check` | 0 | 无空白/行尾错误；来源清单保留 LF，38 份来源原件仍按 `-text` 保留原始字节。 |

集成与 E2E 使用本轮新建的专属容器和测试数据库：PostgreSQL 宿主端口 15442、Redis 端口 16389、RustFS 端口 19010；E2E 使用独立数据库和 Redis DB 1。bootstrap/session 值由运行时随机生成且未写入仓库；recovery 测试创建自己的 Object Lock 源桶，容器内 `pg_dump` 连接 5432。曾有两次环境配置尝试未通过：首轮集成漏配 CI 的认证 burst 上限（API 23 条失败），补齐后又因把宿主映射端口传给容器内 `pg_dump`（recovery 1 条失败）；修正为 CI burst 值和容器端口后，完整命令退出码 0。临时运行日志不作为仓库材料保留。

这些是本地工作树检查结果，不是最终提交或 CI 结果；须由最终提交的 CI 再核验。P1 尚未合入当前主分支，G1 尚无合入后真实隔离 build 的读取证据，故本地通过不解除 G1 最终输入门禁。
6. 只有合入后的真实隔离 build、正文读取、哈希比对、任务映射同步和独立复核均通过，才关闭 G1 输入门禁；材料第一阶段合入与 D0 完成均不等于最终通过。
