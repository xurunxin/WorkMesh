# 数据库增量与滚动兼容提案

状态 Proposed；本轮只写 [DDL 提案](schema-proposal.sql)，不执行 SQL，不修改产品 SCHEMA.sql、schema.ts 或迁移。实际落点是新的 packages/db/migrations/v1/0017_execution_origin_and_waits.sql；现有增量止于 0016，来源全文在 source-snapshot.zip。同步 SCHEMA.sql 的增量入口、Drizzle 类型、migration-manifest.ts，用现有 generate:v1-baseline 生成 hash，旧 baseline/旧迁移/升级 bundle 逐 blob 不变。

## 原动作来源

agent_installation_tokens 增加 origin_kind/native|connection 与 origin_connection_id。仅新原生注册写 native；Connection 镜像创建由已经验证的 Connection ID 写 connection，不能从“没有匹配 Connection”推测 native。两列可空，旧安装全部保持 null；标记创建后不可修改，Connection 被删除仍保留标记 UUID，不建删除级联 FK。

api_idempotency_keys 既有 workspace_id/actor_id/idempotency_key 主键就是原 actor 绑定，不接受 body 声称的 actor。增量列为 execution_source_kind、execution_session_id、execution_session_token_id、execution_installation_token_id、execution_connection_id；proven 的 native/connection 组合必须完整；旧行全 null，实际 E Token 可定位但其安装来源未知则写 unproven。null/unproven 均不可供 Agent 确认，Human 沿合法原读取。Token、安装和 Connection UUID 是不可变证据引用，无 FK 级联；原 Token 被 refresh 清除不会删除证明。来源不包含明文 Token、凭据 hash、秘密或模型原文。原 revision/sequence 从已绑定原 response_body 提取，不从当前 Session 猜。

direct finishSession 完成入口与 stopAck 在同一个 agentMutate 事务，先占原 key，再用 trusted actor.credentialHash 经 locateAgentSessionAuthority 定位唯一 E Token；定位只取 ID，按 lockExecutionInstallationAuthorities → 全局 authority/resource 顺序锁后重读实际 Token/安装不可变来源、Session、actor，写来源、原响应、Session、Activity/event/outbox 一起提交。若 join 多于一条、原 Token 不匹配、来源自相矛盾，整个命令失败；旧 null 来源允许原写兼容，但回执 unproven。不能在查询补写或根据回执 actor/任意历史 Token 推测来源。finishSessionInTransaction 内层 Pi completion 不创建独立回执。

两种占 key 路径 agentMutate 与 generic mutate 的过期 ON CONFLICT 更新必须显式把所有 execution_* 置 null，再由本次 producer 捕获；不同操作重新使用过期 key 不继承旧证明。同 key/body 的原回执重放不修改来源或创建新事实。增量同时加 BEFORE UPDATE trigger：created_at/operation/request_hash 发生重占位变化就将 execution_* 全清空；这使滚动期旧 API 不认识新列时也不会保留旧证明。新 producer 随后的独立来源 UPDATE 不改这些占位字段，仍在原事务捕获。必须测旧 producer 在新schema重占过期key后证明为null，而不是旧Connection快照。来源写入故障、event/outbox 故障与响应持久化故障全回滚，不能出现“完成已提交但证明半写”的新组合。

## 等待与续接

workbench_execution_waits 保存具体列和 CHECK/FK，见 DDL。源 Turn 唯一，每 Session 至多一个 pending wait，continuation_turn_id 唯一；外部实际批准、prompt、message 分开字段，不用 timestamp 或相同正文代替触发身份。Session/Conversation/源 Turn/Attempt/原 Human/批准/消息输入和续 Turn 用 workspace 复合 FK，删除 RESTRICT；prompt 特例见下节，不引用不存在的列；条件组合与状态组合 CHECK。跨表语义在原 authority 与 Conversation/Turn/Attempt 锁内核对：同 Session/Conversation、source Attempt current、源 Turn 已结算、原 Human 是合法请求归属、批准 session/hash 完全一致。

Attempt 增加 execution_waits_enabled boolean NOT NULL DEFAULT false，claim 捕获明确 opt-in；credential/start/settle 读该持久能力，旧 Attempt 为 false。该列不授权限，只约束消费者兼容。

settle 写 pending wait、等待状态、公开回复、工具账本、Turn/Attempt settlement、既有 event/outbox 与原外层 settle response 同事务。Worker 锁同 Session、Conversation、源 Turn/Attempt，最后锁 wait；核 pending→continued 并只绑定一个后续 Turn、合法状态转换与既有 queued/event/outbox 同事务。采用数据库唯一约束和条件 UPDATE 防重复，不用仅进程内 debounce。Worker 创建 Turn 不创建 Attempt；claim/start 重新授权后才创建一个新 Attempt，保持原 Conversation 串行与 fence。

