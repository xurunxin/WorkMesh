# 外部 MCP 客户端与内置 Runner 联合验收方案

状态：完整规划包；本轮实际落盘并提交，停 confirm 供 _oY 方案独审。所有 M5 产品验收尚未执行，已有安装、静态检查和前置 CI 不表示新组合通过。

当前真实主线 `87f88b89297c5c1e346f7ef99118c410f4b4a905`，与本任务起始 HEAD 一致；重新 fetch 的准确来源、父提交和 tree 见 [来源](sources.md)。仅 Todos＋仓库记录，未创建真实 WorkMesh 远端 Project／WorkItem。

## 受控入口

| 文件 | 审阅内容 |
| --- | --- |
| [准确规格](spec.md)、[本轮反馈](input/feedback.md) | 完整原卡与覆盖本轮落盘时机的明确反馈 |
| [冻结 M5](frozen-m5.md)、[来源与缺口](sources.md) | 冻结输入原始 177–201 行、完整七文件、前置源码与历史报告原件 |
| [当前修订方案副本](savedplan.md)、[原平台方案](input/platform-savedplan.md) | 已接受编辑的预期修订全文；原注入副本与工具读回逐字一致，独立 doc 原件缺口另列 |
| [完整实施设计](implementation.md)、[安全合同](security-contract.md) | 外部实际进程／Pi／协议夹具的边界、运行步骤、拟变更文件与门禁 |
| [实际环境](environment.md)、[部署支持矩阵](support-matrix.md) | 可得路径／版本／配置元数据／官方文档，明确安装与接入区别 |
| [操作矩阵](operation-matrix.md)、[消费者兼容](consumer-matrix.md) | 同 operationId 的合同、身份、工具绑定与具体链段 |
| [两条路径](journeys.md)、[九类验收](acceptance-matrix.md) | 四次客户端主链运行、两 Human／两 Agent、故障与领域事实判定 |
| [检查方案与实际回执](verification.md)、[首败](planning-first-failures.md) | 本轮静态结果与未来未运行检查分列 |
| [资源与保全](resources.md) | 独有资源登记、用户配置保护、拒绝目标和清理边界 |

## 交付与确认边界

本轮只新增本目录规划、来源归档及静态核验脚本；零产品改动、零数据库迁移、零 API／事件变更。后续产品实施只有在另一 Agent 独审 blocking／high 闭合并由 Chief confirm 后启动。若必需新只读投影，先另行 ADR／合同复核，不把假端点写成既有能力。

首轮选择实际 OpenCode 与内置 Pi，由生产者基于本机盘点提出；不代表用户新增厂商认证、账号连接或外发授权。采用本任务独有 loopback 受控模型与 fake Git；共同验证既有域的实际客户端链。企业／其他 OS／真实 provider 账号不扩入本卡，旧三 OS 与发行门禁保留。

产品完成必须具备：两路径与九类新运行证据、适用必需检查、独立成果审查、最新 PR Required CI，以及实际 Done／main。merge 不意味着部署，Session completion 不意味着 Issue 自动 Done，模型口头结论不证明领域完成。
