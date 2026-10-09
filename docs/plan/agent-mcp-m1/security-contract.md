# 精确执行结果只读确认合同（Proposed）

本合同是拟新增产品合同，当前主线没有此端点。依据完整源码快照及 [源码定位](operation-index.md)，先独审再实施；不是普通 E 终态读取或有限终态命令重放。采用最小来源/等待迁移提案，无新事件类型；字段尚未实施，详见 [迁移合同](migration-contract.md)。

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
3. Agent 必须匹配 credential live/未过期、Agent definition/Actor active、Team 未删除、Team grant 未撤且含 work:read。Connection 分支要求 Connection active/rotating 或合法 overlap，以及绑定的 coordinator Delegation active，workspace/Team/Agent/actor/principal/role/scope 与 Connection 相同，权限交集需 work:read。原生 Installation 分支没有 Connection/coordinator Delegation，不伪建它们：核当前准确 installation ID/agent/live 凭据，并从准确目标 Session/Delegation 取得 principal/Team/resource 重新核验；仍必须满足下一项完整目标授权及原动作持久来源证明。principal 必须 active Human，并沿现行 Team membership/admin 规则仍可授权该 Team。Agent credential 与 Human cookie 并存时只选 Agent 分支，失败不回退 Human。
4. 目标必须是同 workspace 的 execution Session；Agent/actor、Team、principal 与准确来源一致。目标 Delegation active，目标 Team/resource 存在，目标 permissions_snapshot ∩ definition ∩ Team grant 包含 work:read；capability_scope 含准确 Team 和准确 work_item/project。自动化/子 Session 按既有 subject 和 parent/plan_step 绑定核验，不给 Team scope 代替执行对象 scope。此处 target state 不要求 active：它只是查询最小结果，不允许命令。
5. 归属只取原 complete/stopAck 的 api_idempotency_keys 来源快照：主键 workspace/actor/key、准确 operation、execution_session_id 与原 response 的 Session/revision/sequence 一致。提交事务用实际 actor.credentialHash 唯一定位 E Token，并锁后核实其 installation_token_id、不可变 origin_kind 和原 Connection。Connection 身份须等于快照 connection_id；同 Connection 轮换可用当前有效凭据，但另一 Connection 即使曾 refresh 同 Session 也拒绝。native 必须等于原 installation ID，同 Agent 的另一原生安装拒绝。不存在“任意历史 Token 关联”的后备证明。
6. 旧快照全 null、unproven、安装来源 null/歧义或组合错误，对 Agent 失败关闭 NOT_FOUND；不能查询补写或回填猜测。原 Token 被 refresh 删除不影响已经完整保存的来源证明，但当前凭据/Connection/安装撤销、过期、删除仍拒绝。原生 installation 不可存在 Connection 来源矛盾；Connection installation 镜像标记保留，不从匹配 Connection 缺失推测 native。对于根本无可证明回执的 Agent 请求，无法区分未提交与他人原 key，返回隐藏拒绝，不能利用 unavailable 向未知来源公开 Session。合法 Human 或已先证明对应来源的 retained receipt，才可取得 unavailable 的最小投影；保留期清掉证明后 Agent 也失败关闭。
7. Human 沿当前 `liveHumanTeamReadPredicate`/Team 读取规则，不因执行 Delegation 已撤而剥夺 Human 原有历史读取权；Agent 的 principal、双 Delegation、grant 条件不能被此 Human 分支绕过。Human 不冒充原写 Actor：查询账本用目标 Session 的原 Agent actor。

使用一次 REPEATABLE READ READ ONLY 事务中的单一授权结果快照读取凭据、目标、receipt 和最小关联事实；不存在先读取秘密结果再补授权的路径。查询在数据库语句快照时点裁定；撤权先 commit 的查询必须拒绝，已完成授权快照之后的撤权不召回已返回数据。测试用真实并发提交顺序核验，不声称持锁到客户端收取。

## 原动作、回执与摘要绑定

