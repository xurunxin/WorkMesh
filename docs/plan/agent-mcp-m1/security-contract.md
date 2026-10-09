# 精确执行结果只读确认合同（Proposed）

本合同是拟新增产品合同，当前主线没有此端点。依据完整源码快照及 [源码定位](operation-index.md)，先独审再实施；不是普通 E 终态读取或有限终态命令重放。无迁移、无新事件类型。

## 路径、输入与输出

`GET /api/v1/agent-sessions/{id}/execution-result`；`operationId=getAgentSessionExecutionResult`；新 policy `human_or_installation_target`，feature 为 `none/stable`。path `id` 为 UUID；strict query 为 `action: complete|stop_ack`、`operationKey: string(min=1,max=200)`，必须 URL 编码，无未知字段、无 body、无 If-Match、无写 Idempotency-Key。SDK 为 `getSessionExecutionResult`，MCP 为 `get_session_execution_result`，Runner 仅受控生命周期调用；不交模型安装凭据。

拟新增 Zod `agentSessionExecutionResultQuerySchema`、`agentSessionExecutionResultResponseSchema`，置于 `packages/contracts/src/execution-contracts.ts`，从 index 导出。响应 strict，字段固定如下；UUID、状态、revision、UTC timestamp 复用现有 schema。

```typescript
type AgentSessionExecutionResult = {
  session: { id: string; state: AgentSessionState; revision: number };
  action: {
    kind: 'complete' | 'stop_ack';
    operationKey: string;
    confirmation: 'confirmed' | 'unavailable';
    unavailableReason: 'receipt_missing' | 'receipt_expired' | 'result_unavailable' | null;
  };
  originalResult: null | {
    operationId: 'completeAgentSession' | 'acknowledgeAgentSessionStop';
    sessionId: string;
    revision: number;
    state: 'completed' | 'canceled';
    resultReference: { type: 'agent_session'; id: string; revision: number };
    eventReference: null | { id: string; cursor: string };
  };
  cleanup: null | { cleanupSummary: string; residualRisks: string[] };
};
```

`confirmed` 必须有 originalResult，unavailableReason=null；`unavailable` 必须 originalResult=null、cleanup=null、reason 非空。complete 的 cleanup 始终 null。事件 cursor 用字符串，不损失 bigint 精度。只返回上述最小投影，不返回完整 receipt、request hash/body、Token、actor/credential/Connection 清单、Prompt、context、Inbox 或他人证据。

## 身份解析与实时授权

1. 在 `server.ts` 常规 `resolveCoordinationIdentity` 分支之前按准确 policy 分流；不增加 publicPaths 豁免。受限 helper `resolveExecutionResultIdentity` 只 SELECT 已有凭据，返回安装用途身份，`agentSessionId` 缺省，绝不伪造 C/E Session。不能调用 `reconcileConnectionInstallationToken`，不能更新凭据 last_used_at。新类型由 route-policy、authorizeRequest、生成 security mapping 共同表达。
2. `X-WorkMesh-Installation-Token` 接受有效 Connection credential；`Authorization: Bearer` 只接受已有 Installation Token（包含 Connection 对应 installation 镜像）。两种 Agent credential 同时给出拒绝；Agent header 失败不得回退 cookie。单独合法 Human cookie 沿原 Human 读取，Human 与安装身份不能混合成更高权限。普通 Session Bearer即使仍有效也拒绝此路径。
3. Agent 必须匹配 credential live/未过期、Agent definition/Actor active、Team 未删除、Team grant 未撤且含 work:read。Connection 分支要求 Connection active/rotating 或合法 overlap，以及绑定的 coordinator Delegation active，workspace/Team/Agent/actor/principal/role/scope 与 Connection 相同，权限交集需 work:read。原生 Installation 分支没有 Connection/coordinator Delegation，不伪建它们：核当前准确 installation ID/agent/live 凭据，并从准确目标 Session/Delegation 取得 principal/Team/resource 重新核验；仍必须满足下一项完整目标授权及历史安装关联。principal 必须 active Human，并沿现行 Team membership/admin 规则仍可授权该 Team。Agent credential 与 Human cookie 并存时只选 Agent 分支，失败不回退 Human。
4. 目标必须是同 workspace 的 execution Session；Agent/actor、Team、principal 与准确来源一致。目标 Delegation active，目标 Team/resource 存在，目标 permissions_snapshot ∩ definition ∩ Team grant 包含 work:read；capability_scope 含准确 Team 和准确 work_item/project。自动化/子 Session 按既有 subject 和 parent/plan_step 绑定核验，不给 Team scope 代替执行对象 scope。此处 target state 不要求 active：它只是查询最小结果，不允许命令。
5. Connection 归属通过目标历史 `agent_session_tokens.installation_token_id → agent_installation_tokens.token_hash → agent_connection_credentials.connection_id` 证明，必须等于当前准确 Connection；同 actor/principal/Team 不足。允许同 Connection 的正常凭据轮换，当前 credential 必须 live，历史关联只用于证明出处，不把历史 E Token 当作现行授权。原生安装身份无 Connection 时只能以当前准确 installation ID 与目标既有 Token 关联证明，不能选同 Agent 的任意 Token。
6. 历史 Token 清理可能移除该关联（`refreshAgentToken` 会删除旧 Token）；关联缺失对 Agent 返回不可见 NOT_FOUND，不猜来源、不新建关联。Human 可按原合法 membership/admin 读取。不给所有历史 Session 承诺无限期 Agent 恢复能力，此限制要进入 compatibility、负例和产品报告。
7. Human 沿当前 `liveHumanTeamReadPredicate`/Team 读取规则，不因执行 Delegation 已撤而剥夺 Human 原有历史读取权；Agent 的 principal、双 Delegation、grant 条件不能被此 Human 分支绕过。Human 不冒充原写 Actor：查询账本用目标 Session 的原 Agent actor。

