# 平台计划全文与仓库同步说明

本卡平台原计划引用为 `doc:bLr0qXDovFqe7sMQaMluT`，来源是本轮完整 Spec 读回，不是生产者推断。`input/todo-readback.json` 保全实际返回；其 Spec 完整结束，而 Saved plan 在 CI 接线段截断。不能为该前缀生成平台全文 hash 或称后端全文读回。

原候选 `4e144f35759525a8a377acc73ba2f2dbfe02ab67` 的savedplan/platform-sync全文与原edit来源保留在Git；本文件原段引用仍用于复原当时工具前缀。用户本次给定当前计划引用 `doc:2lrk57A39k3aZfYY5BGeJ`，并直接注入完整authoritative saved copy，`savedplan.md`现与该全文同步。本轮未调用edit_plan，不再产生平台计划新版本。

本轮 [todo实际读回](input/discovery-review/todo-review-sync.json) 的Saved plan仍截断，校验其可见前缀；Spec内旧doc指针不冒当前plan全文回执。当前doc引用来源为用户直接反馈，不推断版本/创建字段或隐藏后缀bytes。完整当前计划Git/staged实际指纹由本次交付清单绑定，与平台前缀证据分开。

本地原段如下，可精确恢复用户注入的旧全文；未另复制整份旧文件：

> - **`docs/plan/agent-mcp-m4/`**：保存完整中文规格快照、冻结 M4 原文、来源元数据、实施方案、逐操作安全与消费者矩阵、九类场景及不适用理由。绑定准确 Git blob 与运行字节，消费 M5 当前报告、恢复合同和已合清理规则；历史报告仅引用。文档及下述 ADR 先交另一 Agent 正式独审，blocking/high 闭合后实施产品。

`spec.md` 是完整todos Spec，原件与本轮实际读回全文均匹配；`input/feedback.md`保留原交接，当前 [用户反馈](input/discovery-review/user-feedback.md) 单独保全。不改写历史原件或把ADR Proposed写为Accepted。

同步检查用旧候选全文及旧同步说明复原原可见前缀，再将当前savedplan与本轮工具可见前缀逐字比较；末尾 `…(truncated)`不当正文。历史输入、原审与旧候选均保留可达；正式复审须读取新候选，不能借原head检查验新组合。
