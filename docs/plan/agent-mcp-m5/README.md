# 外部 MCP 客户端与内置 Runner 联合验收方案

状态：规划候选 `ddddcfca8d7ef387df58be993c88ffe7d62391dd` 已经另一 Agent 复审并经 Chief confirm 启动实施。下表规划原件保留当时含义；本轮产品工作见 [产品报告](product-report.md)、[实际矩阵](product-matrix.md)、[本卡缺口](product-gaps.md)、[新命令回执](product-checks.json)、[脱敏原件索引](product-evidence-index.json)、[资源收尾](product-cleanup.json)。M5 联合验收尚未完成，OpenCode 实际隔离门禁失败；已有安装、握手、局部单元测试和前置 CI 不表示联合通过。

本轮平台只读 fetch 所见真实主线 `87f88b89297c5c1e346f7ef99118c410f4b4a905`，准确观察见 [执行主线回执](input/product-main-observation.json)；它是该次观察，不代表未来实时 ref。规划来源见 [来源](sources.md)。仅 Todos＋仓库记录，未创建真实 WorkMesh 远端 Project／WorkItem。

## 受控入口

| 文件 | 审阅内容 |
| --- | --- |
| [准确规格](spec.md)、[本轮反馈](input/feedback.md) | 完整原卡与覆盖本轮落盘时机的明确反馈 |
| [冻结 M5](frozen-m5.md)、[来源与缺口](sources.md) | 冻结输入原始 177–201 行、完整七文件、前置源码与历史报告原件 |
| [当前修订方案副本](savedplan.md)、[原平台方案](input/platform-savedplan.md) | 已接受编辑的预期修订全文；原注入副本与工具读回逐字一致，独立 doc 原件缺口另列 |
| [完整实施设计](implementation.md)、[安全合同](security-contract.md) | 外部实际进程／Pi／协议夹具的边界、运行步骤、拟变更文件与门禁 |
| [三项阻断处置](review-response.md)、[ADR提案](adr-proposal.md) | Handoff承接、同Session合法Plan冲突、待实现的受限Pi传输重放；均待复核 |
| [原候选全文索引](review-base-manifest.json)、[原审核](input/reviewer-feedback.md)、[本轮明确反馈](input/sync-feedback.md) | 原47文件完整Git/worktree字节与旧首败保全，不倒写旧candidate通过 |
| [实际环境](environment.md)、[部署支持矩阵](support-matrix.md) | 可得路径／版本／配置元数据／官方文档，明确安装与接入区别 |
| [操作矩阵](operation-matrix.md)、[消费者兼容](consumer-matrix.md) | 同 operationId 的合同、身份、工具绑定与具体链段 |
| [两条路径](journeys.md)、[九类验收](acceptance-matrix.md) | 四次客户端主链运行、两 Human／两 Agent、故障与领域事实判定 |
| [检查方案与实际回执](verification.md)、[首败](planning-first-failures.md) | 本轮静态结果与未来未运行检查分列 |
| [资源与保全](resources.md) | 独有资源登记、用户配置保护、拒绝目标和清理边界 |

## 交付与确认边界

历史规划回合只同步规划、归档及静态核验；原文件正文与可达提交不倒写。已确认后的实施增加 Runner 三个内部白名单的有界传输重放及真实 Pi 验证，没有数据库迁移、公开 API 参数、事件或服务端权限变更。正式成果独审、最新 Required CI、actual Done/main 仍待后续关口；必要新投影或权限合同分叉先原卡另问／ADR 复核。

首轮选择实际 OpenCode 与内置 Pi，由生产者基于本机盘点提出；不代表用户新增厂商认证、账号连接或外发授权。采用本任务独有 loopback 受控模型与 fake Git；共同验证既有域的实际客户端链。企业／其他 OS／真实 provider 账号不扩入本卡，旧三 OS 与发行门禁保留。

产品完成必须具备：两路径与九类新运行证据、适用必需检查、独立成果审查、最新 PR Required CI，以及实际 Done／main。merge 不意味着部署，Session completion 不意味着 Issue 自动 Done，模型口头结论不证明领域完成。