使用一次 READ ONLY 事务中的单一授权结果快照读取凭据、目标、receipt 和最小关联事实；不存在先读取秘密结果再补授权的路径。查询在数据库语句快照时点裁定；撤权先 commit 的查询必须拒绝，已完成授权快照之后的撤权不召回已返回数据。测试用真实并发提交顺序核验，不声称持锁到客户端收取。

## 原动作、回执与摘要绑定

`agentMutate` 的主键是 workspace/actor/key，不包含 Session；`commandContext` 的 request_hash 包括 route/pathParams/body/If-Match/agentSessionId。查询只查目标原 Agent actor、准确 key、准确 operation：complete 对应 `POST /api/v1/agent-sessions/:id/complete`，stop_ack 对应 `POST /api/v1/agent-sessions/:id/stop-ack`。200 回执经最小 schema 校验，`response_body.id` 必须等于目标、state 必须是对应终态，original revision/sequence 来自原回执。已存在但指向其他 action/Session/无效结果的 key 返回同样 NOT_FOUND，不透露该 key 的真实资源。

receipt 不存在、response_body 已清除或 replay_expires_at 已过时，仅返回 unavailable；它不证明从未提交，不能据此新 key 重做或宣告失败。当前 session.revision 与 originalResult.revision 分列，不能把 Human 后续操作结果算作原请求结果。可选 eventReference 仅匹配 workspace/Agent actor/key/session/aggregate/type/original revision；缺事件不填猜测引用。stop_ack 的摘要只来自该原回执 sequence 对应 kind=stop_ack Activity，使用原 summary 及 JSON residualRisks；缺失或形状无效返回 result_unavailable，不混合后一次活动。

查询证明的是原 key 已提交的原动作；它不表示调用方后来更改的正文被提交。同 key 异体仍由命令返回 IDEMPOTENCY_KEY_REUSED。该投影既不接受正文也不重放原命令。

Pi 的 `finishSessionInTransaction` 在 settle 内只沿 completion key 发事件，未为内部 completion key创建独立 api_idempotency_keys 回执。新查询不能假称该回执存在：该 key 返回 receipt_missing。Runner 原子完成失响应仍以稳定外层 `runner-settle-{attemptId}` key/body 走 ADR0068 既有 settle 回执重放；此既有例外不扩大到 complete/stopAck。公共 HTTP/MCP 的直接 complete 丢响应使用本查询确认；Pi 的 Stop ACK 丢响使用本查询。分别验证两条真实路径。

## 错误与零写入边界

未知 query/UUID/长度为 VALIDATION_ERROR；凭据无效或普通 E 为 UNAUTHENTICATED；越界/其他 Connection/Session/action/key 返回 NOT_FOUND，错误保留 correlationId。Agent 撤权按身份或资源阶段拒绝并隐藏目标，不通过刷新重试。成功及失败都不得签 Token、续建 Session、更新 last_used_at、写 receipt/activity/领域 event/outbox 或重排执行。授权拒绝仅保留 `recordAuthorizationDenial` 的既有独立账本 INSERT；不 suppress 审计，不把此例外冒全部数据库零写。新增 policy 接入既有拒绝审计/速率限制，无新 Redis 权威或状态。

对成功及各拒绝逐表比较真实内容和计数，包括凭据使用时间、C/E Session、Delegation、Plan、Approval、Lease、Activity、Token、api/auth幂等表、domain_events、outbox、Workbench事实；拒绝账本单列。未运行这些用例前不得将合同标产品通过。
