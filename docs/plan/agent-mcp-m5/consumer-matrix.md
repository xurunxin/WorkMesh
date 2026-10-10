# 消费者兼容与证据分层

当前所有新组合未运行。下表冻结调用方式和必验兼容，不表示已支持；实际方法／path／feature／binding见 [逐操作矩阵](operation-matrix.md) 与完整来源JSON。

| 消费者 | 确定合同／复用源码 | 同操作兼容与拒绝／证据 |
| --- | --- | --- |
| Human REST | `OPENAPI.yaml`、Zod、`route-policy.ts`、`apps/api/src/authz/authorize.ts`及route/domain handler | H1/H2独立cookie/CSRF；Human决定、配置、accept、retry与裁决保持。Agent不能拿该cookie；所有revisioned endpoint按原If-Match／mutation按key；member评论仍拒、maintainer合法正对照，不放宽旧policy |
| SDK／native对照 | `WorkMeshClient`、`forExecutionSession`、`request`、`stopAcknowledgement`、`getAgentSessionExecutionResult` | C target每调用局部client，禁止共享setSessionToken串身份；文本JSON和严格DTO保持null／数组／分页信封；完整文档50k截断回归以当前M2读取策略，200k合法正文逐值比对 |
| OpenCode实际进程 | 已安装原生executable、`createWorkMeshMcpHttpServer`、`installDiscovery`；Classic MCP＋Streamable HTTP＋direct tools | `structuredContent.data`与text JSON成功、isError/text/structured error保code/message/details/correlationId/currentRevision/safeNextAction。新真实client metadata；resources与tools分别发现，有可用tool的完整链，资源能力不推默认消费。C/E两入口清楚，MCP每请求无持久E假设 |
| MCP protocol fixture | `McpReferenceDriver`／`runClientConformance`、SDK `Client`／InMemoryTransport | 只证明协议和公开行为；`codex-style/opencode-style/pi-style`不是实际厂商认证。独立transcript，不与实际process计数混合。只读模式不注册write／缓存写拒绝 |
| 内置Pi | `run-session.ts`的`executeTurn`／`replayableSettle`、`workmesh-tools.ts`、`RunnerApi`、原`runner-attempt`合同 | 独立真实PID／实际model tool_result／durable Turn/Attempt/invocation；outer settle key完成恢复，不借direct completionreceipt；操作异常完整error入模型，工具可见不代实收。等待公开结算、Worker续Turn、pause／Stop不越权 |
| C/E规划差异 | `apps/api/src/commands.ts`的`teamAccess`、`agent-connections.ts`的`resolveCoordinationIdentity`及`server.ts`的`agentReadableWorkItem`；Runner虽登记CRUD工具仍固定E | Project/Issue协调写不因工具可见而授E；Pi实测该拒绝，合法Plan/Document按E范围竞争。Issue双C旧revision只算协议对照，不冒两真实客户端正写均可用 |
| Git Worker | `apps/worker/src/provider-actions.ts`的`createProviderActionWorker`／`prepareMutation`、`packages/git-provider/src/index.ts`的`beforeMutation`与`packages/db/src/principal-team-authority.ts`的`principalTeamAuthorityPredicate` | 当前default_branch／成员／context与精确PR检查批准每HTTP前锁后重读；claimed_at+worker+单调attempt CAS；unknown只对账。fake effect、GitHub/Gitea HTTP adapter fixture、真实账号三层分别标；context第八次耗尽按既有dead停止scheduled |
| Artifact传输 | `apps/agent-runner/src/delivery-transfer.ts`、upload Worker、`artifact-storage` | Pi private native HTTP不受全局model dispatcher影响，准确header/checksum/origin、无WorkMesh Bearer/redirect；外部rawMCP上传下载含签名资料，只做私有SDK/MCP传输对照，不宣称OpenCode模型上传通过。file不代code_review |
| Reviewer／父子 | `createReview`／`lockCollaborationSessionTargets`／`authorizeReplay`、`listAgentSessionChildren`／`finishSessionInTransaction` | 显式repoIds父/target/grant读交集，scope/context每次重验；省略原三项。review_result＋本人当前head code_review＋structured review＋requiredchild完成全链；预算numeric任意维度保全，不因DTO丢字段 |
| SSE／Inbox／恢复 | durableevent cursor、signed collection cursor、`createAgentWebhookWorker`、wait reconciliation | audience/scope分页撤权、HMAC/时间窗、事件/Inbox/job重放唯一effects；进程重启恢复实际事实，不把Redis或内存wake当权威 |
| CI与构建 | conformance explicit integration／root exclude／build exclude、ci-policy逐套件负例 | 原M0–M3套件不删。新增跨包源码只排生产build不排lint/typecheck；适用消费者checks、直接包build与全仓sourcebuild真实运行。RequiredCI新head，不借M3旧绿色 |

## 保留不支持与未测声明

Gitea多文件commit与CI retry按现有adapter限制；真实provider账号未授权未测，fake不推真实exactly-once。外部OpenCode包与官方文档版本属于环境实读，不是连接器／公共Skill无源码发行证明。Lite／企业真实部署支持见 [支持矩阵](support-matrix.md)，现有Proposed ADR不能冒Accepted产品合同。
