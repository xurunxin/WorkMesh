# 本轮平台独审反馈原文

来源：本轮用户消息转交的feedback完整正文；历史锚点和行号按原文保留，不冒新行号。

我会核对指定提交中的完整方案和相关源码，逐项验证上一轮两个阻塞点是否闭合，再检查修订是否引入新的实施阻塞。全程只读。
方案已明确将原动作来源写入提交事务，也定义了等待结算和自动续 Turn，覆盖了上一轮提出的两条缺失路径。我正在核对迁移约束、批准 hash 格式和续接准入是否与现有代码一致。
等待迁移提案中有两个确定的合同冲突：批准 hash 的约束漏了现行 `sha256:` 前缀；prompt 外键引用的 `workspace_id` 在真实主线表中不存在。前者会拒绝合法批准等待，后者会使迁移失败。我继续核对其余修订，收敛最终阻塞清单。
请先解决以下问题，再进入编码。

上一轮第1项归属证明阻塞：方案层面已解决。第2项等待生命周期阻塞：恢复路径已明确，但以下两处新合同冲突仍阻止闭合。

1. > `AND approval_action_payload_hash ~ '^[a-f0-9]{64}$'`

   [DDL提案](/C:/Users/xurx/.tds/workspaces/01a12031-e9de-75c4-ab40-b44affcd71f6/docs/plan/agent-mcp-m1/schema-proposal.sql:113)要求裸 hex；现行 `requestApproval`、Zod 和批准消费统一使用 `sha256:<64位hex>`，且按完整字符串比较。保存真实批准 hash 会违反新约束，去掉前缀又无法匹配批准。

   请统一等待 DTO、Zod、DDL 和 Worker 比较为现行格式，并让批准等待正向测试直接使用真实 `requestApproval` 返回的原 hash。(blocking)

2. > `FOREIGN KEY(workspace_id,trigger_prompt_id) REFERENCES agent_session_prompts(workspace_id,id)`

   真实主线的 [agent_session_prompts](/C:/Users/xurx/.tds/workspaces/01a12031-e9de-75c4-ab40-b44affcd71f6/packages/db/migrations/v1/0001_v1_baseline.sql:413)没有 `workspace_id`，提案也没有新增它；该外键会使整次迁移失败。

   请改为 `(agent_session_id,trigger_prompt_id) → agent_session_prompts(session_id,id)`，在新增迁移中先建立对应唯一约束，并保留锁内 workspace 授权核验。同步迁移合同及 DDL，覆盖准确 Session 正例、其他 Session prompt 拒绝和升级/clean DB 场景。(blocking)
