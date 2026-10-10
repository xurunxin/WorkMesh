# 原问题卡用户裁定

问题卡：doc:q-zoO3M6sporQm1UHRMlj2K。取得方式：本会话用户反馈全文与本轮 conversation 实读；不是产品验收。

Q: M3 的独立 reviewer Git 闭环采用哪一种安全合同？两种均保持 reviewer 无仓库写权、无 plan:write，审批仍由 Human 决定。
A: 显式限定仓库读授权（推荐）

推荐项原说明：审查委派新增可选 repositoryIds；明确指定时，仅在父 Delegation、目标 Agent、Team grant 三方均具 repo:read 且仓库属于父范围时授予该读能力；省略保持 M2 原能力。复用现有仓库与证据门禁。
