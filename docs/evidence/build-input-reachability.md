# 输入可达性验证记录

## 当前状态

- 当前仓库基点：`32789cec4d50db0b85a63d91049cc425d9e917a2`（`HEAD` 与本地 `main` 相同）。
- 本记录所述工作区改动尚未进入该基点；因此新入库材料在此 base 上**不可读**。本轮平台提交后它们只在会话分支可用，不能据此宣称已进入依赖任务的 base。
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
| #2 仍为 building；#3 独立复核尚未完成；尚未进入 `main` | `c98ec5f538b3acd9ac052c4ef100e1d111232518` | `docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md` | `7f2624fad777b628a87517b142a3226a260188d2` | 38102 | `bacf9ea8cc733ab83514e1dc620a76ace39844a0b63e93f68defe20994121956` | 源提交正文有 16 条；不是当前 build base |

原件输入包位于 [`docs/references/todos-analysis/`](../references/todos-analysis/)。[来源清单](../references/todos-analysis/SOURCE-MANIFEST.json) 对 37 个文件（3 份任务 Markdown、5 份测量 JSON、截图索引、28 张 PNG）逐项记录相对来源名、仓库相对路径、原始字节数和 SHA-256。副本按原始字节复制；`.gitattributes` 对该目录关闭文本换行归一化。通用分析 README、截图联系表和采集工具不在依赖输入闭包内。原件复制来源可读；这些文件尚未出现在 `32789…` base。

## PRD 输入一致性

`WORKMESH_PRD.md` 已由 `dae4620366f33136d65e533d85823db49b9a3fe1` 明确删除，不恢复旧 PRD，也不以记忆补写。现行依据为 `CONTEXT.md`、`AGENT_PROTOCOL.md`、`OPENAPI.yaml`、`SCHEMA.sql` 和 `docs/adr/`；`docs/plan/2026-08-22-agent-connection-runtime-reliability.md` 与 `docs/plan/2026-09-24-prototype-pi-agent-workbench.baseline.md` 记录当前文档集合和陈旧清单修正方向。G1 同步修正 `AGENTS.md`、`MANIFEST.json`、`VALIDATION.json`，保留既有领域不变量和必需测试要求。

## 任务交接映射

当前可用 base 均指上文的 `32789…`；它含四份 ADR、主计划和旧 `.review.md`，不含本批原件输入包，且不含 P1 16 条台账。会话分支改动经提交后也只有对应分支可读；只有合入目标分支并在实际 build 中核对后才是放行依据。

