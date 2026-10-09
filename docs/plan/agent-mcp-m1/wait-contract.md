# Pi 等待结算与自动续接合同（Proposed）

复用现有路径和 operationId，按 source-snapshot.zip 的 OPENAPI 全文绑定；这些增量字段尚未存在于产品。Human pause/resume/stop、decideApproval、prompt、合法 Conversation 输入保留原身份与 scope。

## wire 增量

settleWorkbenchAttempt（POST /api/v1/workbench/runner-attempts/{id}/settle）增加 sessionWait：
```typescript
type SessionWait = {
  ifMatch: number; // 正整数，准确当前 Session revision
  state: 'awaiting_approval' | 'awaiting_input' | 'blocked';
  reason: string; // 1..2000，公开且脱敏
  approval?: { id: string; actionPayloadHash: string }; // UUID，canonical SHA-256 hex
};
```
awaiting_approval 必须 approval；另两态禁止 approval。与 sessionCompletion 互斥；settlement.outcome 必须 settled，externalEffectsReconciled 必须 true，assistantMessageMarkdown 必须非空；复用 settlement 的 evidence/noArtifactReason，严格拒绝未知字段。只在 running 的 current fence、Session executing、state 图允许及 ifMatch 准确时登记；旧字段不改。Runner 不提前 transition Session 到等待态再调用 settle，模型工具只形成 waitIntent；独立 API/MCP transitionState 仍按原行为，但不因此自动生成可恢复条件。

listWorkbenchRunnerAssignments 的 GET query、listAgentWorkbenchTurns 的 GET query、claimWorkbenchTurn 的 strict body 增加 executionWaits:boolean 默认 false；原 claim 的空 body 消费者保留。支持新 schema 的 opt-in claim 在 workbench_runner_attempts.execution_waits_enabled 同事务记录为 wait/continuation admission，后续 credential/start 不靠可伪造请求参数判断能力。assignment 只有 opt-in 才带 purpose:'execute'|'monitor'（缺省旧执行）；monitor 返回 sessionId/state/waitId，不解密模型凭据，不分派旧 Attempt，不被 ensureExecuting 翻态。等待 Session 仍须 live 精确来源，paused 仅可观察 Human 控制与 Stop，不恢复模型。terminal/stale 不作为 monitor 自动恢复。

getWorkbenchAttemptCredential 的新增可选 continuation 字段：
```typescript
type Continuation = {
  waitId: string; sourceTurnId: string; sourceAttemptId: string;
  trigger: { kind: 'approval' | 'prompt' | 'message'; id: string };
};
```
由服务读取 wait 的唯一续 Turn 与实际触发构造，不能让调用方提交伪 lineage。新 Runner promptFor 识别受校验 continuation，使用原公开等待回复和真实触发/已授权历史构造后续模型输入；普通旧消息路径保持原逻辑，不能伪造最后一条 Human 发言。沿既有 100 条/总字符上限、no-store、模型凭据独立响应与脱敏边界；缺失合法上下文拒绝。

settle 原响应保留 status/sessionCompletion；仅 opt-in sessionWait 请求追加 executionWait:{id,state}。赋值不宣称 Session complete；失响应沿稳定外层 runner-settle key/body 重放，不改 key 或退成 Turn-only settlement。新 GET confirmation 不负责 wait settle，也不能假认 Pi 内部 completion key。

## condition 和 admission

批准准确绑定 approval.id、session_id、canonical action_payload_hash；触发需要 approved、未到期、未消费、仍满足原 Human 决定和 quorum。 Worker 不消费批准代替实际动作；claim/start 与后续消费仍核准确 hash/有效期，恢复 executing 不授动作权限。

输入或 blocked 使用原等待事务捕获的 Session prompt 边界与 Conversation next_message_sequence；只接受边界之后的准确 Session prompt 或同 Conversation 合法 Human 输入，来源事件必须携带准确 promptId/messageId。服务端 prompt 的 INSERT RETURNING promptId 与既有 agent.session.prompted 事件增加引用，无新增事件类型。不能用另一 Session、旧消息、Agent/system 消息或相同文字唤醒。负责 Human 与真实输入 Human 的现行成员资格/主体权限每次重验。

Worker 持久扫描 pending wait，锁后重验原来源、principal、Connection/安装、目标 Delegation（Connection 另 coordinator Delegation）、grant/scope、负责 Human、Conversation、模型启用和合法请求归属。条件满足且 Session 在该等待态，按原 state 图转 executing；若现行 Human prompt/resume 已合法转 executing，必须读取该真实触发再唯一消费 wait，不做第二次 transition。paused 不消费、不创建 Turn；仅 Human 合法 resume 后重新检查，Stop/stale/terminal/撤权/拒批/过期不自动继续。

任何尚未消费 pending wait 的 Session，list/claim/start 对普通 Turn 同样闭门，防 prompt 自动 executing 绕 Worker；consume wait 与 resume/续 Turn 原子提交。先复用同 Conversation 最早 queued 合法 Human Turn；没有则新建唯一续 Turn，initiated_by_actor_id 继承原请求的 Human 归属，新的 system 消息和 queued 事件作者为真实 service，明确是自动续接，不声称 Human 新发言。wait 的 continuation_turn_id 唯一绑定，无论复用或新建都要求 opt-in、来源和合法触发；保持 predecessor/Conversation 单执行门禁。Worker 不 claim，不 start，不生成 Attempt；Runner 之后以原协议 claim→credential→start，三处 fresh live/state/fence 校验。

被动 monitor 不持 Lease、不运行模型，诊断 Session heartbeat 使用同来源合法身份与现行语义；API 查询仍不能签 Token。未 stopping/terminal 时现有显式 refresh 可以给 monitor 精确 E，刷新不是结果查询，401/403 不换身份重发。Runner 离线导致 stale 后不得自动复活，沿 Human 原恢复路径；已持久 pending wait、未 stale 且 live 才可重启监测和 Worker 重扫。

以上新增 DTO、选择规则和持久语义先与 ADR0081/迁移提案一起独审；全部运行验收未执行。
