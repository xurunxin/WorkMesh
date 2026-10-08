# [C1] 渠道投递契约：投递意图 + 每目标 attempt + fenced ack

来源卡：[#15](todo:kkG9VeT3_uTzREhjnX2ve)；来源 updatedAt：2026-10-07T15:23:31.070Z；原文 UTF-8 SHA-256：`bf45c2d9b8a382af3804d4b7949f8b84ad9bb4a348962ffa56e0078a0cda572a`。完整原文与读取来源见 execution-inputs.json，非事务快照。

withPlan: true；owner：C1 执行者；源状态：todo；同步：待Chief读回核验。

本批仅用 Todos 编排与仓库保存规格及证据，替代真实WorkMesh双轨记录；其余领域/安全/测试规则不变。当前G1已done，最新主线含最终证据；每次开工仍核验最新main与输入差异。R1完成独审、必需检查及合入后才由Chief放行受影响实现，不能以本文件存在当成功。

## 冻结接口与阶段

扩展 notification_channels/deliveries，复用 createAutomationWorker.claimNotifications/deliverNotification 的 reclaim/fence/effectKey；delivery行承担 intent/target attempt，不重建平行队列。C1负责目标配置、秘密引用、授权/revision/idempotency与 source-event→Human→target 选择；cursor/intent 持久化，外发前当前授权与内容最小化。

## 定向验收责任

两worker竞争/旧fence拒绝、单目标失败隔离、同体/异体、未知外发对账、各提交/发送/checkpoint边界崩溃、撤权/禁用零外发、Query零投递写入；目标管理脱敏/授权/陈旧revision；noRedis明确不支持。

测试目标：`apps/worker/integration/stage4-automation.integration.test.ts`（现有文件，新增用例尚待实现）。九类适用性、全部原测试/DoD去向见 test-coverage.json；未运行不填通过。

## 完整任务正文

## 来源与目标
来源：原 #15 C1、#19 F05 已批准修订、P1 冻结事实及 ADR 0076。Human Attention 是派生查询，不能在读投影时产生投递意图。既有 Web Push、notification channel/delivery 与 worker 的 claim_fence/reclaim/退避/effectKey 必须先读清楚，不能口号式复用后又建平行系统。

## 交付物与责任
1. 定义与既有 notification delivery 的具体增量关系：投递意图、每目标逻辑 attempt、扇出、fenced ack、退避/超时 reclaim/死信、持久 checkpoint。
2. C1 承担 channel target 配置契约及管理入口：授权、revision、幂等、秘密引用/脱敏、禁用后抑制；明确 source event→recipient Human→channel target 的选择规则。目标地址映射仅用于投递，不授予点击者 Human 身份。
3. C2 使用本项 target 配置，不另建 CRUD；卡片决策/账号身份绑定仍延期。

## 不变量与边界
投递意图仅由业务事务或带持久 cursor 的 worker 产生，Query 零副作用；外发只在业务事务提交后。发送前按目标 Human 再授权并重建最小内容，排队后撤权抑制零外发。
每目标独立重试；源 revision 保留，陈旧通知仅深链，不可批准新内容。承诺至少一次，不声称唯一键确保外部恰好一次。
同 intent/target 一个逻辑 attempt；正常竞争只允许有效持有者处理，旧 fence ack 拒绝。外部发送成功但未确认可重送，持久记录不确定结果并给对账路径。
无 Redis 档位按既有/Proposed 决策的实际支持状态显式记录不支持，不静默降级。本任务不实现未来卡片审批/身份桥接。

## 完整修正测试清单
- [ ] 源事件目标选择、每目标幂等去重；target 管理入口的授权/revision/幂等/脱敏与禁用抑制。
- [ ] 两 worker 竞争只允许有效 fence 处理，一个逻辑 attempt，旧 fence ack 被拒。
- [ ] 单渠道故障不导致其他目标正常投递重投；外发未知按至少一次与对账路径记录。
- [ ] 撤权/停用后抑制，断言零外发；Query 零投递写入。
- [ ] 每个提交/发送边界崩溃、checkpoint 保存前后崩溃均有恢复证据。
- [ ] source-event、fan-out、job、ack 的同体去重/异体冲突与重放恢复。
- [ ] 源 revision 陈旧不形成决策写入；本批不测试或实现未来并发相反审批/决策回调。
- [ ] 无 Redis 档位明确不支持，既有路径不受影响。

## DoD 与依赖
契约落地、崩溃/并发/撤权/配置断言通过，无适配器时既有路径不受影响；迁移如确有需要遵循 AGENTS.md 新迁移+SCHEMA.sql+升级/空库双测，必需检查通过。复用映射、测试与证据提交仓库。
依赖：P0、G1、P1、R1；blocks C2。移除无实际依赖的 D5→C1 串行门禁。

## 执行依赖与放行

requires：#1、#2、#18、#3；最终验收 additionally requires：无。

本todo原问题已有用户13:34–13:36明确答复，详见末尾同步；依赖及审查门禁保持。

DoD：上面完整源DoD与定向断言全部满足，适用必需检查成功，证据落盘、独立复核及Chief确认；不得以接口存在或历史CI冒称新组合已验收。阶段owner由Chief派发前落实到实际执行者，角色不冒称已任命某agent。

## 总管同步与当前门禁（2026-10-08，Asia/Shanghai）

来源：已独审并合入的 PR203，main `9ac1a2015da1ae20b9693ac8a62aac6f49dca8d7`，第二 parent 为审核 head `550dead055689154359a3406dfce4f0c91c1dad3`，两者 tree 一致；该 head CI383 十项检查全部成功。G1/P1/D0/R1 已完成，本卡仍按上文 requires、阶段验收及授权边界执行。正文中的源状态、待同步说明是文件生成时的历史元数据，不代表当前门禁仍关闭。
本卡完整规格来自 `docs/plan/activation-task-specs/15.md`；完整原文快照为 `docs/reviews/r1/execution-inputs.json`，逐类测试/原测试与 DoD 去向为 `docs/reviews/r1/test-coverage.json`，阶段和依赖映射为 `docs/plan/activation-task-specs/index.json`。总管同步前复读本卡全文与源哈希一致；仓库索引的 syncStatus 保留生成时状态，不声称已写回仓库或真实 WorkMesh。新增范围、真实方案分歧、权限或仓库外发布仍须另批。

## 用户原问题答复同步（2026-10-08 13:39，Asia/Shanghai）

来源：本todo原问题卡13:35用户答复：「Human 仅管理自己的目标（推荐）」「只通知被指派的 Human（推荐）」。目标创建/修改/禁用仅Human本人，沿用授权与revision/幂等规则，不新增管理员代管。收件人规则按原卡q-3ht6S3080fZ0KNuCCvzKm推荐选项说明：Inbox有明确Human收件人按该收件人，其余明确负责Human/lead的来源按已指定Human，无合法明确收件人不投递；不得向全Team可读成员广播或将查询可见性当通知订阅。外发前仍重读当前目标状态/授权并最小化内容；真实仓库外渠道发布或发送仍单独批准。

本卡源SHA/PR203同步状态保留历史，不冒当前全文哈希或仓库已同步。当前main包含D1a actual1078bbc，开工再复读最新main影响，正常整合已落地增量。独审前须提供完整中文计划文件和当前savedplan来源/精确正文hash供另一agent读取，仅平台doc链接不能代可审全文；允许仅计划文档前置提交，产品编码仍须规划独审及Chief确认。实施前同步受影响ADR/仓库spec、保留历史源与完整验收，未提供的平台版本字段如实null不猜、不为自引用重复存新计划。
