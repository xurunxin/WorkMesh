# 外部 MCP 客户端与内置 Runner 联合验收方案

当前交付见 [完整中文产品报告](product-current-report.md)、[当前矩阵](product-current-matrix.md)、[中文资源报告](product-resources-current.md) 与 [修复来源](review-fixes-report.md)。真实 O/P 四链与九类阶段已完成；原完整入口在补充检查门禁 exit1，保留原件，精确证据续接 exit0。补充集成各阶段当前均通过，正式 `_oY` 成果复审、Required CI 与 actual Done/main 仍待取得。

状态：规划候选 `ddddcfca8d7ef387df58be993c88ffe7d62391dd` 已经另一 Agent 复审并经 Chief confirm 启动实施。下表规划原件保留当时含义；[旧产品报告](product-report.md)、[旧实际矩阵](product-matrix.md)、[旧缺口](product-gaps.md) 对应较早候选，不能替代上面的 current 入口。新运行见 [命令回执](product-checks.json)、[原件索引](product-evidence-index.json)；资源登记不等于已收尾。M5 尚待当前完整组合与正式关口，不借前置 CI 宣称通过。

最新平台只读 fetch 所见主线 `996c940eb6c725fdfe408976ff9570997d1d5bdb`，见 [当前主线回执](input/current-main-observation.json)；此前 `87f88b8` 见 [旧执行观察](input/product-main-observation.json)，各自只代表当次读回。规划来源见 [来源](sources.md)。仅 Todos＋仓库记录，未创建真实 WorkMesh 远端 Project／WorkItem。

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

历史规划回合只同步规划、归档及静态核验；原件与可达提交不倒写。已确认后的实施增加 Runner 三个内部白名单的有界传输重放，并修复既有普通 E 实时 principal 资格及 status 一致快照；新增只读事件消费者和原 E Stop 恢复发现不授予新权限。没有数据库迁移、新角色或公开 API/事件参数。正式成果独审、最新 Required CI、actual Done/main 仍待后续关口；真实合同分叉仍须原卡裁定。

首轮选择实际 OpenCode 与内置 Pi，由生产者基于本机盘点提出；不代表用户新增厂商认证、账号连接或外发授权。采用本任务独有 loopback 受控模型与 fake Git；共同验证既有域的实际客户端链。企业／其他 OS／真实 provider 账号不扩入本卡，旧三 OS 与发行门禁保留。

产品完成必须具备：两路径与九类新运行证据、适用必需检查、独立成果审查、最新 PR Required CI，以及实际 Done／main。merge 不意味着部署，Session completion 不意味着 Issue 自动 Done，模型口头结论不证明领域完成。