全局顺序保持现有 Connection/credential → definition/grant/delegation/session/session-token/installation → work item/project → Conversation → Turn → Attempt；新增 wait 锁在这些行之后，不反向获取 authority。多对象先定位所有 ID，再按 agent-locks 的排序一次锁全，锁后重读。批准作为已定位资源纳入既有批准锁规则；prompt/消息边界在相同 Session/Conversation 锁下捕获与写入。共享 helper 放 packages/db/workbench-execution-waits.ts，API 和 Worker 调同 helper；Worker 不 import apps/api。等待/来源提案不创造授权。

## 升级、回填与回滚

先完整事务应用增量和登记 hash，再启动支持新列的 API/Worker，最后启动 executionWaits opt-in Runner。旧 API 插入安装/回执时不写增量列，默认 null 合法；旧事件消费者忽略附加字段。新代码在旧阶段迁移夹具显式 schema-aware：普通既有命令走旧 SQL，确认与 sessionWait 必须 fail closed/不可用；不得以缺列默默成功新合同。

不能在混合旧 API/Worker 窗口开放新 opt-in 等待生产：旧节点无法执行 pending wait 的 admission 约束，会错误启动模型。新增内部启动配置 WORKMESH_EXECUTION_WAITS_ENABLED 默认 false，与现有 feature/启动检查机制接线；部署须保留所有 API/Worker 节点版本和 schema 能力证明，统一开启后才允许等待生产，所有服务节点支持增量、等待门禁和来源 reset 后才开放；无统一能力证明时不开启 sessionWait。默认旧 Runner 只处理旧 Turn，新续 Turn 与 pending wait 相关 queued Turn 在所有新服务 list/claim/start 都要求显式 executionWaits=true 与准确来源。不是加新付费 feature 或授权限。

无历史来源回填、无历史等待条件推测；旧已悬挂 Turn 仍沿现有 reconcileWorkbenchAttempts/合法 Human 恢复，不伪造可自动续接 wait。下线先关闭新的 wait 生产，保留新 Worker 处理或由 Human 停止所有 pending wait、续 Turn 和新 Attempt，确认无活动引用再回退旧服务；不删来源或等待事实，不自动执行 DOWN。DDL 失败整次迁移事务回滚，不允许部分新 schema。只读查询未部署增量时拒绝，不退回旧任意 Token 证明。

必须验证上一增量升级、clean DB、旧夹具、新旧写入、null/unproven 失败关闭、过期 key reset、唯一约束、孤儿/跨 workspace FK、迁移中断回滚和滚动门禁；本轮均未执行数据库测试。

## 本轮两项合同修正

批准 hash 复用 canonicalPayloadHash 和 requestApprovalInputSchema/consumeApprovalInputSchema 的现行格式 ^sha256:[a-f0-9]{64}$。wait DTO/Zod、approval_action_payload_hash 的 DDL CHECK、Worker比较和实际批准消费均保完整字符串；裸hex或错误前缀拒绝，正确格式但不同hash由准确相等比较拒绝。真实批准等待正例必须调用 requestApproval，从其返回的 action_payload_hash 原样传至 sessionWait；不手拼测试 fixture，不把 Python 正则静态样本计为真实批准用例。

源 baseline 的 agent_session_prompts 只有 id主键、session_id/author/body/版本/时间等列，没有workspace_id。新增迁移在 CREATE workbench_execution_waits 前执行 ALTER TABLE agent_session_prompts ADD CONSTRAINT agent_session_prompts_session_id_id_key UNIQUE(session_id,id)，之后 wait 的 FOREIGN KEY(agent_session_id,trigger_prompt_id) REFERENCES agent_session_prompts(session_id,id) ON DELETE RESTRICT。wait 自身已有 (workspace_id,agent_session_id)→agent_sessions(workspace_id,id)；锁内仍核准确Session/workspace与live主体，不依赖prompt FK授权限。

旧prompt全保留，无新非空列、无推测/重写；旧id主键已保证(session_id,id)不重复，新增唯一约束不需回填。重用同一合法prompt的重复协调由原wait条件更新/唯一continuation去重，不能再建Attempt；另一Session的prompt在DB复合FK和领域读取均拒绝。clean DB和从前一增量升级均核新增约束、原prompt字节/行数不变、原id重复拒、合法session引用成功、跨session失败、同session但跨workspace请求锁内拒绝；迁移失败新unique/wait表全部回滚，重试由现行migration ledger管理，不改已应用迁移、不到旧SQL加列。

本轮只执行源码/正则/FK静态语义检查及旧错误提案变异反例。约束建立、真实DB引用/事务/升级/clean/回滚均未运行，不能标passed。