| Todo | 当前状态与范围 | 所需输入（仓库相对路径） | 覆盖缺口与门禁 | 待总管同步的 spec 文本 |
|---|---|---|---|---|
| #5 B1/B2 | todo；已合并原 #5 与 #6 的纵向范围 | ADR 0075、主计划、P1 台账 | G1/P1/R1 门禁；当前 base 无 P1 | “当前输入为 ADR 0075 与主计划；P1 以审核后合入版本为准，启动前须通过 G1 实际 build base 核验。” |
| #6 B2 | closed；内容已并入 #5 | ADR 0075、主计划（历史追踪） | 不重新开启、不独立放行 | “本条已并入 #5，仅保留来源关系；不作为独立实现任务。” |
| #7 B3 | todo | ADR 0075、主计划、P1 台账 | G1/P1/R1 与 #5；P1 未合入 | “路径及 P1 输入按 G1 仓库映射；#5 与 P1 门禁通过前保持待验证。” |
| #8 A1 | todo | ADR 0074、主计划、P1 台账 | G1/P1/R1；P1 未合入 | “输入为 ADR 0074、主计划及审核后 P1 台账，按实际 build base 核验后开始。” |
| #9 A2 | todo | ADR 0074/0077、`ui-inventory.md`、主计划、P1 台账 | 当前描述仍含不可达绝对路径；输入包尚未进入 base | “将旧 spec 中的本机绝对引用替换为 `docs/references/todos-analysis/ui-inventory.md`；以实际 build base 核验正文及哈希。” |
| #10 D0 | implement_reviewing；仅视觉基线采集，不写实现 | ADR 0077、`design-tokens.md`、`design-observations.json`、截图索引与相关 PNG | 可独立采集；完成不得解除其他任务门禁 | “将旧 spec 的本机设计输入改为 `docs/references/todos-analysis/` 相对引用；D0 只产基线，不解除 G1/P1 门禁。” |
| #11 D1a | todo；只新增并存语义槽和映射 | ADR 0077、`design-tokens.md`、测量 JSON、SOURCE-MANIFEST | 需 G1/P1/R1/D0；旧 token 消费方不迁移 | “测量原件使用 `docs/references/todos-analysis/` 中的受控文件；D1a 只新增并存映射，按 G1 实际 base 校验后开始。” |
| #12 D2 | todo；卡片结构与 attention 不变量合并 | ADR 0077、`kanban-cards.md`、`component-observations.json`、相关截图 | 需 G1/P1/R1/D1a/#21；当前 base 无原件包与 P1 | “卡片测量依据使用 `docs/references/todos-analysis/kanban-cards.md` 及其测量附件；以 G1 实际 base 的哈希记录为准。” |
| #13 D4 | todo；对话/看板布局与状态记忆 | ADR 0077、`kanban-cards.md`、`board-guide-observations.json`、截图索引 | 当前描述仍含不可达绝对路径；需 G1/P1/R1/D2 | “将旧 spec 的本机 `kanban-cards.md` 引用改为 `docs/references/todos-analysis/kanban-cards.md`；交互依据见同目录索引，并由 G1 核验实际 base。” |
| #14 D5a | todo；状态化主动作与菜单 | ADR 0077、`kanban-cards.md`、截图索引 | 需 G1/P1/R1/D4；拖拽等范围属于 #22 | “D5a 只处理状态化主动作与菜单；拖拽、多选和草稿引用由 #22 承接；输入路径按 G1 映射核验。” |
| #15 C1 | todo；投递意图、每目标 attempt、fenced ack | ADR 0076、主计划、P1 台账 | 需 G1/P1/R1；与 D 链无依赖 | “依赖 ADR 0076、主计划与审核后 P1 台账；G1 实际 base 未通过前保持待验证。” |
| #16 C2 | todo；企业微信只提醒+深链 | ADR 0076、主计划、P1 台账 | 需 G1/P1/R1/C1；无决策按钮 | “协议输入为 ADR 0076 与主计划，按 G1 仓库路径和实际 base 哈希核验后开始。” |
| #17 C3 | todo；只读、带出处的国内模型预置 | ADR 0076、主计划、各提供方官方资料 | 需 G1/P1/R1；第三方资料仍需任务实施时另行核对 | “仓库输入使用 ADR 0076 与主计划；提供方资料在任务中按官方来源逐条记录，不从外部原件推断兼容性。” |
| #20 B-ship | todo；版本分发、文档、无源码 Lite 安装验收 | ADR 0075、主计划、#5/#7 验证产物 | 需 G1/P1/R1/#5/#7；设备安装不由 repo 内 pnpm 冒充 | “输入按 G1 仓库映射；依赖 #5/#7 的验证产物，G1/P1 未放行前保持待验证。” |
| #21 D1b | todo；迁移消费方并验证后删旧值 | ADR 0077、#11 映射与测量附件 | 原 #11 拆为 D1a/#11 与 D1b/#21；需 G1/P1/R1/D0/D1a | “#21 仅承接逐面迁移和最终清理；#11 的新增映射与受控测量输入为前置，按 G1 实际 base 核验。” |
| #22 D5b | todo；拖拽、多选逐项恢复、拖卡插入草稿 | ADR 0077、`kanban-cards.md`、截图索引 | 原 #14 拆为 D5a/#14 与 D5b/#22；需 G1/P1/R1/D4/D5a | “#22 承接拖拽、多选及逐项恢复；#14 保留主动作/菜单；参考交互使用 `docs/references/todos-analysis/` 并按实际 base 校验。” |

上述 16 条映射及建议文本已落盘；Todo 描述的真实同步尚未发生，状态为**待总管同步**。不能把本地映射说成平台任务已同步。#10 D0 的独立采集不解除其他任务门禁。

## 验证流程与结果

1. 原件入库后检查来源文件、仓库工作树副本和 `git cat-file blob` 的字节长度/SHA-256；在 `.gitattributes` 规则下应逐字节相等。`SOURCE-MANIFEST.json` 是来源值清单。
2. #3 独立复核 #2 的 P1 台账；#2 将该版本合入目标分支。旧 `.review.md` 不替代 P1 台账。
3. 材料和一致性修正合入后，在同一 Todo #18 继续启动至少一次真实隔离 build。build 内用 `git rev-parse HEAD` 记录实际 base，执行 `node scripts/verify-build-input-reachability.mjs <base-commit>`；脚本逐份核对 `git rev-parse <commit>:<path>`、`git cat-file blob`、`git hash-object -- <path>`，并分别输出提交 blob 字节与工作树字节的 SHA-256。逐份阅读完整正文；所有输入和 P1 16 条检查通过后由独立复核者签字并追加证据。
4. 当前回合未运行真实隔离 build，不能预填其 base/hash，也未完成独立 build 复核。验证脚本在本轮之后的实际提交中才可用；脚本将拒绝没有输入包或缺少 P1 16 条表的 base。
5. 只有合入后的真实隔离 build、正文读取、哈希比对、任务映射同步和独立复核均通过，才关闭 G1 输入门禁；材料第一阶段合入与 D0 完成均不等于最终通过。
