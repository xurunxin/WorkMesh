# M4 可选领域 MCP 与授权投影待审方案

本卡仅交付可供正式复审的规划工件。原候选正式独审提出一项High(blocking)，本轮同步仓库修订与逐项答复，仍待Chief正式复审关闭。产品代码、迁移、部署、测试运行、权限、API 与事件均未改变；本目录不宣告 M4 产品完成。

当前来源主线为 `c2b3d363c037157df13beb82799d99d07a9b7db8`，与本轮平台只读远端 `refs/heads/main` 观察相同；冻结路线来源为 `c768e1e3db297d8b91b53dd68b60e723a8a40e7d`。准确候选 head 以本次提交及最终回复为准，不在文件中循环写自身提交号。

| 受控文件 | 审阅用途 |
| --- | --- |
| [完整规格](spec.md)、[本轮反馈](input/feedback.md) | 全文来源及用户已定的独立部署六域选择、仅规划写入授权 |
| [平台计划全文](savedplan.md)、[平台同步说明](platform-sync.md) | 同步用户注入的当前authoritative saved copy；本轮不另改平台计划，工具前缀不冒全文 |
| [冻结 M4](input/frozen-m4.md)、[当前主线 M4](input/current-main-m4.md) | 原九类及 DoD 全文，原文件精确行区间，不按工具前缀重建 |
| [实施步骤](implementation.md) | 先合同独审、后后端及消费者实现的串行关口与准确文件 |
| [安全合同](safety-contract.md)、[ADR 提案](../../adr/0086-optional-agent-domain-read-projections.md) | 四读取投影、拒绝/空值、A2A 派生记录及 Runner 边界；全部是待审设计 |
| [操作矩阵](operation-matrix.md)、[结构化决策](operation-decisions.json) | 每个选定操作的 current/planned、权限、feature、SDK/MCP/Runner 与正反用例；Human 保留动作逐项登记 |
| [发现生成合同](discovery-contract.md)、[M4受控增量](product-discovery-decisions.json) | 明确未来generator源、四读新谓词、实际bindings及原bindings保留；当前实际注册为空，仍不可激活 |
| [逐项审查答复](review-response.md)、[历史索引](history/index.json) | 原候选、原审全文与修订落点；High(blocking)待正式复审，不自行关闭 |
| [消费者兼容](compatibility.md) | 参数/正文/分页/错误与原凭据；复用原恢复合同，保留未知与签名发行边界 |
| [部署与资源](environment-and-resources.md) | 本轮只读实际盘点、未来独有部署、准备/恢复/清理；不把配置建议当已启用 |
| [九类验收](verification.md) | 六域适用测试、准确未来命令、Required CI 接线与证据验收规则 |
| [来源说明](sources.md)、[完整来源指纹](input/source-manifest.json) | 不可变 Git 对象、工作树换行、完整 blob 消费、M5 与清理来源及缺口 |
| [新增审查来源](input/discovery-review/source-manifest.json)、[旧发现基线](input/discovery-review/discovery-baseline.json) | 原177来源不覆盖；补14完整Git来源及138旧bindings/137映射逐项对照 |
| [规划检查报告](planning-report.md) | 本轮实际文档检查、首个来源候选路径失败、未测产品与正式交接缺口 |

用户已选择仅在本卡独立本机测试部署启用 Planning、Template、Automation、Agent Loops、Costs、A2A。默认关闭负例、Human 管理、private owner、Template pin、currency/unknown、A2A 独立 cursor 均保留。仓库目前没有这批新工具，四项差异仍被 M0 发现层阻断；矩阵中的拟补操作均不是已落地声明。

六域选择不授予 Agent Human 身份，也不授予 origin Session 读取 `runLoopNow` 新建 target Session 的权利。Loop target、A2A target 必须用它们各自真实接单取得的准确 E；项目无归属的 Loop Session 不自动取得 Loop.project_id 的项目读权或 usage 归属。

本卡按规格仅使用 Todos＋仓库记录，没有创建真实 WorkMesh Project/WorkItem、远端 append_activity 或伪造运行回执。Chief 在本卡回 confirm 后按既定委托交另一 Agent 正式独审；本轮未另建任务、未启动产品、不擅自代该审查发言。
