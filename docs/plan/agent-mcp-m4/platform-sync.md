# 平台计划全文与仓库同步说明

本卡平台原计划引用为 `doc:bLr0qXDovFqe7sMQaMluT`，来源是本轮完整 Spec 读回，不是生产者推断。`input/todo-readback.json` 保全实际返回；其 Spec 完整结束，而 Saved plan 在 CI 接线段截断。不能为该前缀生成平台全文 hash 或称后端全文读回。

`savedplan.md` 以用户当前消息中的完整 authoritative saved copy 为全文源。本轮仅用 `edit_plan` 替换 `docs/plan/agent-mcp-m4/` 的一段，补充“保存平台计划全文、本轮只提交规划、待审设计逐项证明”。其余段落保持原文。此工具返回 Replaced；新版本/doc ID、创建字段没有返回，记为未知，不复用旧 doc ID 冒新版本，不追加自引用 edit。

本地原段如下，可精确恢复用户注入的旧全文；未另复制整份旧文件：

> - **`docs/plan/agent-mcp-m4/`**：保存完整中文规格快照、冻结 M4 原文、来源元数据、实施方案、逐操作安全与消费者矩阵、九类场景及不适用理由。绑定准确 Git blob 与运行字节，消费 M5 当前报告、恢复合同和已合清理规则；历史报告仅引用。文档及下述 ADR 先交另一 Agent 正式独审，blocking/high 闭合后实施产品。

`spec.md` 是本轮 `todos(id)` 返回的完整 Spec，包含六域选择与规划写入交接；`input/feedback.md` 是用户本轮直接反馈。二者分列，保存前不改写原文措辞。仓库实施展开是对平台计划的细化，不将 ADR Proposed 写为 Accepted。

同步检查将旧全文复原后与工具可见 Saved plan 前缀逐字比对；末尾 `…(truncated)` 不当原计划正文。提交中全文实际 bytes/hash 由交付清单记录，不能据此推断平台隐藏后缀字节。
