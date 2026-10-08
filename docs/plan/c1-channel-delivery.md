# C1 渠道投递实施记录

本次实施依据 [完整 savedplan 快照](c1-channel-delivery/README.md)、用户确认与 [源测试矩阵](c1-channel-delivery/source-test-coverage.json)。历史计划、来源元数据和 null 版本记录保持不变；当前实现证据在 [C1 审查目录](../reviews/c1/README.md)。本批仅使用 Todos 与仓库，不冒称真实 WorkMesh 双轨同步。

## 复用与实现映射

- `packages/db/src/events.ts`：在既有业务事件/outbox 事务内将来源 ID 与 revision 存入内部 `domain_events.notification_sources`，不放入对外 payload；定向 Room 按精确受众划分，公共可见性事件只补未覆盖的负责 Human。
- `packages/db/src/human-attention-sources.ts` 与 API projection：共享只读来源查询，展示映射保留在 API，Query 不写 intent、delivery 或 checkpoint。
- `packages/db/src/channel-notifications.ts`：本人目标配置、加密秘密引用、source admission、每目标扇出、发送前当前授权和最低限度内容、fenced ack、未知结果对账。
- `apps/worker/src/index.ts`：处理已提交源事件并持久化逐事件 cursor checkpoint；不使用最大 cursor 充当提交次序。
- `apps/worker/src/automation.ts`：保留既有 Web Push/通知路径，在相同 delivery 队列上复用 claim_fence、reclaim、effectKey；通过注入的 `ChannelAdapter` 执行发送。
- contracts、OpenAPI、route policy 和设置页：本人管理与对账、revision、幂等、脱敏；feature 默认关闭，无 Redis 明确不支持，无 adapter 不 claim。

## 安全与恢复

只通知被指派 Human，管理员不能代管目标，也不按全 Team 查询可见性扇出。目标 admission 集合固定，配置 revision 改变后旧记录被抑制，不换地址发送。
发送前重新读取当前权限与配置，内容仅通用提醒、原 source revision 和 canonical 相对深链，C2 使用部署的可信 Web origin 构造最终 URL。
独审修复后，发送事务复用 `lockAgentAuthorityPlan` 锁定完整授权计划，再锁来源、Team、Human 和 membership，锁后重读。发送 checkpoint 提交为线性化边界：撤权先提交抑制外发；后提交不能召回在途调用。delivery 的 `notification_kind` 持久化兼容通知类型：Approval 统一 `approval.requested`（包括尚未达到 quorum 的决定事件），其他来源使用源事件类型；新增迁移补该类型元数据，不重投历史记录。
业务事务提交前没有外部调用；发送 checkpoint 提交后中断进入未知结果，由本人显式对账。外部结果承诺至少一次，可重送，不承诺唯一键带来的外部恰好一次。
每目标失败与退避独立；旧 fence 不能写 ack；最后一次 claim 崩溃必须恢复为未知结果或死信。
tick 每次只领当前可处理的一条，最多处理 25 条；单条 claim 丢失不阻断其他投递或 Loop 工作。审核反馈、实际并发断言及新组合完整回归见 [独审修复证据](../reviews/c1/review-fixes/README.md)。

## 验证与交接

定向用例位于既有 `apps/worker/integration/stage4-automation.integration.test.ts`，API、迁移和设置页配套测试分别验证传输入口、空库/升级及个人管理。
完整原测试与 DoD 逐项去向沿用冻结矩阵；实际执行命令、数量、失败与跳过项记录在审查目录。只有适用必需检查成功、独立复核和 Chief 确认后才能验收 C1 并放行 C2。
不实现真实外发、卡片审批、账号身份桥接或其他渠道。
