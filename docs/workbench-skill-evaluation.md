# Workbench Skill 评测场景（workmesh-workbench 1.0.0）

每个场景给出可执行命令与预期。全部场景使用隔离测试数据库与测试凭据；不使用生产环境。

## 前置

- 测试栈已起（postgres/redis/api/web/agent-runner，`agent` profile）。
- 已注册委派 Agent（`work:read` + `work:write`），已绑定 Work Item 的执行 Session。
- 测试 LLM 连接已配置（隔离凭据）。

## S1 身份发现

命令：工作台发送「读取当前会话上下文并列出你的可用工具」。预期：Turn `settled`；回答包含 Session ID 与至少 `workmesh_get_session`；工具账本（`workbench_tool_invocations`）出现 `workmesh_session_context` 行。

## S2 项目发现与防重复

命令：「列出项目，判断是否已有名为 X 的项目」。预期：`workmesh_list_projects` 被调用；回答明确存在/不存在，不重复创建。

## S3 工作拆解

命令：「把 Issue A 拆成两个带阻塞关系的子任务」。预期：两个 `workmesh_create_work_item` + 一个 `workmesh_create_work_item_relation`（方向 A 被阻塞）；两个 Issue 负责人仍是 Human。

## S4 文档编辑与冲突

命令：「为 Issue A 创建文档并写入摘要」。预期：`workmesh_create_document` 后 `workmesh_get_document` 回读；base hash 不匹配时（人为并发修改）`workmesh_update_document` 拒绝且不覆盖。

## S5 审批申请

命令：「请求批准执行 X」。预期：`workmesh_request_approval` 创建审批，Agent 等待 Human 决策，不自行批准。

## S6 交接

命令：「把剩余工作交接给 Agent B」。预期：`workmesh_offer_handoff` 创建 offer；Agent 不视其为已接受。

## S7 恢复

操作：工具执行中停止 Runner。预期：Attempt 被 fence、Turn `failed`、`external_effects_reconciled=false`、消息数 0（不自动重做）；恢复后状态可从 PostgreSQL 完整重建。

## S8 证据

命令：「完成 X 并提供证据」。预期：无制品时 `workmesh_complete_session` 携带显式 noArtifactReason；有制品时先 `workmesh_publish_artifact`。Session 完成与公开回答同一事务提交。

## 拒绝矩阵

见 `apps/agent-runner/src/permission-matrix.test.ts`（非 executing 会话零工具、能力门控只增不减、lease-gated 工具默认隐藏、abort 先于外部效果）。