`agentMutate` 的主键是 workspace/actor/key，不包含 Session；`commandContext` 的 request_hash 包括 route/pathParams/body/If-Match/agentSessionId。查询只查目标原 Agent actor、准确 key、准确 operation：complete 对应 `POST /api/v1/agent-sessions/:id/complete`，stop_ack 对应 `POST /api/v1/agent-sessions/:id/stop-ack`。200 回执经最小 schema 校验，`response_body.id` 必须等于目标、state 必须是对应终态，original revision/sequence 来自原回执。已存在但指向其他 action/Session/无效结果的 key 返回同样 NOT_FOUND，不透露该 key 的真实资源。

合法 Human 读取或已证明来源但 response_body 已清除/replay_expires_at 已过时，返回 unavailable；无来源的 Agent 隐藏拒绝。receipt 不存在对合法 Human 返回 receipt_missing；它不证明从未提交，不能据此新 key 重做或宣告失败。当前 session.revision 与 originalResult.revision 分列，不能把 Human 后续操作结果算作原请求结果。可选 eventReference 仅匹配 workspace/Agent actor/key/session/aggregate/type/original revision；缺事件不填猜测引用。stop_ack 的摘要只来自该原回执 sequence 对应 kind=stop_ack Activity，使用原 summary 及 JSON residualRisks；缺失或形状无效返回 result_unavailable，不混合后一次活动。

查询证明的是原 key 已提交的原动作；它不表示调用方后来更改的正文被提交。同 key 异体仍由命令返回 IDEMPOTENCY_KEY_REUSED。该投影既不接受正文也不重放原命令。

Pi 的 `finishSessionInTransaction` 在 settle 内只沿 completion key 发事件，未为内部 completion key创建独立 api_idempotency_keys 回执。新查询不能假称该回执存在：该 key 对合法 Human 返回 receipt_missing，对缺少来源证明的 Agent 失败关闭；不会返回 confirmed。Runner 原子完成失响应仍以稳定外层 `runner-settle-{attemptId}` key/body 走 ADR0068 既有 settle 回执重放；此既有例外不扩大到 complete/stopAck。公共 HTTP/MCP 的直接 complete 丢响应使用本查询确认；Pi 的 Stop ACK 丢响使用本查询。分别验证两条真实路径。

## 错误与零写入边界

未知 query/UUID/长度为 VALIDATION_ERROR；凭据无效或普通 E 为 UNAUTHENTICATED；越界/其他 Connection/Session/action/key 返回 NOT_FOUND，错误保留 correlationId。Agent 撤权按身份或资源阶段拒绝并隐藏目标，不通过刷新重试。成功及失败都不得签 Token、续建 Session、更新 last_used_at、写 receipt/activity/领域 event/outbox 或重排执行。授权拒绝仅保留 `recordAuthorizationDenial` 的既有独立账本 INSERT；不 suppress 审计，不把此例外冒全部数据库零写。新增 policy 接入既有拒绝审计/速率限制，无新 Redis 权威或状态。

对成功及各拒绝逐表比较真实内容和计数，包括凭据使用时间、C/E Session、Delegation、Plan、Approval、Lease、Activity、Token、api/auth幂等表、domain_events、outbox、Workbench事实；拒绝账本单列。未运行这些用例前不得将合同标产品通过。

## 实际提交来源的生产者与反例

来源 helper 位于拟新增 agent/execution-origin.ts，只在 direct complete 外层与 stopAck 的原命令事务运行。既有 agentMutate 先 reserve key，授权锁先定位后按固定顺序重读；来源列与 response/state/Activity/event/outbox 同 commit。request body 提供的 token/Connection 不采信，实际 actor 是可信认证 actor；source_actor 就是既有账本 actor_id。schema/完整组合/过期 key reset/滚动窗口具体见迁移合同。Pi 内层 finishSessionInTransaction 不可调用该回执捕获 helper；它只有 settle 外层事实。

必须构造 C1/C2 同 Agent/principal/Team 且各自 live 的正对照：C2 提前 refresh 获得目标 Token，C1 用实际 I1/E1 提交 complete 或 stopAck，C1 确认成功，C2 被拒，所有查询除既有拒绝审计均零写；C2 自身合法普通请求正对照成功以排除假阳性。两个 native I1/I2 同样先为目标签发，原 E1 来源保存为 I1，I2 不能确认。原 E1 Token 删除、C1 凭据正常轮换仍可按完整快照确认；Connection 撤销或删除拒绝；旧 null/unproven 不推测。新来源写入失败必须连原终态事实一起回滚。
